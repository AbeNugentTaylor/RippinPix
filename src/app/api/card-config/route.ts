import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { DESIGNS } from "@/lib/designs";
import { configKey, deleteCardConfig, getCardConfigs, saveCardConfig, CARD_CONFIGS_REL_PATH } from "@/lib/card-configs.server";
import { getCardConfigsRemote } from "@/lib/card-configs.remote.server";
import { firstEmptySlot } from "@/lib/card-key";
import { describeReadError } from "@/lib/cloud-file.server";
import { isRemoteBackend, isRemoteModeEnabled } from "@/lib/remote-mode.server";
import { commitFiles, ensureBranch, getFileMeta, githubEnv, stagingBranch, type CommitWrite } from "@/lib/github-content.server";
import type { Attribute, CardConfig, CardOrientation, Crop, HoloPattern, Rarity } from "@/lib/types";

// Local dev: copies a chosen photo into public/photos/ and upserts
// src/data/card-configs.json directly on disk. Deployed remote mode (see
// isRemoteBackend): commits the same two files to a staging branch instead
// (see github-content.server.ts), since a Netlify Function has no
// persistent filesystem to write to and there's no "local, unpushed" state
// to hold changes in otherwise. A separate Publish action (git-push route)
// bumps the version once and fast-forwards the live branch to staging's
// tip. Both paths are blocked entirely unless the configurator is enabled
// at all (see isRemoteModeEnabled).
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const RARITIES: Rarity[] = ["common", "uncommon", "rare", "holo", "secret"];
const HOLO_PATTERNS: HoloPattern[] = ["none", "cosmos", "stripes", "sunburst"];
const ORIENTATIONS: CardOrientation[] = ["portrait", "landscape"];

interface SaveBody {
  sourcePath?: string;
  existingKey?: string;
  designId: string;
  local?: number;
  crop?: Crop;
  rarity: Rarity;
  holo?: boolean;
  holoPattern?: HoloPattern;
  orientation?: CardOrientation;
  attributes?: Attribute[];
  title?: string;
  date?: string;
  medium?: string;
}

function blocked() {
  return !isRemoteModeEnabled();
}

export async function GET() {
  if (blocked()) return new NextResponse(null, { status: 404 });
  if (isRemoteBackend()) {
    try {
      return NextResponse.json(await getCardConfigsRemote());
    } catch (err) {
      return NextResponse.json({ error: `Could not read cards from GitHub: ${(err as Error).message}` }, { status: 502 });
    }
  }
  return NextResponse.json(getCardConfigs());
}

// The phone-upload flow (no local filesystem to browse) posts multipart form
// data with the photo's bytes attached instead of a JSON body pointing at a
// sourcePath; normalize both shapes to the same SaveBody + optional file.
async function parseBody(request: NextRequest): Promise<{ body: SaveBody; uploadFile: File | null }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return { body: (await request.json()) as SaveBody, uploadFile: null };
  }

  const form = await request.formData();
  const str = (key: string): string | undefined => {
    const v = form.get(key);
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const json = <T,>(key: string): T | undefined => {
    const v = str(key);
    return v ? (JSON.parse(v) as T) : undefined;
  };
  const file = form.get("file");

  const body: SaveBody = {
    existingKey: str("existingKey"),
    designId: str("designId") ?? "",
    local: str("local") ? Number(str("local")) : undefined,
    crop: json<Crop>("crop"),
    rarity: str("rarity") as Rarity,
    holo: str("holo") === undefined ? undefined : str("holo") === "true",
    holoPattern: str("holoPattern") as HoloPattern | undefined,
    orientation: str("orientation") as CardOrientation | undefined,
    attributes: json<Attribute[]>("attributes"),
    title: str("title"),
    date: str("date"),
    medium: str("medium"),
  };
  return { body, uploadFile: file instanceof File ? file : null };
}

function buildConfig(body: SaveBody, local: number, fileName: string, sourcePath: string): CardConfig {
  return {
    designId: body.designId,
    local,
    fileName,
    sourcePath,
    crop: body.crop ?? { x: 50, y: 50, zoom: 1 },
    rarity: body.rarity,
    holo: body.holo ?? (body.rarity === "holo" || body.rarity === "secret"),
    holoPattern: body.holoPattern ?? "none",
    orientation: body.orientation ?? "portrait",
    attributes: body.attributes ?? [],
    title: body.title || undefined,
    date: body.date || undefined,
    medium: body.medium || undefined,
    updatedAt: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  if (blocked()) return new NextResponse(null, { status: 404 });

  const { body, uploadFile } = await parseBody(request);

  const design = DESIGNS.find((d) => d.id === body.designId);
  if (!design) return NextResponse.json({ error: "Unknown design" }, { status: 400 });
  if (!RARITIES.includes(body.rarity)) {
    return NextResponse.json({ error: "Invalid rarity" }, { status: 400 });
  }
  if (body.holoPattern !== undefined && !HOLO_PATTERNS.includes(body.holoPattern)) {
    return NextResponse.json({ error: "Invalid holo pattern" }, { status: 400 });
  }
  if (body.orientation !== undefined && !ORIENTATIONS.includes(body.orientation)) {
    return NextResponse.json({ error: "Invalid orientation" }, { status: 400 });
  }

  const total = design.packs * 8;

  if (isRemoteBackend()) {
    return savePostRemote(body, uploadFile, total);
  }
  return savePostLocal(body, uploadFile, total);
}

async function savePostLocal(body: SaveBody, uploadFile: File | null, total: number) {
  // Editing an already-imported card: reuse the photo already sitting in
  // public/photos rather than requiring body.sourcePath, since the original
  // file on the user's disk may have moved or been deleted since import.
  const editing = body.existingKey ? getCardConfigs()[body.existingKey] : null;
  if (body.existingKey && !editing) {
    return NextResponse.json({ error: "Card being edited no longer exists" }, { status: 404 });
  }

  const local = body.local ?? (editing ? editing.local : firstEmptySlot(body.designId, total, getCardConfigs()) ?? undefined);
  if (!local || local < 1 || local > total) {
    return NextResponse.json({ error: "No free slot for this design" }, { status: 400 });
  }

  const destDir = path.join(process.cwd(), "public", "photos", body.designId);
  fs.mkdirSync(destDir, { recursive: true });

  let fileName: string;
  let sourcePath: string;

  if (editing) {
    const ext = path.extname(editing.fileName);
    fileName = `${String(local).padStart(2, "0")}${ext}`;
    sourcePath = editing.sourcePath;
    const oldPath = path.join(process.cwd(), "public", "photos", editing.designId, editing.fileName);
    const newPath = path.join(destDir, fileName);
    if (oldPath !== newPath) {
      try {
        fs.copyFileSync(oldPath, newPath);
      } catch (err) {
        return NextResponse.json({ error: describeReadError(err, oldPath) }, { status: 400 });
      }
      if (editing.designId !== body.designId || editing.fileName !== fileName) {
        try {
          fs.unlinkSync(oldPath);
        } catch {
          // best-effort cleanup of the now-orphaned file; not fatal
        }
      }
    }
  } else if (uploadFile) {
    const ext = path.extname(uploadFile.name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type "${ext || uploadFile.name}" — export as JPEG, PNG, or WebP first.` },
        { status: 400 }
      );
    }
    fileName = `${String(local).padStart(2, "0")}${ext}`;
    sourcePath = uploadFile.name;
    try {
      fs.writeFileSync(path.join(destDir, fileName), Buffer.from(await uploadFile.arrayBuffer()));
    } catch (err) {
      return NextResponse.json({ error: describeReadError(err, uploadFile.name) }, { status: 400 });
    }
  } else {
    if (!body.sourcePath || !fs.existsSync(body.sourcePath)) {
      return NextResponse.json({ error: "Source photo not found" }, { status: 400 });
    }
    const ext = path.extname(body.sourcePath).toLowerCase();
    if (!IMAGE_EXT.has(ext)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }
    fileName = `${String(local).padStart(2, "0")}${ext}`;
    sourcePath = body.sourcePath;
    try {
      fs.copyFileSync(body.sourcePath, path.join(destDir, fileName));
    } catch (err) {
      return NextResponse.json({ error: describeReadError(err, body.sourcePath) }, { status: 400 });
    }
  }

  const config = buildConfig(body, local, fileName, sourcePath);
  saveCardConfig(config);

  const key = configKey(body.designId, local);
  if (body.existingKey && body.existingKey !== key) {
    deleteCardConfig(body.existingKey);
  }

  return NextResponse.json({ key, config });
}

// Deployed remote mode: no persistent filesystem, so every save commits the
// photo + updated card-configs.json to the staging branch (see
// github-content.server.ts) — queued there until a separate Publish action
// fast-forwards the live branch to staging's tip.
async function savePostRemote(body: SaveBody, uploadFile: File | null, total: number) {
  const branch = stagingBranch();
  await ensureBranch(branch, githubEnv().branch);

  let configs: Record<string, CardConfig>;
  try {
    configs = await getCardConfigsRemote();
  } catch (err) {
    return NextResponse.json({ error: `Could not read the current cards from GitHub: ${(err as Error).message}` }, { status: 502 });
  }

  const editing = body.existingKey ? configs[body.existingKey] : null;
  if (body.existingKey && !editing) {
    return NextResponse.json({ error: "Card being edited no longer exists" }, { status: 404 });
  }

  const local = body.local ?? (editing ? editing.local : firstEmptySlot(body.designId, total, configs) ?? undefined);
  if (!local || local < 1 || local > total) {
    return NextResponse.json({ error: "No free slot for this design" }, { status: 400 });
  }

  const destDir = `public/photos/${body.designId}`;
  let fileName: string;
  let sourcePath: string;
  const writes: CommitWrite[] = [];
  const deletes: string[] = [];
  const reuseBlob: { path: string; sha: string }[] = [];

  if (editing) {
    const ext = path.extname(editing.fileName);
    fileName = `${String(local).padStart(2, "0")}${ext}`;
    sourcePath = editing.sourcePath;
    const oldPath = `public/photos/${editing.designId}/${editing.fileName}`;
    const newPath = `${destDir}/${fileName}`;
    if (oldPath !== newPath) {
      const oldMeta = await getFileMeta(oldPath, branch);
      if (!oldMeta.sha) {
        return NextResponse.json(
          { error: "Original photo not found on GitHub — it may have been moved or deleted since." },
          { status: 404 }
        );
      }
      // Point the new path at the same blob rather than re-fetching and
      // re-uploading the bytes — cheaper, and sidesteps the Contents API's
      // 1MB inline-content ceiling that phone JPEGs routinely exceed.
      reuseBlob.push({ path: newPath, sha: oldMeta.sha });
      if (editing.designId !== body.designId || editing.fileName !== fileName) {
        deletes.push(oldPath);
      }
    }
  } else if (uploadFile) {
    const ext = path.extname(uploadFile.name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type "${ext || uploadFile.name}" — export as JPEG, PNG, or WebP first.` },
        { status: 400 }
      );
    }
    fileName = `${String(local).padStart(2, "0")}${ext}`;
    sourcePath = uploadFile.name;
    writes.push({ path: `${destDir}/${fileName}`, content: Buffer.from(await uploadFile.arrayBuffer()) });
  } else {
    return NextResponse.json({ error: "No photo provided — pick a photo from this device." }, { status: 400 });
  }

  const config = buildConfig(body, local, fileName, sourcePath);
  const key = configKey(body.designId, local);
  const nextConfigs = { ...configs };
  if (body.existingKey && body.existingKey !== key) delete nextConfigs[body.existingKey];
  nextConfigs[key] = config;
  writes.push({ path: CARD_CONFIGS_REL_PATH, content: JSON.stringify(nextConfigs, null, 2) + "\n" });

  try {
    await commitFiles({ branch, message: `Queue ${key} via remote configurator`, writes, deletes, reuseBlob });
  } catch (err) {
    return NextResponse.json({ error: `Could not queue this save: ${(err as Error).message}` }, { status: 502 });
  }

  return NextResponse.json({ key, config, queued: true });
}

export async function DELETE(request: NextRequest) {
  if (blocked()) return new NextResponse(null, { status: 404 });
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  if (isRemoteBackend()) {
    return deletePostRemote(key);
  }
  deleteCardConfig(key);
  return NextResponse.json({ ok: true });
}

async function deletePostRemote(key: string) {
  const branch = stagingBranch();
  await ensureBranch(branch, githubEnv().branch);

  let configs: Record<string, CardConfig>;
  try {
    configs = await getCardConfigsRemote();
  } catch (err) {
    return NextResponse.json({ error: `Could not read the current cards from GitHub: ${(err as Error).message}` }, { status: 502 });
  }

  const existing = configs[key];
  if (!existing) return NextResponse.json({ ok: true }); // already gone: idempotent, like the local path

  const nextConfigs = { ...configs };
  delete nextConfigs[key];

  const writes: CommitWrite[] = [{ path: CARD_CONFIGS_REL_PATH, content: JSON.stringify(nextConfigs, null, 2) + "\n" }];
  const deletes = [`public/photos/${existing.designId}/${existing.fileName}`];

  try {
    await commitFiles({ branch, message: `Queue removal of ${key} via remote configurator`, writes, deletes });
  } catch (err) {
    return NextResponse.json({ error: `Could not queue this removal: ${(err as Error).message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, queued: true });
}

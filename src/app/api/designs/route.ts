import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_CONDS, DEFAULT_SUBJECTS, PER_PACK } from "@/lib/designs";
import { getDesigns, saveDesigns, serializeDesigns, DESIGNS_REL_PATH } from "@/lib/design-configs.server";
import { getDesignsRemote } from "@/lib/design-configs.remote.server";
import { getCardConfigs } from "@/lib/card-configs.server";
import { getCardConfigsRemote } from "@/lib/card-configs.remote.server";
import { isRemoteBackend, isRemoteModeEnabled } from "@/lib/remote-mode.server";
import { commitFiles, ensureBranch, githubEnv, stagingBranch } from "@/lib/github-content.server";
import type { CardConfig, Design } from "@/lib/types";

// Category (series/design) management for the configurator: list, upsert
// (rename a pack label, recolor, change pack count, add a category) and
// delete. Same local-fs vs GitHub-staging split as card-config/route.ts —
// remote edits are queued on the staging branch and only go live on Publish.

const MAX_PACKS = 8;
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const ID_PATTERN = /^[a-z0-9-]{2,24}$/;

function blocked() {
  return !isRemoteModeEnabled();
}

async function currentDesigns(): Promise<Design[]> {
  return isRemoteBackend() ? getDesignsRemote() : getDesigns();
}

async function currentConfigs(): Promise<Record<string, CardConfig>> {
  return isRemoteBackend() ? getCardConfigsRemote() : getCardConfigs();
}

async function persistDesigns(designs: Design[], message: string): Promise<{ queued: boolean }> {
  if (!isRemoteBackend()) {
    saveDesigns(designs);
    return { queued: false };
  }
  const branch = stagingBranch();
  await ensureBranch(branch, githubEnv().branch);
  await commitFiles({
    branch,
    message,
    writes: [{ path: DESIGNS_REL_PATH, content: serializeDesigns(designs) }],
  });
  return { queued: true };
}

export async function GET() {
  if (blocked()) return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.json(await currentDesigns());
  } catch (err) {
    return NextResponse.json({ error: `Could not read categories: ${(err as Error).message}` }, { status: 502 });
  }
}

interface UpsertBody {
  design?: Partial<Design>;
  // True when adding a brand-new category — makes an id collision a hard
  // error instead of silently updating the existing category of that id.
  create?: boolean;
}

function invalid(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  if (blocked()) return new NextResponse(null, { status: 404 });

  const body = (await request.json().catch(() => null)) as UpsertBody | null;
  const input = body?.design;
  if (!input || typeof input !== "object") return invalid("Missing design");

  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!ID_PATTERN.test(id)) {
    return invalid("Category id must be 2-24 lowercase letters, digits, or dashes.");
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return invalid("Category needs a name.");
  const packs = Number(input.packs);
  if (!Number.isInteger(packs) || packs < 1 || packs > MAX_PACKS) {
    return invalid(`Packs must be a whole number between 1 and ${MAX_PACKS}.`);
  }
  const art = Array.isArray(input.art)
    ? input.art.map((line) => String(line).trim()).filter(Boolean).slice(0, 4)
    : [];
  if (art.length === 0) return invalid("The pack label needs at least one line.");
  for (const [field, value] of [["stock", input.stock], ["foil", input.foil], ["ink", input.ink]] as const) {
    if (typeof value !== "string" || !HEX_COLOR.test(value)) {
      return invalid(`"${field}" must be a hex color like #a1b2c3.`);
    }
  }
  const sub = typeof input.sub === "string" ? input.sub.trim() : "";

  let designs: Design[];
  let configs: Record<string, CardConfig>;
  try {
    [designs, configs] = await Promise.all([currentDesigns(), currentConfigs()]);
  } catch (err) {
    return NextResponse.json({ error: `Could not read current state: ${(err as Error).message}` }, { status: 502 });
  }

  const existing = designs.find((d) => d.id === id);
  if (body?.create && existing) {
    return NextResponse.json(
      { error: `A category with the id "${id}" already exists — pick a different name.` },
      { status: 409 }
    );
  }

  // Shrinking the run must not orphan saved cards sitting past the new end.
  const total = packs * PER_PACK;
  const orphaned = Object.values(configs).filter((c) => c.designId === id && c.local > total);
  if (orphaned.length > 0) {
    return invalid(
      `Can't reduce to ${packs} pack${packs === 1 ? "" : "s"} (${total} slots) — ${orphaned.length} saved card${orphaned.length === 1 ? "" : "s"} would fall past the end. Move or remove them first.`
    );
  }

  const next: Design = {
    // subjects/conds (placeholder title vocabulary) and the locked flag
    // aren't editable in the configurator — carry them over on update, seed
    // defaults for a brand-new category.
    subjects: existing?.subjects ?? DEFAULT_SUBJECTS,
    conds: existing?.conds ?? DEFAULT_CONDS,
    ...(existing?.locked ? { locked: true } : {}),
    id,
    name,
    packs,
    stock: input.stock as string,
    foil: input.foil as string,
    ink: input.ink as string,
    art,
    sub,
    ...(input.limited ? { limited: true } : {}),
  };

  const nextDesigns = existing ? designs.map((d) => (d.id === id ? next : d)) : [...designs, next];

  try {
    const { queued } = await persistDesigns(
      nextDesigns,
      `${existing ? "Update" : "Add"} category ${id} via remote configurator`
    );
    return NextResponse.json({ design: next, queued });
  } catch (err) {
    return NextResponse.json({ error: `Could not save the category: ${(err as Error).message}` }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  if (blocked()) return new NextResponse(null, { status: 404 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return invalid("Missing id");

  let designs: Design[];
  let configs: Record<string, CardConfig>;
  try {
    [designs, configs] = await Promise.all([currentDesigns(), currentConfigs()]);
  } catch (err) {
    return NextResponse.json({ error: `Could not read current state: ${(err as Error).message}` }, { status: 502 });
  }

  if (!designs.some((d) => d.id === id)) return NextResponse.json({ ok: true }); // already gone: idempotent

  const cards = Object.values(configs).filter((c) => c.designId === id).length;
  if (cards > 0) {
    return NextResponse.json(
      { error: `This category still has ${cards} saved card${cards === 1 ? "" : "s"} — remove them first.` },
      { status: 409 }
    );
  }

  try {
    const { queued } = await persistDesigns(
      designs.filter((d) => d.id !== id),
      `Remove category ${id} via remote configurator`
    );
    return NextResponse.json({ ok: true, queued });
  } catch (err) {
    return NextResponse.json({ error: `Could not remove the category: ${(err as Error).message}` }, { status: 502 });
  }
}

import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { DESIGNS } from "@/lib/designs";
import { configKey, deleteCardConfig, getCardConfigs, nextLocalSlot, saveCardConfig } from "@/lib/card-configs.server";
import { describeReadError } from "@/lib/cloud-file.server";
import type { Attribute, CardConfig, Crop, Rarity } from "@/lib/types";

// Local-only: copies a chosen photo into public/photos/ and upserts
// src/data/card-configs.json. Never available in a deployed build.
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const RARITIES: Rarity[] = ["common", "uncommon", "rare", "holo", "secret"];

interface SaveBody {
  sourcePath: string;
  designId: string;
  local?: number;
  crop?: Crop;
  rarity: Rarity;
  holo?: boolean;
  attributes?: Attribute[];
  title?: string;
  date?: string;
  medium?: string;
}

function blocked() {
  return process.env.NODE_ENV === "production";
}

export async function GET() {
  if (blocked()) return new NextResponse(null, { status: 404 });
  return NextResponse.json(getCardConfigs());
}

export async function POST(request: NextRequest) {
  if (blocked()) return new NextResponse(null, { status: 404 });

  const body = (await request.json()) as SaveBody;

  const design = DESIGNS.find((d) => d.id === body.designId);
  if (!design) return NextResponse.json({ error: "Unknown design" }, { status: 400 });

  if (!body.sourcePath || !fs.existsSync(body.sourcePath)) {
    return NextResponse.json({ error: "Source photo not found" }, { status: 400 });
  }
  const ext = path.extname(body.sourcePath).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (!RARITIES.includes(body.rarity)) {
    return NextResponse.json({ error: "Invalid rarity" }, { status: 400 });
  }

  const total = design.packs * 8;
  const local = body.local ?? nextLocalSlot(body.designId) ?? undefined;
  if (!local || local < 1 || local > total) {
    return NextResponse.json({ error: "No free slot for this design" }, { status: 400 });
  }

  const fileName = `${String(local).padStart(2, "0")}${ext}`;
  const destDir = path.join(process.cwd(), "public", "photos", body.designId);
  fs.mkdirSync(destDir, { recursive: true });
  try {
    fs.copyFileSync(body.sourcePath, path.join(destDir, fileName));
  } catch (err) {
    return NextResponse.json({ error: describeReadError(err, body.sourcePath) }, { status: 400 });
  }

  const config: CardConfig = {
    designId: body.designId,
    local,
    fileName,
    sourcePath: body.sourcePath,
    crop: body.crop ?? { x: 50, y: 50, zoom: 1 },
    rarity: body.rarity,
    holo: body.holo ?? (body.rarity === "holo" || body.rarity === "secret"),
    attributes: body.attributes ?? [],
    title: body.title || undefined,
    date: body.date || undefined,
    medium: body.medium || undefined,
    updatedAt: new Date().toISOString(),
  };
  saveCardConfig(config);

  return NextResponse.json({ key: configKey(body.designId, local), config });
}

export async function DELETE(request: NextRequest) {
  if (blocked()) return new NextResponse(null, { status: 404 });
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  deleteCardConfig(key);
  return NextResponse.json({ ok: true });
}

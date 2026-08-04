import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

// Local-only: lets the /configurator page browse the filesystem to find
// photos. Never available in a deployed build.
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

type Entry = { name: string; path: string; type: "dir" | "image" };

// OneDrive silently redirects the Windows Desktop folder for a lot of users,
// so try that first before falling back to the plain home-dir Desktop, and
// finally the home directory itself.
// Every path below is a runtime-only value (the user's own filesystem, never
// known at build time), so there's nothing for Next's file tracer to bundle —
// the ignore comments stop it from conservatively pulling in the whole repo.
function defaultDir(): string {
  const home = os.homedir();
  const candidates = [
    path.join(/* turbopackIgnore: true */ home, "OneDrive", "Desktop"),
    path.join(/* turbopackIgnore: true */ home, "Desktop"),
    home,
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(/* turbopackIgnore: true */ candidate).isDirectory()) return candidate;
    } catch {
      // try next candidate
    }
  }
  return home;
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });

  const requested = request.nextUrl.searchParams.get("dir");
  const dir = requested ? path.resolve(/* turbopackIgnore: true */ requested) : defaultDir();

  let stat: fs.Stats;
  try {
    stat = fs.statSync(/* turbopackIgnore: true */ dir);
  } catch {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }
  if (!stat.isDirectory()) {
    return NextResponse.json({ error: "Not a folder" }, { status: 400 });
  }

  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(/* turbopackIgnore: true */ dir, { withFileTypes: true });
  } catch {
    return NextResponse.json({ error: "Cannot read folder" }, { status: 400 });
  }

  const entries: Entry[] = names
    .filter((n) => !n.name.startsWith("."))
    .map((n): Entry | null => {
      if (n.isDirectory())
        return { name: n.name, path: path.join(/* turbopackIgnore: true */ dir, n.name), type: "dir" };
      const ext = path.extname(n.name).toLowerCase();
      if (IMAGE_EXT.has(ext))
        return { name: n.name, path: path.join(/* turbopackIgnore: true */ dir, n.name), type: "image" };
      return null;
    })
    .filter((e): e is Entry => e !== null)
    .sort((a, b) => (a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name)));

  const parent = path.dirname(dir) === dir ? null : path.dirname(dir);

  return NextResponse.json({ dir, parent, entries });
}

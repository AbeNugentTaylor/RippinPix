import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRemoteModeEnabled } from "@/lib/remote-mode.server";

// Gates the configurator on the deployed site behind HTTP Basic Auth.
//
// Next 16's docs say proxy.ts (the middleware.ts rename) always runs on the
// Node.js runtime — but in practice, deployed via @netlify/plugin-nextjs,
// Netlify ran this as an actual Netlify Edge Function (Deno-based, no
// node:crypto, no global Buffer), which crashed on those imports. Rather
// than fight that, this only uses Web-standard APIs (Web Crypto, atob) that
// work identically in Node and Deno/Edge, so it doesn't matter which one
// Netlify actually picks.
//
// Local dev never needs a password — this only guards the deployed,
// CONFIGURATOR_REMOTE-opted-in case. Every matched route also re-checks
// remote-mode itself (see isRemoteModeEnabled callers), so a future matcher
// edit here can't silently become the *only* thing standing between the
// public internet and these routes.
export const config = {
  matcher: ["/configurator/:path*", "/api/card-config/:path*"],
};

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RippinPix configurator"' },
  });
}

async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

// Hash both sides to a fixed length first, then compare byte-by-byte without
// short-circuiting — a naive string/array === would both leak the real
// password's length and let an attacker time their way through it a byte at
// a time. (Web Crypto has no built-in timingSafeEqual, unlike node:crypto.)
async function passwordMatches(supplied: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(supplied), sha256(expected)]);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "production" || !isRemoteModeEnabled()) {
    return NextResponse.next();
  }

  // Remote mode is on but no password configured: fail closed, never open.
  const expected = process.env.CONFIGURATOR_PASSWORD;
  if (!expected) return unauthorized();

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    const supplied = separator === -1 ? decoded : decoded.slice(separator + 1);

    if (!(await passwordMatches(supplied, expected))) return unauthorized();
    return NextResponse.next();
  } catch {
    // Malformed base64, or any other unexpected failure here: fail closed
    // rather than crashing the whole function (and the page) on a bad guess.
    return unauthorized();
  }
}

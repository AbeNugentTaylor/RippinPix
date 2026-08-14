import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { isRemoteModeEnabled } from "@/lib/remote-mode.server";

// Gates the configurator on the deployed site behind HTTP Basic Auth. Next
// 16 renamed middleware.ts to proxy.ts and it always runs on the Node.js
// runtime (not configurable — see node_modules/next/dist/docs/.../proxy.md),
// which is what makes node:crypto usable here with no extra setup.
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

// Hash both sides to a fixed length first: timingSafeEqual throws (rather
// than returning false) on a length mismatch, which both crashes on a
// wrong-length guess and leaks the real password's length via that crash.
function passwordMatches(supplied: string, expected: string): boolean {
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function proxy(request: NextRequest): NextResponse {
  if (process.env.NODE_ENV !== "production" || !isRemoteModeEnabled()) {
    return NextResponse.next();
  }

  // Remote mode is on but no password configured: fail closed, never open.
  const expected = process.env.CONFIGURATOR_PASSWORD;
  if (!expected) return unauthorized();

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf-8");
  const separator = decoded.indexOf(":");
  const supplied = separator === -1 ? decoded : decoded.slice(separator + 1);

  if (!passwordMatches(supplied, expected)) return unauthorized();

  return NextResponse.next();
}

import { NextRequest, NextResponse } from "next/server";

/**
 * Fast redirect-to-login for signed-out visitors. This only checks that a
 * session cookie EXISTS — actual verification happens server-side in every
 * page (requireSessionUser) and API route (requireUser), so a forged cookie
 * gets past this redirect but never past the pages. Keeping Auth.js out of
 * the middleware avoids bundling jose into the Edge Runtime (build warnings)
 * and keeps the middleware bundle small.
 */
export function middleware(req: NextRequest) {
  if (process.env.DEV_NO_AUTH === "1" && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }
  const hasSessionCookie =
    req.cookies.has("__Secure-authjs.session-token") || req.cookies.has("authjs.session-token");
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Protects all pages. API routes do their own check via requireUser()
// (a redirect response is the wrong shape for fetch() callers anyway).
export default auth((req) => {
  if (process.env.DEV_NO_AUTH === "1" && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};

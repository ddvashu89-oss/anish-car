import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  // Signature check only — pages re-check the session row and the user's permissions.
  const session = token ? await verifySessionToken(token) : null;

  if (PUBLIC_PATHS.includes(pathname)) {
    // A page determined the session is unusable (no matching DB row, inactive user, …) even
    // though the cookie's signature still checks out. Clear it here instead of bouncing the
    // request back to a protected page, which would just redirect here again forever.
    const expired = request.nextUrl.searchParams.get("expired") === "1";
    if (expired) {
      const response = NextResponse.next();
      if (token) response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    if (session) return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    const response = NextResponse.redirect(loginUrl);
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|svg|gif|webp|ico)$).*)"],
};

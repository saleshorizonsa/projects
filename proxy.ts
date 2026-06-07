import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next 16 "proxy" (formerly middleware). Gates every page except auth routes,
// the login/signup pages, and static assets; unauthenticated → /login.
const { auth } = NextAuth(authConfig);
export default auth;

export const config = {
  matcher: [
    "/((?!api/auth|login|signup|_next/static|_next/image|favicon.ico|.*\\.svg).*)",
  ],
};

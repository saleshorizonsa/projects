import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no DB / bcrypt) — shared by the middleware and the full
// auth instance. The Credentials provider (which uses Prisma) is added in auth.ts.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    // Used by the middleware to gate every matched route.
    authorized({ auth }) {
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role ?? "member";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as string) ?? "member";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

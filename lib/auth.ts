// lib/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

// If you want DB-backed sessions, keep the Session/Account models.
// Default NextAuth v5 session is JWT; DB sessions are fine too.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  // Make sure NextAuth can trust host behind Vercel proxies
  trustHost: true,

  // Optional: explicitly set base URL if you like
  // basePath: "/api/auth", // default
  // baseUrl: process.env.NEXTAUTH_URL, // optional—NextAuth detects it

  callbacks: {
    // Add id/role/handle onto the session for easy access in server components/actions
    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id;
        (session.user as any).role = (user as any).role ?? null;
        (session.user as any).handle = (user as any).handle ?? null;
      }
      return session;
    },
  },
});

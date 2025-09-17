// lib/auth.ts
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// Central NextAuth config (v5, App Router)
export const authOptions: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  trustHost: true, // needed behind Vercel proxies
  session: { strategy: "database" }, // you have Session model; 'jwt' also works if preferred
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user, token }) {
      // Expose id/role/handle on session for convenience
      if (session.user) {
        (session.user as any).id = user?.id ?? token?.sub ?? null;
        (session.user as any).role = (user as any)?.role ?? null;
        (session.user as any).handle = (user as any)?.handle ?? null;
      }
      return session;
    },
  },
};

// v5 API: use these in server components/actions/routes
export const { auth, handlers, signIn, signOut } = NextAuth(authOptions);

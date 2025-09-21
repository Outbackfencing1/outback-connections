import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    })
  ],
  // Keep auth simple: JWT sessions, no DB required locally or on first deploy
  session: { strategy: "jwt" },
  // Your login page route
  pages: { signIn: "/login" }
});

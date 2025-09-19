// Keep a compatibility re-export so any old imports from "@/lib/auth"
// continue to work without pulling PrismaAdapter.
export { auth, signIn, signOut } from "@/auth";

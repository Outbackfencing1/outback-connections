// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";

// NextAuth v5 handlers export
export const { GET, POST } = handlers;

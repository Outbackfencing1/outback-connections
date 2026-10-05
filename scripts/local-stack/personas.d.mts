export declare const PERSONAS: Record<"member" | "admin" | "owner", { id: string; email: string }>;
export declare function sessionCookie(persona: "member" | "admin" | "owner", secret: string, gatewayUrl: string): { name: string; value: string };

// Starts the fake Supabase on FAKE_SUPABASE_PORT (default 54421).
import { start } from "./server.mjs";
start(Number(process.env.FAKE_SUPABASE_PORT ?? 54421)).then(() => console.log("fake supabase up"));

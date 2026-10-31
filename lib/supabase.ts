import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isConfigured = Boolean(url && key);

// Placeholder values keep the build working before Supabase is set up.
export const supabase = createClient(url || "http://localhost:54321", key || "public-anon-key");

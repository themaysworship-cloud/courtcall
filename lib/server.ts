import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

/** Supabase client with the secret key. Server only. Returns null until the key is set in Vercel. */
export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** The notification signing keys. Made once and stored in the database, so nobody has to create them by hand. */
export async function vapidKeys(admin: SupabaseClient): Promise<{ publicKey: string; privateKey: string }> {
  const read = async () => {
    const { data } = await admin.from("app_keys").select("name, value").in("name", ["vapid_public", "vapid_private"]);
    const map = Object.fromEntries((data ?? []).map((r) => [r.name, r.value as string]));
    return map.vapid_public && map.vapid_private ? { publicKey: map.vapid_public, privateKey: map.vapid_private } : null;
  };
  const existing = await read();
  if (existing) return existing;
  const fresh = webpush.generateVAPIDKeys();
  await admin.from("app_keys").upsert(
    [
      { name: "vapid_public", value: fresh.publicKey },
      { name: "vapid_private", value: fresh.privateKey },
    ],
    { onConflict: "name", ignoreDuplicates: true },
  );
  // If two requests raced, everyone uses whichever pair was saved first.
  return (await read()) ?? fresh;
}

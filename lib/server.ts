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

export type PushMessage = { user_id: string; title: string; body: string; tag?: string; url?: string };

/** Send each message to every device its person has turned alerts on for. Returns how many were delivered. */
export async function sendPush(admin: SupabaseClient, messages: PushMessage[]): Promise<number> {
  if (!messages.length) return 0;
  const keys = await vapidKeys(admin);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:courtcall@example.com", keys.publicKey, keys.privateKey);
  const ids = [...new Set(messages.map((m) => m.user_id))];
  const { data: subs } = await admin.from("push_subscriptions").select("*").in("user_id", ids);
  let sent = 0;
  await Promise.all(
    messages.flatMap((m) =>
      (subs ?? [])
        .filter((s) => s.user_id === m.user_id)
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: m.title, body: m.body, tag: m.tag, url: m.url ?? "/week" }),
            );
            sent++;
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode;
            // The phone unsubscribed or the app was removed: forget this device.
            if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        }),
    ),
  );
  return sent;
}

/** The signed-in member making this request, or null. */
export async function requestUser(admin: SupabaseClient, req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user?.id ?? null;
}

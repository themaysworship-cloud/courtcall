import { NextResponse } from "next/server";
import { adminClient, requestUser, sendPush } from "@/lib/server";

export const runtime = "nodejs";

/**
 * Called by the app right after someone sends a chat message.
 * Group chat: notifies everyone with chat alerts on.
 * A day's chat: notifies people who are In that day or have posted in that chat.
 */
export async function POST(req: Request) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ skipped: "notifications not configured" });
  const actor = await requestUser(admin, req);
  if (!actor) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { id } = (await req.json().catch(() => ({}))) as { id?: number };
  if (!id) return NextResponse.json({ error: "missing message" }, { status: 400 });

  const { data: msg } = await admin.from("messages").select("*").eq("id", id).single();
  // Only the author can announce their own fresh message.
  if (!msg || msg.user_id !== actor || Date.now() - new Date(msg.created_at).getTime() > 2 * 60 * 1000) {
    return NextResponse.json({ sent: 0 });
  }

  const room = msg.room as string;
  const { data: people } = await admin.from("profiles").select("id, full_name, chat_alerts");
  const author = (people ?? []).find((p) => p.id === actor);
  let recipients = (people ?? []).filter((p) => p.id !== actor && p.chat_alerts !== false).map((p) => p.id as string);

  let where = "Group chat";
  if (room.startsWith("day-")) {
    const date = room.slice(4);
    const [{ data: ins }, { data: posters }] = await Promise.all([
      admin.from("day_rsvps").select("user_id").eq("play_date", date).eq("status", "in"),
      admin.from("messages").select("user_id").eq("room", room),
    ]);
    const involved = new Set([...(ins ?? []), ...(posters ?? [])].map((r) => r.user_id as string));
    recipients = recipients.filter((r) => involved.has(r));
    where = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  const name = (author?.full_name as string | undefined)?.split(" ")[0] || "Someone";
  const text = (msg.body as string).trim();
  const body = msg.image_url ? (text ? `📷 ${text}` : "📷 Sent a photo") : text;
  const sent = await sendPush(
    admin,
    recipients.map((user_id) => ({
      user_id,
      title: `${name} · ${where}`,
      body: body.length > 140 ? body.slice(0, 137) + "…" : body,
      tag: `chat-${room}`,
      url: `/chat?room=${encodeURIComponent(room)}`,
    })),
  );
  return NextResponse.json({ sent });
}

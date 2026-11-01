import { NextResponse } from "next/server";
import { adminClient, requestUser, sendPush } from "@/lib/server";
import { onFullCourt } from "@/lib/courts";
import { COURT_SIZE, COURT_TIME_LABEL } from "@/lib/config";

export const runtime = "nodejs";

/**
 * Called by the app after someone taps In or Out for a day.
 * Compares who is on a full court now with who has already been told, and sends phone notifications:
 *  - "You're on a full court" to anyone who just made it onto one.
 *  - "Your court needs a player" to anyone who was on a full court that no longer is.
 */
export async function POST(req: Request) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ skipped: "notifications not configured" });

  const { date, dropped } = (await req.json().catch(() => ({}))) as { date?: string; dropped?: boolean };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }

  // Only signed-in members can trigger this.
  const actor = await requestUser(admin, req);
  if (!actor) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: rsvps } = await admin
    .from("day_rsvps")
    .select("user_id")
    .eq("play_date", date)
    .eq("status", "in")
    .order("updated_at");
  const ins = (rsvps ?? []).map((r) => r.user_id as string);
  const full = new Set(onFullCourt(ins));

  const { data: notices } = await admin.from("court_notices").select("user_id").eq("play_date", date);
  const told = new Set((notices ?? []).map((n) => n.user_id as string));

  const promoted = [...full].filter((id) => !told.has(id));
  const bumped = [...told].filter((id) => !full.has(id));

  // Claim the change first so two requests at once don't double-send.
  let newlyFull: string[] = [];
  if (promoted.length) {
    const { data } = await admin
      .from("court_notices")
      .upsert(
        promoted.map((user_id) => ({ play_date: date, user_id })),
        { onConflict: "play_date,user_id", ignoreDuplicates: true },
      )
      .select("user_id");
    newlyFull = (data ?? []).map((r) => r.user_id as string);
  }
  let newlyBumped: string[] = [];
  if (bumped.length) {
    const { data } = await admin
      .from("court_notices")
      .delete()
      .eq("play_date", date)
      .in("user_id", bumped)
      .select("user_id");
    newlyBumped = (data ?? []).map((r) => r.user_id as string);
  }

  // Don't notify the person who just tapped; they can see it on screen.
  const toFull = newlyFull.filter((id) => id !== actor);
  const toBumped = newlyBumped.filter((id) => id !== actor && ins.includes(id));

  // Someone who was in just dropped out: tell everyone still in (unless they already got a more specific alert).
  let toDropNotice: string[] = [];
  let dropperName = "Someone";
  if (dropped) {
    const { data: mine } = await admin
      .from("day_rsvps")
      .select("status, updated_at")
      .eq("play_date", date)
      .eq("user_id", actor)
      .single();
    const recent = mine && Date.now() - new Date(mine.updated_at as string).getTime() < 2 * 60 * 1000;
    if (mine?.status === "out" && recent) {
      const skip = new Set([...toFull, ...toBumped, actor]);
      toDropNotice = ins.filter((id) => !skip.has(id));
      const { data: p } = await admin.from("profiles").select("full_name").eq("id", actor).single();
      dropperName = (p?.full_name as string | undefined)?.split(" ")[0] || "Someone";
    }
  }

  if (!toFull.length && !toBumped.length && !toDropNotice.length) return NextResponse.json({ sent: 0 });

  const day = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const waitingCount = ins.length - full.size;
  const courtLine =
    waitingCount === 0
      ? `${ins.length} in, every court is full.`
      : `${ins.length} in, need ${COURT_SIZE - waitingCount} more to fill court ${full.size / COURT_SIZE + 1}.`;
  const messages = [
    ...toFull.map((user_id) => ({
      user_id,
      title: "You're on a full court!",
      body: `${day}, ${COURT_TIME_LABEL}. See you there!`,
    })),
    ...toBumped.map((user_id) => ({
      user_id,
      title: "Your court needs a player",
      body: `${dropperName} dropped out for ${day}. ${COURT_SIZE - waitingCount} more needed to fill it again.`,
    })),
    ...toDropNotice.map((user_id) => ({
      user_id,
      title: `${dropperName} dropped out`,
      body: `${day}, ${COURT_TIME_LABEL}. ${courtLine}`,
    })),
  ];

  const sent = await sendPush(
    admin,
    messages.map((m) => ({ ...m, tag: `court-${date}`, url: "/week" })),
  );

  return NextResponse.json({ sent });
}

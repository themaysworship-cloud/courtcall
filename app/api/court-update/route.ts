import { NextResponse } from "next/server";
import { adminClient, requestUser, sendPush } from "@/lib/server";
import { onFullCourt } from "@/lib/courts";
import { COURT_SIZE, COURT_TIME_LABEL, RYVL_PLACE } from "@/lib/config";

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

  const { date, dropped, groupId, ryvl } = (await req.json().catch(() => ({}))) as {
    date?: string;
    dropped?: boolean;
    groupId?: string;
    ryvl?: boolean;
  };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }

  // Only signed-in members can trigger this.
  const actor = await requestUser(admin, req);
  if (!actor) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  // Older copies of the app don't send a group: they are The Ballers.
  let gid = groupId;
  if (!gid) {
    const { data: g } = await admin.from("groups").select("id").eq("slug", "ballers").single();
    gid = g?.id as string | undefined;
  }
  if (!gid) return NextResponse.json({ error: "no group" }, { status: 400 });
  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", gid)
    .eq("user_id", actor)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "not in this group" }, { status: 403 });

  if (ryvl) return ryvlUpdate(admin, gid, date, actor);

  const { data: rsvps } = await admin
    .from("day_rsvps")
    .select("user_id")
    .eq("group_id", gid)
    .eq("play_date", date)
    .eq("status", "in")
    .order("updated_at");
  const ins = (rsvps ?? []).map((r) => r.user_id as string);
  const full = new Set(onFullCourt(ins));

  const { data: notices } = await admin
    .from("court_notices")
    .select("user_id")
    .eq("group_id", gid)
    .eq("play_date", date);
  const told = new Set((notices ?? []).map((n) => n.user_id as string));

  const promoted = [...full].filter((id) => !told.has(id));
  const bumped = [...told].filter((id) => !full.has(id));

  // Claim the change first so two requests at once don't double-send.
  let newlyFull: string[] = [];
  if (promoted.length) {
    const { data } = await admin
      .from("court_notices")
      .upsert(
        promoted.map((user_id) => ({ group_id: gid, play_date: date, user_id })),
        { onConflict: "group_id,play_date,user_id", ignoreDuplicates: true },
      )
      .select("user_id");
    newlyFull = (data ?? []).map((r) => r.user_id as string);
  }
  let newlyBumped: string[] = [];
  if (bumped.length) {
    const { data } = await admin
      .from("court_notices")
      .delete()
      .eq("group_id", gid)
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
      .eq("group_id", gid)
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

  const day = dayName(date);
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
    messages.map((m) => ({ ...m, tag: `court-${gid}-${date}`, url: `/week?g=${gid}` })),
  );

  return NextResponse.json({ sent });
}

function dayName(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** RYVL: tell people when they make a court at their level, or when their court loses a player. */
async function ryvlUpdate(admin: NonNullable<ReturnType<typeof adminClient>>, gid: string, date: string, actor: string) {
  const { data: rows } = await admin
    .from("ryvl_signups")
    .select("user_id, level")
    .eq("group_id", gid)
    .eq("play_date", date)
    .order("updated_at");
  const levels = new Map<string, string>();
  const full = new Set<string>();
  for (const level of ["3.0-3.5", "3.5-4.0"]) {
    const ids = (rows ?? []).filter((r) => r.level === level).map((r) => r.user_id as string);
    onFullCourt(ids).forEach((id) => {
      full.add(id);
      levels.set(id, level);
    });
  }
  const { data: notices } = await admin
    .from("ryvl_notices")
    .select("user_id")
    .eq("group_id", gid)
    .eq("play_date", date);
  const told = new Set((notices ?? []).map((n) => n.user_id as string));
  const promoted = [...full].filter((id) => !told.has(id));
  const bumped = [...told].filter((id) => !full.has(id));

  let newlyFull: string[] = [];
  if (promoted.length) {
    const { data } = await admin
      .from("ryvl_notices")
      .upsert(
        promoted.map((user_id) => ({ group_id: gid, play_date: date, user_id })),
        { onConflict: "group_id,play_date,user_id", ignoreDuplicates: true },
      )
      .select("user_id");
    newlyFull = (data ?? []).map((r) => r.user_id as string);
  }
  let newlyBumped: string[] = [];
  if (bumped.length) {
    const { data } = await admin
      .from("ryvl_notices")
      .delete()
      .eq("group_id", gid)
      .eq("play_date", date)
      .in("user_id", bumped)
      .select("user_id");
    newlyBumped = (data ?? []).map((r) => r.user_id as string);
  }
  const stillSigned = new Set((rows ?? []).map((r) => r.user_id as string));
  const day = dayName(date);
  const messages = [
    ...newlyFull
      .filter((id) => id !== actor)
      .map((user_id) => ({
        user_id,
        title: "You're on a RYVL court!",
        body: `RYVL ${levels.get(user_id)}, ${day}, ${COURT_TIME_LABEL} at ${RYVL_PLACE}.`,
      })),
    ...newlyBumped
      .filter((id) => id !== actor && stillSigned.has(id))
      .map((user_id) => ({
        user_id,
        title: "Your RYVL court needs a player",
        body: `Someone dropped out for ${day}. You're back on the waitlist until it fills again.`,
      })),
  ];
  const sent = await sendPush(
    admin,
    messages.map((m) => ({ ...m, tag: `ryvl-${gid}-${date}`, url: `/ryvl?g=${gid}` })),
  );
  return NextResponse.json({ sent });
}

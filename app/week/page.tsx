"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";
import type { DayRsvp } from "@/lib/types";
import { COURT_SIZE, COURT_TIME_LABEL } from "@/lib/config";
import { addDays, dayLabel, rangeLabel, startOfWeek, toISODate, weekDays } from "@/lib/dates";

export default function WeekPage() {
  const { auth, members } = useAuth();
  const myId = auth!.user.id;
  const [sunday, setSunday] = useState(() => startOfWeek(new Date()));
  const [rsvps, setRsvps] = useState<DayRsvp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const todayRef = useRef<HTMLElement>(null);

  const days = useMemo(() => weekDays(sunday), [sunday]);
  const from = toISODate(days[0]);
  const to = toISODate(days[days.length - 1]);
  const today = toISODate(new Date());

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("day_rsvps")
      .select("*")
      .gte("play_date", from)
      .lte("play_date", to)
      .order("updated_at");
    if (error) setError(error.message);
    setRsvps((data ?? []) as DayRsvp[]);
    setLoaded(true);
  }, [from, to]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`rsvps-${from}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "day_rsvps" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [from, load]);

  // Open on today instead of days that already happened.
  useEffect(() => {
    if (loaded) todayRef.current?.scrollIntoView({ block: "start" });
  }, [loaded]);

  async function setStatus(date: string, status: "in" | "out") {
    setError(null);
    // Show the change right away, then save it.
    setRsvps((prev) => [
      ...prev.filter((r) => !(r.play_date === date && r.user_id === myId)),
      { play_date: date, user_id: myId, status, updated_at: new Date().toISOString() },
    ]);
    const { error } = await supabase
      .from("day_rsvps")
      .upsert({ play_date: date, user_id: myId, status, updated_at: new Date().toISOString() });
    if (error) setError(error.message);
    load();
  }

  const everyone = Object.values(members);
  const firstName = (id: string) => members[id]?.full_name.split(" ")[0] || "Member";

  return (
    <main className="page">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setSunday(addDays(sunday, -7))} aria-label="Previous week">
          ‹
        </button>
        <div className="topbar-title">
          <h1>Courts</h1>
          <span className="muted">
            {rangeLabel(days[0], days[days.length - 1])} · {COURT_TIME_LABEL}
          </span>
        </div>
        <button className="icon-btn" onClick={() => setSunday(addDays(sunday, 7))} aria-label="Next week">
          ›
        </button>
      </header>
      {toISODate(sunday) !== toISODate(startOfWeek(new Date())) && (
        <button className="link-btn" onClick={() => setSunday(startOfWeek(new Date()))}>
          Jump to this week
        </button>
      )}
      {error && <p className="error">{error}</p>}

      {days.map((d) => {
        const iso = toISODate(d);
        const past = iso < today;
        const dayRsvps = rsvps.filter((r) => r.play_date === iso);
        const ins = dayRsvps.filter((r) => r.status === "in");
        const outs = dayRsvps.filter((r) => r.status === "out");
        const answered = new Set(dayRsvps.map((r) => r.user_id));
        const noAnswer = everyone.filter((p) => !answered.has(p.id));
        const mine = dayRsvps.find((r) => r.user_id === myId)?.status;

        return (
          <section
            key={iso}
            ref={iso === today ? todayRef : undefined}
            className={`day ${iso === today ? "today" : ""} ${past ? "past" : ""}`}
          >
            <article className="card optin">
              <div className="optin-top">
                <div>
                  <h2>
                    {dayLabel(d)}
                    {iso === today && <span className="pill">Today</span>}
                  </h2>
                  <div className="muted small">{COURT_TIME_LABEL}</div>
                </div>
                <div className={`optin-count ${ins.length === 0 ? "zero" : ""}`}>
                  <strong>{Math.floor(ins.length / COURT_SIZE)}</strong>
                  <small>{Math.floor(ins.length / COURT_SIZE) === 1 ? "court" : "courts"} full</small>
                </div>
              </div>

              <CourtStatus count={ins.length} past={past} />

              {(!past || ins.length > 0) && (
              <div className="courts">
                {courtsFor(ins.map((r) => r.user_id)).map((players, i) => (
                  <div key={i} className={`court ${players.length === COURT_SIZE ? "full" : ""}`}>
                    <div className="court-label">
                      Court {i + 1}
                      <span>
                        {players.length}/{COURT_SIZE}
                      </span>
                    </div>
                    <div className="court-surface">
                      {Array.from({ length: COURT_SIZE }, (_, slot) => {
                        const id = players[slot];
                        return id ? (
                          <Link key={slot} href={`/members?u=${id}`} className="slot filled">
                            <Avatar profile={members[id]} size={40} />
                            <span>{firstName(id)}</span>
                          </Link>
                        ) : (
                          <div key={slot} className="slot open">
                            <span className="slot-dot">+</span>
                            <span>Open</span>
                          </div>
                        );
                      })}
                      <div className="court-net" />
                    </div>
                  </div>
                ))}
              </div>
              )}

              {!past && (
                <div className="inout">
                  <button className={`in ${mine === "in" ? "on" : ""}`} onClick={() => setStatus(iso, "in")}>
                    {mine === "in" ? "✓ I'm in" : "In"}
                  </button>
                  <button className={`out ${mine === "out" ? "on" : ""}`} onClick={() => setStatus(iso, "out")}>
                    {mine === "out" ? "✕ I'm out" : "Out"}
                  </button>
                </div>
              )}

              {outs.length > 0 && (
                <div className="who-line">
                  <b>Out:</b> {outs.map((r) => firstName(r.user_id)).join(", ")}
                </div>
              )}
              {!past && noAnswer.length > 0 && (
                <div className="who-line">
                  <b>No answer yet:</b> {noAnswer.map((p) => p.full_name.split(" ")[0] || "Member").join(", ")}
                </div>
              )}

              <div className="day-foot">
                <Link className="link-btn" href={`/chat/day-${iso}`}>
                  💬 Chat about this day
                </Link>
              </div>
            </article>
          </section>
        );
      })}

      <button className="btn ghost full" onClick={() => setSunday(addDays(sunday, 7))}>
        Next week ›
      </button>
    </main>
  );
}

/** Split players (in signup order) into courts of COURT_SIZE, always showing one court with open spots. */
function courtsFor(ids: string[]): string[][] {
  const courts: string[][] = [];
  for (let i = 0; i < ids.length; i += COURT_SIZE) courts.push(ids.slice(i, i + COURT_SIZE));
  if (courts.length === 0 || courts[courts.length - 1].length === COURT_SIZE) courts.push([]);
  return courts;
}

function CourtStatus({ count, past }: { count: number; past: boolean }) {
  const full = Math.floor(count / COURT_SIZE);
  const need = COURT_SIZE - (count % COURT_SIZE);
  const next = full + 1;
  if (past) {
    return (
      <p className="court-status done">
        {count === 0 ? "Nobody played" : `${count} played · ${full} full ${full === 1 ? "court" : "courts"}`}
      </p>
    );
  }
  if (count === 0) {
    return <p className="court-status">Need {COURT_SIZE} to fill the first court</p>;
  }
  return (
    <p className={`court-status ${need === 1 ? "close" : ""}`}>
      {count} in · <strong>need {need} more</strong> to fill court {next}
    </p>
  );
}

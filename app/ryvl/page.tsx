"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";
import { GroupSwitcher } from "@/components/Groups";
import type { RyvlLevel, RyvlSignup } from "@/lib/types";
import { COURT_SIZE, COURT_TIME_LABEL, RYVL_LEVELS, RYVL_PLACE } from "@/lib/config";
import { onFullCourt } from "@/lib/courts";
import { cached, remember } from "@/lib/cache";
import { reportRyvlChange } from "@/lib/push";
import { addDays, dayLabel, rangeLabel, startOfWeek, toISODate, weekDays } from "@/lib/dates";

export default function RyvlPage() {
  const { auth, members, me, group } = useAuth();
  const myId = auth!.user.id;
  const gid = group?.id ?? "";
  const [sunday, setSunday] = useState(() => startOfWeek(new Date()));
  const days = useMemo(() => weekDays(sunday), [sunday]);
  const from = toISODate(days[0]);
  const to = toISODate(days[days.length - 1]);
  const today = toISODate(new Date());
  const key = `ryvl:${gid}:${from}`;
  const [rows, setRows] = useState<RyvlSignup[]>(() => cached<RyvlSignup[]>(key) ?? []);
  const [error, setError] = useState<string | null>(null);

  const skill = me?.skill_level ?? null;
  const fits = (level: RyvlLevel) =>
    Boolean(skill && (RYVL_LEVELS.find((l) => l.level === level)?.fits as readonly string[]).includes(skill));
  const canPlayAny = RYVL_LEVELS.some((l) => fits(l.level));

  const load = useCallback(async () => {
    if (!gid) return;
    const { data, error } = await supabase
      .from("ryvl_signups")
      .select("*")
      .eq("group_id", gid)
      .gte("play_date", from)
      .lte("play_date", to)
      .order("updated_at");
    if (error) setError(error.message);
    else setRows(remember(key, (data ?? []) as RyvlSignup[]));
  }, [gid, key, from, to]);

  useEffect(() => {
    if (!gid) return;
    setRows(cached<RyvlSignup[]>(key) ?? []);
    load();
    const ch = supabase
      .channel(`ryvl-${gid}-${from}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ryvl_signups" }, (p) => {
        const row = (p.eventType === "DELETE" ? p.old : p.new) as RyvlSignup;
        if (!row?.play_date || row.group_id !== gid || row.play_date < from || row.play_date > to) return;
        setRows((prev) => {
          const rest = prev.filter((r) => !(r.play_date === row.play_date && r.user_id === row.user_id));
          const next = p.eventType === "DELETE" ? rest : [...rest, row];
          next.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
          return remember(key, next);
        });
      })
      .subscribe((status) => status === "SUBSCRIBED" && load());
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      supabase.removeChannel(ch);
    };
  }, [gid, key, from, to, load]);

  async function pick(date: string, level: RyvlLevel) {
    const current = rows.find((r) => r.play_date === date && r.user_id === myId);
    navigator.vibrate?.(10);
    setError(null);
    const now = new Date().toISOString();
    // Tapping my own level again takes me off the list.
    if (current?.level === level) {
      if (!confirm(`Take yourself off RYVL ${level} for this day?`)) return;
      setRows((prev) => remember(key, prev.filter((r) => !(r.play_date === date && r.user_id === myId))));
      const { error } = await supabase
        .from("ryvl_signups")
        .delete()
        .match({ group_id: gid, play_date: date, user_id: myId });
      if (error) {
        setError(error.message);
        load();
      } else reportRyvlChange(gid, date);
      return;
    }
    if (current && !confirm(`Switch to RYVL ${level}? You'll go to the back of that line.`)) return;
    setRows((prev) =>
      remember(key, [
        ...prev.filter((r) => !(r.play_date === date && r.user_id === myId)),
        { group_id: gid, play_date: date, user_id: myId, level, updated_at: now },
      ]),
    );
    const { error } = await supabase
      .from("ryvl_signups")
      .upsert({ group_id: gid, play_date: date, user_id: myId, level }, { onConflict: "group_id,play_date,user_id" });
    if (error) {
      setError(error.message);
      load();
    } else reportRyvlChange(gid, date);
  }

  const firstName = (id: string) => members[id]?.full_name.split(" ")[0] || "Member";

  return (
    <main className="page">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setSunday(addDays(sunday, -7))} aria-label="Previous week">
          ‹
        </button>
        <div className="topbar-title">
          <h1>RYVL games</h1>
          <GroupSwitcher />
          <span className="muted block">
            {rangeLabel(days[0], days[days.length - 1])} · {COURT_TIME_LABEL} · {RYVL_PLACE}
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

      <p className="muted small ryvl-intro">
        Pick your level for each day. Each court holds {COURT_SIZE}. When {COURT_SIZE} more are waiting, another court
        opens.
      </p>
      {!skill && (
        <Link href="/profile" className="alert-banner">
          Set your skill level on the Me tab to sign up →
        </Link>
      )}
      {skill && !canPlayAny && (
        <p className="alert-banner">
          RYVL here is for 3.0 to 4.0 players. Your level is set to {skill}. If that&apos;s wrong, change it on the Me tab.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {days.map((d) => {
        const iso = toISODate(d);
        const past = iso < today;
        const dayRows = rows.filter((r) => r.play_date === iso);
        const mine = dayRows.find((r) => r.user_id === myId)?.level;
        return (
          <section key={iso} className={`day ${iso === today ? "today" : ""} ${past ? "past" : ""}`}>
            <article className="card optin">
              <h2>
                {dayLabel(d)}
                {iso === today && <span className="pill">Today</span>}
              </h2>
              <div className="muted small">
                {COURT_TIME_LABEL} · {RYVL_PLACE}
              </div>

              {!past && (
                <div className="ryvl-levels">
                  {RYVL_LEVELS.map((l) => {
                    const count = dayRows.filter((r) => r.level === l.level).length;
                    return (
                      <button
                        key={l.level}
                        className={mine === l.level ? "on" : ""}
                        disabled={!fits(l.level)}
                        onClick={() => pick(iso, l.level)}
                      >
                        {mine === l.level ? `✓ ${l.label}` : l.label}
                        <small>
                          {!fits(l.level) ? "Not your level" : mine === l.level ? "You're signed up" : `${count} signed up`}
                        </small>
                      </button>
                    );
                  })}
                </div>
              )}

              {RYVL_LEVELS.map((l) => {
                const ids = dayRows.filter((r) => r.level === l.level).map((r) => r.user_id);
                if (!ids.length) return null;
                const playing = onFullCourt(ids);
                const waiting = ids.slice(playing.length);
                return (
                  <div key={l.level} className="ryvl-level">
                    <h3>RYVL {l.label}</h3>
                    <div className="players">
                      {playing.length > 0 && (
                        <div className="player-group">
                          <div className="group-label on">
                            {past ? "Played" : `${playing.length / COURT_SIZE} ${playing.length === COURT_SIZE ? "court" : "courts"}`} ·{" "}
                            {playing.length}
                          </div>
                          <div className="roster">
                            {playing.map((id, i) => (
                              <Player key={id} id={id} n={i + 1} name={firstName(id)} />
                            ))}
                          </div>
                        </div>
                      )}
                      {waiting.length > 0 && (
                        <div className="player-group">
                          <div className="group-label wait">
                            {past
                              ? "Waitlist, court didn't open"
                              : `Waitlist · ${COURT_SIZE - waiting.length} more opens ${playing.length ? "another" : "the first"} court`}
                          </div>
                          <div className="roster">
                            {waiting.map((id, i) => (
                              <Player key={id} id={id} n={playing.length + i + 1} name={firstName(id)} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {past && dayRows.length === 0 && <p className="court-status done">Nobody signed up</p>}
            </article>
          </section>
        );
      })}

      <button className="btn ghost full" onClick={() => setSunday(addDays(sunday, 7))}>
        Next week ›
      </button>
    </main>
  );

  function Player({ id, n, name }: { id: string; n: number; name: string }) {
    return (
      <Link href={`/members?u=${id}`} className="roster-item">
        <span className="order-wrap">
          <Avatar profile={members[id]} size={36} />
          <span className="order">{n}</span>
        </span>
        <span>{name}</span>
      </Link>
    );
  }
}

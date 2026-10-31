"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";
import type { Session, Signup } from "@/lib/types";
import { addDays, dayLabel, formatTime, rangeLabel, startOfWeek, toISODate, weekDays } from "@/lib/dates";

export default function WeekPage() {
  const { auth, members } = useAuth();
  const myId = auth!.user.id;
  const [sunday, setSunday] = useState(() => startOfWeek(new Date()));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [adding, setAdding] = useState<string | null>(null); // date being added to
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const todayRef = useRef<HTMLElement>(null);

  const days = useMemo(() => weekDays(sunday), [sunday]);
  const from = toISODate(days[0]);
  const to = toISODate(days[days.length - 1]);
  const today = toISODate(new Date());

  const load = useCallback(async () => {
    const { data: s } = await supabase
      .from("sessions")
      .select("*")
      .gte("play_date", from)
      .lte("play_date", to)
      .order("start_time");
    const list = (s ?? []) as Session[];
    setSessions(list);
    if (list.length) {
      const { data: su } = await supabase
        .from("signups")
        .select("*")
        .in(
          "session_id",
          list.map((x) => x.id),
        )
        .order("created_at");
      setSignups((su ?? []) as Signup[]);
    } else setSignups([]);
    setLoaded(true);
  }, [from, to]);

  // Open on today instead of days that already happened.
  useEffect(() => {
    if (loaded) todayRef.current?.scrollIntoView({ block: "start" });
  }, [loaded]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`week-${from}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "signups" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [from, load]);

  async function toggle(s: Session, joined: boolean) {
    setError(null);
    const res = joined
      ? await supabase.from("signups").delete().match({ session_id: s.id, user_id: myId })
      : await supabase.from("signups").insert({ session_id: s.id, user_id: myId });
    if (res.error) setError(res.error.message);
    load();
  }

  async function remove(s: Session) {
    if (!confirm("Delete this court time? Everyone signed up will be removed.")) return;
    await supabase.from("sessions").delete().eq("id", s.id);
    load();
  }

  return (
    <main className="page">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setSunday(addDays(sunday, -7))} aria-label="Previous week">
          ‹
        </button>
        <div className="topbar-title">
          <h1>Courts</h1>
          <span className="muted">{rangeLabel(days[0], days[days.length - 1])}</span>
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
        const daySessions = sessions.filter((s) => s.play_date === iso);
        const past = iso < today;
        return (
          <section key={iso} ref={iso === today ? todayRef : undefined} className={`day ${iso === today ? "today" : ""} ${past ? "past" : ""}`}>
            <div className="day-head">
              <h2>
                {dayLabel(d)}
                {iso === today && <span className="pill">Today</span>}
              </h2>
              {!past && (
                <button className="link-btn" onClick={() => setAdding(iso)}>
                  + Add time
                </button>
              )}
            </div>

            {daySessions.length === 0 && <p className="muted small">No court time posted.</p>}

            {daySessions.map((s) => {
              const who = signups.filter((x) => x.session_id === s.id);
              const joined = who.some((x) => x.user_id === myId);
              const full = who.length >= s.capacity;
              return (
                <article key={s.id} className="session card">
                  <div className="session-top">
                    <div>
                      <div className="session-time">
                        {formatTime(s.start_time)}
                        {s.end_time ? ` – ${formatTime(s.end_time)}` : ""}
                      </div>
                      {s.location && <div className="muted">📍 {s.location}</div>}
                      {s.notes && <div className="small">{s.notes}</div>}
                    </div>
                    <div className={`spots ${full ? "full" : ""}`}>
                      {who.length}/{s.capacity}
                      <small>{full ? "full" : `${s.capacity - who.length} open`}</small>
                    </div>
                  </div>

                  {who.length > 0 && (
                    <div className="roster">
                      {who.map((x) => (
                        <Link key={x.user_id} href={`/members?u=${x.user_id}`} className="roster-item">
                          <Avatar profile={members[x.user_id]} size={32} />
                          <span>{members[x.user_id]?.full_name.split(" ")[0] || "Member"}</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  <div className="session-actions">
                    {!past && (
                      <button
                        className={`btn ${joined ? "ghost" : "primary"}`}
                        disabled={!joined && full}
                        onClick={() => toggle(s, joined)}
                      >
                        {joined ? "Drop out" : full ? "Full" : "I'm in"}
                      </button>
                    )}
                    <Link className="btn ghost" href={`/chat/${s.id}`}>
                      💬 Chat
                    </Link>
                    {s.created_by === myId && (
                      <button className="btn ghost danger" onClick={() => remove(s)}>
                        Delete
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}

      {adding && <AddSession date={adding} onClose={() => setAdding(null)} onSaved={load} />}
    </main>
  );
}

function AddSession({ date, onClose, onSaved }: { date: string; onClose: () => void; onSaved: () => void }) {
  const { auth } = useAuth();
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("20:00");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState(8);
  const [notes, setNotes] = useState("");
  const [joinMe, setJoinMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        play_date: date,
        start_time: start,
        end_time: end || null,
        location: location.trim(),
        capacity,
        notes: notes.trim() || null,
        created_by: auth!.user.id,
      })
      .select()
      .single();
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    if (joinMe && data) await supabase.from("signups").insert({ session_id: data.id, user_id: auth!.user.id });
    onSaved();
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet form" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>Add court time</h2>
        <p className="muted">{dayLabel(new Date(date + "T00:00:00"))}</p>
        <div className="row">
          <label>
            Start
            <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            End
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <label>
          Where
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Riverside Park, courts 3–4" />
        </label>
        <label>
          Spots
          <input type="number" min={1} max={64} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
        </label>
        <label>
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Open play, all levels" />
        </label>
        <label className="check">
          <input type="checkbox" checked={joinMe} onChange={(e) => setJoinMe(e.target.checked)} />
          Sign me up too
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            Post it
          </button>
        </div>
      </form>
    </div>
  );
}

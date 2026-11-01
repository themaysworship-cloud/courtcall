"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cached, remember } from "@/lib/cache";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";
import type { Message, Reaction } from "@/lib/types";
import { reportChatMessage } from "@/lib/push";
import { shrinkImage } from "@/lib/image";
import { COURT_TIME_LABEL } from "@/lib/config";
import { dayLabel, fromISODate, messageTime, toISODate } from "@/lib/dates";

const GROUP_GAP_MS = 5 * 60 * 1000;
const EMOJIS = ["👍", "❤️", "😂", "🔥", "🙌", "😮"];
const LONG_PRESS_MS = 420;

export default function ChatPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}

function Chat() {
  const room = useSearchParams().get("room") || "general";
  const { auth, members } = useAuth();
  const myId = auth!.user.id;
  const [messages, setMessagesState] = useState<Message[]>(() => cached<Message[]>(`chat:${room}`) ?? []);
  const setMessages = (next: Message[] | ((prev: Message[]) => Message[])) =>
    setMessagesState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      remember(`chat:${room}`, value.filter((m) => m.id > 0));
      return value;
    });
  const [upcoming, setUpcoming] = useState<string[]>(() => cached<string[]>("chat:upcoming") ?? []); // dates I'm in for
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [menuFor, setMenuFor] = useState<Message | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    setMessagesState(cached<Message[]>(`chat:${room}`) ?? []);
    supabase
      .from("messages")
      .select("*")
      .eq("room", room)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(async ({ data }) => {
        if (!alive || !data) return;
        const list = (data as Message[]).reverse();
        setMessages(list);
        if (list.length) {
          const { data: r } = await supabase
            .from("message_reactions")
            .select("message_id, user_id, emoji")
            .in(
              "message_id",
              list.map((m) => m.id),
            );
          if (alive) setReactions((r ?? []) as Reaction[]);
        } else setReactions([]);
      });

    const ch = supabase
      .channel(`room-${room}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room=eq.${room}` },
        (p) => {
          const m = p.new as Message;
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            // Replace my own "sending" copy if this is the saved version of it.
            const temp = prev.findIndex((x) => x.id < 0 && x.user_id === m.user_id && x.body === m.body);
            if (temp >= 0) return [...prev.slice(0, temp), m, ...prev.slice(temp + 1)];
            return [...prev, m];
          });
        },
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
        const id = (p.old as Partial<Message>).id;
        setMessages((prev) => prev.filter((x) => x.id !== id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (p) => {
        const r = (p.eventType === "DELETE" ? p.old : p.new) as Reaction;
        setReactions((prev) => {
          const rest = prev.filter((x) => !(x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji));
          return p.eventType === "DELETE" ? rest : [...rest, r];
        });
      })
      .subscribe();

    if (room === "general") {
      // Day chats for the days ahead that I've said I'm in for.
      supabase
        .from("day_rsvps")
        .select("play_date")
        .eq("user_id", myId)
        .eq("status", "in")
        .gte("play_date", toISODate(new Date()))
        .order("play_date")
        .limit(6)
        .then(({ data }) => alive && setUpcoming(remember("chat:upcoming", (data ?? []).map((r) => r.play_date as string))));
    }

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [room, myId]);

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e?: React.FormEvent, photo?: File) {
    e?.preventDefault();
    const body = text.trim();
    if (!body && !photo) return;
    setError(null);
    setText("");
    inputRef.current?.focus();
    // Show it right away; swap in the saved copy when the server answers.
    const tempId = -Date.now();
    const preview = photo ? URL.createObjectURL(photo) : null;
    const temp: Message = { id: tempId, room, user_id: myId, body, image_url: preview, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, temp]);
    let image_url: string | null = null;
    if (photo) {
      const blob = await shrinkImage(photo, 1280).catch(() => photo);
      const path = `${myId}/${Date.now()}.jpg`;
      const up = await supabase.storage
        .from("chat")
        .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (up.error) {
        setError(up.error.message);
        setMessages((prev) => prev.filter((x) => x.id !== tempId));
        return;
      }
      image_url = supabase.storage.from("chat").getPublicUrl(path).data.publicUrl;
    }
    const { data, error } = await supabase
      .from("messages")
      .insert({ room, user_id: myId, body, ...(image_url ? { image_url } : {}) })
      .select()
      .single();
    if (error) {
      setError(error.message);
      setText(body);
      setMessages((prev) => prev.filter((x) => x.id !== tempId));
    } else {
      reportChatMessage(data.id);
      setMessages((prev) => {
        const without = prev.filter((x) => x.id !== tempId);
        return without.some((x) => x.id === data.id) ? without : [...without, data as Message];
      });
    }
  }

  async function toggleReaction(m: Message, emoji: string) {
    setMenuFor(null);
    if (m.id < 0) return;
    navigator.vibrate?.(8);
    const has = reactions.some((r) => r.message_id === m.id && r.user_id === myId && r.emoji === emoji);
    const row = { message_id: m.id, user_id: myId, emoji };
    setReactions((prev) =>
      has
        ? prev.filter((r) => !(r.message_id === m.id && r.user_id === myId && r.emoji === emoji))
        : [...prev, row],
    );
    const { error } = has
      ? await supabase.from("message_reactions").delete().match(row)
      : await supabase.from("message_reactions").insert(row);
    if (error) setError(error.message);
  }

  function pressStart(m: Message) {
    pressTimer.current = setTimeout(() => {
      navigator.vibrate?.(10);
      setMenuFor(m);
    }, LONG_PRESS_MS);
  }
  function pressEnd() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  async function del(m: Message) {
    setMenuFor(null);
    if (!confirm("Delete this message?")) return;
    await supabase.from("messages").delete().eq("id", m.id);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  }

  const dayDate = room.startsWith("day-") ? room.slice(4) : null;
  const title = room === "general" ? "Group chat" : dayDate ? dayLabel(fromISODate(dayDate)) : "Court chat";

  return (
    <main className="chat">
      <header className="chat-head">
        {room !== "general" && (
          <Link href="/week" className="icon-btn" aria-label="Back to courts">
            ‹
          </Link>
        )}
        <div>
          <h1>{title}</h1>
          {dayDate && <span className="muted small">{COURT_TIME_LABEL} court chat</span>}
          {room === "general" && <span className="muted small">Everyone in the group</span>}
        </div>
      </header>

      {room === "general" && upcoming.length > 0 && (
        <div className="chips">
          {upcoming.map((d) => (
            <Link key={d} href={`/chat?room=day-${d}`} className="chip">
              {fromISODate(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </Link>
          ))}
        </div>
      )}

      <div className="messages">
        {messages.length === 0 && <p className="muted center-text">No messages yet. Say hi 👋</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const mine = m.user_id === myId;
          const startsGroup =
            !prev ||
            prev.user_id !== m.user_id ||
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > GROUP_GAP_MS;
          const endsGroup =
            !next ||
            next.user_id !== m.user_id ||
            new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > GROUP_GAP_MS;
          const showDay = !prev || toISODate(new Date(prev.created_at)) !== toISODate(new Date(m.created_at));
          const author = members[m.user_id];
          return (
            <div key={m.id}>
              {showDay && <div className="day-divider">{dayLabel(new Date(m.created_at))}</div>}
              <div
                className={`msg ${mine ? "mine" : ""} ${startsGroup ? "first" : ""} ${endsGroup ? "last" : ""} ${m.id < 0 ? "sending" : ""}`}
              >
                {!mine && (
                  <div className="msg-avatar">
                    {endsGroup && (
                      <Link href={`/members?u=${m.user_id}`}>
                        <Avatar profile={author} size={30} />
                      </Link>
                    )}
                  </div>
                )}
                <div className="msg-col">
                  {startsGroup && !mine && <div className="msg-name">{author?.full_name || "Member"}</div>}
                  <div
                    className={`bubble ${m.image_url ? "has-img" : ""}`}
                    title={messageTime(m.created_at)}
                    onPointerDown={() => pressStart(m)}
                    onPointerUp={pressEnd}
                    onPointerLeave={pressEnd}
                    onPointerCancel={pressEnd}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      pressEnd();
                      setMenuFor(m);
                    }}
                    onDoubleClick={() => toggleReaction(m, "👍")}
                  >
                    {m.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="chat-img"
                        src={m.image_url}
                        alt="Photo"
                        loading="lazy"
                        onClick={() => m.image_url && setViewing(m.image_url)}
                      />
                    )}
                    {m.body && <span className="bubble-text">{m.body}</span>}
                  </div>
                  <ReactionPills
                    list={reactions.filter((r) => r.message_id === m.id)}
                    myId={myId}
                    onToggle={(e) => toggleReaction(m, e)}
                  />
                  {endsGroup && <div className="msg-time">{messageTime(m.created_at)}</div>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={send}>
        {error && <p className="error">{error}</p>}
        <button type="button" className="photo-send" aria-label="Send a photo" onClick={() => fileRef.current?.click()}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="15" rx="3" />
            <circle cx="12" cy="12.5" r="3.5" />
            <path d="M8 5l1.5-2h5L16 5" />
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) send(undefined, f);
          }}
        />
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          placeholder="Message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="send" disabled={!text.trim()} aria-label="Send">
          ➤
        </button>
      </form>
      {menuFor && (
        <div className="sheet-backdrop" onClick={() => setMenuFor(null)}>
          <div className="sheet msg-menu" onClick={(e) => e.stopPropagation()}>
            <div className="emoji-row">
              {EMOJIS.map((e) => {
                const on = reactions.some((r) => r.message_id === menuFor.id && r.user_id === myId && r.emoji === e);
                return (
                  <button key={e} className={on ? "on" : ""} onClick={() => toggleReaction(menuFor, e)}>
                    {e}
                  </button>
                );
              })}
            </div>
            {menuFor.body && (
              <button
                className="menu-item"
                onClick={() => {
                  navigator.clipboard?.writeText(menuFor.body).catch(() => {});
                  setMenuFor(null);
                }}
              >
                Copy text
              </button>
            )}
            {menuFor.user_id === myId && menuFor.id > 0 && (
              <button className="menu-item danger" onClick={() => del(menuFor)}>
                Delete message
              </button>
            )}
            <button className="menu-item" onClick={() => setMenuFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {viewing && (
        <div className="viewer" onClick={() => setViewing(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing} alt="Photo" />
        </div>
      )}
    </main>
  );
}

function ReactionPills({
  list,
  myId,
  onToggle,
}: {
  list: Reaction[];
  myId: string;
  onToggle: (emoji: string) => void;
}) {
  if (!list.length) return null;
  const counts = new Map<string, { n: number; mine: boolean }>();
  list.forEach((r) => {
    const c = counts.get(r.emoji) ?? { n: 0, mine: false };
    counts.set(r.emoji, { n: c.n + 1, mine: c.mine || r.user_id === myId });
  });
  return (
    <div className="reactions">
      {[...counts.entries()].map(([emoji, c]) => (
        <button key={emoji} className={`reaction ${c.mine ? "mine" : ""}`} onClick={() => onToggle(emoji)}>
          {emoji}
          {c.n > 1 && <span>{c.n}</span>}
        </button>
      ))}
    </div>
  );
}

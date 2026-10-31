"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";
import type { Message } from "@/lib/types";
import { COURT_TIME_LABEL } from "@/lib/config";
import { dayLabel, fromISODate, messageTime, toISODate } from "@/lib/dates";

const GROUP_GAP_MS = 5 * 60 * 1000;

export default function ChatPage() {
  const { room } = useParams<{ room: string }>();
  const { auth, members } = useAuth();
  const myId = auth!.user.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [upcoming, setUpcoming] = useState<string[]>([]); // dates I'm in for
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("messages")
      .select("*")
      .eq("room", room)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => alive && setMessages(((data ?? []) as Message[]).reverse()));

    const ch = supabase
      .channel(`room-${room}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room=eq.${room}` },
        (p) => {
          const m = p.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
        const id = (p.old as Partial<Message>).id;
        setMessages((prev) => prev.filter((x) => x.id !== id));
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
        .then(({ data }) => alive && setUpcoming((data ?? []).map((r) => r.play_date as string)));
    }

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [room, myId]);

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const { data, error } = await supabase
      .from("messages")
      .insert({ room, user_id: myId, body })
      .select()
      .single();
    if (error) setError(error.message);
    else {
      setText("");
      setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message]));
    }
    setSending(false);
    inputRef.current?.focus();
  }

  async function del(m: Message) {
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
            <Link key={d} href={`/chat/day-${d}`} className="chip">
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
              <div className={`msg ${mine ? "mine" : ""} ${startsGroup ? "first" : ""} ${endsGroup ? "last" : ""}`}>
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
                  <div className="bubble" onDoubleClick={() => mine && del(m)} title={messageTime(m.created_at)}>
                    {m.body}
                  </div>
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
        <button className="send" disabled={!text.trim() || sending} aria-label="Send">
          ➤
        </button>
      </form>
    </main>
  );
}

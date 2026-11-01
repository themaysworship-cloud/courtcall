"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";

export function NotificationsCard({ userId }: { userId: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { me, refreshMembers } = useAuth();
  const chatOn = me?.chat_alerts !== false;

  async function setChat(on: boolean) {
    await supabase.from("profiles").update({ chat_alerts: on }).eq("id", userId);
    refreshMembers();
  }

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  if (!state || state === "not-configured") return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      setState(state === "on" ? await disablePush() : await enablePush(userId));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="card notif">
      <div className="notif-row">
        <div>
          <strong>Notifications</strong>
          <div className="muted small">
            Court alerts when your court fills or someone drops out, plus new chat messages.
          </div>
        </div>
        {(state === "on" || state === "off") && (
          <button className={`btn ${state === "on" ? "ghost" : "primary"}`} disabled={busy} onClick={toggle}>
            {state === "on" ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>
      {state === "on" && (
        <>
          <p className="notice">✓ On for this device</p>
          <label className="check notif-chat">
            <input type="checkbox" checked={chatOn} onChange={(e) => setChat(e.target.checked)} />
            Also notify me about chat messages
          </label>
        </>
      )}
      {state === "needs-install" && (
        <p className="small">
          On iPhone, first add Court Call to your home screen: tap the Share button, then <b>Add to Home Screen</b>. Open it
          from there and turn alerts on here.
        </p>
      )}
      {state === "blocked" && (
        <p className="small">Notifications are blocked for this app. Turn them on in your phone&apos;s settings, then come back.</p>
      )}
      {state === "unsupported" && <p className="small muted">This browser can&apos;t show notifications.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

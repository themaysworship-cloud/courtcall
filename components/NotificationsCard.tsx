"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";

export function NotificationsCard({ userId }: { userId: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <strong>Court alerts</strong>
          <div className="muted small">Get a notification when your court fills, or when someone drops out of a day you&apos;re in for.</div>
        </div>
        {(state === "on" || state === "off") && (
          <button className={`btn ${state === "on" ? "ghost" : "primary"}`} disabled={busy} onClick={toggle}>
            {state === "on" ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>
      {state === "on" && <p className="notice">✓ On for this device</p>}
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

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { peekPendingInvite } from "@/lib/invite";

/** The group's name. Tapping it opens the group picker when there is more than one group (or for the owner). */
export function GroupSwitcher({ className = "" }: { className?: string }) {
  const { group, groups, isOwner } = useAuth();
  const [open, setOpen] = useState(false);
  if (!group) return null;
  const canSwitch = groups.length > 1 || isOwner;
  return (
    <>
      <button
        type="button"
        className={`group-switch ${canSwitch ? "" : "static"} ${className}`}
        onClick={() => canSwitch && setOpen(true)}
        aria-label={canSwitch ? "Switch group" : undefined}
      >
        {group.name}
        {canSwitch && <span className="caret">▾</span>}
      </button>
      {open && <GroupSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function GroupSheet({ onClose }: { onClose: () => void }) {
  const { group, groups, isOwner, switchGroup, refreshGroups } = useAuth();
  const [mode, setMode] = useState<"list" | "join" | "create">("list");
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {mode === "list" && (
          <>
            <h2>Your groups</h2>
            <ul className="group-list">
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    className={`group-row ${g.id === group?.id ? "on" : ""}`}
                    onClick={() => {
                      switchGroup(g.id);
                      onClose();
                    }}
                  >
                    <span>{g.name}</span>
                    {g.id === group?.id && <span className="check">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="sheet-actions">
              <button className="btn ghost" onClick={() => setMode("join")}>
                Join with a code
              </button>
              {isOwner && (
                <button className="btn primary" onClick={() => setMode("create")}>
                  + New group
                </button>
              )}
            </div>
          </>
        )}
        {mode === "join" && <JoinForm onDone={onClose} onBack={() => setMode("list")} />}
        {mode === "create" && (
          <CreateForm
            onBack={() => setMode("list")}
            onDone={async (id) => {
              await refreshGroups();
              switchGroup(id);
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}

function JoinForm({ onDone, onBack }: { onDone?: () => void; onBack?: () => void }) {
  const { joinGroup } = useAuth();
  const [code, setCode] = useState(() => peekPendingInvite() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await joinGroup(code);
      onDone?.();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }
  return (
    <form className="form" onSubmit={submit}>
      <h2>Join a group</h2>
      <label>
        Invite code
        <input
          required
          className="code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
        />
        <small className="muted">It&apos;s the 6 letters at the end of the invite link.</small>
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? "Joining…" : "Join group"}
      </button>
      {onBack && (
        <button type="button" className="link-btn" onClick={onBack}>
          ‹ Back
        </button>
      )}
    </form>
  );
}

function CreateForm({ onDone, onBack }: { onDone: (id: string) => void; onBack: () => void }) {
  const [name, setName] = useState("");
  const [ryvl, setRyvl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_group", { group_name: name.trim(), ryvl });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    onDone(data as string);
  }
  return (
    <form className="form" onSubmit={submit}>
      <h2>New group</h2>
      <label>
        Group name
        <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tuesday crew" />
      </label>
      <label className="check-row">
        <input type="checkbox" checked={ryvl} onChange={(e) => setRyvl(e.target.checked)} />
        <span>Show RYVL sign-up in this group</span>
      </label>
      <p className="muted small">
        It gets its own courts (Mon to Sat, 5–7am), chat and member list. Share its invite link from the Members tab.
      </p>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? "Creating…" : "Create group"}
      </button>
      <button type="button" className="link-btn" onClick={onBack}>
        ‹ Back
      </button>
    </form>
  );
}

/** Shown to someone who is signed in but isn't in any group yet. */
export function JoinScreen() {
  return (
    <main className="page center login">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={72} height={72} />
        <h1>Court Call</h1>
        <p className="muted">Enter the invite code from your group&apos;s link to get started.</p>
      </div>
      <div className="card form-wrap">
        <JoinForm />
      </div>
      <button className="link-btn" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";
import { NotificationsCard } from "@/components/NotificationsCard";

const LEVELS = ["Beginner", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0+"];

export default function ProfilePage() {
  const { auth, me, refreshMembers } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [skill, setSkill] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!me) return;
    setFullName(me.full_name);
    setPhone(me.phone);
    setSkill(me.skill_level ?? "");
    setBio(me.bio ?? "");
  }, [me]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), phone: phone.trim(), skill_level: skill || null, bio: bio.trim() || null })
      .eq("id", auth!.user.id);
    setStatus(error ? error.message : "Saved");
    await refreshMembers();
    setBusy(false);
  }

  async function uploadPhoto(file: File) {
    setBusy(true);
    setStatus("Uploading photo…");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${auth!.user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setStatus(error.message);
      setBusy(false);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", auth!.user.id);
    await refreshMembers();
    setStatus("Photo updated");
    setBusy(false);
  }

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbar-title">
          <h1>My profile</h1>
          <span className="muted">{auth?.user.email}</span>
        </div>
      </header>

      <div className="photo-edit">
        <button type="button" className="photo-btn" onClick={() => fileRef.current?.click()} aria-label="Change photo">
          <Avatar profile={me} size={120} />
          <span className="photo-badge">📷</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
        />
      </div>

      <form className="card form" onSubmit={save}>
        <label>
          Full name
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>
          Cell phone
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
          <small className="muted">Visible to everyone in the group.</small>
        </label>
        <label>
          Skill level
          <select value={skill} onChange={(e) => setSkill(e.target.value)}>
            <option value="">Not set</option>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label>
          About me
          <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Lefty, loves to dink" />
        </label>
        {status && <p className="notice">{status}</p>}
        <button className="btn primary" disabled={busy}>
          Save
        </button>
      </form>

      <NotificationsCard userId={auth!.user.id} />

      <button className="btn ghost danger full" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </main>
  );
}

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim(), phone: phone.trim() } },
      });
      if (error) setError(error.message);
      else if (!data.session) setNotice("Check your email to confirm your account, then sign in.");
    }
    setBusy(false);
  }

  return (
    <main className="page center login">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={72} height={72} />
        <h1>Dink</h1>
        <p className="muted">Court signups and chat for your pickleball group</p>
      </div>

      <form className="card form" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === "signin" ? "on" : ""} onClick={() => setMode("signin")}>
            Sign in
          </button>
          <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>
            Create account
          </button>
        </div>

        {mode === "signup" && (
          <>
            <label>
              Full name
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            </label>
            <label>
              Cell phone
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                placeholder="(555) 123-4567"
              />
              <small className="muted">Other members can see this so you can text outside the app.</small>
            </label>
          </>
        )}
        <label>
          Email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>
          Password
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </label>

        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <button className="btn primary" disabled={busy}>
          {busy ? "One sec…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </main>
  );
}

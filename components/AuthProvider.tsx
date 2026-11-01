"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cached, clearCache, remember } from "@/lib/cache";

type Ctx = {
  ready: boolean;
  auth: AuthSession | null;
  me: Profile | null;
  members: Record<string, Profile>;
  refreshMembers: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({
  ready: false,
  auth: null,
  me: null,
  members: {},
  refreshMembers: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [members, setMembers] = useState<Record<string, Profile>>({});

  const refreshMembers = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    const map: Record<string, Profile> = {};
    if (!data) return;
    data.forEach((p) => (map[p.id] = p as Profile));
    setMembers(remember("members", map));
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setAuth(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") clearCache();
      setAuth(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Refetch members only when the signed-in person changes, not on every token refresh.
  const userId = auth?.user.id;
  useEffect(() => {
    if (userId) {
      setMembers((m) => (Object.keys(m).length ? m : (cached<Record<string, Profile>>("members") ?? {})));
      refreshMembers();
    } else setMembers({});
  }, [userId, refreshMembers]);

  const me = auth ? members[auth.user.id] ?? null : null;

  return (
    <AuthContext.Provider value={{ ready, auth, me, members, refreshMembers }}>
      {children}
    </AuthContext.Provider>
  );
}

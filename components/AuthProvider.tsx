"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Group, Profile } from "@/lib/types";
import { cached, clearCache, remember } from "@/lib/cache";
import { takePendingInvite, savePendingInvite, inviteFromPath } from "@/lib/invite";

type Ctx = {
  ready: boolean;
  auth: AuthSession | null;
  me: Profile | null;
  /** Members of the group I'm looking at. */
  members: Record<string, Profile>;
  refreshMembers: () => Promise<void>;
  groups: Group[];
  group: Group | null;
  groupsLoaded: boolean;
  isOwner: boolean;
  switchGroup: (id: string) => void;
  refreshGroups: () => Promise<Group[]>;
  joinGroup: (code: string) => Promise<string | null>;
};

const AuthContext = createContext<Ctx>({
  ready: false,
  auth: null,
  me: null,
  members: {},
  refreshMembers: async () => {},
  groups: [],
  group: null,
  groupsLoaded: false,
  isOwner: false,
  switchGroup: () => {},
  refreshGroups: async () => [],
  joinGroup: async () => null,
});

export function useAuth() {
  return useContext(AuthContext);
}

const GROUP_KEY = "cc-group";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [members, setMembers] = useState<Record<string, Profile>>({});
  const [groups, setGroups] = useState<Group[]>(() => cached<Group[]>("groups") ?? []);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(GROUP_KEY),
  );
  const [isOwner, setIsOwner] = useState(false);
  const userId = auth?.user.id;

  const group = groups.find((g) => g.id === groupId) ?? groups[0] ?? null;

  const switchGroup = useCallback((id: string) => {
    localStorage.setItem(GROUP_KEY, id);
    setGroupId(id);
  }, []);

  const refreshGroups = useCallback(async () => {
    if (!userId) return [];
    const { data: mine, error } = await supabase.from("group_members").select("group_id").eq("user_id", userId);
    if (error) return groups; // offline or a hiccup: keep what we have
    const ids = (mine ?? []).map((r) => r.group_id as string);
    let list: Group[] = [];
    if (ids.length) {
      const { data } = await supabase.from("groups").select("*").in("id", ids).order("created_at");
      list = (data ?? []) as Group[];
    }
    setGroups(remember("groups", list));
    setGroupsLoaded(true);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const gid = group?.id;
  const refreshMembers = useCallback(async () => {
    if (!userId) return;
    const { data: mine } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (mine) setMe(remember("me", mine as Profile));
    if (!gid) return;
    const { data: rows } = await supabase.from("group_members").select("user_id").eq("group_id", gid);
    const ids = (rows ?? []).map((r) => r.user_id as string);
    if (!ids.length) return;
    const { data } = await supabase.from("profiles").select("*").in("id", ids).order("full_name");
    if (!data) return;
    const map: Record<string, Profile> = {};
    data.forEach((p) => (map[p.id] = p as Profile));
    setMembers(remember(`members:${gid}`, map));
  }, [userId, gid]);

  const joinGroup = useCallback(
    async (code: string) => {
      const { data, error } = await supabase.rpc("join_group", { code });
      if (error) throw new Error(error.message);
      const id = data as string;
      await refreshGroups();
      switchGroup(id);
      return id;
    },
    [refreshGroups, switchGroup],
  );

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    // Opened from an invite link: keep the code until the person is signed in.
    const code = inviteFromPath(window.location.pathname);
    if (code) savePendingInvite(code);
    // Opened from a notification for a certain group: switch to it.
    const g = new URLSearchParams(window.location.search).get("g");
    if (g) {
      localStorage.setItem(GROUP_KEY, g);
      setGroupId(g);
    }
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
      if (event === "SIGNED_OUT") {
        clearCache();
        localStorage.removeItem(GROUP_KEY);
        setGroups([]);
        setGroupsLoaded(false);
        setMe(null);
        setIsOwner(false);
      }
      setAuth(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // When the signed-in person changes: use any pending invite, then load their groups.
  useEffect(() => {
    if (!userId) {
      setMembers({});
      return;
    }
    setMe((m) => m ?? cached<Profile>("me") ?? null);
    (async () => {
      const code = takePendingInvite();
      if (code) {
        const { data } = await supabase.rpc("join_group", { code });
        if (data) {
          localStorage.setItem(GROUP_KEY, data as string);
          setGroupId(data as string);
        }
      }
      await refreshGroups();
      const { data: owner } = await supabase.from("app_owners").select("user_id").eq("user_id", userId).maybeSingle();
      setIsOwner(Boolean(owner));
    })();
  }, [userId, refreshGroups]);

  // Members of the group I'm looking at.
  useEffect(() => {
    if (!userId || !gid) return;
    setMembers(cached<Record<string, Profile>>(`members:${gid}`) ?? {});
    refreshMembers();
  }, [userId, gid, refreshMembers]);

  return (
    <AuthContext.Provider
      value={{
        ready,
        auth,
        me,
        members,
        refreshMembers,
        groups,
        group,
        groupsLoaded: groupsLoaded || groups.length > 0,
        isOwner,
        switchGroup,
        refreshGroups,
        joinGroup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

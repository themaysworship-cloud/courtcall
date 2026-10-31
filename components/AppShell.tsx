"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";
import { isConfigured } from "@/lib/supabase";

const TABS = [
  { href: "/week", label: "Courts", icon: "🎾" },
  { href: "/chat/general", label: "Chat", icon: "💬" },
  { href: "/members", label: "Members", icon: "👥" },
  { href: "/profile", label: "Me", icon: "🙂" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, auth } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (!ready || !isConfigured) return;
    if (!auth && !isLogin) router.replace("/login");
    if (auth && (isLogin || pathname === "/")) router.replace("/week");
  }, [ready, auth, isLogin, pathname, router]);

  if (!isConfigured) {
    return (
      <main className="page center">
        <div className="card">
          <h1>Almost there</h1>
          <p>
            Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
            your environment (see the README), then reload.
          </p>
        </div>
      </main>
    );
  }

  if (!ready || (!auth && !isLogin)) return <div className="page center muted">Loading…</div>;
  if (isLogin) return <>{children}</>;

  return (
    <div className="shell">
      <div className="content">{children}</div>
      <nav className="tabbar">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href.split("/").slice(0, 2).join("/"));
          return (
            <Link key={t.href} href={t.href} className={active ? "tab active" : "tab"}>
              <span className="tab-icon">{t.icon}</span>
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

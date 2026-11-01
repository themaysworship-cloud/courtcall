"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";
import { isConfigured } from "@/lib/supabase";
import { ChatIcon, CourtIcon, MeIcon, PeopleIcon } from "./Icons";

const TABS = [
  { href: "/week", label: "Courts", Icon: CourtIcon },
  { href: "/chat", label: "Chat", Icon: ChatIcon },
  { href: "/members", label: "Members", Icon: PeopleIcon },
  { href: "/profile", label: "Me", Icon: MeIcon },
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

  if (!ready || (!auth && !isLogin))
    return (
      <div className="page center splash">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={72} height={72} />
      </div>
    );
  if (isLogin) return <>{children}</>;

  return (
    <div className="shell">
      <div className="content">{children}</div>
      <nav className="tabbar">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href.split("/").slice(0, 2).join("/"));
          return (
            <Link key={t.href} href={t.href} className={active ? "tab active" : "tab"}>
              <t.Icon size={24} />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

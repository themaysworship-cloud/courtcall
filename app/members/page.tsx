"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";
import type { Profile } from "@/lib/types";
import { digitsOnly, formatPhone } from "@/lib/phone";
import { GroupSwitcher } from "@/components/Groups";
import { inviteLink } from "@/lib/invite";

export default function MembersPage() {
  return (
    <Suspense>
      <Members />
    </Suspense>
  );
}

function Members() {
  const { members } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const selected = params.get("u") ? members[params.get("u")!] : null;

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return Object.values(members)
      .filter(
        (p) =>
          !needle ||
          p.full_name.toLowerCase().includes(needle) ||
          (digits.length > 0 && p.phone.replace(/\D/g, "").includes(digits)),
      )
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [members, q]);

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbar-title">
          <h1>Members</h1>
          <GroupSwitcher />
          <span className="muted block">{Object.keys(members).length} members</span>
        </div>
        <InviteButton />
      </header>
      <input className="search" placeholder="Search by name or number" value={q} onChange={(e) => setQ(e.target.value)} />

      <ul className="member-list card">
        {list.map((p) => (
          <li key={p.id}>
            <button className="member-row" onClick={() => router.push(`/members?u=${p.id}`)}>
              <Avatar profile={p} size={44} />
              <div className="member-info">
                <strong>{p.full_name || "New member"}</strong>
                <span className="muted small">
                  {p.phone ? formatPhone(p.phone) : "No phone yet"}
                  {p.skill_level ? ` · ${p.skill_level}` : ""}
                </span>
              </div>
            </button>
            {p.phone && <ContactButtons profile={p} compact />}
          </li>
        ))}
      </ul>

      {selected && (
        <div className="sheet-backdrop" onClick={() => router.push("/members")}>
          <div className="sheet profile-sheet" onClick={(e) => e.stopPropagation()}>
            <Avatar profile={selected} size={112} />
            <h2>{selected.full_name || "New member"}</h2>
            {selected.skill_level && <span className="pill">{selected.skill_level}</span>}
            {selected.bio && <p>{selected.bio}</p>}
            {selected.phone ? (
              <>
                <p className="phone-big">{formatPhone(selected.phone)}</p>
                <ContactButtons profile={selected} />
              </>
            ) : (
              <p className="muted">No phone number added yet.</p>
            )}
            <button className="btn ghost" onClick={() => router.push("/members")}>
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ContactButtons({ profile, compact }: { profile: Profile; compact?: boolean }) {
  const tel = digitsOnly(profile.phone);
  return (
    <div className={compact ? "contact compact" : "contact"}>
      <a className="btn ghost" href={`sms:${tel}`} aria-label={`Text ${profile.full_name}`}>
        💬{compact ? "" : " Text"}
      </a>
      <a className="btn ghost" href={`tel:${tel}`} aria-label={`Call ${profile.full_name}`}>
        📞{compact ? "" : " Call"}
      </a>
    </div>
  );
}

function InviteButton() {
  const { group } = useAuth();
  const [copied, setCopied] = useState(false);
  if (!group) return null;
  async function invite() {
    if (!group) return;
    const url = inviteLink(group.invite_code);
    const text =
      `Join ${group.name} on Court Call! Sign up for the 5–7am courts and chat with everyone. ` +
      `Your invite code is ${group.invite_code}. Open this link on your phone and it'll walk you through adding it to your home screen:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Court Call", text, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
    } catch {
      window.prompt("Copy this invite:", `${text} ${url}`);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return (
    <button className="btn primary invite" onClick={invite}>
      {copied ? "✓ Copied" : "+ Invite"}
    </button>
  );
}

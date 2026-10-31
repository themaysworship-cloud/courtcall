import type { Profile } from "@/lib/types";

const COLORS = ["#2f855a", "#2b6cb0", "#b7791f", "#c53030", "#6b46c1", "#2c7a7b", "#d53f8c"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ profile, size = 40 }: { profile?: Profile | null; size?: number }) {
  const name = profile?.full_name || "?";
  const color = COLORS[(name.charCodeAt(0) || 0) % COLORS.length];
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (profile?.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={profile.avatar_url} alt={name} style={style} />;
  }
  return (
    <span className="avatar" style={{ ...style, background: color }} aria-label={name}>
      {initials(name)}
    </span>
  );
}

// Invite links look like https://courtcallpb.vercel.app/join/ABC123

const KEY = "cc-join";

export function inviteFromPath(path: string): string | null {
  const m = path.match(/^\/join\/([A-Za-z0-9-]{4,12})\/?$/);
  return m ? m[1].toUpperCase() : null;
}

export function savePendingInvite(code: string) {
  try {
    localStorage.setItem(KEY, code);
  } catch {}
}

export function peekPendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function takePendingInvite(): string | null {
  const code = peekPendingInvite();
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return code;
}

export function inviteLink(code: string) {
  return `${window.location.origin}/join/${code}`;
}

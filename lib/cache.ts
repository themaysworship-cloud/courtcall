// Keeps the last data each screen loaded, in memory and on the phone,
// so screens (and app launches) show it instantly while fresh data loads.
const PREFIX = "cc-cache:";
const store = new Map<string, unknown>();

export function cached<T>(key: string): T | undefined {
  if (store.has(key)) return store.get(key) as T;
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return undefined;
    const value = JSON.parse(raw) as T;
    store.set(key, value);
    return value;
  } catch {
    return undefined;
  }
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function remember<T>(key: string, value: T): T {
  store.set(key, value);
  if (typeof window !== "undefined") {
    // Write to storage a moment later so rapid updates don't block taps.
    clearTimeout(pending.get(key));
    pending.set(
      key,
      setTimeout(() => {
        try {
          localStorage.setItem(PREFIX + key, JSON.stringify(value));
        } catch {
          /* storage full or private mode: memory cache still works */
        }
      }, 300),
    );
  }
  return value;
}

/** Clear saved data (on sign out). */
export function clearCache() {
  store.clear();
  if (typeof window === "undefined") return;
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}

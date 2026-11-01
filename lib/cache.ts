// Keeps the last data each screen loaded, so switching tabs shows it instantly
// while fresh data loads in the background.
const store = new Map<string, unknown>();

export function cached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function remember<T>(key: string, value: T): T {
  store.set(key, value);
  return value;
}

/** localStorage that never throws (private mode, blocked storage, SSR/test). */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the app still works for this session */
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  profile: 'jobradar.profile.v1',
  settings: 'jobradar.settings.v1',
  roadmap: 'jobradar.roadmap.v1',
  seenReports: 'jobradar.seenReports.v1',
} as const;

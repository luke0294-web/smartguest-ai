/**
 * Sessione host (login dashboard): stessa struttura e TTL 8h di prima.
 */
export const HOST_SESSION_STORAGE_KEY = "host_session";

export const HOST_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface HostSession {
  email: string;
  sessionToken: string;
  ts: number;
}

export function getHostSession(): HostSession | null {
  try {
    const raw = sessionStorage.getItem(HOST_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as HostSession;
    if (!s.sessionToken || !s.email) {
      sessionStorage.removeItem(HOST_SESSION_STORAGE_KEY);
      return null;
    }
    if (Date.now() - s.ts > HOST_SESSION_TTL_MS) {
      sessionStorage.removeItem(HOST_SESSION_STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearHostSession(): void {
  try {
    sessionStorage.removeItem(HOST_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isSessionValid(): boolean {
  return getHostSession() !== null;
}

export function persistHostSession(email: string, sessionToken: string): void {
  const payload: HostSession = { email, sessionToken, ts: Date.now() };
  sessionStorage.setItem(HOST_SESSION_STORAGE_KEY, JSON.stringify(payload));
}

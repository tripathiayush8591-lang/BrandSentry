export interface AuthSession {
  user: { id: string; kind: 'google' | 'guest'; display_name: string; email: string | null };
  workspace: { id: string; name: string; kind: 'real' | 'demo' };
  role: 'admin' | 'creator' | 'reviewer';
  session: { kind: 'google' | 'guest'; expires_at: string };
  csrf_token: string;
}

/** Phase 2A SQLite timestamps are UTC but /me serializes them without an offset. */
export function sessionExpiryMs(timestamp: string): number {
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) ? timestamp : `${timestamp}Z`);
}

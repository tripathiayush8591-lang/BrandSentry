import type { AuthSession } from '../src/types/auth';

export function demoSession(kind: 'guest' | 'google' = 'guest'): AuthSession {
  return {
    user: { id: `test-${kind}`, kind, display_name: kind === 'guest' ? 'Guest Demo' : 'Test Member', email: kind === 'guest' ? null : 'member@example.test' },
    workspace: { id: `test-workspace-${kind}`, name: 'Test Workspace', kind: kind === 'guest' ? 'demo' : 'real' },
    role: 'admin', session: { kind, expires_at: new Date(Date.now() + 3600000).toISOString().replace('Z', '') },
    csrf_token: 'mock-csrf-value',
  };
}

import { LogOut, UserRound } from 'lucide-react';
import { useAuth } from './auth-context';

export function SessionProfile() {
  const { session, pending, error, logout } = useAuth();
  if (!session) return null;
  const guest = session.user.kind === 'guest';
  return <section className="session-profile" aria-label="Your session">
    <div className="session-profile-inner">
      <UserRound size={20} aria-hidden="true" />
      <div className="session-profile-details"><strong>{session.user.display_name}</strong><span>{guest ? session.workspace.name : `${session.user.email ?? 'Google account'} · ${session.workspace.name}`}</span></div>
      <span className="session-kind">{guest ? 'Guest demo' : 'Google'}</span>
      <button className="session-logout" disabled={pending !== null} onClick={() => { void logout(); }}><LogOut size={16} aria-hidden="true" />{pending === 'logout' ? 'Signing out…' : 'Sign out'}</button>
    </div>
    {guest && <details className="session-notice"><summary>About this demo</summary><p className="session-limit">Temporary demo · Your work stays separate from your Google account.</p></details>}
    {error && <p className="session-error" role="alert">{error}</p>}
  </section>;
}

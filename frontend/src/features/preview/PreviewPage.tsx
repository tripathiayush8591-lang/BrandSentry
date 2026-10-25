import { Outlet } from 'react-router-dom';
import { AuthContext, type AuthState } from '../auth/auth-context';
import { DemoContext } from './demo-context';

// No fake identity: existing components see an anonymous visitor with no session.
const noSession: AuthState = {
  status: 'anonymous', session: null, pending: null, error: null, notice: null,
  signIn: async () => {}, logout: async () => {}, restore: async () => {},
};
export function PreviewPage() {
  return <DemoContext.Provider value={true}><AuthContext.Provider value={noSession}><Outlet /></AuthContext.Provider></DemoContext.Provider>;
}

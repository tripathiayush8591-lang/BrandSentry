import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AuthError, authApi, readCsrfCookie } from '../../services/auth-api';
import { clearGoogleIdentity, googleConfigurationAvailable, googleErrorMessage, googleIdToken } from '../../services/firebase-auth';
import { sessionExpiryMs, type AuthSession } from '../../types/auth';
import { AuthContext, type AuthState } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('restoring');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [pending, setPending] = useState<AuthState['pending']>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const csrf = useRef('');
  const busy = useRef(false);
  const revision = useRef(0);
  const current = useRef<AuthSession | null>(null);
  const invalidate = useCallback(() => { revision.current++; }, []);

  const accept = useCallback((value: AuthSession | null) => {
    current.current = value;
    setSession(value);
    setStatus(value ? 'authenticated' : 'anonymous');
    csrf.current = value ? value.csrf_token || readCsrfCookie() : '';
  }, []);

  const restore = useCallback(async () => {
    if (busy.current) return;
    const version = ++revision.current;
    setStatus('restoring');
    setError(null);
    try {
      const value = await authApi.me();
      if (version !== revision.current) return;
      accept({ ...value, csrf_token: readCsrfCookie() || (current.current?.user.id === value.user.id ? csrf.current : '') });
    } catch (failure) {
      if (version !== revision.current) return;
      if (failure instanceof AuthError && failure.status === 401) {
        if (current.current) setNotice('Your session has ended. Please sign in again.');
        accept(null);
      } else {
        setStatus('unavailable');
        setError(failure instanceof Error ? failure.message : 'Your session could not be checked. Please try again.');
      }
    }
  }, [accept]);

  useEffect(() => {
    void restore();
    const onFocus = () => { if (current.current) void restore(); };
    window.addEventListener('focus', onFocus);
    return () => { invalidate(); window.removeEventListener('focus', onFocus); };
  }, [restore, invalidate]);

  useEffect(() => {
    if (!session) return;
    // Recheck with the server at expiry rather than inventing an authoritative local decision.
    const delay = sessionExpiryMs(session.session.expires_at) - Date.now();
    // Client clock skew must not produce a hot polling loop or override server authority.
    const timer = window.setTimeout(() => { void restore(); }, Math.min(Math.max(delay + 250, 30000), 2147483647));
    return () => window.clearTimeout(timer);
  }, [session, restore]);

  async function signIn(kind: 'google' | 'guest') {
    if (busy.current || status !== 'anonymous') return;
    busy.current = true;
    revision.current++;
    setPending(kind); setError(null); setNotice(null);
    let googleStage = kind === 'google';
    try {
      if (kind === 'google' && !googleConfigurationAvailable()) throw new AuthError('Google sign-in is not configured yet. You can continue as a guest.');
      const token = kind === 'google' ? await googleIdToken() : null;
      googleStage = false;
      const issued = token ? await authApi.google(token) : await authApi.guest();
      csrf.current = issued.csrf_token;
      // A successful response alone is insufficient: verify that the browser retained the cookie.
      const verified = await authApi.me();
      if (issued.user.id !== verified.user.id || issued.workspace.id !== verified.workspace.id) {
        throw new AuthError('Your sign-in changed in another window. Refresh the page before continuing.');
      }
      accept({ ...verified, csrf_token: issued.csrf_token });
    } catch (failure) {
      setError(failure instanceof AuthError ? failure.message : googleStage ? googleErrorMessage(failure) : 'Sign-in could not be confirmed. Please try again.');
      // Reconcile ambiguous network outcomes; never hide a server session behind local state.
      try { accept(await authApi.me()); }
      catch (checkFailure) {
        if (checkFailure instanceof AuthError && checkFailure.status === 401) accept(null);
        else setStatus('unavailable');
      }
    } finally {
      if (kind === 'google') {
        try { await clearGoogleIdentity(); }
        catch { setError('Google’s temporary sign-in state could not be cleared. Close this tab before changing accounts.'); }
      }
      busy.current = false; setPending(null);
    }
  }

  async function logout() {
    if (busy.current || !session) return;
    busy.current = true; revision.current++;
    setPending('logout'); setError(null);
    try {
      try { await authApi.logout(csrf.current || readCsrfCookie()); }
      catch (failure) { if (!(failure instanceof AuthError && failure.status === 401)) throw failure; }
      try {
        await authApi.me();
        throw new AuthError('The server has not ended your session. Please try signing out again.');
      } catch (failure) {
        if (!(failure instanceof AuthError && failure.status === 401)) throw failure;
      }
      accept(null); setNotice('You’re signed out.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign-out could not be confirmed. Please try again.');
      // Session remains visible until the backend confirms revocation.
    } finally { busy.current = false; setPending(null); }
  }

  return <AuthContext.Provider value={{ status, session, pending, error, notice, signIn, logout, restore }}>{children}</AuthContext.Provider>;
}

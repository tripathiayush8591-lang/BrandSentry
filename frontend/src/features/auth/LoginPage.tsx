import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { LoaderCircle, Shield, UserRound } from 'lucide-react';
import { useAuth } from './auth-context';

export function LoginPage() {
  const { status, pending, error, notice, signIn, restore } = useAuth();
  const location = useLocation();
  useEffect(() => { document.title = 'Welcome · BrandSentry'; }, []);
  if (status === 'authenticated') {
    const from: unknown = (location.state as { from?: unknown } | null)?.from;
    const destination = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/login' ? from : '/';
    return <Navigate to={destination} replace />;
  }
  const disabled = pending !== null || status !== 'anonymous';
  return <main className="login-page" id="main-content">
    <section className="login-story" aria-labelledby="story-heading">
      <div className="login-wordmark"><img src="/images/brandsentry-icon.png" alt="" className="brand-icon" /><span>BrandSentry</span></div>
      <div className="story-copy">
        <h1 id="story-heading">Great brands<br /> are built on<br /> trust.</h1>
        <p>Create confidently. Publish responsibly.</p>
      </div>
      <img className="trust-art" src="/images/trust-background.png" alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
    </section>
    <section className="login-controls" aria-labelledby="welcome-heading">
      <div className="login-card">
        <div className="login-emblem" aria-hidden="true"><img src="/images/brandsentry-icon.png" alt="" /></div>
        <h2 id="welcome-heading">Welcome to<br /><span className="brand-wordmark">BrandSentry</span></h2>
        <p className="login-subtitle">Your trusted workspace starts here.</p>
        <div className="login-actions" aria-busy={pending !== null || status === 'restoring'}>
          <button className="auth-button google-button" disabled={disabled} onClick={() => { void signIn('google'); }}>
            {pending === 'google' ? <LoaderCircle className="auth-spinner" aria-hidden="true" /> : <img src="/images/google-g.png" alt="" width="25" height="25" />}
            {pending === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
          </button>
          <button className="auth-button guest-button" disabled={disabled} onClick={() => { void signIn('guest'); }} aria-describedby="guest-description">
            {pending === 'guest' ? <LoaderCircle className="auth-spinner" aria-hidden="true" /> : <UserRound aria-hidden="true" />}
            {pending === 'guest' ? 'Creating your workspace…' : 'Continue as Guest'}
          </button>
        </div>
        {status === 'restoring' && <p className="auth-feedback" role="status">Checking your session…</p>}
        {notice && <p className="auth-feedback" role="status">{notice}</p>}
        {error && <div className="auth-feedback auth-error" role="alert">{error}</div>}
        {status === 'unavailable' && <button className="auth-retry" onClick={() => { void restore(); }}>Retry session check</button>}
        <p className="guest-description"><Link className="auth-button guest-button" to="/preview">Explore Guest Demo</Link><br />Synthetic examples only. No sign-in required.</p>
        <p className="guest-description" id="guest-description">Try a private demo. Your guest workspace is temporary and separate from your Google account.</p>
      </div>
      <p className="login-footnote"><Shield size={13} aria-hidden="true" /> Thoughtful checks. Human decisions.</p>
    </section>
  </main>;
}

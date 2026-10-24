import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth-context';

export function ProtectedRoute() {
  const { status, session, error, restore } = useAuth();
  const location = useLocation();
  if (status === 'restoring') return <main className="session-gate" role="status">Checking your session…</main>;
  if (status === 'unavailable' && !session) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (status === 'unavailable') return <main className="session-gate"><h1>We couldn’t check your session</h1><p role="alert">{error}</p><button className="auth-retry" onClick={() => { void restore(); }}>Retry session check</button></main>;
  if (status === 'anonymous') return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  // Preserve drafts only within the same server-confirmed identity/workspace.
  return <Outlet key={`${session?.user.id}:${session?.workspace.id}:${session?.role}`} />;
}

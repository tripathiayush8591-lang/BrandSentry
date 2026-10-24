import { createContext, useContext } from 'react';
import type { AuthSession } from '../../types/auth';

export interface AuthState {
  status: 'restoring' | 'authenticated' | 'anonymous' | 'unavailable';
  session: AuthSession | null;
  pending: 'google' | 'guest' | 'logout' | null;
  error: string | null;
  notice: string | null;
  signIn: (kind: 'google' | 'guest') => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
}
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}

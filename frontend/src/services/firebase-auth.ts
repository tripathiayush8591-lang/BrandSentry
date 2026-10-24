// Scoped Firebase packages instead of the `firebase` metapackage: BrandSentry
// uses only Google sign-in (no Firestore/Storage), and the metapackage pulled
// the unused Firestore/gRPC dependency chain (4 high npm advisories).
import { getApps, initializeApp } from '@firebase/app';
import { GoogleAuthProvider, browserPopupRedirectResolver, initializeAuth, inMemoryPersistence, signInWithPopup, signOut, type Auth } from '@firebase/auth';

let auth: Auth | undefined;

export function googleConfigurationAvailable(): boolean {
  return [import.meta.env.VITE_FIREBASE_API_KEY, import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    import.meta.env.VITE_FIREBASE_PROJECT_ID, import.meta.env.VITE_FIREBASE_APP_ID]
    .every((value) => typeof value === 'string' && value.trim().length > 0)
    && import.meta.env.VITE_FIREBASE_PROJECT_ID === 'brandsentry-68d05';
}

function getGoogleAuth(): Auth {
  if (!googleConfigurationAvailable()) throw new Error('Google sign-in is not configured yet. You can continue as a guest.');
  if (!auth) {
    const app = getApps().find((app) => app.name === 'brandsentry-auth') ?? initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }, 'brandsentry-auth');
    auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  }
  return auth;
}

// Popup starts directly from the click; no network/configuration await loses user activation.
export async function googleIdToken(): Promise<string> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(getGoogleAuth(), provider);
  return result.user.getIdToken();
}

export async function clearGoogleIdentity(): Promise<void> {
  if (auth) await signOut(auth);
}

export function googleErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'Google sign-in was cancelled. You can try again or continue as a guest.';
    case 'auth/popup-blocked': return 'Your browser blocked the Google window. Allow popups for BrandSentry and try again.';
    case 'auth/network-request-failed': return 'Google couldn’t connect. Check your connection and try again.';
    case 'auth/unauthorized-domain': return 'Google sign-in is not available at this address yet. Please use guest mode.';
    case 'auth/operation-not-supported-in-this-environment': return 'Google popup sign-in is not supported by this browser. Please use a regular browser window or guest mode.';
    default: return 'Google sign-in couldn’t be completed. Please try again or continue as a guest.';
  }
}

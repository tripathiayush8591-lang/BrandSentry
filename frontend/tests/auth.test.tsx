import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/app/App';
import { authApi, AuthError } from '../src/services/auth-api';
import * as google from '../src/services/firebase-auth';
import { demoSession } from './auth-fixtures';

vi.mock('../src/services/auth-api', async (original) => ({
  ...await original<typeof import('../src/services/auth-api')>(),
  authApi: { me: vi.fn(), guest: vi.fn(), google: vi.fn(), logout: vi.fn() },
}));
vi.mock('../src/services/firebase-auth', async (original) => ({
  ...await original<typeof import('../src/services/firebase-auth')>(),
  googleIdToken: vi.fn(), clearGoogleIdentity: vi.fn(), googleConfigurationAvailable: vi.fn(),
}));
vi.mock('../src/hooks/useBackendStatus', () => ({ useBackendStatus: () => ({ connectionState: { status: 'checking' }, checkConnection: vi.fn(), apiBaseUrl: 'http://127.0.0.1:8001' }) }));
vi.mock('../src/services/brand-api', async (original) => ({ brandApi: {
  ...(await original<typeof import('../src/services/brand-api')>()).brandApi,
  listDocuments: vi.fn().mockResolvedValue([]),
  listRules: vi.fn().mockResolvedValue([]),
  listClaims: vi.fn().mockResolvedValue([]),
} }));

const noSession = () => new AuthError('Your session has ended. Please sign in again.', 401);
const me = vi.mocked(authApi.me);
function mount(path = '/') { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
async function anonymous() { mount(); return screen.findByRole('button', { name: 'Continue as Guest' }); }

beforeEach(() => {
  document.cookie = 'brandsentry_session-csrf=mock-csrf-value; path=/';
  vi.clearAllMocks();
  me.mockReset().mockRejectedValue(noSession());
  vi.mocked(google.googleConfigurationAvailable).mockReturnValue(true);
  vi.mocked(google.clearGoogleIdentity).mockResolvedValue(undefined);
  vi.mocked(authApi.logout).mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); document.cookie = 'brandsentry_session-csrf=; max-age=0; path=/'; });

describe('Authentication UI and server-owned session state', () => {
  it('retains the selected upload and draft title while focus rechecks the same session', async () => {
    me.mockResolvedValue(demoSession());
    mount('/vault');
    const input = await screen.findByLabelText('File (PDF or UTF-8 TXT, max 5MB)') as HTMLInputElement;
    const file = new File(['Synthetic policy'], 'policy.txt', { type: 'text/plain' });
    await userEvent.upload(input, file);
    await userEvent.type(screen.getByLabelText('Document Title (Optional)'), 'Unsent title');
    let finish!: (value: ReturnType<typeof demoSession>) => void;
    me.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await act(async () => { fireEvent(window, new Event('focus')); });
    expect(screen.getByLabelText('File (PDF or UTF-8 TXT, max 5MB)')).toBe(input);
    expect(input.files?.[0]).toBe(file);
    await act(async () => { finish(demoSession()); });
    expect(screen.getByLabelText('File (PDF or UTF-8 TXT, max 5MB)')).toBe(input);
    expect(input.files?.[0]).toBe(file);
    expect(screen.getByLabelText('Document Title (Optional)')).toHaveValue('Unsent title');
    expect(screen.getByRole('button', { name: 'Upload guideline' })).toBeEnabled();
  });

  it('clears the upload when a focus recheck resolves to a different workspace', async () => {
    me.mockResolvedValue(demoSession()); mount('/vault');
    const input = await screen.findByLabelText('File (PDF or UTF-8 TXT, max 5MB)');
    await userEvent.upload(input, new File(['Synthetic'], 'policy.txt', { type: 'text/plain' }));
    const other = demoSession(); other.workspace.id = 'other-workspace';
    me.mockResolvedValue(other);
    await act(async () => { fireEvent(window, new Event('focus')); });
    const changed = screen.getByLabelText('File (PDF or UTF-8 TXT, max 5MB)') as HTMLInputElement;
    expect(changed).not.toBe(input);
    expect(changed.files).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Upload guideline' })).toBeDisabled();
  });

  it('blocks the upload if a focus recheck cannot verify the existing session', async () => {
    me.mockResolvedValue(demoSession()); mount('/vault');
    await screen.findByLabelText('File (PDF or UTF-8 TXT, max 5MB)');
    me.mockRejectedValue(new AuthError('Network unavailable'));
    await act(async () => { fireEvent(window, new Event('focus')); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    expect(screen.queryByLabelText('File (PDF or UTF-8 TXT, max 5MB)')).not.toBeInTheDocument();
  });

  it('redirects protected navigation to login with Google and guest controls only', async () => {
    mount('/vault');
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('disables both controls while restoring authentication', () => {
    me.mockReturnValue(new Promise(() => {}));
    mount('/login');
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue as Guest' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Checking');
  });

  it('creates a guest on the backend, confirms its cookie session and opens the foundation', async () => {
    await anonymous();
    vi.mocked(authApi.guest).mockResolvedValue(demoSession());
    me.mockResolvedValue(demoSession());
    await userEvent.click(screen.getByRole('button', { name: 'Continue as Guest' }));
    expect(await screen.findByText('Guest Demo')).toBeInTheDocument();
    expect(authApi.guest).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Guest demo')).toBeInTheDocument();
    expect(google.googleIdToken).not.toHaveBeenCalled();
  });

  it('shows guest progress and prevents duplicate submissions', async () => {
    await anonymous();
    vi.mocked(authApi.guest).mockReturnValue(new Promise(() => {}));
    await userEvent.dblClick(screen.getByRole('button', { name: 'Continue as Guest' }));
    expect(screen.getByRole('button', { name: 'Creating your workspace…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(authApi.guest).toHaveBeenCalledTimes(1);
  });

  it('restores backend identity independently of Firebase state', async () => {
    me.mockResolvedValue(demoSession('google'));
    mount();
    expect(await screen.findByText('Test Member')).toBeInTheDocument();
    expect(google.googleIdToken).not.toHaveBeenCalled();
  });

  it('exchanges a Google ID token, confirms the session and discards temporary Firebase identity', async () => {
    await anonymous();
    vi.mocked(google.googleIdToken).mockResolvedValue('mock-id-token');
    vi.mocked(authApi.google).mockResolvedValue(demoSession('google'));
    me.mockResolvedValue(demoSession('google'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByText('Test Member')).toBeInTheDocument();
    expect(authApi.google).toHaveBeenCalledWith('mock-id-token');
    expect(google.clearGoogleIdentity).toHaveBeenCalled();
  });

  it('shows Google popup progress and disables both controls', async () => {
    await anonymous();
    vi.mocked(google.googleIdToken).mockReturnValue(new Promise(() => {}));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('button', { name: 'Connecting to Google…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue as Guest' })).toBeDisabled();
  });

  it('keeps a server-accepted session when the client clock considers its timestamp past', async () => {
    const session = demoSession(); session.session.expires_at = '2000-01-01T00:00:00';
    me.mockResolvedValue(session); mount();
    expect(await screen.findByText('Guest Demo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue as Guest' })).not.toBeInTheDocument();
  });

  it('switches from guest to Google through confirmed logout without retaining guest identity', async () => {
    me.mockResolvedValue(demoSession()); mount(); await screen.findByText('Guest Demo');
    me.mockRejectedValue(noSession());
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('button', { name: 'Continue with Google' });
    vi.mocked(google.googleIdToken).mockResolvedValue('mock-id-token');
    vi.mocked(authApi.google).mockResolvedValue(demoSession('google'));
    me.mockResolvedValue(demoSession('google'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByText('Test Member')).toBeInTheDocument();
    expect(screen.queryByText('Guest Demo')).not.toBeInTheDocument();
  });

  it.each([
    ['auth/popup-closed-by-user', 'cancelled'],
    ['auth/popup-blocked', 'blocked'],
    ['auth/network-request-failed', 'connect'],
    ['auth/unauthorized-domain', 'not available'],
  ])('explains Google error %s without granting access', async (code, text) => {
    await anonymous();
    vi.mocked(google.googleIdToken).mockRejectedValue({ code });
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: 'Continue as Guest' })).toBeEnabled();
    expect(authApi.google).not.toHaveBeenCalled();
  });

  it('explains missing Google configuration while leaving guest available', async () => {
    vi.mocked(google.googleConfigurationAvailable).mockReturnValue(false);
    await anonymous();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not configured');
  });

  it('reports guest backend failures without fabricating a session', async () => {
    await anonymous();
    vi.mocked(authApi.guest).mockRejectedValue(new AuthError('Sign-in is temporarily unavailable.', 503));
    await userEvent.click(screen.getByRole('button', { name: 'Continue as Guest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    expect(screen.queryByText('Guest Demo')).not.toBeInTheDocument();
  });

  it('rejects a successful login response when the browser cookie is not accepted', async () => {
    await anonymous();
    vi.mocked(authApi.guest).mockResolvedValue(demoSession());
    await userEvent.click(screen.getByRole('button', { name: 'Continue as Guest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('session has ended');
    expect(screen.queryByText('Guest Demo')).not.toBeInTheDocument();
  });

  it('gates protected content on restoration failure and supports retry', async () => {
    me.mockRejectedValue(new AuthError('Network unavailable'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    expect(screen.queryByText('Guest Demo')).not.toBeInTheDocument();
    me.mockResolvedValue(demoSession());
    await userEvent.click(screen.getByRole('button', { name: 'Retry session check' }));
    expect(await screen.findByText('Guest Demo')).toBeInTheDocument();
  });

  it('logs out only after backend revocation is confirmed, then restores as anonymous', async () => {
    me.mockResolvedValue(demoSession());
    mount();
    await screen.findByText('Guest Demo');
    me.mockRejectedValue(noSession());
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Continue as Guest' })).toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalledWith('mock-csrf-value');
    expect(screen.getByRole('status')).toHaveTextContent('signed out');
  });

  it('does not claim signed out if the backend still accepts the session', async () => {
    me.mockResolvedValue(demoSession()); mount(); await screen.findByText('Guest Demo');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('has not ended your session');
    expect(screen.getByText('Guest Demo')).toBeInTheDocument();
  });

  it('keeps the identity visible when logout fails', async () => {
    me.mockResolvedValue(demoSession()); mount(); await screen.findByText('Guest Demo');
    vi.mocked(authApi.logout).mockRejectedValue(new AuthError('We couldn’t reach BrandSentry.'));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t reach');
    expect(screen.getByText('Guest Demo')).toBeInTheDocument();
  });

  it('removes protected content when the server reports expiry on window focus', async () => {
    me.mockResolvedValue(demoSession()); mount(); await screen.findByText('Guest Demo');
    me.mockRejectedValue(noSession());
    await act(async () => { fireEvent(window, new Event('focus')); });
    expect(await screen.findByRole('button', { name: 'Continue as Guest' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('session has ended');
  });

  it('supports keyboard access to both authentication controls', async () => {
    await anonymous();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Continue as Guest' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Continue as Guest' })).toHaveAccessibleDescription(/guest workspace is temporary/);
  });

  it('does not persist credentials or authority in web storage', async () => {
    const store = vi.spyOn(Storage.prototype, 'setItem');
    me.mockResolvedValue(demoSession()); mount();
    await waitFor(() => expect(screen.getByText('Guest Demo')).toBeInTheDocument());
    expect(store).not.toHaveBeenCalled();
    store.mockRestore();
  });
});

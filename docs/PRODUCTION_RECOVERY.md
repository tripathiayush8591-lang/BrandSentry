# Production session recovery — 2026-10-25

Scope authorized by the user: repair production frontend, add an honest read-only
fallback if the backend cannot be reached, commit only this slice and push master.

## Confirmed failure

- Public deployed bundle `index-BaDS7oKi.js` compiled `getApiBaseUrl()` to return
  `http://127.0.0.1:8000`. Browser session restoration targeted the visitor's machine.
- Railway `/health` and `/api/v1/auth/me` returned HTTP 502, with the Railway edge
  message `Application failed to respond`. The same body/status appeared through
  Vercel `/api/v1/auth/me`, confirming the existing rewrite reaches Railway.
- These are connectivity/upstream failures, not an authentication 401, CSRF
  rejection or browser CORS rejection from the proxy. The backend process failure
  itself could not be diagnosed from accessible runtime logs.

## Repair and security boundaries

- Production API bases always resolve to the same origin; development overrides
  remain supported. Existing Vercel rewrite and no-store headers are correct.
- First-visit session failures show the existing login UI, retry action and public
  preview link. HTTP 401 still leads to anonymous login. An existing identity whose
  recheck fails remains blocked from protected content.
- `/preview` contains only local, labeled fictional policy/draft examples. It makes
  no validation requests, creates no records, performs no approval and grants no
  workspace identity. It renders independently of session restoration.
- Backend-issued Google/guest sessions, cookie confirmation, CSRF and authorization
  remain unchanged. Railway infrastructure was not modified; no Gemini requests
  were made.

## Verification before release

- `cd frontend; npm run lint` — passed.
- `cd frontend; npm run typecheck` — passed.
- `cd frontend; npm test` — 114 tests passed across 15 files (MOCK).
- `cd frontend; npm run build` — passed.
- `cd backend; .venv/Scripts/python.exe -m pytest -q` — 239 passed, 1 skipped
  (POSIX volume-path test on Windows); external providers mocked. This ran against
  the current local working tree, including pre-existing uncommitted backend work.
- `npm run test:e2e -- e2e/production-recovery.spec.ts e2e/firebase-init.spec.ts`
  — 4 passed (BROWSER_MOCK): 401/403/502 login handling, preview, theme switching,
  mobile width and refresh; real Firebase SDK initialization with provider blocked.
- `npm run test:e2e -- e2e/auth.spec.ts` — 10 passed (local LIVE_BACKEND plus
  browser faults): guest issuance, HttpOnly cookie, reload/restart persistence,
  session expiry, CSRF rejection/logout, workspace isolation, stripped-cookie
  rejection, outage/recovery and four responsive login sizes.
- Chromium against the built `dist` using `vite preview`: mocked 401 and 502 both
  produced same-origin API requests, login and the labeled preview.
- Staged diff whitespace checks and credential-pattern scan passed. Existing
  unrelated backend/docs work and generated test artifacts are excluded.

## Release and limits

Production target: https://brand-sentry.vercel.app and public fallback
https://brand-sentry.vercel.app/preview. Release commit: the commit introducing this
file (`git log -1 --format=%H -- docs/PRODUCTION_RECOVERY.md`).

Live Google login, live guest issuance and production cookie forwarding cannot be
claimed while Railway returns 502. No LIVE_PROVIDER coverage was attempted.
Post-push Vercel status and public Chromium smoke results are reported in the chat.
Next action after frontend recovery: backend owner inspects Railway startup logs
and restores the service, then verifies production guest/Google sessions and CSRF.

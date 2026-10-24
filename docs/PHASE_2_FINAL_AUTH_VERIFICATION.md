# Phase 2 final authentication verification — 2026-10-24

Status: **RESOLVED locally — genuine Google login, restoration and logout verified.**
The initial investigation below records the prior blocker; the continuation at
the end records its resolution after the user supplied a credential directory.
Only ignored local environment configuration, documentation and safe smoke
evidence changed. No application code, dependencies or UI changed; no credential
contents were output or copied. No commit, push or deployment.

## Exact root cause and current evidence

Installed Firebase Admin SDK is 6.9.0. The current backend initializes the default
app with explicit projectId, using ApplicationDefault when neither configured
service-account setting is present. initialize_app is lazy: it succeeds without
loading ADC. On the first auth operation, `_auth_client.Client.__init__` calls
`app.credential.get_credential()`, which calls google.auth.default(). With no
usable credential, this raises DefaultCredentialsError. The verifier translates
that dependency failure to FirebaseNotConfiguredError and the endpoint returns
503 SERVICE_UNAVAILABLE. This occurs before ID-token validation; the project ID
and Google's public certificates alone do not satisfy this SDK client setup.

Fresh-process local diagnostics confirmed:

- SDK source contains the auth-client credential load and ADC lookup described
  above. App initialization succeeds for `brandsentry-68d05`, but credential
  loading fails with DefaultCredentialsError.
- Effective backend and frontend project IDs both match `brandsentry-68d05`.
  Frontend authDomain matches `brandsentry-68d05.firebaseapp.com`; all four
  Firebase web configuration fields are present.
- FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_SERVICE_ACCOUNT_FILE are unset;
  GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_AUTH_EMULATOR_HOST are unset.
- google.auth.default() cannot resolve ADC. No standard Windows ADC file exists
  and gcloud is unavailable on PATH.
- Targeted filename checks in backend/ and Downloads found one candidate; its
  contents did not satisfy both service_account type and expected project.
  It was not configured or copied. No file contents, keys or tokens were output.
- Existing frontend targets the local API on port 8001; running local backends
  on 8000 and 8001 both answer /health with 200. Those existing processes were
  left running unchanged; health alone does not prove Firebase readiness.

## Supported configuration options

| Option | Current implementation support and use |
| --- | --- |
| Local service-account file | Preferred available implementation path: set FIREBASE_PROJECT_ID to brandsentry-68d05 and FIREBASE_SERVICE_ACCOUNT_FILE to the absolute path of a matching private file in ignored backend/.env. SDK Certificate loads it directly. Validate type/project/key parsing without outputting contents. Keep the key outside source control. No valid file was available, so this was not applied. |
| Inline service-account JSON | Existing FIREBASE_SERVICE_ACCOUNT_JSON is parsed as Certificate and takes precedence over FILE. Suitable for a private Railway runtime variable when a key is the chosen credential. Do not use a VITE_ variable, tracked file, command argument or logs for its contents. Not configured or deployed here. |
| ADC via GOOGLE_APPLICATION_CREDENTIALS | Supported by the SDK when both explicit app settings are absent. Set the variable in the backend process environment to a valid service-account or supported external-account configuration file. Merely adding it to backend/.env does not export it to os.environ: Settings ignores unknown fields, while google.auth reads process environment. Use FIREBASE_SERVICE_ACCOUNT_FILE in backend/.env for the existing direct-file path instead. |
| Local user ADC | Google Cloud CLI supports application-default login. Firebase documents additional requirements for Auth: use your own Desktop OAuth client ID with --client-id-file, plus an explicit project ID (already provided here). Ordinary gcloud CLI login or Firebase CLI login is not equivalent to configured ADC. No CLI installation or interactive account authorisation was performed. |
| Workload/external identity ADC | A supported external-account ADC configuration can avoid a long-lived private key, provided the deployment has an actual configured identity/subject-token source and trust binding. None is configured or verified for this Railway project; do not assume Google metadata credentials exist on Railway. |

Official sources:
[Firebase Admin setup and non-Google environments](https://firebase.google.com/docs/admin/setup),
[local ADC setup](https://docs.cloud.google.com/docs/authentication/set-up-adc-local-dev-environment),
[Firebase ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
These options preserve Admin SDK signature, expiry, audience and issuer validation.
No credential-free fallback, emulator or token bypass was introduced.

## Frontend and session flow verification

Source inspection confirms real production imports from firebase/app and
firebase/auth, not the test fake:

1. googleIdToken() uses initializeAuth with in-memory persistence, GoogleAuthProvider,
   signInWithPopup(), then result.user.getIdToken().
2. AuthProvider awaits that token and calls authApi.google(token).
3. auth-api.ts posts JSON {id_token} to /api/v1/auth/google with credentials: include.
4. The backend invokes FirebaseVerifier.verify before creating the SQLite identity
   and session. Success sets the existing HttpOnly session and companion CSRF cookies.
5. The frontend confirms /auth/me after issuance and restores via /auth/me on load.
   Logout requires CSRF and server confirmation that /auth/me returns 401.

This proves the intended code path, **not that a genuine ID token was obtained in
this verification session**. No Google login, token exchange, Google /auth/me,
Google session reload/restoration, or Google logout success is claimed. No mocked
token was substituted for that missing live proof. Regression coverage below
uses explicitly mocked Firebase identities and real backend/SQLite sessions.

## Actual verification results

Commands from backend/:

- `.venv/Scripts/python -m pytest`: **66 passed**, one preexisting Starlette/httpx
  deprecation warning, 11.46 seconds. MOCK Firebase provider boundaries;
  LIVE_BACKEND FastAPI/SQLite including session restoration/restart, logout deletion,
  revoked-cookie replay, CSRF and isolation negative paths.
- `.venv/Scripts/ruff check .`: **All checks passed**.
- `.venv/Scripts/ruff format --check .`: **40 files already formatted**.

No frontend source changed, so frontend tests/build/browser suites were not rerun
in this verification session. Their earlier results remain in AUTH_HARDENING_REPORT.md.
LIVE_PROVIDER genuine Google success and LIVE_DEPLOYMENT remain unverified.

## Remaining unblock step

User was asked for only the absolute path to a valid local service-account JSON
for brandsentry-68d05, never its contents. No valid credential was available by
the end of verification. Once supplied, validate locally, configure the ignored
backend environment, restart the intended backend with that configuration and use
localhost for the genuine Google popup. Record only status/boolean evidence for
exchange, /auth/me, reload restoration, CSRF logout, both cookie deletions and
revoked-session 401. Account selection/consent may need the user's interaction.
The previously reported 127.0.0.1 authorised-domain issue also requires confirmation;
do not change Firebase provider/domain configuration or claim live success implicitly.

## Credential configuration and successful genuine smoke continuation

The user supplied a local directory outside the repository. It contained exactly
one JSON file with type service_account and project_id brandsentry-68d05 whose
private key parsed successfully with the Admin SDK. Only boolean checks were
printed. Its contents were not copied, logged or sent to a third party.

- Configured ignored `backend/.env` with FIREBASE_PROJECT_ID=brandsentry-68d05
  and FIREBASE_SERVICE_ACCOUNT_FILE referencing that existing private file.
  The path and private key are deliberately omitted from this report.
- Configured ignored `frontend/.env.local` VITE_API_BASE_URL=http://localhost:8001
  to match the localhost browser origin for development SameSite=Lax cookies.
  Do not mix localhost and 127.0.0.1 for this local smoke flow.
- Restarted the preview backend on 8001, retaining the existing
  `.data/phase2b-browser.sqlite` database; original port-8000 backend unchanged.
  A first restart used default settings; the existing preview DB was restored
  before the successful sign-in. Neither DB was reset or removed.
- Real SDK auth-client construction now succeeds. A deliberately invalid input
  is rejected with 401 and no issued cookies rather than failing with the previous
  credential-related 503. That diagnostic was not a substitute for genuine login.
- Google's public certificate endpoint returned 200; local clock differed from
  its response Date by approximately two seconds.

An initial popup attempt did not establish an application session. Its exact
failure reason was not captured, so no unsupported cause is assigned. A second
genuine attempt, with the user's account interaction, passed as follows:

| Live observation | Result |
| --- | --- |
| Unchanged FirebaseVerifier / Admin SDK verifies the genuine SDK-issued ID token | PASS |
| POST /api/v1/auth/google | 200 |
| GET /api/v1/auth/me immediately after exchange | 200 |
| Authenticated account/workspace visible in browser | PASS |
| Session restored in a new tab and on full reload | PASS, /auth/me 200 |
| Actual backend stop/start against the same SQLite file, then reload | PASS, /auth/me 200 and same visible account/workspace |
| CSRF-authenticated POST /api/v1/auth/logout | 204 |
| GET /api/v1/auth/me after logout | 401 |
| Reload after logout | Login screen; /auth/me 401 |
| Persisted Google session revocation | Exactly one Google session created in preview DB, and it is revoked |

The genuine token stayed in the SDK/browser/backend flow. It was never read into
tool output, saved, minted by a test, or replaced with a fake. Temporary ignored
local diagnostics recorded only fixed paths, status codes, verification outcome
and timestamps while delegating unchanged to the real verifier. Those diagnostic
helpers were removed and the normal uvicorn backend restored afterward. One
temporary helper startup failed before app lifespan initialized its verifier;
the helper was corrected before the successful smoke, with no application change.

Cookie-deletion header/attribute and captured-token replay evidence remains the
12 backend regression combinations and prior Chromium suite. This run verifies
genuine Google logout and DB revocation; the in-app browser's read-only DOM API
does not expose cookie inspection, so no new direct cookie-jar claim is made.

Safe evidence (no tokens, credentials, email or account identifiers):
`frontend/evidence/phase2b/google-smoke-observation.json` and
`frontend/evidence/phase2b/google-smoke-signed-out.png`.
Events use UTC; the genuine exchange at 2026-10-23 19:06:47 UTC corresponds to
2026-10-24 00:36:47 Asia/Calcutta.

Backend checks after configuring the credential: `.venv/Scripts/python -m pytest`
**66 passed** in 11.21 seconds (existing Starlette/httpx deprecation warning);
`.venv/Scripts/ruff check .` passed; `.venv/Scripts/ruff format --check .`
reported **40 files already formatted**.

Coverage now includes **LIVE_PROVIDER Firebase Google + LIVE_BACKEND + live
in-app browser**. The local Google blocker is resolved. Railway secrets,
deployment smoke, cross-site production cookies/CSRF, and previously recorded
provider-enforcement/dependency findings remain outside this verification.
For future Railway configuration, use an explicit private runtime credential
source from the options above; the local key path will not exist on Railway.

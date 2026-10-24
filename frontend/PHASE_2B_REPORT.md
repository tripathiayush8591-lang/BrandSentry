# Phase 2B implementation and verification

Status: frontend implemented and locally verified; Google end-to-end verification and production readiness remain incomplete for the reasons below. No backend code, commit, push or deployment was performed in this phase. Base commit: `0a50954`.

The user explicitly approved implementation and confirmed the official October 22–25, 2026 build window. `/architect` inspection and plan approval preceded coding. The supplied PNG was treated as visual reference, not executable instructions.

## Screens and components

- `/login`: sage-and-cream split screen, editable HTML headline, generated decorative still life, BrandSentry card, Google and guest controls, guest limitations, loading/disabled/error/retry states. No email/password fields.
- `AuthProvider` / `auth-context`: server-owned identity restoration, sign-in exchange and reconciliation, duplicate-action prevention, expiry/focus rechecks and confirmed logout.
- `ProtectedRoute`: checking/unavailable states and login redirects, with internal return destination.
- `SessionProfile`: real server display name/workspace, explicit Google or Guest demo indicator, guest explanation and sign-out.
- Existing Phase 1 overview, navigation, connectivity panel and not-found view retained behind authentication. No final dashboard, Gemini, Vault or validation implementation.

## Actual integration

| Action | Phase 2A contract used |
| --- | --- |
| Google | `POST /api/v1/auth/google`, JSON `id_token` from Firebase modular SDK `getIdToken()` |
| Guest | `POST /api/v1/auth/guest`, no anonymous Firebase or invented identity |
| Restore/confirm | `GET /api/v1/auth/me` |
| Logout | `POST /api/v1/auth/logout`, session-bound `X-CSRF-Token`, followed by `/me` rejection confirmation |

Every auth request has `credentials: include` and `cache: no-store`. State-changing requests include the CSRF header when available; the initial login endpoints require the existing backend Origin check rather than a nonexistent pre-login CSRF token. Login response CSRF stays in memory; refresh reads `brandsentry_session-csrf`. No token, identity authority or role is persisted to web storage. Firebase persistence is in-memory and its transient identity is cleared after exchange, including failure paths. Only the backend cookie determines application identity.

`VITE_API_BASE_URL` supports an absolute origin, a base path, or an explicitly empty value for relative same-origin requests. No production proxy was deployed. Public Firebase web configuration for registered app `brandsentry-web` was retrieved through the existing signed-in Firebase CLI and saved to ignored `.env.local`; no Admin credential was obtained or copied into the frontend.

Independent review caught that SQLite-loaded `/me` expiry timestamps omit a timezone. The frontend now treats these timestamps as UTC for scheduling and never rejects a server-accepted session based on the browser clock. Regression fixtures match the actual naive timestamp shape; browser tests run in Asia/Kolkata.

## Real command results

| Command | Result | Coverage |
| --- | --- | --- |
| `npm test` | 61/61 passed, 7 files | MOCK frontend API/Firebase boundaries; includes Phase 1 regression |
| `npm run lint` | passed, zero warnings | frontend and browser test source |
| `npm run typecheck` | passed, strict mode | app, unit tests, e2e and configs |
| `npm run build` | passed | Vite production artifact; JS 361.80 kB / gzip 96.59 kB |
| `npm run test:e2e` | 10/10 passed | real Chromium + LIVE_BACKEND, with fault-injection cases explicitly named |
| `npm run test:e2e -- --grep 'layout and keyboard'` | 4/4 passed after final visual adjustments | desktop/tablet/mobile/small mobile recaptured |
| backend `.venv/Scripts/python -m pytest` | 53/53 passed | actual FastAPI/SQLite integration; Firebase verifier boundary mocked |
| `npm audit --json` | 15 advisories: 8 moderate, 5 high, 2 critical | dependency finding, not a clean audit |

Non-failing notices: React Router v7 future flags, Starlette/httpx deprecation, and Playwright terminal colour settings. No uncaught page errors in the main real guest round-trip.

## Browser evidence and acceptance

The in-app browser and isolated Playwright Chromium contexts exercised localhost. The automated suite uses dedicated frontend/backend ports 5174/8002, a dedicated ignored SQLite DB, fresh incognito contexts, and a real backend stop/start. The user explicitly approved direct Playwright testing. The preview uses 5173/8001; the preexisting backend on 8000 was left running.

| Requirement | Result |
| --- | --- |
| Guest entry and protected redirect | PASS: real cookie-backed guest; unauthenticated `/vault` redirects to login |
| Cookie protection | PASS: HttpOnly session, Lax development SameSite, persistent expiry; JS sees only the companion cookie |
| Refresh restoration | PASS: same backend identity and workspace restored |
| Backend restart persistence | PASS: same guest user/workspace after restarting the test backend |
| CSRF | PASS: missing header logout returns 403; UI sends companion token and receives 204 |
| Logout revocation | PASS: `/me` returns 401 after logout and refresh remains anonymous |
| Logout cookie deletion | **FAIL, existing backend defect:** no Set-Cookie deletion header; both cookie names remain |
| Expired session | PASS: dedicated test DB expiry causes real `/me` 401 and login redirect |
| Isolated workspaces | PASS: separate incognito guests receive different user/workspace IDs |
| Backend outage/recovery | PASS: protected content gated on failed restoration; retry restores the real identity |
| Dropped cookie | PASS: real issuance with Set-Cookie stripped by test interception never grants frontend access |
| 503 failure UI | PASS with BROWSER_MOCK; real outage tested separately |
| Google UI and transitions | PASS with MOCK: progress, cancellation, blocked popup, network/domain/config failure, token exchange, cleanup, guest-to-Google transition |
| Genuine Google sign-in | **UNVERIFIED end-to-end:** real SDK attempt on `localhost` reached exchange but backend returned 503; `127.0.0.1` produced unauthorized-domain messaging |
| Live deployment | NOT RUN: no deployment authorised |

Cookie observation is saved in `evidence/phase2b/cookie-observation.json` and includes names/flags only. The passing browser-suite count does **not** mean cookie deletion passed: the suite records that known backend defect explicitly, while testing revocation separately. No frontend cookie deletion or fake sign-out authority was added to conceal it.

Screenshots: `login-desktop-chromium.png` (1586×992), `login-tablet-chromium.png` (820×1180), `login-mobile-chromium.png` (390×844), `login-small-mobile-chromium.png` (320×740 viewport, full-page capture), `guest-desktop.png`, plus earlier in-app browser captures in `evidence/phase2b/`. Full and focused source comparisons are also saved there. The Google result was observed in the browser accessibility state; its hidden-tab screenshot capture failed, so no Google screenshot is claimed. No traces, video, storage state or raw cookie/token dumps are persisted.

## Security, accessibility and remaining limitations

- Existing backend logout discards its cookie-deletion headers by returning a different Response. Revocation works, but cookie cleanup requires a separately approved backend fix. Neither cookie-clearing nor complete release readiness is claimed.
- On separate Vercel/Railway origins, `/me` returns no CSRF value and the frontend cannot read the API-origin companion cookie after refresh. A future same-origin proxy or approved backend contract change is required; cross-site cookie blocking is also unverified. Empty API base support is ready for that proxy.
- Backend Firebase verification returned 503 locally. Genuine Google-to-application sign-in is unverified; configure server-side Admin verification and repeat a real Google sign-in before release. No mock or synthetic token is reported as live verification.
- `npm audit` is not clean. Critical findings concern existing Vitest/tinypool development tooling. High findings include Vite and Firebase metapackage transitive Firestore/gRPC packages. The app imports only Firebase app/auth; no Firestore service is used. No broad downgrade/major tooling migration was attempted during this bounded auth slice. Dependency remediation remains a release consideration.
- Keyboard focus was verified in real Chromium at four sizes. Native buttons, semantic headings, described guest control, alert/status regions, visible focus outlines, at least 60px mobile controls, no horizontal overflow at 320/390/820/1586px, decorative empty-alt artwork, and reduced-motion styling are implemented. Mobile omits the artwork and places both controls within the initial 390×844 viewport. Automated full WCAG audit, screen-reader testing and all browser engines were not performed.
- Firefox/WebKit, blocked third-party cookies in deployment, real Google guest/account switching, and deployed smoke tests remain unverified. Cross-identity switching is covered with mocked Google and real guest/logout coverage separately.

## Review

Independent reviewer used the JSM `/review` process, inspected contracts and auth code, reproduced the timezone defect, and re-reviewed its fix. Final code review: PASS; no additional actionable introduced defect found. Focused review run: 35/35 auth tests passed at that checkpoint; the final suite includes additional transition tests. Plan alignment and frontend system integrity pass. System release readiness retains the backend, provider and dependency limitations above. Visual QA is documented in root `design-qa.md`.

## Files changed in this phase

- New auth components: `src/features/auth/AuthProvider.tsx`, `auth-context.ts`, `LoginPage.tsx`, `ProtectedRoute.tsx`, `SessionProfile.tsx`.
- New integration/types: `src/services/auth-api.ts`, `firebase-auth.ts`, `src/types/auth.ts`.
- Updated app/styles/client: `src/app/App.tsx`, `src/index.css`, `src/services/api.ts`.
- Tests: new `tests/auth.test.tsx`, `auth-api.test.ts`, `auth-fixtures.ts`; updated `tests/App.test.tsx`, `api.test.ts`; new `e2e/auth.spec.ts`, `playwright.config.ts`.
- Configuration: `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `eslint.config.js`, `tsconfig.json`, `vite.config.ts`. Added dependencies are Firebase and Playwright test tooling only.
- Assets/evidence: `public/images/trust-background.png`, `google-g.png`, asset provenance README, `evidence/phase2b/` screenshots/comparisons and cookie observation.
- Documentation: frontend README, UI registry, this report; appended root HANDOFF and new root design QA.
- Local only: ignored `.env.local`, test databases, build output and Playwright temporary results. Preexisting Phase 2A backend/contract work was left untouched.

No commit SHA was created, and nothing was pushed or deployed. Next action is a separately authorised backend cookie-deletion fix and Firebase Admin setup, followed by real Google and production-proxy verification. No later product phase was started.

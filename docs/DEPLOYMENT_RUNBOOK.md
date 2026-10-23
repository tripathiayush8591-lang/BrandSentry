# BrandSentry — Deployment-First Runbook and Recovery Plan

**Critical release document.** Planning only: no service has been deployed or smoke-tested from this pack. Do not deploy before the organiser's authorised build window. Use current platform documentation and record actual project URLs/commit SHAs after setup.

## 1. Target topology and data durability
- Vercel: React/Vite static SPA in `frontend/`. Contains **no** Gemini secrets, SQLite, uploaded guideline originals or Firebase Admin keys.
- Railway: single FastAPI service in `backend/` with `/health`, `/ready`, production command bound to `$PORT` on `0.0.0.0`, restrictive CORS.
- Railway attached persistent volume **mounted at `/data`**. SQLite: `/data/db/brandsentry.sqlite`; uploads: `/data/uploads`. Verify actual mount and write permissions at runtime.
- Firebase Auth: Google provider enabled; production/preview domain configuration as required. Backend independently verifies ID token with Firebase Admin SDK.
- Guest auth: self-contained short-lived backend sandbox, independent of Firebase login.
- SQLite is intentionally a small, single-service MVP: do not autoscale to multiple writers without architectural review; back up and test restore.

Official platform docs for verification:
- https://vercel.com/docs/frameworks/frontend/vite (SPA routing)
- https://vercel.com/docs/deployments
- https://docs.railway.com/volumes (mounted at runtime, not build)
- https://docs.railway.com/volumes/reference (volume plan limits)
- https://firebase.google.com/docs/auth/admin/verify-id-tokens

## 2. Environment variable inventory — names, never values
**Vercel frontend (build-time public configuration):**
- `VITE_API_BASE_URL` (full HTTPS Railway public API origin)
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

**Railway backend (private runtime secrets/settings):**
- `APP_ENV`, `FRONTEND_ORIGINS` (explicit HTTPS origins incl. intended preview), `DATABASE_URL`, `UPLOAD_DIR`
- `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` (private; do not log or expose)
- `GEMINI_API_KEY`, `GEMINI_MODEL` (verify available model)
- `GUEST_SESSION_SIGNING_KEY` if used for auxiliary signing, `SESSION_TTL_HOURS`
- `AI_GUEST_HOURLY_LIMIT`, `AI_GUEST_DAILY_LIMIT`, `AI_USER_HOURLY_LIMIT`, `AI_USER_DAILY_LIMIT`
- `AI_GLOBAL_DAILY_CALL_LIMIT`, `AI_MAX_CONCURRENT`, `AI_REQUEST_TIMEOUT_SECONDS`, `AI_RESULT_CACHE_TTL_SECONDS`
- `LOG_LEVEL`, `MAX_UPLOAD_BYTES`

**Platform-injected:** `PORT` from Railway. Do not hardcode port in deployed start command. Avoid putting Admin credentials or Gemini keys behind `VITE_`; all `VITE_` variables are exposed to browsers.

## 3. First deployment, step-by-step (after build window starts)
1. Create GitHub repo; record authorised opening time; commit skeleton only within permitted window.
2. Deploy frontend skeleton on Vercel, set correct root `frontend/`, build `npm run build`, output `dist`; configure the SPA fallback rewrite for direct `/dashboard` navigation. Preview URL must load and deep-link refresh must succeed.
3. Deploy backend skeleton on Railway from `backend/`. Startup binds `$PORT` and `/health` works via the public HTTPS domain; `/ready` checks DB connection and writable mounted directory.
4. Attach Railway persistent volume mounted at `/data` **before** writing actual demo data. Volume is available at runtime, not build/predeploy time; initialise schema at a controlled runtime step. Keep single worker/instance.
5. Set explicit CORS origins matching real Vercel URLs. Configure `VITE_API_BASE_URL` to the Railway **HTTPS** origin; rebuild frontend if build-time variables change.
6. Call `/health` and `/ready` from incognito; then invoke backend through actual deployed frontend and inspect browser Network tab for CORS, 401, 404 and mixed-content failures.
7. Configure Google provider and Firebase authorised domains; test Google popup sign-in **on deployed origin**, send ID token to backend, verify role mapping and logout/expired token handling.
8. Configure isolated guest session endpoint; test without Firebase login, token expiration, and separation from real workspaces.
9. Write synthetic record, refresh browser, restart/redeploy backend, and prove record & uploaded file survived. Export backup and test restore once before live demo.
10. Capture release evidence: URLs, commit SHA, health timestamp, test logs and known limitations. Never record keys/tokens or sensitive user data.

## 4. CI/CD quality gates and release policy
For every PR/feature slice:
- Frontend: dependency install, TypeScript typecheck, lint, tests, production build, route-link checks.
- Backend: dependency install, lint/format, unit/integration tests, migration-test on a new SQLite DB, package import/startup test.
- Cross-service: API contract tests, fixture-based validation, authZ negative paths, live deployed smoke check after deployment.
- GitHub branch protection / PR review when practical. Deploy tested PR previews and deliberately promote to production after passing checks. Changes to prod scope need team approval.
- Feature freeze before deadline; last-known-good commit and rollback process documented. Keep backup in a secure location.

## 5. Concrete production acceptance matrix
| Test | Pass condition | Evidence to save |
|---|---|---|
| Public Vercel URL | HTTPS, no blank screen, deep-route reload works | URL + screenshot |
| Railway endpoints | `/health`=200 and `/ready`=200 while DB volume accessible | timestamp/status |
| Browser-to-backend | Actual API response, no CORS/mixed content | browser network proof |
| Google login | Firebase auth opens on allowed domain, token verified by backend | user flow screenshot + server safe log |
| Guest login | No Firebase dependency, isolated seeded demo | incognito proof |
| Permissions | Guest cannot read real data; creator cannot approve own content | authZ test output |
| Durability | Saved record and uploads survive service restart/redeployment | ID before/after |
| Gemini budget guards | Duplicate click one provider call; cache hit saves call; limit -> stable 429 | counters/logs/tests |
| AI degradation | Missing key/429/timeout presents partial result, never fake verification | test report |
| Real approval | Exact content version, reviewer action and audit persisted | demo evidence |
| Judge experience | New incognito judge can finish workflow unguided | manual test + feedback |

## 6. Incident playbook (diagnose before random edits)
| Symptom | First checks | Corrective direction |
|---|---|---|
| Vercel build failed | Root directory, lockfile, build logs, VITE variables | Correct build/paths; redeploy reviewed commit |
| White page / 404 on refresh | SPA rewrite, console errors, asset paths | Correct `vercel.json` SPA rewrite |
| Fetch fails / CORS | VITE_API_BASE_URL, HTTPS, backend public domain, allowed origins | Fix correct origin and redeploy frontend if build-time value changed |
| Firebase Google popup fails | Enabled provider, authorised app domain, redirect/popup browser state | Correct Firebase console and test real domain |
| Backend unhealthy | Railway deploy/start logs, `$PORT`, runtime imports, readiness dependencies | Restore last working build, fix startup |
| Records vanish | SQLite path outside `/data`, incorrect mount, volume not attached, seed reset | Stop writes, restore backup, correct mount & startup |
| SQLite busy/locked | WAL support, busy timeout, long transactions, multiple workers | Reduce worker count, short transactions, retry safe DB conflicts |
| Gemini quota exhausted | Usage ledger, provider dashboard, real 429 error | Reduce calls, cached/deterministic partial output, adjust budget only with permission |
| Judge sees other guest data | Session/workspace scoping failed | Treat as release blocker; disable guest route until fixed |
| New deployment breaks demo | compare commit, logs, smoke results | Roll back last known-good code; preserve volume, never blindly migrate down |

## 7. Deploy-time vs runtime notes
- A Railway volume is not available during image build or pre-deploy steps: schema creation/migrations that need it run at controlled service startup time, with concurrency safeguards and backups.
- The volume is persistent storage, **not a backup**. Create a restore-tested database+upload archive; watch disk usage. Do not seed/delete data automatically on each startup.
- `/health` must be cheap liveness; `/ready` checks required startup components but should not call Gemini on every hit; use explicit admin diagnostics for provider health.
- Vercel preview URLs may change; allow only intended origins, avoid wildcard credentialed CORS. Add legitimate judge-visible production URL to Firebase authorised domain settings.
- Provider rate limits and hosting availability/pricing are dynamic; verify live account tiers rather than assume no cost or 24/7 uptime.

## 8. Rollback / recovery
1. Pause risky writes if DB migration or filesystem corruption suspected.
2. Record current deployment ID, application logs, DB schema migration version and backup timestamp.
3. For code-only breakage, roll back to last known healthy Vercel/Railway deployment while preserving volume.
4. For DB incompatibility, restore compatible backup *after* validating desired data preservation; avoid blind schema down migration.
5. Rerun smoke suite, guest/login/authZ checks and persistence before declaring service recovered.

## 9. Release signoff record (fill during actual build)
- Official allowed build window: `TBD / verified from organiser:`
- Source repo: `TBD`
- Frontend production URL: `TBD`
- Backend production URL: `TBD`
- Release commit SHA: `TBD`
- Live smoke suite timestamp/results: `TBD`
- Last successful backup/restore test: `TBD`
- Google authorised-domain verified: `TBD`
- Guest incognito demo verified: `TBD`
- Known blockers: `TBD`
- Approvers: Ayush / Akhand

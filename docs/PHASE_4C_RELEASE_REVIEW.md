# Phase 4C — final release hardening review, 2026-10-24

**Verdict: READY TO DEPLOY** — conditional on executing the deployment procedure in this document (§5). All Phase 4A high findings are fixed and verified; Phase 4B fixes were independently reproduced and verified; no critical or high dependency advisories remain. LIVE_DEPLOYMENT evidence does not exist yet by definition — it is produced by executing §5, which requires explicit authorisation (no commit, push or deployment was performed in this phase).

Base HEAD: `0a50954f82b2a6fd7f923112aa004649a99f3956` (unchanged; all work remains uncommitted pending review). No live Gemini or Firebase requests were made; every verification used mocked provider boundaries or local live HTTP/SQLite.

## 1. Independent Phase 4B verification (objective 1)

Code review plus test reproduction, `GEMINI_API_KEY` blanked for all automated runs:

| Phase 4B fix | Independent verification |
| --- | --- |
| Atomic provider-call budgeting | `app/services/validation.py`: `_reserve_provider_budget` is a conditional `UPDATE` under SQLite's single-writer lock taken BEFORE every attempt via the `reserve_attempt` guard in `GeminiProvider.analyze` (initial call and each retry, `ProviderBudgetExhausted` aborts before network I/O). `tests/test_budget_accounting.py` passes: failed/timeout/rate-limited attempts consume their reservation (`calls_reserved == 1` with a one-call budget and an erroring provider; `== 2` for two attempts), successful runs reconcile token estimates, concurrent overshoot is impossible |
| Failed attempts consume budgets | Same suite (5 tests); enforcement no longer reads `provider_usage` (`outcome='error'` bypass is closed) |
| Google-only Firebase | `app/services/firebase.py` rejects any SDK-verified payload whose `firebase.sign_in_provider != "google.com"` (password/phone/anonymous/custom/federated); the claim never comes from client input. Default-app reuse now validates the existing app's `project_id`. `tests/test_auth_google.py` covers non-Google rejection |
| Conservative evidence support | `_verify_ai_findings` requires content anchoring (quote in submitted content) + source-ID membership + exact-quote-in-chunk; AI findings are never elevated to `SUPPORTED` by citation checks — they stay `NEEDS_VERIFICATION` with an explicit reason. `tests/test_evidence_support.py` passes |
| Suites cannot reach the live provider | `tests/conftest.py` and `tests/helpers_3b.py` hard-default `gemini_api_key=None`; all Phase 4C runs were executed with `GEMINI_API_KEY=""` in the environment |

## 2. Production-blocker fixes (objective 2)

Smallest compatible changes; no Redis, no new databases, no architecture changes.

1. **Private cache policy** — new `app/core/cache.py` (`CacheControlMiddleware`, pure ASGI) stamps `Cache-Control: private, no-store` on every response, including errors, 401/403, and Set-Cookie issuance/deletion. Middleware chain (outer→inner): RequestID → CacheControl → CORS → BodyLimit, so early rejections still carry the request ID, the cache policy, and CORS headers for allowed origins. `frontend/vercel.json` adds matching `CDN-Cache-Control`/`Vercel-CDN-Cache-Control: no-store` headers for `/api`.
2. **Volume readiness + writable storage** — `app/db/session.py` gains `check_directory_writable` (real create/write/delete probe, optional mkdir); `/ready` now write-probes **both** the database directory and `UPLOAD_DIR` (new `uploads` component; unusable upload path ⇒ 503). New `Settings.production_storage_problems()` + fail-closed startup in `app/main.py`: in `APP_ENV=production` the process **refuses to start** unless `DATABASE_URL` is an absolute `sqlite:////…` path and `UPLOAD_DIR` is absolute (`ENFORCE_PRODUCTION_STORAGE_PATHS=false` exists only for local tests/diagnostics that simulate production cookie behaviour on Windows tmp paths).
3. **Early body limits** — new `app/core/bodylimit.py`: `Content-Length` above the per-content-type cap is rejected `413 PAYLOAD_TOO_LARGE` **before the app runs**; chunked bodies (no Content-Length) are counted while streaming and abort at the cap (Starlette `HTTPException(413)` raised from the stream, which survives FastAPI's broad body-read error wrapper and maps to the standard error contract). Caps: multipart = `KNOWLEDGE_MAX_UPLOAD_BYTES` + `MAX_MULTIPART_OVERHEAD_BYTES` (5 MiB + 1 MiB), JSON 256 KiB, other 1 MiB.
4. **Forwarded-IP trust** — `get_client_ip` now uses the **rightmost** `X-Forwarded-For` entry (the value the single trusted Railway edge proxy appends); spoofed left entries no longer mint fresh per-IP identities. Direct unproxied requests use the socket address.
5. **Dependency vulnerabilities** — frontend: the unused `firebase` metapackage (which dragged `@firebase/firestore` → `@grpc/grpc-js@1.9.16`, 4 high advisories) is replaced by exact `@firebase/app@0.16.4` + `@firebase/auth@1.13.8` — the same versions the metapackage already shipped; only the two import lines in `src/services/firebase-auth.ts` changed. npm audit: **9 → 5 affected entries, high 4 → 0, critical 0**. Backend: `pytest` bumped `>=9.0.3` (resolves the only pip-audit finding; dev-only, never deployed). Remaining 5 moderates all require major migrations (react-router-dom 7, tailwindcss 4) — deliberately not forced; see §4.
6. **Bonus blocker closed** (Phase 4A medium, reproduced 500): duplicate submission titles in a workspace now return a stable `409 CONFLICT` instead of an unhandled 500 (IntegrityError mapped at flush and commit in `create_submission`).

Contracts documented in `docs/DATA_API_CONTRACTS.md` §11 (no JSON shape changes).

## 3. Deployment configuration validation (objective 3)

- **`frontend/vercel.json`** now implements the same-origin topology: `/api/:path*` rewrite to the Railway HTTPS host (**`REPLACE-WITH-RAILWAY-DOMAIN` placeholder must be substituted before the Vercel deploy**), no-store CDN headers on `/api`, SPA fallback for everything else. Verified locally against the production bundle (§4 smoke).
- **`docs/DEPLOYMENT_RUNBOOK.md`** reconciled: obsolete variable names (`GUEST_SESSION_SIGNING_KEY`, `SESSION_TTL_HOURS`, `AI_*`, `MAX_UPLOAD_BYTES`) replaced with the implemented inventory; `VITE_API_BASE_URL` is now **empty** (same-origin proxy), not the cross-origin Railway URL; new acceptance rows for cache policy, body limits and spoofed forwarding headers.
- **Railway**: start command `python -m app` (binds `0.0.0.0:$PORT`), healthcheck `/ready`, volume mounted at `/data` before traffic, `DATABASE_URL=sqlite:////data/db/brandsentry.sqlite`, `UPLOAD_DIR=/data/uploads`, single replica. Startup migrations are additive Alembic revisions `0001…0005`, run at runtime startup and reported via `/ready` `checks.migrations`.
- **Firebase**: backend verifies only `sign_in_provider == "google.com"`; the production frontend origin must be added to Firebase authorised domains (remote console not inspected from here).
- **Environment**: inventories in the runbook and the Phase 4A audit (§9) agree with the implemented `Settings`/`frontend/.env.example`; `.env.example` files contain names and placeholders only.

## 4. Verification results (objective 4) — actual commands

| Check | Command | Result | Coverage class |
| --- | --- | --- | --- |
| Backend tests | `.venv/Scripts/python -m pytest -q` (GEMINI_API_KEY blank) | **196 passed, 1 skipped** (POSIX-absolute path test is win32-skipped), 1 preexisting Starlette deprecation warning | LIVE_BACKEND SQLite/HTTP/filesystem + MOCK provider/verifier boundaries |
| New hardening suite | `tests/test_release_hardening.py` (12 tests) | PASS — cache policy on success/error/auth responses; pre-buffer 413; chunked-stream 413; JSON cap; rightmost-XFF unit + guest-limit integration; upload-dir readiness 503; fail-closed production startup; duplicate-title 409 | LIVE_BACKEND + MOCK |
| Ruff | `ruff check` / `ruff format --check` | clean, 73 files | Static |
| Python deps | `pip check`; pip-audit (isolated tooling venv) against `.venv` | no broken requirements; **zero known vulnerabilities** | Advisory audit |
| Frontend unit | `npm test` | **77/77 passed** (11 files) with the @firebase swap | MOCK UI/API |
| Frontend static | `npm run lint`, `npm run typecheck`, `npm run build` | all PASS (Vite 6.4.5, 0 warnings) | Static/build |
| Browser e2e | `npm run test:e2e` (Chromium) | **12/12 passed** incl. real guideline → rule → submission → validation → evidence flow, auth, themes, restart | LIVE_BACKEND browser |
| npm audit | `npm audit` | 0 critical, 0 high, 5 moderate (react-router ×2, tailwind/postcss chain ×3) | Advisory audit |
| Same-origin proxy smoke | `.data/phase4c/proxy-smoke.cjs` (production bundle, relative base, local reverse proxy, Chromium) | **PASS**: origin-emitted `private, no-store` on API responses (proxy forwards headers verbatim — no injection), early 413 with error contract, spoofed-XFF rightmost limiting (201/201/429 pattern), `/api` precedence over SPA, HttpOnly session + JS-readable CSRF, reload + **backend restart** restoration, disallowed Origin 403, missing CSRF 403, logout revocation + both cookies removed, unknown `/api` JSON 404 | LOCAL LIVE (not Vercel edge) |

Not exercised in this phase: LIVE_PROVIDER (zero Gemini/Firebase network requests, by design — the 4A live Gemini allowance is consumed; genuine Google sign-in was proven with real credentials in Phase 2), LIVE_DEPLOYMENT (produced by §5).

Harness notes (honesty record): the toy proxy needed `agent: false` (uvicorn's 5s keep-alive close races Node's pooled agent — real edge proxies handle this), fresh-DB only on first start (restart persistence must reuse the DB), `VITE_API_BASE_URL=` explicitly empty at build time (unset silently falls back to a loopback backend — same trap the 4A audit flagged), `ENFORCE_PRODUCTION_STORAGE_PATHS=false` only for the Windows loopback diagnostic, and the 413 probe targets the backend directly (a 99 MiB-declared body is aborted mid-proxy by uvicorn's early rejection; Vercel's edge terminates this cleanly).

## 5. Deployment procedure (Git → Railway → Vercel) — requires explicit authorisation

Nothing below has been executed. Do not start without approval.

**Step 0 — commit (authorised reviewer action)**
1. Review the staged candidate: `git status --porcelain`; stage explicit paths only (all Phase 2–4C source/tests/docs + `frontend/package.json`/lockfile + `frontend/vercel.json` + new files under `backend/app`, `backend/migrations`, `backend/tests`, `backend/alembic.ini`, `backend/smoke_3a*.py`).
2. Never stage: `.env*` (except `.env.example`), `.data/`, `*.sqlite`, uploads, `node_modules`, `dist`, `.venv`, `tsconfig.tsbuildinfo` (generated; review separately), evidence binaries not intended for the repo.
3. Re-run the quick gate on the staged tree: backend pytest, frontend `npm test && npm run build`. Commit with a conventional message (e.g. `feat: phases 2–4 release hardening (auth, knowledge vault, hybrid validation, 4C blockers)`).

**Step 1 — Railway (backend)**
1. New service from the repo, **root directory `backend`**; Railway builds from `requirements.txt` (runtime only — dev/test deps are excluded by design). Python 3.11+ (locally verified on 3.13).
2. Start command `python -m app`. Single instance, no autoscaling.
3. Attach a persistent volume mounted at **`/data`** BEFORE the first traffic.
4. Variables: `APP_ENV=production`, `FRONTEND_ORIGINS=https://<vercel-domain>` (+ intended preview origins), `DATABASE_URL=sqlite:////data/db/brandsentry.sqlite`, `UPLOAD_DIR=/data/uploads`, `SESSION_COOKIE_SECURE=true`, `SESSION_COOKIE_SAMESITE=lax`, `FIREBASE_PROJECT_ID=brandsentry-68d05`, `FIREBASE_SERVICE_ACCOUNT_JSON=<private secret>`, `GEMINI_API_KEY=<private secret>` (only after the smoke in step 4), `GEMINI_MODEL`, plus optional budget/limit names from the runbook §2. Do not set `ENFORCE_PRODUCTION_STORAGE_PATHS`.
5. Networking: public HTTPS domain; healthcheck path `/ready`. Watch deploy logs for the fail-closed storage check passing (it must NOT fire — if it does, the volume/paths are wrong).
6. Verify `GET /health` 200, `GET /ready` 200 with `checks.uploads.ok=true`; inspect logs for migration `0005` applied.

**Step 2 — Vercel (frontend)**
1. Import the repo, root **`frontend`**, framework Vite, build `npm run build`, output `dist`, Node 24.
2. **Before deploying**, edit `frontend/vercel.json`: replace `REPLACE-WITH-RAILWAY-DOMAIN` with the actual Railway HTTPS hostname (commit that one-line change).
3. Build env: `VITE_API_BASE_URL=` (explicitly **empty**), `VITE_FIREBASE_API_KEY/AUTH_DOMAIN/PROJECT_ID/APP_ID` (public web config, project `brandsentry-68d05`).
4. Deploy; verify deep-link `/vault` refresh serves the SPA and `/api/v1/health`-style unknown routes return JSON 404 (not HTML).

**Step 3 — Firebase console**
1. Authentication → Sign-in method: Google provider enabled.
2. Authentication → Settings → Authorised domains: add the exact Vercel production domain (and any fixed preview domains; no wildcards).

**Step 4 — deployed smoke (runbook §5)**, fresh incognito:
1. Guest flow: `/vault` → Continue as Guest → upload/approve a synthetic guideline → create rule → submission → validate → findings/evidence visible.
2. `curl -sI https://<vercel-domain>/api/v1/auth/me` → 401 with `cache-control: private, no-store`; confirm `x-vercel-cache` shows no shared caching; repeat from a second browser and confirm no data crosses sessions.
3. Oversized upload → 413 JSON; spoofed `X-Forwarded-For` cannot bypass the guest limit (429 on the true rightmost IP).
4. Google sign-in on the deployed origin → `/auth/me` 200 → logout 204 → replay 401.
5. Railway restart → records, uploaded file bytes, and sessions survive (`/data` mount proof).
6. SQLite-consistent backup + restore exercise; record timestamp and SHA in runbook §9.

## 6. Remaining known limitations (documented, non-blocking)

- **5 moderate npm advisories** remain: react-router 6→7 and tailwindcss 3→4 are major migrations with real product risk; no attacker-controlled `<Link>` target or SSR hydration path exists in this SPA (no SSR).
- **LIVE_DEPLOYMENT / LIVE_PROVIDER evidence** does not exist until §5 is executed (and any new Gemini live check needs fresh authorisation — the 4A allowance is consumed).
- Single-instance SQLite counters/leases/budget (per contract; horizontal scaling needs a new ADR). Lexical-only retrieval. Superseded upload files remain on disk (audit trail).
- `/ready` failure details include internal paths (useful for Railway debugging; acceptable for a private ops endpoint — revisit if exposed publicly).
- Human content review/decisions/audit-trail/insights remain future Phase 5 scope; this release covers the Round-2 technical MVP surface.

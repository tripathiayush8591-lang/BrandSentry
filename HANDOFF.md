# BrandSentry — Engineering Handoff

## Phase 2A: Authentication Backend (Firebase Google + isolated guest sessions)

- **Agent**: Ayush Tripathi (Backend & AI Lead) / Z Code assistant
- **Status**: Complete & verified locally. **Not committed** — awaiting explicit user permission (per operating contract: no commit/push/deploy without approval).
- **Date**: 2026-10-23
- **Base commit**: `0a50954` (Phase 1 foundation)

---

### 1. What was built

Phase 2A identity layer on the existing FastAPI backend, per the Phase 2A task brief and the contract amendment recorded in `docs/DATA_API_CONTRACTS.md` §8:

- **Google sign-in (Firebase verification only)** — `POST /api/v1/auth/google` verifies a Firebase ID token with the Firebase Admin SDK (`app/services/firebase.py`: signature, issuer, audience `brandsentry-68d05`, expiry, UID; SDK-enforced). UID is the stable external identity mapped to a local SQLite account + personal workspace on first sign-in. Client-supplied email/role/UID are never trusted. Firebase is used for **nothing else** (no Firestore/Storage).
- **Independent guest sessions (no Firebase Anonymous)** — `POST /api/v1/auth/guest` creates a server-generated guest actor, a dedicated isolated demo workspace, and a 256-bit opaque session. Rate limited per IP (DB-backed, default 10/hour, `429 RATE_LIMITED` + `Retry-After`).
- **Session model** — one `auth_sessions` table for both kinds; only SHA-256 token hashes stored; sessions pinned to their workspace at creation; expiry + revocation enforced server-side on every request. Delivery: `brandsentry_session` HttpOnly cookie (Secure + SameSite=None in production, Lax in local dev) plus a JS-readable CSRF cookie; mutations require `X-CSRF-Token`.
- **Endpoints** — `POST /auth/google`, `POST /auth/guest`, `GET /auth/me`, `POST /auth/logout` (204), `POST /auth/guest/revoke` (204, guest-only), `GET /workspaces/current`. All errors use the Phase 1 error contract.
- **Models + Alembic** — `users`, `workspaces`, `memberships` (admin/creator/reviewer, server-assigned only), `auth_sessions`; revision `0001_identity`; migrations run at startup (Railway volume is runtime-only), surfaced via `/ready` `checks.migrations`.

### 2. Files changed / added

- Added: `backend/app/db/models.py`, `backend/app/db/migrations.py`, `backend/app/services/firebase.py`, `backend/app/services/identity.py`, `backend/app/schemas/auth.py`, `backend/app/api/v1/auth.py`, `backend/app/api/v1/workspaces.py`, `backend/migrations/` (`alembic.ini`, `env.py`, `versions/0001_identity.py`), `backend/tests/helpers_2a.py`, `backend/tests/test_auth_google.py`, `backend/tests/test_auth_guest.py`, `backend/tests/test_authz.py`
- Modified: `app/main.py` (credentialed CORS, startup migrations, verifier in app state), `app/config.py`, `app/api/deps.py`, `app/api/v1/router.py`, `app/api/health.py` (readiness migration check), `backend/requirements.txt`, `backend/.env.example`, `backend/pyproject.toml` (test lint ignores), `tests/test_cors.py` (one deliberate amendment: credentialed CORS for allow-listed origins only), `docs/DATA_API_CONTRACTS.md`

### 3. Environment variables (names only — see backend/.env.example)

`FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` (private; Railway secret), `FIREBASE_SERVICE_ACCOUNT_FILE` (alternative), `USER_SESSION_TTL_HOURS`, `GUEST_SESSION_TTL_HOURS`, `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`, `GUEST_SESSIONS_PER_IP_PER_HOUR`; plus existing `DATABASE_URL`, `FRONTEND_ORIGINS`, `APP_ENV`.

### 4. Test evidence (real commands run)

| Suite | Command | Result | Coverage class |
|---|---|---|---|
| Backend pytest | `python -m pytest` | **53/53 PASS** (22 Phase 1 regression + 31 new) | MOCK provider boundary (Firebase fake), LIVE_BACKEND SQLite |
| Ruff lint/format | `ruff check` / `ruff format --check` | clean | — |
| Live smoke (uvicorn on 127.0.0.1:8000) | curl health/ready/guest/me/logout/google | guest flow + CSRF 403→204 + revoked-token replay 401 + honest `503` for `/auth/google` without Firebase credentials | LIVE_BACKEND |
| Real Firebase verification | not run | **NOT VERIFIED** — requires real Firebase Admin credentials; SDK is exercised only via mock boundary locally | none |

Negative paths covered in tests: invalid/expired/wrong-project/malformed tokens (401), unauthenticated protected routes (401), missing/wrong CSRF (403), disallowed Origin (403), guest↔google workspace isolation, DB-level membership isolation, self-assigned roles ignored, session replay after logout (401), DB-forced expiry (401), guest rate limit (429), identity survives app restart.

### 5. Security review notes

- No credentials, tokens, or raw secrets in source/logs/tests; `.env.example` names only.
- Session fixation: fresh server-generated token per login; no client-supplied session identifiers accepted.
- CSRF: session-bound token, constant-time hash compare, plus Origin allow-list check on unauthenticated POSTs (login CSRF).
- Tokens stored only as SHA-256; logout revokes immediately; expired sessions never resolve.
- Roles never accepted from client input; membership required for the session's workspace.
- CORS: `allow_credentials=True` only with the explicit origin allow-list (never `*`).
- Known residual risks: `X-Forwarded-For` is trusted for rate limiting (correct behind Railway's proxy; verify no direct ingress), single-instance DB-backed rate limit, no session-refresh endpoint (re-login issues a new session).

### 6. Frontend integration steps (for Antigravity / Phase 2B UI)

1. Firebase JS SDK sign-in with Google (project `brandsentry-68d05`); send `auth.currentUser.getIdToken()` as `{"id_token"}` to `POST {VITE_API_BASE_URL}/api/v1/auth/google` with `credentials: "include"`.
2. Guest entry: `POST /api/v1/auth/guest` with `credentials: "include"` (no body).
3. Keep the `csrf_token` from the login response in memory; on page refresh read the `brandsentry_session-csrf` cookie; send it as `X-CSRF-Token` on every mutating request.
4. `GET /api/v1/auth/me` on load restores the session; `401 UNAUTHENTICATED` → show landing/auth screen.
5. Logout: `POST /api/v1/auth/logout` with CSRF header; clear local state.
6. Local dev: Vite dev server origin must stay `http://localhost:5173` / `http://127.0.0.1:5173` (CORS allow-list + same-site cookies already configured).

### 7. Unverified functionality / blockers

- **Real Google token verification not exercised** (no service-account credentials available to this agent). Before the deployed demo: set `FIREBASE_SERVICE_ACCOUNT_JSON` on Railway and run one real sign-in through the deployed frontend.
- Cross-site `SameSite=None` cookie behaviour on the real Vercel↔Railway deployment untested (needs the live deployment); BFF fallback documented in `DATA_API_CONTRACTS.md` §8 if needed.
- Demo personas / quotas for guests arrive in later phases (Phase 5); guests currently get `admin` of their isolated demo workspace.

### Next actions (Phase 2B — do not start without approval)

Frontend auth screens (Google + Continue as Guest), Firebase client config, `VITE_API_BASE_URL` wiring, and the deployed Google + guest smoke check from `docs/DEPLOYMENT_RUNBOOK.md` §3 steps 7–8.

---

## Phase 2B — frontend authentication handoff

- Authorisation: user explicitly approved the reviewed plan and confirmed the October 22–25, 2026 official build window. No backend changes, commit, push or deployment authorised/performed in this phase.
- Base SHA: `0a50954`; all Phase 2B work remains uncommitted. Preexisting Phase 2A backend/contract changes were preserved.
- Implemented: responsive reference-based `/login`, modular Firebase Google popup/token exchange with in-memory persistence, actual backend guest sessions, credentialed/CSRF auth client, protected Phase 1 shell, server-restored profile/guest indicator, expiry handling and confirmed logout.
- Changed files: frontend auth components/services/types, App/CSS/API base handling, unit and Chromium tests/config, Firebase/Playwright dependencies, env example/README/UI registry, generated artwork/evidence; root `design-qa.md` and this appended handoff. Full inventory: `frontend/PHASE_2B_REPORT.md`.
- Verification: frontend `npm test` 61/61; lint/typecheck/build pass; `npm run test:e2e` 10/10, plus final responsive recapture 4/4. Backend `.venv/Scripts/python -m pytest` 53/53. MOCK Google is separated from LIVE_BACKEND/SQLite/Chromium. Independent review PASS after UTC timestamp regression fix. Visual QA passed.
- Real browser proof: guest cookies survive refresh and a test-backend restart with the same user/workspace; CSRF-less logout 403, valid logout 204, revoked `/me` 401; expired DB session redirects; outage/retry and separate incognito workspace isolation pass.
- Backend limitation confirmed: logout revokes but does not clear either cookie. `frontend/evidence/phase2b/cookie-observation.json` records retained cookie names and `cookieDeletionPassed: false`; no tokens are recorded.
- Google: public project web config saved only in ignored `.env.local`. Genuine attempt from localhost reached exchange but backend returned 503; 127.0.0.1 showed unauthorized-domain messaging. End-to-end genuine Google authentication remains UNVERIFIED.
- Production limitation: separate-origin companion CSRF restoration needs a future same-origin proxy or approved backend change. Configurable API base already supports relative URLs. No deployment smoke was run.
- Security: no web-storage credentials/authority, no backend/Admin secrets in frontend. npm audit reports 15 advisories (8 moderate, 5 high, 2 critical), including existing test tooling and unused Firebase metapackage transitive libraries. Not a clean security audit.
- Preview: http://127.0.0.1:5173/login; owned local backend on 8001 uses ignored `.data/phase2b-browser.sqlite`. Original backend 8000 left running. Automated test processes on 5174/8002 were stopped after tests; dedicated test DB persists locally for reruns.
- Next action: obtain separate approval for backend cookie-deletion repair and server Firebase setup; repeat genuine Google and production proxy/cookie checks. Stop at Phase 2B; no later feature phase started.

---

## Phase 2 authentication hardening — 2026-10-24

- User authorised the backend logout repair, Firebase 503 investigation and dependency audit; no UI/new feature/push/deployment. Existing Phase 2A/2B work preserved. HEAD remains `0a50954f82b2a6fd7f923112aa004649a99f3956`; no commit created.
- Changed `backend/app/api/v1/auth.py`: logout and guest revoke return the response bearing both cookie deletions, preserving DB revocation. Matching name/Path/Domain/Secure/HttpOnly/SameSite verified for default/custom names and dev/production settings.
- Added 12 deletion/replay/restart regressions to `backend/tests/test_auth_guest.py`; added a real SDK initialization/mocked missing-ADC regression in `backend/tests/test_auth_google.py`. Corrected credential documentation in `backend/app/services/firebase.py`. No token verification or API schema changes.
- Strengthened `frontend/e2e/auth.spec.ts` to assert cookie removal and two Set-Cookie headers via Playwright headersArray(); regenerated its names/flags-only cookie evidence and synthetic screenshots. Frontend UI and dependencies unchanged by this task.
- Final checks: backend pytest **66 passed**, Ruff lint clean, Ruff format **40 files clean**. Frontend **61 tests passed**, lint/typecheck/build passed. Final Chromium suite **10 passed**, including fresh browser context and actual test-backend restart. Interim header assertion failure was corrected and fully rerun. MOCK Firebase boundaries and LIVE_BACKEND SQLite/browser coverage are distinct; LIVE_PROVIDER Google success and LIVE_DEPLOYMENT remain unverified.
- Firebase project `brandsentry-68d05` matches frontend/backend. Local service-account settings and ADC absent; emulator unset. SDK 6.9 initializes with project ID, then auth client credential loading raises DefaultCredentialsError -> 503 before token verification. Project-ID-only credential-free operation does not work in this implementation. A JSON file is optional only if another valid ADC source or inline server-only service-account JSON is configured. No credentials/tokens printed or saved.
- Audit remains **15 affected package entries (8 moderate/5 high/2 critical)**. Critical: direct `vitest@2.1.9` and transitive `tinypool@1.1.1`. Evaluate Vitest 4.1.12 (published Node/Vite ranges fit this repo and it removes tinypool) or audit-proposed 5.0.5 in a dedicated migration; no forced overrides/major upgrade applied. Full advisory links, package paths and high findings in `docs/AUTH_HARDENING_REPORT.md`.
- Other preexisting security findings: provider check accepts any nonempty sign_in_provider rather than only google.com; SDK default-app reuse does not validate project on reuse. Separate-origin CSRF restoration, deployed cookie behavior, trusted proxy configuration and genuine Google sign-in remain open.
- No new live URLs. Test-only URLs: http://127.0.0.1:5174 and http://127.0.0.1:8002; test processes stopped by Playwright teardown. Remote configuration was not inspected or changed.
- Next action: provision backend credentials/ADC, restart, and repeat genuine Google sign-in; handle provider restriction/dependency remediation in focused follow-ups, then authorised deployment verification. Stopped after this task's verification. See `docs/AUTH_HARDENING_REPORT.md` for full evidence.

## Phase 2 final authentication verification — 2026-10-24

- User authorised credential configuration and genuine Google verification, with no features/commit/push/deployment. Base HEAD unchanged: `0a50954f82b2a6fd7f923112aa004649a99f3956`.
- Still blocked: no valid service-account configuration, GOOGLE_APPLICATION_CREDENTIALS or standard local ADC; gcloud unavailable. A Downloads candidate failed the service-account/project match and was not used. No credentials were printed/copied/transmitted. No .env or application code changes were made.
- Confirmed fresh Admin app uses `brandsentry-68d05`, then credential loading raises DefaultCredentialsError. SDK 6.9's auth client requires get_credential() before verification. Public project ID alone cannot satisfy that client initialization.
- Source confirms genuine Firebase SDK popup -> getIdToken -> FastAPI /auth/google -> /auth/me confirmation, restoration and CSRF logout paths. This is source evidence only; genuine Google issuance/exchange/me/restoration/logout remain unverified without credentials.
- Actual rerun: backend pytest **66 passed** (11.46s, existing Starlette/httpx warning); Ruff lint passed; Ruff format **40 files clean**. MOCK Firebase boundary coverage and LIVE_BACKEND SQLite/session regressions; no LIVE_PROVIDER success or LIVE_DEPLOYMENT.
- New documentation: `docs/PHASE_2_FINAL_AUTH_VERIFICATION.md`, including supported local/Railway configurations, Firebase-specific user ADC caveats and the fact that GOOGLE_APPLICATION_CREDENTIALS in Pydantic .env is not automatically exported to google.auth.
- Requested only a local credential file path from the user. Next action: validate matching credential, configure ignored FIREBASE_SERVICE_ACCOUNT_FILE, restart intended backend and complete genuine localhost browser flow (user account interaction if needed). Existing local services on 5173/8000/8001 left unchanged. Stopped after verification.

## Phase 2 genuine Google verification — resolved continuation, 2026-10-24

- User supplied a private local credential directory. Exactly one matching service-account file for `brandsentry-68d05` passed SDK key parsing; contents were never output/copied. Ignored backend `.env` now references it via FIREBASE_SERVICE_ACCOUNT_FILE and sets the expected project. Ignored frontend `.env.local` API base is `http://localhost:8001`, matching the browser hostname for Lax cookies. No tracked application/configuration source changes.
- Restarted backend 8001 with the existing `.data/phase2b-browser.sqlite`; port 8000 untouched. Local normal uvicorn restored after removing temporary status-only diagnostics. Use `http://localhost:5173/login` for this configuration.
- **LIVE_PROVIDER success:** real Firebase SDK popup/user sign-in -> genuine ID token -> unchanged Admin verification -> `/auth/google` **200** -> `/auth/me` **200**. Browser account/workspace restored in a new tab, after reload, and after an actual backend restart against the same DB. Logout **204** -> `/auth/me` **401**, reload stays signed out; SQLite confirms the single Google session is revoked.
- No token, service-account contents or account identifiers in saved evidence. `frontend/evidence/phase2b/google-smoke-observation.json` contains fixed statuses/booleans/timestamps; `google-smoke-signed-out.png` shows the final login screen. New direct cookie inspection was unavailable in this browser API; deletion/replay remain covered by the 12 regression cases and previous Chromium proof.
- Actual post-configuration backend checks: **66 pytest passed** in 11.21s; Ruff lint passed; Ruff format **40 clean**. Existing Starlette/httpx warning only. No frontend code/dependency/UI edits; no commit/push/deployment. HEAD unchanged at `0a50954f82b2a6fd7f923112aa004649a99f3956`.
- Local Google credential blocker is resolved. Railway credential provisioning/deployment, production cookie/CSRF topology, strict google.com provider enforcement and dependency findings remain open. Full initial diagnosis and successful continuation: `docs/PHASE_2_FINAL_AUTH_VERIFICATION.md`. Stopped after verification.


---

## Phase 3A — Brand Knowledge Vault & RAG foundation (backend), 2026-10-24

- **Agent**: Ayush Tripathi (Backend & AI) / Z Code assistant. **Not committed** — awaiting explicit user approval per operating contract. Base HEAD unchanged: `0a50954f82b2a6fd7f923112aa004649a99f3956`.
- Scope honoured: no Gemini calls, no findings engine, no frontend screens, no approval workflow for submissions, no hosting/stack changes, nothing pushed or deployed. Phase 1/2 functionality preserved (full regression suite passes).
- **Built**: Brand Knowledge Vault — document upload/ingestion (UTF-8 text + text-based PDF via PyMuPDF, magic-byte content inspection, configurable size/extraction caps, encrypted/corrupt/empty rejection, no OCR), structural chunking with page/section metadata, FTS5 retrieval layer (external-content index synced by triggers, BM25 ranking, sanitised queries, workspace+approved+active-version scoping), brand rule management (admin-authored, versioned updates, never auto-extracted), approved claims register, and DB-backed per-actor rate limits for uploads/searches (no Redis).
- **Added**: `app/db/models.py` (6 new tables), `migrations/versions/0002_knowledge.py` (additive; FTS5 + triggers), `app/services/knowledge.py`, `app/services/retrieval.py`, `app/services/ratelimit.py`, `app/schemas/knowledge.py`, `app/api/v1/knowledge.py`, `tests/helpers_3a.py` + 4 test files, `smoke_3a.py` / `smoke_3a_restart.py` (live smoke scripts). **Modified**: `app/config.py`, `app/api/deps.py` (`require_roles`), `app/api/v1/router.py`, `requirements.txt` (+`pymupdf`, +`python-multipart`), `.env.example`, `tests/conftest.py` (isolated `upload_dir`), `docs/DATA_API_CONTRACTS.md` (§9 Phase 3A amendments).
- **Roles**: upload = admin/creator; approve/delete/rule+claim mutations = admin only (server-side membership check; guests are admins of their isolated demo workspace, so the demo flow works end-to-end). Cross-workspace access returns 404 (no existence leak).
- **Verification (real commands, from `backend/` with `.venv/Scripts/python`)**: pytest **107/107 PASS** (66 Phase 1/2 regression + 41 new; MOCK none needed — no provider involved; LIVE_BACKEND SQLite/HTTP/filesystem); `ruff check` clean; `ruff format --check` 51 files clean; migration fresh-DB + idempotent-rerun + FTS trigger insert/delete verified; live uvicorn smoke on 127.0.0.1:8010: health/ready, 401 unauth, guest login, TXT upload, pending→approved gating, search hit with section/score, special-char query, rule+claim creation, idempotent duplicate, corrupt-PDF 400, missing-CSRF 403; **restart persistence PASS** (backend stopped/restarted on same SQLite; document + session + FTS search survived). LIVE_DEPLOYMENT not exercised (deployment not authorised in this phase).
- **Security review**: client filename never used in paths (server-generated under workspace-scoped UPLOAD_DIR); FTS query sanitiser strips all syntax/keywords (no MATCH injection); storage paths hidden from API responses; rules/claims may only link same-workspace documents; no document contents in logs; rate-limit counters DB-backed and restart-safe. Residual: single-instance DB counters (per contract), `X-Forwarded-For` trust unchanged from Phase 2A, concurrent same-title uploads rely on the unique constraint and could surface as 500 (single-writer MVP).
- **Known limitations**: lexical retrieval only (no paraphrase/semantic matching — honest empty results; `RetrievalService` protocol ready for Phase 3B semantic add-on); extracted-text cap silently truncates; a chunk spanning pages carries the page where it starts; old version files remain on disk after re-upload (metadata retained for audit; chunks removed from index).
- **Phase 3B integration contract**: `FtsRetrievalService.search(db, workspace_id=..., query=..., top_k=...) -> list[RetrievedChunk]` (chunk_id, document_id, document_title, doc_type, version, section_ref, page_number, text, score) is the evidence source for deterministic + Gemini findings; only `SUPPORTED` citations must resolve to these chunk IDs. Brand rules (`enabled`, matcher types) are ready for the deterministic rule engine; Gemini caching/token budgets deliberately deferred.
- Next action (needs explicit approval): Phase 3B — deterministic rule engine + submission/validation runs consuming this retrieval layer, then Gemini adapter per `docs/AI_VALIDATION.md`. Stop here; nothing committed, pushed or deployed.

## Phase 3A hardening pass — 2026-10-24

- **Agent**: Z Code assistant. Scope: focused hardening after Phase 3A provisional approval. No Gemini, no Phase 3B, no frontend changes, nothing committed/pushed/deployed. Base HEAD unchanged: `0a50954f82b2a6fd7f923112aa004649a99f3956`.
- **1. Truncation reported, not silent**: extraction caps (TXT and PDF) still bound memory, but a cap-hit now flags the version `extraction_status: "incomplete"` (added to the status vocabulary) instead of silently presenting partial text as whole; within-cap uploads stay `"extracted"`. `ExtractedDocument.truncated` carries the flag from extraction to the version row.
- **2. Duplicate-title conflicts controlled**: `IntegrityError` on the `(workspace_id, title)` unique constraint now maps to a stable `409 CONFLICT` (`DuplicateDocumentTitle`) instead of an unhandled 500 — covering the concurrent-upload race and any constraint hit at commit. Additionally, re-uploading a title whose row was soft-deleted no longer 500s (a real Phase 3A bug found while fixing this): the deleted row is **reactivated** (same document ID, audit versions kept, version numbering continues past them, status resets to `pending`), since the unique constraint makes a second row impossible.
- **3. Page spans accurate**: `knowledge_chunks` gains nullable `page_end` (migration `0003_chunk_page_span`, additive + backfill of legacy single-page rows). Chunking now merges small blank-line sections across page boundaries (same merge rule plain text always had) and every chunk reports its true inclusive page span — `page_number` (start page, semantics unchanged) + `page_end`. `section_ref` scheme (`s1, s2, …`) and chunk IDs unchanged. One existing Phase 3A search test (`test_pdf_page_metadata_preserved_in_results`) was updated to the span semantics: a two-short-page PDF now yields one chunk with span 1–2 rather than a chunk falsely labelled page 2 only.
- **Changed files**: `app/services/knowledge.py`, `app/services/retrieval.py`, `app/db/models.py`, `app/schemas/knowledge.py`, `app/api/v1/knowledge.py` (additive `page_end` on chunk/search outputs), `migrations/versions/0003_chunk_page_span.py` (new), `tests/test_knowledge_hardening.py` (new, 11 tests), `tests/test_knowledge_search.py` (span expectation), `docs/DATA_API_CONTRACTS.md` (§9: `page_end`, `incomplete` status, 409 duplicate-title contract).
- **Verification (real commands, from `backend/` with `.venv/Scripts/python`)**: pytest **118/118 PASS** (107 prior + 11 new hardening; one Phase 3A assertion updated as above); `ruff check` clean; `ruff format --check` clean. Migration `0003` verified on a fresh DB during the suite (auto-run at app startup) and idempotent-rerun checked. LIVE_DEPLOYMENT not exercised (deployment not authorised).
- **Known limitations remaining**: lexical retrieval only (unchanged); superseded version files remain on disk (unchanged, audit); `KnowledgeChunk` listing orders `section_ref` lexically (`s10` before `s2`) — cosmetic, chunks are normally consumed via FTS ranking; guest/demonstration data is synthetic. No blockers for Phase 3B.
- Next action (needs explicit approval): Phase 3B — deterministic rule engine + submission/validation runs consuming this retrieval layer, then Gemini adapter per `docs/AI_VALIDATION.md`.

## Phase 3B — Hybrid AI Validation Engine (backend), 2026-10-24

- **Agent**: Ayush Tripathi (Backend & AI) / Z Code assistant. **Not committed** — awaiting explicit user approval per operating contract. Base HEAD unchanged: `0a50954f82b2a6fd7f923112aa004649a99f3956`.
- Scope honoured: no frontend changes, no human-review/publication workflow, no LangChain/vector DB/Redis, no auth or SQLite changes, nothing pushed or deployed. All 118 prior backend tests preserved and passing.
- **Built**: hybrid brand-content validation engine — persistent submissions + immutable content versions, validation runs (state `pending/running/completed/partial/failed` with separate `ai_status` per docs/AI_VALIDATION §1), findings with server-assigned verification status, per-run evidence snapshots, deterministic rule engine (contains/exact/bounded-regex with nested-quantifier ReDoS guard; prohibited/restricted/preferred-terminology/messaging/claim-requirement categories), evidence retrieval reusing `FtsRetrievalService` (workspace-scoped, approved+active only), backend-only Gemini REST adapter (`httpx`, structured JSON output + Pydantic re-validation, typed failures, bounded retries default 0 never for 4xx, 25s timeout, honouring Retry-After), citation verification (claimed chunk IDs must resolve to the run's own evidence set AND contain the quote; otherwise dropped + downgraded to `NEEDS_VERIFICATION`), and the full cost-control stack: content-hash result cache (workspace-scoped, TTL 12h, key covers content hash + evidence set + rule versions + prompt version + model), single-flight lease with run-id handoff and stale-lease/stale-run recovery, per-user (guest 5 / user 20) + per-workspace (60) rolling-hour quotas + daily global provider budget (calls/tokens) → `429` or honest `skipped_budget`, idempotency-key replay (same run) / payload conflict (409), `provider_usage` ledger (outcome/tokens/latency; never credentials or user text).
- **Synchrony ADR**: `POST /submissions/{id}/validate` is synchronous (finished run in the response; replayed keys and in-flight duplicates return the original/live run). Documented in `docs/DATA_API_CONTRACTS.md` §10.
- **Added**: `app/db/models.py` (8 new tables), `migrations/versions/0004_validation.py` (additive), `app/services/rules_engine.py`, `app/services/gemini.py`, `app/services/validation.py`, `app/schemas/validation.py`, `app/api/v1/validation.py`, `tests/helpers_3b.py` + 5 test files. **Modified**: `app/config.py` (Gemini + validation settings), `app/main.py` (provider in app state), `app/api/v1/router.py`, `requirements.txt` (+`httpx`), `.env.example`, `docs/DATA_API_CONTRACTS.md` (§10).
- **Endpoints**: `POST/GET /submissions`, `GET /submissions/{id}`, `POST /submissions/{id}/versions`, `POST /submissions/{id}/validate` (creator roles + CSRF; guest/user/workspace quotas), `GET /validation-runs`, `GET /validation-runs/{id}` (member). Cross-workspace access is 404 (no existence leak); empty text 422; oversize 413; replay/conflict/idempotency semantics per §10.
- **Verification (real commands, from `backend/` with `.venv/Scripts/python`)**: pytest **173/173 PASS** (118 regression + 55 new); `ruff check` clean; `ruff format --check` clean (67 files). Migration `0004` verified on fresh DBs throughout the suite (auto-run at startup); a first-draft migration bug (SQLite cannot ALTER-add a unique constraint) was caught by the `/ready` regression tests and fixed by inlining the constraint. Coverage classes: MOCK = Gemini mocked ONLY at the provider boundary (`FakeGeminiProvider` on `app.state`, plus `httpx.MockTransport` for the adapter's HTTP layer); LIVE_BACKEND = SQLite/HTTP/FTS5 everywhere else. **LIVE_PROVIDER Gemini: NOT VERIFIED** — no `GEMINI_API_KEY` is configured locally (backend `.env` holds Firebase settings only); a small budget-controlled real smoke test remains for when a key is provisioned. LIVE_DEPLOYMENT not exercised (not authorised).
- Negative paths covered: provider timeout / 429 / 5xx / invalid output / missing key → honest `partial`/`unavailable`, never fake completion; daily budget exhaustion → `skipped_budget`; fabricated citation rejected; quote-not-in-chunk downgraded; unapproved knowledge never cited; deterministic engine works with zero AI; catastrophic regex skipped fast; empty/oversize submissions rejected; cross-workspace 404 + cache isolation; same content in two workspaces costs two provider calls; restart persistence of runs/findings/evidence; stale running runs swept to `failed`.
- **Security review**: API key server-side only, never logged or echoed (4xx provider detail mapped to a status class); prompts logged nowhere; findings/evidence scoped per workspace and per run; AI suggestions never modify submitted content; idempotency and cache keys embed workspace identity so results cannot cross tenants; rate-limit counters and leases are DB-backed (restart-safe). Residual limitations: lexical-only retrieval; single-instance leases/counters (per contract); `X-Forwarded-For` trust unchanged; heuristic (conservative) ReDoS filter; cache stores verified AI findings only while deterministic findings are recomputed each run.
- Next action (needs explicit approval): Phase 3B review, then either the real-Gemini key smoke test or Phase 4 work per `docs/ROADMAP.md`. Stopped here; nothing committed, pushed or deployed.


---

## Phase 3C — UI Design Alignment & Validation Suite Frontend, 2026-10-24

- **Agent**: Akhand Shukla (Frontend & Product UI Lead) / Antigravity assistant. **Not committed** — awaiting explicit user approval per operating contract. Base HEAD unchanged: `0a50954f82b2a6fd7f923112aa004649a99f3956`.
- **Scope & Aesthetics**:
  - Implemented the user-approved **Neumorphism (Soft UI) + Premium Minimalism** design alignment inspired by the reference dashboard.
  - Off-white cool canvas (`#eef2f6`), dual-directional soft raised shadows, inset search & input controls, royal blue (`#2563eb`) accents, and a charcoal dark mode (`#101318` canvas / `#171c24` surfaces) with persistent system preference detection + manual toggle.
  - High-contrast, WCAG AA accessible text and keyboard focus rings; reduced-motion respect.
  - Zero mock finance/calendar/Gantt charts; layout dedicated 100% to BrandSentry brand governance domain.
- **Pages & Components Built**:
  1. **Overview Dashboard (`/`)**: 4 KPI cards (Guidelines count, Brand Rules count, Submissions count, Validation Runs count) with live backend metrics; quick governance action triggers; transparent engine status callout; preserved Phase 1 `/status` connectivity panel and architecture guarantees.
  2. **Brand Knowledge Vault (`/vault`)**: Ingestion interface for PDF/TXT files (capped at 5MB, magic-byte inspection), document table with active version and chunk count, admin "Approve" / "Delete" actions; structural chunk inspector modal; Brand Rules engine management (matcher types `contains`, `exact`, bounded `regex`); approved claims register; and live lexical FTS5 BM25 search tester.
  3. **Content Studio (`/studio` and `/studio/:id`)**: Draft editor with 12,000 character limiter and live counter, workspace submissions drawer, immutable revision history with SHA-256 digests, and synchronous validation execution button (`validateContent`).
  4. **Validation Runs (`/runs`)**: Complete history table of workspace validation runs displaying run state (`completed`, `partial`, `failed`), AI status (`complete`, `unavailable` deterministic-only, `skipped_budget`), cache hit pill, finding count, duration/latency, and timestamp.
  5. **Evidence & Findings (`/runs/:runId`)**: Deep run inspector presenting transparent provider disclosure (honestly stating when Gemini is unconfigured without hallucinating AI findings), categorized findings (severity badges, deterministic vs AI source, `SUPPORTED` vs `NEEDS_VERIFICATION` statuses, flagged snippet, explanation, suggested replacement with 1-click copy), and cited evidence snapshot excerpts with page numbers.
  6. **Approvals & Insights**: Explicitly displayed with lock badge and disabled state as Upcoming (Phase 5) — zero fake API endpoints or fabricated workflows.
  7. **Responsive Shell & Navigation**: Persistent desktop sidebar, mobile off-canvas drawer with focus trap, global header with inset search and status badge, and theme toggle.
- **Client & Services Added**:
  - `frontend/src/services/brand-api.ts`: full TypeScript client for all Phase 3A & 3B endpoints, handling credentials, cookies, and CSRF token propagation.
  - `frontend/src/types/knowledge.ts` and `frontend/src/types/validation.ts`: authoritative frontend schemas mirroring backend Pydantic models.
  - `frontend/src/context/theme-context.ts` & `frontend/src/context/ThemeProvider.tsx`: system preference detection + persistent local storage theme manager.
- **Verification & Test Evidence**:
  - Frontend vitest: **10 test files, 71 tests passed (100% PASS)** (61 regression + 10 new Phase 3 tests).
  - TypeScript typecheck: `tsc --noEmit` **clean (0 errors)**.
  - ESLint: `eslint . --max-warnings 0` **clean (0 errors, 0 warnings)**.
  - Production build: `vite build` **successful (0 errors)**.
  - Backend pytest: **173/173 PASS** (regression preserved).
- **Next action**: User review of the aligned UI. No commit, push, or deployment performed.

## Phase 3C frontend redesign refinement — 2026-10-24

- User explicitly requested inspection, a plan, then implementation; no commit/push/deployment. Prior recorded official build window is October 22–25. Base HEAD remains `0a50954f82b2a6fd7f923112aa004649a99f3956`; pre-existing uncommitted work preserved.
- Updated files: `frontend/src/index.css`, `frontend/tailwind.config.js`, `src/app/App.tsx`; Header, Sidebar, Navigation, Card, ThemeToggle and StatusBadge; ThemeProvider; Overview/ConnectivityPanel, Vault, Studio, Runs and Findings; `tests/App.test.tsx`, `tests/ContentStudio.test.tsx`, new `tests/ThemeToggle.test.tsx`, new `e2e/redesign.spec.ts`; local licensed fonts, UI registry, reports and synthetic browser screenshots.
- Delivered: Raspberry/Pale Sky accent system, charcoal dark surfaces, quieter neumorphism, Inter product text and selective DynaPuff display type; original animated keyboard-accessible day/night switch with persistent preference, system Auto and reduced motion; readable mobile tables/forms and evidence; keyboard run/version selection; truthful suggestions, missing values and clipboard feedback. No backend/client schema or auth contract changes.
- Actual checks: frontend lint/typecheck/build PASS; Vitest **77/77 PASS**; backend pytest **173/173 PASS**; full Chromium Playwright **12/12 PASS**, including real local guideline → rule → submission → validation → finding/evidence, theme checks, mobile layouts and existing auth/incognito/restart coverage. Provider failures/security/persistence negatives also remain covered by backend regressions.
- Coverage: MOCK UI/API units and explicit browser fault cases; LIVE_BACKEND HTTP/SQLite/filesystem/browser flow. LIVE_PROVIDER Gemini/Google and LIVE_DEPLOYMENT not exercised in this update. No live URLs added; local test origins only (`http://127.0.0.1:5174`, API `http://127.0.0.1:8002`). Test processes stop after verification. Non-failing Router future and Starlette/httpx deprecation warnings remain.
- Visual QA corrected dark shell backgrounds and mobile table squeezing. Details/evidence: `frontend/PHASE_3C_REDESIGN_REPORT.md`, `frontend/evidence/phase3c-redesign/`, current baseline at top of `frontend/ui-registry.md`.
- Next action: user visual review; obtain separate approval before commit, push or deploy. No claim of completing unbuilt human approvals or the overall product phase.

## Phase 4A — pre-deployment audit, 2026-10-24

- Verdict **BLOCKED for release**; full findings, exact future Railway/Vercel checklists, environment-name inventory, coverage and rollback plan: `docs/PHASE_4A_RELEASE_AUDIT.md`. HEAD remains `0a50954f82b2a6fd7f923112aa004649a99f3956`; no commit, push or deployment. Existing Phase 2–3C work preserved.
- Only dependency source change: `frontend/package.json` and `frontend/package-lock.json`, exact Vitest **4.1.12**; removed Tinypool/vite-node/obsolete nested Vite. npm audit **15 → 9 affected entries**, critical **2 → 0**, high **5 → 4**, moderate **8 → 5**. High Firestore/gRPC chain and moderate Router/Tailwind chains remain documented. No forced fix or transitive override.
- Real checks: backend pytest **173 passed**, Ruff lint/format passed (**67 files**), pip check passed; frontend **77 tests** passed, lint/typecheck/production build passed; Chromium **12/12** passed. Separate relative-base production bundle + local proxy smoke passed guest issuance, HttpOnly/CSRF, reload/restart restoration, Origin/CSRF rejection, API routing and logout/deletion. This is LOCAL LIVE, not Vercel edge/deployed proof. Secure was disabled only for the isolated HTTP-loopback diagnostic; production must be HTTPS/Secure.
- Python dependency audit ran from an isolated ignored tooling venv against the backend environment: one moderate pytest advisory returned twice; no installed runtime advisory reported. Backend requirements were not changed.
- Synthetic MOCK diagnostics independently reproduced: daily one-call budget permits two failed-provider attempts; non-Google Firebase provider accepted; unrelated conclusion marked SUPPORTED based on phrase overlap; duplicate submission title returns 500; private response cache headers absent; unusable upload directory still returns readiness 200. No business fixes were made.
- Gemini smoke **LIVE_PROVIDER PASS on replacement-key continuation**: fresh dotenv/Settings check confirmed GEMINI_API_KEY and GEMINI_MODEL nonempty and matching ignored backend/.env without displaying values. Prior preflights made no calls. Exactly **1 actual request**, **0 retries**, Gemini **HTTP 200**, validation API **200**, `completed`/`complete`, cache miss, **381 input + 280 output = 661 total tokens**, **17,174 ms** provider latency. Existing pipeline parsed structured output, retrieved one synthetic approved source, verified cited IDs and persisted one deterministic + two AI findings. API readback matched, a new app/DB engine retained the run, and exactly one usage row existed. Run `run_5fa0cf93d3df4292b7d81cf7dffa01cd`; status/usage-only evidence in ignored `.data/phase4a/live-result.json`. Request guard is now consumed: **do not repeat without new authorization**. This does not resolve the known semantic-support verifier bug or establish LIVE_DEPLOYMENT.
- Bounded secret inspection: no sensitive filename/token/private-key matches in scanned tracked/untracked text/index or 263 historical blobs; nothing staged. Existing Admin file reference validated as outside repo and matching backend project without exposing path/content. Env/database/upload files remain ignored. Evidence JSON is status-only; contact-sheet review of 25 synthetic/login/signed-out PNGs found no obvious personal data. Test screenshots were regenerated normally.
- Added audit report and this handoff. Diagnostic logs/results, synthetic DB/uploads, relative build and tooling venv are ignored in `.data/phase4a/`; do not stage them. No new live URLs. Before report: 37 modified tracked files, 58 untracked directory/file entries, zero staged.
- Next action: user reviews/approves focused release fixes, then review/retest the preserved slice before separately approved commit/push/deployment. The single live Gemini allowance is consumed; no further provider call authorized. Remote Railway/Vercel/Firebase configuration and LIVE_DEPLOYMENT remain unverified. Full content review/audit/insights features remain future scope.

## Phase 4B — release-blocker remediation (budget, Google-only, evidence support), 2026-10-24

- **Agent**: Z Code assistant (senior backend security/reliability brief). Scope: ONLY the three confirmed Phase 4A blockers. No commit, push or deployment; nothing else changed. Base HEAD unchanged: `0a50954f82b2a6fd7f923112aa004649a99f3956`.
- **Fix 1 — provider budget hard cap**: daily Gemini budget is now enforced by atomic per-day reservations (`provider_budget_days`, migration `0005_provider_budget_reservation`, additive) taken BEFORE every real attempt — initial call and each retry via a `reserve_attempt` guard in `GeminiProvider.analyze` (`ProviderBudgetExhausted` aborts before network I/O). Failed/timeout/rate-limited attempts consume their reservation exactly like successes (the Phase 4A bypass — `outcome='error'` excluded from the ledger count — is closed); reservations are conditional UPDATEs under SQLite's single-writer lock, so concurrent distinct requests cannot collectively overshoot. Token reservations are estimated pre-call (~chars/4 + overhead) and reconciled with provider-reported usage after success (refund or honest overshoot). `provider_usage` remains the observability ledger (attempted/ok/failed outcomes), no longer the enforcement source. Caching, idempotency and single-flight semantics unchanged (cache hits and replayed keys reserve nothing).
- **Fix 2 — Google-only Firebase**: `FirebaseVerifier.verify` now accepts only SDK-verified `firebase.sign_in_provider == "google.com"`; password/phone/anonymous/custom/federated tokens are rejected (`FirebaseTokenInvalidError`). The claim comes only from the verified payload, never client input. Default-app reuse ("already exists") now validates the existing app's `project_id` matches; mismatch → honest 503.
- **Fix 3 — conservative evidence support**: `_verify_ai_findings` now also checks **content anchoring** (the finding's quote must appear in the submitted content; otherwise citations are dropped) and preserves the source-ID-membership and exact-quote-in-chunk checks. Semantic support ("does this source support this conclusion?") is not machine-verifiable in this MVP, so AI findings are never auto-elevated to `SUPPORTED` by citation checks alone — they stay `NEEDS_VERIFICATION` with an explicit reason stating what was and was not verified; authentic citations are still retained as `evidence_chunk_ids` for the reviewer. Deterministic findings keep `SUPPORTED` (exact rule matches). Contract wording updated in `docs/DATA_API_CONTRACTS.md` §10 (no JSON shape change — frontend vocabulary untouched).
- **Changed**: `app/services/validation.py`, `app/services/gemini.py`, `app/services/firebase.py`, `app/db/models.py`, `migrations/versions/0005_provider_budget_reservation.py` (new), `docs/DATA_API_CONTRACTS.md`, `tests/conftest.py`, `tests/helpers_3b.py`, `tests/test_validation_evidence.py` (one test updated to the conservative policy), `tests/test_budget_accounting.py` (new, 5), `tests/test_evidence_support.py` (new, 4), `tests/test_auth_google.py` (+2).
- **Test-suite hardening**: `conftest.py` and `validation_settings` now default `gemini_api_key=None` so a locally configured key in the ignored `backend/.env` can never turn automated tests into live provider traffic.
- **⚠ Incident disclosure**: my FIRST full-suite run was executed without blanking the provider key; two tests that exercise the real-provider path when a key is present (`test_validation_without_gemini_key_is_honest_partial`, `test_evidence_snapshot_survives_document_deletion`) loaded the real `GEMINI_API_KEY` from the ignored local `.env` and made up to 2 unintended live Gemini requests (the first test failed its assertion as a result, exposing the issue). This was a test-harness environment mistake, not a product-code defect; the conftest/helpers guard now makes recurrence impossible, and all subsequent runs (including the final full suite) were key-blank and provider-free. Live-request budget discipline for future sessions: always run pytest with `GEMINI_API_KEY=""` until a dedicated test-key policy exists.
- **Verification (real commands, from `backend/` with `.venv/Scripts/python`, GEMINI_API_KEY blank)**: pytest **184 passed** (173 regression incl. the one updated evidence test + 11 new); `ruff check` clean; `ruff format --check` **70 files clean**; frontend `npm test` **77/77 passed** (finding shape unchanged). Migration `0005` verified on fresh DBs across the suite. Coverage: MOCK provider/verifier boundaries, LIVE_BACKEND SQLite/HTTP; NO live Gemini or Firebase requests (by design). LIVE_DEPLOYMENT not exercised (not authorised).
- **Remaining security limitations (unchanged from Phase 4A)**: per-actor/workspace/IP quotas still count-then-write (non-atomic; only the daily provider budget is reservation-atomic); retries beyond the adapter's cap of 2 and token-estimate accuracy remain bounded-but-approximate; provider budget is single-instance SQLite (per contract); X-Forwarded-For trust, request-body caps, private cache headers, upload-dir readiness, proxy IP semantics and dependency advisories are separate Phase 4A findings NOT addressed here.
- **Next action**: user review of this remediation; then the remaining Phase 4A high findings (cache policy, storage readiness, body limits, proxy trust) in separately approved focused tasks. No commit/push/deployment performed.

## Phase 4C — final release hardening, 2026-10-24

- **Agent**: Z Code assistant (independent senior security/release brief). Scope: verify Phase 4B, fix the remaining Phase 4A production blockers, validate deployment configuration, run all suites, release-gate verdict. No commit, push or deployment; HEAD unchanged `0a50954f82b2a6fd7f923112aa004649a99f3956`. Full report: `docs/PHASE_4C_RELEASE_REVIEW.md`.
- **Phase 4B independently verified** (mocked provider boundaries, GEMINI_API_KEY blank): atomic pre-call budget reservation incl. failed/timeout/429/retry attempts; Google-only Firebase enforcement; conservative NEEDS_VERIFICATION evidence policy; test suites cannot reach the live provider (conftest hard-defaults the key to None).
- **Blockers fixed**: (1) origin `Cache-Control: private, no-store` middleware on every response + Vercel CDN no-store for `/api`; (2) `/ready` write-probes DB dir AND `UPLOAD_DIR` (`uploads` component, 503 on failure) + fail-closed production startup for non-absolute storage paths; (3) `app/core/bodylimit.py` — Content-Length 413 before buffering, chunked-stream abort at cap (multipart 5 MiB+1 MiB overhead, JSON 256 KiB, other 1 MiB); (4) client IP = rightmost X-Forwarded-For entry (spoof-proof per-IP limits); (5) `firebase` metapackage → exact `@firebase/app@0.16.4` + `@firebase/auth@1.13.8` (same shipped versions; only two import lines changed) — npm audit 9→5 entries, high 4→0, critical 0; pytest ≥9.0.3 (dev-only advisory resolved); (6) duplicate submission title now stable 409 (was 500).
- **Deployment config**: `frontend/vercel.json` now same-origin `/api` proxy (placeholder `REPLACE-WITH-RAILWAY-DOMAIN` to substitute at deploy) + SPA fallback + no-store headers; `DEPLOYMENT_RUNBOOK.md` §1/§2/§5 reconciled (obsolete env names removed, empty `VITE_API_BASE_URL`, new acceptance rows); contract §11 documents 413/cache/409/ready changes (no JSON shape changes).
- **Real verification**: backend pytest **196 passed + 1 win32-skip**, Ruff clean (73 files), pip check clean, pip-audit **zero findings**; frontend **77/77** unit, lint/typecheck/build PASS, Chromium e2e **12/12**; npm audit 0 critical/0 high (5 moderate = react-router 7 / tailwind 4 major migrations, deliberately not forced); same-origin proxy smoke **PASS** (origin-emitted no-store verified with verbatim header forwarding, early 413, spoofed-XFF limiting 201/201/429, guest flow, HttpOnly+CSRF cookies, restart persistence, logout revocation/cookie deletion, JSON 404) — `.data/phase4c/proxy-result.json`.
- **Verdict: READY TO DEPLOY** conditional on the exact Git→Railway→Vercel procedure in `docs/PHASE_4C_RELEASE_REVIEW.md` §5 (substitute the Railway domain in vercel.json; volume `/data` before traffic; single instance; Firebase authorised domain; deployed incognito smoke + restart + backup/restore). LIVE_DEPLOYMENT evidence does not exist until that runs; no further live Gemini calls without new authorisation (4A allowance consumed).
- Harness honesty notes: toy-proxy keep-alive needed `agent:false` (uvicorn 5s idle close); fresh diagnostic DB on first start only; `VITE_API_BASE_URL=` must be explicitly empty at build; `ENFORCE_PRODUCTION_STORAGE_PATHS=false` only for the Windows loopback diagnostic. All diagnostic artifacts under ignored `.data/phase4c/`.
- Next action: user reviews this report; on explicit approval commit staged explicit paths, then execute the §5 deployment procedure and record evidence in runbook §9. Stopped after the final release review.
# Approved frontend visual refresh — 2026-10-24

- Implementation commit: `b4dcf30a4d62571408414820f790b4f86e7b550e`.
  User approved the plan and replaced Superpop with their supplied
  `ShineTypewriter.ttf`. No push or deployment performed.
- Changed: `frontend/src/index.css`, `tailwind.config.js`, shared branding and
  navigation/status components, login/session copy, overview bento layout,
  Vault/Studio/Runs/Findings copy and disclosures, 404 dark-mode text,
  `frontend/index.html`, supplied shield/font assets, existing UI/E2E assertions,
  font provenance README and `frontend/ui-registry.md`.
- API/data/auth/provider behavior unchanged. Dashboard diagnostics remain under
  Connection details, with a visible retry message on failures. Analysis metadata
  remains under details. All existing workflow actions, source links, versions,
  evidence and explicit AI-unavailable/verification boundaries remain intact.
- Verified real commands: frontend `npm run lint`, `npm run typecheck`,
  `npm run build` all pass; `npm test` 77/77; `npm run test:e2e` 12/12.
  Backend with Gemini key empty: `./.venv/Scripts/python.exe -m pytest -q`
  196 passed / 1 Windows-platform skip; existing Starlette/httpx deprecation.
- Coverage: MOCK external boundaries plus LIVE_BACKEND local SQLite/HTTP,
  synthetic guideline→rule→content→finding/source flow, guest restart/expiry/
  isolation/CSRF/logout, outage recovery, keyboard/theme/mobile checks to 320px.
  No LIVE_PROVIDER Google/Gemini or LIVE_DEPLOYMENT tests in this change.
- Evidence/review: `docs/UI_REFRESH_REVIEW.md`; local screenshots under
  `frontend/evidence/phase3c-redesign/` and `frontend/evidence/phase2b/`.
  No new live URLs. Original untracked evidence and pre-existing modified
  `frontend/tsconfig.tsbuildinfo` left outside the implementation commit.
- Remaining limit: supplied ShineTypewriter has no accompanying license
  document; provenance is recorded, and no SIL license is claimed for it.
  Next action: user visual review; release only with explicit push/deploy
  authorisation and the existing deployment checklist.

# Separate dark/light reference implementation — 2026-10-24

- Code commit: `be63bb5cd174f349d03daa4313f4c81ddd386f42`.
  User asked to follow the 9.25 PM image for dark, then supplied the 9.39 PM
  image as the light reference while work was active. Both were incorporated.
- Changed: `frontend/src/editorial.css` (theme tokens, portrait/bento/card/banner
  layout and responsive shell), `OverviewView.tsx`, `App.tsx`, `main.tsx`, compact
  `SessionProfile.tsx` disclosure, supplied-reference artwork, existing App/E2E
  assertions, visual registry, asset provenance and reference QA documentation.
- Dark: black panels, pink headline/actions and lime hero CTA/secondary accents.
  Light: paper ivory, emerald type/portrait and banner, vermilion accents and
  print-style disks/halftone/orbit artwork. Existing shield and ShineTypewriter
  preserved. All workflow handlers/services/types/backend contracts unchanged.
- Real commands: frontend lint/typecheck/build passed; `npm test` 77 passed;
  full `npm run test:e2e` 12 passed, final targeted redesign suite 2 passed after
  last CSS updates. Backend with provider key empty: pytest 196 passed, 1 skipped
  (existing Windows/POSIX volume-path limitation), existing Starlette warning.
- Coverage: MOCK external boundaries and local LIVE_BACKEND HTTP/SQLite browser
  flow, auth isolation/expiry/restart/CSRF/logout, synthetic guideline→rule→draft→
  finding/source flow, 320–1584px layouts, keyboard/theme/reduced-motion/contrast.
  Theme-specific image visibility and real portrait loading now checked too.
  No LIVE_PROVIDER Google/Gemini or LIVE_DEPLOYMENT check/request performed.
- Visual evidence: latest `design-qa.md` has `final result: passed`; reference
  comparisons and source-sized captures in `frontend/evidence/phase3c-redesign/`.
  Actual Codex in-app browser inspected, console errors returned empty. Artwork
  prompt briefs/provenance: `frontend/public/images/EDITORIAL_ASSETS.md`.
- Local preview left running and marked deliverable: `http://127.0.0.1:5175/`,
  with isolated local API on `127.0.0.1:8003`, no Gemini key. No public URL,
  push or deployment. Existing untracked evidence and modified tsbuildinfo left
  outside commits. Next action: user visual review; release remains separately
  authorised. P3: original transparent PNGs can be optimized for delivery later.

## Phase 5A — human review backend — 2026-10-24

- Backend code commit: `075222084e833b912a67fd296f22696bb795ce7e`;
  base `f85436bb8aed95840416393f3258e85d7fc10aef`. User authorised this
  backend slice; no frontend changes, live provider calls, push or deployment.
- Added GET `/api/v1/validation-runs/{run_id}/review`, POST
  `/api/v1/validation-runs/{run_id}/review/findings/{finding_id}`, POST
  `/api/v1/validation-runs/{run_id}/review/decision`. Cookie auth, workspace
  checks, admin/reviewer role, CSRF, required replay key and expected revision.
- Migration `0006_human_review`: per-run `review_states` plus immutable
  `review_decisions` serving as the audit ledger; actor/name/role/demo snapshot,
  UTC timestamp and notes. SQLite writer lock + revision and unique constraints
  prevent silent concurrent overwrite. Decision UPDATE/DELETE triggers and
  restrictive FKs protect history; projection and audit commit atomically.
- Accept means issue exists; reject dismisses with required justification;
  flag stays unresolved. All findings must be accepted/rejected to finalize.
  Approval requires complete validation and no accepted issues; partial runs
  permit request changes. Final runs lock. New versions/runs start a separate
  review; `is_current` prevents historical approvals applying to new content.
- Real authors cannot self-review (including admins); isolated guest demo
  self-review is explicitly labelled. Findings/evidence/verification/content
  and existing submission validation statuses are never rewritten.
- Final full backend suite: `$env:GEMINI_API_KEY=''; .venv/Scripts/python -m
  pytest -q` **231 passed, 1 skipped**, 136.58s. Phase 5A suite **35 passed**.
  Ruff check/format both pass, 78 files. Existing Windows/POSIX skip and
  Starlette deprecation warning remain. Local TCP/uvicorn process-restart
  smoke passed: session/review/receipt persistence, CSRF, private/no-store.
- Coverage: LIVE_BACKEND local ASGI/SQLite/filesystem/TCP; MOCK provider and
  verifier boundaries. LIVE_PROVIDER and LIVE_DEPLOYMENT unexercised, zero
  live Gemini/Firebase requests. No public URLs. Owned temporary smoke backend
  stopped and its files removed; frontend tests were outside backend-only scope.
- Changed: backend review route/schema/service, router, models, migration,
  35 tests; architecture/API contracts, Phase 5A task, completion report,
  this handoff. No new dependencies or infrastructure.
- Antigravity: read `docs/DATA_API_CONTRACTS.md` §12 and
  `docs/PHASE_5A_COMPLETION_REPORT.md`. Render stored evidence from review GET,
  send revision/key on writes, reuse identical keys only for exact retries,
  reload on success/409, distinguish human state from machine status and
  require `is_current` for a current approval. Provision a separate real
  reviewer server-side; no invitation/role-management API was added.
- Local review found no unresolved implementation blockers. Remaining work:
  separately authorised frontend integration/browser tests and eventual
  deployed incognito/persistent-volume smoke. Follow existing release backup
  policy before migration; downgrading drops review history. Stopped at 5A.


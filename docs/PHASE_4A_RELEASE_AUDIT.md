# Phase 4A release audit — 2026-10-24

**Verdict: BLOCKED for release.** Local regression suites and the controlled live Gemini smoke pass, but authentication topology, private-response cache policy, provider spending controls, evidence labels and production storage checks need fixes. Exactly one actual Gemini request was performed, with zero retries. No commit, push, deployment or remote configuration change was performed.

Base HEAD: `0a50954f82b2a6fd7f923112aa004649a99f3956`. Review used the architect and review skills, the requested context, PRD, decisions, roadmap, current task inventory, Git changes and implementation. `tasks/` contains only phase-01; there is no Phase 4 task file. The current user brief is this audit's scope. Planning-era status fields in older documents are stale; HANDOFF records the approved October 22–25 build window. Human content decisions/audit/insights are still future work, not implemented Phase 3 functionality.

## 1. Findings

No confirmed tracked-secret exposure or remaining critical dependency advisory was found by the checks below. This is a bounded inspection, not a guarantee against every encoding or secret type.

### High — address before release

1. **Cross-origin CSRF restoration is incompatible with the current frontend.** `AuthProvider.restore` obtains CSRF from `document.cookie`; `/auth/me` deliberately returns an empty CSRF token. Cookies scoped to Railway are unreadable to JavaScript on Vercel. `brand-api.ts` reads the cookie for every mutation, so Vault/Studio actions can fail even immediately after cross-origin login. `frontend/vercel.json` currently rewrites everything, including `/api`, to `index.html`. Use the same-origin candidate below and an explicitly empty frontend API base. Local proxy proof passed; actual Vercel Set-Cookie/Origin/header propagation is unverified.

2. **Global provider budget is not a hard request cap.** `validation._budget_usage` excludes `outcome="error"`; reservations happen only after a response, with no atomic pre-call capacity reservation. Synthetic reproduction with a one-call budget made TWO mocked provider attempts returning server errors. Distinct concurrent fingerprints can overshoot limits; per-fingerprint leases do not provide a global concurrency ceiling. Retries, if enabled, also lack separate attempt reservations. Keep retries disabled; reserve each actual attempt atomically and account for errors, unknown-token reservations and reconciliation. Actor/workspace/IP counters also use count-then-write rather than an atomic reservation. Daily actor limits, costly-route IP ceiling and global concurrent-call cap from AI_VALIDATION are absent.

3. **Firebase Google-only enforcement is incomplete.** `FirebaseVerifier.verify` accepts any nonempty `firebase.sign_in_provider`. A mocked verified `password` claim was accepted. Require exactly `google.com` after SDK verification. This is a missing provider restriction, not evidence that signature verification can be bypassed. Also validate the project when reusing the SDK default app; the current initialization catches “already exists” without checking it. No authentication logic was changed during this audit.

4. **AI `SUPPORTED` overstates what the verifier proves.** `_verify_ai_findings` checks supplied chunk membership and whether a quote occurs in the chunk. A synthetic unrelated conclusion quoting “EcoBlend” was labelled SUPPORTED. It does not establish that the source supports the conclusion, nor that the quote occurs in the submitted content. Normal valid findings can conversely be downgraded because their submitted-content quote is absent from policy wording. Require content anchoring and a defensible support policy; use NEEDS_VERIFICATION when conclusion support cannot be established. Keep model suggestions advisory.

5. **Durable production storage is configuration-dependent and incompletely checked.** Defaults remain local `.data` paths even in production. `/ready` checks the database parent, not `UPLOAD_DIR` or an actual `/data` mount; an unusable upload path still returned 200 in the diagnostic. Fail readiness/startup for inappropriate production paths and failed write probes for both locations. Railway volume attachment and persistence remain unverified. Set both locations explicitly as in the checklist; never assume a container directory persists.

6. **Private API cache policy is absent at the origin.** `/auth/me` has neither Cache-Control nor CDN-specific no-store headers; the business GET client also lacks an explicit browser no-store setting. No shared-cache leak was demonstrated locally, but do not enable a public external rewrite without explicit private/no-store policy. Apply it to every `/api` response, including errors and cookie issuance/deletion. Prefer origin middleware plus edge defense; no `s-maxage`, public caching, ISR or stale serving for authenticated data.

7. **Upload/request resource limits are incomplete.** The 5 MiB file check occurs after Starlette has parsed/spooled the multipart body. There is no whole-request streaming cap before parsing, general JSON-body byte cap or extraction wall-clock deadline. Extracted text has a 200k-character cap, but compressed/expensive PDFs still require resource containment. Add early streaming body enforcement (including chunked requests), bounded multipart fields/counts and bounded extraction. Raw file/content limits alone do not bound all request costs.

8. **Proxy IP trust is unproven.** `get_client_ip` trusts the first raw X-Forwarded-For entry. This affects guest limits and is unsafe unless the complete Railway/Vercel ingress chain overwrites or validates it. Verify trusted hop semantics, use the authoritative client address and test spoofed forwarding headers through the deployed route. Do not solve this by trusting arbitrary forwarding headers.

9. **High dependency chain remains.** Firebase's unused Firestore packages retain `@grpc/grpc-js@1.9.16`; npm reports four affected package entries at high severity for two underlying gRPC advisories. Source imports only Firebase app/auth; no Firestore feature was introduced. This reduces direct app exposure, but is not a clean dependency audit. Evaluate an upstream fixed Firebase release or a separately reviewed app/auth-only dependency choice; any gRPC override requires compatibility verification. Do not accept npm's Firebase 9 downgrade automatically.

### Medium / operational gaps

- Duplicate submission titles in one workspace return **500**, reproduced with synthetic data. Map the uniqueness conflict to documented 409 instead of an unhandled SQLAlchemy error. Exception logging can include SQL parameter values; configure parameter hiding/sanitized logging so confidential titles/text cannot appear in errors.
- Copying `backend/.env.example` verbatim fails Settings validation because blank SESSION_COOKIE_SECURE is not a nullable Boolean. Blank SESSION_COOKIE_SAMESITE is also not an acceptable cookie policy. Omit optional settings to use defaults, or supply explicit valid values.
- Remaining npm moderates: react-router/react-router-dom and Tailwind's postcss-nested/postcss-selector-parser chain (five affected entries). Router 7.18+ and Tailwind 4 are major migrations, not safe automatic fixes for this audit. No attacker-controlled Link target or SSR hydration path was established here. Preserve the advisory record and test a focused migration.
- Installed pytest 8.4.2 has moderate [GHSA-6w46-j5rx-g56g](https://github.com/advisories/GHSA-6w46-j5rx-g56g), a Unix temporary-directory issue, fixed at 9.0.3 according to pip-audit. The current dev constraint excludes pytest 9. Audit returned the same ID twice, not two distinct vulnerabilities. No installed runtime-package advisory was reported. Do not include dev requirements in Railway.
- Backend dependencies have ranges rather than a reproducible lock; production runtime/Python and filesystem have not been independently exercised on Linux. Local verification used Python 3.13.5 and Node 24.14.0/npm 11.9.0. Pin a supported runtime and freeze/retest deployment requirements before claiming reproducibility.
- Migrations run at runtime and report failure through readiness, but failed migrations do not prevent other routes from accepting requests. No cross-process migration lock exists. Single replica/worker and failed-readiness traffic rejection are required; prefer fail-closed startup.
- `/ready` has no Firebase capability probe and returns database error/path detail publicly on failure. Successful readiness does not prove Google or Gemini access. Firebase default-app project reuse remains a separate issue above.
- No backup/restore exercise, Railway-volume restart test or deployed incognito smoke exists for this release. Human content review, decisions/audit trail and insights remain absent, so the full PRD/Round 2 gate is also incomplete. Guideline approval is not content approval.
- DEPLOYMENT_RUNBOOK still lists obsolete/unimplemented signing/AI variable names and recommends the cross-origin API base. Use the implemented inventory and proposed topology below until the runbook is reconciled.

## 2. Changes made

### Reproduction record for the three confirmed business blockers

These diagnostics used synthetic data and mocked provider boundaries, not a live Gemini/Firebase token. No fixes to these functions were applied.

| Finding | Exact diagnostic setup | Observed result | Proposed correction and regression gate |
| --- | --- | --- | --- |
| Failed-attempt call budgeting | New migrated temp SQLite DB; `gemini_calls_per_day=1`; guest actor; `FakeGeminiProvider(error=ProviderError("Synthetic provider 500"))`; create two submissions titled `Synthetic 0` / `Synthetic 1`, text `EcoBlend synthetic 0.` / `EcoBlend synthetic 1.`; validate each once | Provider call list length **2**; both AI statuses `partial`, despite budget **1**. `_budget_usage` excludes both `error` rows | Reserve actual requests atomically before I/O; include failed/timeout attempts; separately reconcile tokens and retries. Regression: second distinct request must skip provider with one-attempt budget, including 5xx/4xx/timeout outcomes; concurrent distinct requests must not exceed capacity |
| Non-Google provider enforcement | Patch `_ensure_app` only to avoid SDK startup and patch `firebase_admin.auth.verify_id_token` to return `{"uid":"synthetic-user","firebase":{"sign_in_provider":"password"}}`; invoke `FirebaseVerifier.verify` with a synthetic token string | Returns `VerifiedIdentity` for `synthetic-user`; non-Google accepted **true** | After real SDK verification require exactly `google.com`. Regression: password/custom/anonymous/missing provider rejected; genuine Google accepted; retain signature/audience/expiry checks |
| Unrelated conclusion supported | Supplied `RetrievedChunk`: ID `synthetic-chunk`, approved synthetic source text `EcoBlend brand name.`; AI finding category `tone`, quote `EcoBlend`, explanation `An unrelated invented conclusion that this policy does not establish.`, claimed ID `synthetic-chunk`; invoke `_verify_ai_findings` | `verification_status` **SUPPORTED** solely from ID and phrase overlap | Anchor quote to actual submitted content and independently establish policy/conclusion support. If support is not mechanically established, mark NEEDS_VERIFICATION. Regression: existing-ID overlap cannot certify an unrelated conclusion; normal content/policy wording differences must not yield misleading labels |

Recorded output is `.data/phase4a/diagnostics.json`; all three observations were independently reproduced during this audit. Neither MOCK acceptance nor test success establishes actual provider correctness.

- Updated only the Vitest direct dependency from the previous 2.x range to exact **4.1.12**, with its lockfile. No application/UI/backend contract changes. Compatible installed engine/peer ranges were checked with `npm view`; local Node 24 and Vite 6.4.5 satisfy them. [Vitest 4 migration guidance](https://v4.vitest.dev/guide/migration.html) was consulted.
- Tinypool and vite-node were removed from the dependency graph; obsolete nested Vite 5 disappeared. No forced audit fix or forced transitive override was used.
- Added this report and appended HANDOFF. Existing work was preserved. Browser suites regenerated their synthetic evidence; ignored builds, diagnostics, a separate pip-audit tooling venv and synthetic databases reside in `.data/phase4a/`. These are not release artifacts to stage. Existing tracked tsbuildinfo is a preexisting generated artifact; review it separately before any future commit.

## 3. Actual verification

| Command / check | Actual result | Evidence class |
| --- | --- | --- |
| backend `.venv/Scripts/python.exe -m pytest -q` | 173 passed, 85.25s; one Starlette/httpx deprecation warning | Local real SQLite/HTTP/filesystem + MOCK provider boundaries |
| backend `.venv/Scripts/ruff.exe check .` | Passed | Static |
| backend `.venv/Scripts/ruff.exe format --check .` | 67 files formatted | Static |
| backend `.venv/Scripts/python.exe -m pip check` | No broken requirements | Installed dependencies |
| isolated `pip_audit --path .venv/Lib/site-packages --format=json` | Nonzero: duplicate records for one pytest advisory; no runtime-package findings | Vulnerability database audit |
| `npm install --save-dev --save-exact vitest@4.1.12 --ignore-scripts --no-audit` | Succeeded | Targeted update |
| `npm test` | 77 passed in 11 files, Vitest 4.1.12 | MOCK UI/API |
| `npm run lint` | Passed, zero warnings | Static |
| `npm run typecheck` | Passed; `npm run build` also ran `tsc -b` | Static |
| `npm run build` | Passed, Vite 6.4.5, 1614 modules | Production bundle |
| `npm run test:e2e` | 12 passed, 1.1 min | Chromium LOCAL LIVE backend, plus labelled browser MOCK/FAULT cases |
| npm audit before → after | 15 → 9 affected entries; critical 2 → 0, high 5 → 4, moderate 8 → 5 | Registry advisory audit |
| Separate relative-base Vite production build | Passed to ignored diagnostic directory | Candidate topology |
| `backend/.venv/Scripts/python.exe .data/phase4a/live_smoke.py` | One Gemini request, HTTP 200; 661 actual tokens; parsed/persisted completed run and new-engine persistence passed | LIVE_PROVIDER + local real pipeline/SQLite |
| `node .data/phase4a/proxy-smoke.cjs` | Passed: API precedence/404, HttpOnly session, JS CSRF, reload/restart, Origin 403, missing-CSRF 403, logout/revocation/cookie deletion | LOCAL LIVE production bundle + local reverse proxy |
| Synthetic release diagnostics | Confirmed budget bypass, unsupported conclusion SUPPORTED, non-Google provider acceptance, duplicate-title 500, missing private cache headers, unusable upload dir still ready | MOCK boundary / real local DB |
| Git credential patterns / filenames / index / reachable history | No matches in scanned source; 263 historical blobs scanned; no staged changes | Bounded security inspection |
| `git diff --check` | Passed; normal LF/CRLF notices | Working tree |
| Deployed smoke | NOT RUN | No LIVE_DEPLOYMENT evidence |

Test/provider keys were explicitly blanked for automated suites; provider-boundary tests use mocks. Temporary diagnostic harness mistakes (an import and duplicate fixture title) were corrected before the recorded successful diagnostic; they consumed no provider request. The duplicate fixture exposed the actual 500 noted above. Local proxy HTTP testing deliberately disabled Secure only in that diagnostic process; production must use HTTPS and Secure cookies. The proxy harness injected no-store headers, so it does not prove the current backend emits them or that Vercel is configured correctly.

Local logs/results: `.data/phase4a/pytest.log`, `frontend-tests.log`, `browser.log`, `npm-audit-before.json`, `npm-audit-after.json`, `pip-audit.json`, `diagnostics.json`, `proxy-result.json`. No credentials or session values were logged by these diagnostics. Isolated tooling installation is not a backend dependency change.

## 4. Controlled Gemini smoke: LIVE_PROVIDER PASS

On the user's replacement-key continuation, a fresh process loaded the ignored `backend/.env`. Both GEMINI_API_KEY and GEMINI_MODEL were nonempty and matched the file; only Boolean checks were displayed, never either value. The prior preflight attempts stopped without any network request. The request guard was verified unused before this execution.

**Actual Gemini requests: 1 of maximum 1. Automatic retries: 0.** The existing Gemini adapter generated against the configured model and received **HTTP 200**, establishing that this key/model combination was accessible at the time of this test. No model-listing/probe request was made. Both adapter retries and underlying HTTP transport retries were disabled; the transport wrote a persistent guard before sending the request. Do not rerun the diagnostic or delete its guard to make another call without new explicit authorization.

| Measurement | Actual result |
| --- | --- |
| Provider HTTP response | 200 |
| Validation API HTTP response | 200 |
| Run state / AI status | `completed` / `complete` |
| Cache hit | false |
| Input / output / total tokens | 381 / 280 / **661** (provider usage metadata) |
| Provider latency | 17,174 ms |
| Findings | 1 deterministic prohibited-term finding; 2 AI findings (unsupported_claim and tone) |
| Evidence | 1 retrieved approved synthetic source snapshot; both AI findings referenced its actual chunk ID |
| Existing verifier labels | All 3 findings SUPPORTED; all cited IDs belonged to the run snapshot |
| Persistence | API readback exactly matched; run survived a new app/DB engine; 1 provider-usage row |
| Run ID | `run_5fa0cf93d3df4292b7d81cf7dffa01cd` |

The ignored one-shot diagnostic `.data/phase4a/live_smoke.py` exercised synthetic EcoBlend guidelines upload/approval + explicit rule + submission → existing validation API → deterministic engine/FTS5 retrieval → real Gemini REST adapter → structured JSON/Pydantic parsing → existing server citation verification → persisted findings/evidence/usage → readback and new-engine persistence check. No real user/brand content was sent. The new-engine check was read-only and did not validate again or call the provider. This is in-process local backend/SQLite coverage, not a deployed HTTP/browser or Railway-volume restart test.

The test proves successful provider integration and execution of the current evidence verifier; it does **not** establish semantic correctness of every SUPPORTED label or resolve the separately reproduced evidence-support bug. The three confirmed budgeting, Google-provider restriction and citation-support blockers remain unchanged. Status/usage-only result: `.data/phase4a/live-result.json`; guard: `.data/phase4a/LIVE_REQUEST_ATTEMPTED`. These and the synthetic DB/uploads remain ignored. No API key, session secret, raw prompt or provider-response text was printed.

## 5. Independently established workflow coverage

| Workflow | This audit | Prior local evidence | Deployed |
| --- | --- | --- | --- |
| Firebase Google sign-in | MOCK verification; matching local Admin file reference exists outside repo; real login not repeated | Existing names/status-only Google smoke JSON and HANDOFF record real SDK/Admin 200 → me 200, restart restoration, logout 204 → me 401 | None |
| Guest login | Real Chromium/backend; isolated fresh contexts | Existing local evidence consistent | None |
| Session restoration | Reload + real backend restart; separate local proxy proof | Real Google restoration recorded previously | None |
| Document upload / guideline approval | Real Chromium → HTTP → SQLite/filesystem | Synthetic EcoBlend | None |
| Rule management | Real rule creation plus backend CRUD/authZ tests | Existing backend evidence | None |
| Submission creation | Real Chromium/backend | Immutable version tests | None |
| Deterministic validation / citation display | Real run persistence and browser findings/evidence; Gemini disabled | Prior tests consistent | None |
| Logout | Real revocation, cookie deletion, revoked me 401 | Google smoke recorded previously | None |
| Live Gemini | One real request: HTTP 200, structured parsing, existing evidence checks, completed run, usage and persistence verified | Earlier preflights made zero requests | None |

Negative paths actually covered by the backend/browser suites include malformed/expired identity, cross-workspace IDs, missing CSRF/evidence, provider MOCK 429/5xx/timeouts/invalid output, duplicate validation/idempotency, and restart persistence. Duplicate submission titles are a separately uncovered failure. Previously stored Google evidence is historical evidence, not independently repeated provider coverage in this audit.

## 6. Git/security and commit recommendation

Before this report: 37 modified tracked files, 58 untracked entries (directory entries aggregate files), zero staged; HEAD unchanged. The additions to this report/HANDOFF do not represent a clean release branch. All Phase 2–3C code remains uncommitted.

No tracked/staged actual env file, SQLite database, upload, private key, obvious server API token or personal-email text match was found. Local envs and runtime `.data` files are ignored. The Admin reference points to an existing service-account file outside the repository, with a project matching the backend; its path and content were not printed. Inline Admin JSON is not configured locally. Pattern scanning covered current tracked/untracked candidate text and reachable Git blobs; binary screenshots cannot be certified by text regex. A contact sheet of all 25 evidence PNGs was visually inspected: login/signed-out/guest/synthetic EcoBlend surfaces; no obvious personal account data was seen. Evidence JSON stores flags/statuses rather than credentials. No screenshot token OCR guarantee is made.

Safe recommendation: **do not make a release commit yet**. Review the complete preserved Phase 2–3C diff and this dependency delta, approve/fix high findings, rerun affected tests and rescan the exact staged diff. Use explicit source paths; exclude `.env`, service-account files, `.data`, databases/uploads, tooling venvs and transient logs/builds. Stage synthetic/licensed assets deliberately. Nothing was committed, pushed or deployed; no existing work was deleted.

## 7. Railway setup checklist (future approved deployment)

1. Use service root `backend`; install runtime `requirements.txt` only. Pin and verify Python/runtime resolution against the tested environment. Start with **`python -m app`**, no reload and one worker. Code reads platform PORT; production binds `0.0.0.0`. The local proxy smoke started this entrypoint on an injected port.
2. One replica, no autoscaling/multi-region writers. Attach a persistent volume at **`/data` before traffic or seed writes**. Resolve DATABASE_URL to **`sqlite:////data/db/brandsentry.sqlite`** and UPLOAD_DIR to **`/data/uploads`**. Verify runtime mount identity, both write probes, free space, WAL/foreign_keys/busy_timeout and FTS5. Configuration alone is not mount proof.
3. Set production environment and exact intended frontend HTTPS origins. Inject Admin service-account JSON as a private Railway secret (or a securely provisioned runtime file/ADC); do not reuse a Windows local path. Ensure its project matches frontend/backend. Inject Gemini key/model privately only after the controlled smoke succeeds; keep retries zero and conservative budgets until the hard-cap fix passes.
4. Use HTTPS public networking and readiness healthcheck **`/ready`**; independently check `/health`. Correct the upload readiness/fail-closed gaps first. Neither endpoint should call Gemini. Do not rely on health alone to prove Firebase configuration.
5. Run additive Alembic upgrades at controlled **runtime startup**, after volume attachment; no volume-dependent build/pre-deploy migration. Inspect migration version/head and logs. Back up existing data before migration. One startup migrator, no concurrent writers during schema upgrade.
6. Confirm ingress client-IP semantics; test rate limits against spoofed forwarded headers. Enforce the early body/extraction limits and fixed provider budgets before public traffic. Inspect logs using synthetic failures to ensure SQL parameters/user content are not emitted.
7. Create a synthetic document/rule/submission/run via the actual frontend; restart Railway and verify DB records, run evidence AND original upload bytes survive. Verify two fresh guest contexts cannot cross workspaces. Repeat real Google login and logout.
8. Take a SQLite-consistent backup (SQLite backup API or quiesced checkpoint/copy, not a live bare DB file copy) together with uploads; restore into an isolated instance and verify. Record schema, backup timestamp, approved commit and service URL. A volume is not a backup.

[Railway volumes](https://docs.railway.com/volumes) confirms runtime availability and volume deployment constraints; [pre-deploy guidance](https://docs.railway.com/deployments/pre-deploy-command) explains why volume work cannot run there. Remote Railway settings were not inspected or changed.

## 8. Vercel setup checklist and smallest proposed configuration

1. Root **`frontend`**, Vite framework, install **`npm ci`**, build **`npm run build`**, output **`dist`**. Use a supported Node 24 runtime matching local verification. Ensure no Admin/provider/database/upload material enters the build context or output.
2. Explicitly define **VITE_API_BASE_URL as empty** at build time. Unset is different: current code falls back to a loopback backend. Rebuild after any VITE change. Set only public Firebase web configuration; match the backend project.
3. Replace the active SPA-only configuration with the following candidate after substituting the actual Railway HTTPS hostname. It is a proposal, not an active configuration change; the corresponding local reverse-proxy behaviour passed. Preserve `/api/v1` in the upstream path.

```json
{
  "headers": [{
    "source": "/api/:path*",
    "headers": [
      {"key": "Cache-Control", "value": "private, no-store"},
      {"key": "CDN-Cache-Control", "value": "no-store"},
      {"key": "Vercel-CDN-Cache-Control", "value": "no-store"}
    ]
  }],
  "rewrites": [
    {"source": "/api/:path*", "destination": "https://RAILWAY-HOST/api/:path*"},
    {"source": "/(.*)", "destination": "/index.html"}
  ]
}
```

4. Add origin-level no-store headers too; backend responses can override route configuration. [Vercel rewrites](https://vercel.com/docs/routing/rewrites) support external-origin proxying; [cache header precedence](https://vercel.com/docs/caching/cache-control-headers) must be verified against actual headers. Never introduce shared caching for private responses. Check `x-vercel-cache`, Cache-Control and any CDN directives on business GETs, errors and auth responses, including requests from a second user.
5. Keep host-only cookie Path `/` and no Railway Domain attribute; preserve **both** Set-Cookie headers and their deletion counterparts. With HTTPS same-origin proxy, set backend Secure true and explicitly select SameSite Lax. Current production default None is cross-origin oriented; changing it is deployment configuration, not removal of CSRF checks. Origin must remain the exact frontend origin and be allow-listed at backend. Forward Cookie, X-CSRF-Token, Idempotency-Key, Content-Type and multipart bodies without logging secrets. Validate actual proxy timeout against the synchronous provider path; the existing 25-second provider timeout plus application overhead must fit it.
6. Enable Firebase Google provider and add the exact frontend hostname(s) to Firebase authorized domains. Confirm authDomain/project config, popup behaviour and genuine backend exchange on the deployed origin. Remote Firebase authorized domains were not inspected. Avoid broad preview-origin wildcards; use intended fixed preview domains and explicit backend origins.
7. Fresh incognito: deep-link `/vault`, guest login → me, upload/approve/rule/content/validation/evidence, reload, new tab, backend restart, logout and denied replay. Confirm unknown `/api` routes yield JSON 404 instead of HTML and `/runs/...` deep refresh yields the SPA. Repeat with Google and restrictive third-party-cookie settings. Verify cached data cannot cross sessions/workspaces.
8. Theme storage is only `brandsentry_theme`; no app auth/approval authority in web storage was found. Theme reload/system/keyboard/reduced-motion checks passed. Recheck production asset/font paths; no redesign is needed.

## 9. Implemented environment inventory — names only

Frontend public build configuration:

`VITE_API_BASE_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.

Backend runtime:

`APP_ENV`, `APP_NAME`, `VERSION`, `API_V1_PREFIX`, `DATABASE_URL`, `UPLOAD_DIR`, `FRONTEND_ORIGINS`, `HOST`, `PORT`, `LOG_LEVEL`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_FILE`, `SESSION_COOKIE_NAME`, `CSRF_HEADER_NAME`, `USER_SESSION_TTL_HOURS`, `GUEST_SESSION_TTL_HOURS`, `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`, `GUEST_SESSIONS_PER_IP_PER_HOUR`, `KNOWLEDGE_MAX_UPLOAD_BYTES`, `KNOWLEDGE_MAX_EXTRACTED_CHARS`, `KNOWLEDGE_CHUNK_MAX_CHARS`, `KNOWLEDGE_UPLOADS_PER_HOUR`, `KNOWLEDGE_SEARCHES_PER_HOUR`, `KNOWLEDGE_SEARCH_MAX_TOP_K`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_BASE_URL`, `GEMINI_TIMEOUT_SECONDS`, `GEMINI_MAX_OUTPUT_TOKENS`, `GEMINI_MAX_RETRIES`, `PROMPT_VERSION`, `VALIDATION_MAX_CONTENT_CHARS`, `VALIDATION_EVIDENCE_TOP_K`, `VALIDATION_MAX_FINDINGS`, `VALIDATION_CACHE_TTL_HOURS`, `VALIDATION_USER_PER_HOUR`, `VALIDATION_GUEST_PER_HOUR`, `VALIDATION_WORKSPACE_PER_HOUR`, `GEMINI_CALLS_PER_DAY`, `GEMINI_TOKENS_PER_DAY`.

Optional ADC alternative: `GOOGLE_APPLICATION_CREDENTIALS` must be an actual process environment variable for google.auth; a dotenv-only unknown setting is not automatically exported. Select one Admin credential mechanism. No environment values are included in this inventory.

## 10. Release order and rollback

1. Approve focused fixes for the high findings; reconcile deployment docs and missing product scope; retain the tested Vitest update.
2. The one authorised Gemini smoke is now complete: preserve its evidence and do not repeat automatically. Any further live requests require new explicit authorization; validate fixes with mocks unless another live run is approved.
3. Re-run affected suites, review source/assets/licenses and stage explicit paths for an approved commit. Obtain separate push/deployment authorization.
4. Provision/verify Railway volume, secrets, migrations, health/readiness and backup/restore first. Then configure Vercel same-origin routes and public Firebase configuration against that backend. Run full incognito/provider/persistence/private-cache smoke before promotion or demo signoff.
5. Record a known-good deployment pair, commit, migration version and restore-tested backup. This release currently has no known-good deployed baseline. For code-only failure, roll back the pair while preserving `/data`. For migration/data corruption, pause writes, preserve current volume, and restore a compatible verified DB+uploads backup only after review; never blindly migrate down or delete the volume. Repeat auth, isolation, workflow and restart checks after recovery.

Review layers: plan alignment **ISSUES FOUND** (provider/deployment evidence and full product gates incomplete); system integrity **ISSUES FOUND** (Google-only restriction, evidence support, budget controls); production readiness **ISSUES FOUND** (storage, proxy/cache, request bounds and unresolved advisories). Audit stopped for user review; no business fixes or deployment authorized by this report.

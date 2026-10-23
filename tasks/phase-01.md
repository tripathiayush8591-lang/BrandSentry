# BrandSentry — Phase 01: Live Deployment Foundation

**Status: PLANNED / NOT AUTHORISED TO EXECUTE YET.** Run only when organisers' permitted coding window has begun. This is a *task contract*, not evidence that anything is built.

## Outcome
A minimal React/Vite website deployed to Vercel successfully calls a deployed FastAPI backend running on Railway, with `/health` and `/ready` verified from a fresh external browser. Persistent volume is mounted and a simple data-survival test proves SQLite stays after backend restart/redeployment. This phase intentionally precedes AI/product feature work.

## Read before task
`AGENTS.md`, `docs/PRD.md` sections 3–4, `docs/ARCHITECTURE.md`, `docs/DATA_API_CONTRACTS.md` (health/errors), `docs/DECISIONS.md`, `docs/DEPLOYMENT_RUNBOOK.md`.

## Prerequisites
- Official build window start explicitly confirmed and recorded.
- GitHub, Vercel, Railway, Firebase projects ready (account setup/planning may be permitted earlier).
- No keys, tokens or service-account JSON in prompts or repo.
- Teammates agree which person authorises production deploys.

## Task boundaries
**Build once authorised:**
1. Scaffold frontend/backend with clean monorepo folders and dependency locking.
2. Implement FastAPI `GET /health` and `GET /ready` with accurate readiness (DB + mounted volume).
3. Configure SQLite+SQLAlchemy/Alembic, create smoke-only local test record, production `/data` DB and file paths, env validation.
4. Deploy React to Vercel and FastAPI to Railway with volume, correct host/port, env and HTTPS origins.
5. Expose on landing page live backend connectivity state (not fake pass state); use well-labelled test UI only.
6. Configure route rewrite and basic CI checks; verify deployment from fresh incognito and after backend restart.

**Do NOT build during this phase:** Gemini integration, entire dashboard, Content Scanner, reviewer UI, PDF extraction, production auth, fancy visuals, full DB model, model prompts. Phase 2 handles Firebase/guest identity.

## Acceptance criteria (all required)
- [ ] Exact deployment URLs and commit SHA saved in runbook.
- [ ] Frontend HTTPS URL loads in incognito; direct `/dashboard` route reload handles SPA fallback if route exists.
- [ ] `GET /health` returns `200` with status `ok` and a request ID but no secrets.
- [ ] `GET /ready` correctly returns ready **only when SQLite connection and writable persistent storage are available**.
- [ ] React frontend makes actual HTTPS request to Railway backend and shows result; no CORS/mixed-content error.
- [ ] The backend writes a smoke record to `/data/db/brandsentry.sqlite`; it still exists after restart and safe redeploy.
- [ ] Startup does not overwrite DB on every boot, and uploads directory is on attached volume.
- [ ] Frontend tests/build and backend tests/import/startup pass; actual commands logged.
- [ ] No secret tokens/keys are committed or leaked in network responses or logs.
- [ ] Known downtime/plan-tier limitations and backup path are recorded.

## Mandatory negative tests
- Disconnect/misconfigure DB path in local test environment -> `/ready` reports not ready.
- Configure invalid API origin locally -> frontend shows clear error, not misleading connected status.
- New production browser session -> frontend/backend integration succeeds without cached local dev state.

## Engineer-to-engineer output contract
After implementation agent reports:
1. what changed and why, with file paths;
2. exact test commands/results (mock vs live clearly labelled);
3. active preview/production URLs and deployment outcome;
4. SQLite persistence proof before/after restart;
5. security/operational blockers and a recommended follow-up task;
6. Git commit SHA and next phase handoff.

## Phase 02 preview (not a request to implement now)
Firebase Google Auth ID token backend verification, guest sandbox token, role/workspace authZ, safe browser session handling. Deployment smoke checks repeated after auth configuration.

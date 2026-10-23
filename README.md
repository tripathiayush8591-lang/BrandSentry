# BrandSentry — Context Pack for Prompt Pirates

**BrandSentry** is an evidence-grounded AI-powered brand governance platform. Brand users upload approved guidelines, submit marketing copy, review evidence-backed AI findings, revise the draft, and obtain a *human* approval with a traceable audit history.

**Tagline:** Every claim verified. Every decision accountable.

**Team:** PROMPT PIRATES (Code Axis 2026) — Ayush Tripathi (team lead, backend/AI) and Akhand Shukla (frontend/product UI).

## What's inside
This ZIP is a **pre-build planning pack only**, not a functioning app. The official problem statement permits preparation/research but says actual product code must be developed within the organiser's authorised build window. Confirm that window before acting on `tasks/phase-01.md`.

### Eight standing context files
1. `AGENTS.md` — operating instructions and guardrails for any coding agent.
2. `docs/PRD.md` — MVP scope, user flows, roles, usability and success criteria.
3. `docs/ARCHITECTURE.md` — 10,000-ft system diagram and trust boundaries.
4. `docs/DATA_API_CONTRACTS.md` — proposed SQLite entities, routes, schemas and state transitions.
5. `docs/AI_VALIDATION.md` — hybrid validation, citations, caching, rate limits, budget and failures.
6. `docs/DECISIONS.md` — rationale for stack, guest mode, SQLite, deployment-first.
7. `docs/ROADMAP.md` — phases, ownership, Round 3 improvements and judging gates.
8. `docs/DEPLOYMENT_RUNBOOK.md` — hosting, secrets handling, smoke tests, rollback and disaster recovery.

### Active task file
9. `tasks/phase-01.md` — deployment-first engineering task to run **after** coding window opens.

### Other onboarding materials
- `.env.example` — environment-variable names and safe dummy defaults, **not credentials**.
- `MANIFEST.md` — index and validation notes for the pack.

## Stack (agreed)
| Layer | Choice |
|---|---|
| Frontend | React + Vite + TypeScript, on Vercel |
| Backend | FastAPI + Pydantic, on Railway |
| Google sign-in | Firebase Authentication **only** |
| Guest | backend-issued isolated short-lived demo session |
| App records | SQLite + SQLAlchemy/Alembic; Railway persistent volume |
| Browser storage | localStorage for **non-sensitive** drafts/settings only |
| AI | Gemini API + deterministic rules + server evidence verification |
| Quota protection | backend rate limits, result cache, idempotency, call budget, backoff |

## How to use with Codex / Antigravity
1. Copy this folder into the new GitHub repository as the planning foundation (subject to event rules). Do not present context documents as a working product.
2. Ask each agent to read `AGENTS.md`, then only the needed context docs plus `tasks/phase-01.md`.
3. Instruct coding agents to produce a plan/diff/test plan before edits and to obey official build-window restrictions.
4. Once the window opens, start with the **live deployment foundation**, not the entire UI.
5. After each accepted phase: run tests, verify deployment, review diffs, commit; update a small `HANDOFF.md` if switching agent.

## Source/provenance notes
- Supplied official organiser `Problem_statement(2).pdf` (5 pages): problem, expected outcomes, Round 2 submission/criteria, restrictions.
- Supplied team `Code_Axis_Round_1_PROMPT_PIRATES(1).pdf` (12 slides): originally proposed features, workflow and 3 Round 3 improvements.
- BrandSentry branding, Firebase-Auth-only/SQLite storage, deployment-first process and API cost-control settings are **team decisions made after the Round 1 deck**, not direct organiser requirements.
- These PDFs are **not bundled** in this pack; keep your originals as reference separately.

## Known unknowns to resolve before build
Official Round 2 coding start and deadline; actual Railway tier/resource allowance; Gemini account quota/model; Firebase allowed sign-in domains; final Vercel/Railway URLs; reviewer account provisioning; desired initial visual direction. No deployed app, configured credentials or tested integrations are claimed here.

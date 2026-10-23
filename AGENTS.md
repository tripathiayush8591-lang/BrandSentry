# BrandSentry — Coding Agent Operating Contract

> Status: PRE-BUILD PLANNING. This document is **not permission to implement** before the organiser's official build window. Revised: 2026-10-23.

## Read order and source of truth
1. Read this file first.
2. Read `docs/PRD.md` for outcomes, limits, users and acceptance criteria.
3. Read `docs/ARCHITECTURE.md` and `docs/DATA_API_CONTRACTS.md` before changing backend contracts.
4. Read `docs/AI_VALIDATION.md` before adding AI features or provider calls.
5. Read `docs/DEPLOYMENT_RUNBOOK.md` before changing configuration or deployment.
6. Read `docs/DECISIONS.md` before reconsidering the stack.
7. Read the **current** task in `tasks/`; consult `docs/ROADMAP.md` for sequence.
8. If requirements conflict, stop and report the contradiction rather than inventing an answer.

## Product / team
- Product: **BrandSentry** — evidence-grounded pre-publication brand governance with human-controlled review.
- Team: **PROMPT PIRATES**. Ayush Tripathi owns backend/AI/integrations, Akhand Shukla owns frontend/product UI, with cross-review and shared responsibility for integration and tests.
- Round 2: working deployed MVP; Round 3: improvements set out in `docs/ROADMAP.md`.

## Locked technology and boundaries
- React + Vite + TypeScript frontend on Vercel; FastAPI + Python + Pydantic backend on Railway.
- Firebase Authentication is used **only for Google sign-in**; do not add Firestore or Firebase Storage.
- Guest access uses **backend-issued isolated demo sessions**, independent of Firebase. No anonymous Firebase sign-in fallback.
- SQLite via SQLAlchemy/Alembic is authoritative for app records and review decisions. Browser localStorage may hold only non-sensitive UI preferences and draft conveniences, never access control or approval status.
- Uploaded guideline files live in a server directory on a Railway **persistent volume**. Never rely on Vercel filesystem or Railway's container layer for durable files.
- Gemini is invoked **only by the backend** through a single provider adapter. Deterministic checks must work when Gemini is unavailable.
- All content-bearing, reviewer, and admin APIs validate identity, workspace membership, and permissions server-side.

## Agent execution discipline
- **Before coding:** provide a 3–7-step implementation plan, relevant files, affected API/data contracts, assumptions, and test plan; wait for authorised build window and task approval.
- Work in one narrowly bounded, end-to-end vertical slice; do not create polished disconnected mock pages or entire untested subsystems.
- Inspect the existing code and tests before editing. Avoid unrelated refactors and unnecessary dependencies.
- Keep UI styling flexible. Prefer accessible, responsive, coherent patterns; do not impose a fixed colour palette, font family, visual trend, or component framework. Preserve user-approved design choices once established.
- Never fake a successful provider response, verified source, persisted record, logged-in user, human decision, or deployment status. Clearly label seeded data and demo actors.
- Every changed API must maintain the documented JSON schema, error contract, and authorisation checks, or explicitly propose a contract change.
- New provider calls require budgeting, rate limits, stable-key caching rules, idempotency and timeout/error handling (`docs/AI_VALIDATION.md`).
- No credentials or raw tokens in source files, tests, screenshots, logs, README or commits. `.env.example` is names and placeholders only.
- Follow licensing, privacy and accessibility requirements. Use synthetic demonstration brands/content unless permission is established.

## Required test and completion evidence
- Run and report real commands (do not assert unrun tests): backend unit/integration tests; frontend lint/typecheck/build/tests; relevant end-to-end browser tests; and deployed smoke tests for a deployment-affecting change.
- Distinguish MOCK, LIVE_PROVIDER, LIVE_BACKEND, and LIVE_DEPLOYMENT coverage. State exactly which external integrations could not be exercised.
- Verify negative paths: invalid IDs/tokens, unauthorised cross-workspace access, missing evidence, provider 429/5xx, duplicate submissions, DB restart persistence.
- Confirm acceptance criteria in the phase task. Do not mark a phase done based on screenshots alone.
- Produce a concise handoff (create/update `HANDOFF.md` when switching agents): commit SHA, changed files, tests with results, live URLs (no secrets), unresolved risks, next action.
- Commit with clear messages after a passing, reviewed slice. Do not push or deploy to production without explicit authorisation.

## Deployment-first non-negotiable
- **First build milestone:** an actual Vercel frontend calling an actual Railway FastAPI health endpoint, then auth and persistent DB checks, before extended product development.
- Every subsequent phase must remain deployable. Test a fresh incognito browser and one backend restart after persistence changes.
- Before submission, freeze features and require the live checklist in `docs/DEPLOYMENT_RUNBOOK.md`.

## Decisions agents may not silently change
- Do not swap SQLite for Firestore, switch hosting, introduce Redis/vector DB, remove human approval, change auth provider, or expose Gemini directly in frontend.
- Discuss tradeoffs and add an ADR to `docs/DECISIONS.md` **before** making an approved architectural change.

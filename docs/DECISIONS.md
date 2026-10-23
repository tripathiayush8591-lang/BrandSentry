# BrandSentry — Architecture Decision Records

Purpose: record *why* choices were made and which assumptions must be verified, so coding agents do not silently alter the architecture. Dates are planning dates, not development timestamps. Status: **Proposed / agreed in discussion**, contingent on official hackathon rules.

## ADR-001 — Product name and purpose
**Decision:** BrandSentry, built by PROMPT PIRATES. Evidence-backed brand-content validation before publication, with human review and auditability.
**Why:** Round 1 promised explainable, trustworthy governance beyond a basic AI writing tool.
**Tradeoff:** A narrower workflow with reliable evidence beats a broad generic assistant.

## ADR-002 — React + Vite + TypeScript
**Decision:** React SPA with Vite. Deploy static frontend to Vercel.
**Why:** Rapid iteration, separable frontend team ownership, predictable deployment.
**Tradeoff:** Need SPA route rewrite and API-host separation. Do not add Next.js without a documented reason.

## ADR-003 — FastAPI + Python
**Decision:** FastAPI orchestrates auth, rules, Gemini and review services; Pydantic defines contracts.
**Why:** Well suited to document processing, validation and testable Python-based domain logic.
**Tradeoff:** Independently deployed backend requires CORS/env/health validation.

## ADR-004 — Firebase only for Google sign-in
**Decision:** Use Firebase Authentication client for Google identity; FastAPI verifies Firebase ID tokens on every protected request and maps to app roles/workspaces. Do **not** use Firestore or Firebase Storage in Round 2.
**Why:** Easy sign-in without coupling authoritative data to Firebase.
**Tradeoff:** Need Admin SDK service-account handling, deployment authorised domains and expiry behaviour.
**Security:** Firebase client config is public configuration, not the private Admin SDK credential.

## ADR-005 — Guest access is independent
**Decision:** Backend-issued short-lived opaque guest token, hashed at rest, demo-scoped workspace; frontend sessionStorage or memory (not privileged localStorage). No Firebase anonymous auth requirement.
**Why:** Judges must be able to test without their Google account.
**Tradeoff:** Sandbox has synthetic demo personas, not proof of multi-user production approval; isolate data and enforce tight quotas.

## ADR-006 — SQLite and local persistence in Round 2
**Decision:** SQLite+SQLAlchemy+Alembic for authoritative app data; uploaded files on Railway persistent volume; browser localStorage only for non-sensitive UI/draft conveniences.
**Why:** Lightweight, easy to test locally, no extra hosted database complexity.
**Tradeoff:** Single-worker/single-writer deployment constraint, volume availability, operational backups, nontrivial later Firestore migration.
**Migration trigger:** Approved Round 3 requirements and a tested backfill/consistency plan, not enthusiasm alone.

## ADR-007 — Hybrid evidence-grounded validation
**Decision:** Deterministic rules + curated approved-source retrieval + Gemini semantic suggestions, followed by server-side evidence/source verification.
**Why:** Unverifiable generated claims would defeat the product's trust positioning.
**Tradeoff:** Some outputs will be `Needs Verification` rather than confidently branded pass/fail. Human remains authority.

## ADR-008 — Backend API cost controls
**Decision:** Atomic server quotas, rate limits, stable-key result caching, idempotency, duplicate-call suppression, token/input caps, provider timeouts and bounded retries.
**Why:** Protects limited Gemini budget, improves latency and reduces outage cascades.
**Tradeoff:** Cache correctness requires per-workspace/source-version/prompt/model fingerprints, and quota rules need tests.

## ADR-009 — Deployment first
**Decision:** Establish Vercel+Railway live connection as first implementation milestone in the permitted build window. Make every phase deployable and review live smoke tests.
**Why:** Previous late deployment failures threatened hackathon outcomes.
**Tradeoff:** Less time spent on visual polish early, but far less submission risk.

## ADR-010 — Flexible UI direction
**Decision:** Require clear flows, accessible states, responsive layouts and design consistency; do not lock aesthetics or component library before design review.
**Why:** Frontend owner should be able to explore and test product-appropriate visual directions.
**Tradeoff:** Need a later short design contract to avoid inconsistent screens; do not style individual pages at random.

## ADR-011 — Scope is constrained by official build window
**Decision:** Planning/research files can be prepared in advance if rules allow. Production code, demos and deploys may only count if made during the official permitted window.
**Why:** Organiser rules (Problem_statement PDF p.4) can disqualify substantially prebuilt projects.
**Required:** Before engineering tasks, confirm window opening and any permissions from organiser. Preserve commit history and disclose AI-generated components and templates.

## How to add or change an ADR
Append a new ADR with identifier, status, context, alternatives, decision, consequences, migration/backout and approval date; update related contracts in same reviewed change. Never silently rewrite an accepted decision.

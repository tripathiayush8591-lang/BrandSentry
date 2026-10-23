# BrandSentry — Round 2 Roadmap, Ownership and Acceptance Gates

Status: planning only; official Round 2 coding window **not yet confirmed**.

## 0. Required ordering
**Before authorised coding:** agree on scope and mock fixtures, context docs, UI direction, Firebase/Railway/Vercel account readiness, projected API quota and allowed official build window. Do not create the implementation or deploy it before official start if prohibited.

**After authorised start:** deploy skeleton first → integrate auth/storage → build end-to-end vertical slice → expand features → harden/test/freeze.

## 1. Phase matrix
| Phase | Outcome | Primary ownership | Demonstrable gate |
|---|---|---|---|
| P0 — Plan (pre-build) | Context pack, API contracts, fixtures, decisions, verification plan | Both | Docs complete; official start confirmed |
| P1 — Live Foundation | React on Vercel + FastAPI on Railway; CORS + health + preview/prod settings | Backend/Frontend split | Fresh browser loads live page and fetches live `/health` + `/ready` |
| P2 — Identity & Persistence | Firebase Google auth verified on backend; isolated guest session; SQLite volume + restart test | Ayush API/auth; Akhand UI | Google+guest both work in deployed site; writes survive restart; cross-workspace blocked |
| P3 — First Core Vertical Slice | Seeded policy, submitted text, deterministic check and evidence display, revision | Both | Deployed user path works with real SQL data and server-side verified rule |
| P4 — Gemini & Explainability | Gemini live integration, evidence verification, cache/idempotency/rate limits, fallback | Ayush AI; Akhand findings UX | Fixed golden fixtures pass + verified LIVE Gemini + provider outage behaves honestly |
| P5 — Human Review & Insights | Queue, decisions, comments, audit trail, basic real-data insights | Both | End-to-end approval for exact version; separate actor; event persistence |
| P6 — Hardening & Submit | E2E tests, usability, docs, safe demo, release checks, walkthrough | Both | Deployed incognito walkthrough, post-restart data, archived test evidence, working repo |

Avoid rigid time estimates until official window duration is confirmed. Feature-freeze should happen before submission, with time explicitly reserved for live verification and recovery.

## 2. Vertical slice policy
Each task is small, changes both sides where integration is needed, and has:
- explicit actor and user journey, affected routes/entities, dependencies and non-goals;
- fake-vs-live integration flags;
- tests and negative cases;
- deployed smoke check;
- review and Git commit checkpoint.

Stop/replan on any gate failure rather than hiding incomplete integration behind styled mock output.

## 3. Team responsibilities
**Ayush Tripathi — Team Lead / Backend & AI:** FastAPI, Pydantic schemas, storage, migration, Firebase Admin verification, guest sessions, rate-limit/caching rules, evidence verifier, Gemini adapter, API reliability and Railway setup.

**Akhand Shukla — Frontend & Product Design:** React UI, navigation/design direction, auth UX, Knowledge Vault, content editor, findings and reviewer screens, accessibility, front-end tests and Vercel setup.

**Both:** integration contract review, staging smoke tests, manual demo, repo commits, phase handoffs, test evidence, documentation and transparent AI tool disclosures. The organiser can ask either member to explain the project.

## 4. Round 1 commitments vs Round 2 baseline
The Round 1 deck proposed: Brand Knowledge Vault; AI Content Scanner; Explainable Corrections; Approval Workspace; Revision & Audit Trail; Governance Insights. Demonstrate a real minimum slice of **each**, not a simulated checkbox. Disclose Firebase-as-Auth-only + SQLite storage as a justified deviation from the Round 1 full-Firebase suggestion.

## 5. Meaningful Round 3 improvements promised in Round 1 PPT
1. **Evidence Passport v2:** richer source provenance, exact clause/version association and verification metadata for each claim/finding. Round 2 baseline already cites approved source records.
2. **Visual & Accessibility Checks:** branded visual asset/logo adherence, contrast/alt-text and practical accessibility warnings with defensible limitations. Round 2 may prioritise text-first to ensure reliability.
3. **Guideline Gap Radar:** aggregated recurring confusion/violations, ambiguous guidance hotspots and suggestions for admin guideline updates. Round 2 baseline provides factual issue counts only.

Do not claim these are implemented in Round 2 unless they are genuinely built and independently tested. Round 2 email asks the team to describe the three intended improvements; final Round 3 requires delivery per official instructions.

## 6. Prioritisation if time is scarce
Tier 0 (cannot ship without): live deployed frontend/backend; functioning guest entry; persistent sample policy+submission; evidence-grounded finding; exact-version review; truthful failure handling; accessible links/source.

Tier 1: Google sign-in; text-based PDF upload; robust source selection; basic insights and audit detail; abuse/budget controls.

Tier 2 (only if Tier 0/1 pass): animations, comprehensive dashboard charts, visual scanning, complex workspace roles, advanced analytics and external integrations.

Reliability rule: shrink feature scope **before** removing authZ, persistence, review history, API budget controls or live deployment checks.

## 7. Final Round 2 deliverables
- Working judge-accessible deployed app or organiser-approved alternative, with Google and guest flow tested.
- Public/judge-accessible GitHub repository and truthful commit history.
- Architecture and API/AI/data rationale, integrations/models/libraries disclosure.
- Usability test notes or structured feedback where reasonably available.
- Automated-test output, actual deployed smoke checklist, known limitations, per-member contribution summary.
- Round 3 three-item improvement plan.

## 8. Readiness status to update by team
| Gate | Status | Evidence link / commit |
|---|---|---|
| Official build window confirmed | NOT CONFIRMED | — |
| Deployed frontend/backend connectivity | NOT STARTED | — |
| Google auth + guest sandbox verified | NOT STARTED | — |
| SQLite data survives restart | NOT STARTED | — |
| Evidence-backed validation passed | NOT STARTED | — |
| Human review + audit passed | NOT STARTED | — |
| Provider rate/quota/retry edge tests passed | NOT STARTED | — |
| External incognito demo passed | NOT STARTED | — |

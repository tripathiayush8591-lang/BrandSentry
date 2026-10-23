# BrandSentry — Product Requirements Document (Round 2)

Status: agreed planning baseline; no implementation initiated. Date: 2026-10-23.

## 1. Problem and positioning
Inkloom AI's challenge: organisations produce material through employees, agencies and AI tools; unsupported claims, outdated information, inconsistent terminology/tone, off-brand visuals and accessibility gaps can escape before publication. BrandSentry is an **AI-assisted pre-publication governance platform** that checks submitted content against **approved guidelines, facts and assets**, explains issues with traceable evidence and leaves approvals to people.

Product promise: **Every claim verified. Every decision accountable.**

Not a generic chatbot, automatic post publisher or autonomous fact-checker. Missing evidence means **Needs Verification**, not automatically **False**. AI output is never final approval.

### Provenance
- Organiser: `Problem_statement(2).pdf`, p. 1–5: capabilities, delivery requirements, judging criteria, build-window restrictions.
- Team's Round 1 proposal: `Code_Axis_Round_1_PROMPT_PIRATES(1).pdf`, pp. 4–10: workspace, workflow, capabilities, architecture, safeguards and round-specific roadmap.
- Deliberate Round 2 deviations: SQLite + persistent volume instead of Firebase data/storage; retain Firebase Auth for Google sign-in; guest demo sessions; deployment-first delivery.

## 2. Actors, permissions and jobs
| Actor | Main job | Permissions (server enforced) |
|---|---|---|
| Brand Admin | Build approved brand knowledge and govern reviewers | Manage workspace guidelines/approved facts/roles; review; view audit and analytics |
| Creator | Draft and submit content | Manage own drafts/submissions, see findings, revise; cannot approve own content in real workspaces |
| Reviewer | Evaluate evidence and decide | View assigned workspace submissions, comment, approve or request changes |
| Guest Demo Visitor | Try a safe end-to-end example without Google | Isolated seeded demo workspace only; explicit demo persona switching; no access to real users' materials |

For Round 2 we can keep one workspace per Google test user/team and a small set of preconfigured reviewer identities. A guest may switch **labelled demo personas** (creator/reviewer) to show the workflow; this is not represented as secure real-world multi-user approval. If a real signed-in user approves, a separate authorised reviewer identity must do it.

## 3. Primary end-to-end story (mandatory)
1. Admin enters / imports approved guidelines and facts; sources are versioned and indexed, with page/section where available.
2. Creator writes text or uploads a **text-based PDF** (if extraction supports it); a draft version is persisted.
3. Creator explicitly requests validation. Backend checks quotas, idempotency and caches, then runs deterministic rules and Gemini semantic checks.
4. Every finding shows issue type, severity, exact snippet, explanation, evidence source+version/location or **Needs Verification**, and a proposed human-editable correction.
5. Creator applies/edit corrections and revalidates the new version.
6. A reviewer comments and either **Requests Changes** or **Approves** the exact validated version. Pending/unverified findings are visible; app never auto-approves.
7. Approved record and audit timeline are inspectable, including who acted, on what content version and when; summary insights count actual recorded findings.

## 4. Round 2 must-haves
- Google sign-in via Firebase Authentication with ID token verified by FastAPI; session expiry/logout handling.
- Independent guest demo sign-in with isolated sample brand data and realistic quotas.
- Brand Knowledge Vault: approved guideline/fact CRUD, source IDs and versioning. Text/PDF import where reliable. No OCR promise.
- Content submission: text first; text-based PDF second if available; statuses, ownership and revision history.
- Hybrid checks: deterministic vocabulary/forbidden phrases/claim rules; AI tone/messaging/unsupported-claim assessment.
- Explanation and source linking; explicit verified / needs-verification / unresolved statuses.
- Suggested corrections with preview and manual acceptance (no silent overwrite).
- Human reviews with comments, approve/request-changes and auditable states.
- Minimal governance insight dashboard: counts by issue category, submissions, review outcomes, frequently triggered guidelines. Counts from DB, not fabricated.
- Operational reliability: persistent data, health/readiness, rate limits, request budget controls, error UX, GitHub repo, working deployed URL, basic tests.

## 5. Explicit non-goals for Round 2
- Direct integrations with CMS, LinkedIn, Figma or Canva.
- Automatically publishing content to external platforms.
- Full video/audio/complex visual OCR or comprehensive accessibility testing.
- Multi-tenant enterprise SSO, complex organisation provisioning, billing, high-volume distributed deployment.
- Unsupported internet fact checking or claims of legally certified compliance.
- A dedicated vector database unless measured retrieval quality demonstrates its need.

## 6. UX requirements — intentionally flexible
Required screens: landing/auth (Google, Guest), workspace dashboard, Knowledge Vault, create/upload submission, findings with evidence drawer, review queue/detail, revision history, insights, account/settings, not-found and error states.

Design principles, **not a compulsory style guide**:
- Reviewer must identify *what failed, why, which source, what correction, and what to do next* without instruction.
- Strong information hierarchy; readable text; mobile/responsive navigation; accessible focus states/labels/keyboard navigation; sensible contrast.
- Distinguish `VIOLATION`, `NEEDS VERIFICATION`, `APPROVED`, `REQUESTED CHANGES`, `VALIDATION FAILED` with words/icons, not colour alone.
- Reuse design tokens/components once decided. Allow teammates to propose visual directions and iterate based on usability tests.
- Always include empty/loading/timeout/error/retry/success states. Never show a mocked Gemini finding as real production evidence.

## 7. Acceptance criteria / judge script
- From an incognito window, a judge can enter Guest Demo without Google and see an isolated sample workspace.
- A synthetic claims policy is visible and attributable, and the judge can submit `Our product guarantees 100% results!`.
- Validation either returns an evidence-linked issue (actual approved rule) or explicitly states no evidence/needs verification; suggested rewrite preserves intent without invented guarantees.
- Rewriting creates a new immutable content version; rerun returns a distinct version-specific result.
- Reviewer action is visibly human, recorded with identity/persona, timestamp, content version, decision and comment.
- Refresh does not erase the persisted record; deployment backend restart does not erase SQLite.
- A signed-in test account cannot access another workspace's content; guest is fenced from signed-in data.
- On Gemini outage/quota failure, deterministic findings remain available and AI status is transparently degraded, never falsely successful.
- Fresh deployed link and source repo are accessible; architecture, tech details, test evidence and member contributions are documented.

## 8. Round 2 judging alignment (100 pts)
- End-to-end workflow (30): complete sample path and real persistence.
- Technical depth/reliability (25): rule+AI separation, schema verification, authZ, cache/rate/quotas, failure coverage.
- Progress from Round 1 (20): trace each proposed feature to shipped evidence; clearly disclose stack changes.
- Three planned Round 3 improvements (15): meaningful, scoped extensions listed in ROADMAP.
- Usability (10): self-guided trial, approachable states and accessible workflows.

## 9. Definition of product success
**Reliable demonstration > feature count.** Shipping a safe, evidence-grounded approval path that survives production deployment is the primary target. Date/deadline and official build window must be confirmed from the organisers rather than assumed.

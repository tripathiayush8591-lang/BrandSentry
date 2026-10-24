# Phase 5A — Human Review & Approval (backend)

Authorised by the user's Phase 5A implementation request on 2026-10-24.
Confirmed build window is recorded in HANDOFF.md Phase 2B. Backend only;
no frontend changes, live Gemini, new infrastructure, deployment or push.

Acceptance gates:

- Workspace members inspect exact immutable content, original findings and
  stored evidence through review detail.
- Admin/reviewer decisions accept/reject/flag findings with actor, UTC time,
  optional notes (dismissal requires justification), and append-only history.
- All findings addressed before a final decision; accepted issues and
  incomplete validation prevent approval. Partial runs allow request changes.
- Real author separation, session/CSRF/role/workspace checks, exact-version
  and latest-run checks are server enforced. Demo self-review is labelled.
- Revision preconditions and actor-scoped replay keys prevent silent
  overwrites; final review locks; new versions/runs retain historical review.
- Additive migration supports existing SQLite databases; review survives
  restart and cannot edit/delete its audit events.
- Full backend pytest and Ruff gates pass; regression evidence and
  Antigravity integration instructions recorded in completion report.

Implementation plan and decision semantics: DATA_API_CONTRACTS §12.
This task does not claim completion of frontend, insights or deployed P5 gates.

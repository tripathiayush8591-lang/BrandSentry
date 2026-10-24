# Phase 5A — Human Review & Approval completion report

Date: 2026-10-24. Backend implementation complete and locally verified.
Code commit: `075222084e833b912a67fd296f22696bb795ce7e`.
Base commit: `f85436bb8aed95840416393f3258e85d7fc10aef`.

Scope: backend, SQLite migration, API documentation and tests. No frontend,
dependency, hosting or provider configuration changes. No push, deployment
or live Gemini/Firebase requests. No new external infrastructure.

## Endpoints

All routes require the existing authenticated workspace cookie session.
POSTs additionally require an admin/reviewer membership, CSRF and a required
`Idempotency-Key`. All responses retain private/no-store headers.

| Method | Path under `/api/v1` | Purpose |
|---|---|---|
| GET | `/validation-runs/{run_id}/review` | Exact content, original run/findings/evidence, current applicability, human state and decision timeline |
| POST | `/validation-runs/{run_id}/review/findings/{finding_id}` | Accept, reject or flag one finding with expected revision and notes |
| POST | `/validation-runs/{run_id}/review/decision` | Approve or request changes for the exact run/content version |

Both POSTs return an immutable decision receipt. Requests reject unknown
fields; notes are bounded to 2000 characters. Rejection requires nonblank
human justification; other notes are optional. Full schemas, errors and
examples of field semantics: `docs/DATA_API_CONTRACTS.md` §12.

## Data model and workflow

Additive Alembic revision `0006_human_review` follows
`0005_provider_budget_reservation`:

- `review_states`: run ID, monotonically increasing revision, final decision.
- `review_decisions`: append-only decision/audit event with run/finding,
  workspace, actor ID/name/role snapshot, demo label, UTC timestamp,
  decision, notes, revision, replay key and request digest. The run binds
  events to exact immutable submission/version records.
- Unique constraints protect run/revision and workspace/actor/key. Foreign
  keys retain referenced audit subjects; SQLite triggers reject event
  UPDATE/DELETE. Event and projection changes commit atomically.

State is `pending → in_review → approved|changes_requested`; an empty finding
set permits an explicit final decision directly from pending. Every finding
is required. No decision or a flag is unresolved. Accept means the issue
exists and blocks approval; reject dismisses it with justification. Finding
decisions can be superseded before finalization, retaining every prior event.
Finalization requires no unresolved findings. Approval additionally requires
complete validation/AI status and no accepted issues. Partial runs permit
request changes, never approval. Pending/running/failed runs cannot be reviewed.

Final review locks the run. New versions/runs start separate reviews and
leave historical decisions intact. Only the latest run of the latest version
accepts new writes. The existing submission status continues to report
machine validation; human state is separate, with `is_current` in review detail.

Real submission/version authors cannot review their own content, even as
admins. Isolated demo self-review is allowed and explicitly labelled with
the actual actor; no separate human/persona is fabricated. Workspace
resources outside the session return 404. Role checks use server membership.

Short SQLite `BEGIN IMMEDIATE` write transactions re-read membership,
content/run applicability and review state under the writer lock. Required
revision preconditions yield 409 for stale/concurrent requests. Exact retries
return the original receipt; reusing a key for changed body/target yields 409.
GET uses one consistent SQLite read snapshot for state and timeline.

Human review never rewrites AI findings, verification/confidence, severity,
evidence references/snapshots or content. Missing evidence stays missing;
dismissing an unverified finding does not make its source verified.

## Verification — commands actually run

Commands below ran from `backend` with live Gemini disabled.

| Check | Actual command | Result |
|---|---|---|
| Final full backend suite | `$env:GEMINI_API_KEY=''; .venv/Scripts/python -m pytest -q` | **231 passed, 1 skipped**, 136.58s |
| Phase 5A tests | `.venv/Scripts/python -m pytest tests/test_human_review.py -q` | **35 passed**, 41.25s |
| Ruff lint | `.venv/Scripts/python -m ruff check .` | PASS |
| Ruff formatting | `.venv/Scripts/python -m ruff format --check .` | PASS, 78 files |
| Whitespace | `git diff --check` and `git diff --cached --check` | PASS |
| OpenAPI inspection | Inline Python via `.venv/Scripts/python -` | Exactly three new routes; both POSTs require replay header |
| Actual process restart smoke | Inline Python via `.venv/Scripts/python -` using httpx and subprocess uvicorn | PASS: guest → submission → honest partial validation → request changes → terminate/restart → identical review/session/receipt; CSRF 403 and private/no-store verified |

The skip is the preexisting POSIX-absolute storage-path test on Windows.
The preexisting Starlette TestClient/httpx deprecation warning remains.

New regressions cover actor/role/CSRF and invalid input paths, expired/revoked
sessions, missing membership, cross-workspace IDs, wrong-run findings, real
self-review rejection/separate reviewer success, missing evidence with
explicit dismissal rationale, original deterministic/AI result preservation,
source deletion with snapshot retention, all-finding gates, provider 429 and
timeout partial runs, stale revisions/runs/versions, exact replay and payload
conflicts, distinct concurrent reviewers, duplicate concurrent writes,
finding/final races, audit failure rollback, decision immutability, migration
upgrade/downgrade and populated DB preservation, restart/session/replay
persistence. The full suite also retains prior provider 5xx and security
regressions.

Coverage classification: **LIVE_BACKEND** local ASGI/SQLite/filesystem tests
plus actual localhost TCP/uvicorn process restart; **MOCK** Gemini/Firebase
boundaries where used. **LIVE_PROVIDER** not exercised (zero live requests).
**LIVE_DEPLOYMENT** not exercised; no deployed URLs. Frontend tests/browser
integration were not run because this task changed only backend and docs.
Owned smoke processes were stopped and temporary smoke files removed.

## Review against the plan

Applied the repository `review` skill after implementation. Plan alignment:
PASS. Architecture/security/evidence boundaries: PASS. Local readiness:
PASS against the commands above. No unresolved implementation blockers found.
This is not a claim that frontend review integration or deployed P5 is complete.

## Antigravity handoff

1. Use existing session restoration, credentials and CSRF handling. Existing
   submissions/runs lists select candidates; GET the selected run's review.
2. Render exact `content_text` and `run.findings`; link citations to
   `run.evidence` by `chunk_id`. Use stored snapshots after source edits or
   deletion. Preserve machine verification labels beside human dispositions.
3. Explain accept = issue exists, reject = dismiss with required notes,
   flag = investigate. Show original and superseding human actions in the
   audit timeline. Clearly label all `is_demo` activity as demo self-review.
4. Each explicit action creates a UUID replay key and sends current
   `expected_revision`. Preserve the identical key/body for network retries.
   On 409, reload review detail and ask for a fresh explicit action; do not
   silently retry a stale final decision with a new revision/key.
5. On success, reload GET because POST returns a historical receipt. Use
   `unresolved_finding_ids`, `accepted_finding_ids`, `approval_blockers` and
   role/author restrictions to guide controls; server authorization remains
   authoritative. Partial validation must stay visibly incomplete.
6. Present final approval as current only when `status == "approved"` AND
   `is_current == true`. Preserve older approvals as version/run history.
   Never persist authoritative approval state in browser storage.
7. Test real author/reviewer separation using a separately provisioned
   workspace member. No invitation/role-management endpoint was added; tests
   provision synthetic members directly in their isolated test DBs only.
8. Before a separately authorised future deployment, back up SQLite, apply
   startup migrations on the persistent Railway volume, confirm revision
   0006/readiness, then run the deployed incognito/restart checklist. A
   downgrade drops the review tables/history and requires a backup plan.

Next action: Antigravity integrates these three endpoints in a separately
authorised frontend slice, then runs browser/API integration and later
authorised deployed smoke tests. Stop here; no further phases started.

## Changed files

`backend/app/api/v1/{review.py,router.py}`,
`backend/app/db/models.py`, `backend/app/schemas/review.py`,
`backend/app/services/review.py`,
`backend/migrations/versions/0006_human_review.py`,
`backend/tests/test_human_review.py`, `docs/ARCHITECTURE.md`,
`docs/DATA_API_CONTRACTS.md`, `tasks/phase-05a.md`,
this report and the appended `HANDOFF.md` entry.

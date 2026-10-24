# Approved frontend refresh — 2026-10-24

Scope: the user-approved visual/copy plan, with user-supplied ShineTypewriter
replacing Superpop. No backend, API schema, auth/session behavior, validation,
storage, permission or provider changes.

## Review

- Plan alignment: PASS. Warm ivory / emerald / vermilion light mode, jet black /
  hot pink / plum dark mode, responsive asymmetrical bento overview, drop shadows,
  supplied shield in login/navigation/favicon and supplied wordmark font.
- System integrity: PASS. All working actions/routes retained. Real counters use
  the original requests. Diagnostics and provider metadata use native expandable
  disclosures. Connection failures, AI-unavailable notices, verification labels,
  source links, version history and human-decision boundaries remain available.
- Scoped readiness: PASS for local UI and regressions. Existing unavailable
  Approvals/Insights routes remain disabled and now say Soon instead of Phase 5.
  No new approval or insight functionality is implied.

Design inspection: login desktop, dashboard light/dark and mobile dark screenshots
were inspected. Browser tests cover widths 1440, 820, 390 and 320 for protected
pages, and 1586, 820, 390 and 320 for login. Tests also cover keyboard navigation,
theme persistence/system preference, reduced motion and token contrast. The
vermilion tile is deepened to #D3382B for white-text readability. Working interface
text stays Inter; ShineTypewriter is reserved for the product wordmark.

## Real verification commands

From frontend:

- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed, TypeScript project build and Vite production bundle.
- `npm test`: 77 passed across 11 files.
- `npm run test:e2e`: 12 passed. Includes actual local FastAPI/SQLite guest auth,
  restart/reload, session expiry, CSRF, logout, isolated workspaces and a synthetic
  guideline upload/approval → brand rule → submission → rule findings/source flow.
  Fault injection tests are explicitly marked BROWSER_MOCK / BROWSER_FAULT.

From backend, with `GEMINI_API_KEY` empty:

- `./.venv/Scripts/python.exe -m pytest -q`: 196 passed, 1 skipped. The skip is the
  existing POSIX-volume-path test, not constructible on Windows. One existing
  Starlette/httpx deprecation warning.

Coverage: MOCK provider boundaries in regression tests and real local
LIVE_BACKEND HTTP/SQLite browser coverage. No live Gemini or Google sign-in
requests; no Vercel/Railway LIVE_DEPLOYMENT testing or release performed.

Screenshots: `frontend/evidence/phase3c-redesign/` and
`frontend/evidence/phase2b/` (local untracked browser evidence; no credentials).
Visual pattern baseline: `frontend/ui-registry.md`.

## Remaining limits

- User-supplied ShineTypewriter arrived without a separate license document;
  provenance is recorded in `frontend/public/fonts/README.md`. Do not assign
  Inter/DynaPuff's SIL license to the supplied font.
- Existing service/data/auth modules are unchanged. These tests do not establish
  the operational status of any remote deployment or external provider.

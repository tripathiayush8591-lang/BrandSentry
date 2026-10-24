# Phase 3C frontend redesign update — 2026-10-24

Implemented locally; awaiting user visual review. No commit, push or deployment. Base HEAD: `0a50954f82b2a6fd7f923112aa004649a99f3956`. Existing uncommitted backend/frontend work was preserved.

## Result

- Raspberry `#5B3DF5` actions and Pale Sky `#E8DEFF` highlights, following the supplied hex values rather than the differing photographic swatches. Charcoal dark surfaces, neutral text scale, subtle borders and restrained raised/inset shadows.
- Locally hosted, SIL OFL licensed Inter for product content; DynaPuff only on protected-app wordmarks and the Overview hero. The supplied “Wacky” image informed the mood; no claim that DynaPuff is its exact font. Font sources and licenses are in `public/fonts/`.
- Shared styling across Overview, Brand Vault, Content Studio, Validation Runs, and Findings/Evidence. Existing data clients, auth contracts, permissions and backend schemas unchanged. Approved sage/ivory login composition retained, now using Inter.
- Original CSS sun/cloud ↔ moon/stars switch: native keyboard behavior, switch state semantics, stored light/dark preference, Auto to resume live system detection, native form color scheme, reduced-motion support, visible focus and 44px theme targets.
- Better dark diagnostics, labelled Vault forms, keyboard version selection and run inspection, wrapping mobile filters, horizontally scrollable readable tables, and readable Inter excerpts.
- Unavailable counts/latency show a dash. Recent submission/run counts describe the limited recent list. Suggestions never imply approval; clipboard success follows actual clipboard completion. AI unavailability copy does not infer its cause from a single status.

## Verification actually run

| Command | Result | Coverage |
| --- | --- | --- |
| `npm run lint` | PASS, no warnings/errors | Frontend static analysis |
| `npm run typecheck` | PASS | TypeScript |
| `npm test` | 77/77 PASS, 11 files | MOCK UI/API units, including six new theme tests |
| `npm run build` | PASS | Production frontend bundle |
| `npm run test:e2e` | 12/12 PASS | Chromium + LIVE_BACKEND, plus explicitly labelled BROWSER_MOCK/BROWSER_FAULT auth cases |
| Backend `.venv/Scripts/python.exe -m pytest -q` | 173/173 PASS | Real local HTTP/SQLite/filesystem and provider-boundary MOCK cases |

The new browser flow uses a dedicated test DB/upload directory and synthetic EcoBlend content. It uploads/approves a guideline, adds a rule, submits text, runs deterministic validation, and inspects actual persisted findings/evidence. No test fixture is presented as a live AI response. Guest/session regressions include incognito isolation, expiry, CSRF, logout, backend outage/recovery and a restart. Backend regressions cover invalid identity/IDs, cross-workspace access, missing evidence, provider 429/5xx, duplicate/idempotent submissions and restart persistence.

Theme/browser checks cover persistence after reload, live system changes, keyboard operation and focus, reduced-motion transitions, loaded local fonts, token contrast >=4.5:1, correct rendered shell backgrounds, and page-width fitting at 1440, 820, 390 and 320px. Tables retain a readable minimum width inside scroll containers.

Visual evidence: `evidence/phase3c-redesign/` contains desktop light/dark captures for all five surfaces and mobile dark captures. Inspection found and corrected invalid translucent CSS-variable shell backgrounds and squeezed mobile tables before the final pass. First browser attempt also corrected a test locator's `approved`/`Approved` mismatch; no application approval failure occurred.

## Limits and next action

LIVE_PROVIDER Gemini and Firebase Google sign-in were not exercised in this update. The new browser suite explicitly leaves Gemini unconfigured. LIVE_DEPLOYMENT was not exercised; no deploy was authorised. Chromium was used; no screen-reader, Firefox/WebKit or comprehensive WCAG audit is claimed. Existing non-failing React Router future warnings and the backend Starlette/httpx deprecation warning remain.

Review the local light/dark screenshots and app changes. Commit, push and deployment require separate user approval. Current patterns are recorded at the top of `ui-registry.md`; this report supersedes the earlier Phase 3C report's palette and verification descriptions.

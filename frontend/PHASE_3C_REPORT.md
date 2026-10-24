# BrandSentry — Phase 3C UI Design Alignment Report

> Historical initial alignment report. The current redesign, palette, typography and verification evidence are in [PHASE_3C_REDESIGN_REPORT.md](PHASE_3C_REDESIGN_REPORT.md).

**Status:** Completed & Fully Verified Locally
**Date:** 2026-10-24
**Focus:** Neumorphic (Soft UI) + Premium Minimalist Dashboard & Validation Suite

---

## 1. Visual Direction & Aesthetic Execution

Inspired by the approved design reference, the BrandSentry interface has been completely aligned with a **Neumorphic (Soft UI)** visual language combined with **premium SaaS minimalism**:

### Light Theme
- **Canvas / Background**: Cool off-white/light slate (`#eef2f6`).
- **Raised Surfaces (Cards & Sidebars)**: Light neutral surface (`#f5f7fb`) with dual-directional diffused drop shadows (`6px 6px 14px rgba(166, 178, 195, 0.4), -6px -6px 14px rgba(255, 255, 255, 0.9)`).
- **Inset Controls**: Search wells, text areas, and filter wells feature inner shadows (`inset 2px 2px 5px rgba(166, 178, 195, 0.4), inset -2px -2px 5px rgba(255, 255, 255, 0.8)`) creating tactile visual depth.
- **Accent**: Soft vibrant Cobalt / Royal Blue (`#2563eb`) with ambient glow for primary buttons, active navigation pills, and interactive highlights.

### Dark Theme (Charcoal / Midnight)
- **Canvas / Background**: Rich charcoal dark canvas (`#101318`).
- **Raised Surfaces**: Deep slate (`#171c24`) with dual-directional lighting (`5px 5px 12px rgba(0, 0, 0, 0.5), -4px -4px 10px rgba(32, 38, 50, 0.5)`).
- **Inset Controls**: Inset wells (`inset 2px 2px 5px rgba(0, 0, 0, 0.6), inset -2px -2px 5px rgba(32, 38, 50, 0.4)`).
- **Persistent Storage**: Mode selection (`light | dark | system`) persists to `localStorage` and automatically syncs with `prefers-color-scheme`.

### Anti-Slop & Quality Disciplines
- **Zero Mock Clutter**: Irrelevant finance graphs, meeting schedules, and Gantt charts from the reference were eliminated. Every component directly serves brand governance.
- **Readability First**: Contrast ratios exceed WCAG AA standards (>4.5:1 for all text). Neumorphic shadows add subtle tactile separation without sacrificing legibility.
- **Keyboard Accessibility**: High-contrast outline focus rings (`outline: 2px solid #2563eb; outline-offset: 2px`) on all interactive controls.
- **Motion Consideration**: Micro-interactions lift smoothly (`transform: translateY(-1px)`), with `prefers-reduced-motion` support.

---

## 2. Page & Component Breakdown

### 1. Application Shell (`App.tsx`, `Header.tsx`, `Sidebar.tsx`)
- **Desktop Sidebar**: Persistent 256px sidebar featuring the brand mark, "+ New Submission" CTA, active navigation pills, current workspace/actor details (with demo sandbox badge), and logout control.
- **Mobile Off-Canvas Drawer**: Accessible drawer with overlay lock for small screens (<768px), triggered from the header hamburger.
- **Header**: Live inset global search bar, responsive title, theme switcher (Sun/Moon), and live backend connectivity status badge.
- **Footer**: BrandSentry mission and team provenance.

### 2. Overview Dashboard (`OverviewView.tsx`)
- **Mission Hero**: Concise brand governance value proposition.
- **4 Neumorphic KPI Cards**:
  1. *Guidelines Ingested* (Live count of documents in workspace + FTS5 indexing status)
  2. *Deterministic Rules* (Live count of active term prohibitions and pattern matchers)
  3. *Content Submissions* (Live count of drafts and revisions)
  4. *Validation Engine* (Live count of completed vs partial runs)
- **Quick Governance Actions**: Direct triggers to create a submission, upload guidelines, or configure brand rules.
- **Transparent Engine Status**: Clear callout detailing that deterministic checks run immediately and explaining provider fallback.
- **FastAPI Connectivity Panel**: Preserved real-time verification against `/api/v1/status` with latency tracking and retry.

### 3. Brand Knowledge Vault (`BrandVaultView.tsx`)
- **Documents & Guidelines Tab**: File uploader supporting drag-and-drop or browsing of PDF/TXT files (5MB cap, magic-byte inspection), document metadata table, admin "Approve" (activates into search index) and "Delete" actions, and a structural chunk inspector modal.
- **Brand Rules Tab**: Admin authoring for deterministic rules with matcher types (`contains`, `exact`, bounded `regex` with ReDoS protection), category selector, search pattern, replacement phrasing, and live toggle switches.
- **Approved Claims Tab**: Register of verified factual brand claims.
- **FTS5 Search Tab**: Interactive lexical BM25 search tester displaying retrieved chunks, scores, and page spans.

### 4. Content Studio (`ContentStudioView.tsx`)
- **Submissions Drawer**: Switch between existing drafts or start a new submission.
- **Inset Content Editor**: Monospace drafting area with 12,000 character limit and live counter.
- **Immutable Revision History**: Displays versions (v1, v2...) with timestamps, character counts, and SHA-256 checksums.
- **Validate Action**: Synchronously invokes `POST /submissions/{id}/validate` and navigates directly to the run findings inspector.

### 5. Validation Runs (`ValidationRunsView.tsx`)
- Filterable table of workspace runs with status badges (`completed`, `partial`, `failed`), AI status indicators (`complete`, `unavailable` deterministic-only, `skipped_budget`), cache hit flags, finding counts, and timestamps.

### 6. Evidence & Findings Inspector (`EvidenceFindingsView.tsx`)
- **Transparent Provider Disclosure**: Explicitly informs the user if the run was executed with Gemini unconfigured, ensuring zero fabricated AI findings.
- **Categorized Findings Cards**: Severity badges (`high`, `medium`, `low`), verification status (`SUPPORTED` in emerald, `NEEDS_VERIFICATION` in amber with specific reason), source attribution (`deterministic` vs `ai`), flagged snippet quotes, explanation, and approved alternative phrasing with one-click copy.
- **Evidence Snapshot**: Side-by-side or stacked view of immutable source chunks captured during the run, displaying document title, section reference, page numbers, and verbatim text.

### 7. Upcoming Placeholders (`types/navigation.ts`)
- **Approvals & Insights**: Displayed with lock badges as "Upcoming (Phase 5)" without fake backend calls.

---

## 3. Verification & Evidence

### Test Execution Summary

| Suite | Command | Result | Details |
|---|---|---|---|
| Frontend Vitest | `npm test` | **71/71 PASS (100%)** | 10 test files; 61 Phase 1/2 regressions + 10 new Phase 3 tests |
| TypeScript Typecheck | `npm run typecheck` | **Clean (0 errors)** | Strict mode across all new types and components |
| ESLint | `npm run lint` | **Clean (0 warnings/errors)** | `--max-warnings 0` passed |
| Production Build | `npm run build` | **Clean build** | Vite generated optimized production assets in `dist/` |
| Backend Pytest | `python -m pytest` | **173/173 PASS (100%)** | All Phase 1, 2A, 3A, and 3B backend tests remain green |

---

## 4. Operational Boundaries Observed
- No credentials, API keys, or raw tokens placed in source or logs.
- No fabricated AI findings while Gemini remains unconfigured.
- Firebase authentication and guest demo session flow preserved 100%.
- Nothing committed, pushed, or deployed without explicit user approval.

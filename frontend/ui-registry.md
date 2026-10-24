# BrandSentry UI Pattern Registry (Phase 1B)

## Read-only outage preview — 2026-10-25

File: `src/features/preview/PreviewPage.tsx`. Reuses `Card` / `.neu-card`,
`neu-btn-secondary`, `ThemeToggle`, existing light/dark canvas and text classes.
Cards use `p-6 space-y-3`; page spacing uses `space-y-6 gap-6`. Headings use
`text-3xl font-bold` and `text-xl font-semibold`. No new palette or font.
Synthetic provenance and unvalidated/unreviewed states are always visible.

## Phase 5B human review — 2026-10-24

Files: `src/features/runs/HumanReview.tsx`, `review.css`, `EvidenceFindingsView.tsx`.
Extends the current product baseline below; no palette, typography, shell or
navigation redesign. The task's older Raspberry/DynaPuff description was treated
as a request to preserve identity, using the actual current theme tokens.

| Property | Review pattern |
| --- | --- |
| Container | Existing `Card` / `.neu-card`, `p-5`, `space-y-3` |
| Background / border | `--color-surface`, `--color-canvas`, `--color-border`; no new brand colours |
| Type | Existing Inter; review body 13px/1.65, headings 15px/650, notes/meta 12px |
| Text | `--color-text-primary`, secondary `--color-text-secondary` |
| Actions | Existing `.neu-btn-primary` / `.neu-btn-secondary`; minimum 44px targets, 8px gaps, wrap then stack on mobile |
| Human boundary | Thin token border above each human-judgment section; machine labels and stored snapshots retained verbatim |
| Status | Textual human state, revision, resolved/unresolved count; historical prefix for non-current runs |
| Notices | Canvas background, 3px accent left border; words explain permission, demo identity, conflicts and recovery |
| Inputs | Existing `.neu-input`, labelled notes with 2000-character bound; rejection requires nonblank rationale |
| Confirmation | Native modal dialog with token surface/border, 20px radius, 24px padding; Cancel receives initial focus, Escape dismisses, focus returns |
| History | Revision order, separators, actor name/ID/role, local timestamp from offset-qualified UTC, preserved notes and explicit demo attribution |

Status and judgment never replace source verification. Use original snapshot text,
never fresh live-source text. No approval authority or credentials in web storage.

> Generated for pattern consistency across subsequent engineering phases.
> Style philosophy: Clean, accessible, credible B2B SaaS interface. Flexible design tokens, not a rigid cosmetic lock-in.

## Current product baseline — separate light/dark references, 2026-10-24

Supersedes the earlier solid-tile refresh and historical entries below. The user's
9.25 PM reference controls dark mode; the 9.39 PM reference controls light mode.

| Pattern | Current implementation |
| --- | --- |
| Canvas / surfaces | Light paper ivory #F6F0DE; deep emerald #073E30 type. Dark canvas #080808, panels #101113, borders #2B2B31. |
| Primary actions | Vermilion #D83215 with white text in light mode; pink #FF4FA3 with dark text at night. Hero CTA is emerald/ivory in light and lime #D9FC34/dark ink at night. |
| Accent | Vermilion light headline; hot pink #FF2D96 dark headline. Emerald light links / lime secondary dark links. |
| Artwork | Transparent generated grayscale portrait at night; emerald/ivory print portrait by day. Light vermilion orbital/halftone disks; dark broad pink/lime shapes. See `public/images/EDITORIAL_ASSETS.md`. |
| Branding | User-supplied shield and local ShineTypewriter remain in the header/login/favicon. Inter stays the working font. |
| Overview | `editorial.css`: 12-column bento, two-row portrait hero plus stacked knowledge/rule panels, two recent-work panels, full-width banner. Mobile reflows without removing actions. |
| Card | `Card.tsx` / `.neu-card`: 20px overview radius, 1px boundary and restrained drop shadow. Background stays quiet; artwork is decorative and below content. |
| Banner | Emerald with ivory text and vermilion emphasis in light; near-black with pink emphasis in dark. Existing source-checking/human-control message only. |
| Header / session | One brand placement, compact session strip, sign-out remains visible. About this demo exposes the existing demo disclosure. |
| Forms / focus | Existing `.neu-input`/button patterns, visible token outlines, unchanged labels/handlers. Native disclosures retain keyboard access. |
| Truthfulness | Original real counters, API calls and version/evidence behavior. Loading/unavailable values remain dashes. No fictional upgrade, notifications, reviews or insights. |
| Themes | Asset selection follows the app theme (including manual override); existing system preference, persistence and reduced motion behavior retained. |

Files: `src/editorial.css`, `src/index.css`, `src/features/overview/OverviewView.tsx`,
application shell, session strip, generated artwork and existing browser checks.
Historical patterns follow for context only.

## Phase 2B authentication patterns — approved reference, 2026-10-23

The supplied BrandSentry login reference owns the authentication visual direction; existing Phase 1 shell patterns below remain in use inside the protected application.

| Property | Authentication pattern |
| --- | --- |
| Primary text | `--auth-ink: #172b24`; muted text `#5b625b` |
| Backgrounds | Sage `#a8b19b`, cream `#f8f5ef`, card `#faf7f1` |
| Typography | Local Arial/Helvetica sans stack; bold tightly spaced display headings; readable system text in protected shell |
| Card | Desktop 52px radius; tablet 34px; mobile 30px; white border, restrained warm shadow |
| Controls | 84px desktop / at least 60px mobile height; 600-weight labels; 24px desktop / 18px mobile radius; 20px / 14px action gap |
| Primary action | Ivory Google button with subtle inset highlight and warm shadow |
| Secondary action | Transparent guest button with `--auth-border: #d4cec4` border |
| Focus | 3px solid `#325c45` outline, 5px offset; never remove without replacement |
| Errors | Text `#833b2b`, surface `#fbefe8`, border `#d7b8a9`; `role=alert` |
| Loading | Disabled controls, explicit action label, `aria-busy`; spinner respects reduced motion |
| Responsive order | Story and controls in two columns; below 681px compact story then login controls, no decorative artwork |
| Profile | Pale sage session strip, explicit Guest demo/Google label, server-confirmed sign-out |

Decorative artwork is a generated raster, never an authentication status or evidence claim. Icons come from the existing Lucide library; Google G comes from Google's published identity assets. See `public/images/README.md` for provenance.

## 1. Typography & Hierarchy
- Font Family: Clean system UI font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`).
- High-contrast text color tokens:
  - Heading / Primary: `text-slate-900`
  - Body / Subtext: `text-slate-600` / `text-slate-700`
  - Muted / Meta: `text-slate-500` / `text-slate-400`
  - Code / Monospace: `font-mono text-xs text-slate-800 bg-slate-100 px-1 py-0.5 rounded`

## 2. Shell & Layout
- Header: Sticky top nav (`sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200`).
- Container: Max width with responsive padding (`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`).
- Skip to main content: Accessible landmark jump (`sr-only focus:not-sr-only focus:absolute ...`).
- Footer: Subtle boundary (`border-t border-slate-200 bg-white py-6 text-xs text-slate-500`).

## 3. Brand Identity
- Wordmark: `Brand` (`font-bold text-slate-900`) + `Sentry` (`font-bold text-emerald-600`) accompanied by a dark squircle container (`bg-slate-900`) with emerald `ShieldCheck` icon.
- Tagline: "Every claim verified. Every decision accountable."

## 4. Reusable Components
### Cards
- Standard Card (`Card`): `bg-white rounded-xl border border-slate-200/80 shadow-sm`.
- Card Header: `px-6 py-5 border-b border-slate-100 bg-slate-50/50`.
- Card Body: `p-6`.

### Status Badges
- Pill container: `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium`.
- Connected (Success): `bg-emerald-50 text-emerald-800 border border-emerald-200` with solid `bg-emerald-500` dot.
- Checking / Warning: `bg-amber-50 text-amber-800 border border-amber-200` with pulsing `bg-amber-500 animate-pulse` dot.
- Error / Unavailable: `bg-rose-50 text-rose-800 border border-rose-200` with solid `bg-rose-500` dot.

### Navigation Links
- Active route: `bg-slate-900 text-white shadow-sm px-3 py-2 rounded-lg text-sm font-medium`.
- Inactive route: `text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-2 rounded-lg text-sm font-medium`.
- Upcoming / Disabled destination: `cursor-not-allowed select-none text-slate-400 opacity-75` with `aria-disabled="true"` and phase badge (`Lock` icon + uppercase phase tag).

### Interactive Buttons
- Secondary action / Retry: `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm`.

### Governance insights and report export — 2026-10-24

Files: `src/features/insights/InsightsView.tsx`, `src/features/runs/ExportReport.tsx`.

| Property | Pattern |
| --- | --- |
| Background / border / radius / shadow | Existing `Card` / `.neu-card` theme tokens; no new surface styles |
| Headings | `text-2xl font-bold` page title; `text-lg font-semibold` card headings |
| Supporting text | `text-sm text-slate-600 dark:text-slate-400`, existing editorial overrides |
| Spacing | `space-y-6` sections; `p-6 space-y-3` cards; `gap-4` label/count rows |
| Counts | Semantic `dl`, `font-semibold tabular-nums`; recorded category/status rows use lists |
| Actions | Existing `neu-btn-secondary px-4 py-2`, inherited hover/focus, disabled while loading/exporting |
| Feedback | Text loading `role=status`; errors/denial `role=alert`; explicit refresh retry |

Counts remain separate by machine origin and verification status. Human outcomes
are in their own card. All-history scope and demo disclosure stay visible; category
card is omitted when absent. No charts, fixed palette or dashboard rearrangement.
Report export appears in existing run detail; JSON preserves server snapshots and
does not render content as HTML. Desktop/mobile captures inspected in both themes.

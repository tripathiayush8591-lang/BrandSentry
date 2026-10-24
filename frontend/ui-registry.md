# BrandSentry UI Pattern Registry (Phase 1B)

> Generated for pattern consistency across subsequent engineering phases.
> Style philosophy: Clean, accessible, credible B2B SaaS interface. Flexible design tokens, not a rigid cosmetic lock-in.

## Current product baseline — approved ivory / emerald / vermilion refresh, 2026-10-24

This baseline supersedes the historical entries below, including the login palette.
The user approved the visual plan and supplied the replacement wordmark font.

| Pattern | Current implementation |
| --- | --- |
| Canvas / surface | `--color-canvas`: warm ivory #FFF8EC / jet black #080808. `--color-surface`: #FFFCF5 / #171417. |
| Primary action | Emerald #087F5B, white text; hot pink #FF4FA3, dark #230915 text in dark mode. `.neu-btn-primary`. |
| Secondary accent | Vermilion #D3382B on the guidelines tile (deepened for readable white text); dark plum #34244A at night. |
| Branding | User-supplied glossy shield: `/images/brandsentry-icon.png`; shared `.brand-icon`, rounded corners, decorative empty alt beside accessible wordmarks. Same image is the favicon. |
| Typography | Local ShineTypewriter at weight 400 for BrandSentry wordmarks only. Local Inter for headings, working text, controls and evidence. Font provenance: `public/fonts/README.md`. |
| Card | `Card.tsx` / `.neu-card`: surface token, 1px border, 24px radius, single directional drop shadow. Small cards: 12px radius. |
| Overview | `.overview-bento`: large emerald/pink drafting tile with two stacked guideline/rule tiles; full-width split recent-work panel. One column on mobile; no repeated three-card row. |
| Form | `.neu-input`: 12px radius, token boundary, readable text and placeholder, 3px focus outline. No inset bevel. |
| Spacing | Workspace sections 24px apart; tile padding 24–32px; bento gaps 16–22px. |
| Interaction | Native keyboard-operable `details`/`summary` for connection and analysis metadata. Important failures remain visible outside disclosures. |
| Copy | User-facing verbs: Check content, Upload guideline, Search guidelines. No phase numbers, engine marketing or architecture pillars in the main dashboard. |
| Theme | Existing switch and Auto preference retained, 44px target, saved preference/system changes work. Reduced motion disables movement. |
| Truthfulness | Counts still come from the same APIs; unavailable/loading values are dashes. AI-unavailable, Needs Verification, evidence, immutable versions and human-decision boundaries remain. |

Files: `src/index.css`, `tailwind.config.js`, shared components and feature views.
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

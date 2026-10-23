# BrandSentry UI Pattern Registry (Phase 1B)

> Generated for pattern consistency across subsequent engineering phases.
> Style philosophy: Clean, accessible, credible B2B SaaS interface. Flexible design tokens, not a rigid cosmetic lock-in.

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

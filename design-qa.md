# Reference-led dark and light dashboard QA — 2026-10-24

Source visual truth:
- Dark: `C:/Users/yash2/Downloads/WhatsApp Image 2026-10-24 at 9.25.31 PM.jpeg`.
- Light: `C:/Users/yash2/Downloads/WhatsApp Image 2026-10-24 at 9.39.36 PM.jpeg`.

Implementation evidence: `frontend/evidence/phase3c-redesign/reference-light.png`
and `reference-dark.png`. Full-view side-by-side comparisons:
`editorial-comparison-light.png` and `editorial-comparison-dark.png` in that folder.
Both comparisons were opened and visually inspected together with the source.
The local implementation was also opened and exercised in the Codex in-app browser.

## Normalization and state

Light source and actual capture: 1584 × 993 pixels, 1584 × 993 CSS viewport,
device scale factor 1; no resize. The comparison is 3168 × 1025 including a
32px label strip. Dark source has outer black framing; its app region is cropped
at (0, 61)–(720, 514), yielding 720 × 453. Actual dark viewport: 1440 × 906 CSS
pixels at density 1, reduced by exactly 2 for the 1440 × 485 comparison montage.
State: fresh isolated Guest Demo workspace, real zero counts, no loading dashes,
light/dark selected through the actual theme control. These are different user-
selected design references, so light is an intentional editorial print adaptation.

## Findings and comparison history

1. Initial thin neon ribbons were visually busy in the small cards (P2).
   Replaced with broad pink/lime forms in dark mode and the new light reference's
   vermilion disks, orbital curves and emerald halftone artwork.
2. Initial decorative artwork crossed the desktop supporting copy (P2).
   Confined desktop artwork to the right 48% of the hero; narrowed supporting
   copy on mobile and kept tile links over a surface-colored readable background.
3. Initial typography and tile density undershot the light reference (P2).
   Increased headline, metric and card typography; widened the responsive sidebar;
   enlarged the hero, recent-work panels and full-width banner. Recaptured both
   full views after the fixes and visually compared them against their references.

No remaining actionable P0/P1/P2 mismatch within the authorised reference-led
scope. The headline, portrait, asymmetric bento hierarchy, two recent-work panels,
outlined surfaces and banner follow both references. Light uses paper ivory,
emerald type, vermilion accents and emerald banner; dark uses black, pink and lime.

Intentional product constraints: keep the supplied shield and ShineTypewriter
wordmark; keep truthful session identity/sign-out, verification notice and optional
connection details. Do not fabricate the references' Upgrade to Pro, notification
or account controls. Existing future Approvals/Insights remain disabled. Images
are decorative generated artwork, not facts, customer data or identity avatars.

## Interaction and responsive checks

- `npm run lint`, `npm run typecheck`, `npm run build`: pass.
- `npm test`: 77 passed / 11 files.
- `npm run test:e2e`: 12 passed across real local auth and reference/workflow suites.
- Targeted reference suite rerun after the last CSS changes: 2 passed, including
  guideline upload/approval → brand rule → submission → findings/source evidence.
- Viewports 1440, 820, 390 and 320; no page overflow; all core routes accessible.
- Keyboard navigation, Escape return focus, theme persistence/system changes,
  reduced motion, token text/action contrast and correct theme artwork tested.
- Actual portrait load verified (complete and nonzero natural width). Reference
  snapshots also require all hero images to load. Main-flow page-error listener
  found no runtime errors. In-app browser refreshed after assets were saved;
  no broken images remained in the final capture. The in-app browser's error
  console was also checked and returned no errors.
- Backend regression: 196 passed, 1 Windows-only skip with provider key empty.
- No LIVE_PROVIDER Google/Gemini request or LIVE_DEPLOYMENT check performed.

## Follow-up polish

P3: the generated portrait and paper-print texture are interpretations rather
than the exact subjects in the references. Original transparent PNGs are retained;
future delivery optimization can reduce raster transfer size. This does not block
local review or the existing functional flow.

final result: passed

---

# Historical visual QA (superseded for the dashboard)

# Phase 2B login visual QA

Source visual truth: `C:/Users/yash2/Downloads/Trust starts here at BrandSentry.png` (1586×992 pixels).
Implementation: `frontend/evidence/phase2b/login-desktop-chromium.png`, 1586×992 CSS/pixel viewport, device scale factor 1, anonymous login, neutral button state. Full-view source and implementation are combined in `frontend/evidence/phase2b/design-comparison.png` (3172×1024, including a 32px label strip). No density scaling was required. Focused card comparison: `design-comparison-card.png`, equal source/implementation crops `(940,110)-(1515,878)`, 575×768 each.

## Findings and comparison history

1. Initial desktop capture had page overflow caused by artwork in document flow (P2). Fixed with an isolated, absolutely positioned portrait raster background. New source comparison shows both login controls and the card within the desktop viewport.
2. Earlier comparison showed headline/wordmark too low and desktop buttons too small/light (P2). Adjusted top spacing, 84px desktop controls, 600-weight labels and 32px icons. Recaptured all four responsive views after the final adjustment. Full and focused comparisons were opened together and inspected after these fixes. No remaining actionable P0/P1/P2 visual issue was found against the approved inspiration direction.

## Required fidelity surfaces

- Typography: local Arial/Helvetica maintains the reference's strong sans hierarchy and three-line desktop headline. Welcome heading and controls remain readable. Text is HTML; no rasterized headings. The source font was not supplied; the local stack is an accepted adaptation, not a claim of exact font identity.
- Spacing/layout: 55/45 desktop split, large storytelling region, rounded authentication card, airy action gap and soft shadows retained. Card proportions were checked in the focused crop. Tablet 820×1180 maintains two columns; 390×844 and 320×740 stack a compact story above the card and omit artwork. Real browser tests verify no horizontal overflow at all four sizes.
- Colors/tokens: sage, cream and deep green map to the reference. Restrained border and warm shadow are recorded in `frontend/ui-registry.md`. Focus/error states are distinct and readable.
- Image quality: actual generated raster artwork preserves glass shield, paper, olive leaves and stone materials. Original composition/crop differs intentionally from the reference. Lucide library shield/user icons preserve existing project identity; Google's published G asset labels only the real Google action. No custom CSS illustration substitutes were used.
- Copy/content: requested headline and supporting text preserved. Guest description is expanded to explain expiry and workspace separation, an intentional product requirement. Source's simple secure-demo line is not copied as an unqualified guarantee.

## Interactions and accessibility

Real Chromium verified keyboard tab order, visible focus, protected redirects, guest sign-in, refresh, backend restart, CSRF enforcement, backend-confirmed logout, expired sessions, backend outage/retry and isolated contexts. Fault tests separately simulate 503 and cookie loss. Loading labels, disabled controls, alert/status semantics, empty-alt decorative imagery and reduced-motion styling are implemented. Mobile actions have at least 60px targets and fit within the initial 390×844 viewport. No uncaught browser page errors in the main real guest flow.

This visual pass is not a full WCAG certification. Screen readers, Firefox/WebKit and deployed cookie behavior were not tested. Genuine Google application login remains unverified, and the backend's retained logout cookies are documented in `frontend/PHASE_2B_REPORT.md`; a visual pass does not clear those integration limitations.

## Follow-up polish

P3: source-specific font refinement and decorative material/crop tuning may be considered later. The current generated art and library mark are intentional BrandSentry adaptations.

## Implementation checklist

- [x] Desktop/full and focused comparisons opened and inspected.
- [x] P2 spacing, overflow and control-weight issues fixed and recaptured.
- [x] Tablet/mobile/small-mobile screenshots inspected or measured by real browser checks.
- [x] Interaction and integration evidence recorded independently of visual appearance.
- [x] Remaining provider/backend/security limitations disclosed.

final result: passed

## Phase 3C redesign visual QA — 2026-10-24

Current product direction follows the user's Raspberry `#5B3DF5` / Pale Sky `#E8DEFF` hex values, with Inter and selective DynaPuff, while preserving the modular sidebar dashboard. Supplied images are inspiration, not instructions or assets to reproduce.

Inspected current captures in `frontend/evidence/phase3c-redesign/`, including desktop light/dark Overview, Findings, Runs and mobile Vault/Studio. Corrected a pale dark-mode header/sidebar caused by unsupported CSS-variable opacity utilities, and mobile table columns wrapping into individual letters. The shell now uses explicit theme surface tokens; tables preserve 660px width within horizontal scrolling containers. Rechecked screenshots after fixes.

All 12 browser tests pass, including real local workflow, system/manual theme behavior, keyboard focus, reduced motion, token contrast and representative widths. Detailed coverage and limitations are recorded in `frontend/PHASE_3C_REDESIGN_REPORT.md`. This is local Chromium visual/behavior verification, not deployed or comprehensive accessibility certification.

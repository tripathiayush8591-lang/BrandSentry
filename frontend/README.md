# BrandSentry Frontend (Phase 2B — Authentication)

Lightweight, accessible React 18 + Vite + TypeScript frontend shell for BrandSentry, an AI-powered brand governance platform.

Phase 2B adds `/login`, backend-session restoration, protected routes, Google popup exchange, isolated guest entry, and server-confirmed logout. The original foundation/connectivity view remains the protected home page; future product features remain disabled.

## Authentication configuration and testing

Copy `.env.example` to ignored `.env.local` and set the four `VITE_FIREBASE_*` public web configuration values for `brandsentry-68d05`. Never include Firebase Admin credentials in frontend variables. The implementation uses Firebase's modular SDK and in-memory persistence; it clears the transient Firebase identity after exchange and never treats it as application authority.

`VITE_API_BASE_URL` is the development API base before `/api/v1`. Use matching hostnames locally, e.g. frontend `http://127.0.0.1:5173` and backend `http://127.0.0.1:8000`. Production builds always use relative requests through the cookie-preserving Railway rewrite in `vercel.json`, regardless of missing or stale API environment values.

Both sign-in endpoints and `/auth/me` use `credentials: include`. The backend sets the HttpOnly session cookie and companion CSRF cookie. Authenticated mutations echo the session-bound CSRF value from memory or the readable cookie as `X-CSRF-Token`; initial sign-ins use the backend's Origin check and include CSRF when available. No session credentials are stored in localStorage/sessionStorage. `/auth/me` owns restoration and access state. SQLite-loaded timestamps without a timezone are interpreted as UTC for scheduling only; the browser clock does not override server authentication.

On direct Vercel-to-Railway origins, the frontend cannot read Railway's companion cookie after refresh. Even with cross-site cookies enabled, CSRF restoration needs the future same-origin proxy or an approved backend change. Missing CSRF is reported; it is never bypassed.

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. For real Chromium tests, run `npx playwright install chromium` once, then `npm run test:e2e`. These tests start a dedicated backend on port 8002 with `.data/phase2b-e2e.sqlite` and a frontend on 5174; they do not modify backend code. `BRANDSENTRY_TEST_PYTHON` can override the backend virtualenv interpreter. Test-only guest creation throttling is disabled in that isolated subprocess to permit repeat runs. Production/default limits are unchanged.

Browser contexts are fresh/incognito. Traces, videos and storage-state dumps are disabled to prevent persisting session credentials. Evidence contains screenshots and cookie names/flags only. See `PHASE_2B_REPORT.md` for results and remaining blockers; backend cookie deletion and genuine Google completion are not claimed as passing.

## Architecture & Technology Stack

- **Framework**: React 18 with Vite
- **Language**: TypeScript (strict mode)
- **Routing**: React Router DOM (v6) with single-page SPA rewrites for Vercel
- **Styling**: Tailwind CSS with flexible design tokens and accessible color contrast
- **Testing**: Vitest + React Testing Library + jsdom
- **Icons**: Lucide React
- **Integration**: Real-time typed HTTP client with AbortController, request timeouts, and error handling for FastAPI backend

## Directory Structure

```
frontend/
├── public/                 # Static assets
├── src/
│   ├── app/
│   │   └── App.tsx         # Main application shell, layout, and route declarations
│   ├── components/
│   │   ├── Card.tsx        # Reusable card container
│   │   ├── Header.tsx      # Wordmark logo, responsive nav, mobile menu toggle
│   │   ├── Navigation.tsx  # Navigation links with active and upcoming indicators
│   │   └── StatusBadge.tsx # Pill status badge for connection health
│   ├── features/
│   │   ├── not-found/
│   │   │   └── NotFoundView.tsx       # 404 route fallback
│   │   └── overview/
│   │       ├── ConnectivityPanel.tsx  # Real backend health, latency & response grid
│   │       └── OverviewView.tsx       # Platform mission & roadmap preview
│   ├── hooks/
│   │   └── useBackendStatus.ts        # Typed hook managing connection state & cleanup
│   ├── services/
│   │   └── api.ts          # Typed fetch client with AbortController & schema guards
│   ├── types/
│   │   ├── api.ts          # Authoritative TypeScript types matching FastAPI contracts
│   │   └── navigation.ts   # Navigation item interfaces and destinations
│   ├── index.css           # Tailwind base, components, and utilities
│   └── main.tsx            # React application entry point
├── tests/
│   ├── setup.ts            # Test environment configuration
│   ├── api.test.ts         # Unit tests for fetchBackendStatus and error mappings
│   ├── useBackendStatus.test.ts # Hook lifecycle and abort tests
│   ├── ConnectivityPanel.test.tsx # Component tests for panel states
│   ├── Navigation.test.tsx # Responsive header, mobile menu, and link tests
│   └── App.test.tsx        # Integration tests and 404 route tests
├── .env.example            # Environment variables template
├── eslint.config.js        # ESLint flat config
├── package.json            # Scripts and dependencies
├── postcss.config.js       # PostCSS config
├── tailwind.config.js      # Tailwind design configuration
├── tsconfig.json           # Strict TypeScript configuration
├── ui-registry.md          # Recorded UI patterns for cross-phase consistency
├── vercel.json             # Vercel SPA rewrite configuration
└── vite.config.ts          # Vite and Vitest configuration
```

## Local Development Commands

Ensure the FastAPI backend is running first (defaulting to `http://127.0.0.1:8000`):

```bash
# In backend/
.venv/Scripts/python -m app
```

Then start the frontend:

```bash
cd frontend
npm install

# Start development server
npm run dev

# Run TypeScript type check
npm run typecheck

# Run ESLint
npm run lint

# Run automated tests
npm test

# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Vercel Deployment Configuration (Phase 4)

- Root Directory: `frontend`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- API requests: same-origin `/api` proxy; `VITE_API_BASE_URL` is ignored in production.
- `/preview`: public read-only synthetic examples, available during backend outages; grants no authenticated access.

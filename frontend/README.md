# BrandSentry Frontend (Phase 1B — Foundation)

Lightweight, accessible React 18 + Vite + TypeScript frontend shell for BrandSentry, an AI-powered brand governance platform.

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
- Environment Variables: `VITE_API_BASE_URL` (configured to Railway backend URL)

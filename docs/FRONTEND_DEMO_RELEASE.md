# Frontend Guest Demo release — 2026-10-25

Explicitly authorized by the user as the final frontend demo deployment, including
commit and push to origin/master. This is an exception to the earlier planning-only
scope for a presentation preview; backend guest authentication is unchanged.

`/preview` mounts the actual production dashboard and all existing major views.
An in-memory adapter supplies fictional BrewNest Coffee data matching the frontend
read contracts. No session, Firebase identity, token or backend permission is created.
Every adapter mutation rejects with “Available in connected mode”; upload/admin,
save/validation/review and report-export controls remain unavailable. The persistent
banner identifies synthetic data and simulated evidence/review history. Metrics
count sample records only. Real APIs, authentication and backend files are unchanged.

Verification commands:

```powershell
cd frontend
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright test --config playwright.preview.config.ts
npx playwright test e2e/production-recovery.spec.ts e2e/auth.spec.ts
```

Results: lint/typecheck/build passed; 117 frontend tests passed; 5 production-build
preview browser tests passed (seven routes in four viewport/theme combinations
plus drilldowns); 13 authentication/recovery browser tests passed. Backend
`.venv/Scripts/python.exe -m pytest -q`: 239 passed, one Windows-specific skip
(POSIX volume path test). No LIVE_PROVIDER coverage.

The preview suite serves the production dist using Vite preview, without starting
a backend. It checks every sidebar destination, light/dark, desktop/mobile, direct
reload, drilldowns, missing IDs, unavailable writes, and absence of API/Firebase
requests or page errors. Saved localhost reference screenshots were compared with
new preview captures in both themes and mobile. The same components/styles render
both experiences. No new libraries, backend changes or provider calls were added.

Production recheck (fresh incognito context):

```powershell
$env:PREVIEW_BASE_URL = 'https://brand-sentry.vercel.app'
npx playwright test --config playwright.preview.config.ts
Remove-Item Env:PREVIEW_BASE_URL
```

Coverage: OFFLINE_SYNTHETIC/MOCK for preview; LIVE_BACKEND for local authentication,
expiry, cookies, CSRF, restart and workspace isolation. LIVE_PROVIDER not exercised;
no Gemini requests permitted. Railway production and Google login are outside this
release and remain dependent on their connected services. Backend pytest may include
pre-existing/uncommitted backend work; none of that work is included in this release.

Deployment identity: Vercel project `brand-sentry`, production branch `master`,
repository `tripathiayush8591-lang/BrandSentry`, public route
https://brand-sentry.vercel.app/preview. Verify Vercel's deployed Git SHA against
the release commit; a Git push alone is not deployment confirmation.

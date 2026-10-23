# Context Pack Manifest

Version: 1.0 — 2026-10-23. Content status: PRE-BUILD PLANNING.

## Permanent context files — 8
- [AGENTS.md](AGENTS.md)
- [docs/PRD.md](docs/PRD.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DATA_API_CONTRACTS.md](docs/DATA_API_CONTRACTS.md)
- [docs/AI_VALIDATION.md](docs/AI_VALIDATION.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/DEPLOYMENT_RUNBOOK.md](docs/DEPLOYMENT_RUNBOOK.md)

## Active implementation task brief — 1
- [tasks/phase-01.md](tasks/phase-01.md) — prepare now; implement only after official start.

## Extra helper files — 2
- [README.md](README.md)
- [.env.example](.env.example)

## Ground rules
- **Never claim this ZIP contains a built or deployed app.** It contains only plans, contracts and documentation.
- External docs and original organiser/round-one PDFs are referenced but not bundled.
- The existing first-round deck proposed Firebase across auth/data/storage; **post-round-one agreed Round 2 change** uses Firebase for Google Auth only and persistent SQLite as data store.
- UI direction intentionally flexible. AI result cache, quotas, deduplication and rate limits belong to server. Every feature has a live deployment acceptance gate.
- Later task files and `HANDOFF.md` should be created during the permitted build work as needed.

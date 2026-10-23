# BrandSentry Backend (Phase 1A — Local Foundation)

FastAPI + Pydantic + SQLAlchemy/SQLite backend foundation. **Phase 1A is local
development only** — no Railway/Vercel deployment until Phase 4, no auth,
Gemini, validation or domain features yet (see `AGENTS.md` and `tasks/`).

## Layout

```
backend/
├── app/
│   ├── main.py            # create_app() factory + lifespan (engine setup/teardown)
│   ├── __main__.py        # `python -m app` → uvicorn on settings.bind_host:port
│   ├── config.py          # pydantic-settings, env-driven (see backend/.env.example)
│   ├── api/
│   │   ├── deps.py        # get_db, request-id dependencies
│   │   ├── health.py      # GET /health, GET /ready
│   │   └── v1/            # GET /api/v1/status (+ future v1 routes)
│   ├── core/
│   │   ├── errors.py      # {"error":{code,message,request_id}} contract handlers
│   │   ├── request_id.py  # X-Request-ID middleware (sanitised, ContextVar)
│   │   └── logging.py     # root logging setup
│   └── db/
│       ├── base.py        # DeclarativeBase (no production tables yet)
│       └── session.py     # engine builder, SQLite pragmas, session factory,
│                       # connectivity + storage-writability checks
└── tests/                 # pytest suite (temp SQLite per test)
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Cheap liveness: `{"status":"ok",...}` + request ID. Touches no dependencies. |
| GET | `/ready` | Readiness: SQLite `SELECT 1` + writable DB directory. `503` with `status:"not_ready"` + per-check details on failure. Never calls AI providers. |
| GET | `/api/v1/status` | Structured availability payload: service, version, environment, UTC time, request ID. |

All failures use the shared error contract from `docs/DATA_API_CONTRACTS.md` §5:

```json
{"error": {"code": "NOT_FOUND", "message": "...", "request_id": "req_..."}}
```

Every response carries an `X-Request-ID` header (caller-supplied value is used
only when safely formatted; otherwise a fresh `req_<hex>` is generated).

## Run locally

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Windows Git Bash (PowerShell: .venv\Scripts\Activate.ps1)
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements-dev.txt

python -m app                    # http://127.0.0.1:8000  (or: uvicorn app.main:app --reload)
```

Interactive docs: `http://127.0.0.1:8000/docs`.

The local SQLite database is created automatically at `.data/db/brandsentry.sqlite`
relative to `backend/` on first connection; `.data/` and `.env` are git-ignored.

## Tests

```bash
cd backend
pytest            # full suite
```

Coverage: health, readiness (incl. DB-unreachable → 503), `/api/v1/status`,
CORS allow/deny/preflight, SQLite write/read persistence across engine restart,
connection pragmas, error contract (404/405/422) and request-ID propagation.

## Configuration

Environment variables (or `backend/.env`, git-ignored; template: `.env.example`):

| Variable | Default (local) | Notes |
|---|---|---|
| `APP_ENV` | `development` | `production`/`staging` changes bind host default to `0.0.0.0`. |
| `DATABASE_URL` | `sqlite:///./.data/db/brandsentry.sqlite` | Future deployment: `sqlite:////data/db/brandsentry.sqlite` on a Railway persistent volume mounted at `/data`. |
| `FRONTEND_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS allow-list; never `*`. |
| `HOST` / `PORT` | inferred / `8000` | Railway injects `PORT`; do not hardcode when deployed. |
| `LOG_LEVEL` | `INFO` | Standard Python levels. |
| `UPLOAD_DIR` | `./.data/uploads` | Reserved for Phase 3+ guideline files. |

## Deployment compatibility (Phase 4, nothing deployed now)

- Start command on Railway: `python -m app` — binds `0.0.0.0` (non-development
  default) and honors the injected `PORT`.
- Persistent volume must be mounted at `/data`; database file
  `/data/db/brandsentry.sqlite`, uploads `/data/uploads` (per
  `docs/DEPLOYMENT_RUNBOOK.md`). Schema initialisation will run at controlled
  service startup (volume is unavailable during build).

## Known deferrals

- **Alembic** arrives with the first real entities (Phase 2+); Phase 1A has no
  production tables, so there is nothing to migrate yet.
- No lint/format tooling installed yet (ruff suggested as follow-up).

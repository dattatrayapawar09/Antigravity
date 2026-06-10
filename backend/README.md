# AntiGravity — Python/FastAPI Backend

Production-ready Python port of the original Node.js/Express backend.  
The vanilla-JS frontend is **unchanged** — all API contracts are identical.

## Stack

| Layer | Library |
|---|---|
| Framework | FastAPI + Uvicorn |
| HTTP client | httpx (async) |
| TOTP | pyotp |
| Config | pydantic-settings + python-dotenv |
| Background | asyncio tasks |

## Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app + lifespan
│   ├── config.py               # Pydantic settings
│   ├── smartapi.py             # Angel One API client (async)
│   ├── auth.py                 # Login helper with lock
│   ├── models.py               # Request / response models
│   ├── routes/
│   │   ├── auth.py             # GET /api/auth/status  POST /api/auth/login
│   │   ├── instruments.py      # POST /api/instruments/spot|options|avgvol
│   │   └── debug.py            # GET /api/health  /api/debug/*
│   ├── services/
│   │   ├── instrument_utils.py # Scrip master parser + option chain builder
│   │   └── cache.py            # In-memory cache state
│   └── background/
│       └── scheduler.py        # Periodic auth + scrip refresh tasks
├── requirements.txt
├── .env.example
└── README.md
```

## Local Development

```bash
cd backend

# Copy and fill in your credentials
cp .env.example .env

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

## Render Deployment

The `render.yaml` at the repo root configures the Render service:

- **rootDir**: `backend`
- **buildCommand**: `pip install -r requirements.txt`
- **startCommand**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Set these environment variables in the Render dashboard:

| Variable | Description |
|---|---|
| `ANGEL_API_KEY` | Angel One API key |
| `ANGEL_CLIENT_ID` | Your Angel One client ID |
| `ANGEL_PASSWORD` | Your Angel One password |
| `ANGEL_TOTP_SECRET` | TOTP base32 secret |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/auth/status` | Auth status |
| `POST` | `/api/auth/login` | Manual login |
| `POST` | `/api/instruments/spot` | Spot prices |
| `POST` | `/api/instruments/options` | Option chain |
| `POST` | `/api/instruments/avgvol` | Avg volume |
| `GET` | `/api/debug/cache` | Cache stats |
| `GET` | `/api/debug/validate` | Contract debug |

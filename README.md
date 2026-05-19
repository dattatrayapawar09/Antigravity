# Indian Options Trading Analytics — PRO Scanner

A real-time F&O options scanner for Indian markets powered by Angel One SmartAPI.

## Features
- 📊 Real-time options chain scanning (Index & Stock F&O)
- 📈 Volume surge detection & signal engine
- 🔗 Angel One SmartAPI integration (live spot prices)
- 🟡 Mock mode fallback (works without API keys)
- ⚙️ Settings modal for API configuration

## Live Demo
[View on GitHub Pages](https://YOUR_USERNAME.github.io/Antigravity/)

## Local Setup

### Frontend only (mock mode)
Open `index.html` directly in your browser — no server needed.

### With SmartAPI backend (live data)

**Prerequisites:** [Node.js](https://nodejs.org) v18+

```bash
cd backend
npm install
# Edit backend/.env with your Angel One credentials
node server.js
```

Then open `index.html` — the header badge turns 🟢 SmartAPI Live.

## Deployment

- **Frontend:** GitHub Pages (automatic via this repo)
- **Backend:** [Render.com](https://render.com) free tier — see `/backend`

## Angel One SmartAPI
Get your API key from [smartapi.angelone.in](https://smartapi.angelone.in).
Required: API Key, Client ID, Trading PIN, TOTP Secret.

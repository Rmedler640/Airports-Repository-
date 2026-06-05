# ✈ AeroGuess

**Daily airport identification game** — 5 FAA Part 139 commercial service airports every day.  
Identify airports from overhead satellite imagery, with AI-generated trivia hints.

---

## How It Works

- **Daily seed**: 5 airports are selected each day using a date-based shuffle of the full 200+ airport database
- **AI hints**: On server startup (or first request), Claude generates unique trivia hints for each airport via the Anthropic API — these are cached so they're only generated once per day
- **Automatic refresh**: At midnight UTC, the server pre-generates the next day's airports and hints
- **Server-side validation**: All guesses are validated on the server — the airport name and city are never sent to the client until after the round ends
- **Leaderboard**: Stored in browser localStorage (can be upgraded to a real database)

---

## Quick Start

### 1. Install dependencies

```bash
cd aeroguess
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and add your Anthropic API key
```

### 3. Run

```bash
# Production
npm start

# Development (auto-restart on changes)
npm run dev
```

The server will start on `http://localhost:3000` and immediately begin generating today's airport hints.

---

## Project Structure

```
aeroguess/
├── server.js              # Express server, API routes, daily scheduler
├── data/
│   ├── airports.js        # Full FAA Part 139 airport database (~200 airports)
│   └── cache/             # Auto-generated daily JSON files (gitignored)
│       └── daily-YYYY-MM-DD.json
├── public/
│   ├── index.html         # Single-page app shell
│   ├── css/style.css      # Full stylesheet
│   └── js/app.js          # Game engine, API calls, leaderboard
├── .env.example
├── .gitignore
└── package.json
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/daily` | Today's 5 airports with hints (sanitized — no city/name until revealed) |
| `POST` | `/api/guess` | Validate a guess server-side |
| `POST` | `/api/hint` | Generate a live AI extra hint for a round |
| `POST` | `/api/reveal` | Reveal full airport info after round ends |
| `GET` | `/api/airports` | Full airport list for autocomplete |
| `GET` | `/api/status` | Health check + cache status |

---

## Daily Cache

Each day's airports are cached to `data/cache/daily-YYYY-MM-DD.json`:

```json
{
  "date": "2026-06-05",
  "generated": "2026-06-05T00:00:42.123Z",
  "airports": [
    {
      "code": "BZN",
      "name": "Bozeman Yellowstone International",
      "city": "Bozeman",
      "state": "MT",
      "lat": 45.7775,
      "lon": -111.1527,
      "zoom": 13,
      "hint": "Surrounded by <strong>snowcapped peaks of the Gallatin Range</strong>, ..."
    },
    ...
  ]
}
```

If the cache file exists, no API calls are made. Delete the file to regenerate.

---

## Deployment

### Railway / Render / Fly.io (recommended)

1. Push to GitHub
2. Connect your repo to Railway/Render
3. Set environment variable: `ANTHROPIC_API_KEY=sk-ant-...`
4. Deploy — the platform handles the rest

### VPS / Self-hosted

```bash
# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start server.js --name aeroguess

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p data/cache
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Extending the Game

### Add more airports
Edit `data/airports.js` — add any object matching:
```js
{ code, name, city, state, lat, lon, zoom }
```

### Use a real database for leaderboard
Replace the `localStorage` calls in `public/js/app.js` with API calls to a `/api/leaderboard` endpoint backed by PostgreSQL, SQLite, or MongoDB.

### Add international airports
The game supports non-US airports — just add them to the database with a country field instead of state.

### Scoring system
Currently: 2000 pts → 1500 → 1000 → 500 (based on guesses needed). Tweak `Math.max(2000 - (guesses-1) * 500, 500)` in `server.js` and `app.js`.

---

## Tech Stack

- **Backend**: Node.js + Express
- **AI**: Anthropic Claude (hint generation)
- **Maps**: Leaflet.js + ArcGIS World Imagery (satellite tiles)
- **Frontend**: Vanilla JS, no framework
- **Fonts**: Oswald + IBM Plex (Google Fonts)
- **Storage**: File-based daily cache + browser localStorage

---

## License

MIT

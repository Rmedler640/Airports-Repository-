require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const AIRPORTS = require('./data/airports');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(__dirname, 'data', 'cache');

// Debug: log env at startup
console.log('[startup] PORT:', PORT);
console.log('[startup] ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY);
if (process.env.ANTHROPIC_API_KEY) {
  console.log('[startup] ANTHROPIC_API_KEY prefix:', process.env.ANTHROPIC_API_KEY.slice(0, 14));
}

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey: key });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getCachePath(dateKey) {
  return path.join(CACHE_DIR, `daily-${dateKey}.json`);
}

function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = Math.imul(s, 1664525) + 1013904223 | 0;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dateSeed(dateKey) {
  return dateKey.split('-').reduce((acc, n) => acc * 10000 + parseInt(n), 0);
}

// ── AI Hint Generation ────────────────────────────────────────────────────────

async function generateHint(airport) {
  const msg = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: `You are an aviation trivia writer for a daily airport guessing game called AeroGuess.
Generate a single punchy hint about the given airport. Rules:
- NEVER mention the airport's IATA code, full name, or city name directly
- Focus on ONE vivid, specific fact: geography, runway layout, famous history, airline significance, nearby landmark, architectural feature, elevation, a record it holds, or an unusual quirk
- Wrap the most distinctive phrase in <strong> tags
- Keep it to 2-3 sentences maximum
- Be specific — avoid generic phrases like "busy airport" or "serves millions"
- Output ONLY the hint HTML with no preamble or explanation`,
    messages: [{ role: 'user', content: `Airport: ${airport.name}, ${airport.city}, ${airport.state} (${airport.code})` }]
  });
  return msg.content[0].text.trim();
}

async function generateExtraHint(airport, mainHint) {
  const msg = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: `You are an aviation trivia writer. Generate a SHORT bonus hint about the airport — reveal something clearly different from the main hint already shown. You MAY mention the US state or general region but NOT the city or airport name/code. Keep it to 1-2 sentences. Output only the hint text, no HTML tags, no preamble.`,
    messages: [{ role: 'user', content: `Airport: ${airport.name} (${airport.code}), ${airport.city}, ${airport.state}.\nMain hint already shown: "${mainHint.replace(/<[^>]+>/g, '')}"\nWrite a different clue.` }]
  });
  return msg.content[0].text.trim();
}

// ── Daily Cache Generation ────────────────────────────────────────────────────

async function buildDailyCache(dateKey) {
  console.log(`[${dateKey}] Building daily cache...`);

  const seed = dateSeed(dateKey);
  const shuffled = seededShuffle(AIRPORTS, seed);
  const selected = shuffled.slice(0, 5);

  const hints = await Promise.all(selected.map(ap => generateHint(ap)));

  const daily = selected.map((ap, i) => ({
    code: ap.code,
    name: ap.name,
    city: ap.city,
    state: ap.state,
    lat: ap.lat,
    lon: ap.lon,
    zoom: ap.zoom,
    hint: hints[i]
  }));

  const payload = {
    date: dateKey,
    generated: new Date().toISOString(),
    airports: daily
  };

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(getCachePath(dateKey), JSON.stringify(payload, null, 2));
  console.log(`[${dateKey}] Cache built: ${daily.map(a => a.code).join(', ')}`);

  return payload;
}

async function getDailyData(dateKey) {
  const cachePath = getCachePath(dateKey);
  if (fs.existsSync(cachePath)) {
    try {
      const raw = fs.readFileSync(cachePath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Cache read error, rebuilding:', e.message);
    }
  }
  return buildDailyCache(dateKey);
}

// ── Midnight refresh scheduler ────────────────────────────────────────────────

async function scheduleDaily() {
  const todayKey = getTodayKey();
  try {
    await getDailyData(todayKey);
    console.log(`[startup] Daily data ready for ${todayKey}`);
  } catch (e) {
    console.error('[startup] Failed to load daily data:', e.message);
  }

  function msUntilMidnightUTC() {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return midnight - now;
  }

  async function refreshAtMidnight() {
    const wait = msUntilMidnightUTC();
    console.log(`[scheduler] Next refresh in ${Math.round(wait / 60000)} minutes`);
    setTimeout(async () => {
      const nextKey = getTodayKey();
      try {
        await buildDailyCache(nextKey);
        console.log(`[scheduler] Refreshed cache for ${nextKey}`);
      } catch (e) {
        console.error('[scheduler] Refresh failed:', e.message);
      }
      refreshAtMidnight();
    }, wait);
  }

  refreshAtMidnight();
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/daily', async (req, res) => {
  try {
    const dateKey = getTodayKey();
    const data = await getDailyData(dateKey);
    const sanitized = {
      date: data.date,
      airports: data.airports.map(a => ({
        code: a.code,
        lat: a.lat,
        lon: a.lon,
        zoom: a.zoom,
        hint: a.hint,
      }))
    };
    res.json(sanitized);
  } catch (e) {
    console.error('/api/daily error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/guess', async (req, res) => {
  try {
    const { date, roundIndex, guess } = req.body;
    if (roundIndex < 0 || roundIndex > 4) return res.status(400).json({ error: 'Invalid round' });

    const dateKey = date || getTodayKey();
    const data = await getDailyData(dateKey);
    const airport = data.airports[roundIndex];
    if (!airport) return res.status(400).json({ error: 'Invalid round index' });

    const g = (guess || '').toUpperCase().trim();
    const correct =
      g === airport.code ||
      g === airport.city.toUpperCase() ||
      g === airport.name.toUpperCase() ||
      (airport.name.toUpperCase().includes(g) && g.length > 4) ||
      airport.city.toUpperCase().split(',')[0].trim() === g;

    res.json({
      correct,
      reveal: correct ? { code: airport.code, name: airport.name, city: airport.city, state: airport.state } : null
    });
  } catch (e) {
    console.error('/api/guess error:', e.message);
    res.status(500).json({ error: 'Guess check failed' });
  }
});

app.post('/api/hint', async (req, res) => {
  try {
    const { date, roundIndex } = req.body;
    const dateKey = date || getTodayKey();
    const data = await getDailyData(dateKey);
    const airport = data.airports[roundIndex];
    if (!airport) return res.status(400).json({ error: 'Invalid round' });

    const extra = await generateExtraHint(airport, airport.hint);
    res.json({ hint: extra });
  } catch (e) {
    console.error('/api/hint error:', e.message);
    res.status(500).json({ error: 'Could not generate hint' });
  }
});

app.post('/api/reveal', async (req, res) => {
  try {
    const { date, roundIndex } = req.body;
    const dateKey = date || getTodayKey();
    const data = await getDailyData(dateKey);
    const airport = data.airports[roundIndex];
    if (!airport) return res.status(400).json({ error: 'Invalid round' });
    res.json({ code: airport.code, name: airport.name, city: airport.city, state: airport.state });
  } catch (e) {
    res.status(500).json({ error: 'Reveal failed' });
  }
});

app.get('/api/airports', (req, res) => {
  res.json(AIRPORTS.map(a => ({ code: a.code, name: a.name, city: a.city, state: a.state })));
});

app.get('/api/status', (req, res) => {
  const todayKey = getTodayKey();
  const key = process.env.ANTHROPIC_API_KEY;
  res.json({
    status: 'ok',
    today: todayKey,
    cached: fs.existsSync(getCachePath(todayKey)),
    totalAirports: AIRPORTS.length,
    apiKey: key ? `${key.slice(0, 14)}... (length: ${key.length})` : 'NOT SET',
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`\n✈  AeroGuess running on port ${PORT}`);
  console.log(`   Airports: ${AIRPORTS.length}`);
  await scheduleDaily();
});

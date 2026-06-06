require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const AIRPORTS = require('./data/airports');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(__dirname, 'data', 'cache');

console.log('[startup] AeroGuess starting...');
console.log('[startup] PORT:', PORT);
console.log('[startup] API key set:', !!process.env.ANTHROPIC_API_KEY);

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

// ── AI with retry ─────────────────────────────────────────────────────────────

async function callWithRetry(fn, retries = 4, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      console.error(`[retry ${i+1}/${retries}] ${e.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      else throw e;
    }
  }
}

async function generateHint(airport) {
  return callWithRetry(async () => {
    const msg = await getClient().messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      system: `You are an aviation trivia writer for a daily airport guessing game called AeroGuess.
Generate a single punchy hint about the given airport. Rules:
- NEVER mention the airport's IATA code, full name, or city name directly
- Focus on ONE vivid specific fact: geography, runway layout, history, airline significance, nearby landmark, architectural feature, elevation, a record, or quirk
- Wrap the most distinctive phrase in <strong> tags
- 2-3 sentences max
- Output ONLY the hint HTML, no preamble`,
      messages: [{ role: 'user', content: `Airport: ${airport.name}, ${airport.city}, ${airport.state} (${airport.code})` }]
    });
    return msg.content[0].text.trim();
  });
}

async function generateExtraHint(airport, mainHint) {
  return callWithRetry(async () => {
    const msg = await getClient().messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      max_tokens: 200,
      system: `You are an aviation trivia writer. Generate a SHORT bonus hint — something different from the main hint. You MAY mention the US state or region but NOT the city or airport name/code. 1-2 sentences. Plain text only, no HTML, no preamble.`,
      messages: [{ role: 'user', content: `Airport: ${airport.name} (${airport.code}), ${airport.city}, ${airport.state}.\nMain hint: "${mainHint.replace(/<[^>]+>/g, '')}"\nWrite a different clue.` }]
    });
    return msg.content[0].text.trim();
  });
}

function isFallbackHint(hint) {
  return hint && hint.includes('FAA Part 139 certificated airport');
}

function fallbackHint(airport) {
  return `A <strong>FAA Part 139 certificated airport</strong> serving scheduled commercial airline operations in ${airport.state}.`;
}

// ── Daily Cache ───────────────────────────────────────────────────────────────

const building = {};

async function buildDailyCache(dateKey, forceRegenHints = false) {
  if (building[dateKey] && !forceRegenHints) {
    await building[dateKey];
    return JSON.parse(fs.readFileSync(getCachePath(dateKey), 'utf8'));
  }

  let resolve;
  building[dateKey] = new Promise(r => { resolve = r; });

  try {
    console.log(`[${dateKey}] Building daily cache... (forceRegen: ${forceRegenHints})`);
    const seed = dateSeed(dateKey);
    const selected = seededShuffle(AIRPORTS, seed).slice(0, 5);

    // If cache exists and we're just regenerating hints, keep existing good hints
    let existingHints = [];
    if (forceRegenHints && fs.existsSync(getCachePath(dateKey))) {
      try {
        const existing = JSON.parse(fs.readFileSync(getCachePath(dateKey), 'utf8'));
        existingHints = existing.airports.map(a => a.hint);
      } catch {}
    }

    const hints = await Promise.all(selected.map(async (ap, i) => {
      // Keep existing hint if it's a good AI-generated one
      if (existingHints[i] && !isFallbackHint(existingHints[i])) {
        return existingHints[i];
      }
      try {
        const hint = await generateHint(ap);
        console.log(`[hint OK] ${ap.code}`);
        return hint;
      } catch (e) {
        console.error(`[hint fallback] ${ap.code}: ${e.message}`);
        return fallbackHint(ap);
      }
    }));

    const allFallback = hints.every(isFallbackHint);
    if (allFallback) {
      console.warn('[cache] All hints are fallbacks — API may be down, will retry next request');
    }

    const payload = {
      date: dateKey,
      generated: new Date().toISOString(),
      allFallback,
      airports: selected.map((ap, i) => ({
        code: ap.code, name: ap.name, city: ap.city, state: ap.state,
        lat: ap.lat, lon: ap.lon, zoom: ap.zoom, hint: hints[i]
      }))
    };

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(getCachePath(dateKey), JSON.stringify(payload, null, 2));
    console.log(`[${dateKey}] Cache saved: ${payload.airports.map(a => a.code).join(', ')}`);
    return payload;
  } finally {
    resolve();
    delete building[dateKey];
  }
}

async function getDailyData(dateKey) {
  const cachePath = getCachePath(dateKey);

  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      // If all hints are fallbacks, try to regenerate silently in background
      if (cached.allFallback) {
        console.log('[cache] Fallback hints detected — regenerating in background...');
        buildDailyCache(dateKey, true).catch(e =>
          console.error('[cache] Background regen failed:', e.message)
        );
      }
      return cached;
    } catch (e) {
      console.error('Cache parse error:', e.message);
    }
  }

  return buildDailyCache(dateKey);
}

// ── Self-ping to keep Render awake ────────────────────────────────────────────

function startKeepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  if (!url) {
    console.log('[keepalive] No RENDER_EXTERNAL_URL set — skipping self-ping');
    return;
  }
  const interval = 14 * 60 * 1000; // every 14 minutes
  setInterval(async () => {
    try {
      const http = require('https');
      http.get(url + '/api/status', res => {
        console.log('[keepalive] Ping OK:', res.statusCode);
      }).on('error', e => {
        console.error('[keepalive] Ping failed:', e.message);
      });
    } catch (e) {
      console.error('[keepalive] Error:', e.message);
    }
  }, interval);
  console.log(`[keepalive] Pinging ${url} every 14 minutes`);
}

// ── Midnight scheduler ────────────────────────────────────────────────────────

function scheduleMidnightRefresh() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const wait = midnight - now;
  console.log(`[scheduler] Next refresh in ${Math.round(wait / 60000)} min`);
  setTimeout(async () => {
    try {
      await buildDailyCache(getTodayKey());
    } catch (e) {
      console.error('[scheduler] Refresh failed:', e.message);
    }
    scheduleMidnightRefresh();
  }, wait);
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/daily', async (req, res) => {
  try {
    const data = await getDailyData(getTodayKey());
    res.json({
      date: data.date,
      airports: data.airports.map(a => ({
        code: a.code, lat: a.lat, lon: a.lon, zoom: a.zoom, hint: a.hint
      }))
    });
  } catch (e) {
    console.error('/api/daily error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/guess', async (req, res) => {
  try {
    const { date, roundIndex, guess } = req.body;
    const data = await getDailyData(date || getTodayKey());
    const airport = data.airports[roundIndex];
    if (!airport) return res.status(400).json({ error: 'Invalid round' });

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
    res.status(500).json({ error: 'Guess check failed' });
  }
});

app.post('/api/hint', async (req, res) => {
  try {
    const { date, roundIndex } = req.body;
    const data = await getDailyData(date || getTodayKey());
    const airport = data.airports[roundIndex];
    if (!airport) return res.status(400).json({ error: 'Invalid round' });
    const hint = await generateExtraHint(airport, airport.hint);
    res.json({ hint });
  } catch (e) {
    console.error('/api/hint error:', e.message);
    res.status(500).json({ error: 'Could not generate hint' });
  }
});

app.post('/api/reveal', async (req, res) => {
  try {
    const { date, roundIndex } = req.body;
    const data = await getDailyData(date || getTodayKey());
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
    apiKey: key ? key.slice(0, 14) + '...' : 'NOT SET',
  });
});

// Force regenerate hints for today (useful after wake-up)
app.post('/api/admin/regen', async (req, res) => {
  try {
    const data = await buildDailyCache(getTodayKey(), true);
    res.json({ ok: true, airports: data.airports.map(a => ({ code: a.code, hint: a.hint.slice(0, 60) })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✈  AeroGuess running on port ${PORT}`);
  console.log(`   ${AIRPORTS.length} airports in database`);
  scheduleMidnightRefresh();
  startKeepAlive();
  // Warm up cache on startup, non-blocking
  getDailyData(getTodayKey()).then(data => {
    const fallbacks = data.airports.filter(a => isFallbackHint(a.hint)).length;
    if (fallbacks > 0) {
      console.log(`[startup] ${fallbacks} fallback hints detected, rebuilding...`);
      buildDailyCache(getTodayKey(), true).catch(e =>
        console.error('[startup] Regen failed:', e.message)
      );
    }
  }).catch(e => console.error('[startup] Cache warm failed:', e.message));
});

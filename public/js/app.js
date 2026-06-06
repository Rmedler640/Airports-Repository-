/* ── AeroGuess Frontend ───────────────────────────────────────────────────── */

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  daily: null,         // API response: { date, airports[] }
  airports: [],        // full airport list for autocomplete
  curRound: 0,
  score: 0,
  guesses: 0,
  maxGuesses: 4,
  roundDone: false,
  completed: 0,
  roundPts: [],
  hintUsed: false,
  map: null,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Storage helpers ───────────────────────────────────────────────────────────
function lsGet(key, def) {
  try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(def)); }
  catch { return def; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── Screen switcher ───────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`${id}-screen`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (id === 'play' || id === 'load') $('t-play').classList.add('active');
  if (id === 'lb') { $('t-lb').classList.add('active'); renderLeaderboard(); }
}

// ── Progress dots ─────────────────────────────────────────────────────────────
function updateDots() {
  const el = $('pdots');
  el.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const d = document.createElement('div');
    let cls = 'dot';
    if (i < state.completed) cls += state.roundPts[i] === 0 ? ' miss' : ' done';
    if (i === state.curRound && !state.roundDone) cls += ' cur';
    d.className = cls;
    el.appendChild(d);
  }
}

// ── Loading progress bar helper ───────────────────────────────────────────────
function setLoadProgress(pct) {
  $('load-fill').style.width = pct + '%';
}

// ── INIT: Fetch daily data ────────────────────────────────────────────────────
async function init() {
  showScreen('load');

  // Animate load bar
  let prog = 0;
  const progInterval = setInterval(() => {
    prog = Math.min(prog + Math.random() * 8, 88);
    setLoadProgress(prog);
  }, 200);

  const loadMsgs = [
    'Requesting satellite imagery…',
    'Generating trivia hints…',
    'Checking runway configurations…',
    'Almost cleared for takeoff…',
  ];
  let msgIdx = 0;
  const msgInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % loadMsgs.length;
    $('load-msg').textContent = loadMsgs[msgIdx];
  }, 1200);

  try {
    // Fetch today's 5 airports and full airport list in parallel
    const [dailyRes, airportsRes] = await Promise.all([
      fetch('/api/daily'),
      fetch('/api/airports'),
    ]);

    if (!dailyRes.ok) throw new Error(`Daily API ${dailyRes.status}`);
    if (!airportsRes.ok) throw new Error(`Airports API ${airportsRes.status}`);

    state.daily = await dailyRes.json();
    state.airports = await airportsRes.json();

    clearInterval(progInterval);
    clearInterval(msgInterval);
    setLoadProgress(100);

    await delay(400);
    loadStats();
    startRound(0);
    showScreen('play');
  } catch (err) {
    clearInterval(progInterval);
    clearInterval(msgInterval);
    console.error('Init failed:', err);
    $('error-msg').textContent = err.message || 'Could not connect to server.';
    showScreen('error');
  }
}

// ── Round management ──────────────────────────────────────────────────────────
function startRound(idx) {
  if (idx >= 5) { showFinal(); return; }

  state.curRound = idx;
  state.guesses = 0;
  state.roundDone = false;
  state.hintUsed = false;

  const ap = state.daily.airports[idx];

  $('round-title').textContent = `ROUND ${idx + 1} OF 5`;
  $('htext').innerHTML = ap.hint;
  $('ai-hint').style.display = 'none';
  $('ai-hint').textContent = '';
  $('ginput').value = '';
  $('ginput').disabled = false;
  $('sbtn').disabled = true;
  $('sbtn').textContent = 'SUBMIT GUESS';
  $('glog').innerHTML = '';
  $('rov').classList.remove('show');
  $('rov').setAttribute('aria-hidden', 'true');
  $('mlbl').textContent = '▶ IDENTIFY THIS AIRPORT';
  $('sugg-list').style.display = 'none';
  $('sugg-list').innerHTML = '';
  $('xhint-btn').disabled = false;
  $('xhint-btn').textContent = '📡 AI HINT  (−500 pts)';

  updateDots();
  initMap(ap);
}

// ── Map ───────────────────────────────────────────────────────────────────────
function initMap(ap) {
  if (state.map) { state.map.remove(); state.map = null; }

  state.map = L.map('amap', {
    center: [ap.lat, ap.lon],
    zoom: ap.zoom,
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: false,
  });

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
  }).addTo(state.map);

  const updateCoords = () => {
    const c = state.map.getCenter();
    $('lat-d').textContent  = 'LAT '  + c.lat.toFixed(4);
    $('lon-d').textContent  = 'LON '  + c.lng.toFixed(4);
    $('zoom-d').textContent = 'ZOOM ' + state.map.getZoom();
  };
  state.map.on('moveend zoomend', updateCoords);
  updateCoords();

  $('zoom-in').onclick  = () => state.map.zoomIn();
  $('zoom-out').onclick = () => state.map.zoomOut();
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
function matchAirports(query) {
  const q = query.toUpperCase().trim();
  if (q.length < 2) return [];
  return state.airports.filter(a =>
    a.code.includes(q) ||
    a.name.toUpperCase().includes(q) ||
    a.city.toUpperCase().includes(q) ||
    a.state.toUpperCase() === q
  ).slice(0, 8);
}

$('ginput').addEventListener('input', () => {
  const val = $('ginput').value;
  $('sbtn').disabled = val.trim().length < 2;
  const matches = matchAirports(val);
  if (matches.length && val.trim().length >= 2) {
    $('sugg-list').innerHTML = matches.map(a => `
      <div class="sugg-item" role="option" data-code="${a.code}" tabindex="-1">
        <div>
          <div>${a.name}</div>
          <div class="sugg-city">${a.city}, ${a.state}</div>
        </div>
        <span class="sugg-code">${a.code}</span>
      </div>`).join('');
    $('sugg-list').style.display = 'block';
  } else {
    $('sugg-list').style.display = 'none';
  }
});

$('sugg-list').addEventListener('click', e => {
  const item = e.target.closest('.sugg-item');
  if (!item) return;
  $('ginput').value = item.dataset.code;
  $('sugg-list').style.display = 'none';
  $('sbtn').disabled = false;
  $('ginput').focus();
});

document.addEventListener('click', e => {
  if (!$('sugg-list').contains(e.target) && e.target !== $('ginput')) {
    $('sugg-list').style.display = 'none';
  }
});

$('ginput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !$('sbtn').disabled) $('sbtn').click();
});

// ── Submit guess ──────────────────────────────────────────────────────────────
$('sbtn').addEventListener('click', async () => {
  if (state.roundDone) return;
  const val = $('ginput').value.trim();
  if (!val) return;

  $('sbtn').disabled = true;
  $('ginput').disabled = true;
  $('ginput').value = '';
  $('sugg-list').style.display = 'none';

  // Server-side validation
  let correct = false;
  let reveal = null;
  try {
    const res = await fetch('/api/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: state.daily.date,
        roundIndex: state.curRound,
        guess: val,
      }),
    });
    const data = await res.json();
    correct = data.correct;
    reveal = data.reveal;
  } catch (e) {
    // Fallback: client-side check against code only
    correct = val.toUpperCase().trim() === state.daily.airports[state.curRound].code;
  }

  state.guesses++;
  addGuessRow(val, correct);

  if (correct) {
    const pts = Math.max(2000 - (state.guesses - 1) * 500, 500);
    state.score += pts;
    state.roundPts.push(pts);
    $('score-val').textContent = state.score;
    if (!reveal) {
      // fetch reveal separately if guess endpoint didn't return it
      try {
        const r = await fetch('/api/reveal', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: state.daily.date, roundIndex: state.curRound }),
        });
        reveal = await r.json();
      } catch {}
    }
    showResult(true, pts, reveal);
  } else if (state.guesses >= state.maxGuesses) {
    state.roundPts.push(0);
    $('score-val').textContent = state.score;
    // Reveal answer on miss
    let missed = null;
    try {
      const r = await fetch('/api/reveal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: state.daily.date, roundIndex: state.curRound }),
      });
      missed = await r.json();
    } catch {}
    showResult(false, 0, missed);
  } else {
    // Wrong but can still guess
    $('ginput').disabled = false;
    $('ginput').focus();
    // sbtn stays disabled until next keystroke
  }
});

function addGuessRow(val, correct) {
  const log = $('glog');
  const row = document.createElement('div');
  row.className = 'guess-row ' + (correct ? 'right' : 'wrong');
  row.innerHTML = `<span>${val.toUpperCase()}</span><span>${correct ? '✓' : '✗'}</span>`;
  log.appendChild(row);
}

// ── AI Extra Hint ─────────────────────────────────────────────────────────────
$('xhint-btn').addEventListener('click', async () => {
  if (state.hintUsed) return;
  state.hintUsed = true;
  $('xhint-btn').disabled = true;
  $('xhint-btn').textContent = '⟳ Loading…';

  state.score = Math.max(0, state.score - 500);
  $('score-val').textContent = state.score;

  const aiBox = $('ai-hint');
  aiBox.style.display = 'block';
  aiBox.innerHTML = '<span class="spin">⟳</span> Generating AI hint…';

  try {
    const res = await fetch('/api/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: state.daily.date, roundIndex: state.curRound }),
    });
    const data = await res.json();
    aiBox.textContent = '🤖 ' + data.hint;
  } catch {
    aiBox.textContent = '🤖 Hint unavailable. Try narrowing your guess by country or region.';
  }

  $('xhint-btn').textContent = '📡 HINT USED';
});

// ── Show Result ───────────────────────────────────────────────────────────────
function showResult(correct, pts, reveal) {
  state.roundDone = true;
  state.completed++;

  const code = reveal?.code || state.daily.airports[state.curRound].code || '???';
  const name = reveal ? `${reveal.name} · ${reveal.city}, ${reveal.state}` : 'Airport';

  $('r-icon').textContent    = correct ? '✅' : '❌';
  $('r-status').textContent  = correct ? 'CORRECT!' : 'MISSED IT';
  $('r-status').style.color  = correct ? 'var(--accent)' : 'var(--danger)';
  $('r-code').textContent    = code;
  $('r-name').textContent    = name;
  $('r-pts').textContent     = correct ? `+${pts} PTS` : `Answer: ${code}`;
  $('rov').classList.add('show');
  $('rov').setAttribute('aria-hidden', 'false');

  // Pin a marker
  if (state.map && reveal) {
    const ap = state.daily.airports[state.curRound];
    L.marker([ap.lat, ap.lon], {
      icon: L.divIcon({
        html: `<div style="background:var(--accent);color:#0a1628;font-family:'Oswald',sans-serif;font-size:12px;padding:3px 9px;border-radius:3px;font-weight:600;letter-spacing:1px;white-space:nowrap;">✈ ${code}</div>`,
        iconAnchor: [34, 0],
      }),
    }).addTo(state.map);
  }

  $('ginput').disabled = true;
  $('sbtn').disabled = true;
  $('sbtn').textContent = '✓ DONE';
  updateDots();
  updateStats(correct);
}

$('next-btn').addEventListener('click', () => startRound(state.completed));

// ── Final Screen ──────────────────────────────────────────────────────────────
function showFinal() {
  showScreen('final');
  $('f-score').textContent = state.score;
  $('final-date').textContent = `${new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}`;

  const grid = $('f-grid');
  grid.innerHTML = state.daily.airports.map((ap, i) => {
    const pts = state.roundPts[i] ?? 0;
    const cls = pts >= 2000 ? 'perfect' : pts > 0 ? 'good' : 'miss';
    return `<div class="final-box"><div class="final-code">${ap.code}</div><div class="final-pts ${cls}">${pts}</div></div>`;
  }).join('');
}

// ── Share ─────────────────────────────────────────────────────────────────────
function shareScore() {
  const emojis = state.roundPts.map(p => p >= 2000 ? '🟩' : p > 0 ? '🟨' : '🟥').join('');
  const dateStr = new Date().toLocaleDateString('en-US');
  const text = `✈ AeroGuess Daily — ${dateStr}\nScore: ${state.score.toLocaleString()}/10,000\n\n${emojis}\n\nFAA Part 139 Airport Challenge\naeroguess.com`;
  if (navigator.share) {
    navigator.share({ title: 'AeroGuess', text }).catch(() => copyToClipboard(text));
  } else {
    copyToClipboard(text);
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('Result copied to clipboard! ✈');
  }).catch(() => {
    prompt('Copy this result:', text);
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function loadStats() {
  const s = lsGet('ag_stats', { played: 0, wins: 0, streak: 0, lastDate: '' });
  $('st-p').textContent = s.played;
  $('st-w').textContent = s.played ? Math.round(s.wins / s.played * 100) + '%' : '—';
  $('st-s').textContent = s.streak;
  $('s-streak').textContent = s.streak;
}

function updateStats(won) {
  const s = lsGet('ag_stats', { played: 0, wins: 0, streak: 0, lastDate: '' });
  const today = new Date().toDateString();
  if (s.lastDate !== today) {
    s.played++;
    if (won) s.wins++;
    s.streak = won ? s.streak + 1 : 0;
    s.lastDate = today;
    lsSet('ag_stats', s);
  }
  $('st-p').textContent = s.played;
  $('st-w').textContent = Math.round(s.wins / s.played * 100) + '%';
  $('st-s').textContent = s.streak;
  $('s-streak').textContent = s.streak;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
function renderLeaderboard() {
  const entries = lsGet('ag_lb', []).sort((a, b) => b.score - a.score).slice(0, 20);
  const body = $('lb-body');

  if (!entries.length) {
    body.innerHTML = `<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--muted);font-family:var(--font-m);font-size:12px;">No scores yet — be the first to post!</td></tr>`;
    return;
  }

  body.innerHTML = entries.map((e, i) => {
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    return `<tr>
      <td class="lb-rank ${rankClass}">${medal}</td>
      <td>${e.name}</td>
      <td class="lb-score">${e.score.toLocaleString()}</td>
      <td class="lb-date">${e.date}</td>
    </tr>`;
  }).join('');
}

function postScore() {
  const name = $('lb-name').value.trim();
  if (!name) return;
  const lb = lsGet('ag_lb', []);
  lb.push({ name, score: state.score, date: new Date().toLocaleDateString() });
  lsSet('ag_lb', lb);
  $('lb-entry-row').innerHTML = `<div style="font-family:var(--font-m);font-size:12px;color:var(--success);padding:10px 0">✓ Score posted as <strong>${name}</strong></div>`;
  renderLeaderboard();
}

// ── Utility ───────────────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Kick off ──────────────────────────────────────────────────────────────────
init();

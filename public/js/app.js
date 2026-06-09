/* ── AeroGuess Frontend ───────────────────────────────────────────────────── */

const ROUND_TIME = 60; // seconds per round

const state = {
  daily: null,
  airports: [],
  curRound: 0,
  score: 0,
  guesses: 0,
  maxGuesses: 4,
  roundDone: false,
  completed: 0,
  roundPts: [],
  roundTimes: [],
  hintUsed: false,
  map: null,
  timerInterval: null,
  timeLeft: ROUND_TIME,
  roundStartTime: null,
};

const $ = id => document.getElementById(id);

function lsGet(key, def) {
  try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(def)); }
  catch { return def; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id + '-screen').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (id === 'play' || id === 'load') $('t-play').classList.add('active');
  if (id === 'lb') { $('t-lb').classList.add('active'); renderLeaderboard(); }
}

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

function setLoadProgress(pct) { $('load-fill').style.width = pct + '%'; }

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer() {
  stopTimer();
  state.timeLeft = ROUND_TIME;
  state.roundStartTime = Date.now();
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.timeLeft = Math.max(0, ROUND_TIME - Math.floor((Date.now() - state.roundStartTime) / 1000));
    updateTimerDisplay();
    if (state.timeLeft <= 0) {
      stopTimer();
      if (!state.roundDone) {
        // Time's up — count as miss
        state.roundPts.push(0);
        state.completed++;
        showResult(false, 0, null);
      }
    }
  }, 250);
}

function stopTimer() {
  if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
}

function updateTimerDisplay() {
  const el = $('timer-display');
  if (!el) return;
  const t = state.timeLeft;
  el.textContent = t + 's';
  // Color shifts: green > yellow > red
  if (t > 30) { el.style.color = 'var(--accent)'; el.style.borderColor = 'var(--accent)'; }
  else if (t > 10) { el.style.color = 'var(--accent2)'; el.style.borderColor = 'var(--accent2)'; }
  else { el.style.color = 'var(--danger)'; el.style.borderColor = 'var(--danger)';
    if (t <= 5) el.style.animation = 'pulse 0.5s ease infinite alternate';
    else el.style.animation = 'none';
  }
}

// Dynamic scoring: base 2000, +bonus for speed, -500 per wrong guess
function calcScore(guesses, secondsTaken) {
  const basePerGuess = Math.max(2000 - (guesses - 1) * 500, 500);
  // Speed bonus: up to +1000 pts for answering in <10s, scaling down to 0 at 60s
  const speedBonus = Math.round(Math.max(0, (ROUND_TIME - secondsTaken) / ROUND_TIME) * 1000);
  return basePerGuess + speedBonus;
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  showScreen('load');
  let prog = 0;
  const progInterval = setInterval(() => { prog = Math.min(prog + Math.random() * 8, 88); setLoadProgress(prog); }, 200);
  const msgs = ['Requesting satellite imagery…','Generating trivia hints…','Checking runway configs…','Almost cleared for takeoff…'];
  let mi = 0;
  const msgInterval = setInterval(() => { mi = (mi+1)%msgs.length; $('load-msg').textContent = msgs[mi]; }, 1200);
  try {
    const [dr, ar] = await Promise.all([fetch('/api/daily'), fetch('/api/airports')]);
    if (!dr.ok) throw new Error('Daily API ' + dr.status);
    if (!ar.ok) throw new Error('Airports API ' + ar.status);
    state.daily = await dr.json();
    state.airports = await ar.json();
    clearInterval(progInterval); clearInterval(msgInterval);
    setLoadProgress(100);
    await new Promise(r => setTimeout(r, 400));
    loadStats();
    startRound(0);
    showScreen('play');
  } catch (err) {
    clearInterval(progInterval); clearInterval(msgInterval);
    $('error-msg').textContent = err.message || 'Could not connect to server.';
    showScreen('error');
  }
}

// ── Round ─────────────────────────────────────────────────────────────────────

function startRound(idx) {
  console.log('startRound:', idx);
  if (idx >= 5) { showFinal(); return; }

  state.curRound = idx;
  state.guesses = 0;
  state.roundDone = false;
  state.hintUsed = false;

  const ap = state.daily.airports[idx];
  $('round-title').textContent = 'ROUND ' + (idx + 1) + ' OF 5';
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
  startTimer();
}

// ── Map ───────────────────────────────────────────────────────────────────────

function initMap(ap) {
  if (state.map) { state.map.remove(); state.map = null; }
  state.map = L.map('amap', { center:[ap.lat,ap.lon], zoom:ap.zoom, zoomControl:false, attributionControl:false, dragging:true, scrollWheelZoom:false });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom:19 }).addTo(state.map);
  const upd = () => {
    const c = state.map.getCenter();
    $('lat-d').textContent = 'LAT ' + c.lat.toFixed(4);
    $('lon-d').textContent = 'LON ' + c.lng.toFixed(4);
    $('zoom-d').textContent = 'ZOOM ' + state.map.getZoom();
  };
  state.map.on('moveend zoomend', upd); upd();
  $('zoom-in').onclick = () => state.map.zoomIn();
  $('zoom-out').onclick = () => state.map.zoomOut();
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

function matchAirports(query) {
  const q = query.toUpperCase().trim();
  const qStripped = q.startsWith('K') && q.length === 4 ? q.slice(1) : q;
  if (q.length < 2) return [];
  return state.airports.filter(a =>
    a.code.includes(q) || a.code.includes(qStripped) ||
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
    $('sugg-list').innerHTML = matches.map(a =>
      '<div class="sugg-item" data-code="' + a.code + '">' +
      '<div><div>' + a.name + '</div><div class="sugg-city">' + a.city + ', ' + a.state + '</div></div>' +
      '<span class="sugg-code">' + a.code + '</span></div>'
    ).join('');
    $('sugg-list').style.display = 'block';
  } else { $('sugg-list').style.display = 'none'; }
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
  if (!$('sugg-list').contains(e.target) && e.target !== $('ginput')) $('sugg-list').style.display = 'none';
});

$('ginput').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('sbtn').disabled) $('sbtn').click(); });

// ── Submit ────────────────────────────────────────────────────────────────────

$('sbtn').addEventListener('click', async () => {
  if (state.roundDone) return;
  const val = $('ginput').value.trim();
  if (!val) return;

  $('sbtn').disabled = true;
  $('ginput').disabled = true;
  $('ginput').value = '';
  $('sugg-list').style.display = 'none';

  let correct = false, reveal = null;
  try {
    const res = await fetch('/api/guess', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: state.daily.date, roundIndex: state.curRound, guess: val }),
    });
    const data = await res.json();
    correct = data.correct; reveal = data.reveal;
  } catch (e) {
    correct = val.toUpperCase().replace(/^K([A-Z]{3})$/, '$1') === state.daily.airports[state.curRound].code;
  }

  state.guesses++;
  addGuessRow(val, correct);

  if (correct) {
    stopTimer();
    const secondsTaken = Math.floor((Date.now() - state.roundStartTime) / 1000);
    const pts = calcScore(state.guesses, secondsTaken);
    state.score += pts;
    state.roundPts.push(pts);
    state.roundTimes.push(secondsTaken);
    $('score-val').textContent = state.score;
    if (!reveal) {
      try {
        const r = await fetch('/api/reveal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date: state.daily.date, roundIndex: state.curRound }) });
        reveal = await r.json();
      } catch {}
    }
    showResult(true, pts, reveal, secondsTaken);
  } else if (state.guesses >= state.maxGuesses) {
    stopTimer();
    state.roundPts.push(0);
    state.roundTimes.push(ROUND_TIME);
    $('score-val').textContent = state.score;
    let missed = null;
    try {
      const r = await fetch('/api/reveal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date: state.daily.date, roundIndex: state.curRound }) });
      missed = await r.json();
    } catch {}
    showResult(false, 0, missed, ROUND_TIME);
  } else {
    $('ginput').disabled = false;
    $('ginput').focus();
  }
});

function addGuessRow(val, correct) {
  const row = document.createElement('div');
  row.className = 'guess-row ' + (correct ? 'right' : 'wrong');
  row.innerHTML = '<span>' + val.toUpperCase() + '</span><span>' + (correct ? '✓' : '✗') + '</span>';
  $('glog').appendChild(row);
}

// ── AI Hint ───────────────────────────────────────────────────────────────────

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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: state.daily.date, roundIndex: state.curRound }),
    });
    const data = await res.json();
    aiBox.textContent = '🤖 ' + data.hint;
  } catch {
    aiBox.textContent = '🤖 Hint unavailable. Try narrowing by state or region.';
  }
  $('xhint-btn').textContent = '📡 HINT USED';
});

// ── Result ────────────────────────────────────────────────────────────────────

function showResult(correct, pts, reveal, secondsTaken) {
  state.roundDone = true;
  if (!correct && state.roundPts[state.curRound] === undefined) {
    // Timer expired path — completed already incremented
  } else if (correct || state.guesses >= state.maxGuesses) {
    state.completed++;
  }

  const code = (reveal && reveal.code) ? reveal.code : state.daily.airports[state.curRound].code;
  const name = reveal ? (reveal.name + ' · ' + reveal.city + ', ' + reveal.state) : code;
  const timeStr = secondsTaken !== undefined && secondsTaken < ROUND_TIME ? ' in ' + secondsTaken + 's' : '';
  const speedBonus = correct ? Math.round(Math.max(0, (ROUND_TIME - secondsTaken) / ROUND_TIME) * 1000) : 0;

  $('r-icon').textContent   = correct ? '✅' : '❌';
  $('r-status').textContent = correct ? 'CORRECT!' : 'MISSED IT';
  $('r-status').style.color = correct ? 'var(--accent)' : 'var(--danger)';
  $('r-code').textContent   = code;
  $('r-name').textContent   = name;
  $('r-pts').innerHTML      = correct
    ? '<span style="color:var(--accent)">+' + pts + ' pts</span>'
      + (speedBonus > 0 ? ' <span style="color:var(--accent2);font-size:11px">(incl. ' + speedBonus + ' speed bonus' + timeStr + ')</span>' : timeStr)
    : 'Answer: ' + code;
  $('rov').classList.add('show');
  $('rov').setAttribute('aria-hidden', 'false');

  if (state.map) {
    const ap = state.daily.airports[state.curRound];
    L.marker([ap.lat, ap.lon], {
      icon: L.divIcon({
        html: '<div style="background:var(--accent);color:#0a1628;font-family:Oswald,sans-serif;font-size:12px;padding:3px 9px;border-radius:3px;font-weight:600;letter-spacing:1px;white-space:nowrap;">✈ ' + code + '</div>',
        iconAnchor: [34, 0],
      }),
    }).addTo(state.map);
  }

  $('ginput').disabled = true;
  $('sbtn').disabled = true;
  $('sbtn').textContent = '✓ DONE';
  updateDots();
}

$('next-btn').addEventListener('click', function() {
  const nextIdx = state.completed;
  console.log('Next → round', nextIdx);
  $('rov').classList.remove('show');
  startRound(nextIdx);
});

// ── Final ─────────────────────────────────────────────────────────────────────

function showFinal() {
  stopTimer();
  showScreen('final');
  updateStats();
  $('f-score').textContent = state.score;
  $('final-date').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const grid = $('f-grid');
  grid.innerHTML = state.daily.airports.map(function(ap, i) {
    const pts = state.roundPts[i] != null ? state.roundPts[i] : 0;
    const t   = state.roundTimes[i] != null ? state.roundTimes[i] : '—';
    const cls = pts >= 2500 ? 'perfect' : pts > 0 ? 'good' : 'miss';
    return '<div class="final-box">' +
      '<div class="final-code">' + ap.code + '</div>' +
      '<div class="final-pts ' + cls + '">' + pts + '</div>' +
      '<div class="final-time">' + (t !== '—' ? t + 's' : '—') + '</div>' +
      '</div>';
  }).join('');
}

function shareScore() {
  const emojis = state.roundPts.map(function(p) { return p >= 2500 ? '🟩' : p > 0 ? '🟨' : '🟥'; }).join('');
  const text = '✈ AeroGuess Daily — ' + new Date().toLocaleDateString() + '\nScore: ' + state.score.toLocaleString() + '/15,000\n\n' + emojis + '\n\nFAA Part 139 Airport Challenge\n' + window.location.origin;
  if (navigator.share) { navigator.share({ title: 'AeroGuess', text: text }).catch(function() { copyToClipboard(text); }); }
  else { copyToClipboard(text); }
}

function copyToClipboard(text) {
  if (navigator.clipboard) { navigator.clipboard.writeText(text).then(function() { alert('Copied! ✈'); }); }
  else { prompt('Copy this:', text); }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function loadStats() {
  const s = lsGet('ag_stats', { played:0, wins:0, streak:0 });
  $('st-p').textContent = s.played;
  $('st-w').textContent = s.played ? Math.round(s.wins / s.played * 100) + '%' : '—';
  $('st-s').textContent = s.streak;
  $('s-streak').textContent = s.streak;
}

function updateStats() {
  const s = lsGet('ag_stats', { played:0, wins:0, streak:0, lastDate:'' });
  const today = new Date().toDateString();
  if (s.lastDate !== today) {
    s.played++;
    const won = state.roundPts.some(function(p) { return p > 0; });
    if (won) s.wins++;
    s.streak = won ? s.streak + 1 : 0;
    s.lastDate = today;
    lsSet('ag_stats', s);
  }
  $('st-p').textContent = s.played;
  $('st-w').textContent = s.played ? Math.round(s.wins / s.played * 100) + '%' : '—';
  $('st-s').textContent = s.streak;
  $('s-streak').textContent = s.streak;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

async function renderLeaderboard() {
  const body = $('lb-body');
  body.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--muted);font-family:var(--font-m);font-size:12px;">Loading...</td></tr>';
  try {
    const res = await fetch('/api/scores');
    const entries = await res.json();
    if (!entries.length) {
      body.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--muted);font-family:var(--font-m);font-size:12px;">No scores today — be the first!</td></tr>';
      return;
    }
    body.innerHTML = entries.map(function(e, i) {
      const rc = i===0?'gold':i===1?'silver':i===2?'bronze':'';
      const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1);
      return '<tr><td class="lb-rank ' + rc + '">' + medal + '</td><td>' + e.name + '</td><td class="lb-score">' + Number(e.score).toLocaleString() + '</td><td class="lb-date">' + e.date + '</td></tr>';
    }).join('');
  } catch {
    body.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--muted);">Could not load scores.</td></tr>';
  }
}

async function postScore() {
  const name = $('lb-name').value.trim();
  if (!name) return;
  try {
    await fetch('/api/scores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, score: state.score, date: new Date().toLocaleDateString() })
    });
    $('lb-entry-row').innerHTML = '<div style="font-family:var(--font-m);font-size:12px;color:var(--success);padding:10px 0">✓ Posted as <strong>' + name + '</strong></div>';
    renderLeaderboard();
  } catch { alert('Could not post score. Try again.'); }
}

init();

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Daily airport identification game. Guess the airport from the overhead satellite view. 5 airports every day from FAA Part 139 commercial service airports.">
  <meta property="og:title" content="AeroGuess — Daily Airport Challenge">
  <meta property="og:description" content="Can you identify airports from overhead? 5 new FAA commercial airports every day.">
  <meta property="og:type" content="website">
  <title>AeroGuess — Daily Airport Challenge</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✈</text></svg>">
</head>
<body>

<header>
  <div class="logo">
    <span class="logo-icon" aria-hidden="true">✈</span>
    AERO<span>GUESS</span>
  </div>
  <nav class="hdr-nav">
    <button class="nav-btn active" id="t-play" onclick="showScreen('play')">PLAY</button>
    <button class="nav-btn" id="t-lb" onclick="showScreen('lb')">🏆 BOARD</button>
    <div class="streak-badge">🔥 <span id="s-streak">0</span></div>
  </nav>
</header>

<main class="main" id="app">

  <!-- LOADING -->
  <div class="screen active" id="load-screen" role="status" aria-live="polite">
    <div class="load-wrap">
      <div class="load-plane">✈</div>
      <div class="load-title">AEROGUESS</div>
      <div class="load-msg" id="load-msg">Loading today's airports…</div>
      <div class="load-bar"><div class="load-fill" id="load-fill"></div></div>
      <div class="load-sub" id="load-sub">FAA Part 139 · Daily Challenge</div>
    </div>
  </div>

  <!-- ERROR -->
  <div class="screen" id="error-screen">
    <div class="error-wrap">
      <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
      <div class="error-title">FAILED TO LOAD</div>
      <div class="error-msg" id="error-msg">Could not connect to server.</div>
      <button class="primary-btn" onclick="location.reload()">RETRY</button>
    </div>
  </div>

  <!-- PLAY -->
  <div class="screen" id="play-screen">
    <div class="topbar">
      <div class="topbar-left">
        <div class="top-label">DAILY CHALLENGE · FAA PART 139</div>
        <div class="top-title" id="round-title">ROUND 1 OF 5</div>
      </div>
      <div class="topbar-right">
        <div class="dots" id="pdots" role="progressbar" aria-label="Round progress"></div>
        <div class="score-line">SCORE: <span id="score-val">0</span></div>
      </div>
    </div>

    <div class="game-grid">
      <!-- MAP -->
      <div class="map-panel">
        <div class="map-topbar">
          <div class="map-label" id="mlbl">▶ IDENTIFY THIS AIRPORT</div>
          <div class="map-controls">
            <button class="zoom-btn" id="zoom-in" aria-label="Zoom in">+</button>
            <button class="zoom-btn" id="zoom-out" aria-label="Zoom out">−</button>
          </div>
        </div>
        <div id="amap" role="img" aria-label="Satellite view of airport to identify"></div>
        <div class="coords-bar" aria-hidden="true">
          <span id="lat-d">LAT —</span>
          <span id="lon-d">LON —</span>
          <span id="zoom-d">ZOOM —</span>
        </div>

        <!-- RESULT OVERLAY -->
        <div class="result-overlay" id="rov" role="dialog" aria-live="assertive" aria-hidden="true">
          <div class="result-box">
            <div class="result-icon" id="r-icon">✅</div>
            <div class="result-status" id="r-status">CORRECT!</div>
            <div class="result-code" id="r-code"></div>
            <div class="result-name" id="r-name"></div>
            <div class="result-pts" id="r-pts"></div>
            <button class="primary-btn" id="next-btn">NEXT AIRPORT →</button>
          </div>
        </div>
      </div>

      <!-- SIDE PANEL -->
      <aside class="side-panel">
        <!-- HINT -->
        <div class="hint-card">
          <div class="hint-label">💡 INTEL / HINT</div>
          <div class="hint-text" id="htext" aria-live="polite">Loading…</div>
          <div class="ai-hint" id="ai-hint" aria-live="polite" style="display:none"></div>
        </div>

        <!-- ANSWER -->
        <div class="answer-card">
          <div class="answer-label">▶ YOUR ANSWER</div>
          <div class="input-wrap">
            <input
              class="guess-input"
              id="ginput"
              type="text"
              placeholder="Airport code, city, or name…"
              autocomplete="off"
              autocapitalize="characters"
              aria-label="Airport guess"
              aria-autocomplete="list"
              aria-controls="sugg-list"
            />
            <div class="suggestions" id="sugg-list" role="listbox" aria-label="Airport suggestions" style="display:none"></div>
          </div>
          <div class="guess-log" id="glog" role="log" aria-label="Previous guesses"></div>
          <button class="hint-btn" id="xhint-btn" disabled>📡 AI HINT  (−500 pts)</button>
          <button class="submit-btn" id="sbtn" disabled>SUBMIT GUESS</button>
        </div>

        <!-- STATS -->
        <div class="stats-row">
          <div class="stat-box"><div class="stat-num" id="st-p">0</div><div class="stat-lbl">PLAYED</div></div>
          <div class="stat-box"><div class="stat-num" id="st-w">—</div><div class="stat-lbl">WIN %</div></div>
          <div class="stat-box"><div class="stat-num" id="st-s">0</div><div class="stat-lbl">STREAK</div></div>
        </div>
      </aside>
    </div>
  </div>

  <!-- FINAL -->
  <div class="screen" id="final-screen">
    <div class="final-card">
      <div class="final-icon">✈</div>
      <div class="final-title">FLIGHT COMPLETE</div>
      <div class="final-sub" id="final-date"></div>
      <div class="final-score" id="f-score">0</div>
      <div class="final-max">OUT OF 10,000 PTS</div>
      <div class="final-grid" id="f-grid"></div>
      <div class="share-row">
        <button class="primary-btn" onclick="shareScore()">📤 SHARE RESULT</button>
        <button class="secondary-btn" onclick="showScreen('lb')">🏆 LEADERBOARD</button>
      </div>
      <div class="final-tomorrow">Come back tomorrow for 5 new airports!</div>
    </div>
  </div>

  <!-- LEADERBOARD -->
  <div class="screen" id="lb-screen">
    <div class="lb-wrap">
      <div class="lb-header">🏆 DAILY LEADERBOARD</div>
      <div class="lb-entry-row" id="lb-entry-row">
        <input class="lb-name-input" id="lb-name" type="text" placeholder="Enter your pilot name to post score…" maxlength="20" autocomplete="nickname"/>
        <button class="lb-post-btn" onclick="postScore()">POST</button>
      </div>
      <table class="lb-table" aria-label="Leaderboard">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">PILOT</th>
            <th scope="col">SCORE</th>
            <th scope="col">DATE</th>
          </tr>
        </thead>
        <tbody id="lb-body"></tbody>
      </table>
    </div>
  </div>

</main>

<footer class="site-footer" aria-hidden="true">
  <div class="ticker-wrap">
    <div class="ticker-inner" id="ticker-inner">
      ✈ AEROGUESS DAILY · FAA PART 139 CERTIFICATED AIRPORTS · ALL 200+ US COMMERCIAL SERVICE AIRPORTS IN THE POOL · 5 ROUNDS · AI-POWERED HINTS · MAX 10,000 PTS · WRONG GUESS −500 PTS · DAILY CHALLENGE RESETS AT MIDNIGHT UTC ✈ &nbsp;&nbsp;&nbsp;
      ✈ AEROGUESS DAILY · FAA PART 139 CERTIFICATED AIRPORTS · ALL 200+ US COMMERCIAL SERVICE AIRPORTS IN THE POOL · 5 ROUNDS · AI-POWERED HINTS · MAX 10,000 PTS · WRONG GUESS −500 PTS · DAILY CHALLENGE RESETS AT MIDNIGHT UTC ✈
    </div>
  </div>
</footer>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="/js/app.js"></script>
</body>
</html>

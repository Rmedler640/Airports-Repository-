// Database layer — uses PostgreSQL if DATABASE_URL is set, falls back to in-memory
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    console.log('[db] Connected to PostgreSQL');
  }
  return pool;
}

// In-memory fallback
const memoryScores = [];

async function initDB() {
  const p = getPool();
  if (!p) {
    console.log('[db] No DATABASE_URL — using in-memory leaderboard');
    return;
  }
  await p.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('[db] Scores table ready');
}

async function saveScore(name, score, date) {
  const p = getPool();
  if (!p) {
    memoryScores.push({ name, score, date });
    return;
  }
  await p.query(
    'INSERT INTO scores (name, score, date) VALUES ($1, $2, $3)',
    [name, score, date]
  );
}

async function getScores(limit = 50) {
  const p = getPool();
  if (!p) {
    return [...memoryScores]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  const result = await p.query(
    'SELECT name, score, date FROM scores ORDER BY score DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

async function getTodayScores(date, limit = 50) {
  const p = getPool();
  if (!p) {
    return memoryScores
      .filter(s => s.date === date)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  const result = await p.query(
    'SELECT name, score, date FROM scores WHERE date = $1 ORDER BY score DESC LIMIT $2',
    [date, limit]
  );
  return result.rows;
}

module.exports = { initDB, saveScore, getScores, getTodayScores };

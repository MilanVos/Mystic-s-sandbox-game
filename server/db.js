const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/mystic_sandbox",
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err.message);
});

let initialized = false;

async function initDB() {
  if (initialized) return;
  try {
    const client = await pool.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(16) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id VARCHAR(32) PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        description VARCHAR(200) DEFAULT '',
        lua_script TEXT DEFAULT '',
        created_by VARCHAR(16) DEFAULT 'Unknown',
        created_at BIGINT DEFAULT 0,
        is_default BOOLEAN DEFAULT false
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS datastore (
        player_key VARCHAR(255) PRIMARY KEY,
        value TEXT,
        value_type VARCHAR(10) DEFAULT 'string',
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        games_played INTEGER DEFAULT 0,
        games_created INTEGER DEFAULT 0,
        last_login TIMESTAMP DEFAULT NOW()
      )
    `);

    client.release();
    initialized = true;
    console.log("[DB] Database initialized - tables ready");
  } catch (err) {
    console.error("[DB] Failed to initialize database:", err.message);
    console.error("[DB] Server will continue with fallback mode");
  }
}

async function query(text, params) {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (err) {
    console.error("[DB] Query error:", err.message);
    throw err;
  }
}

module.exports = { pool, initDB, query };

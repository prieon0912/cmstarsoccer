// Account storage. With DATABASE_URL set (any Postgres: Neon, Supabase, Render…) everything lives in Postgres.
// Without it the server keeps accounts in memory only, which is fine for trying things locally but is wiped on restart.
const { Pool } = require('pg');

const URL = process.env.DATABASE_URL;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT NOT NULL,
  name_key   TEXT NOT NULL UNIQUE,
  pw_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS profiles (
  user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

function pgStore() {
  const pool = new Pool({
    connectionString: URL,
    // hosted Postgres (Neon etc.) needs TLS; a local server usually doesn't
    ssl: /localhost|127\.0\.0\.1/.test(URL) ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
  });
  const q = (text, params) => pool.query(text, params);
  return {
    kind: 'postgres',
    init: async () => { await q(SCHEMA); },
    createUser: async (username, nameKey, pwHash) => {
      try {
        const r = await q('INSERT INTO users(username,name_key,pw_hash) VALUES($1,$2,$3) RETURNING id,username', [username, nameKey, pwHash]);
        return r.rows[0];
      } catch (e) { if (e.code === '23505') return null; throw e; }
    },
    userByName: async (nameKey) => (await q('SELECT id,username,pw_hash FROM users WHERE name_key=$1', [nameKey])).rows[0] || null,
    touchLogin: (id) => q('UPDATE users SET last_login=now() WHERE id=$1', [id]),
    deleteUser: (id) => q('DELETE FROM users WHERE id=$1', [id]),
    addSession: (tokenHash, userId, expires) => q('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [tokenHash, userId, expires]),
    sessionUser: async (tokenHash) => (await q(
      'SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [tokenHash])).rows[0] || null,
    dropSession: (tokenHash) => q('DELETE FROM sessions WHERE token_hash=$1', [tokenHash]),
    pruneSessions: () => q('DELETE FROM sessions WHERE expires_at<now()'),
    getProfile: async (userId) => {
      const r = await q('SELECT data,updated_at FROM profiles WHERE user_id=$1', [userId]);
      return r.rows[0] ? { data: r.rows[0].data, updated: r.rows[0].updated_at } : null;
    },
    putProfile: async (userId, data) => (await q(
      `INSERT INTO profiles(user_id,data,updated_at) VALUES($1,$2,now())
       ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data, updated_at=now() RETURNING updated_at`, [userId, data])).rows[0].updated_at,
  };
}

function memStore() {
  const users = new Map(), byName = new Map(), sessions = new Map(), profiles = new Map();
  let seq = 0;
  return {
    kind: 'memory',
    init: async () => {},
    createUser: async (username, nameKey, pwHash) => {
      if (byName.has(nameKey)) return null;
      const u = { id: ++seq, username, pw_hash: pwHash };
      users.set(u.id, u); byName.set(nameKey, u);
      return { id: u.id, username };
    },
    userByName: async (nameKey) => byName.get(nameKey) || null,
    touchLogin: async () => {},
    deleteUser: async (id) => {
      const u = users.get(id); if (!u) return;
      users.delete(id); profiles.delete(id);
      for (const [k, v] of byName) if (v.id === id) byName.delete(k);
      for (const [k, v] of sessions) if (v.userId === id) sessions.delete(k);
    },
    addSession: async (tokenHash, userId, expires) => { sessions.set(tokenHash, { userId, expires }); },
    sessionUser: async (tokenHash) => {
      const s = sessions.get(tokenHash);
      if (!s || s.expires < new Date()) return null;
      const u = users.get(s.userId);
      return u ? { id: u.id, username: u.username } : null;
    },
    dropSession: async (tokenHash) => { sessions.delete(tokenHash); },
    pruneSessions: async () => { const now = new Date(); for (const [k, v] of sessions) if (v.expires < now) sessions.delete(k); },
    getProfile: async (userId) => profiles.get(userId) || null,
    putProfile: async (userId, data) => { const updated = new Date(); profiles.set(userId, { data, updated }); return updated; },
  };
}

module.exports = URL ? pgStore() : memStore();

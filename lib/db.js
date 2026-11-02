// Account storage. With DATABASE_URL set (any Postgres: Neon, Supabase, Render…) everything lives in Postgres.
// Without it the server keeps accounts in memory only, which is fine for trying things locally but is wiped on restart.
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const ADMIN_SCHEMA = fs.readFileSync(path.join(__dirname, 'admin-schema.sql'), 'utf8');
const ECONOMY_SCHEMA = fs.readFileSync(path.join(__dirname, 'economy-schema.sql'), 'utf8');

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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision   BIGINT NOT NULL DEFAULT 1
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;`;

function pgStore() {
  const pool = new Pool({
    connectionString: URL,
    // hosted Postgres (Neon etc.) needs TLS; a local server usually doesn't
    ssl: /localhost|127\.0\.0\.1/.test(URL) ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
  });
  const q = (text, params) => pool.query(text, params);
  // A single transaction records the recipient snapshot and credits existing balances once.
  // Accounts without a wallet receive the equivalent 2,000 starting balance on first use.
  async function applyWelcomeUpgrade(){
    const client=await pool.connect();try{await client.query('BEGIN');
      await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
      const fresh=await client.query("INSERT INTO economy_campaigns(id,result) VALUES('welcome-2000-v1','{}') ON CONFLICT DO NOTHING RETURNING id");
      if(fresh.rows.length){
        const recipients=await client.query("INSERT INTO coin_awards(campaign_id,user_id,amount) SELECT 'welcome-2000-v1',id,1000 FROM users RETURNING user_id");
        const credited=await client.query("UPDATE wallets SET coins=coins+1000 WHERE user_id IN (SELECT user_id FROM coin_awards WHERE campaign_id='welcome-2000-v1') RETURNING user_id");
        const result={campaignId:'welcome-2000-v1',recipients:recipients.rows.length,creditedWallets:credited.rows.length,pendingWallets:recipients.rows.length-credited.rows.length,amount:1000,startingCoins:2000};
        await client.query("UPDATE economy_campaigns SET result=$1 WHERE id='welcome-2000-v1'",[result]);
      }
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  return {
    kind: 'postgres',
    init: async () => { await q(SCHEMA); await q(ADMIN_SCHEMA); await q(ECONOMY_SCHEMA); await applyWelcomeUpgrade(); },
    seedCatalog: async (cards,classes) => {
      await q(`INSERT INTO game_cards(id,data) SELECT x->>'id',x FROM jsonb_array_elements($1::jsonb) x ON CONFLICT DO NOTHING`,[JSON.stringify(cards)]);
      await q(`INSERT INTO card_classes(id,data) SELECT x->>'id',x FROM jsonb_array_elements($1::jsonb) x ON CONFLICT DO NOTHING`,[JSON.stringify(classes)]);
    },
    removePackage: async id => q('DELETE FROM shop_packages WHERE id=$1',[id]),
    listCards: async () => (await q('SELECT data FROM game_cards ORDER BY id')).rows.map(r=>r.data),
    listClasses: async () => (await q('SELECT data FROM card_classes ORDER BY id')).rows.map(r=>r.data),
    listPackages: async () => (await q('SELECT data,version FROM shop_packages ORDER BY id')).rows.map(r=>({...r.data,version:Number(r.version)})),
    saveCatalogEntry: async (kind,data,adminId) => {
      const tables={card:'game_cards',class:'card_classes',package:'shop_packages'},table=tables[kind];if(!table)throw Error('Unknown catalog type');
      await q(`INSERT INTO ${table}(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data${kind==='package'?',version=shop_packages.version+1':''}`,[data.id,data]);
      await q('INSERT INTO admin_changes(admin_id,action,target) VALUES($1,$2,$3)',[adminId,'save_'+kind,data.id]);
    },
    addClassCards: async (cards,adminId) => {
      if(!cards.length)return [];const client=await pool.connect();try{await client.query('BEGIN');
        const inserted=await client.query(`INSERT INTO game_cards(id,data) SELECT x->>'id',x FROM jsonb_array_elements($1::jsonb) x ON CONFLICT DO NOTHING RETURNING id`,[JSON.stringify(cards)]);
        await client.query('INSERT INTO admin_changes(admin_id,action,target) VALUES($1,$2,$3)',[adminId,'add_class_cards',cards[0].classId+':'+inserted.rows.length]);
        await client.query('COMMIT');return inserted.rows.map(r=>r.id);
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    },
    ensureEconomy: async (userId,starterIds) => {
      const client=await pool.connect();try{await client.query('BEGIN');
        const created=await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING user_id',[userId]);
        if(created.rows.length)for(const id of starterIds)await client.query('INSERT INTO card_inventory(user_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT DO NOTHING',[userId,id]);
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    },
    economyState: async userId => ({coins:(await q('SELECT coins FROM wallets WHERE user_id=$1',[userId])).rows[0]?.coins||0,
      inventory:(await q('SELECT card_id AS "cardId",quantity FROM card_inventory WHERE user_id=$1 ORDER BY card_id',[userId])).rows}),
    getDraw: async (userId,key) => (await q('SELECT result FROM pack_draws WHERE user_id=$1 AND request_id=$2',[userId,key])).rows[0]?.result||null,
    startLeague: async (userId,id,meta) => {
      await q('INSERT INTO league_seasons(user_id,season_id,meta) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[userId,id,meta]);
      return (await q('SELECT meta,settlement FROM league_seasons WHERE user_id=$1 AND season_id=$2',[userId,id])).rows[0];
    },
    getLeague: async (userId,id) => (await q('SELECT meta,settlement FROM league_seasons WHERE user_id=$1 AND season_id=$2',[userId,id])).rows[0]||null,
    settleLeague: async (userId,id,results,result) => {
      const client=await pool.connect();try{await client.query('BEGIN');
        const row=(await client.query('SELECT settlement FROM league_seasons WHERE user_id=$1 AND season_id=$2 FOR UPDATE',[userId,id])).rows[0];
        if(!row){const e=Error('등록된 시즌을 찾을 수 없어요.');e.status=404;throw e;}
        if(row.settlement){await client.query('COMMIT');return row.settlement;}
        const wallet=await client.query('UPDATE wallets SET coins=coins+$2 WHERE user_id=$1 RETURNING user_id',[userId,result.amount]);
        if(!wallet.rows.length)throw Error('Missing wallet');
        await client.query('UPDATE league_seasons SET results=$3,settlement=$4,finished_at=now() WHERE user_id=$1 AND season_id=$2',[userId,id,results,result]);
        await client.query('COMMIT');return result;
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    },
    clearUsers: async () => (await q('DELETE FROM users RETURNING id',[])).rows.length,
    purchasePack: async (userId,key,cost,draw) => {
      const client=await pool.connect();try{await client.query('BEGIN');
        const wallet=(await client.query('SELECT coins FROM wallets WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
        const previous=(await client.query('SELECT result FROM pack_draws WHERE user_id=$1 AND request_id=$2',[userId,key])).rows[0];
        if(previous){await client.query('COMMIT');return previous.result;}
        if(!wallet||wallet.coins<cost){const e=Error('코인이 부족해요.');e.status=400;throw e;}
        const result=draw();
        await client.query('UPDATE wallets SET coins=coins-$2 WHERE user_id=$1',[userId,cost]);
        for(const id of result.cardIds)await client.query('INSERT INTO card_inventory(user_id,card_id,quantity) VALUES($1,$2,1) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=card_inventory.quantity+1',[userId,id]);
        await client.query('INSERT INTO pack_draws(user_id,request_id,result) VALUES($1,$2,$3)',[userId,key,result]);
        await client.query('COMMIT');return result;
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    },
    createAdmin: async (username, nameKey, pwHash) => {
      const r = await q(`INSERT INTO admins(username,name_key,pw_hash) VALUES($1,$2,$3)
        ON CONFLICT(name_key) DO NOTHING RETURNING id,username,role`, [username, nameKey, pwHash]);
      return r.rows[0] || null;
    },
    adminByName: async nameKey => (await q('SELECT id,username,role,pw_hash,active FROM admins WHERE name_key=$1', [nameKey])).rows[0] || null,
    addAdminSession: (hash, id, expires) => q('INSERT INTO admin_sessions(token_hash,admin_id,expires_at) VALUES($1,$2,$3)', [hash,id,expires]),
    adminSession: async hash => (await q(`SELECT a.id,a.username,a.role FROM admin_sessions s JOIN admins a ON a.id=s.admin_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active=true`, [hash])).rows[0] || null,
    dropAdminSession: hash => q('DELETE FROM admin_sessions WHERE token_hash=$1', [hash]),
    touchAdmin: id => q('UPDATE admins SET last_login=now() WHERE id=$1', [id]),
    adminOverview: async () => { const r=await q('SELECT (SELECT count(*) FROM users)::int AS users,(SELECT count(*) FROM profiles)::int AS profiles');const campaign=(await q("SELECT result,created_at FROM economy_campaigns WHERE id='welcome-2000-v1'")).rows[0];return {...r.rows[0],coinUpgrade:campaign?{...campaign.result,appliedAt:campaign.created_at}:null}; },
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
    pruneSessions: async () => { await q('DELETE FROM sessions WHERE expires_at<now()'); await q('DELETE FROM admin_sessions WHERE expires_at<now()'); },
    getProfile: async (userId) => {
      const r = await q('SELECT data,updated_at,revision FROM profiles WHERE user_id=$1', [userId]);
      return r.rows[0] ? { data: r.rows[0].data, updated: r.rows[0].updated_at, revision: Number(r.rows[0].revision) } : null;
    },
    putProfile: async (userId, data, revision) => {
      const r = await q(
        `INSERT INTO profiles(user_id,data,updated_at,revision)
         SELECT $1,$2,now(),1 WHERE $3=0 OR EXISTS(SELECT 1 FROM profiles WHERE user_id=$1)
         ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data,updated_at=now(),revision=profiles.revision+1
         WHERE profiles.revision=$3 RETURNING data,updated_at,revision`, [userId, data, revision]);
      return r.rows[0] ? { data: r.rows[0].data, updated: r.rows[0].updated_at, revision: Number(r.rows[0].revision) } : null;
    },
    close: () => pool.end(),
  };
}

function memStore() {
  const users = new Map(), byName = new Map(), sessions = new Map(), profiles = new Map();
  const admins = new Map(), adminNames = new Map(), adminSessions = new Map();
  const gameCards=new Map(),classes=new Map(),packages=new Map(),wallets=new Map(),inventory=new Map(),draws=new Map(),seasons=new Map();
  let seq = 0, adminSeq = 0;
  return {
    kind: 'memory',
    init: async () => {},
    seedCatalog: async (cards,defs) => {for(const c of cards)if(!gameCards.has(c.id))gameCards.set(c.id,structuredClone(c));for(const c of defs)if(!classes.has(c.id))classes.set(c.id,structuredClone(c));},
    removePackage: async id => packages.delete(id),
    listCards: async () => structuredClone([...gameCards.values()]),
    listClasses: async () => structuredClone([...classes.values()]),
    listPackages: async () => structuredClone([...packages.values()]),
    saveCatalogEntry: async (kind,data) => {const map={card:gameCards,class:classes,package:packages}[kind];map.set(data.id,structuredClone({...data,...(kind==='package'?{version:(map.get(data.id)?.version||0)+1}:{})}));},
    addClassCards: async cards => {const added=[];for(const card of cards)if(!gameCards.has(card.id)){gameCards.set(card.id,structuredClone(card));added.push(card.id);}return added;},
    ensureEconomy: async (id,starterIds) => {if(!wallets.has(id)){wallets.set(id,2000);inventory.set(id,new Map(starterIds.map(cardId=>[cardId,1])));}},
    economyState: async id => ({coins:wallets.get(id)||0,inventory:[...(inventory.get(id)||[])].map(([cardId,quantity])=>({cardId,quantity}))}),
    getDraw: async (id,key) => structuredClone(draws.get(id+'|'+key)||null),
    startLeague: async (id,key,meta) => {const k=id+'|'+key;if(!seasons.has(k))seasons.set(k,{meta:structuredClone(meta),settlement:null});return structuredClone(seasons.get(k));},
    getLeague: async (id,key) => structuredClone(seasons.get(id+'|'+key)||null),
    settleLeague: async (id,key,results,result) => {const row=seasons.get(id+'|'+key);if(!row){const e=Error('등록된 시즌을 찾을 수 없어요.');e.status=404;throw e;}if(row.settlement)return structuredClone(row.settlement);if(!wallets.has(id))throw Error('Missing wallet');wallets.set(id,wallets.get(id)+result.amount);row.settlement=structuredClone(result);row.results=structuredClone(results);return structuredClone(result);},
    clearUsers: async () => {const count=users.size;users.clear();byName.clear();sessions.clear();profiles.clear();wallets.clear();inventory.clear();draws.clear();seasons.clear();return count;},
    purchasePack: async (id,key,cost,draw) => {const index=id+'|'+key;if(draws.has(index))return structuredClone(draws.get(index));if(!wallets.has(id)||wallets.get(id)<cost){const e=Error('코인이 부족해요.');e.status=400;throw e;}const result=draw();wallets.set(id,wallets.get(id)-cost);const owned=inventory.get(id);for(const cardId of result.cardIds)owned.set(cardId,(owned.get(cardId)||0)+1);draws.set(index,structuredClone(result));return structuredClone(result);},
    createAdmin: async (username, nameKey, pwHash) => {
      if(adminNames.has(nameKey))return null;
      const a={id:++adminSeq,username,pw_hash:pwHash,role:'owner',active:true};admins.set(a.id,a);adminNames.set(nameKey,a);
      return {id:a.id,username,role:a.role};
    },
    adminByName: async nameKey => adminNames.get(nameKey) || null,
    addAdminSession: async (hash,id,expires) => { adminSessions.set(hash,{adminId:id,expires}); },
    adminSession: async hash => { const s=adminSessions.get(hash),a=s&&admins.get(s.adminId);return s&&s.expires>new Date()&&a&&a.active?{id:a.id,username:a.username,role:a.role}:null; },
    dropAdminSession: async hash => { adminSessions.delete(hash); },
    touchAdmin: async () => {},
    adminOverview: async () => ({users:users.size,profiles:profiles.size}),
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
      wallets.delete(id);inventory.delete(id);for(const k of draws.keys())if(k.startsWith(id+'|'))draws.delete(k);
      for(const k of seasons.keys())if(k.startsWith(id+'|'))seasons.delete(k);
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
    pruneSessions: async () => { const now = new Date(); for (const [k, v] of sessions) if (v.expires < now) sessions.delete(k);for(const [k,v] of adminSessions)if(v.expires<now)adminSessions.delete(k); },
    getProfile: async (userId) => { const p = profiles.get(userId); return p ? structuredClone(p) : null; },
    putProfile: async (userId, data, revision) => {
      const old = profiles.get(userId);
      if ((old ? old.revision : 0) !== revision) return null;
      const p = { data: structuredClone(data), updated: new Date(), revision: revision + 1 };
      profiles.set(userId, p); return structuredClone(p);
    },
    close: async () => {},
  };
}

module.exports = URL ? pgStore() : memStore();

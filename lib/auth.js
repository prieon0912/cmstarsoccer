// Login API: username + password accounts, bearer-token sessions, and one saved profile (team, skills) per account.
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const admin = require('./admin');
const economy = require('./economy');
const {mergeProfile,LEAGUE_EPOCH}=require('./profile-state');

const SESSION_DAYS = 60;
const PROFILE_MAX = 64 * 1024; // bytes of JSON; includes a full 38-round season

const scrypt = (pw, salt) => new Promise((res, rej) =>
  crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return `s1$${salt.toString('base64')}$${(await scrypt(pw, salt)).toString('base64')}`;
}
async function checkPw(pw, stored) {
  const [v, salt, key] = String(stored).split('$');
  if (v !== 's1' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64'), got = await scrypt(pw, Buffer.from(salt, 'base64'));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
// a dummy hash so a login for a missing name takes as long as a wrong password
let DUMMY = null;
hashPw('not-a-real-password').then((h) => { DUMMY = h; });

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const nameKey = (u) => u.normalize('NFC').toLowerCase();
// 2-16 characters: Korean, letters, digits, _ and -
const NAME_RE = /^[0-9A-Za-z가-힣_-]{2,16}$/;

// small in-memory limiter for login/register attempts per IP
const hits = new Map();
function limited(ip, max = 20, windowMs = 10 * 60 * 1000) {
  const now = Date.now(), h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > windowMs) { h.n = 0; h.t = now; }
  h.n++; hits.set(ip, h);
  return h.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.t > 10 * 60 * 1000) hits.delete(k); }, 60000).unref();

async function newSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.addSession(sha(token), user.id, new Date(Date.now() + SESSION_DAYS * 864e5));
  return token;
}
const bearer = (req) => { const m = /^Bearer\s+(\S+)$/.exec(req.get('authorization') || ''); return m ? m[1] : null; };

async function needUser(req, res, next) {
  try {
    const t = bearer(req);
    const u = t && (await db.sessionUser(sha(t)));
    if (!u) return res.status(401).json({ error: '로그인이 필요해요.' });
    req.user = u; req.token = t; next();
  } catch (e) { next(e); }
}

const router = express.Router();
router.use(express.json({ limit: '128kb' }));

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/status', (req, res) => res.json({ ok: true, store: db.kind, persistent: db.kind === 'postgres', profileSync: 2 }));

router.post('/auth/register', async (req, res, next) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ error: '시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.' });
    const username = String(req.body.username || '').trim(), pw = String(req.body.password || '');
    if (!NAME_RE.test(username)) return res.status(400).json({ error: '아이디는 2~16자의 한글·영문·숫자·_·- 만 쓸 수 있어요.' });
    if (pw.length < 6 || pw.length > 72) return res.status(400).json({ error: '비밀번호는 6~72자로 정해 주세요.' });
    if (await db.adminByName(nameKey(username))) return res.status(409).json({ error: '사용할 수 없는 아이디예요.' });
    const incoming = req.body.profile;
    if (incoming != null && (typeof incoming !== 'object' || Array.isArray(incoming) || JSON.stringify(incoming).length > PROFILE_MAX))
      return res.status(400).json({ error: '잘못된 팀 데이터예요.' });
    const initial = incoming ? {...economy.validateProfile(incoming, economy.starterIds(incoming)),season:null,leagueEpoch:LEAGUE_EPOCH} : null;
    const user = await db.createUser(username, nameKey(username), await hashPw(pw));
    if (!user) return res.status(409).json({ error: '이미 있는 아이디예요.' });
    const saved = initial ? await db.putProfile(user.id, initial, 0) : null;
    res.status(201).json({ token: await newSession(user), user: { username: user.username }, profile: saved ? await economy.decorate(user.id,saved.data) : null,
      revision: saved ? saved.revision : 0, updated: saved ? saved.updated : null });
  } catch (e) { next(e); }
});

router.post('/auth/login', async (req, res, next) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ error: '시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.' });
    const username = String(req.body.username || '').trim(), pw = String(req.body.password || '');
    if (await admin.trySiteLogin(req, res, username, pw)) return;
    const u = NAME_RE.test(username) ? await db.userByName(nameKey(username)) : null;
    const ok = await checkPw(pw, u ? u.pw_hash : DUMMY);
    if (!u || !ok) return res.status(401).json({ error: '아이디나 비밀번호가 맞지 않아요.' });
    db.touchLogin(u.id).catch(() => {});
    const p = await db.getProfile(u.id);
    res.json({ token: await newSession(u), user: { username: u.username }, profile: p ? await economy.decorate(u.id,p.data) : null, updated: p ? p.updated : null, revision: p ? p.revision : 0 });
  } catch (e) { next(e); }
});

router.post('/auth/logout', needUser, async (req, res, next) => {
  try { await db.dropSession(sha(req.token)); res.json({ ok: true }); } catch (e) { next(e); }
});

router.get('/me', needUser, async (req, res, next) => {
  try {
    const p = await db.getProfile(req.user.id);
    res.json({ user: { username: req.user.username }, profile: p ? await economy.decorate(req.user.id,p.data) : null, updated: p ? p.updated : null, revision: p ? p.revision : 0 });
  } catch (e) { next(e); }
});

router.put('/profile', needUser, async (req, res, next) => {
  try {
    const data = req.body && req.body.profile;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: '잘못된 데이터예요.' });
    if (JSON.stringify(data).length > PROFILE_MAX) return res.status(413).json({ error: '데이터가 너무 커요.' });
    const revision = req.body.revision;
    if (!Number.isSafeInteger(revision) || revision < 0)
      return res.status(428).json({ error: '새로고침한 뒤 다시 저장해 주세요.' });
    await economy.catalog();
    const current=await db.getProfile(req.user.id),state=await economy.state(req.user.id,current?.data);
    let incoming;try{incoming=mergeProfile(current?.data,data,req.body);}catch(e){if(e.status!==409)throw e;return res.status(409).json({error:e.message,profile:current?await economy.decorate(req.user.id,current.data):null,revision:current?.revision||0,updated:current?.updated||null});}
    const saved = await db.putProfile(req.user.id, economy.validateProfile(incoming,state.inventory.map(c=>c.cardId)), revision);
    if (!saved) {
      const latest = await db.getProfile(req.user.id);
      return res.status(409).json({ error: '다른 브라우저에서 팀 설정이 변경됐어요.', profile: latest ? await economy.decorate(req.user.id,latest.data) : null,
        revision: latest ? latest.revision : 0, updated: latest ? latest.updated : null });
    }
    res.json({ ok: true, updated: saved.updated, revision: saved.revision, profile:await economy.decorate(req.user.id,saved.data) });
  } catch (e) { next(e); }
});

// deleting an account asks for the password again
router.post('/me/delete', needUser, async (req, res, next) => {
  try {
    const u = await db.userByName(nameKey(req.user.username));
    if (!u || !(await checkPw(String(req.body.password || ''), u.pw_hash))) return res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
    await db.deleteUser(u.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.use((err, req, res, next) => {
  console.error('[api]', err);
  res.status(err.status||500).json({ error: err.status?err.message:'서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.' });
});

module.exports = { router, needUser, init: async () => { await db.init(); await economy.init(); await admin.bootstrap(); setInterval(() => db.pruneSessions().catch(() => {}), 6 * 3600e3).unref(); return db.kind; } };

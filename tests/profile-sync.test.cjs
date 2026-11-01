const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

test('PostgreSQL migration, concurrent profile revisions, persistence after restart', async () => {
  let pg = new PGlite();
  let poolTail = Promise.resolve();
  const loadStore = () => {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/db.js'), 'utf8'), {
      module, __dirname:path.join(__dirname,'../lib'), process: { env: { DATABASE_URL: 'postgres://localhost/sync_test' } }, structuredClone,
      require(name) {
        if(name==='node:fs'||name==='node:path')return require(name);
        assert.equal(name, 'pg');
        return { Pool: class {
          query(sql, args) { return args || /^\s*SELECT\b/i.test(sql) ? pg.query(sql, args) : pg.exec(sql).then(() => ({ rows: [] })); }
          async connect() { let release;const before=poolTail;poolTail=new Promise(resolve=>release=resolve);await before;return {query:this.query.bind(this),release}; }
          end() { return pg.close(); }
        } };
      },
    });
    return module.exports;
  };
  try {
    // Simulate the existing schema and an account with saved data, before revision support.
    await pg.exec(`CREATE TABLE users(id BIGSERIAL PRIMARY KEY,username TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,pw_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),last_login TIMESTAMPTZ);
      CREATE TABLE profiles(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
      INSERT INTO users(username,name_key,pw_hash) VALUES('existing','existing','test');
      INSERT INTO profiles(user_id,data) VALUES(1,'{"team":{"name":"기존 팀"},"skills":{"r":13}}');`);
    let db = loadStore(); await db.init();
    const old = await db.getProfile(1);
    assert.equal(old.data.team.name, '기존 팀'); assert.equal(old.revision, 1);
    const a = { team: { name: 'A', cards: ['a', 'b'], bench: ['c'], form: '4-4-2', kit: 20 }, skills: { r: 13 } };
    const b = { team: { name: 'B' }, skills: { r: 2 } };
    const results = await Promise.all([db.putProfile(1, a, 1), db.putProfile(1, b, 1)]);
    assert.equal(results.filter(Boolean).length, 1);
    const saved = await db.getProfile(1); assert.equal(saved.revision, 2);
    assert.equal(await db.putProfile(1, b, 1), null);
    await db.seedCatalog([{id:'a',classId:'BASE'},{id:'b',classId:'BASE'}],[{id:'BASE',name:'베이스'}]);
    assert.equal((await db.listPackages()).length,0);
    const scheduled={id:'base',price:100,startsAt:'2026-11-01T03:00:00.000Z',endsAt:'2026-11-01T04:00:00.000Z'};
    await db.saveCatalogEntry('package',scheduled,null);await db.saveCatalogEntry('package',{id:'base-silver',price:100},null);
    await db.removePackage('base-silver');
    await db.seedCatalog([{id:'a',classId:'BASE'}],[{id:'BASE',name:'베이스'}]);
    assert.deepEqual((await db.listPackages()).map(p=>p.id),['base']);
    await db.ensureEconomy(1,['a','b']);await db.ensureEconomy(1,['a','b','c']);
    assert.equal((await db.economyState(1)).coins,1000);
    assert.equal((await db.economyState(1)).inventory.length,2);
    const result=()=>({packId:'base',count:3,cost:300,cardIds:['a','a','b']});
    const purchased=await Promise.all([db.purchasePack(1,'same-request',300,result),db.purchasePack(1,'same-request',300,result)]);
    assert.deepEqual(JSON.parse(JSON.stringify(purchased[0])),JSON.parse(JSON.stringify(purchased[1])));
    const economy=await db.economyState(1);assert.equal(economy.coins,700);assert.equal(economy.inventory.reduce((n,c)=>n+c.quantity,0),5);
    await assert.rejects(db.purchasePack(1,'too-expensive',800,result),/부족/);
    assert.equal((await db.economyState(1)).coins,700);
    const leagueId='postgres-league-season',meta={club:0,seed:1,custom:true},settlement={seasonId:leagueId,rank:1,amount:100};
    await db.startLeague(1,leagueId,meta);
    const simultaneous=await Promise.all([db.settleLeague(1,leagueId,{},settlement),db.settleLeague(1,leagueId,{},settlement),db.purchasePack(1,'parallel-league-draw',100,()=>({packId:'base',count:1,cost:100,cardIds:['a']}))]);
    assert.equal(simultaneous[0].amount,100);assert.equal(simultaneous[1].amount,100);
    const rewarded=await db.economyState(1);assert.equal(rewarded.coins,700);assert.equal(rewarded.inventory.reduce((n,c)=>n+c.quantity,0),6);
    const snapshot = await pg.dumpDataDir();
    await db.close(); pg = new PGlite({ loadDataDir: snapshot }); db = loadStore(); await db.init();
    assert.deepEqual(JSON.parse(JSON.stringify(await db.getProfile(1))), JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(JSON.parse(JSON.stringify(await db.economyState(1))),JSON.parse(JSON.stringify(rewarded)));
    assert.equal((await db.getLeague(1,leagueId)).settlement.amount,100);await db.settleLeague(1,leagueId,{},settlement);assert.equal((await db.economyState(1)).coins,700);
    assert.equal((await db.listCards()).length,2);assert.equal((await db.listClasses())[0].id,'BASE');
    const restoredPacks=await db.listPackages();assert.equal(restoredPacks.length,1);assert.equal(restoredPacks[0].startsAt,scheduled.startsAt);assert.equal(restoredPacks[0].endsAt,scheduled.endsAt);
    const u = await db.createUser('fresh', 'fresh', 'test');
    assert.equal((await db.putProfile(u.id, a, 0)).revision, 1);
    assert.equal(await db.putProfile(u.id, b, 0), null);
    assert.equal(await db.putProfile(999, a, 9), null);
    const admin=await db.createAdmin('keeper','keeper','fixture-hash');await db.addAdminSession('keeper-session',admin.id,new Date(Date.now()+60000));
    assert.equal(await db.clearUsers(),2);assert.equal((await db.adminOverview()).users,0);assert.ok(await db.adminSession('keeper-session'));
    assert.equal(await db.getLeague(1,leagueId),null);assert.equal((await db.listCards()).length,2);assert.equal((await db.listPackages()).length,1);
    const classCards=[{id:'ICON|a',playerId:'a',classId:'ICON'},{id:'ICON|b',playerId:'b',classId:'ICON'}];
    const batches=await Promise.all([db.addClassCards(classCards,admin.id),db.addClassCards(classCards,admin.id)]);assert.equal(batches.flat().length,2);
    await assert.rejects(db.addClassCards([{id:'ROLLBACK|a',classId:'ROLLBACK'}],999999));assert.ok(!(await db.listCards()).some(c=>c.id==='ROLLBACK|a'));
    const classSnapshot=await pg.dumpDataDir();await db.close();pg=new PGlite({loadDataDir:classSnapshot});db=loadStore();await db.init();
    assert.equal((await db.listCards()).filter(c=>c.classId==='ICON').length,2);assert.equal((await db.addClassCards(classCards,admin.id)).length,0);
    await db.close(); pg = null;
  } finally {
    if (pg) await pg.close();
  }
});

test('separate browser sessions share squad/team/skills; stale and interrupted saves preserve data', async () => {
  // This test server is deliberately disposable. Never connect tests to the user's Neon database.
  const previous = process.env.DATABASE_URL; delete process.env.DATABASE_URL;
  const express = require('express');
  const auth = require('../lib/auth'); const db = require('../lib/db');
  if (previous !== undefined) process.env.DATABASE_URL = previous;
  await auth.init(); const app = express(); app.use('/api', auth.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const h = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const part = (a, b) => { const i = h.indexOf(a), j = h.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return h.slice(i, j); };
  function browser(copiedStorage) {
    const storage = new Map(copiedStorage || []), els = new Map(), timers = new Map(); let timer = 0;
    const $ = id => { if (!els.has(id)) els.set(id, { value: '', hidden: true }); return els.get(id); };
    const ctx = vm.createContext({ console, $, document: { getElementById: $, visibilityState: 'visible' },
      localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) },
      setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id),
      addEventListener() {}, fetch: (url,opt) => fetch(base + url,opt),
    });
    vm.runInContext([
      part('const PI=', '/* ================= renderer & scene'),
      `const G={state:'menu',set:{}};const SKINS=Array(5),HAIRS=Array(6),BOOTS=Array(6);let tmTab='cards',tmMsg='',lastMessage='';
      function renderTeam(){if(tmMsg)lastMessage=tmMsg;}function renderTmBody(){}function renderHubAcc(){}function syncLeagueRewards(){}function openAccount(){renderTeam();}`,
      part('function makeRoster(ci)', 'const LV='),
      part('function tmSlots()', 'const AUTH='),
      part('const AUTH=', 'async function authDelete()'),
    ].join('\n'),ctx);
    return { storage, ctx, run: code => vm.runInContext(code,ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`,ctx)) };
  }
  const login = async (b, kind='login') => { await b.run(`$('authU').value='syncplayer';$('authP').value='test-password';$('authC').value='20';authDo('${kind}')`); assert.equal(b.run('AUTH.user'), 'syncplayer', b.run('lastMessage')); };
  try {
    const a = browser(); await login(a, 'register');
    assert.equal(a.run('prof()._revision'), 1);
    await a.run(`prof().team.name='서버 팀';prof().team.kit=21;prof().team.form='4-4-2';prof().team.ment=1;
      [prof().team.cards[8],prof().team.bench[0]]=[prof().team.bench[0],prof().team.cards[8]];
      prof().skills={u:13,d:3,l:6,r:10};prof().tacs={2:{form:'4-4-2',ment:-1,order:IDENT.slice()}};accCommit();srvEnsureSaved()`);
    const saved = a.json('profOut(prof())'); assert.equal(a.run('prof()._pending'), false);
    const b = browser(); await login(b); assert.deepEqual(b.json('profOut(prof())'), saved);
    // Browser A saves a new version; B's stale edits must not overwrite it.
    await a.run(`prof().team.name='A 최신 팀';accCommit();srvEnsureSaved()`);
    await b.run(`prof().team.name='B 미저장 팀';prof().skills.r=2;accCommit();srvEnsureSaved()`);
    assert.equal(b.run('prof().team.name'), 'A 최신 팀');
    assert.ok(b.json('Object.values(ACC.list).filter(p=>!p.srv)').some(p=>p.team.name==='B 미저장 팀'&&p.skills.r===2));
    // Simulate an acknowledged server write whose response was lost to this browser.
    const c = browser(); await login(c); const realFetch = c.ctx.fetch; let lost = false;
    c.ctx.fetch = async (url,opt) => { const r=await realFetch(url,opt); if(opt.method==='PUT'&&!lost){lost=true;throw new Error('lost response');} return r; };
    await c.run(`prof().team.name='응답 유실에도 보존';prof().skills.l=13;accCommit();srvFlush()`);
    assert.equal(c.run('prof()._pending'), true);
    const resumed = browser(c.storage); await resumed.run('accLoad();authLoad();authBoot()');
    assert.equal(resumed.run('prof().team.name'), '응답 유실에도 보존');
    assert.equal(resumed.run('prof().skills.l'), 13);assert.equal(resumed.run('prof()._pending'), false);
    assert.equal(resumed.json('Object.values(ACC.list).filter(p=>!p.srv)').length, 0);
    // Returning to an idle browser reads the latest account, with no re-login required.
    await a.run('srvRefresh()');assert.equal(a.run('prof().team.name'), '응답 유실에도 보존');
    // Do not replace an edit made while an account refresh request was in flight.
    let release;const started = new Promise(resolve=>release=resolve);const originalFetch=a.ctx.fetch;
    a.ctx.fetch=async(url,opt)=>{const r=await originalFetch(url,opt);if(url==='/api/me'){await new Promise(resolve=>{release(resolve);});}return r;};
    const refresh=a.run('srvRefresh()');const finish=await started;
    a.run(`prof().team.name='불러오는 중 편집';accCommit()`);finish();await refresh;
    assert.equal(a.run('prof().team.name'), '불러오는 중 편집');assert.equal(a.run('prof()._pending'),true);
    a.ctx.fetch=originalFetch;
    // Logout must finish writing, even when the debounce timer has not fired.
    await a.run('authLogout()');assert.equal(a.run('AUTH.token'),null);
    const d=browser();await login(d);assert.equal(d.run('prof().team.name'),'불러오는 중 편집');
    assert.deepEqual(d.json('prof().skills'),resumed.json('prof().skills'));
    const token=d.run('AUTH.token');
    const stale=await fetch(base+'/api/profile',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({profile:saved})});
    assert.equal(stale.status,428);
    const status=await fetch(base+'/api/status');assert.match(status.headers.get('cache-control'),/no-store/);assert.equal((await status.json()).profileSync,2);
    const denied=await fetch(base+'/api/me');assert.equal(denied.status,401);
    // Expired/revoked sessions must return the UI to logged-out state and keep unsaved edits recoverable.
    await fetch(base+'/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});
    await d.run(`prof().team.name='세션 만료 전 편집';accCommit();srvRefresh()`);
    assert.equal(d.run('AUTH.token'),null);assert.equal(d.run('AUTH.user'),null);
    assert.ok(d.json('Object.values(ACC.list).filter(p=>!p.srv)').some(p=>p.team.name==='세션 만료 전 편집'));
  } finally { await new Promise(resolve=>server.close(resolve));await db.close(); }
});


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
      CREATE TABLE league_seasons(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,season_id TEXT NOT NULL,meta JSONB NOT NULL,results JSONB,settlement JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),finished_at TIMESTAMPTZ,PRIMARY KEY(user_id,season_id));
      INSERT INTO users(username,name_key,pw_hash) VALUES('existing','existing','test');
      INSERT INTO league_seasons(user_id,season_id,meta) VALUES(1,'old-season','{}');
      INSERT INTO profiles(user_id,data) VALUES(1,'{"team":{"name":"기존 팀"},"skills":{"r":13},"season":{"md":22}}');`);
    let db = loadStore(); await db.init();
    const old = await db.getProfile(1);
    assert.equal(old.data.team.name, '기존 팀'); assert.equal(old.revision, 2);assert.equal(old.data.season,null);assert.equal(old.data.leagueEpoch,1);
    assert.equal(old.data.skills.r,13);assert.equal(await db.getLeague(1,'old-season'),null);assert.equal((await pg.query('SELECT affected FROM profile_migrations')).rows[0].affected,1);
    const a = { team: { name: 'A', cards: ['a', 'b'], bench: ['c'], form: '4-4-2', kit: 20 }, skills: { r: 13 } };
    const b = { team: { name: 'B' }, skills: { r: 2 } };
    a.season=b.season={v:2,club:20,custom:true,md:6,seed:12,fx:require('../lib/league-results').fixtures(12,20),res:{'0:20:1':[2,1]},goals:{'20|득점 선수':3},playedRounds:[0,2,5]};
    const results = await Promise.all([db.putProfile(1, a, 2), db.putProfile(1, b, 2)]);
    assert.equal(results.filter(Boolean).length, 1);
    const saved = await db.getProfile(1); assert.equal(saved.revision, 3);
    assert.equal(await db.putProfile(1, b, 1), null);
    await db.seedCatalog([{id:'a',classId:'BASE'},{id:'b',classId:'BASE'}],[{id:'BASE',name:'베이스'}]);
    assert.equal((await db.listPackages()).length,0);
    const scheduled={id:'base',price:100,startsAt:'2026-11-01T03:00:00.000Z',endsAt:'2026-11-01T04:00:00.000Z'};
    await db.saveCatalogEntry('package',scheduled,null);await db.saveCatalogEntry('package',{id:'base-silver',price:100},null);
    await db.removePackage('base-silver');
    await db.seedCatalog([{id:'a',classId:'BASE'}],[{id:'BASE',name:'베이스'}]);
    assert.deepEqual((await db.listPackages()).map(p=>p.id),['base']);
    await db.ensureEconomy(1,['a','b']);await db.ensureEconomy(1,['a','b','c']);
    assert.equal((await db.economyState(1)).coins,2000);
    assert.equal((await db.economyState(1)).inventory.length,2);
    const result=()=>({packId:'base',count:3,cost:300,cardIds:['a','a','b']});
    const purchased=await Promise.all([db.purchasePack(1,'same-request',300,result),db.purchasePack(1,'same-request',300,result)]);
    assert.deepEqual(JSON.parse(JSON.stringify(purchased[0])),JSON.parse(JSON.stringify(purchased[1])));
    const economy=await db.economyState(1);assert.equal(economy.coins,1700);assert.equal(economy.inventory.reduce((n,c)=>n+c.quantity,0),5);
    await assert.rejects(db.purchasePack(1,'too-expensive',1800,result),/부족/);
    assert.equal((await db.economyState(1)).coins,1700);
    const leagueId='postgres-league-season',meta={club:0,seed:1,custom:true},settlement={seasonId:leagueId,rank:1,amount:100};
    await db.startLeague(1,leagueId,meta);
    const simultaneous=await Promise.all([db.settleLeague(1,leagueId,{},settlement),db.settleLeague(1,leagueId,{},settlement),db.purchasePack(1,'parallel-league-draw',100,()=>({packId:'base',count:1,cost:100,cardIds:['a']}))]);
    assert.equal(simultaneous[0].amount,100);assert.equal(simultaneous[1].amount,100);
    const rewarded=await db.economyState(1);assert.equal(rewarded.coins,1700);assert.equal(rewarded.inventory.reduce((n,c)=>n+c.quantity,0),6);
    const snapshot = await pg.dumpDataDir();
    await db.close(); pg = new PGlite({ loadDataDir: snapshot }); db = loadStore(); await db.init();
    assert.deepEqual(JSON.parse(JSON.stringify(await db.getProfile(1))), JSON.parse(JSON.stringify(saved)));
    assert.equal((await db.getProfile(1)).data.season.md,6);assert.deepEqual(Array.from((await db.getProfile(1)).data.season.playedRounds),[0,2,5]);
    assert.deepEqual(JSON.parse(JSON.stringify(await db.economyState(1))),JSON.parse(JSON.stringify(rewarded)));
    assert.equal((await db.getLeague(1,leagueId)).settlement.amount,100);await db.settleLeague(1,leagueId,{},settlement);assert.equal((await db.economyState(1)).coins,1700);
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
      part('const lgMine=', 'function poisson('),
      part('function tmSlots()', 'const AUTH='),
      part('const AUTH=', 'async function authDelete()'),
    ].join('\n'),ctx);
    return { storage, ctx, run: code => vm.runInContext(code,ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`,ctx)) };
  }
  const login = async (b, kind='login',username='syncplayer') => { await b.run(`$('authU').value='${username}';$('authP').value='test-password';$('authC').value='20';authDo('${kind}')`); assert.equal(b.run('AUTH.user'), username, b.run('lastMessage')); };
  try {
    const a = browser(); await login(a, 'register');
    assert.equal(a.run('prof()._revision'), 1);
    await a.run(`prof().team.name='서버 팀';prof().team.kit=21;prof().team.form='4-4-2';prof().team.ment=1;
      [prof().team.cards[8],prof().team.bench[0]]=[prof().team.bench[0],prof().team.cards[8]];
      prof().skills={u:13,d:3,l:6,r:10};prof().tacs={2:{form:'4-4-2',ment:-1,order:IDENT.slice()}};accCommit();srvEnsureSaved()`);
    const saved = a.json('profOut(prof())'); assert.equal(a.run('prof()._pending'), false);
    const b = browser(); await login(b); assert.deepEqual(b.json('profOut(prof())'), saved);
    // A season must follow the same account, including custom club, table data, scorers and played rounds.
    await a.run(`newSeason(20,true);LG.s.owner=AUTH.user;LG.s.id='cross-device-season';LG.s.md=6;
      LG.s.fx.slice(0,6).forEach((round,md)=>round.forEach(([h,a])=>LG.s.res[md+':'+h+':'+a]=[2,1]));
      LG.s.goals={'20|테스트 선수':4};LG.s.playedRounds=[0,2,5];lgSave();srvEnsureSaved()`);
    await b.run('srvRefresh()');assert.deepEqual(b.json('LG.s'),a.json('LG.s'));assert.equal(b.run('LG.s.md'),6);
    await b.run(`LG.s.md=7;LG.s.playedRounds.push(6);lgSave();srvEnsureSaved()`);await a.run('srvRefresh()');assert.deepEqual(a.json('LG.s'),b.json('LG.s'));
    const fresh=browser();await login(fresh);assert.deepEqual(fresh.json('LG.s'),a.json('LG.s'));assert.equal(fresh.run('LG.s.custom'),true);
    // An old squad-only client cannot delete the cloud season.
    const squadOnly={...saved};delete squadOnly.season;
    const legacyWrite=await fetch(base+'/api/profile',{method:'PUT',headers:{Authorization:'Bearer '+fresh.run('AUTH.token'),'Content-Type':'application/json'},body:JSON.stringify({profile:squadOnly,revision:fresh.run('prof()._revision')})});
    assert.equal(legacyWrite.status,200);await a.run('srvRefresh()');await b.run('srvRefresh()');assert.equal(a.run('LG.s.md'),7);
    // A match running on device A is not forfeited just because device B logs in or reloads.
    a.storage.set('fl11-league-device','device-a');
    await a.run(`LG.s.activeMatch={md:LG.s.md,h:LG.s.fx[LG.s.md][0][0],a:LG.s.fx[LG.s.md][0][1],user:AUTH.user,device:'device-a'};lgSave();srvEnsureSaved()`);
    await b.run('srvRefresh()');b.run('lgLoad()');assert.equal(b.run('LG.s.md'),7);assert.equal(b.run('LG.s.activeMatch.device'),'device-a');
    await a.run('delete LG.s.activeMatch;lgSave();srvEnsureSaved()');await b.run('srvRefresh()');
    // A reset cloud season never resurrects a browser-only season, including its owner's old cache.
    const other=browser();other.storage.set('fl11-season',JSON.stringify(a.json('LG.s')));await login(other,'register','syncother');assert.equal(other.run('LG.s'),null);
    await other.run('authLogout()');assert.equal(other.run('LG.s'),null);
    const oldSeason={...a.json('LG.s'),owner:'syncother',id:'legacy-owned-season',md:3};other.storage.set('fl11-season',JSON.stringify(oldSeason));
    await login(other,'login','syncother');assert.equal(other.run('LG.s'),null);await other.run('srvEnsureSaved()');
    const recovered=browser();await login(recovered,'login','syncother');assert.equal(recovered.run('LG.s'),null);
    // A stale device with an older browser-only season cannot replace an existing cloud season.
    const staleSeason=browser();staleSeason.storage.set('fl11-season',JSON.stringify({...oldSeason,owner:'syncplayer',md:30}));await login(staleSeason);assert.equal(staleSeason.run('LG.s.md'),7);
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
    // A returning device must GET the cloud first, then save only its changed fields.
    const e=browser();await login(e,'register','syncisolation');
    await e.run('newSeason(20,true);srvEnsureSaved()');
    const f=browser();await login(f,'login','syncisolation');
    await e.run(`LG.s.fx[0].forEach(([h,a])=>LG.s.res['0:'+h+':'+a]=[2,0]);LG.s.md=1;LG.s.playedRounds=[0];lgSave();srvEnsureSaved()`);
    f.run(`prof().team.name='다른 기기 편집';accCommit()`);
    const returning=browser(f.storage),requests=[],returnFetch=returning.ctx.fetch;
    returning.ctx.fetch=(url,opt)=>{requests.push([url,opt.method]);return returnFetch(url,opt);};
    await returning.run('accLoad();authLoad();authBoot();srvEnsureSaved()');
    assert.ok(requests.findIndex(([url])=>url==='/api/me')<requests.findIndex(([,method])=>method==='PUT'));
    assert.equal(returning.run('LG.s.md'),1);assert.equal(returning.run('prof().team.name'),'다른 기기 편집');
    await e.run('srvRefresh()');assert.equal(e.run('LG.s.md'),1);assert.equal(e.run('prof().team.name'),'다른 기기 편집');
    // Even a new revision cannot send a stale season alongside a squad-only edit.
    const bad=e.json('profOut(prof())');bad.season.md=0;
    const put=body=>fetch(base+'/api/profile',{method:'PUT',headers:{Authorization:'Bearer '+e.run('AUTH.token'),'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await put({profile:bad,revision:e.run('prof()._revision')})).status,409);
    bad.team.name='항목별 저장';assert.equal((await put({profile:bad,revision:e.run('prof()._revision'),fields:['team']})).status,200);
    await e.run('srvRefresh()');assert.equal(e.run('LG.s.md'),1);
    // A GET that finishes after kick-off must not replace the live season or squad.
    let unblock,startedLate;const lateReady=new Promise(r=>startedLate=r),fFetch=f.ctx.fetch;
    f.ctx.fetch=async(url,opt)=>{const r=await fFetch(url,opt);if(url==='/api/me')await new Promise(resolve=>{unblock=resolve;startedLate();});return r;};
    const late=f.run('srvRefresh()');await lateReady;f.run(`G.state='play';globalThis.liveSeason=LG.s;globalThis.liveTeam=CUSTOM[0];globalThis.cachedProfile=prof()`);unblock();await late;
    assert.equal(f.run('LG.s===liveSeason&&CUSTOM[0]===liveTeam&&prof()===cachedProfile'),true);
    f.run(`G.state='half';prof().skills.r=7;applyProfile()`);assert.equal(f.run('CUSTOM[0]===liveTeam'),true);
    f.run(`G.state='menu'`);f.ctx.fetch=fFetch;await f.run('srvRefresh()');assert.equal(f.run('LG.s.md'),1);
    // Resetting the server invalidates the old client's pending league without touching its team.
    f.run(`delete prof().leagueEpoch;delete prof()._base.leagueEpoch;prof().season.md=2;prof().team.name='리그 초기화 후 팀';srvQueue()`);
    const u=await db.userByName('syncisolation'),beforeReset=await db.getProfile(u.id);
    await db.putProfile(u.id,{...beforeReset.data,season:null,leagueEpoch:1},beforeReset.revision);
    const resetReturn=browser(f.storage);await resetReturn.run('accLoad();authLoad();authBoot();srvEnsureSaved()');
    assert.equal(resetReturn.run('LG.s'),null);assert.equal(resetReturn.run('prof().team.name'),'리그 초기화 후 팀');
    await resetReturn.run('newSeason(20,true);newSeason(21,true);srvEnsureSaved()');assert.equal(resetReturn.run('prof()._pending'),false);assert.equal(resetReturn.run('LG.s.md'),0);assert.equal(resetReturn.run('LG.s.club'),21);
    // No catalog fallback may silently replace a saved special card before that catalog loads.
    const waiting=browser();waiting.run(`AUTH.user='catalogwait';AUTH.token='fixture';const data=newProfile('wait',20);data.team.cards[1]='ICON|not-loaded';data.inventory=[...data.team.cards,...data.team.bench].map(cardId=>({cardId,quantity:1}));srvAdopt('catalogwait',data,1);accCommit()`);
    assert.equal(waiting.run("prof().team.cards[1]"),'ICON|not-loaded');assert.equal(waiting.run("profOut(prof()).team.cards[1]"),'ICON|not-loaded');assert.equal(await waiting.run('srvFlush()'),false);
    // Expired/revoked sessions must return the UI to logged-out state and keep unsaved edits recoverable.
    await fetch(base+'/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});
    await d.run(`prof().team.name='세션 만료 전 편집';accCommit();srvRefresh()`);
    assert.equal(d.run('AUTH.token'),null);assert.equal(d.run('AUTH.user'),null);
    assert.ok(d.json('Object.values(ACC.list).filter(p=>!p.srv)').some(p=>p.team.name==='세션 만료 전 편집'));
  } finally { await new Promise(resolve=>server.close(resolve));await db.close(); }
});


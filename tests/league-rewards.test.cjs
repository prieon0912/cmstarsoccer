const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const rules=require('../lib/league-results'),allRounds=Array.from({length:38},(_,i)=>i);
function resultsFor(meta,winner=null){const results={};rules.fixtures(meta.seed,meta.club).forEach((round,md)=>round.forEach(([h,a])=>{results[md+':'+h+':'+a]=h===winner?[3,0]:a===winner?[0,3]:h<a?[3,0]:[0,3];}));return results;}
test('server fixtures match the game and all final places receive the requested amounts',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8'),a=html.indexOf('function makeFixtures('),b=html.indexOf('function newSeason(',a);
  const context=vm.createContext({PL_IDX:Array.from({length:20},(_,i)=>i),CLUBS:Array(36).fill({})});
  vm.runInContext(html.match(/function seeded\(s\)[^\r\n]+/)[0]+'\n'+html.slice(a,b),context);
  for(let club=0;club<36;club++)for(const seed of [0,1,4294967295])assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext(`makeFixtures(${seed},${club})`,context))),rules.fixtures(seed,club));
  const amounts=[200,160,100,60,60,40,40,20,20,20,0,0,0,0,0,0,0,0,0,0];
  for(let club=0;club<20;club++){const meta={club,seed:932,custom:club%2===0};assert.deepEqual(rules.evaluateSeason(meta,resultsFor(meta),allRounds),{rank:club+1,amount:amounts[club]});}
  const foreign={club:25,seed:0,custom:false};assert.equal(rules.evaluateSeason(foreign,resultsFor(foreign,25),allRounds).amount,200);
  const incomplete=resultsFor(foreign);delete incomplete[Object.keys(incomplete)[0]];assert.throws(()=>rules.evaluateSeason(foreign,incomplete),/완료/);
  const invalid=resultsFor(foreign);invalid[Object.keys(invalid)[0]]=[-1,0];assert.throws(()=>rules.evaluateSeason(foreign,invalid),/경기/);
});
test('doubled league rewards are proportional to unique directly played rounds, rounded down',()=>{
  const meta={club:0,seed:1,custom:true},results=resultsFor(meta,0);
  assert.equal(rules.evaluateSeason(meta,results).amount,0);
  assert.equal(rules.evaluateSeason(meta,results,[0]).amount,5);
  assert.equal(rules.evaluateSeason(meta,results,allRounds.slice(0,19)).amount,100);
  assert.equal(rules.evaluateSeason(meta,results,allRounds).amount,200);
  for(const bad of [[0,0],[-1],[38],[.5],'38',Array(39).fill(1)])assert.throws(()=>rules.evaluateSeason(meta,results,bad),/경기/);
});

test('league API calculates the rank, credits once across retries and isolates accounts',async()=>{
  const previous=process.env.DATABASE_URL;delete process.env.DATABASE_URL;const db=require('../lib/db');if(previous!==undefined)process.env.DATABASE_URL=previous;
  const auth=require('../lib/auth'),league=require('../lib/league'),express=require('express');await auth.init();
  const app=express();app.use('/api/league',league.router);app.use('/api',auth.router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`,call=async(url,body,token)=>{if(body&&url.startsWith('/api/league/'))body={leagueEpoch:1,...body};const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    const first=await call('/api/auth/register',{username:'league_one',password:'test-password',profile:{club:'ARS'}}),second=await call('/api/auth/register',{username:'league_two',password:'test-password',profile:{club:'ARS'}}),token=first.data.token;
    const season={seasonId:crypto.randomUUID(),club:9,seed:32,custom:true};
    assert.equal((await call('/api/league/start',season)).status,401);
    assert.equal((await call('/api/league/start',{...season,leagueEpoch:0},token)).status,409);
    assert.equal((await call('/api/league/start',season,token)).status,200);
    assert.equal((await call('/api/league/start',season,token)).status,200);
    assert.equal((await call('/api/league/start',{...season,club:0},token)).status,409);
    assert.equal((await call('/api/league/finish',{seasonId:season.seasonId,rank:1,amount:999999,results:{}},token)).status,400);
    const body={seasonId:season.seasonId,results:resultsFor(season),playedRounds:allRounds,rank:1,amount:999999};
    assert.equal((await call('/api/league/finish',{...body,leagueEpoch:0},token)).status,409);
    assert.equal((await call('/api/league/finish',body,second.data.token)).status,404);
    const draws=await Promise.all([call('/api/league/finish',body,token),call('/api/league/finish',body,token)]);
    assert.ok(draws.every(d=>d.status===200));assert.deepEqual(draws[0].data.result,{seasonId:season.seasonId,rank:10,amount:20});
    assert.equal((await call('/api/me',undefined,token)).data.profile.coins,2020);
    assert.equal((await call('/api/league/finish',{seasonId:season.seasonId},token)).data.coins,2020);
    const low={seasonId:crypto.randomUUID(),club:19,seed:4,custom:false};await call('/api/league/start',low,token);
    assert.equal((await call('/api/league/finish',{seasonId:low.seasonId,results:resultsFor(low)},token)).data.result.amount,0);
    assert.equal((await call('/api/me',undefined,token)).data.profile.coins,2020);
    const owner=await db.adminByName('prieon_auth');await db.addAdminSession('test-admin-session',owner.id,new Date(Date.now()+60000));
    assert.equal(await db.clearUsers(),2);assert.equal((await db.adminOverview()).users,0);assert.ok(await db.adminSession('test-admin-session'));
    assert.equal((await call('/api/me',undefined,token)).status,401);assert.equal(await db.getLeague(first.data.user.id||1,season.seasonId),null);
  }finally{await new Promise(r=>server.close(r));await db.close();}
});
test('completed seasons remain queued after a lost response and survive a new season or account switch',async()=>{
  const context=vm.createContext({crypto,Date,Math,Promise});vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/league-rewards.js'),'utf8'),context);
  const store=new Map(),ledger=new Set();let user='first',current={club:0,seed:4,custom:true,md:0,res:{}},credits=0,fail=true;const received=[];
  const hooks={user:()=>user,get:k=>store.get(k),set:(k,v)=>store.set(k,v),season:()=>current,save(){},inventory:data=>received.push(data.coins),api:async(url,{body})=>{
    if(url==='/league/start')return {seasonId:body.seasonId};if(!ledger.has(body.seasonId)){ledger.add(body.seasonId);credits+=100;}
    if(fail){fail=false;throw Error('Lost response');}return {coins:1000+credits,inventory:[]};
  }};
  let client=context.FL11LeagueRewards(hooks);await client.sync(current);const completed=current;completed.md=38;await client.sync(completed);assert.equal(credits,100);assert.equal(JSON.parse(store.get('fl11-league-pending')).length,1);
  user='other';current=null;client=context.FL11LeagueRewards(hooks);await client.sync(null);assert.equal(received.length,0);assert.equal(JSON.parse(store.get('fl11-league-pending')).length,1);
  user='first';current={club:1,seed:3,custom:false,md:0,res:{}};await client.sync(current);assert.equal(credits,100);assert.equal(received[0],1100);assert.equal(JSON.parse(store.get('fl11-league-pending')).length,0);
  current=completed;await client.sync(current);assert.equal(credits,100);assert.equal(current.rewardDone,true);
});
test('the account menu label and click action follow the login state',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8'),elements=new Map();let click,opens=0,logouts=0,menus=0;
  const $=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,classList:{toggle(){}},addEventListener(event,fn){if(id==='accountBtn')click=fn;}});return elements.get(id);};
  const AUTH={user:null},context=vm.createContext({AUTH,$,prof:()=>null,openAccount:()=>opens++,authLogout:async()=>{logouts++;AUTH.user=null;return true;},goMenu:()=>menus++});
  const start=html.indexOf('function renderHubAcc(){'),end=html.indexOf('/* ================= substitutions',start);vm.runInContext(html.slice(start,end),context);
  const line=html.split('\n').find(s=>s.startsWith("$('accountBtn').addEventListener"));vm.runInContext(line,context);
  vm.runInContext('renderHubAcc()',context);assert.equal($('accountBtn').textContent,'로그인 / 회원가입');await click();assert.equal(opens,1);
  AUTH.user='first';vm.runInContext('renderHubAcc()',context);assert.equal($('accountBtn').textContent,'로그아웃');await click();assert.equal(logouts,1);assert.equal(menus,1);assert.equal($('accountBtn').disabled,false);
});

test('a cached pre-reset reward queue is never retried by the new client',async()=>{
  const context=vm.createContext({crypto,Date,Math,Promise});vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/league-rewards.js'),'utf8'),context);let calls=0;
  const old=JSON.stringify([{id:'old-reward-season',owner:'first',md:38,results:{}}]);
  const client=context.FL11LeagueRewards({user:()=> 'first',get:()=>old,set(){},season:()=>null,save(){},inventory(){},api:async()=>{calls++;}});
  await client.sync(null);assert.equal(calls,0);
});

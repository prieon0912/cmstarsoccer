const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');

test('collection progress, milestones and retired cards are computed from the catalogue',()=>{
  const {build,REWARDS}=require('../lib/collection'),seed=require('../public/data/player-catalog');
  const ars=seed.filter(c=>c.clubId==='ARS').map(c=>c.id),che=seed.filter(c=>c.clubId==='CHE').map(c=>c.id);
  const icons=Array.from({length:7},(_,i)=>({...seed[i],id:'ICON|'+i,playerId:seed[i].playerId,classId:'ICON'}));
  const retired={...seed[40],id:'OLD|1',classId:'ICON',active:false},hidden={...seed[41],id:'OLD|2',classId:'ICON',active:false};
  const cards=[...seed,...icons,retired,hidden],inv=ids=>ids.map(cardId=>({cardId,quantity:1}));
  let book=build(cards,inv(ars),[]);
  assert.equal(book.total,seed.length+7);assert.equal(book.owned,20);assert.equal(book.clubs.length,36);
  assert.ok(book.clubs.every(c=>c.cardIds.length===20));assert.deepEqual(book.clubs[0].cardIds,ars);
  const r=id=>book.rewards.find(x=>x.id===id);
  assert.equal(r('club:ARS').state,'ready');assert.equal(r('club:ARS').amount,REWARDS.club);assert.equal(r('club:CHE').state,'locked');
  assert.equal(r('league:PL').need,400);assert.equal(r('league:LL').need,80);assert.equal(r('total:25').state,'locked');
  assert.equal(r('class:ICON:5').state,'locked');assert.equal(r('class:ICON:10'),undefined);assert.equal(r('class:ICON:complete').need,7);
  assert.equal(book.ready,REWARDS.club);
  book=build(cards,inv([...ars,...che.slice(0,5),...icons.slice(0,5).map(c=>c.id),'OLD|1']),[{rewardId:'club:ARS',amount:300,claimedAt:'2026-11-02T00:00:00Z'}]);
  assert.equal(book.total,seed.length+8,'an owned retired card stays in the book, an unowned one does not');
  assert.equal(r('club:ARS').state,'claimed');assert.equal(r('total:25').state,'ready');assert.equal(r('class:ICON:5').state,'ready');
  assert.equal(book.classes[0].owned,6);assert.equal(r('class:ICON:complete').state,'locked');assert.equal(r('class:ICON:complete').need,8);
  assert.equal(book.ready,200+200);
});

test('collection API pays each reward once and keeps accounts separate',async()=>{
  const previous=process.env.DATABASE_URL;delete process.env.DATABASE_URL;const db=require('../lib/db');if(previous!==undefined)process.env.DATABASE_URL=previous;
  const auth=require('../lib/auth'),collection=require('../lib/collection'),express=require('express');await auth.init();
  const app=express();app.use('/api/collection',collection.router);app.use('/api',auth.router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`,call=async(url,body,token)=>{const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try{
    const one=await call('/api/auth/register',{username:'book_one',password:'test-password',profile:{club:'ARS'}}),two=await call('/api/auth/register',{username:'book_two',password:'test-password',profile:{club:'BAR'}});
    const t1=one.data.token,t2=two.data.token;
    assert.equal((await call('/api/collection')).status,401);
    let book=(await call('/api/collection',null,t1)).data;
    assert.equal(book.owned,20);assert.equal(book.coins,2000);assert.equal(book.rewards.find(r=>r.id==='club:ARS').state,'ready');
    assert.equal((await call('/api/collection/claim',{rewardIds:['league:PL']},t1)).status,409);
    assert.equal((await call('/api/collection/claim',{rewardIds:['nope']},t1)).status,404);
    assert.equal((await call('/api/collection/claim',{rewardIds:[]},t1)).status,400);
    const paid=await call('/api/collection/claim',{rewardIds:['club:ARS','club:ARS']},t1);
    assert.equal(paid.status,200);assert.deepEqual(paid.data.claimed,['club:ARS']);assert.equal(paid.data.credited,300);assert.equal(paid.data.coins,2300);
    const again=await call('/api/collection/claim',{rewardIds:['club:ARS']},t1);
    assert.equal(again.status,200);assert.equal(again.data.credited,0);assert.equal(again.data.coins,2300);
    const racing=await Promise.all([1,2,3].map(()=>call('/api/collection/claim',{all:true},t2)));
    assert.equal(racing.reduce((n,r)=>n+r.data.credited,0),300);assert.equal((await db.economyState((await db.userByName('book_two')).id)).coins,2300);
    // five draws from another club unlock the 25-card milestone
    const userId=(await db.userByName('book_one')).id,che=require('../public/data/player-catalog').filter(c=>c.clubId==='CHE').slice(0,5).map(c=>c.id);
    await db.purchasePack(userId,'collection-test-draw',0,()=>({cardIds:che}));
    book=(await call('/api/collection',null,t1)).data;assert.equal(book.owned,25);assert.equal(book.ready,200);
    const all=await call('/api/collection/claim',{all:true},t1);assert.deepEqual(all.data.claimed,['total:25']);assert.equal(all.data.coins,2500);assert.equal(all.data.ready,0);
    assert.equal((await call('/api/collection',null,t2)).data.rewards.find(r=>r.id==='total:25').state,'locked');
  }finally{server.close();}
});

test('Postgres collection claims credit once, survive restart and are removed with the account',async()=>{
  const pg=new PGlite();let tail=Promise.resolve();
  const load=()=>{const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/db.js'),'utf8'),{module,__dirname:path.join(__dirname,'../lib'),process:{env:{DATABASE_URL:'postgres://localhost/test'}},structuredClone,require(name){if(name!=='pg')return require(name);return {Pool:class{query(sql,args){return args||/^\s*SELECT\b/i.test(sql)?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1)||{rows:[]});}async connect(){let release;const before=tail;tail=new Promise(r=>release=r);await before;return {query:this.query.bind(this),release};}end(){}}};}});return module.exports;};
  try{
    let db=load();await db.init();const user=await db.createUser('pg_book','pg_book','hash');await db.ensureEconomy(user.id,['ARS|라야']);
    const rewards=[{id:'club:ARS',amount:300},{id:'total:25',amount:200}];
    const results=await Promise.all([db.claimCollectionRewards(user.id,rewards),db.claimCollectionRewards(user.id,rewards)]);
    assert.equal(results[0].coins+results[1].coins,500);assert.equal((await db.economyState(user.id)).coins,2500);
    db=load();await db.init();
    assert.equal((await db.claimCollectionRewards(user.id,rewards)).claimed.length,0);
    assert.deepEqual((await db.collectionClaims(user.id)).map(c=>[c.rewardId,c.amount]).sort(),[['club:ARS',300],['total:25',200]]);
    await db.deleteUser(user.id);assert.equal((await db.collectionClaims(user.id)).length,0);
  }finally{await pg.close();}
});

test('기타 cards: admin validation, no club synergy rewards, shown under their own tab',()=>{
  const econ=require('../lib/economy'),{build}=require('../lib/collection'),seed=require('../public/data/player-catalog');
  const classes=[{id:'BASE'},{id:'ICON'}],roster={num:10,stars:4,st:{pace:.8,shoot:.8,pass:.8,drib:.8,tackle:.4,phy:.7},hid:{att:1,def:1,roam:1,focus:1,read:1,run:'bal',press:'contain'},feet:{foot:'R',wf:3}};
  const card=econ.validateCard({name:'기타 선수',classId:'ICON',clubIndex:-1,clubName:' 갈라타사라이 ',pos:'ST',ovr:88,roster},classes,null);
  assert.equal(card.clubId,'ETC');assert.equal(card.clubIndex,-1);assert.equal(card.clubName,'갈라타사라이');
  assert.equal(econ.validateCard({...card,roster},classes,card).clubName,'갈라타사라이','editing keeps the club name');
  assert.equal(econ.validateCard({name:'A',classId:'ICON',clubIndex:0,clubName:'x',pos:'ST',ovr:80,roster},classes,null).clubName,undefined);
  assert.throws(()=>econ.validateCard({name:'A',classId:'ICON',clubIndex:'',pos:'ST',ovr:80,roster},classes,null),/구단/);
  assert.throws(()=>econ.validateCard({name:'A',classId:'ICON',clubIndex:-2,pos:'ST',ovr:80,roster},classes,null),/구단/);
  const base={...card,id:'BASE|other',classId:'BASE'},book=build([...seed,base,card],[{cardId:base.id,quantity:1}],[]);
  const etc=book.clubs.find(c=>c.clubId==='ETC');assert.equal(etc.league,'ETC');assert.deepEqual(etc.cardIds,['BASE|other']);
  assert.ok(book.leagues.some(l=>l.league==='ETC'&&l.owned===1));
  assert.ok(!book.rewards.some(r=>r.id==='club:ETC'||r.id==='league:ETC'));
  assert.deepEqual(book.classes.find(c=>c.classId==='ICON').cardIds,[card.id]);
});

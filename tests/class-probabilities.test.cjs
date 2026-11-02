const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const econ=require('../lib/economy'),ui=require('../public/admin/pack-odds');
const cards=['a','b','c','d','e','f'].map((id,i)=>({id,name:id,clubId:'ARS',classId:i<3?'BASE':'ICON',ovr:i%3===2?80:90})),classes=[{id:'BASE'},{id:'ICON'},{id:'BALLON_DOR'}];
const pack={name:'Mixed',price:10,classIds:['BASE','ICON'],weights:{},classWeights:{BASE:80,ICON:20},classOvrWeights:{BASE:{90:25,80:75},ICON:{90:75,80:25}},multipliers:{a:3,e:4}};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
test('class, conditional OVR and within-bucket multiplier compose exact published odds and three draws',()=>{
  const p=econ.validatePackage(pack,classes,cards),c=econ.compilePack(p,cards),expected={a:.15,b:.05,c:.6,d:.03,e:.12,f:.05};for(const o of c.odds)near(o.probability,expected[o.cardId]);near(c.odds.reduce((n,o)=>n+o.probability,0),1);near(c.classOdds.find(o=>o.classId==='ICON').probability,.2);near(c.classOvrOdds.find(o=>o.classId==='ICON'&&o.ovr===90).probability,.75);near(c.ovrOdds.find(o=>o.ovr===90).probability,.35);
  const previous=crypto.randomInt,rolls=[.9,.5,.8];crypto.randomInt=()=>{assert.ok(rolls.length);return Math.floor(rolls.shift()*281474976710655);};try{assert.deepEqual(econ.draw(c,1),['e']);assert.equal(rolls.length,0);}finally{crypto.randomInt=previous;}
  const changed=econ.compilePack({...p,multipliers:{a:30,e:4}},cards);near(changed.classOdds[0].probability,.8);near(changed.classOvrOdds.find(o=>o.classId==='BASE'&&o.ovr===90).probability,.25);assert.notEqual(c.quote,changed.quote);
});
test('rejects invalid class/OVR probabilities and unavailable positive buckets; zero class is excluded',()=>{
  for(const value of [-1,NaN,Infinity])assert.throws(()=>econ.validatePackage({...pack,classWeights:{BASE:value,ICON:20}},classes,cards));
  assert.throws(()=>econ.validatePackage({...pack,classWeights:{BASE:0,ICON:0}},classes,cards));assert.throws(()=>econ.validatePackage({...pack,classWeights:{OTHER:10}},classes,cards));assert.throws(()=>econ.validatePackage({...pack,classOvrWeights:{ICON:{100:10}}},classes,cards));
  assert.throws(()=>econ.validatePackage({...pack,multipliers:{a:0,b:0}},classes,cards),/BASE.*90/);
  assert.throws(()=>econ.validatePackage({...pack,classIds:['BALLON_DOR'],classWeights:{BALLON_DOR:1},classOvrWeights:{BALLON_DOR:{99:1}}},classes,cards),/BALLON_DOR/);
  const zero=econ.validatePackage({...pack,classWeights:{BASE:0,ICON:1},classOvrWeights:{BASE:{99:10},ICON:{90:1}}},classes,cards);assert.ok(econ.draw(econ.compilePack(zero,cards),50).every(id=>['d','e'].includes(id)));
});
test('editing a legacy package preserves exact player odds when converted into the new hierarchy',()=>{
  const legacy={name:'Legacy',price:10,classIds:['BASE','ICON'],weights:{90:70,80:30},multipliers:{a:3,e:4}},before=econ.compilePack(legacy,cards),converted=ui.initial(legacy,cards,classes),after=econ.compilePack(econ.validatePackage({...legacy,...converted,classWeights:Object.fromEntries(legacy.classIds.map(id=>[id,converted.classWeights[id]])),classOvrWeights:Object.fromEntries(legacy.classIds.map(id=>[id,converted.classOvrWeights[id]])),weights:{}},classes,cards),cards);
  for(const o of before.odds)near(after.odds.find(p=>p.cardId===o.cardId).probability,o.probability);
});
test('saved hierarchy reaches shop odds and purchases; changed class odds reject the old quote',async()=>{
  const {hashPassword}=require('../lib/password'),config=require('../lib/admin-bootstrap.json'),original=config.passwordHash;config.passwordHash=await hashPassword('class-odds-test');
  const auth=require('../lib/auth'),admin=require('../lib/admin'),shop=require('../lib/shop'),db=require('../lib/db'),express=require('express');await auth.init();const app=express();app.use('/api/admin',admin.router);app.use('/api/shop',shop.router);app.use('/api',auth.router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(url,body,headers={})=>{const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),headers:r.headers};};
  try{
    const login=await call('/api/admin/login',{username:'prieon_auth',password:'class-odds-test'}),owner={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrfToken},source=require('../public/data/player-catalog')[0];
    const copy=await call('/api/admin/cards/bulk',{classId:'ICON',cardIds:[source.id]},owner);assert.equal(copy.status,200);
    const body={id:'class-hierarchy',name:'Hierarchy',price:10,published:true,classIds:['BASE','ICON'],classWeights:{BASE:75,ICON:25},classOvrWeights:{BASE:{[source.ovr]:100},ICON:{[source.ovr]:100}},weights:{},multipliers:{}};
    const preview=await call('/api/admin/packages/preview',body,owner);assert.equal(preview.status,200);near(preview.data.classOdds.find(c=>c.classId==='ICON').probability,.25);assert.equal(preview.data.classOvrOdds.length,2);assert.equal((await call('/api/admin/packages',body,owner)).status,200);const stored=(await call('/api/admin/catalog',undefined,owner)).data.packages.find(p=>p.id===body.id);assert.deepEqual(stored.classOvrWeights,body.classOvrWeights);
    const member=await call('/api/auth/register',{username:'hierarchytest',password:'test-password',profile:{club:'ARS'}}),user={Authorization:'Bearer '+member.data.token};const first=(await call('/api/shop/',undefined,user)).data.packs.find(p=>p.id===body.id);near(first.classOdds.find(c=>c.classId==='ICON').probability,.25);
    assert.equal((await call('/api/admin/packages',{...body,classWeights:{BASE:0,ICON:100}},owner)).status,200);
    assert.equal((await call('/api/shop/draw',{packId:body.id,count:1,requestId:crypto.randomUUID(),quote:first.quote},user)).status,409);
    const current=(await call('/api/shop/',undefined,user)).data.packs.find(p=>p.id===body.id),draw=await call('/api/shop/draw',{packId:body.id,count:1,requestId:crypto.randomUUID(),quote:current.quote},user);assert.equal(draw.status,200);assert.equal(draw.data.coins,1990);assert.deepEqual(draw.data.result.cardIds,copy.data.cardIds);
  }finally{await new Promise(r=>server.close(r));config.passwordHash=original;await db.close();}
});

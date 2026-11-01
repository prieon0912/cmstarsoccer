const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const previous=process.env.DATABASE_URL;delete process.env.DATABASE_URL;const db=require('../lib/db');if(previous!==undefined)process.env.DATABASE_URL=previous;
const designs=require('../public/data/class-designs'),classes=require('../public/data/card-classes'),econ=require('../lib/economy');
test('four complete designs validate and class copies preserve identity, hidden stats and footedness',()=>{
  assert.equal(Object.keys(designs).length,4);
  for(const [id,design] of Object.entries(designs)){
    const cls=econ.validateClass({...design,id:'CUSTOM',name:'테스트'});assert.equal(cls.reveal,id);assert.equal(cls.ink,design.ink);
    for(const field of ['cardArt','boardArt','slotArt'])assert.ok(fs.existsSync(path.join(__dirname,'../public',cls[field])));
  }
  const sources=require('../public/data/player-catalog').slice(0,3),copy=econ.classCopies({classId:'ICON',cardIds:sources.map(c=>c.id)},Object.values(classes),sources);
  assert.equal(copy.cards.length,3);assert.equal(copy.skipped,0);
  copy.cards.forEach((card,i)=>{assert.equal(card.playerId,sources[i].playerId);assert.deepEqual(card.roster.hid,sources[i].roster.hid);assert.deepEqual(card.roster.feet,sources[i].roster.feet);assert.deepEqual(card.roster.st,sources[i].roster.st);assert.equal(card.ovr,sources[i].ovr);});
  assert.equal(econ.classCopies({classId:'ICON',cardIds:sources.map(c=>c.id)},Object.values(classes),[...sources,...copy.cards]).skipped,3);
  const boost=econ.classCopies({classId:'BALLON_DOR',cardIds:[sources[0].id],ovrBoost:30,statBoost:30},Object.values(classes),sources).cards[0];assert.equal(boost.ovr,99);assert.ok(Object.values(boost.roster.st).every(v=>v<=.99));
  assert.throws(()=>econ.classCopies({classId:'BASE',cardIds:[sources[0].id]},Object.values(classes),sources));
  assert.throws(()=>econ.classCopies({classId:'ICON',cardIds:[sources[0].id,'unknown']},Object.values(classes),sources));
  assert.throws(()=>econ.validateClass({...classes.ICON,reveal:'bad-motion'}));
});
test('class bulk copy is authenticated, repeatable, and feeds a class-only package',async()=>{
  const {hashPassword}=require('../lib/password'),config=require('../lib/admin-bootstrap.json'),original=config.passwordHash;config.passwordHash=await hashPassword('local-class-admin');
  const auth=require('../lib/auth'),admin=require('../lib/admin'),shop=require('../lib/shop'),express=require('express');await auth.init();
  const app=express();app.use('/api/admin',admin.router);app.use('/api/shop',shop.router);app.use('/api',auth.router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(url,body,headers={})=>{const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),headers:r.headers};};
  try{
    const initial=await call('/api/shop/catalog');assert.ok(initial.data.classes.some(c=>c.id==='BALLON_DOR'));assert.ok(initial.data.classes.some(c=>c.id==='ICON'));assert.equal(initial.data.cards.length,720);
    const login=await call('/api/auth/login',{username:'prieon_auth',password:'local-class-admin'}),owner={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrfToken};
    const member=await call('/api/auth/register',{username:'classmember',password:'test-password',profile:{club:'ARS'}}),bearer={Authorization:'Bearer '+member.data.token};
    const source=initial.data.cards.filter(c=>c.clubId==='ARS').slice(0,3),body={classId:'BALLON_DOR',cardIds:source.map(c=>c.id)};
    assert.equal((await call('/api/admin/cards/bulk',body,bearer)).status,401);assert.equal((await call('/api/admin/cards/bulk',body,{Cookie:owner.Cookie})).status,403);
    const added=await call('/api/admin/cards/bulk',body,owner);assert.equal(added.status,200);assert.equal(added.data.created,3);
    const repeated=await call('/api/admin/cards/bulk',body,owner);assert.equal(repeated.data.created,0);assert.equal(repeated.data.skipped,3);
    const parallel=await Promise.all([call('/api/admin/cards/bulk',{...body,classId:'ICON'},owner),call('/api/admin/cards/bulk',{...body,classId:'ICON'},owner)]);assert.equal(parallel.reduce((n,r)=>n+r.data.created,0),3);
    const before=(await call('/api/shop/catalog')).data.cards.length;
    assert.equal((await call('/api/admin/cards/bulk',{...body,classId:'ICON',cardIds:[source[0].id,'unknown']},owner)).status,400);assert.equal((await call('/api/shop/catalog')).data.cards.length,before);
    const catalog=(await call('/api/shop/catalog')).data,icons=catalog.cards.filter(c=>c.classId==='ICON'),weights={};for(const c of icons)weights[c.ovr]=(weights[c.ovr]||0)+1;
    const pack={id:'icons-only',name:'ICON 테스트',classIds:['ICON'],price:100,weights,multipliers:{},published:true};assert.equal((await call('/api/admin/packages',pack,owner)).status,200);
    const available=(await call('/api/shop/',undefined,bearer)).data.packs[0];assert.equal(available.odds.length,3);assert.ok(available.odds.every(c=>c.classId==='ICON'));
    assert.equal(available.odds.reduce((sum,c)=>sum+c.probability,0),1);
  }finally{await new Promise(r=>server.close(r));config.passwordHash=original;await db.close();}
});
test('reveal can be skipped, restores focus, cancels timers and respects reduced motion',()=>{
  const timers=new Map(),layers=[];let n=0,finished=0,reduced=false,focused=0;
  const previousFocus={isConnected:true,focus(){focused++;}},document={activeElement:previousFocus,body:{appendChild(el){layers.push(el);}},createElement(){const buttons={};return {style:{setProperty(){}},setAttribute(){},appendChild(){},addEventListener(){},remove(){layers.splice(layers.indexOf(this),1);},querySelector(selector){if(!buttons[selector])buttons[selector]={hidden:selector==='.pr-continue',listeners:{},addEventListener(e,fn){this.listeners[e]=fn;},focus(){}};return buttons[selector];}};}};
  const context=vm.createContext({document,FL11_DESIGNS:designs,matchMedia:()=>({matches:reduced}),setTimeout:(fn,delay)=>{timers.set(++n,{fn,delay});return n;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/pack-reveal.js'),'utf8'),context);
  const play=()=>context.FL11PackReveal.play({classInfo:classes.ICON,card:{name:'Test',pos:'ST',ovr:94,club:{name:'Test'}},cardHTML:'<div>card</div>',onComplete:()=>finished++});
  const close=play();assert.equal(layers.length,1);
  const player=layers[0].querySelector('.pr-player');assert.equal(player.hidden,true);
  assert.equal(context.FL11PackReveal.timings.duration,9500);assert.equal(context.FL11PackReveal.timings.card,6000);
  const reveal=[...timers.values()].find(t=>t.delay===6000);assert.ok(reveal);assert.ok([...timers.values()].some(t=>t.delay===7500));assert.ok([...timers.values()].some(t=>t.delay===9500));
  reveal.fn();assert.equal(player.hidden,false);
  layers[0].querySelector('.pr-skip').listeners.click();close();assert.equal(finished,1);assert.equal(layers.length,0);assert.equal(timers.size,0);assert.equal(focused,1);
  play();play();assert.equal(finished,2);assert.equal(layers.length,1);reduced=true;play();assert.equal(finished,3);assert.ok(layers[0].className.includes('motion-reduced'));assert.ok([...timers.values()].some(t=>t.delay===900));
  [...timers.values()].find(t=>t.delay===900).fn();assert.equal(layers.length,0);assert.equal(timers.size,0);
});

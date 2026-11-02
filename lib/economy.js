const crypto=require('node:crypto');
const db=require('./db');
const seedCards=require('../public/data/player-catalog');
const seedClasses=require('../public/data/card-classes');
const designs=require('../public/data/class-designs');
let cached=null,until=0;
const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e;};
const number=(v,min,max,label)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)fail(label+' 값을 확인해 주세요.');return n;};
const text=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(label+' 값을 확인해 주세요.');return v.trim();};
async function init(){
  await db.seedCatalog(seedCards,Object.values(seedClasses));
  // Remove only the old automatic starter package; administrator-created packages remain.
  await db.removePackage('base-silver');invalidate();
}
function invalidate(){cached=null;until=0;}
function packagePeriod(pack,now=Date.now()){
  if(pack.startsAt&&now<Date.parse(pack.startsAt))return {state:'upcoming',message:'이용 시작 전이에요.'};
  if(pack.endsAt&&now>=Date.parse(pack.endsAt))return {state:'ended',message:'이용 기간이 끝났어요.'};
  return {state:'open',message:''};
}
async function catalog(){if(cached&&Date.now()<until)return cached;const [cards,classes,packages]=await Promise.all([db.listCards(),db.listClasses(),db.listPackages()]);cached={cards,classes,packages};until=Date.now()+5000;return cached;}
function compilePack(pack,cards){
  if(pack.classWeights!=null){
    const classBuckets=[];for(const classId of pack.classIds){const weight=pack.classWeights[classId]||0;if(!(weight>0))continue;
      try{classBuckets.push({classId,weight,compiled:compilePack({...pack,classWeights:undefined,classIds:[classId],weights:pack.classOvrWeights?.[classId]||pack.weights},cards)});}catch(e){fail(classId+' 클래스: '+e.message);}
    }
    const total=classBuckets.reduce((n,c)=>n+c.weight,0);if(!total)fail('클래스 확률을 하나 이상 설정해 주세요.');
    const odds=classBuckets.flatMap(c=>c.compiled.odds.map(o=>({...o,probability:c.weight/total*o.probability})));
    const ovrTotals=new Map();for(const o of odds)ovrTotals.set(o.ovr,(ovrTotals.get(o.ovr)||0)+o.probability);
    const quote=crypto.createHash('sha256').update(JSON.stringify({pack,odds})).digest('hex');
    return {classBuckets,total,odds,quote,ovrOdds:[...ovrTotals].map(([ovr,probability])=>({ovr,probability})),...probabilitySummary(pack.classIds,odds)};
  }
  const groups=new Map(),selected=cards.filter(c=>c.active!==false&&pack.classIds.includes(c.classId));
  for(const c of selected){const m=Number(pack.multipliers[c.id]??1);if(!(m>0))continue;if(!groups.has(c.ovr))groups.set(c.ovr,[]);groups.get(c.ovr).push({card:c,weight:m});}
  const buckets=[];for(const [ovr,w] of Object.entries(pack.weights)){if(!(w>0))continue;const list=groups.get(+ovr);if(!list||!list.length)fail('OVR '+ovr+'에 뽑을 수 있는 선수가 없어요.');buckets.push({ovr:+ovr,weight:w,list,total:list.reduce((n,c)=>n+c.weight,0)});}
  const total=buckets.reduce((n,b)=>n+b.weight,0);if(!total)fail('확률이 설정된 선수가 없어요.');
  const odds=buckets.flatMap(b=>b.list.map(c=>({cardId:c.card.id,name:c.card.name,classId:c.card.classId,clubId:c.card.clubId,ovr:b.ovr,multiplier:c.weight,probability:b.weight/total*c.weight/b.total})));
  const quote=crypto.createHash('sha256').update(JSON.stringify({pack,odds})).digest('hex');
  return {buckets,total,odds,quote,ovrOdds:buckets.map(b=>({ovr:b.ovr,probability:b.weight/total})),...probabilitySummary(pack.classIds,odds)};
}
function probabilitySummary(classIds,odds){
  const classOdds=classIds.map(classId=>({classId,probability:odds.filter(o=>o.classId===classId).reduce((n,o)=>n+o.probability,0)}));
  const classOvrOdds=classOdds.flatMap(c=>{const values=new Map();for(const o of odds)if(o.classId===c.classId)values.set(o.ovr,(values.get(o.ovr)||0)+o.probability);return [...values].map(([ovr,overallProbability])=>({classId:c.classId,ovr,probability:c.probability?overallProbability/c.probability:0,overallProbability}));});
  return {classOdds,classOvrOdds};
}
function weighted(items,total){let n=crypto.randomInt(0,281474976710655)/281474976710655*total;for(const item of items){n-=item.weight;if(n<0)return item;}return items[items.length-1];}
function draw(compiled,count){return Array.from({length:count},()=>{const layer=compiled.classBuckets?weighted(compiled.classBuckets,compiled.total).compiled:compiled,b=weighted(layer.buckets,layer.total);return weighted(b.list,b.total).card.id;});}
function starterIds(profile){
  const clubs=new Set(seedCards.map(c=>c.clubId)),counts=new Map();
  for(const id of Array.isArray(profile?.team?.cards)?profile.team.cards:[]){const key=String(id).split('|')[0];if(clubs.has(key))counts.set(key,(counts.get(key)||0)+1);}
  const club=clubs.has(profile?.club)?profile.club:[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'ARS';
  return seedCards.filter(c=>c.clubId===club).map(c=>c.id);
}
function validateProfile(data,owned){
  const clean={...data};for(const k of ['coins','inventory','owned','wallet','_revision','_pending','srv'])delete clean[k];
  const seen=new Set(),allowed=new Set(owned),lookup=new Map((cached?.cards||seedCards).map(c=>[c.id,c]));
  if(clean.team?.cards){if(!Array.isArray(clean.team.cards)||clean.team.cards.length!==11)fail('선발은 11명이어야 해요.');}
  if(clean.team?.bench&&(!Array.isArray(clean.team.bench)||clean.team.bench.length>9))fail('교체 명단을 확인해 주세요.');
  for(const id of [...(clean.team?.cards||[]),...(clean.team?.bench||[])]){const c=lookup.get(id);if(!allowed.has(id)||!c||seen.has(c.playerId))fail('보유한 선수만 중복 없이 편성할 수 있어요.');seen.add(c.playerId);}
  return clean;
}
async function state(userId,profile){await db.ensureEconomy(userId,starterIds(profile));return db.economyState(userId);}
async function decorate(userId,profile){if(!profile)return null;const s=await state(userId,profile);return {...profile,...s};}
function validateClass(input){
  const id=text(input.id,16,'클래스 ID');if(!/^[A-Z][A-Z0-9_]*$/.test(id))fail('클래스 ID는 대문자·숫자·_로 지정해 주세요.');
  const asset=v=>{if(!v)return '';if(!/^\/assets\/[A-Za-z0-9_./-]+$/.test(v)||v.includes('..'))fail('이미지 경로는 /assets/ 아래 파일로 지정해 주세요.');return v;};
  const accent=input.accent||'#dce3eb';if(!/^#[0-9a-fA-F]{6}$/.test(accent))fail('색상은 #RRGGBB 형식이에요.');
  const ink=input.ink||'#1b222c';if(!/^#[0-9a-fA-F]{6}$/.test(ink))fail('글자 색상은 #RRGGBB 형식이에요.');
  const reveal=input.reveal||'silver',design=input.design||'custom';if(!['silver',...Object.keys(designs)].includes(reveal)||!['custom',...Object.keys(designs)].includes(design))fail('디자인과 뽑기 연출을 선택해 주세요.');
  if(!['hex','shield','rect'].includes(input.shape))fail('카드 형태를 선택해 주세요.');
  return {id,name:text(input.name,24,'클래스 이름'),accent,ink,design,reveal,shape:input.shape,cardArt:asset(input.cardArt),boardArt:asset(input.boardArt),slotArt:asset(input.slotArt),boardName:text(input.boardName||input.name,40,'연출 타이틀')};
}
function classCopies(input,classes,cards){
  const target=classes.find(c=>c.id===input.classId);if(!target||target.id==='BASE')fail('대상 클래스를 선택해 주세요.');
  if(!Array.isArray(input.cardIds)||!input.cardIds.length||input.cardIds.length>1000||input.cardIds.some(id=>typeof id!=='string'))fail('추가할 카드를 1~1,000장 선택해 주세요.');
  const ovrBoost=number(input.ovrBoost??0,-30,30,'OVR 조정'),statBoost=number(input.statBoost??0,-30,30,'능력치 조정');if(!Number.isInteger(ovrBoost)||!Number.isInteger(statBoost))fail('조정 수치는 정수예요.');
  const lookup=new Map(cards.map(c=>[c.id,c])),existing=new Set(cards.filter(c=>c.classId===target.id).map(c=>c.playerId)),created=[];let skipped=0;
  for(const id of new Set(input.cardIds)){
    const source=lookup.get(id);if(!source||source.active===false)fail('추가할 원본 카드를 확인해 주세요.');
    if(existing.has(source.playerId)){skipped++;continue;}existing.add(source.playerId);
    const st=Object.fromEntries(Object.entries(source.roster.st).map(([k,v])=>[k,Math.max(.01,Math.min(.99,Math.round((v*100+statBoost)*100)/10000))]));
    const copy=validateCard({...source,id:undefined,classId:target.id,ovr:Math.max(1,Math.min(99,source.ovr+ovrBoost)),roster:{...source.roster,st}},classes,null);
    copy.id=target.id+'|'+crypto.createHash('sha256').update(source.playerId).digest('hex').slice(0,24);
    for(const key of ['phase','skin','hair','boot'])copy.roster[key]=source.roster[key]||0;
    created.push(copy);
  }
  return {cards:created,skipped};
}
function validateCard(input,classes,existing){
  const classId=text(input.classId,16,'클래스');if(!classes.some(c=>c.id===classId))fail('등록된 클래스를 선택해 주세요.');
  const clubIndex=number(input.clubIndex,0,35,'구단');if(!Number.isInteger(clubIndex))fail('구단을 선택해 주세요.');
  const base=seedCards.find(c=>c.clubIndex===clubIndex);if(!base)fail('구단을 확인해 주세요.');
  const r=input.roster||{},st={},hid=r.hid||{},feet=r.feet||{};
  for(const key of ['pace','shoot','pass','drib','tackle','phy'])st[key]=number(r.st?.[key],.01,.99,key);
  const hidden={};for(const key of ['att','def','roam','focus','read']){hidden[key]=number(hid[key],0,2,key);if(!Number.isInteger(hidden[key]))fail('히든 단계는 0~2예요.');}
  if(!['runner','link','bal'].includes(hid.run)||!['aggr','contain'].includes(hid.press))fail('히든 성향을 선택해 주세요.');Object.assign(hidden,{run:hid.run,press:hid.press});
  if(!['L','R'].includes(feet.foot))fail('주발을 선택해 주세요.');const wf=number(feet.wf,1,5,'약발'),stars=number(r.stars,1,5,'개인기');
  if(!Number.isInteger(wf)||!Number.isInteger(stars))fail('별 수는 정수로 입력해 주세요.');
  const pos=text(input.pos,4,'포지션'),nat=pos==='GK'?'GK':/^(CB|LB|RB|LWB|RWB)$/.test(pos)?'DF':/^(CM|CDM|CAM|LM|RM)$/.test(pos)?'MF':/^(ST|CF|LW|RW)$/.test(pos)?'FW':null;if(!nat)fail('포지션을 확인해 주세요.');
  const name=text(input.name,40,'이름'),ovr=number(input.ovr,1,99,'OVR'),num=number(r.num??9,0,99,'등번호');if(!Number.isInteger(ovr)||!Number.isInteger(num))fail('OVR·등번호는 정수로 입력해 주세요.');
  const id=existing?.id||classId+'|'+crypto.randomUUID(),playerId=text(input.playerId??existing?.playerId??id,120,'선수 식별자');
  return {id,playerId,classId,clubId:base.clubId,clubIndex,name,ovr,pos,starter:false,active:input.active!==false,roster:{...(existing?.roster||{}),k:0,name,num,nat,ovr,st,stars,hid:hidden,feet:{foot:feet.foot,wf,id:r.feet?.id||0},phase:existing?.roster?.phase||0,skin:existing?.roster?.skin||0,hair:existing?.roster?.hair||0,boot:existing?.roster?.boot||0}};
}
function validatePackage(input,classes,cards){
  const id=input.id?text(input.id,80,'패키지 ID'):crypto.randomUUID();if(!/^[A-Za-z0-9_-]+$/.test(id))fail('패키지 ID를 확인해 주세요.');
  const price=number(input.price,1,1000000,'가격');if(!Number.isInteger(price))fail('가격은 정수예요.');
  const classIds=Array.isArray(input.classIds)?[...new Set(input.classIds)]:[];if(!classIds.length||classIds.some(id=>!classes.some(c=>c.id===id)))fail('포함할 클래스를 선택해 주세요.');
  const weights={},multipliers={};for(const [k,v] of Object.entries(input.weights||{})){if(!/^\d{1,2}$/.test(k)||+k<1)fail('OVR은 1~99예요.');weights[k]=number(v,0,100000,'OVR 확률 비중');}
  const known=new Set(cards.map(c=>c.id));for(const [id,v] of Object.entries(input.multipliers||{})){if(!known.has(id))fail('특별 배율 선수를 확인해 주세요.');multipliers[id]=number(v,0,10000,'선수 배율');}
  const timestamp=(value,label)=>{if(value==null||value==='')return null;
    if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail(label+' 날짜와 시간을 확인해 주세요.');
    return new Date(value).toISOString();};
  const startsAt=timestamp(input.startsAt,'이용 시작'),endsAt=timestamp(input.endsAt,'이용 종료');
  if(startsAt&&endsAt&&Date.parse(startsAt)>=Date.parse(endsAt))fail('이용 종료는 시작보다 늦어야 해요.');
  const pack={id,name:text(input.name,60,'패키지 이름'),description:String(input.description||'').slice(0,240),price,classIds,weights,multipliers,published:input.published===true,startsAt,endsAt};
  if(input.classWeights!=null){
    const object=(v,label)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(label+' 설정을 확인해 주세요.');return v;};
    const classWeights=object(input.classWeights,'클래스 확률'),perClass=object(input.classOvrWeights||{},'클래스별 OVR');pack.classWeights={};pack.classOvrWeights={};
    for(const id of [...Object.keys(classWeights),...Object.keys(perClass)])if(!classIds.includes(id))fail('선택한 클래스의 확률만 입력해 주세요.');
    for(const id of classIds){pack.classWeights[id]=number(classWeights[id]??0,0,100000,'클래스 확률');const w=object(perClass[id]??input.weights??{},'클래스별 OVR');pack.classOvrWeights[id]={};for(const [k,v] of Object.entries(w)){if(!/^\d{1,2}$/.test(k)||+k<1)fail('OVR은 1~99예요.');pack.classOvrWeights[id][k]=number(v,0,100000,'클래스 내부 OVR 확률');}}
  }else if(input.classOvrWeights!=null)fail('클래스 확률도 함께 설정해 주세요.');
  compilePack(pack,cards);return pack;
}
module.exports={init,catalog,invalidate,compilePack,packagePeriod,draw,starterIds,validateProfile,state,decorate,validateCard,validateClass,validatePackage,classCopies,fail};

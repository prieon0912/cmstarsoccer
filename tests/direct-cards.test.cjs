const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const presets=require('../public/admin/ballon-presets'),classes=Object.values(require('../public/data/card-classes')),base=require('../public/data/player-catalog'),econ=require('../lib/economy');
test('all 17 proposed cards validate without any source card and retain their individual stats',()=>{
  assert.equal(presets.length,17);assert.equal(new Set(presets.map(p=>p.id)).size,17);
  for(const p of presets){const club=base.find(c=>c.clubId===p.clubId);const card=econ.validateCard({name:p.name,classId:'BALLON_DOR',clubIndex:club?.clubIndex??0,pos:p.pos,ovr:p.ovr,roster:{num:p.num,stars:p.stars,st:Object.fromEntries(Object.entries(p.st).map(([k,v])=>[k,v/100])),hid:p.hid,feet:{foot:p.foot,wf:p.wf}}},classes,null);assert.equal(card.ovr,p.ovr);assert.deepEqual(card.roster.hid,p.hid);assert.equal(card.roster.st.shoot,p.st.shoot/100);assert.equal(card.roster.feet.wf,p.wf);}
});

test('editing an existing player identity applies the requested ID while preserving card identity and attributes',()=>{
  const p=presets.find(p=>p.id==='modric'),club=base.find(c=>c.clubId===p.clubId);
  const input={name:'루카 모드리치',classId:'BALLON_DOR',clubIndex:club.clubIndex,pos:p.pos,ovr:p.ovr,playerId:'old-modric-id',roster:{num:p.num,stars:p.stars,st:Object.fromEntries(Object.entries(p.st).map(([k,v])=>[k,v/100])),hid:p.hid,feet:{foot:p.foot,wf:p.wf}}};
  const existing=econ.validateCard(input,classes,null),updated=econ.validateCard({...input,playerId:'MIL|모드리치'},classes,existing);
  assert.equal(updated.playerId,'MIL|모드리치');assert.equal(updated.id,existing.id);assert.equal(updated.ovr,existing.ovr);assert.deepEqual(updated.roster,existing.roster);
  const omitted={...input};delete omitted.playerId;assert.equal(econ.validateCard(omitted,classes,updated).playerId,'MIL|모드리치');
  assert.throws(()=>econ.validateCard({...input,playerId:''},classes,updated),/식별자/);
  assert.equal(existing.playerId,'old-modric-id'); // no mutation of the original or unrelated cards
});

test('pack multiplier selector includes late ICON additions and supports class/name filtering without truncation',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../public/admin/manage.js'),'utf8'),a=code.indexOf('  function multOptions(){'),b=code.indexOf('  function renderMults()',a),elements={multSearch:{value:''},multClass:{value:''},multCard:{value:''}};
  let options=[];Object.defineProperty(elements.multCard,'innerHTML',{set(html){options=[...html.matchAll(/<option value="([^"]+)">([^<]*)<\/option>/g)];this.value=options[0]?.[1]||'';}});
  const cards=Array.from({length:720},(_,i)=>({id:'BASE|'+i,classId:'BASE',name:'베이스 '+i,clubId:'ARS',ovr:80})).concat(Array.from({length:107},(_,i)=>({id:'ICON|'+i,classId:'ICON',name:i<2?'크리스티아누 호날두':'아이콘 '+i,clubId:i?'RMA':'MUN',ovr:90,active:true})));
  const ctx=vm.createContext({catalog:{cards},$:id=>elements[id],esc:String});vm.runInContext(code.slice(a,b),ctx);vm.runInContext('multOptions()',ctx);assert.equal(options.length,827);assert.ok(options.some(x=>x[1]==='ICON|106'));
  elements.multClass.value='ICON';vm.runInContext('multOptions()',ctx);assert.equal(options.length,107);elements.multSearch.value='크리스티아누호날두';vm.runInContext('multOptions()',ctx);assert.equal(options.length,2);assert.ok(options.some(x=>x[2].includes('MUN')));assert.ok(options.some(x=>x[2].includes('RMA')));elements.multCard.value='ICON|1';vm.runInContext('multOptions()',ctx);assert.equal(elements.multCard.value,'ICON|1');
});
test('class add opens editable new-card form; edited preset values save and next card keeps the class',async()=>{
  const elements={},events={},saved=[];const catalog={classes,cards:[...base],packages:[]};
  function element(id){return elements[id]??=( {value:'',hidden:false,required:false,listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;},scrollIntoView(){},checkValidity(){return !this.required||String(this.value)!=='';},reportValidity(){},querySelectorAll(){return Object.values(elements).filter(e=>e.isInput);}});}
  Object.defineProperty(element('editor'),'innerHTML',{set(html){this.html=html;for(const e of Object.values(elements))e.isInput=false;for(const m of html.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)){const e=element(m[1]);e.value=m[2];e.isInput=true;}for(const m of html.matchAll(/<select id="([^"]+)">([\s\S]*?)<\/select>/g)){const options=[...m[2].matchAll(/<option value="([^"]*)"\s*(selected)?/g)];const e=element(m[1]);e.value=(options.find(o=>o[2])||options[0])?.[1]||'';e.isInput=true;}}});
  const document={getElementById:element,querySelectorAll:()=>[],addEventListener(type,fn){events[type]=fn;}};
  const context=vm.createContext({document,FL11_BALLON_PRESETS:presets,setTimeout,clearTimeout,URLSearchParams,fetch:async(url,options)=>{let data=catalog;if(url.endsWith('/cards')){const body=JSON.parse(options.body),card=econ.validateCard(body,classes,null);saved.push(body);catalog.cards.push(card);data={card};}return {ok:true,status:200,json:async()=>data};}});
  let code=fs.readFileSync(path.join(__dirname,'../public/admin/manage.js'),'utf8');code=code.replace("dashboard().catch(()=>{loginView();message('관리자 계정으로 로그인해 주세요.');});","globalThis.adminTest={init(v){catalog=v;},cardEditor,save};");vm.runInContext(code,context);context.adminTest.init(catalog);
  await events.click({target:{closest:()=>({dataset:{newCardClass:'BALLON_DOR'},hasAttribute:()=>false})}});
  assert.equal(element('classId').value,'BALLON_DOR');assert.ok(!element('editor').html.includes('원본 클래스'));assert.ok(!element('editor').html.includes('0이면 유지'));
  element('ballonPreset').value='kane';element('ballonPreset').listeners.change();
  assert.equal(element('playerId').value,base.find(c=>c.name==='케인').playerId);
  element('name').value='케인 특별 카드';element('st_pace').value='91';element('h_att').value='1';element('wf').value='4';
  await context.adminTest.save(true);assert.equal(saved.length,1);assert.equal(saved[0].roster.st.pace,.91);assert.equal(saved[0].roster.hid.att,1);assert.equal(saved[0].roster.feet.wf,4);assert.equal(saved[0].classId,'BALLON_DOR');assert.equal(element('classId').value,'BALLON_DOR');assert.equal(element('name').value,'');
  element('ballonPreset').value='yashin';element('ballonPreset').listeners.change();assert.equal(element('clubIndex').value,'');await assert.rejects(context.adminTest.save(),/입력값/);assert.equal(saved.length,1);
});

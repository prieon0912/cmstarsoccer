const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.argv[2] || require('node:path').join(__dirname,'../public/index.html'), 'utf8');
const between = (a,b) => html.slice(html.indexOf(a), html.indexOf(b,html.indexOf(a)));
new vm.Script(between('<script>','</script>').slice('<script>'.length));
const store = new Map(), elements = new Map();
const $ = id => {if(!elements.has(id)) elements.set(id,{value:'',hidden:true,addEventListener(){}});return elements.get(id);};
const context = vm.createContext({assert,console,$,setTimeout,clearTimeout,addEventListener(){},
  localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}});
vm.runInContext([
  between('const PI=', '/* ================= renderer & scene'),
  'const SKINS=Array(5),HAIRS=Array(6),BOOTS=Array(6);const G={set:{},state:"menu"};',
  between('function makeRoster(ci)', 'const LV='),
  between('function crestHTML(c,big)', "$('pickMineC').addEventListener"),
  between('const AUTH=', 'async function authLogout()'),
  between('const esc=', 'function tmSlots()'),
  between('function cardHTML(cd', 'const accCode='),
  'function renderTmBody(){} function renderTeam(){} function tmAuthLine(){}',
].join('\n'),context);
(async()=>{
await vm.runInContext(`(async()=>{
  for(let ci=0;ci<CLUBS.length;ci++){
    const p=newProfile('test',ci), own=ownedCards(p);
    assert.equal(own.length,20); assert.equal(p.team.cards.length,11);assert.equal(p.team.bench.length,7);
    assert.ok(own.every(cd=>cd.ci===ci));
    assert.equal(new Set([...p.team.cards,...p.team.bench]).size,18);
    // Export must remove foreign cards, even when a saved/imported team contains them.
    p.team.cards=CLUBS[(ci+1)%CLUBS.length].xi.map(x=>CLUBS[(ci+1)%CLUBS.length].id+'|'+x[0]);
    assert.ok(profOut(p).team.cards.every(id=>cardById(id).ci===ci));
  }
  // A pre-existing local account must not override the registration club.
  ACC.list.local=newProfile('local',0); ACC.cur='local';
  $('authU').value='tester';$('authP').value='password';$('authC').value='20';
  let sent;
  api=async(path,opt)=>{assert.equal(path,'/auth/register');sent=opt.body;return {token:'test',user:{username:'tester'},profile:sent.profile};};
  await authDo('register');
  assert.equal(sent.profile.club,CLUBS[20].id); assert.equal(prof().club,CLUBS[20].id);
  assert.equal(ownedCards(prof()).length,20);
  assert.ok([...prof().team.cards,...prof().team.bench].every(id=>cardById(id).ci===20));
  assert.equal(ACC.list.local.club,CLUBS[0].id);
  // Legacy server profiles with foreign players are repaired before caching.
  srvAdopt('legacy',{club:CLUBS[20].id,team:newProfile('old',0).team});
  assert.ok(JSON.parse(lsGet('fl11-acc')).list['@legacy'].team.cards.every(id=>cardById(id).ci===20));
  ACC.cur='local';AUTH.token=null;AUTH.user=null;AUTH.dirty=false;clearTimeout(AUTH.timer);applyProfile();
  for(let ci=0;ci<CLUBS.length;ci++){
    newSeason(ci,false);
    assert.equal(lgHome(),ci);assert.equal(lgClub(ci).id,CLUBS[ci].id);
    const teams=new Set(LG.s.fx[0].flat());assert.equal(teams.size,20);assert.ok(teams.has(ci));
    const pairs=new Set();
    for(let md=0;md<38;md++){
      const round=LG.s.fx[md]; assert.equal(round.length,10);assert.equal(new Set(round.flat()).size,20);
      assert.ok(round.flat().every(i=>teams.has(i)));assert.ok(userFixture(md));
      for(const [h,a] of round){assert.notEqual(h,a);const key=h+':'+a;assert.ok(!pairs.has(key));pairs.add(key);}
    }
    assert.equal(pairs.size,380);
    // Both manually recorded fixtures and simulated rounds must count for the selected side.
    const f=userFixture(0);recordResult(0,f.h,f.a,2,1,[{ci,name:CLUBS[ci].xi[9][0]}]);finishRound();
    assert.equal(leagueTable().find(r=>r.i===ci).p,1);
    LG.s=null;lgLoad();assert.equal(LG.s.club,ci);assert.equal(LG.s.md,1);
    while(LG.s.md<38)finishRound();
    assert.ok(leagueTable().every(r=>r.p===38));assert.equal(leagueTable().length,20);
    newSeason(ci,true);assert.equal(lgHome(),100);assert.equal(lgClub(ci),CUSTOM[0]);
  }
  LG.s={v:2,club:0,custom:false,md:0,fx:makeFixtures(42),res:{},goals:{}};lgSave();LG.s=null;lgLoad();
  assert.equal(LG.s.club,0);assert.equal(leagueTable().length,20);
  pickMine=false;renderPick(false);
  assert.equal(($('pickGrid').innerHTML.match(/data-i=/g)||[]).length,CLUBS.length);
  // Preserve a pending new-class lineup before its dynamic catalog arrives.
  const variantProfile=newProfile('class test',0),original=cardById('ARS|사카'),variantId='TEST|saka';
  variantProfile.srv=true;variantProfile._pending=true;variantProfile.inventory=ownedCards(variantProfile).map(c=>({cardId:c.id,quantity:1}));
  variantProfile.inventory.push({cardId:variantId,quantity:1});
  const originalSlot=variantProfile.team.cards.indexOf(original.id);assert.ok(originalSlot>=0);
  variantProfile.team.cards[originalSlot]=variantId;ACC.list.classTest=variantProfile;ACC.cur='classTest';
  LIVE_CATALOG_READY=false;applyProfile();assert.equal(variantProfile.team.cards[originalSlot],variantId);
  CARD_CLASSES.TEST={id:'TEST',name:'Test class',accent:'#123456',shape:'shield',cardArt:'/assets/test-card.svg',slotArt:'/assets/test-slot.svg',boardName:'TEST'};
  const variantMeta={id:variantId,playerId:original.playerId,classId:'TEST',clubId:'ARS',clubIndex:0,name:original.name,ovr:99,pos:original.pos,roster:{...cardRoster(original),ovr:99}};
  LIVE_CATALOG.push(variantMeta);LIVE_MAP.set(variantId,variantMeta);LIVE_CATALOG_READY=true;CARDS=null;CARD_MAP=null;
  applyProfile();assert.equal(variantProfile.team.cards[originalSlot],variantId);assert.ok(ownedCards(variantProfile).some(c=>c.id===variantId));
  const duplicateSpec=cleanSpec({...variantProfile.team,bench:[original.id,...variantProfile.team.bench]},0,cardAllowance(variantProfile));
  assert.ok(duplicateSpec.cards.includes(variantId));assert.ok(!duplicateSpec.bench.includes(original.id));
  const variantHTML=cardHTML(cardById(variantId),{tag:'div'});assert.ok(variantHTML.includes('shape-shield'));assert.ok(variantHTML.includes('/assets/test-card.svg'));assert.ok(variantHTML.includes('Test class'));
  // a "기타" card (club not in the game) is shown with a neutral club and removes the single-club bonus
  const otherId='ICON|other-club',otherMeta={id:otherId,playerId:'other:1',classId:'TEST',clubId:'ETC',clubIndex:-1,clubName:'갈라타사라이',name:'기타 선수',ovr:90,pos:original.pos,roster:{...cardRoster(original),ovr:90}};
  LIVE_CATALOG.push(otherMeta);LIVE_MAP.set(otherId,otherMeta);CARDS=null;CARD_MAP=null;
  const otherCard=cardById(otherId);assert.equal(otherCard.ci,-1);assert.equal(otherCard.club.id,'ETC');assert.equal(otherCard.club.name,'기타 · 갈라타사라이');
  const arsXI=CLUBS[0].xi.map(p=>'ARS|'+p[0]);assert.equal(singleClub(arsXI),0);
  assert.equal(singleClub([...arsXI.slice(0,10),otherId]),-1);assert.equal(singleClub(Array(11).fill(otherId)),-1);
  assert.ok(cardHTML(otherCard,{tag:'div'}).includes('ETC'));
  console.log('PASS: full script syntax; 36 clubs × 20 owned cards; registration with existing local profile; foreign-card cleanup; all 36 clubs × 38 league rounds, results, reload, custom mode; legacy season; selection UI.');
})()`,context);
})().catch(e=>{console.error(e);process.exitCode=1;});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
function part(a,b){const i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i,a);return source.slice(i,j);}
function context(code='',speed=0.9){const ctx=vm.createContext({assert,console});vm.runInContext(part('const PI=','function seeded').replace('const PLAYER_SPEED=0.9;','const PLAYER_SPEED='+speed+';')+part('const ACT=','// skill moves:')+`const G={t:10,clock:20,half:1,state:'play',stats:[{skill:0},{}],ents:[]},B={x:0,z:0,y:BR,vx:0,vz:0,vy:0,lastTeam:0,spin:0},PADS=[null,null];const STEP=1/60,padOf=t=>PADS[t.i];const oppOf=t=>t.opp;function say(){}const AU={excite(){}},sfx={kick(){}};`+code,ctx);return ctx;}
test('a half continues through passes and deflections, ends on controlled turnover, and caps at game-clock +5',()=>{
  const ctx=context(`let halves=0,fulls=0;function halfTime(){halves++;G.state='half';}function fullTime(){fulls++;G.state='full';}`+part('function periodEndStep()','function halfTime()'));
  vm.runInContext(`for(const half of [1,2]){G.half=half;const limit=half===1?45:90;G.state='play';G.clock=limit-.1;B.owner={team:{i:0}};periodEndStep();G.clock=limit+.1;assert.equal(periodEndStep(),false);B.owner=null;B.lastTeam=1;assert.equal(periodEndStep(),false);B.owner={team:{i:1}};assert.equal(periodEndStep(),true);
    G.state='play';G.stoppage=null;G.periodPoss=0;B.owner={team:{i:0}};G.clock=limit+4.99;assert.equal(periodEndStep(),false);G.clock=limit+5.01;assert.equal(periodEndStep(),true);assert.equal(G.clock,limit+5);
  }
  G.half=2;G.clock=91;G.state='out';G.stoppage={half:2,team:0,ended:false};G.pending={ti:0};B.owner=null;assert.equal(periodEndStep(),false);G.pending.ti=1;assert.equal(periodEndStep(),true);
  G.state='play';G.stoppage={half:2,team:0,ended:false};B.owner={team:{i:0}};assert.equal(periodEndStep(),false); // stale restart data must not end live play
  G.state='goal';assert.equal(periodEndStep(),false);assert.equal(G.stoppage.ended,true);G.state='play';assert.equal(periodEndStep(),true);
  `,ctx);
});
test('body dimensions and contact distances leave realistic space; movement faces travel and agility controls turning',()=>{
  const ctx=context(part('function movementAgility(e)','function moveEnt(e,dt)'));
  vm.runInContext(`assert.equal(HL*2,105);assert.equal(HW*2,68);assert.equal(CONTACT.body,.6);assert.equal(CROQUETA_RANGE,.9);
  function turn(q){const e={face:0,vx:0,vz:8,mx:9,mz:0,vmax:9,stamina:1,st:{drib:q,pace:q},act:0};let arrived=0;for(let i=0;i<120;i++){locomote(e,1/60);faceUpdate(e,1/60,hyp(e.vx,e.vz));assert.ok(Math.abs(e.vx*Math.cos(e.face)-e.vz*Math.sin(e.face))<1e-9);assert.ok(e.vx*Math.sin(e.face)+e.vz*Math.cos(e.face)>=0);if(!arrived&&Math.abs(angD(e.face,PI/2))<.08)arrived=i+1;}return arrived;}assert.ok(turn(.99)<turn(.4));assert.ok(turn(.99)>1);
  `,ctx);
});
test('loose-ball chasing runs through the former walking zone and only slows inside collection distance',()=>{
  const ctx=context(part('function chaseBall(e)','function think(e,dt)'));
  vm.runInContext(`const e={x:0,z:0,vmax:9,stamina:1};B.z=3;chaseBall(e);assert.ok(hyp(e.mx,e.mz)>8);assert.equal(e.sprint,true);B.z=1.4;chaseBall(e);assert.ok(e.mz>8);B.z=.6;chaseBall(e);assert.ok(e.mz<6);B.z=4;B.vz=7;chaseBall(e);assert.equal(e.sprint,true);assert.ok(e.mz>8);`,ctx);
});
test('dribbling keeps the ball in front at 30, 60 and 120 Hz, including shot preparation',()=>{
  const ctx=context(part('function skillBall(o)','/* ================= AI')+part('function updateBall(dt)','function checkRules()'));
  vm.runInContext(`for(const hz of [30,60,120]){const e={x:0,z:0,vx:8,vz:0,face:PI/2,speed:8,phase:0,sprint:true,act:0};B.owner=e;B.x=.6;B.z=0;for(let i=0;i<hz*2;i++){e.x+=8/hz;e.phase+=.1;e.kick=i>hz?{}:null;updateBall(1/hz);assert.ok(B.x-e.x>=.499999);assert.ok(Number.isFinite(B.vx));}}`,ctx);
});
test('knock-on launches from the forward foot without braking to a walk or rewinding the ball',()=>{
  const ctx=context(part('const SKILLS=','// a player short of stars')+part('const easeOut=','const fadeW=')+part('function kickBall(p,','/* ================= actions')+part('function skillStep(e,dt)','/* ================= AI'));
  vm.runInContext(`const t={i:0},e={x:0,z:0,vx:0,vz:8,face:0,vmax:9,actT:.08,sk:{id:4,dir:0,f0:0,v0:8,launched:false},team:t};B.owner=e;B.x=0;B.z=.7;skillStep(e,1/60);assert.equal(B.owner,null);assert.ok(B.z-e.z>=.55);assert.ok(B.vz>10);assert.ok(e.vz>=8);assert.equal(B.target.r,e);`,ctx);
});
test('special-move wrong-foot probability and recovery reflect dribbling, defending and agility',()=>{
  const ctx=context(part('function movementAgility(e)','function locomote(e,dt)')+part('function skillBeat(c,','// the body\'s path'));
  vm.runInContext(`Math.random=()=>.5;const d={x:0,z:2,off:false,stun:0,act:0,st:{tackle:.55,drib:.5,pace:.5},stamina:1,tackleCd:0},t={i:0,opp:{players:[d]}},c={x:0,z:0,team:t,sk:{f0:0},st:{drib:.99},stars:3};skillBeat(c,3,0,.6,0);assert.ok(d.stun>.6);d.stun=0;d.st.tackle=.99;c.st.drib=.5;skillBeat(c,3,0,.6,0);assert.equal(d.stun,0);
  Math.random=()=>.01;c.st.drib=.85;d.st.tackle=.75;d.st.drib=d.st.pace=.4;skillBeat(c,3,0,.6,0);const slow=d.stun;d.stun=0;d.st.drib=d.st.pace=.99;skillBeat(c,3,0,.6,0);assert.ok(d.stun<slow);`,ctx);
});
test('standing tackles retain ordinary strength but ease off during shot windup and just after a duel win',()=>{
  const ctx=context(`let attempts=0;function tryTackle(){attempts++;}`+part('function standTackles(t,dt)','/* physical duels */'));
  vm.runInContext(`const team={i:1,dir:-1,human:true,players:[]},c={x:0,z:0,face:0,team:{i:0},act:0},d={x:0,z:1.7,face:PI,st:{tackle:.8},hid:{press:'aggr',read:1},act:0,stun:0,tackleCd:0};team.players=[d];B.owner=c;B.z=.7;B.held=false;function count(wind){attempts=0;c.kick=wind?{}:null;for(let i=0;i<1000;i++){d.tackleCd=0;Math.random=()=>i/1000;standTackles(team,1/60);}return attempts;}const plain=count(false),shot=count(true);assert.ok(plain>0&&shot<plain*.5);c.duelGuardUntil=G.t+.55;assert.ok(count(false)<plain*.35);G.t+=.56;assert.equal(count(false),plain);d.z=2.6;assert.equal(count(false),0);`,ctx);
});
test('ordinary cursor cuts leave a short reaction delay while high defending recovers sooner',()=>{
  const ctx=context(part('function trackMove(e,','// going for a loose ball:'));
  vm.runInContext(`const c={x:0,z:1,vx:0,vz:7,st:{drib:.95}},d={x:0,z:0,vmax:9,stamina:1,team:{i:1},st:{tackle:.5}};trackMove(d,0,2,c);const first=d.trackRead.next-G.t;c.vz=-7;G.t+=.05;trackMove(d,0,-2,c);assert.ok(d.mz>0);G.t=10+first+.01;trackMove(d,0,-2,c);assert.ok(d.mz>0);G.t=d.trackRead.next+.01;trackMove(d,0,-2,c);assert.ok(d.mz<0);d.trackRead=null;d.st.tackle=.99;trackMove(d,0,-2,c);assert.ok(d.trackRead.next-G.t<first);`,ctx);
});

test('a contested loose-ball winner receives a short recovery window even on a teammate pass',()=>{
  const ctx=context(part('function fiftyFifty(best,reach)','/* skill moves */'));
  vm.runInContext(`const team={i:0,players:[]},other={i:1,players:[]};team.opp=other;other.opp=team;const e={team,x:.2,z:0,st:{phy:1,pace:.9},cool:0,stun:0,act:0},o={team:other,x:.7,z:0,st:{phy:.3,pace:.4},cool:0,stun:0,act:0};team.players=[e];other.players=[o];B.y=BR;B.x=B.z=0;B.lastTeam=0;Math.random=()=>.5;assert.equal(fiftyFifty(e,1),e);assert.equal(e.duelWonAt,G.t);assert.ok(e.duelGuardUntil>G.t+.5);`,ctx);
});
function tacticsContext(extra=''){return context(part('const PI=','/* ================= renderer & scene').replace(part('const PI=','function seeded'),'').replace(part('const ACT=','// skill moves:'),'')+part('function toW(t,','function carrierThink(e,dt)')+'function ownGoalX(t){return-t.dir*HL;}'+extra);}

test('attacking support is free to overlap, advance and change lanes again',()=>{
  const ctx=tacticsContext();
  vm.runInContext(`for(const dir of [-1,1]){const t={i:0,dir,inPoss:true,ment:0,lastLine:.92,players:[]},o={i:1,players:[]};t.opp=o;o.opp=t;B.x=dir*40;B.z=-dir*20;B.owner={team:t,x:B.x,z:B.z};const midfielder={team:t,k:6,role:'MF',lbl:'CM',base:[-.3,.3],run:0};const [x,z]=supportSpot(midfielder);assert.ok(x*dir>HL*.65);assert.ok(Math.abs(z-midfielder.base[1]*HW*dir)>6);const fullback={team:t,k:2,role:'DF',lbl:'LB',base:[-.6,-.7],run:0};const p=supportSpot(fullback);assert.ok(p[0]*dir>HL*.57);}
  assert.equal(typeof formationLane,'undefined');`,ctx);
});

test('the default defensive block sits near the penalty-area edge in every formation and direction',()=>{
  const ctx=tacticsContext();
  vm.runInContext(`for(const dir of [-1,1])for(const slots of Object.values(FORMS)){const t={i:0,dir,ment:0,inPoss:false,players:[],lastLine:.7},o={i:1,dir:-dir,players:[]};t.opp=o;o.opp=t;for(const [k,f] of slots.entries())t.players.push({team:t,k,role:f.r,lbl:f.l,base:f.p,isGK:k===0,x:(-HL+(k===0?1.5:18))*dir,z:f.p[1]*HW*dir,stun:0,act:0,wide:/^[LR]/.test(f.l),hid:{att:1,def:1},run:0});const c={team:o,x:0,z:0,face:-dir*PI/2};o.players=[c];B.owner=c;B.x=B.z=0;updateDefensiveLine(t,1/60);const depth=HL+t.lineSm*HL;assert.ok(depth>=15&&depth<=21,{depth});for(const e of t.players.filter(p=>p.role==='DF')){const [x]=formTarget(e);const d=HL+x*dir;assert.ok(d>=13&&d<=23,{d});}}`,ctx);
});

test('automatic third-line positioning advances slightly in both directions while manual and active actions stay free',()=>{
  const ctx=tacticsContext();
  vm.runInContext(`for(const dir of [-1,1])for(const [form,slots] of Object.entries(FORMS))for(const poss of [false,true]){const t={i:0,dir,ment:0,inPoss:poss,lastLine:.92,players:[]},o={i:1,players:[]};t.opp=o;o.opp=t;B.x=-dir*10;B.z=dir*8;B.owner={team:poss?t:o};G.state='play';for(const [k,f] of slots.entries()){const e={team:t,k,role:f.r,lbl:f.l,base:f.p,isGK:k===0,run:0,hid:{att:1,def:1}};PADS[0]={ctrl:e,lock:null};const manual=formTarget(e),manualSupport=supportSpot(e);PADS[0]=null;const automatic=formTarget(e),automaticSupport=supportSpot(e);const wanted=e.role==='MF'&&e.lbl!=='CAM'?2.5:0;assert.ok(Math.abs((automatic[0]-manual[0])*dir-wanted)<1e-9,form+':'+f.l);assert.ok(Math.abs((automaticSupport[0]-manualSupport[0])*dir-wanted)<1e-9,form+':'+f.l);assert.equal(automatic[1],manual[1]);assert.equal(automaticSupport[1],manualSupport[1]);e.run=2;assert.equal(midfieldAdvance(e),0);e.run=0;B.owner=e;assert.equal(midfieldAdvance(e),0);B.owner={team:poss?t:o};G.state='setpiece';assert.equal(midfieldAdvance(e),0);G.state='play';}}
  const t={i:0,dir:1,inPoss:true,ment:0,lastLine:.2,players:[]},o={i:1,players:[]};t.opp=o;B.owner={team:t};B.x=B.z=0;PADS[0]=null;const e={team:t,k:6,role:'MF',lbl:'CM',base:[-.3,0],run:0};assert.ok(supportSpot(e)[0]<=HL*(t.lastLine-.01)+1e-9);assert.equal(typeof formationLane,'undefined');`,ctx);
});

test('onside runners and an already played through ball trigger retreat; offside campers do not',()=>{
  const ctx=tacticsContext();
  vm.runInContext(`for(const dir of [-1,1]){const t={i:0,dir,ment:0,inPoss:false,players:[],lastLine:.8},o={i:1,players:[]};t.opp=o;o.opp=t;const gx=-dir*HL;for(let k=0;k<5;k++)t.players.push({team:t,k,role:k?'DF':'GK',isGK:!k,x:gx+dir*(k?18:1.5),z:(k-2)*4,base:[-.65,(k-2)*.2],lbl:'CB',act:0,stun:0,stamina:1,vmax:maxRunSpeed(.8),vx:0,vz:0,hid:{att:1,def:1},run:0});const c={team:o,x:0,z:0,face:-dir*PI/2},runner={team:o,x:gx+dir*20,z:4,vx:-dir*8,vz:1,run:2};o.players=[c];B.owner=c;B.x=B.z=0;B.offside=null;B.target=null;updateDefensiveLine(t,1/60);const base=t.lineSm;o.players.push(runner);updateDefensiveLine(t,1/60);assert.ok(t.lineSm<base&&t.lineSm>=base-8/HL/60-1e-9);for(let i=0;i<120;i++)updateDefensiveLine(t,1/60);assert.ok(t.lineSm<base-1/HL);assert.equal(t.coverThreats[0].e,runner);t.press1=t.press2=null;t.defMarks=new Map();assignDefMarks(t,c,null);assert.ok([...t.defMarks.values()].includes(runner));const defender=[...t.defMarks].find(([e,m])=>m===runner)[0];think(defender,1/60);assert.ok(defender.sx*dir<=t.coverThreats[0].x-1);
  runner.x=gx+dir*5;t.lineSm=null;updateDefensiveLine(t,1/60);assert.equal(t.coverThreats.length,0);assert.ok(Math.abs(t.lineSm-base)<1e-9);
  B.owner=null;B.lastTeam=1;B.kickT=G.t;B.target={r:runner,x:gx+dir*8,z:4};t.lineSm=null;updateDefensiveLine(t,1/60);assert.equal(t.coverThreats.length,1);assert.ok(Math.abs(HL+t.lineSm*HL-8)<1e-9);assert.ok(Math.abs(HL+lineFor(-1)*HL-8)<1e-9);B.offside={ps:[runner]};updateDefensiveLine(t,1/60);assert.equal(t.coverThreats.length,0);B.offside=null;
  }`,ctx);
});

test('physical player movement is uniformly 10 percent slower without editing ratings',()=>{
  const code=part('function movementAgility(e)','function moveEnt(e,dt)')+part('const SKILLS=','// a player short of stars')+part('const easeOut=','const fadeW=')+part('function skillStep(e,dt)','// where the ball sits during a move:')+'function skillBeat(){}';
  function measure(scale){const ctx=context(code,scale);return vm.runInContext(`(()=>{const st={pace:.85,drib:.8},t={i:0,opp:{players:[]}},e={team:t,st,stamina:1,vmax:maxRunSpeed(st.pace),face:0,vx:0,vz:0,mx:0,mz:maxRunSpeed(st.pace),act:0,x:0,z:0};let distance=0;for(let i=0;i<180;i++){locomote(e,1/60);distance+=hyp(e.vx,e.vz)/60;}assert.equal(st.pace,.85);assert.equal(st.drib,.8);const moves=[];for(const id of Object.keys(SKILLS).map(Number).filter(id=>SKILLS[id])){e.vx=0;e.vz=7*PLAYER_SPEED;e.face=0;e.actT=0;e.sk={id,side:1,dir:0,f0:0,v0:7*PLAYER_SPEED,evx:0,evz:7*PLAYER_SPEED};let x=0,z=0;for(let i=0;i<20;i++){e.actT=i/60;skillStep(e,1/60);x+=e.vx/60;z+=e.vz/60;}moves.push([x,z]);}return {distance,speed:e.vmax,moves};})()`,ctx);}
  const normal=measure(1),slower=measure(.9);assert.ok(Math.abs(slower.distance/normal.distance-.9)<1e-9);assert.ok(Math.abs(slower.speed/normal.speed-.9)<1e-9);normal.moves.forEach(([x,z],i)=>{assert.ok(Math.abs(slower.moves[i][0]-x*.9)<1e-9);assert.ok(Math.abs(slower.moves[i][1]-z*.9)<1e-9);});
});

test('box defence steps toward the carrier while a second defender covers inside the pitch',()=>{
  const ctx=context(part('const PI=','/* ================= renderer & scene').replace(part('const PI=','function seeded'),'').replace(part('const ACT=','// skill moves:'),'')+part('function toW(t,','function carrierThink(e,dt)')+`function ownGoalX(t){return-t.dir*HL;}let pressing=[];function trackMove(e,x,z){pressing.push(e);e.tx=x;e.tz=z;}function setMove(e,x,z){e.tx=x;e.tz=z;}`);
  vm.runInContext(`for(const dir of [-1,1]){const t={i:0,dir,human:true,players:[],ment:0},o={i:1,dir:-dir,players:[]};t.opp=o;o.opp=t;const gx=ownGoalX(t),c={team:o,x:gx+dir*15,z:0,vx:0,vz:0,face:-dir*PI/2,st:{drib:.85}};o.players=[c];B.owner=c;B.x=c.x;B.z=c.z;
  function df(k,dist,z){return {k,team:t,role:'DF',lbl:'CB',x:c.x+dir*dist,z,base:[-.6,z/34*dir],act:0,stun:0,off:false,isGK:false,vmax:8,vx:0,vz:0,hid:{def:1,att:1},run:0};}
  const uc=df(1,6,0),near=df(2,3,0),cover=df(3,-5,3),far=df(4,-8,-7);t.players=[uc,near,cover,far];PADS[0]={ti:0,ctrl:uc,lock:null,inp:{}};
  teamThink(t,1/60);assert.equal(t.press1,near);assert.notEqual(t.press2,t.press1);pressing=[];think(near,1/60);assert.equal(pressing.length,1);assert.ok(hyp(near.tx-c.x,near.tz-c.z)<2);think(t.press2,1/60);assert.ok(hyp(t.press2.tx-c.x,t.press2.tz-c.z)<3.5);assert.ok(Math.abs(t.press2.tx)<HL);
  uc.x=c.x+dir*2;pressing=[];think(near,1/60);assert.equal(pressing.length,0); // respect a user already engaging at close range
  c.x=gx+dir*.5;B.x=c.x;const [x,z]=boxCoverPoint(t,c,t.press2);assert.ok(Math.abs(x)<=HL-1&&Math.abs(z)<=HW-1);
  }`,ctx);
});
test('league exits forfeit once; friendly exits do not, and abandoned fixtures settle in home/away orientation',()=>{
  const ctx=context(`const NET={online:false},LG={s:{}},AUTH={user:'player'};let settled=0;function hudScore(){}function bannerOff(){}function fullTime(){settled++;G.state='full';}`+part('function settleLeagueExit()','function forfeit()'));
  vm.runInContext(`G.mode='league';G.state='play';G.score=[4,0];assert.equal(settleLeagueExit(),true);assert.deepEqual(Array.from(G.score),[0,3]);assert.equal(settled,1);assert.equal(settleLeagueExit(),false);G.state='play';G.mode='friendly';assert.equal(settleLeagueExit(),false);G.mode='league';NET.online=true;assert.equal(settleLeagueExit(),false);`,ctx);
  const recover=context(`const AUTH={user:'p'},LG={s:null};let writes=0,rounds=0,recorded=[];const resKey=(m,h,a)=>m+':'+h+':'+a;function userFixture(){return {h:2,a:7,home:LG.s.club===2};}function lgSave(){writes++;}function recordResult(md,h,a,gh,ga){recorded.push([gh,ga]);LG.s.res[resKey(md,h,a)]=[gh,ga];}function finishRound(){rounds++;LG.s.md++;}`+part('function recoverLeagueMatch()','function makeFixtures('));
  vm.runInContext(`for(const club of [2,7]){LG.s={club,md:0,res:{},activeMatch:{md:0,h:2,a:7,user:'p'}};assert.equal(recoverLeagueMatch(),true);assert.deepEqual(recorded.at(-1),club===2?[0,3]:[3,0]);assert.equal(recoverLeagueMatch(),false);}assert.equal(rounds,2);`,recover);
});

test('prepared pass, through and shot inputs survive a long incoming flight and cancel on interruption',()=>{
  const ctx=context(part('// A buffered action belongs','function userMode(pd)'));
  vm.runInContext(`const team={i:0},sender={team},receiver={team},enemy={team:{i:1}},inp={chg:{shoot:false},charging:false},pd={ti:0,ctrl:receiver,inp};PADS[0]=pd;
  function flight(){G.state='play';B.owner=null;B.shot=null;B.target={r:receiver};B.kicker=sender;B.kickT=G.t;B.lastTeam=0;}
  for(const kind of ['pass','thru','thruLob','lob','shoot']){flight();bufferAction(pd,kind,.8,'power');G.t+=1.8;assert.equal(bufferedValid(pd,pd.queue,receiver),true);const q=takePrepared(pd,receiver);assert.equal(q.kind,kind);assert.equal(q.power,.8);assert.equal(pd.queue,null);}
  flight();bufferAction(pd,'shoot',.9);B.kicker=enemy;assert.equal(takePrepared(pd,receiver),null);
  flight();bufferAction(pd,'pass',.6);B.target={r:{team}};assert.equal(takePrepared(pd,receiver),null);
  flight();bufferAction(pd,'thru',.7);G.state='out';assert.equal(takePrepared(pd,receiver),null);G.state='play';
  inp.charging=true;inp.chg.shoot=true;clearPreparedAgainst(1);assert.equal(pd.queue,null);assert.equal(inp.charging,false);assert.equal(inp.chg.shoot,false);
  `,ctx);
});

test('a prepared ground-ball shot fires at first contact without trapping or a second windup',()=>{
  const ctx=context(`let action=null,fired=0;function nearestOpp(){return[null,1];}function setCtrl(pd,e){pd.ctrl=e;}function autoSwitchDef(){}function doUserAction(pd,kind,power,sk){action={kind,power,sk};pd.ctrl.kick={fn(){fired++;B.owner=null;}};}`+part('// A buffered action belongs','function userMode(pd)')+part('function gainBall(e)','function inOwnBox(e)'));
  vm.runInContext(`const team={i:0,human:true},sender={team},e={team,isGK:false,act:0},pd={ti:0,ctrl:e,inp:{charging:false,chg:{}}};PADS[0]=pd;B.owner=null;B.target={r:e};B.kicker=sender;B.kickT=G.t;B.lastTeam=0;B.vx=15;B.y=.8;bufferAction(pd,'shoot',.75,'power');G.t+=1.5;gainBall(e);assert.equal(fired,1);assert.equal(B.owner,null);assert.equal(e.kick,null);assert.equal(B.y,.8);assert.equal(action.kind,'shoot');assert.equal(action.power,.75);`,ctx);
});

test('an incoming high ball uses the prepared header power and consumes a held charge once',()=>{
  const ctx=context(`function kickBall(e,vx,vy,vz){B.owner=null;B.vx=vx;B.vy=vy;B.vz=vz;B.kicker=e;B.kickT=G.t;B.target=null;B.lastTeam=e.team.i;}`+part('// A buffered action belongs','function userMode(pd)')+part('function header(e)','function gainBall(e)'));
  vm.runInContext(`const team={i:0,dir:1},sender={team},e={team,x:HL-10,z:0,st:{shoot:.9}},pd={ti:0,ctrl:e,inp:{charging:false,chg:{},jy:0}};PADS[0]=pd;G.stats[0].shots=0;
  function flight(){B.owner=null;B.shot=null;B.target={r:e};B.kicker=sender;B.kickT=G.t;B.lastTeam=0;B.y=1.8;B.x=e.x;}
  flight();bufferAction(pd,'shoot',.35);header(e);const soft=hyp(B.vx,B.vz);assert.equal(B.shot.kind,'header');assert.equal(e.act,ACT.HEAD);
  flight();pd.inp={charging:true,chargeK:'shoot',power:.9,shotKind:'normal',chg:{shoot:true},jy:0};header(e);assert.ok(hyp(B.vx,B.vz)>soft);assert.equal(pd.inp.charging,false);assert.equal(pd.inp.chg.shoot,false);assert.equal(pd.consumedHeld,'shoot');assert.equal(G.stats[0].shots,2);
  flight();pd.inp.charging=true;assert.equal(takePrepared(pd,e),null); // the same held button cannot fire a second action
  `,ctx);
});

test('charging increases ground and lofted through-ball speed at the same destination',()=>{
  const ctx=context(`function nearestOpp(){return[null,10];}function kickQuality(){return 1;}`+part('function groundSpeedFor(d,','function ballCollide()')+part('function passVel(p,','/* offside:'));
  vm.runInContext(`const p={team:{human:true},st:{pass:.9},passAng:0},r={};for(const distance of [12,25,38])for(const kind of ['through','throughLob']){const pt={x:distance,z:0},soft=passVel(p,r,kind,pt,.2,true),hard=passVel(p,r,kind,pt,.9,true);assert.ok(hyp(hard.vx,hard.vz)>hyp(soft.vx,soft.vz));assert.equal(hard.tx,soft.tx);assert.equal(hard.tz,soft.tz);}`,ctx);
});

test('power shots remain faster but overcharging and shooting on the run reduce target accuracy',()=>{
  const ctx=context(`function nearestOpp(){return[null,10];}function kickQuality(){return 1;}`+part('function shotVel(p,','function shootExec('));
  vm.runInContext(`const keeper={z:0},team={human:true,dir:1,opp:{players:[keeper]}},p={team,vx:0,vz:0,st:{shoot:.85}};B.x=HL-25;B.y=BR;
  let seed=17;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)+1)/4294967297;
  function sample(power,speed){let hit=0;seed=17;p.vx=speed;for(let i=0;i<3000;i++){const k=shotVel(p,power,.65,'power',false,false),T=(HL-B.x)/k.vx,z=B.z+k.vz*T,y=B.y+k.vy*T-.5*GRAV*T*T;if(Math.abs(z)<GW/2&&y>0&&y<GH)hit++;}return hit/3000;}
  const controlled=sample(.72,0),over=sample(1,0),moving=sample(.72,8);assert.ok(controlled>over+.15,{controlled,over});assert.ok(controlled>moving+.03,{controlled,moving});p.vx=0;const power=shotVel(p,.72,.65,'power',false,true),normal=shotVel(p,.72,.65,'normal',false,true);assert.ok(hyp(power.vx,power.vz)>hyp(normal.vx,normal.vz));`,ctx);
});

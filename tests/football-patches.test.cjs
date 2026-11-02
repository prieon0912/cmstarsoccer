const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
function part(a,b){const i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i,a);return source.slice(i,j);}
function context(code='',speed=0.9){const ctx=vm.createContext({assert,console});vm.runInContext(part('const PI=','function seeded').replace('const PLAYER_SPEED=0.9;','const PLAYER_SPEED='+speed+';')+part('const ACT=','// skill moves:')+`const G={t:10,clock:20,half:1,state:'play',stats:[{skill:0},{}],ents:[]},B={x:0,z:0,y:BR,vx:0,vz:0,vy:0,lastTeam:0,spin:0},PADS=[null,null];const STEP=1/60,padOf=t=>PADS[t.i];const oppOf=t=>t.opp;function say(){}function peekPrepared(){return null;}const AU={excite(){}},sfx={kick(){}};`+code,ctx);return ctx;}
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

test('the displayed clock freezes at 45 and 90 while internal stoppage time keeps advancing',()=>{
  const ctx=context(part('function matchClockText(clock,half)','function hudFrame()'));
  vm.runInContext(`for(const [half,limit] of [[1,45],[2,90]]){assert.equal(matchClockText(limit-1/120,half),(limit-1)+':59');for(const extra of [0,.5,2,5]){G.clock=limit+extra;assert.equal(matchClockText(G.clock,half),limit+':00');assert.equal(G.clock,limit+extra);}}assert.equal(matchClockText(0,1),'00:00');assert.equal(matchClockText(45,2),'45:00');`,ctx);
});

test('keeper planning reaches the shot sooner without widening physical collision or advancing off the line',()=>{
  const ctx=context(`const HIP_H=.972;function ownGoalX(t){return -t.dir*HL;}function trajAt(){return {x:B.x,z:2.3,y:1.2};}function gkGo(){}`+part('function planSave(e)','function gkGo(e)')+part('function movementAgility(e)','function moveEnt(e,dt)'));
  vm.runInContext(`const e={team:{i:0,dir:1},x:-HL+1.1,z:0,face:PI/2,gkSkill:.9,isGK:true};Object.assign(B,{x:e.x+20,z:0,y:BR,vx:-25,vy:0,vz:0});Math.random=()=>.7;planSave(e);assert.equal(e.save.ok,true);assert.ok(e.save.T1<.32);assert.equal(e.x,-HL+1.1);assert.equal(typeof keeperTouch,'undefined');e.save=null;e.strafe=true;e.faceTgt={x:e.x+10,z:0};e.face=PI/2;e.vx=0;e.vz=4;faceUpdate(e,1/60,4);assert.ok(Math.abs(angD(e.face,PI/2))<1e-9);`,ctx);
});

test('keepers centre frontal catches, fully attempt reachable dives and begin before close shots pass their gloves',()=>{
  const ctx=context(`const HIP_H=.972;let targetY=1.2,targetZ=0;function ownGoalX(t){return-t.dir*HL;}function trajAt(t){return{x:B.x+B.vx*t,y:targetY,z:targetZ};}`+part('function planSave(e)','function keeperShapes(e)'));
  vm.runInContext(`const e={team:{i:0,dir:1},x:-HL+1.1,z:0,face:PI/2,gkSkill:.9};Object.assign(B,{x:e.x+10,z:0,y:1.2,vx:-25,vy:0,vz:0});Math.random=()=>.99;planSave(e);assert.equal(e.save.kind,'catch');assert.equal(e.save.rootZ,0);assert.ok(e.save.t0-G.t<=.08);targetY=.11;targetZ=2.3;planSave(e);assert.equal(e.save.ok,false);assert.ok(e.save.py<=.2);assert.ok(e.save.tilt>1.5);assert.ok(Math.abs(e.save.rootZ-(targetZ-e.save.sideW*e.save.hand*.95))<1e-9);B.x=e.x+2.5;targetZ=1;targetY=.4;planSave(e);assert.ok(e.save.T1<.11);assert.ok(e.save.t0<=G.t+.02);`,ctx);
});

test('keeper catch poses put the real arm chain at low, waist and high ball heights',()=>{
  const ctx=context(part('const PX=','function skillW(')+`const HIP_H=.972,ANK=.084,HIPW=.082,LEG=.44;function actEnd(){return 1.8;}`+part('function solveLeg(P,','function actEnd(e)')+part('function keeperCatchArms(P,','function applyPose(e,dt)'));
  vm.runInContext(`for(const h of [.2,.4,.6,.9,1.2,1.5,1.8,2.3,2.5]){const P=new Float32Array(NCH);P[PY]=HIP_H;actionPose({act:ACT.CATCH,actT:.25,ap1:h},P);const a=P[ALX],b=P[EL],y=-.27*Math.cos(a)-.29*Math.cos(a+b),z=-.27*Math.sin(a)-.29*Math.sin(a+b),cy=Math.cos(P[SX]),sy=Math.sin(P[SX]),handY=P[PY]+.53*cy+y*cy-z*sy,handZ=P[PZ]+.53*sy+y*sy+z*cy;assert.ok(Math.abs(handY-h)<.2,JSON.stringify({h,handY}));assert.ok(handZ>.25&&handZ<.65,JSON.stringify({h,handZ}));}`,ctx);
});

test('a keeper times the commit to the decelerating trajectory instead of finishing a distant dive too early',()=>{
  const ctx=context(`const HIP_H=.972;function ownGoalX(t){return-t.dir*HL;}function trajAt(t){return{x:B.x+B.vx*(1-Math.exp(-.36*t))/.36,y:1.2,z:2.3};}`+part('function planSave(e)','function keeperShapes(e)'));
  vm.runInContext(`const e={team:{i:0,dir:1},x:-HL+1.1,z:0,face:PI/2,gkSkill:.9};Object.assign(B,{x:e.x+20,z:0,y:1.2,vx:-25,vy:0,vz:0});Math.random=()=>.5;planSave(e);const arrival=-Math.log(1-.36*(20-.38)/25)/.36;assert.ok(Math.abs(e.save.tEnd-G.t-arrival)<.002);assert.ok(e.save.t0>G.t+.4);assert.ok(Math.abs(e.save.t0+e.save.T1-e.save.tEnd)<.15);`,ctx);
});

test('ordinary sprint dribbling stays closer to the feet without pulling the ball through the player',()=>{
  const ctx=context(part('function skillBall(o)','/* ================= AI')+part('function updateBall(dt)','function checkRules()'));
  vm.runInContext(`for(const hz of [30,60,120]){const e={x:0,z:0,vx:8,vz:0,face:PI/2,speed:8,phase:0,sprint:true,act:0};B.owner=e;B.x=.6;B.z=0;let far=0;for(let i=0;i<hz*3;i++){e.x+=8/hz;e.phase+=TAU*2/hz;updateBall(1/hz);const ahead=B.x-e.x;far=Math.max(far,ahead);assert.ok(ahead>=.499999);}assert.ok(far<1.2);assert.ok(far>.85);}`,ctx);
});

test('field-player pickup no longer reaches the former distant front edge, while close reception still works',()=>{
  const ctx=context(`let gains=0;function integ(){}function ballCollide(){}function heavyTouch(){return false;}function fiftyFifty(e){return e;}function gainBall(e){gains++;B.owner=e;}`+part('function updateBall(dt)','function checkRules()'));
  vm.runInContext(`const team={i:0},e={team,x:0,z:0,act:0,stun:0,cool:0,isGK:false};G.ents=[e];for(const [distance,speed,receiver] of [[1.12,8,true],[.95,3,false],[.85,8,false]]){Object.assign(B,{x:distance,z:0,y:BR,vx:speed,vy:0,vz:0,owner:null,shot:null,lastTeam:0,target:receiver?{r:e}:null});updateBall(1/60);assert.equal(B.owner,null);}Object.assign(B,{x:.65,z:0,y:BR,vx:8,vy:0,vz:0,owner:null,shot:null,lastTeam:0,target:{r:e}});updateBall(1/60);assert.equal(B.owner,e);assert.equal(gains,1);`,ctx);
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
test('standing tackles are stronger while shot windup and recent duel wins remain protected',()=>{
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

test('selected defending assists marking, lets the stick adjust position, and releases on deliberate sprint or retreat',()=>{
  const ctx=tacticsContext(`function userMode(){return 'def';}function clearEdges(i){for(const k in i.edge)i.edge[k]=false;}let switches=0;function autoSwitchDef(){switches++;}`+part('function shouldCollectLoose(c)','/* ================= main step'));
  vm.runInContext(`const t={i:0,dir:1,players:[]},o={team:{i:1},x:-8,z:0,vx:0,vz:0},e={team:t,x:-10,z:0,vx:0,vz:0,vmax:8,face:PI/2,stamina:1,st:{tackle:.8,drib:.7},act:0,stun:0,ipt:9};t.players=[e];const inp={jx:0,jy:0,btn:{},edge:{},chg:{},charging:false},pd={ti:0,ctrl:e,inp,lastSwitch:0,lastManual:0,lock:{}};PADS[0]=pd;B.owner=o;userStep(pd,STEP);assert.equal(pd.marking,true);assert.equal(pd.lock,null);assert.equal(e.mark,o);const idle=hyp(e.mx,e.mz);inp.btn.thru=true;userStep(pd,STEP);assert.ok(hyp(e.mx,e.mz)>idle);inp.btn.thru=false;inp.jy=1;userStep(pd,STEP);assert.equal(pd.marking,true);assert.ok(e.mz>0);inp.jy=0;inp.jx=-1;userStep(pd,STEP);assert.equal(pd.marking,false);assert.ok(e.mx<0);inp.jx=1;inp.btn.sprint=true;userStep(pd,STEP);assert.equal(pd.marking,false);assert.equal(e.sprint,true);assert.equal(e.defJockey,false);assert.equal(switches,0);`,ctx);
});

test('defensive jockey steps face the carrier and cap backward movement while recovery running stays directional',()=>{
  const ctx=context(part('function movementAgility(e)','function moveEnt(e,dt)'));
  vm.runInContext(`const o={x:0,z:3},e={team:{i:0},isGK:false,defJockey:true,faceTgt:o,face:0,x:0,z:0,vx:0,vz:0,mx:0,mz:-8,vmax:8,stamina:1,st:{pace:.8,drib:.7},act:0};B.owner={team:{i:1}};for(let i=0;i<60;i++){locomote(e,STEP);faceUpdate(e,STEP,hyp(e.vx,e.vz));}assert.ok(e.vz<0&&e.vz>=-8*.42-1e-9);assert.ok(Math.abs(e.face)<1e-6);e.defJockey=false;e.mx=8;e.mz=0;for(let i=0;i<120;i++){locomote(e,STEP);faceUpdate(e,STEP,hyp(e.vx,e.vz));}assert.ok(e.vx>7);assert.ok(Math.abs(angD(e.face,PI/2))<.1);`,ctx);
});

test('automatic control handover never holds an active directional input behind a one-second AI lock',()=>{
  const ctx=context(part('function lockActive(pd)','function nearestHuman('));
  vm.runInContext(`const e={team:{i:0}},pd={ctrl:e,inp:{jx:1,jy:0,btn:{},edge:{}},lock:{why:'auto',t:G.t,jx:1,jy:0}};assert.equal(lockActive(pd),false);assert.equal(pd.lock,null);pd.inp.jx=0;pd.lock={why:'auto',t:G.t-.13,jx:0,jy:0};assert.equal(lockActive(pd),false);`,ctx);
});

test('all nine attack/defence work-rate combinations affect support and recovery for every outfield role',()=>{
  const ctx=tacticsContext();
  vm.runInContext(`for(const dir of [-1,1])for(const [role,lbl,base] of [['DF','CB',[-.65,.2]],['DF','LB',[-.6,-.62]],['DF','RB',[-.6,.62]],['MF','CDM',[-.43,0]],['MF','CM',[-.33,-.34]],['MF','CAM',[-.33,.34]],['MF','LM',[-.28,-.62]],['FW','ST',[.05,0]],['FW','LW',[-.03,-.62]],['FW','RW',[-.03,.62]]]){const t={i:0,dir,players:[],ment:0,possT:5,lastLine:.7,inPoss:true},o={i:1,players:[]};t.opp=o;o.opp=t;const e={team:t,role,lbl,base,run:0,hid:{att:1,def:1}};t.players=[e];const support=[],recovery=[];for(let att=0;att<3;att++){support[att]=[];recovery[att]=[];for(let def=0;def<3;def++){e.hid={att,def};B.owner={team:t};B.x=dir*32;B.z=dir*12;support[att][def]=supportSpot(e)[0]*dir;t.inPoss=false;B.owner.team=o;B.x=-dir*32;B.z=-dir*12;t.defBallX=B.x;t.defBallZ=B.z;recovery[att][def]=formTarget(e)[0]*dir;t.inPoss=true;}}
  for(let level=0;level<3;level++){assert.ok(support[0][level]<support[1][level]&&support[1][level]<support[2][level],role+' attack stages');assert.ok(recovery[0][level]<recovery[1][level]&&recovery[1][level]<recovery[2][level],role+' forward outlet stages');assert.ok(support[level][0]>support[level][1]&&support[level][1]>support[level][2],role+' cover preference stages');assert.ok(recovery[level][0]>recovery[level][1]&&recovery[level][1]>recovery[level][2],role+' recovery stages');}assert.equal(new Set(support.flat().map(x=>x.toFixed(6))).size,9);assert.equal(new Set(recovery.flat().map(x=>x.toFixed(6))).size,9);
  }const c={x:0,z:0},p={x:10,z:0,hid:{def:0}};const low=pressScore(p,c);p.hid.def=1;const normal=pressScore(p,c);p.hid.def=2;assert.ok(low>normal&&normal>pressScore(p,c));p.x=2;for(const def of [0,1,2]){p.hid.def=def;assert.equal(pressScore(p,c),2);}`,ctx);
});

test('work rates choose recovery support and forward outlets without forbidding overlap or urgent covering',()=>{
  const ctx=tacticsContext();
  vm.runInContext(`for(const dir of [-1,1]){const t={i:0,dir,players:[],inPoss:true,ment:0,lastLine:.8,possT:8},o={i:1,players:[]};t.opp=o;o.opp=t;B.x=dir*40;B.z=dir*20;B.owner={team:t,x:B.x,z:B.z};for(const lbl of ['CB','LB','RB']){const e={team:t,role:'DF',lbl,base:[-.65,lbl==='CB'?.2:.62],hid:{att:1,def:2},run:0};const [x]=supportSpot(e);assert.ok(x*dir<0);e.hid={att:2,def:0};assert.ok(supportSpot(e)[0]*dir>x*dir+5);if(lbl!=='CB'){e.run=2;assert.ok(supportSpot(e)[0]*dir>HL*.6);}}
  t.inPoss=false;B.owner.team=o;B.x=-dir*40;t.defBallX=B.x;t.defBallZ=0;const fw={team:t,role:'FW',lbl:'ST',base:[.05,0],hid:{att:2,def:1},run:0};assert.ok(formTarget(fw)[0]*dir>-5);}`,ctx);
});

test('a shared support plan reserves distinct spaces, reuses them briefly and clears on a possession change',()=>{
  const ctx=tacticsContext(`function laneClear(){return 3;}`);
  vm.runInContext(`const t={i:0,dir:1,players:[],ment:0,possT:7,lastLine:.7},o={i:1,players:[]};t.opp=o;o.opp=t;const c={team:t,k:9,x:32,z:0,isGK:false};B.owner=c;B.x=32;B.z=0;t.players=[c,...Array.from({length:5},(_,k)=>({team:t,k,role:k<2?'DF':'MF',lbl:k<2?'CB':'CM',base:[k<2?-.65:-.33,k%2?.3:-.3],x:32,z:0,run:0,hid:{att:1,def:k<2?2:1,roam:1}}))];planSupport(t);assert.equal(t.supportPlan.size,5);const points=[...t.supportPlan.values()];for(let i=0;i<points.length;i++)for(let j=0;j<i;j++)assert.ok(hyp(points[i][0]-points[j][0],points[i][1]-points[j][1])>4);const plan=t.supportPlan;G.t+=.1;planSupport(t);assert.equal(t.supportPlan,plan);B.owner={team:o};planSupport(t);assert.equal(t.supportPlan,null);B.owner=c;PADS[0]={ctrl:t.players[1],lock:null};planSupport(t);assert.equal(t.supportPlan.has(t.players[1]),false);`,ctx);
});

test('stopped PK and result poses do not independently track the moving ball with the neck',()=>{
  const ctx=context(part('function headLook(e,','function locoPose(e,P,dt)'));
  vm.runInContext(`const e={x:0,z:0,face:PI-.01,hy:.9,hx:.3};for(const state of ['setpiece','full','half','paused','out','foul','replay']){G.state=state;for(let i=0;i<120;i++){B.x=Math.sin(i)*10;B.z=Math.cos(i)*10;const [x,y]=headLook(e,0,.2,STEP);assert.equal(x,0);assert.equal(y,0);assert.equal(e.face,PI-.01);}}G.state='play';B.x=-.1;B.z=-10;for(let i=0;i<30;i++){const [x,y]=headLook(e,0,0,STEP);assert.ok(Math.abs(y)<.04);assert.ok(Number.isFinite(x));}B.x=10;B.z=0;for(let i=0;i<120;i++){const [,y]=headLook(e,0,0,STEP);assert.ok(Math.abs(y)<=1);}`,ctx);
});

test('standing tackles win a clean contact more often without extending the foot hit area',()=>{
  const ctx=context(`function gainBall(e){B.owner=e;}function callFoul(){}`+part('const POKE_HIT=','function callFoul('));
  vm.runInContext(`const d={x:0,z:1.2,face:PI,st:{tackle:.8,phy:.8},team:{i:1}},c={x:0,z:0,face:0,st:{drib:.8,phy:.8},team:{i:0},act:0};G.stats[1].tack=0;B.owner=c;B.x=0;B.z=.7;Math.random=()=>.54;assert.equal(resolvePoke(d,c,0),true);assert.equal(B.owner,d);B.owner=c;d.z=2.6;assert.equal(resolvePoke(d,c,0),false);assert.equal(B.owner,c);assert.ok(d.stun>0);`,ctx);
});

test('AI off-ball movement stays on the pitch at every edge and recovers from outside without snapping',()=>{
  const ctx=context(`function actEnd(){return 99;}`+part('function movementAgility(e)','function separate()'));
  vm.runInContext(`for(const axis of ['x','z'])for(const sign of [-1,1]){const e={team:{i:0},x:0,z:0,mx:0,mz:0,vx:0,vz:0,face:axis==='x'?sign*PI/2:sign>0?0:PI,vmax:9,stamina:1,st:{drib:.8,pace:.8},act:0,stun:0,cool:0,tackleCd:0,phase:0};e[axis]=sign*(axis==='x'?HL-1:HW-1);e[axis==='x'?'vx':'vz']=sign*9;B.owner={team:{i:0}};for(let i=0;i<180;i++){e.mx=axis==='x'?sign*9:2;e.mz=axis==='z'?sign*9:2;moveEnt(e,STEP);assert.ok(Math.abs(e.x)<=HL-.35+1e-9);assert.ok(Math.abs(e.z)<=HW-.35+1e-9);}e[axis]=sign*((axis==='x'?HL:HW)+1);const before=e[axis];e.vx=e.vz=0;for(let i=0;i<240;i++){e.mx=e.mz=0;const old=e[axis];moveEnt(e,STEP);assert.ok(Math.abs(e[axis]-old)<=e.vmax*STEP+1e-9);}assert.ok(Math.abs(e[axis])<Math.abs(before));assert.ok(Math.abs(e[axis])<(axis==='x'?HL:HW));}
  const manual={team:{i:0},x:HL-.1,z:0,mx:9,mz:0,vx:9,vz:0,vmax:9,act:0};PADS[0]={ctrl:manual,lock:null};steerOffBall(manual);assert.equal(manual.mx,9);PADS[0]=null;B.owner=manual;steerOffBall(manual);assert.equal(manual.mx,9);B.owner=null;G.state='setpiece';steerOffBall(manual);assert.equal(manual.mx,9);`,ctx);
});

test('forward support runs react faster and remain free across the full pitch',()=>{
  const ctx=tacticsContext();
  vm.runInContext(`const t={i:0,dir:1,players:[]},o={i:1,players:[]};t.opp=o;o.opp=t;B.x=0;B.z=0;B.owner={team:t,x:0,z:0};const fw={team:t,role:'FW',lbl:'CF',x:-15,z:0,vmax:9,stamina:1,mx:0,mz:0,base:[0,0]},mf={...fw,role:'MF',lbl:'CM'};setMove(fw,-3,0,false,false);setMove(mf,-3,0,false,false);assert.ok(hyp(fw.mx,fw.mz)>hyp(mf.mx,mf.mz));for(const [x,z] of [[30,25],[-30,-25],[40,-20]]){setMove(fw,x,z,true,false);assert.ok(fw.mx*(x-fw.x)+fw.mz*(z-fw.z)>0);assert.ok(hyp(fw.mx,fw.mz)>7);}assert.equal(typeof formationLane,'undefined');`,ctx);
});

test('body separation cannot push an AI off-ball runner over the touchline',()=>{
  const ctx=context(part('function aiOffBall(e)','function moveEnt(e,dt)')+part('function separate()','function refThink(r)'));
  vm.runInContext(`for(const axis of ['x','z'])for(const sign of [-1,1]){const limit=axis==='x'?HL:HW,t={i:0},a={team:t,x:0,z:0,st:{phy:.5},vmax:9},b={team:t,x:0,z:0,st:{phy:.9},vmax:9};a[axis]=sign*(limit-.36);b[axis]=sign*(limit-.8);G.ents=[a,b];separate();assert.ok(Math.abs(a[axis])<=limit-.35+1e-9);assert.ok(Math.abs(b[axis])<=limit-.35+1e-9);}`,ctx);
});

test('attacking support is free to overlap, advance and change lanes again',()=>{
  const ctx=tacticsContext();
  vm.runInContext(`for(const dir of [-1,1]){const t={i:0,dir,inPoss:true,ment:0,lastLine:.92,players:[]},o={i:1,players:[]};t.opp=o;o.opp=t;B.x=dir*40;B.z=-dir*20;B.owner={team:t,x:B.x,z:B.z};const midfielder={team:t,k:6,role:'MF',lbl:'CM',base:[-.3,.3],run:0};const [x,z]=supportSpot(midfielder);assert.ok(x*dir>HL*.65);midfielder.run=2;const [rx,rz]=supportSpot(midfielder);assert.ok(rx*dir>HL*.8);assert.ok(Math.abs(rz-midfielder.base[1]*HW*dir)>6);const fullback={team:t,k:2,role:'DF',lbl:'LB',base:[-.6,-.7],run:2};const p=supportSpot(fullback);assert.ok(p[0]*dir>HL*.57);}
  assert.equal(typeof formationLane,'undefined');`,ctx);
});

test('the default defensive block sits near the penalty-area edge in every formation and direction',()=>{
  const ctx=tacticsContext();
  vm.runInContext(`for(const dir of [-1,1])for(const slots of Object.values(FORMS)){const t={i:0,dir,ment:0,inPoss:false,players:[],lastLine:.7},o={i:1,dir:-dir,players:[]};t.opp=o;o.opp=t;for(const [k,f] of slots.entries())t.players.push({team:t,k,role:f.r,lbl:f.l,base:f.p,isGK:k===0,x:(-HL+(k===0?1.5:18))*dir,z:f.p[1]*HW*dir,stun:0,act:0,wide:/^[LR]/.test(f.l),hid:{att:1,def:1},run:0});const c={team:o,x:0,z:0,face:-dir*PI/2};o.players=[c];B.owner=c;B.x=B.z=0;updateDefensiveLine(t,1/60);const depth=HL+t.lineSm*HL;assert.ok(depth>=15&&depth<=21,{depth});for(const e of t.players.filter(p=>p.role==='DF')){const [x]=formTarget(e);const d=HL+x*dir;assert.ok(d>=1.5&&d<=HL*2-1.5,{d});}}`,ctx);
});

test('automatic third-line positioning advances slightly in both directions while manual and active actions stay free',()=>{
  const ctx=tacticsContext();
  vm.runInContext(`for(const dir of [-1,1])for(const [form,slots] of Object.entries(FORMS))for(const poss of [false,true]){const t={i:0,dir,ment:0,inPoss:poss,lastLine:.92,players:[]},o={i:1,players:[]};t.opp=o;o.opp=t;B.x=-dir*10;B.z=dir*8;B.owner={team:poss?t:o};G.state='play';for(const [k,f] of slots.entries()){const e={team:t,k,role:f.r,lbl:f.l,base:f.p,isGK:k===0,run:0,hid:{att:1,def:1}};PADS[0]={ctrl:e,lock:null};const manual=formTarget(e),manualSupport=supportSpot(e);PADS[0]=null;const automatic=formTarget(e),automaticSupport=supportSpot(e);const wanted=e.role==='MF'&&e.lbl!=='CAM'?2.5:0;assert.ok(Math.abs((automatic[0]-manual[0])*dir-wanted)<1e-9,form+':'+f.l);assert.ok(Math.abs((automaticSupport[0]-manualSupport[0])*dir-wanted)<1e-9,form+':'+f.l);assert.equal(automatic[1],manual[1]);assert.equal(automaticSupport[1],manualSupport[1]);e.run=2;assert.equal(midfieldAdvance(e),0);e.run=0;B.owner=e;assert.equal(midfieldAdvance(e),0);B.owner={team:poss?t:o};G.state='setpiece';assert.equal(midfieldAdvance(e),0);G.state='play';}}
  const t={i:0,dir:1,inPoss:true,ment:0,lastLine:.2,players:[]},o={i:1,players:[]};t.opp=o;B.owner={team:t};B.x=B.z=0;PADS[0]=null;const e={team:t,k:6,role:'MF',lbl:'CM',base:[-.3,0],run:0};assert.ok(supportSpot(e)[0]>HL*(t.lastLine-.01));assert.equal(typeof formationLane,'undefined');`,ctx);
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
  uc.x=c.x+dir*2;pressing=[];think(near,1/60);assert.equal(pressing.length,1); // a nearby user no longer disables AI pressure
  c.x=gx+dir*.5;B.x=c.x;const [x,z]=boxCoverPoint(t,c,t.press2);assert.ok(Math.abs(x)<=HL-1&&Math.abs(z)<=HW-1);
  }`,ctx);
});

test('marking crosses old formation corridors and nearby AI targets no longer stay frozen',()=>{
  const ctx=tacticsContext();
  vm.runInContext(`for(const dir of [-1,1]){const t={i:0,dir,ment:0,inPoss:false,lastLine:.8,lineSm:(-HL+18)/HL,players:[],coverThreats:[]},o={i:1,players:[]};t.opp=o;o.opp=t;const c={team:o,x:dir*5,z:0,vx:0,vz:0},m={team:o,x:-dir*5,z:20,vx:0,vz:0},e={team:t,k:2,role:'DF',lbl:'CB',base:[-.65,-.3],x:-dir*30,z:-15,vx:0,vz:0,act:0,stun:0,vmax:maxRunSpeed(.8),stamina:1,style:'man'};t.players=[e];o.players=[c,m];t.defMarks=new Map([[e,m]]);B.owner=c;B.x=c.x;B.z=0;PADS[0]=null;const [x,z]=formTarget(e);think(e,1/60);assert.equal(e.mark,m);assert.ok(e.sx*dir>x*dir+5);assert.ok(e.sz>z+6);e.sx=e.sz=null;e.settled=true;setMove(e,e.x+dir*1.3,e.z,false,true);assert.ok(hyp(e.mx,e.mz)>0);}`,ctx);
});

test('keepers hold the goalmouth before a rush cue matures; manual movement and saves remain available',()=>{
  const ctx=tacticsContext(part('function gkThink(e,dt)','// is a defender between')+part('function goalSideCover(t,c,gx,dg)','// the keeper spreads')+`const D={react:.3};let saves=0,distributions=0;function nearestOpp(){return[null,10];}function gkDistribute(){distributions++;}function planSave(e){e.save={watch:true};}function gkSaveStep(){saves++;}function startSmother(){throw Error('automatic rush');}`);
  vm.runInContext(`for(const dir of [-1,1]){const t={i:0,dir,ment:0,players:[],lastLine:0},o={i:1,players:[]};t.opp=o;o.opp=t;const gx=-dir*HL,e={team:t,k:0,isGK:true,role:'GK',x:gx+dir*12,z:0,vx:0,vz:0,act:0,actT:0,stun:0,vmax:maxRunSpeed(.8),stamina:1,ipt:.1,ipx:gx+dir*20,ipz:0,holdT:0,gkSkill:.9},field={team:t,k:1,role:'DF',lbl:'CB',base:[-.65,0],x:gx+dir*18,z:0,act:0,stun:0,ipt:4,vmax:8};t.players=[e,field];assert.ok(Math.abs((formTarget(e)[0]-gx)*dir-1.1)<1e-9);const c={team:o,x:0,z:0,vx:0,vz:0,face:-dir*PI/2};o.players=[c];PADS[0]=null;
  for(const depth of [60,30,12,4]){c.x=gx+dir*depth;B.owner=c;B.x=c.x;B.z=5;B.shot=null;t.chaser=e;gkThink(e,1/60);assert.ok(Math.abs((e.sx-gx)*dir-1.1)<1e-9);assert.ok(e.mx*dir<0);}
  B.owner=null;B.shot=null;B.target=null;B.lastTeam=1;B.x=gx+dir*20;B.z=0;teamThink(t,1/60);assert.notEqual(t.chaser,e);gkThink(e,1/60);assert.ok(Math.abs((e.sx-gx)*dir-1.1)<1e-9);
  B.owner=e;B.held=true;e.holdT=.2;gkThink(e,1/60);assert.equal(e.mx,0);assert.equal(e.mz,0);e.holdT=2;gkThink(e,1/60);
  B.owner=null;B.shot={team:1,t:G.t-.18};gkThink(e,1/60);assert.ok(e.save);e.save=null;PADS[0]={ctrl:e,lock:null};e.mx=2;e.mz=3;gkThink(e,1/60);assert.equal(e.mx,2);assert.equal(e.mz,3);PADS[0]=null;
  }assert.equal(distributions,2);assert.equal(saves,2);`,ctx);
});

function keeperContactContext(extra=''){
  return context(`const THREE={Vector3:class{set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}}};let poses=0,catches=0;function applyPose(){poses++;}function applySkinned(){poses++;}function inOwnBox(){return true;}function gainBall(e){catches++;B.owner=e;}function node(x,y,z){return{p:{x,y,z},getWorldPosition(v){v.set(this.p.x,this.p.y,this.p.z);}};}
  function keeper(skinned=false){const e={team:{i:0,human:true},x:0,z:0,face:0,act:0,actT:0,cool:0,stun:0,isGK:true};e.rig={skinned,root:{updateMatrixWorld(){}},handL:node(0,1.2,-.42),handR:node(0,1.2,.42),bones:{hips:node(0,.95,0),sp2:node(0,1.4,0),head:node(0,1.7,0),upL:node(0,.9,-.1),lgL:node(0,.5,-.1),ftL:node(0,.08,-.1),upR:node(0,.9,.1),lgR:node(0,.5,.1),ftR:node(0,.08,.1)}};return e;}`+part('function keeperShapes(e)','function gkDistribute(e)')+extra);
}

test('celebration FOV remains bounded in portrait and landscape, and replay starts at a valid camera position',()=>{
  const ctx=context(`class Vec{constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}copy(v){return this.set(v.x,v.y,v.z);}lerp(v,k){this.x+=(v.x-this.x)*k;this.y+=(v.y-this.y)*k;this.z+=(v.z-this.z)*k;return this;}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}}const THREE={Vector3:Vec},CAM={aspect:1,fov:30,position:new Vec(),lookAt(){},updateProjectionMatrix(){}},NET={mirror:false},RP={side:1,cam:new Vec()};`+part('const camLook=new','/* ================= visuals per frame'));
  vm.runInContext(`G.state='goal';G.timer=1.2;G.goal={scorer:{x:45,z:20,team:{dir:1}}};for(const aspect of [.6,1,2]){CAM.aspect=aspect;for(let i=0;i<600;i++){updateCam(1/60);assert.ok(Number.isFinite(CAM.fov)&&CAM.fov<100);assert.ok(Number.isFinite(CAM.position.x));}const expected=32*(aspect<1.5?Math.min(1.9,1.5/aspect*1.15):Math.pow(1.95/aspect,.35));assert.ok(Math.abs(CAM.fov-expected)<1e-9);}G.state='replay';B.x=45;B.z=0;RP.cam.set(0,0,0);updateCam(1/60);assert.ok(RP.cam.lengthSq()>900);`,ctx);
});

test('throw-in facing takes the short turn before release and never chases the ball through a full spin after release',()=>{
  const ctx=context(part('function movementAgility(e)','function moveEnt(e,dt)'));
  vm.runInContext(`const e={act:ACT.THROW,ap2:0,face:PI-.02,throwFace:-PI+.1,turnRate:0,vx:3,vz:0,mx:5,mz:0,vmax:8,st:{pace:.8,drib:.8}};let angle=0;for(let i=0;i<20;i++){const before=e.face;locomote(e,1/60);faceUpdate(e,1/60,0);angle+=Math.abs(e.face-before);assert.equal(hyp(e.vx,e.vz),0);}assert.ok(angle<.2);e.ap2=.4;B.owner=null;const released=e.face;for(let i=0;i<120;i++){B.x=Math.sin(i*.2)*5;B.z=Math.cos(i*.2)*5;faceUpdate(e,1/60,0);assert.equal(e.face,released);assert.equal(e.turnRate,0);}`,ctx);
});

test('automatic keeper comes out for a clear central one-on-one, returns when covered and ignores wide threats',()=>{
  const ctx=context(`function ownGoalX(t){return-t.dir*HL;}`+part('function keeperMove(e,','// the keeper spreads'));
  vm.runInContext(`for(const dir of [-1,1]){const t={i:0,dir,players:[]},o={i:1,players:[]};t.opp=o;o.opp=t;const gx=ownGoalX(t),e={team:t,isGK:true,x:gx+dir*1.1,z:0,vmax:maxRunSpeed(.8)},c={team:o,x:gx+dir*20,z:0,ipt:.7};t.players=[e];o.players=[c];G.state='play';Object.assign(B,{owner:c,x:c.x,z:0,shot:null});assert.equal(keeperRushPlan(e),null);G.t+=.13;const plan=keeperRushPlan(e);assert.ok(plan&&(plan.x-gx)*dir>1.1&&(plan.x-gx)*dir<=9);keeperMove(e,plan.x,plan.z,true);assert.ok(e.mx*dir>0);t.players.push({x:gx+dir*10,z:0,stun:0});assert.equal(keeperRushPlan(e),null);t.players.pop();c.z=18;assert.equal(keeperRushPlan(e),null);c.z=0;G.state='setpiece';assert.equal(keeperRushPlan(e),null);G.state='play';}`,ctx);
});

test('keeper attacks an interceptable through ball inside the box but not a shot or a ball reached first by an attacker',()=>{
  const ctx=context(`function ownGoalX(t){return-t.dir*HL;}`+part('function keeperMove(e,','// the keeper spreads'));
  vm.runInContext(`const t={i:0,dir:1,players:[]},o={i:1,players:[]};t.opp=o;const gx=ownGoalX(t),e={team:t,isGK:true,x:gx+1.1,z:0,ipx:gx+9,ipz:0,ipt:.6},r={team:o,x:gx+18,z:0,ipt:1.2,stun:0};t.players=[e];o.players=[r];Object.assign(B,{owner:null,lastTeam:1,shot:null,target:{r},y:.2,x:gx+10,z:0});assert.equal(keeperRushPlan(e),null);G.t+=.13;assert.equal(keeperRushPlan(e).loose,true);r.ipt=.4;assert.equal(keeperRushPlan(e),null);r.ipt=1.2;B.shot={team:1};assert.equal(keeperRushPlan(e),null);B.shot=null;e.ipx=gx+22;assert.equal(keeperRushPlan(e),null);`,ctx);
});

test('keeper dive and sideways tracking remain speed-bounded instead of teleporting to a planned root position',()=>{
  const ctx=context(part('const easeOut=','const fadeW=')+part('function gkSaveStep(e)','function inOwnBoxP(t,x,z)')+part('function movementAgility(e)','function moveEnt(e,dt)'));
  vm.runInContext(`const e={vmax:8,x:0,z:0,vx:0,vz:0,save:{t0:G.t-.01,T1:.25,z0:0,rootZ:20,tEnd:G.t+.25}};for(let i=0;i<25;i++){gkSaveStep(e);assert.ok(Math.abs(e.vz)<=e.vmax*1.5+1e-9);const before=e.z;e.z+=e.vz*STEP;assert.ok(Math.abs(e.z-before)<=.2+1e-9);G.t+=STEP;}const k={isGK:true,strafe:true,face:PI/2,vmax:8,stamina:1,st:{pace:.8,drib:.8},vx:0,vz:0,mx:0,mz:10};for(let i=0;i<60;i++)locomote(k,STEP);assert.ok(k.vz>8&&k.vz<=9.2);assert.equal(k.vx,0);`,ctx);
});

test('a crowded goalmouth cannot displace the keeper by a large body-collision jump in one step',()=>{
  const ctx=context(part('function aiOffBall(e)','function moveEnt(e,dt)')+part('function separate()','function refThink(r)'));
  vm.runInContext(`const e={isGK:true,x:0,z:0,vmax:8,st:{phy:.8}},others=Array.from({length:8},(_,i)=>({x:.05+i*.025,z:0,st:{phy:.8}}));G.ents=[e,...others];separate();assert.ok(hyp(e.x,e.z)<=8*STEP*.6+1e-9);assert.ok(others.some(p=>p.x>.3));`,ctx);
});

test('no remote save for distant balls, wrong height or a predicted catch before the hands arrive',()=>{
  const ctx=keeperContactContext();
  vm.runInContext(`for(const skinned of [false,true]){const e=keeper(skinned);G.stats[1].onT=0;for(const [x,y,z] of [[1,1.2,.42],[0,2.7,.42],[0,2.3,0],[0,1.2,1.3]]){Object.assign(B,{x,y,z,vx:20,vy:0,vz:0,owner:null,shot:{team:1}});const before=JSON.stringify(B),sv={ok:true,catch:true,back:true,h:y,handZ:z};assert.equal(doSave(e,sv),false);assert.equal(JSON.stringify(B),before);assert.equal(sv.done,undefined);assert.equal(G.stats[1].onT,0);} }assert.equal(catches,0);`,ctx);
});

test('a high catch requires the current animated glove and body contact produces a parry instead of a magnetic catch',()=>{
  const ctx=keeperContactContext();
  vm.runInContext(`const e=keeper(true);G.stats[1].onT=0;Object.assign(B,{x:0,y:2.3,z:.42,vx:12,vy:0,vz:0,owner:null,shot:{team:1}});assert.equal(keeperTouch(e),null);e.rig.handR.p.y=2.3;G.t+=1/60;assert.equal(keeperTouch(e).hand,true);assert.equal(doSave(e,{catch:true}),true);assert.equal(B.owner,e);assert.equal(catches,1);
  Object.assign(B,{x:0,y:1.2,z:0,vx:25,vy:0,vz:0,owner:null,shot:{team:1}});G.t+=1/60;assert.equal(doSave(e,{catch:true}),true);assert.equal(B.owner,null);assert.equal(catches,1);assert.ok(B.vy>0);`,ctx);
});

test('swept contact catches fast shots crossing the hands, misses real gaps, and cannot save beyond the goal line',()=>{
  const ctx=keeperContactContext();
  vm.runInContext(`const e=keeper();Object.assign(B,{x:2,y:1.2,z:.42,owner:null});const hit=keeperTouch(e,{x:-2,y:1.2,z:.42});assert.ok(hit&&hit.hand);assert.ok(Math.abs(hit.x)<.25);B.z=2;assert.equal(keeperTouch(e,{x:-2,y:1.2,z:2}),null);
  e.x=HL+.5;for(const node of [e.rig.handL,e.rig.handR,...Object.values(e.rig.bones)])node.p.x=e.x;Object.assign(B,{x:e.x,y:1.2,z:.42});G.t+=1/60;assert.equal(keeperTouch(e),null);`,ctx);
});

test('the ball update resolves physical hand contact during a fast shot without a timed save',()=>{
  const ctx=keeperContactContext(`function integ(b,dt){b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;}function ballCollide(){}`+part('function updateBall(dt)','function checkRules()'));
  vm.runInContext(`const e=keeper();G.ents=[e];G.stats[1].onT=0;Object.assign(B,{x:-.6,y:1.2,z:.42,vx:15,vy:0,vz:0,owner:null,shot:{team:1,t:G.t},target:null});updateBall(.08);assert.equal(B.owner,e);assert.equal(catches,1);assert.equal(G.stats[1].onT,1);`,ctx);
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
  flight();bufferAction(pd,'pass',.6);B.target={r:{team}};assert.equal(takePrepared(pd,receiver).power,.6);
  flight();bufferAction(pd,'thru',.7);G.state='out';assert.equal(takePrepared(pd,receiver),null);G.state='play';
  inp.charging=true;inp.chg.shoot=true;clearPreparedAgainst(1);assert.equal(pd.queue,null);assert.equal(inp.charging,false);assert.equal(inp.chg.shoot,false);
  `,ctx);
});

test('every own pass type permits charging without a fixed receiver and possession loss clears held and released input',()=>{
  const ctx=context(part('// A buffered action belongs','function userMode(pd)')+part('function userMode(pd)','// the receiver:')+`let now=0;const performance={now:()=>now},navigator={},matchMedia=()=>({matches:false}),NET={role:null};AU.start=()=>{};const IN={btn:{},edge:{shoot:false,shootUp:false},chg:{pass:false,thru:false,shoot:false,lob:false},t0:{},lift:{},chargeK:'shoot',power:0};const LP=()=>PADS[0];`+part('function btnDown(k)','function shotKindFrom('));
  vm.runInContext(`const team={i:0},sender={team},a={team},b={team},enemy={team:{i:1}},pd={ti:0,ctrl:a,inp:IN};PADS[0]=pd;
  for(const kind of ['ground','through','throughLob','lob','cross','throw']){Object.assign(B,{owner:null,lastTeam:0,kicker:sender,kickT:G.t,shot:null,target:{r:a,kind}});IN.btn.shoot=false;now=0;btnDown('shoot');assert.equal(IN.charging,true);now=480;IN.power=chargePower();btnUp('shoot');assert.equal(IN.edge.shootUp,true);bufferAction(pd,'shoot',IN.power);const old=pd.queue;B.target=kind==='cross'?null:{r:b,kind};B.kicker={team};G.t+=9;assert.equal(bufferedValid(pd,old,b),true);assert.ok(Math.abs(takePrepared(pd,b).power-.8)<1e-9);IN.edge.shootUp=false;}
  B.owner=sender;sender.kick={pass:{kind:'cross',receiver:a}};B.lastTeam=0;assert.equal(incomingFlight(pd),true);bufferAction(pd,'shoot',.7);const old=pd.queue;IN.btn.shoot=false;btnDown('shoot');IN.power=.9;B.owner=enemy;B.lastTeam=1;syncPreparedInputs();assert.equal(pd.queue,null);assert.equal(IN.charging,false);assert.equal(IN.chg.shoot,false);B.owner=null;B.lastTeam=0;B.kicker=sender;assert.equal(bufferedValid(pd,old,b),false);`,ctx);
});

test('an anticipated jump heads an own cross with any actual receiver and preserves the charged shot or headed pass',()=>{
  const ctx=context(`let trapped=0,passed=null;function integ(){}function ballCollide(){}function gainBall(){trapped++;}function offsideHit(){return false;}function aerialDuel(e){return e;}function kickBall(e,vx,vy,vz){Object.assign(B,{owner:null,vx,vy,vz,lastTeam:e.team.i,kicker:e,kickT:G.t,target:null,shot:null});}function pickTarget(){return {best:ally};}function passExec(e,r,kind,pt,power){passed={r,kind,power};kickBall(e,12,0,0);}`+part('// A buffered action belongs','function userMode(pd)')+part('function header(e)','function gainBall(e)')+part('function updateBall(dt)','function checkRules()'));
  vm.runInContext(`const team={i:0,dir:1},sender={team},e={team,x:HL-10,z:0,isGK:false,cool:0,stun:0,act:ACT.HEAD,actT:.16,headerLead:.22,st:{shoot:.9}},ally={team},pd={ti:0,ctrl:ally,inp:{chg:{},charging:false,jy:0}};PADS[0]=pd;G.ents=[e];G.stats[0].shots=0;function cross(){Object.assign(B,{x:e.x+.2,z:0,y:1.95,vx:10,vy:-1,vz:0,owner:null,target:{r:ally,kind:'cross'},kicker:sender,kickT:G.t,lastTeam:0,shot:null});e.cool=0;}
  cross();bufferAction(pd,'shoot',.85);updateBall(STEP);assert.equal(B.shot.kind,'header');assert.equal(G.stats[0].shots,1);assert.equal(trapped,0);assert.equal(e.actT,.16);cross();bufferAction(pd,'pass',.65);updateBall(STEP);assert.equal(passed.r,ally);assert.equal(passed.power,.65);assert.equal(B.shot,null);`,ctx);
});

test('a charged first-time finish is not replaced by a heavy touch or an automatic high-speed deflection',()=>{
  const ctx=context(`let taken=0;function integ(){}function ballCollide(){}function heavyTouch(){throw Error('unexpected trap');}function gainBall(e){assert.equal(takePrepared(PADS[0],e).power,.8);taken++;}`+part('// A buffered action belongs','function userMode(pd)')+part('function updateBall(dt)','function checkRules()'));
  vm.runInContext(`const team={i:0},sender={team},e={team,x:0,z:0,act:0,stun:0,cool:0},pd={ti:0,ctrl:e,inp:{charging:false,chg:{}}};PADS[0]=pd;G.ents=[e];Object.assign(B,{x:.3,z:0,y:.5,vx:31,vz:0,vy:0,owner:null,kicker:sender,kickT:G.t,lastTeam:0,shot:null,target:null});bufferAction(pd,'shoot',.8);updateBall(STEP);assert.equal(taken,1);`,ctx);
});

test('heading prepares the jump before a high incoming cross reaches the player',()=>{
  const ctx=context(`function trajAt(){return{x:.1,z:0,y:1.95};}`+part('// A buffered action belongs','function userMode(pd)')+part('function anticipateHeader(e)','function moveEnt(e,dt)'));
  vm.runInContext(`const team={i:0},e={team,x:0,z:0,vx:0,vz:0,cool:0,stun:0,act:0},sender={team},pd={ti:0,ctrl:e,inp:{charging:false,chg:{}}};PADS[0]=pd;Object.assign(B,{x:.6,z:0,y:2.2,owner:null,kicker:sender,lastTeam:0,shot:null});bufferAction(pd,'shoot',.8);anticipateHeader(e);assert.equal(e.act,ACT.HEAD);assert.ok(e.headerLead>=.08&&e.headerLead<=.3);assert.equal(pd.queue.power,.8);`,ctx);
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

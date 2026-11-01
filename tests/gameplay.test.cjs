const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const h=fs.readFileSync(process.argv[2]||require('node:path').join(__dirname,'../public/index.html'),'utf8');
const part=(a,b)=>{const i=h.indexOf(a),j=h.indexOf(b,i);assert.ok(i>=0&&j>i,a);return h.slice(i,j);};
const ctx=vm.createContext({assert,console,performance:{now:()=>600},localStorage:{getItem(){},setItem(){}}});
vm.runInContext([
part('const PI=','/* ================= renderer & scene'),
part('const easeOut=','const fadeW='),
`const G={t:10,state:'play',clock:20,stats:[{},{}],ents:[]};const B={x:0,y:BR,z:0,vx:0,vy:0,vz:0,kickT:10};const SKINS=Array(5),HAIRS=Array(6),BOOTS=Array(6);let D=DIFFS[1];const STEP=1/60;
const PADS=[null,null],IN={t0:{pass:0,thru:0,lob:0,shoot:0},chg:{},edge:{}},NET={online:false};
const padOf=t=>PADS[t.i],LP=()=>PADS[0],oppOf=t=>t.opp,ownGoalX=t=>-t.dir*HL;
const clearEdges=i=>{for(const k in i.edge)i.edge[k]=false;};function hudTag(){}function skillBeat(){}function say(){}const AU={excite(){}};`,
part('function makeRoster(ci)','const gkQ='),
part('function nearestOpp(e,x,z)','/* offside:'),
part('function shotVel(p,power','function shootExec('),
part('function skillStep(e,dt)','/* ================= AI'),
part('function toW(t,lx,lz)','function carrierThink(e,dt)'),
part('function setCtrl(pd,e,why)','function nearestHuman('),
part('const inCrossZone=','// power: how long'),
part('function shouldCollectLoose(c)','function userStep('),
part('function stopMatchMotion()','function showResult('),
part('const CHARGE_MS=','function skillSwipe('),
part('function groundSpeedFor(d,vEnd)','function ballCollide('),
].join('\n'),ctx);
vm.runInContext(`
function player(k,role='DF',x=-15,z=k*5){return {k,i:k,role,lbl:role==='DF'?'CB':role==='MF'?'CM':'ST',base:[role==='DF'?-.65:role==='MF'?-.3:.05,(k-5)*.1],x,z,vx:0,vz:0,mx:0,mz:0,face:0,off:false,stun:0,act:0,cool:0,vmax:8,stamina:1,st:{pass:.8,shoot:.8,tackle:.8,drib:.8},hid:{att:1,def:1,roam:1},wide:false,ipt:1,ipx:5,ipz:0};}
const t={i:0,dir:1,players:[],inPoss:false,lineSm:-.5,lastLine:.8,ment:0},o={i:1,dir:-1,players:[]};t.opp=o;o.opp=t;
for(let k=0;k<11;k++){const e=player(k,k===0?'GK':k<5?'DF':k<8?'MF':'FW',-25+k*2,(k-5)*4);e.isGK=k===0;e.team=t;t.players.push(e);const m=player(k,k===0?'GK':'FW',-15+k*2,(k-5)*4);m.isGK=k===0;m.team=o;o.players.push(m);}
for(let ci=0;ci<CLUBS.length;ci++){const r=makeRoster(ci);assert.equal(r.length,20);assert.ok(r.every(m=>m.feet&&['L','R'].includes(m.feet.foot)&&m.feet.wf>=1&&m.feet.wf<=5));}
assert.equal(FOOT_DATA['ARS|사카'].foot,'L');assert.equal(FOOT_DATA['PSG|뎀벨레'].wf,5);assert.equal(FOOT_DATA['MCI|맥에이두'].foot,'L');
const e=t.players[6];e.feet={foot:'R',wf:2};e.x=0;e.z=0;e.face=0;B.x=.3;B.z=0;
assert.equal(chooseKickFoot(e),'L');assert.equal(kickQuality(e),.68);e.feet.wf=5;assert.equal(kickQuality(e),1);
e.feet.wf=2;scheduleKick(e,.1,.7,()=>{},ACT.KICK);assert.equal(e.ap3,-1);assert.equal(kickQuality(e),.68);
e.ap3=1;B.x=20;B.z=4;o.players[0].z=0;
const strong=shotVel(e,.7,.7,'normal',true,true);e.ap3=-1;const weak=shotVel(e,.7,.7,'normal',true,true);
assert.ok(Math.hypot(weak.vx,weak.vz)<Math.hypot(strong.vx,strong.vz));
for(const kind of ['shoot','pass','thru','lob']){IN.t0[kind]=0;assert.equal(chargePower(kind),1);IN.t0[kind]=300;assert.equal(chargePower(kind),.5);}
// Same opponent may not receive two assigned markers.
B.owner=o.players[7];B.x=B.owner.x;B.z=B.owner.z;t.press1=t.players[8];t.press2=t.players[7];t.defMarks=new Map();
assignDefMarks(t,B.owner,null);assert.equal(new Set(t.defMarks.values()).size,t.defMarks.size);assert.ok(!t.defMarks.has(t.press1));
// AI spacing separates players with overlapping intended positions without steering the human.
e.x=e.z=0;e.mx=e.mz=0;const mate=t.players[5];mate.x=.5;mate.z=0;mate.mx=mate.mz=0;
keepTeamSpacing(e);assert.ok(e.mx<0);PADS[0]={ctrl:e,lock:null,inp:{jx:1,jy:0,edge:{}},lastSwitch:0};e.mx=e.mz=0;keepTeamSpacing(e);assert.equal(e.mx,0);
// A changed joystick direction must not cancel collection of the intended pass.
B.owner=null;B.target={r:e};B.kickT=G.t;setCtrl(PADS[0],e,'recv');PADS[0].inp.jx=-1;
assert.ok(lockActive(PADS[0]));assert.ok(shouldCollectLoose(e));B.owner=e;assert.equal(lockActive(PADS[0]),false);
// Nearby rebounds are collected even with movement input; distant balls remain manual.
B.owner=null;B.target=null;B.x=0;B.z=1;B.y=.1;e.x=e.z=0;e.kick=null;e.act=0;
for(const p of t.players)if(p!==e){p.x=30+p.k;p.z=20;}
assert.ok(shouldCollectLoose(e));B.x=20;assert.equal(shouldCollectLoose(e),false);
B.x=0;B.z=3;B.vx=0;B.vz=-12;e.ipx=30;e.ipz=20;chaseBall(e);assert.ok(e.mz>0);assert.ok(Math.abs(e.mx)<.01);
// Cross zones and all three destination choices work for both attack directions.
for(const dir of [-1,1]){t.dir=dir;e.x=dir*30;e.z=22;assert.ok(inCrossZone(e));
const near=longPlan(e,{jx:1,jy:0},.2,false),far=longPlan(e,{jx:1,jy:0},.9,false);assert.equal(near.kind,'cross');assert.equal(far.kind,'cross');assert.ok(near.pt.z>0&&far.pt.z<0);}
// Croqueta transfers between feet and creates a clear lateral burst in either direction.
for(const side of [-1,1]){e.sk={id:13,side,f0:0,v0:7,evx:0,evz:7,beat:true,launched:false};e.face=0;e.vx=0;e.vz=7;e.x=e.z=0;
const positions=[];for(let i=0;i<=30;i++){e.actT=i/60;skillStep(e,1/60);e.x+=e.vx/60;e.z+=e.vz/60;positions.push(skillBall(e)[0]);}
assert.ok(e.x*side>1.1);assert.ok(positions[0]*side<0&&Math.max(...positions.map(x=>x*side))>.5);}
// End-of-match results clear movement, turn rates and in-flight actions.
G.ents=[e];e.vx=7;e.turnRate=12;e.act=ACT.SKILL;e.kick={};B.spin=3;stopMatchMotion();
assert.equal(e.turnRate,0);assert.equal(e.vx,0);assert.equal(e.act,0);assert.equal(e.kick,null);assert.equal(B.spin,0);
console.log('PASS: 720 foot records; left/weak-foot effects; all charge types; unique defensive marks; spacing/manual control; incoming-pass lock; rebound collection; cross destinations; two-direction croqueta; end-of-match reset.');
`,ctx);

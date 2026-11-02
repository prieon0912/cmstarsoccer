const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const fs=require('fs'),vm=require('vm');
function simulation(html,form='4-3-3',attackDir=1,ballX=38,ballZ=0,seconds=28){
  const source=fs.readFileSync(html,'utf8'),part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);if(i<0||j<=i)throw Error(a);return source.slice(i,j);};
  const ctx=vm.createContext({console});
  vm.runInContext(part('const PI=','/* ================= renderer & scene')+`
    const G={t:0,state:'play',clock:30,ents:[],stats:[{},{}]},B={x:0,z:0,y:BR,vx:0,vz:0,vy:0,lastTeam:0,kickT:0},PADS=[null,null],STEP=1/60,NET={online:false},D=DIFFS[1];
    const padOf=t=>PADS[t.i],oppOf=t=>t.opp;function ownGoalX(t){return-t.dir*HL;}function actEnd(){return 99;}
    function gkThink(e){e.mx=e.mz=0;}
  `+part('function nearestOpp(e,x,z)','// every strike gets')+part('function toW(t,','function carrierThink(e,dt)')+part('function movementAgility(e)','function refThink(r)'),ctx);
  return vm.runInContext(`(()=>{
    const rnd=seeded(423);Math.random=rnd;
    const a={i:0,dir:${attackDir},players:[],ment:0,possT:5,human:false},d={i:1,dir:${-attackDir},players:[],ment:0,human:false};a.opp=d;d.opp=a;
    for(const t of [a,d])for(const [k,f] of FORMS[${JSON.stringify(form)}].entries()){
      const p={team:t,k,i:t.i*11+k,role:f.r,lbl:f.l,base:f.p,x:f.p[0]*HL*t.dir,z:f.p[1]*HW*t.dir,mx:0,mz:0,vx:0,vz:0,face:t.dir*PI/2,phase:0,act:0,actT:0,stun:0,cool:0,tackleCd:0,off:false,isGK:k===0,wide:/^[LR]/.test(f.l),style:f.r==='MF'?'lane':'zone',vmax:8,stamina:1,run:0,pbx:${ballX*attackDir},pbz:${ballZ*attackDir},st:{pace:.8,drib:.8,tackle:.8,phy:.8,pass:.8},hid:{att:f.r==='FW'?2:1,def:f.r==='DF'?2:1,roam:1,run:'bal'}};
      t.players.push(p);G.ents.push(p);
    }
    const c=a.players[9];c.x=${ballX*attackDir};c.z=${ballZ*attackDir};B.x=c.x;B.z=c.z;B.owner=c;
    for(let i=0;i<${Math.round(seconds*60)};i++){G.t+=STEP;for(const t of [a,d])teamThink(t,STEP);for(const e of G.ents){if(e===c)continue;think(e,STEP);moveEnt(e,STEP);}separate();}
    function info(t){const p=t.players.filter(e=>!e.isGK),nearest=p.map(e=>Math.min(...p.filter(m=>m!==e).map(m=>hyp(e.x-m.x,e.z-m.z))));return {nearBall:p.filter(e=>hyp(e.x-B.x,e.z-B.z)<10).length,inAttackingBox:p.filter(e=>e.x*t.dir>HL-16.5&&Math.abs(e.z)<20.16).length,inOwnBox:p.filter(e=>e.x*t.dir<-HL+16.5&&Math.abs(e.z)<20.16).length,nearestMean:nearest.reduce((n,v)=>n+v,0)/p.length,positions:p.map(e=>({k:e.k,role:e.role,lbl:e.lbl,x:e.x*t.dir,z:e.z*t.dir,run:e.run,tx:e.sx*t.dir,tz:e.sz*t.dir}))};}
    return {attack:info(a),defend:info(d)};
  })()`,ctx);
}
const game=path.join(__dirname,'../public/index.html');

test('both teams distribute support and recovery across six formations, both directions, centre and wing attacks',()=>{
  for(const form of ['4-3-3','4-4-2','4-2-3-1','3-5-2','3-4-3','5-3-2'])for(const dir of [-1,1])for(const z of [0,22]){
    const {attack:a,defend:d}=simulation(game,form,dir,38,z),label=JSON.stringify({form,dir,z});
    assert.ok(a.positions.filter(e=>e.role==='DF').every(e=>e.x<1),label+' normal/high defenders should choose recovery support in their own half');
    assert.ok(d.positions.filter(e=>e.role==='FW').every(e=>e.x>-20),label+' high/normal attackers must not collapse into their own box');
    assert.ok(d.positions.some(e=>e.role==='FW'&&e.x>-5),label+' a forward outlet remains available');
    assert.ok(a.positions.some(e=>e.role==='MF'&&e.x>0&&e.x<24),label+' a recycling pass stays available behind the attack');
    assert.ok(d.positions.some(e=>e.role==='MF'&&e.x>-30),label+' midfield screens outside the box');
    assert.ok(a.nearBall<=4&&d.nearBall<=4,label+' support does not join every press at the ball');
    assert.ok(a.nearestMean>10&&d.nearestMean>7,label+' both teams retain usable space');
    assert.ok(a.positions.every(e=>Number.isFinite(e.x)&&Math.abs(e.x)<52.5&&Math.abs(e.z)<34),label);
  }
});

const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');
const part=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert.ok(i>=0&&j>i,a);return html.slice(i,j);};
test('a queued menu preview cannot recreate teams after kick-off',()=>{
  const ctx=vm.createContext({assert});vm.runInContext(`let callback,builds=0;const G={state:'menu'};function setTimeout(f){callback=f;}function clearTimeout(){}function buildTeams(){builds++;}function lineup(){}`+part('let previewTimer=', 'function lineup(')+`menuPreview();G.state='play';callback();assert.equal(builds,0);G.state='menu';menuPreview();callback();assert.equal(builds,1);`,ctx);
});
test('league full-time records only the bound fixture and cannot move a score into another season',()=>{
  const ctx=vm.createContext({assert});vm.runInContext(`const G={mode:'league',score:[3,2],set:{home:20,away:4},goalLog:[]},NET={online:false},AUTH={user:'p'},LG={s:{id:'one',club:20,md:0,custom:true,res:{}}};let records=0,rounds=0;const lsSet=()=>{},sfx={whistle(){}},getRec=()=>({w:0,l:0,d:0}),showResult=()=>{};const seasonIdentity=s=>s.id,resKey=(m,h,a)=>m+':'+h+':'+a;function userFixture(){return {h:20,a:4,home:true,opp:4};}function recordResult(m,h,a,gh,ga){records++;LG.s.res[resKey(m,h,a)]=[gh,ga];}function finishRound(){rounds++;LG.s.md++;}function leagueTable(){return [{i:20,pts:3}];}`+part('function fullTime(){','function getRec()')+`
  const original=LG.s;G.leagueMatch={season:original,identity:'one',md:0,h:20,a:4,user:'p'};fullTime();fullTime();assert.equal(records,1);assert.equal(rounds,1);assert.deepEqual(Array.from(original.res['0:20:4']),[3,2]);
  G.leagueMatch={season:original,identity:'one',md:1,h:20,a:4,user:'p'};LG.s={id:'two',club:20,md:0,res:{}};fullTime();assert.equal(records,1);assert.equal(rounds,1);assert.equal(Object.keys(LG.s.res).length,0);`,ctx);
});
test('a partial hot-reload snapshot never reconstructs a live match with a different roster',()=>{
  const boot=part('function boot(data){','const startBoot=');assert.doesNotMatch(boot,/startMatch\(/);assert.doesNotMatch(boot,/G\.score\s*=\s*data\.score/);assert.match(boot,/if\(AUTH\.token\)LG\.s=null;else lgLoad\(\)/);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mergeProfile:mergeRaw,seasonKey}=require('../lib/profile-state');
const mergeProfile=(current,data,request)=>mergeRaw(current,{leagueEpoch:1,...data},request);
const {fixtures}=require('../lib/league-results');
const copy=v=>JSON.parse(JSON.stringify(v));
function season(seed=73){const s={v:2,id:'season-example-'+seed,club:20,seed,custom:true,md:1,fx:fixtures(seed,20),res:{},goals:{},playedRounds:[0]};for(const [h,a]of s.fx[0])s.res['0:'+h+':'+a]=[2,1];return s;}
test('field-scoped squad saves retain the authoritative season even with a stale season in the payload',()=>{
  const old={name:'cloud',team:{name:'old'},season:season()},incoming={name:'stale',team:{name:'new'},season:season(99)};
  const next=mergeProfile(old,incoming,{fields:['team']});assert.equal(next.name,'cloud');assert.equal(next.season,old.season);assert.equal(next.team.name,'new');
});
test('a current revision cannot roll back rounds, overwrite a score, remove a result or remove played matches',()=>{
  const old={season:season()};for(const change of [s=>s.md=0,s=>s.res[Object.keys(s.res)[0]]=[0,9],s=>delete s.res[Object.keys(s.res)[0]],s=>s.playedRounds=[]]){
    const s=copy(old.season);change(s);assert.throws(()=>mergeProfile(old,{season:s},{}),e=>e.status===409);
  }
  const forward=copy(old.season);forward.md=2;assert.equal(mergeProfile(old,{season:forward},{}).season.md,2);
});
test('replacing or deleting a season requires explicit intent tied to the current season',()=>{
  const old={season:season()},next=season(95);
  for(const s of [next,null]){assert.throws(()=>mergeProfile(old,{season:s},{}),e=>e.status===409);assert.throws(()=>mergeProfile(old,{season:s},{seasonAction:'replace',previousSeason:seasonKey(next)}),e=>e.status===409);assert.equal(mergeProfile(old,{season:s},{seasonAction:'replace',previousSeason:seasonKey(old.season)}).season,s);}
});
test('server checks fixture identity and permits legacy season ID enrichment without dropping progress',()=>{
  const old={season:season()},wrong=copy(old.season);[wrong.fx[0][0][0],wrong.fx[0][0][1]]=wrong.fx[0][0].slice().reverse();assert.throws(()=>mergeProfile(old,{season:wrong},{}),e=>e.status===409);
  const invalid=copy(old.season);invalid.res['20:999:888']=[1,0];assert.throws(()=>mergeProfile(old,{season:invalid},{}),e=>e.status===409);
  const legacy=copy(old.season);delete legacy.id;assert.equal(mergeProfile({season:legacy},old,{}).season.id,old.season.id);
  const rollback=copy(old.season);rollback.md=0;assert.throws(()=>mergeProfile({season:legacy},{season:rollback},{}),e=>e.status===409);
});

test('old client leagues cannot return after reset, even if the profile has no season yet',()=>{
  for(const current of [null,{season:null,leagueEpoch:1}]){
    assert.throws(()=>mergeRaw(current,{season:season()},{seasonAction:'replace',previousSeason:null}),e=>e.status===409);
    assert.throws(()=>mergeRaw(current,{season:season(),leagueEpoch:1},{}),e=>e.status===409);
    assert.equal(mergeRaw(current,{season:season(),leagueEpoch:1},{seasonAction:'replace',previousSeason:null}).season.md,1);
  }
});

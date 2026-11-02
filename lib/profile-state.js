const {fixtures}=require('./league-results');
const LEAGUE_EPOCH=1;
const fields=['name','club','team','skills','tacs','season'];
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const seasonKey=s=>s?JSON.stringify([s.id||null,s.club,s.seed,!!s.custom]):null;
function conflict(){const e=Error('다른 기기의 최신 시즌 기록을 먼저 불러와 주세요.');e.status=409;throw e;}
function mergeProfile(current,data,request){
  let keys=fields;
  if(request.fields!==undefined){if(!Array.isArray(request.fields)||request.fields.some(k=>!fields.includes(k))){const e=Error('저장할 항목을 확인해 주세요.');e.status=400;throw e;}keys=[...new Set(request.fields)];}
  const next={...(current||{}),...Object.fromEntries(keys.filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]])),leagueEpoch:LEAGUE_EPOCH};
  if(keys.includes('season')&&Object.hasOwn(data,'season')&&data.leagueEpoch!==LEAGUE_EPOCH)conflict();
  if(!keys.includes('season')||!Object.hasOwn(data,'season')||equal(current?.season,data.season))return next;
  const old=current?.season,s=data.season;
  if(!old&&s&&(request.seasonAction!=='replace'||request.previousSeason!==null))conflict();
  const sameLegacy=old&&!old.id&&s&&old.club===s.club&&old.seed===s.seed&&!!old.custom===!!s.custom;
  if(old&&seasonKey(old)!==seasonKey(s)&&!sameLegacy){
    if(request.seasonAction!=='replace'||request.previousSeason!==seasonKey(old))conflict();
  }
  if(s==null){if(old&&request.seasonAction!=='replace')conflict();return next;}
  if(s.v!==2||!Number.isInteger(s.club)||s.club<0||s.club>35||!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295||!Number.isInteger(s.md)||s.md<0||s.md>38||!s.res||typeof s.res!=='object'||Array.isArray(s.res))conflict();
  const fx=fixtures(s.seed,s.club),valid=new Set(fx.flatMap((r,md)=>r.map(([h,a])=>md+':'+h+':'+a)));
  if(!equal(s.fx,fx))conflict();
  for(const [k,v]of Object.entries(s.res))if(!valid.has(k)||!Array.isArray(v)||v.length!==2||v.some(x=>!Number.isInteger(x)||x<0||x>999))conflict();
  if(old&&(seasonKey(old)===seasonKey(s)||sameLegacy)){
    if(s.md<old.md)conflict();
    for(const [k,v]of Object.entries(old.res||{}))if(!equal(s.res[k],v))conflict();
    for(const round of old.playedRounds||[])if(!(s.playedRounds||[]).includes(round))conflict();
  }
  return next;
}
module.exports={mergeProfile,seasonKey,LEAGUE_EPOCH};

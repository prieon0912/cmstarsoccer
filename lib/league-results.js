const fail=message=>{const e=Error(message);e.status=400;throw e;};
function metadata(input){
  const {seasonId,club,seed,custom}=input;
  if(typeof seasonId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(seasonId))fail('시즌 정보를 확인해 주세요.');
  if(!Number.isInteger(club)||club<0||club>35||!Number.isInteger(seed)||seed<0||seed>4294967295||typeof custom!=='boolean')fail('시즌 정보를 확인해 주세요.');
  return {seasonId,meta:{club,seed,custom}};
}
function fixtures(seed,entrant){
  let s=seed;const random=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const teams=Array.from({length:20},(_,i)=>i);if(!teams.includes(entrant))teams[19]=entrant;
  for(let i=19;i>0;i--){const j=Math.floor(random()*(i+1));[teams[i],teams[j]]=[teams[j],teams[i]];}
  const first=[];let arr=teams.slice();for(let r=0;r<19;r++){
    const pairs=[];for(let i=0;i<10;i++){let h=arr[i],a=arr[19-i];if(i===0?r%2===1:i%2===1)[h,a]=[a,h];pairs.push([h,a]);}
    first.push(pairs);arr=[arr[0],arr[19],...arr.slice(1,19)];
  }
  return first.concat(first.map(round=>round.map(([h,a])=>[a,h])));
}
const rewardForRank=rank=>!Number.isInteger(rank)||rank<1||rank>20?0:rank===1?100:rank===2?80:rank===3?50:rank<=5?30:rank<=7?20:rank<=10?10:0;
function evaluateSeason(meta,results){
  if(!results||typeof results!=='object'||Array.isArray(results)||Object.keys(results).length!==380)fail('완료된 시즌 경기 결과가 필요해요.');
  const rounds=fixtures(meta.seed,meta.club),rows=rounds[0].flat().map(i=>({i,pts:0,gf:0,ga:0})),lookup=new Map(rows.map(r=>[r.i,r]));
  for(let md=0;md<38;md++)for(const [h,a] of rounds[md]){
    const score=results[md+':'+h+':'+a];if(!Array.isArray(score)||score.length!==2||score.some(n=>!Number.isInteger(n)||n<0||n>999))fail('경기 결과를 확인해 주세요.');
    const [gh,ga]=score,H=lookup.get(h),A=lookup.get(a);H.gf+=gh;H.ga+=ga;A.gf+=ga;A.ga+=gh;
    if(gh>ga)H.pts+=3;else if(gh<ga)A.pts+=3;else{H.pts++;A.pts++;}
  }
  rows.sort((x,y)=>y.pts-x.pts||(y.gf-y.ga)-(x.gf-x.ga)||y.gf-x.gf||x.i-y.i);
  const rank=rows.findIndex(r=>r.i===meta.club)+1;
  return {rank,amount:rewardForRank(rank)};
}
module.exports={metadata,fixtures,rewardForRank,evaluateSeason};

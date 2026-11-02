// Collection book (도감): every card a player has ever owned counts as collected (card_inventory rows only grow).
// Progress and rewards are computed on the server from the live catalogue, and each reward is paid exactly once.
const express=require('express'),db=require('./db'),econ=require('./economy');
const {needUser}=require('./auth');

// clubIndex ranges follow the CLUBS order in public/index.html
const LEAGUES=[{id:'PL',from:0,to:20},{id:'LL',from:20,to:24},{id:'BL',from:24,to:28},{id:'L1',from:28,to:32},{id:'SA',from:32,to:36}];
const REWARDS={
  club:300,                                   // every BASE card of one club
  league:{PL:3000,LL:1000,BL:1000,L1:1000,SA:1000}, // every BASE card of every club in a league
  classStep:5,classStepAmount:200,            // special classes: every 5 different cards
  classComplete:1000,                         // special classes: every active card of the class
  total:[[25,200],[50,400],[100,800],[200,1500],[300,2000],[500,3000],[720,5000]],
};
const leagueOf=i=>LEAGUES.find(l=>i>=l.from&&i<l.to)?.id||null;
const order=(a,b)=>a.clubIndex-b.clubIndex||(a.roster?.k??99)-(b.roster?.k??99)||b.ovr-a.ovr||String(a.name).localeCompare(String(b.name),'ko')||String(a.id).localeCompare(String(b.id));

// cards: live catalogue, inventory: [{cardId,quantity}], claims: [{rewardId,amount,claimedAt}]
function build(cards,inventory,claims){
  const owned=new Set(inventory.filter(r=>r.quantity>0).map(r=>r.cardId)),claimed=new Map(claims.map(c=>[c.rewardId,c]));
  // retired cards stay in the book only for players who already have them
  const entries=cards.filter(c=>c&&(c.active!==false||owned.has(c.id))).sort(order),have=c=>owned.has(c.id);
  const rewards=[];
  const reward=(id,kind,need,progress,amount,extra)=>{const c=claimed.get(id);rewards.push({id,kind,need,progress:Math.min(progress,need),amount:c?c.amount:amount,state:c?'claimed':progress>=need?'ready':'locked',claimedAt:c?.claimedAt||null,...extra});};
  const clubs=new Map();
  for(const c of entries)if(c.classId==='BASE'){if(!clubs.has(c.clubId))clubs.set(c.clubId,{clubId:c.clubId,clubIndex:c.clubIndex,league:leagueOf(c.clubIndex),cardIds:[],owned:0});const g=clubs.get(c.clubId);g.cardIds.push(c.id);if(have(c))g.owned++;}
  const clubList=[...clubs.values()].sort((a,b)=>a.clubIndex-b.clubIndex);
  for(const g of clubList)reward('club:'+g.clubId,'club',g.cardIds.length,g.owned,REWARDS.club,{clubId:g.clubId,league:g.league});
  const leagues=LEAGUES.map(l=>{const list=clubList.filter(g=>g.league===l.id);return {league:l.id,clubs:list.length,total:list.reduce((n,g)=>n+g.cardIds.length,0),owned:list.reduce((n,g)=>n+g.owned,0)};}).filter(l=>l.total>0);
  for(const l of leagues)reward('league:'+l.league,'league',l.total,l.owned,REWARDS.league[l.league]||1000,{league:l.league});
  const classes=new Map();
  for(const c of entries)if(c.classId!=='BASE'){if(!classes.has(c.classId))classes.set(c.classId,{classId:c.classId,cardIds:[],owned:0});const g=classes.get(c.classId);g.cardIds.push(c.id);if(have(c))g.owned++;}
  const classList=[...classes.values()].sort((a,b)=>a.classId.localeCompare(b.classId));
  for(const g of classList){g.cardIds.sort((a,b)=>order(entries.find(c=>c.id===a),entries.find(c=>c.id===b)));
    for(let need=REWARDS.classStep;need<=g.cardIds.length;need+=REWARDS.classStep)reward(`class:${g.classId}:${need}`,'class',need,g.owned,REWARDS.classStepAmount,{classId:g.classId});
    reward(`class:${g.classId}:complete`,'classComplete',g.cardIds.length,g.owned,REWARDS.classComplete,{classId:g.classId});}
  const total=entries.length,ownedCount=entries.filter(have).length;
  for(const [need,amount] of REWARDS.total)if(need<=total)reward('total:'+need,'total',need,ownedCount,amount,{});
  // claimed rewards whose target was later retired by an administrator still show in history
  for(const c of claims)if(!rewards.some(r=>r.id===c.rewardId))rewards.push({id:c.rewardId,kind:'retired',need:0,progress:0,amount:c.amount,state:'claimed',claimedAt:c.claimedAt});
  return {total,owned:ownedCount,clubs:clubList,leagues,classes:classList,rewards,ready:rewards.filter(r=>r.state==='ready').reduce((n,r)=>n+r.amount,0)};
}

async function load(userId){
  const profile=await db.getProfile(userId);const eco=await econ.state(userId,profile?.data);
  const [{cards},claims]=await Promise.all([econ.catalog(),db.collectionClaims(userId)]);
  return {eco,book:build(cards,eco.inventory,claims)};
}

const router=express.Router();router.use(express.json({limit:'16kb'}));router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/',needUser,async(req,res,next)=>{try{const {eco,book}=await load(req.user.id);res.json({...book,coins:eco.coins,inventory:eco.inventory});}catch(e){next(e);}});
router.post('/claim',needUser,async(req,res,next)=>{try{
  const {rewardIds,all}=req.body||{};
  if(all!==true&&(!Array.isArray(rewardIds)||!rewardIds.length||rewardIds.length>200||!rewardIds.every(id=>typeof id==='string'&&id.length<=80)))econ.fail('받을 보상을 확인해 주세요.');
  const {book}=await load(req.user.id),byId=new Map(book.rewards.map(r=>[r.id,r]));
  const wanted=all===true?book.rewards.filter(r=>r.state==='ready'):[...new Set(rewardIds)].map(id=>byId.get(id));
  if(wanted.some(r=>!r))econ.fail('없는 도감 보상이에요.',404);
  if(wanted.some(r=>r.state==='locked'))econ.fail('아직 조건을 채우지 못한 보상이에요.',409);
  const ready=wanted.filter(r=>r.state==='ready').map(r=>({id:r.id,amount:r.amount}));
  const paid=ready.length?await db.claimCollectionRewards(req.user.id,ready):{claimed:[],coins:0};
  const after=await load(req.user.id);
  res.json({claimed:paid.claimed,credited:paid.coins,...after.book,coins:after.eco.coins,inventory:after.eco.inventory});
}catch(e){next(e);}});
router.use((e,req,res,next)=>res.status(e.status||500).json({error:e.status?e.message:'도감 요청을 처리하지 못했어요.'}));
module.exports={router,build,REWARDS,LEAGUES,leagueOf};

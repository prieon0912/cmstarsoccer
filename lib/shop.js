const express=require('express'),db=require('./db'),econ=require('./economy');
const {needUser}=require('./auth');const router=express.Router();router.use(express.json({limit:'8kb'}));router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/catalog',async(req,res,next)=>{try{const {cards,classes}=await econ.catalog();res.json({cards,classes});}catch(e){next(e);}});
router.get('/',needUser,async(req,res,next)=>{try{
  const profile=await db.getProfile(req.user.id),state=await econ.state(req.user.id,profile?.data),{cards,packages}=await econ.catalog();
  const now=Date.now(),packs=packages.filter(p=>p.published).map(p=>{try{const c=econ.compilePack(p,cards),period=econ.packagePeriod(p,now);return {...p,quote:c.quote,odds:c.odds,ovrOdds:c.ovrOdds,available:period.state==='open',period:period.state,error:period.message};}catch(e){return {...p,available:false,error:e.message,odds:[],ovrOdds:[]};}});res.json({...state,packs,serverNow:new Date(now).toISOString()});
}catch(e){next(e);}});
router.post('/draw',needUser,async(req,res,next)=>{try{
  const {packId,count,requestId,quote}=req.body;if(!Number.isInteger(count)||count<1||count>10)econ.fail('뽑기는 1~10회까지 가능해요.');if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))econ.fail('뽑기 요청 번호를 확인해 주세요.');
  const profile=await db.getProfile(req.user.id);await econ.state(req.user.id,profile?.data);
  let result=await db.getDraw(req.user.id,requestId);
  if(result&&(result.packId!==packId||result.count!==count))econ.fail('이미 다른 뽑기에 사용한 요청 번호예요.',409);
  if(!result){const {cards,packages}=await econ.catalog(),pack=packages.find(p=>p.id===packId&&p.published);if(!pack)econ.fail('판매 중인 패키지가 아니에요.',404);const compiled=econ.compilePack(pack,cards);
    const checkPeriod=()=>{const period=econ.packagePeriod(pack);if(period.state!=='open')econ.fail(period.message,409);};checkPeriod();
    if(quote!==compiled.quote)econ.fail('가격·확률 또는 이용 기간이 변경됐어요. 상점을 다시 불러와 주세요.',409);
    result=await db.purchasePack(req.user.id,requestId,pack.price*count,()=>{checkPeriod();return {packId,count,cost:pack.price*count,quote,cardIds:econ.draw(compiled,count),at:new Date().toISOString()};});
    if(result.packId!==packId||result.count!==count)econ.fail('이미 다른 뽑기에 사용한 요청 번호예요.',409);
  }
  res.json({result,...await db.economyState(req.user.id)});
}catch(e){next(e);}});
router.use((e,req,res,next)=>res.status(e.status||500).json({error:e.status?e.message:'상점 요청을 처리하지 못했어요.'}));
module.exports={router};

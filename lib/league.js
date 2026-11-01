const express=require('express'),db=require('./db'),econ=require('./economy'),rules=require('./league-results');
const {needUser}=require('./auth');const router=express.Router();router.use(express.json({limit:'32kb'}));router.use(needUser);
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.post('/start',async(req,res,next)=>{try{
  const {seasonId,meta}=rules.metadata(req.body),stored=await db.startLeague(req.user.id,seasonId,meta);
  if(stored.meta.club!==meta.club||stored.meta.seed!==meta.seed||stored.meta.custom!==meta.custom)econ.fail('다른 시즌에 사용한 요청 번호예요.',409);
  res.json({seasonId});
}catch(e){next(e);}});
router.post('/finish',async(req,res,next)=>{try{
  const {seasonId}=req.body;if(typeof seasonId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(seasonId))econ.fail('시즌 정보를 확인해 주세요.');
  const stored=await db.getLeague(req.user.id,seasonId);if(!stored)econ.fail('등록된 시즌을 찾을 수 없어요.',404);
  const profile=await db.getProfile(req.user.id);await econ.state(req.user.id,profile?.data);
  let result=stored.settlement;
  if(!result){const evaluated=rules.evaluateSeason(stored.meta,req.body.results);result=await db.settleLeague(req.user.id,seasonId,req.body.results,{seasonId,...evaluated});}
  res.json({result,...await db.economyState(req.user.id)});
}catch(e){next(e);}});
router.use((e,req,res,next)=>res.status(e.status||500).json({error:e.status?e.message:'시즌 결과를 저장하지 못했어요.'}));
module.exports={router};

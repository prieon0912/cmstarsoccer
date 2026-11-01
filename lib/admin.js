const crypto = require('node:crypto');
const express = require('express');
const db = require('./db');
const { hashPassword, checkPassword } = require('./password');
const bootstrapAccount = require('./admin-bootstrap.json');
const econ=require('./economy');
const router = express.Router();
const COOKIE = 'fl11_admin', LIFE_MS = 4 * 60 * 60 * 1000;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const csrfFor = token => hash('admin-csrf:' + token);
const cookieOptions = req => ({ httpOnly: true, secure: req.secure || process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/admin' });
const dummy = hashPassword(crypto.randomBytes(24).toString('hex'));
const attempts = new Map();
setInterval(() => { for(const [ip,v] of attempts)if(Date.now()-v.time>15*60*1000)attempts.delete(ip); },60000).unref();

router.use(express.json({ limit: '128kb' }));
router.use((req,res,next) => {
  res.set('Cache-Control','no-store');
  res.set('X-Content-Type-Options','nosniff');
  if(req.method!=='GET' && req.get('origin')) {
    if(req.get('origin') !== `${req.protocol}://${req.get('host')}`)return res.status(403).json({error:'이 사이트에서 다시 시도해 주세요.'});
  }
  next();
});
async function needAdmin(req,res,next) {
  try {
    const cookies=String(req.get('cookie')||'').split(';').map(c=>c.trim());
    const pair=cookies.find(c=>c.startsWith(COOKIE+'=')),token=pair&&pair.slice(COOKIE.length+1);
    const admin=token&&/^[A-Za-z0-9_-]{43}$/.test(token)&&await db.adminSession(hash(token));
    if(!admin)return res.status(401).json({error:'관리자 로그인이 필요해요.'});
    req.admin=admin;req.adminToken=token;next();
  }catch(e){next(e);}
}
function needCsrf(req,res,next) {
  const want=csrfFor(req.adminToken),got=req.get('x-csrf-token')||'';
  if(!/^[a-f0-9]{64}$/.test(got)||!crypto.timingSafeEqual(Buffer.from(got),Buffer.from(want)))return res.status(403).json({error:'화면을 새로고침한 뒤 다시 시도해 주세요.'});
  next();
}
async function signIn(req,res,admin,password,fromGame=false){
  const now=Date.now(),hit=attempts.get(req.ip)||{count:0,time:now};
  if(now-hit.time>15*60*1000){hit.count=0;hit.time=now;}
  hit.count++;attempts.set(req.ip,hit);
  if(hit.count>10){res.status(429).json({error:'로그인 시도가 많아요. 15분 후 다시 시도해 주세요.'});return;}
  const ok=await checkPassword(password,admin?admin.pw_hash:await dummy);
  if(!ok||!admin||!admin.active){res.status(401).json({error:'아이디나 비밀번호가 맞지 않아요.'});return;}
  const token=crypto.randomBytes(32).toString('base64url');
  await db.addAdminSession(hash(token),admin.id,new Date(now+LIFE_MS));await db.touchAdmin(admin.id);
  res.cookie(COOKIE,token,{...cookieOptions(req),maxAge:LIFE_MS});
  res.json({...(fromGame?{kind:'admin',redirect:'/admin/'}:{}),admin:{username:admin.username,role:admin.role},csrfToken:csrfFor(token)});
}
router.post('/login',async(req,res,next)=>{
  try {
    const username=String(req.body.username||'').trim(),password=String(req.body.password||'');
    if(!/^[A-Za-z0-9_-]{2,32}$/.test(username)||password.length>72)return res.status(400).json({error:'아이디와 비밀번호를 확인해 주세요.'});
    const admin=await db.adminByName(username.normalize('NFC').toLowerCase());
    await signIn(req,res,admin,password);
  }catch(e){next(e);}
});
router.get('/me',needAdmin,(req,res)=>res.json({admin:req.admin,csrfToken:csrfFor(req.adminToken),store:db.kind,persistent:db.kind==='postgres'}));
router.get('/overview',needAdmin,async(req,res,next)=>{
  try{res.json({...(await db.adminOverview()),packsEnabled:true});}catch(e){next(e);}
});
router.post('/logout',needAdmin,needCsrf,async(req,res,next)=>{
  try{await db.dropAdminSession(hash(req.adminToken));res.clearCookie(COOKIE,cookieOptions(req));res.json({ok:true});}catch(e){next(e);}
});
router.get('/catalog',needAdmin,async(req,res,next)=>{try{res.json(await econ.catalog());}catch(e){next(e);}});
router.get('/cards',needAdmin,async(req,res,next)=>{try{
  const {cards}=await econ.catalog(),q=String(req.query.q||'').toLowerCase(),offset=Math.max(0,parseInt(req.query.offset)||0),limit=Math.min(100,Math.max(1,parseInt(req.query.limit)||40));
  const list=cards.filter(c=>(!q||(c.name+' '+c.id+' '+c.clubId+' '+c.classId).toLowerCase().includes(q))&&(!req.query.classId||c.classId===req.query.classId)&&(!req.query.ovr||c.ovr===+req.query.ovr));
  res.json({cards:list.slice(offset,offset+limit),total:list.length});
}catch(e){next(e);}});
router.post('/cards',needAdmin,needCsrf,async(req,res,next)=>{try{const {cards,classes}=await econ.catalog(),existing=req.body.id?cards.find(c=>c.id===req.body.id):null;if(req.body.id&&!existing)econ.fail('카드를 찾을 수 없어요.',404);
  const card=econ.validateCard(req.body,classes,existing);await db.saveCatalogEntry('card',card,req.admin.id);econ.invalidate();res.json({card});}catch(e){next(e);}});
router.post('/cards/bulk',needAdmin,needCsrf,async(req,res,next)=>{try{
  const {cards,classes}=await econ.catalog(),copies=econ.classCopies(req.body,classes,cards),ids=await db.addClassCards(copies.cards,req.admin.id);econ.invalidate();
  res.json({created:ids.length,skipped:copies.skipped+copies.cards.length-ids.length,cardIds:ids});
}catch(e){next(e);}});
router.post('/classes',needAdmin,needCsrf,async(req,res,next)=>{try{const cls=econ.validateClass(req.body);if(cls.id==='BASE')econ.fail('베이스 클래스의 실버 디자인은 고정이에요.');await db.saveCatalogEntry('class',cls,req.admin.id);econ.invalidate();res.json({class:cls});}catch(e){next(e);}});
router.post('/packages/preview',needAdmin,needCsrf,async(req,res,next)=>{try{const {cards,classes}=await econ.catalog(),pack=econ.validatePackage(req.body,classes,cards),c=econ.compilePack(pack,cards);res.json({pack,odds:c.odds,ovrOdds:c.ovrOdds});}catch(e){next(e);}});
router.post('/packages',needAdmin,needCsrf,async(req,res,next)=>{try{const {cards,classes}=await econ.catalog(),pack=econ.validatePackage(req.body,classes,cards);await db.saveCatalogEntry('package',pack,req.admin.id);econ.invalidate();res.json({pack});}catch(e){next(e);}});
// No public registration endpoint. Provision administrators only with the server-side script.
router.use((err,req,res,next)=>{console.error('[admin]',err.message);res.status(err.status||(err.type==='entity.parse.failed'?400:500)).json({error:err.status?err.message:'관리자 요청을 처리하지 못했어요.'});});
async function bootstrap(){
  // Server-only hash; never copy this configuration into public/ or a login response.
  if(!bootstrapAccount.username||!/^s1\$/.test(bootstrapAccount.passwordHash))throw new Error('관리자 초기 설정이 올바르지 않아요.');
  await db.createAdmin(bootstrapAccount.username,bootstrapAccount.username.toLowerCase(),bootstrapAccount.passwordHash);
}
async function trySiteLogin(req,res,username,password){
  const admin=await db.adminByName(username.normalize('NFC').toLowerCase());if(!admin)return false;
  if(password.length>72){res.status(400).json({error:'아이디나 비밀번호를 확인해 주세요.'});return true;}
  // This endpoint is also reachable through the game's login router; keep the origin check here too.
  if(req.get('origin')&&req.get('origin')!==`${req.protocol}://${req.get('host')}`){res.status(403).json({error:'이 사이트에서 다시 시도해 주세요.'});return true;}
  await signIn(req,res,admin,password,true);return true;
}
module.exports={router,bootstrap,trySiteLogin};

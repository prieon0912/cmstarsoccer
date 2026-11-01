const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {hashPassword,checkPassword}=require('../lib/password');

test('game login authenticates admins separately; cookie, CSRF and regular-user isolation',async()=>{
  const previous=process.env.DATABASE_URL;delete process.env.DATABASE_URL;
  const db=require('../lib/db');if(previous!==undefined)process.env.DATABASE_URL=previous;
  const config=require('../lib/admin-bootstrap.json'),originalHash=config.passwordHash;
  const password='local-admin-test-password';config.passwordHash=await hashPassword(password);
  const auth=require('../lib/auth'),admin=require('../lib/admin'),express=require('express');
  await auth.init();await admin.bootstrap();
  const stored=await db.adminByName('prieon_auth');
  assert.ok(await checkPassword(password,stored.pw_hash));assert.notEqual(stored.pw_hash,password);
  assert.equal(await db.createAdmin('prieon_auth','prieon_auth',await hashPassword('different-password')),null);
  assert.ok(await checkPassword(password,(await db.adminByName('prieon_auth')).pw_hash));
  const app=express();app.set('trust proxy',1);app.use('/api/admin',admin.router);app.use('/api',auth.router);
  app.use(express.static(path.join(__dirname,'../public')));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const send=(url,body,headers={})=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  try{
    assert.equal((await fetch(base+'/api/admin/me')).status,401);
    const playerResponse=await send('/api/auth/register',{username:'normal_player',password:'player-password',profile:{team:{name:'team'},role:'owner'}});
    assert.equal(playerResponse.status,201);const player=await playerResponse.json();
    assert.equal((await fetch(base+'/api/admin/me',{headers:{Authorization:'Bearer '+player.token}})).status,401);
    assert.equal((await send('/api/auth/register',{username:'prieon_auth',password})).status,409);
    assert.equal((await send('/api/admin/register',{username:'intruder',password})).status,404);
    assert.equal((await send('/api/auth/login',{username:'prieon_auth',password:'wrong-password'})).status,401);
    const response=await send('/api/auth/login',{username:'prieon_auth',password},{'X-Forwarded-Proto':'https'});
    assert.equal(response.status,200);const data=await response.json();
    assert.equal(data.kind,'admin');assert.equal(data.redirect,'/admin/');assert.equal(data.admin.username,'prieon_auth');
    assert.equal(data.token,undefined);assert.equal(data.profile,undefined);assert.equal(data.admin.pw_hash,undefined);
    const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Path=\/api\/admin/);
    const credentials={Cookie:cookie.split(';')[0]};
    const meResponse=await fetch(base+'/api/admin/me',{headers:credentials});assert.equal(meResponse.status,200);
    const me=await meResponse.json();assert.equal(me.admin.role,'owner');assert.match(me.csrfToken,/^[a-f0-9]{64}$/);
    const overview=await fetch(base+'/api/admin/overview',{headers:credentials});assert.equal(overview.status,200);
    assert.equal((await overview.json()).packsEnabled,true);
    assert.equal((await fetch(base+'/api/me',{headers:credentials})).status,401);
    assert.equal((await send('/api/admin/logout',{},credentials)).status,403);
    assert.equal((await send('/api/admin/logout',{}, {...credentials,'X-CSRF-Token':'z'.repeat(64)})).status,403);
    assert.equal((await send('/api/auth/login',{username:'prieon_auth',password},{Origin:'https://untrusted.example'})).status,403);
    assert.equal((await send('/api/admin/logout',{}, {...credentials,'X-CSRF-Token':me.csrfToken})).status,200);
    assert.equal((await fetch(base+'/api/admin/me',{headers:credentials})).status,401);
    assert.equal((await fetch(base+'/lib/admin-bootstrap.json')).status,404);
    const html=await (await fetch(base+'/admin/')).text();assert.match(html,/운영자 로그인/);assert.ok(!html.includes(originalHash));
    assert.equal((await fetch(base+'/api/me',{headers:{Authorization:'Bearer '+player.token}})).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));config.passwordHash=originalHash;await db.close();}
});

test('admin login opens a separate window after server validation without replacing game session',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const start=html.indexOf('async function authDo(kind)'),end=html.indexOf('async function authLogout()',start),code=html.slice(start,end);
  function context(failed=false,blocked=false){
    const elements={authU:{value:'prieon_auth'},authP:{value:'test-only-password'},authC:{value:'0'}};
    const ctx=vm.createContext({});
    vm.runInContext(`const AUTH={token:'game-session',user:'game-player'};let tmMsg='',tmTab='acc',opened=0,closed=0,target='',checked=false;
      const child={closed:false,opener:{},location:{replace(value){if(!checked)throw Error('Opened before verification');target=value;}},focus(){},close(){closed++;this.closed=true;}};
      const window={open(){opened++;return ${blocked?'null':'child'};},location:{assign(value){target=value;}}};
      function renderTmBody(){}function renderTeam(){}async function srvEnsureSaved(){return true;}
      function srvAdopt(){throw Error('Must not replace the player profile');}function authSave(){throw Error('Must not replace the player session');}
      async function api(){if(opened!==1)throw Error('Missing user-gesture window');${failed?"throw Error('Wrong password');":"checked=true;return {kind:'admin',redirect:'/admin/'};"}}
      ${code}`,ctx);
    ctx.$=id=>elements[id];return ctx;
  }
  const success=context();await vm.runInContext("authDo('login')",success);
  assert.equal(vm.runInContext('target',success),'/admin/');assert.equal(vm.runInContext('AUTH.token',success),'game-session');assert.equal(vm.runInContext('closed',success),0);
  const failure=context(true);await vm.runInContext("authDo('login')",failure);assert.equal(vm.runInContext('closed',failure),1);assert.equal(vm.runInContext('target',failure),'');
  const fallback=context(false,true);await vm.runInContext("authDo('login')",fallback);assert.equal(vm.runInContext('target',fallback),'/admin/');
});

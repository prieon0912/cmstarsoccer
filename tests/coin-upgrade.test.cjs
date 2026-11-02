const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
test('existing accounts receive 1000 once, new accounts start at 2000, and migration survives restart',async()=>{
  const pg=new PGlite();let tail=Promise.resolve();
  const load=()=>{const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/db.js'),'utf8'),{module,__dirname:path.join(__dirname,'../lib'),process:{env:{DATABASE_URL:'postgres://localhost/test'}},structuredClone,require(name){if(name!=='pg')return require(name);return {Pool:class{query(sql,args){return args||/^\s*SELECT\b/i.test(sql)?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1)||{rows:[]});}async connect(){let release;const before=tail;tail=new Promise(r=>release=r);await before;return {query:this.query.bind(this),release};}end(){}}};}});return module.exports;};
  try{
    // An old deployment with spent and untouched balances, plus an account that has never opened its squad.
    await pg.exec(`CREATE TABLE users(id BIGSERIAL PRIMARY KEY,username TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,pw_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),last_login TIMESTAMPTZ);
      CREATE TABLE wallets(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,coins INTEGER NOT NULL DEFAULT 1000 CHECK(coins>=0));
      INSERT INTO users(username,name_key,pw_hash) VALUES('spent','spent','hash'),('saved','saved','hash'),('lazy','lazy','hash');
      INSERT INTO wallets(user_id,coins) VALUES(1,75),(2,4300);`);
    let db=load();await db.init();
    assert.equal((await db.economyState(1)).coins,1075);assert.equal((await db.economyState(2)).coins,5300);
    await db.ensureEconomy(3,['starter']);assert.equal((await db.economyState(3)).coins,2000);assert.equal((await db.economyState(3)).inventory[0].cardId,'starter');
    const report=(await db.adminOverview()).coinUpgrade;assert.equal(report.recipients,3);assert.equal(report.creditedWallets,2);assert.equal(report.pendingWallets,1);
    const added=await db.createUser('new','new','hash');await db.ensureEconomy(added.id,['new-starter']);assert.equal((await db.economyState(added.id)).coins,2000);
    await db.purchasePack(1,'purchase',100,()=>({cardIds:['draw']}));
    db=load();await db.init();await db.init();await db.ensureEconomy(1,[]);
    assert.equal((await db.economyState(1)).coins,975);assert.equal((await db.economyState(2)).coins,5300);assert.equal((await db.economyState(3)).coins,2000);assert.equal((await db.economyState(added.id)).coins,2000);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM coin_awards')).rows[0].n,3);
    assert.equal((await db.adminOverview()).coinUpgrade.recipients,3);
  }finally{await pg.close();}
});

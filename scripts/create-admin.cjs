// Usage: ADMIN_PASSWORD=<password> node scripts/create-admin.cjs <username>
// Or add --sql <output.sql> to prepare a one-time Neon SQL Editor script without a DB connection.
const fs=require('node:fs');
const path=require('node:path');
const {hashPassword}=require('../lib/password');
async function main(){
  const args=process.argv.slice(2),username=args[0],password=process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  if(!username||!/^[A-Za-z0-9_-]{2,32}$/.test(username))throw new Error('관리자 아이디를 지정해 주세요(영문·숫자·_·-, 2~32자).');
  if(!password||password.length<8||password.length>72)throw new Error('ADMIN_PASSWORD 환경 변수에 비밀번호를 설정해 주세요(8~72자).');
  if(args.length!==1&&!(args.length===3&&args[1]==='--sql'))throw new Error('사용법: node scripts/create-admin.cjs <아이디> [--sql <파일>]');
  const pwHash=await hashPassword(password),nameKey=username.normalize('NFC').toLowerCase();
  if(args[1]==='--sql'){
    const quote=s=>"'"+s.replace(/'/g,"''")+"'";
    const schema=fs.readFileSync(path.join(__dirname,'../lib/admin-schema.sql'),'utf8');
    const sql=`-- Run once in the existing game's Neon database. Contains a password hash, never a plaintext password.\nBEGIN;\n${schema}\nINSERT INTO admins(username,name_key,pw_hash) VALUES(${quote(username)},${quote(nameKey)},${quote(pwHash)}) ON CONFLICT(name_key) DO NOTHING;\nSELECT username,role,active FROM admins WHERE name_key=${quote(nameKey)};\nCOMMIT;\n`;
    fs.writeFileSync(path.resolve(args[2]),sql,{encoding:'utf8',mode:0o600});console.log('관리자 생성 SQL 파일을 준비했어요. 기존 계정의 비밀번호는 변경하지 않아요.');return;
  }
  const db=require('../lib/db');
  if(db.kind!=='postgres'){await db.close();throw new Error('기존 Neon의 DATABASE_URL을 먼저 연결해 주세요. 임시 메모리에는 관리자를 만들지 않아요.');}
  try{
    await db.init();const admin=await db.createAdmin(username,nameKey,pwHash);
    console.log(admin?`관리자 ${admin.username} 계정을 생성했어요.`:'이미 있는 관리자예요. 기존 계정은 변경하지 않았어요.');
  }finally{await db.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

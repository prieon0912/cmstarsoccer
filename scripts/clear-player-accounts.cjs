const db=require('../lib/db');
const owner=require('../lib/admin-bootstrap.json');
(async()=>{
  if(db.kind!=='postgres')throw Error('실제 DB의 DATABASE_URL이 필요합니다. 임시 저장소는 삭제하지 않습니다.');
  await db.init();const admin=await db.adminByName(owner.username.toLowerCase());
  if(!admin)throw Error('기본 관리자 계정이 준비된 서버에서 실행해 주세요.');
  const before=await db.adminOverview();
  if(!process.argv.includes('--delete-players')){console.log('삭제 대상 일반 계정: '+before.users+'개. 실행하려면 --delete-players를 지정하세요.');return;}
  const count=await db.clearUsers();
  if(!(await db.adminByName(owner.username.toLowerCase())))throw Error('관리자 계정을 확인해 주세요.');
  console.log('일반 계정 '+count+'개 삭제 완료. 관리자와 카드·패키지 설정은 보존했습니다.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.close());

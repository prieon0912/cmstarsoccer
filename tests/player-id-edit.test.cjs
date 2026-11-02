const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const presets=require('../public/admin/ballon-presets'),classes=Object.values(require('../public/data/card-classes')),base=require('../public/data/player-catalog'),econ=require('../lib/economy');
test('editing an existing player identity applies the requested ID while preserving card identity and attributes',()=>{
  const p=presets.find(p=>p.id==='modric'),club=base.find(c=>c.clubId===p.clubId);
  const input={name:'루카 모드리치',classId:'BALLON_DOR',clubIndex:club.clubIndex,pos:p.pos,ovr:p.ovr,playerId:'old-modric-id',roster:{num:p.num,stars:p.stars,st:Object.fromEntries(Object.entries(p.st).map(([k,v])=>[k,v/100])),hid:p.hid,feet:{foot:p.foot,wf:p.wf}}};
  const existing=econ.validateCard(input,classes,null),updated=econ.validateCard({...input,playerId:'MIL|모드리치'},classes,existing);
  assert.equal(updated.playerId,'MIL|모드리치');assert.equal(updated.id,existing.id);assert.equal(updated.ovr,existing.ovr);assert.deepEqual(updated.roster,existing.roster);
  const omitted={...input};delete omitted.playerId;assert.equal(econ.validateCard(omitted,classes,updated).playerId,'MIL|모드리치');
  assert.throws(()=>econ.validateCard({...input,playerId:''},classes,updated),/식별자/);
  assert.equal(existing.playerId,'old-modric-id'); // no mutation of the original or unrelated cards
});

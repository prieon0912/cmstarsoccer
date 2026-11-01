(function(root){
  root.FL11LeagueRewards=function(hooks){
    const key='fl11-league-pending',enrolled=new Set(),enrolling=new Map();let draining=null;
    const id=()=>root.crypto?.randomUUID?root.crypto.randomUUID():'season-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    const read=()=>{try{const data=JSON.parse(hooks.get(key)||'[]');return Array.isArray(data)?data:[];}catch(e){return [];}};
    const write=list=>hooks.set(key,JSON.stringify(list));
    const entryKey=s=>s.owner+'|'+s.id;
    async function enroll(s){
      const k=entryKey(s);if(enrolled.has(k))return;if(enrolling.has(k))return enrolling.get(k);
      const run=hooks.api('/league/start',{method:'POST',keepalive:true,body:{seasonId:s.id,club:s.club,seed:s.seed,custom:!!s.custom}}).then(()=>enrolled.add(k)).finally(()=>enrolling.delete(k));
      enrolling.set(k,run);return run;
    }
    function queue(s){
      const list=read();if(list.some(e=>e.id===s.id&&e.owner===s.owner))return;
      list.push({id:s.id,owner:s.owner,club:s.club,seed:s.seed,custom:!!s.custom,results:JSON.parse(JSON.stringify(s.res))});write(list);
    }
    function drain(){
      if(draining)return draining;
      const run=(async()=>{
        for(const s of read()){
          if(s.owner!==hooks.user())continue;
          try{
            await enroll(s);if(s.owner!==hooks.user())break;
            const data=await hooks.api('/league/finish',{method:'POST',keepalive:true,body:{seasonId:s.id,results:s.results}});
            write(read().filter(e=>e.id!==s.id||e.owner!==s.owner));
            if(s.owner===hooks.user())hooks.inventory(data);
            const current=hooks.season();if(current?.id===s.id&&current.owner===s.owner){current.rewardDone=true;hooks.save();}
          }catch(e){break;}
        }
      })();draining=run;run.finally(()=>{draining=null;});return run;
    }
    function sync(s){
      const user=hooks.user();if(!user)return Promise.resolve();
      if(s&&s.md<38){if(!s.id)s.id=id();if(!s.owner)s.owner=user;hooks.save();if(s.owner===user)enroll(s).catch(()=>{});}
      if(s?.id&&s.owner===user&&s.md===38&&!s.rewardDone)queue(s);
      return drain();
    }
    return {sync};
  };
})(globalThis);

(function(root){
  root.FL11Commerce=function(hooks){
    const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let packs=[],busy=false,boundaryTimer=null,serverTime=Date.now(),clockBase=performance.now();
    const serverNow=()=>serverTime+performance.now()-clockBase;
    const periodText=p=>!p.startsAt&&!p.endsAt?'기간 제한 없음':(p.startsAt?new Date(p.startsAt).toLocaleString('ko-KR'):'시작 제한 없음')+' ~ '+(p.endsAt?new Date(p.endsAt).toLocaleString('ko-KR'):'종료 제한 없음')+' (기기 시간)';
    function periodMessage(p){const now=serverNow();return p.startsAt&&now<Date.parse(p.startsAt)?'이용 시작 전이에요.':p.endsAt&&now>=Date.parse(p.endsAt)?'이용 기간이 끝났어요.':'';}
    const pendingKey=()=> 'fl11-draw-'+hooks.user();
    function message(text){$('shopMessage').textContent=text;}
    function buttons(){return '<button class="btn" data-shop="packs">패키지 목록</button>';}
    async function open(){
      clearTimeout(boundaryTimer);
      $('team').hidden=true;$('account').hidden=true;$('shop').hidden=false;message('상점을 불러오고 있어요.');
      if(!hooks.user()){$('shopContent').innerHTML='<p class="note">선수 뽑기는 로그인한 계정에서 이용할 수 있어요.</p><button class="btn pri" data-shop="login">로그인 / 회원가입</button>';$('shopCoins').textContent='로그인 필요';message('');return;}
      try{await hooks.loadCatalog();const data=await hooks.api('/shop/');packs=data.packs;serverTime=Date.parse(data.serverNow);clockBase=performance.now();hooks.inventory(data);$('shopCoins').textContent=data.coins.toLocaleString()+' 코인';renderPacks();
        const pending=localStorage.getItem(pendingKey());message(pending?'응답을 받지 못한 뽑기가 있어요. 같은 패키지의 뽑기를 누르면 결과를 이어서 확인해요.':'최초 1,000코인 지급 · 추가 수급처는 추후 추가됩니다.');
      }catch(e){message(e.message);}
    }
    function renderPacks(){
      const counts=new Map([...$('shopContent').querySelectorAll('select[data-count]')].map(e=>[e.dataset.count,e.value]));
      $('shopContent').innerHTML='<div class="pack-grid">'+packs.map(p=>{const cls=hooks.classFor({classId:p.classIds[0]}),period=periodMessage(p),available=p.odds.length>0&&!period;return `<article class="shop-pack"><div class="pack-cover" style="--class-accent:${esc(cls.accent)}">${p.classIds.length>1?'MIXED':p.classIds[0]==='BASE'?'SILVER':esc(cls.name)}<br>PLAYER PACK</div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><p>1회 ${p.price.toLocaleString()} 코인</p><p>${esc(periodText(p))}</p><label>뽑기 횟수<select data-count="${esc(p.id)}">${Array.from({length:10},(_,i)=>`<option value="${i+1}">${i+1}회 · ${(p.price*(i+1)).toLocaleString()} 코인</option>`).join('')}</select></label><div class="pack-actions"><button class="btn" data-shop="odds" data-id="${esc(p.id)}">확률 확인</button><button class="btn pri" data-shop="draw" data-id="${esc(p.id)}" ${available?'':'disabled'}>선수 뽑기</button></div>${available?'':`<p>${esc(p.odds.length?period:p.error)}</p>`}</article>`;}).join('')+'</div>';
      if(!packs.length)$('shopContent').innerHTML='<p class="note">현재 판매 중인 패키지가 없어요.</p>';
      for(const e of $('shopContent').querySelectorAll('select[data-count]'))if(counts.has(e.dataset.count))e.value=counts.get(e.dataset.count);
      clearTimeout(boundaryTimer);const now=serverNow(),next=Math.min(...packs.flatMap(p=>[p.startsAt,p.endsAt]).filter(Boolean).map(Date.parse).filter(t=>t>now));
      if(Number.isFinite(next))boundaryTimer=setTimeout(()=>{if(!$('shop').hidden&&!busy&&$('shopContent').querySelector('.pack-grid'))renderPacks();},Math.min(2147483647,Math.max(1,next-now+30)));
    }
    function odds(id){const p=packs.find(p=>p.id===id);if(!p)return;
      $('shopContent').innerHTML=buttons()+`<h3>${esc(p.name)} · 적용 확률</h3><p class="note">OVR 확률을 먼저 추첨한 뒤, 해당 OVR 안에서 선수별 배율을 적용해요. 중복 획득이 가능합니다.</p><p class="note">${p.ovrOdds.sort((a,b)=>b.ovr-a.ovr).map(o=>o.ovr+' OVR: '+(o.probability*100).toFixed(4)+'%').join(' · ')}</p><input class="odds-search" id="oddsSearch" placeholder="선수·구단 ID·클래스 검색"><div id="oddsRows"></div>`;
      const render=()=>{const q=$('oddsSearch').value.toLowerCase(),rows=p.odds.filter(c=>(c.name+' '+c.clubId+' '+c.classId).toLowerCase().includes(q));$('oddsRows').innerHTML='<table class="shop-odds"><thead><tr><th>선수</th><th>클래스</th><th>OVR</th><th>최종 확률</th></tr></thead><tbody>'+rows.map(c=>`<tr><td>${esc(c.name)} · ${esc(c.clubId)}</td><td>${esc(c.classId)}</td><td>${c.ovr}</td><td>${(c.probability*100).toFixed(6)}%</td></tr>`).join('')+'</tbody></table>';};$('oddsSearch').addEventListener('input',render);render();
    }
    function reveal(result){
      const cards=result.cardIds.map(hooks.card).filter(Boolean),featured=cards.slice().sort((a,b)=>b.ovr-a.ovr)[0];if(!featured)return;
      const cls=hooks.classFor(featured),board=cls.boardArt?`background-image:linear-gradient(#0005,#0008),url('${cls.boardArt}')`:'';
      $('shopContent').innerHTML=`<div class="reveal-board" style="--class-accent:${cls.accent};${board}"><div><p class="board-name">${esc(cls.boardName||cls.name)}</p>${hooks.cardHTML(featured,{tag:'div'})}<h3>${esc(featured.name)}</h3><p>${esc(featured.club.name)} · OVR ${featured.ovr}</p></div></div><div class="reveal-results">${cards.map(c=>`<div class="reveal-item">${hooks.cardHTML(c,{tag:'div'})}<p>${esc(hooks.classFor(c).name)} · 보유 ${hooks.quantity(c.id)}장</p></div>`).join('')}</div><div class="r-b">${buttons()}<button class="btn pri" data-shop="team">팀에서 선수 변경</button></div>`;
      message(result.count+'회 뽑기 완료 · '+result.cost.toLocaleString()+' 코인 사용');
    }
    async function draw(id){if(busy)return;const pack=packs.find(p=>p.id===id);if(!pack)return;
      let pending;try{pending=JSON.parse(localStorage.getItem(pendingKey())||'null');}catch(e){}
      if(pending&&pending.packId!==id){message('먼저 이전 패키지의 뽑기 결과를 이어서 확인해 주세요.');return;}
      if(!pending){const count=+$('shopContent').querySelector('select[data-count="'+CSS.escape(id)+'"]').value;pending={packId:id,count,quote:pack.quote,requestId:crypto.randomUUID()};localStorage.setItem(pendingKey(),JSON.stringify(pending));}
      busy=true;$('shopContent').classList.add('shop-busy');message('선수를 영입하고 있어요…');
      try{if(!await hooks.flush())throw Error('팀 설정 저장을 마친 뒤 다시 시도해 주세요.');const data=await hooks.api('/shop/draw',{method:'POST',body:pending,keepalive:true});localStorage.removeItem(pendingKey());hooks.inventory(data);$('shopCoins').textContent=data.coins.toLocaleString()+' 코인';reveal(data.result);}
      catch(e){if(e.status&&e.status<500)localStorage.removeItem(pendingKey());if(e.status===409)await open();message(e.message);}
      finally{busy=false;$('shopContent').classList.remove('shop-busy');}
    }
    $('shopContent').addEventListener('click',event=>{const b=event.target.closest('[data-shop]');if(!b)return;const action=b.dataset.shop;if(action==='packs'){renderPacks();message('');}else if(action==='odds')odds(b.dataset.id);else if(action==='draw')draw(b.dataset.id);else if(action==='login')hooks.openAccount();else if(action==='team'){$('shop').hidden=true;hooks.openTeam();}});
    $('shopClose').addEventListener('click',()=>{if(!busy){$('shop').hidden=true;clearTimeout(boundaryTimer);}});
    return {open};
  };
})(globalThis);

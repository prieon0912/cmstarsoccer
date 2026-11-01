(function(root){
  root.FL11Commerce=function(hooks){
    const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let packs=[],busy=false,boundaryTimer=null,serverTime=Date.now(),clockBase=performance.now(),selectedId=null,coins=0,loadSerial=0;const quantities=new Map();
    const serverNow=()=>serverTime+performance.now()-clockBase;
    const periodText=p=>!p.startsAt&&!p.endsAt?'기간 제한 없음':(p.startsAt?new Date(p.startsAt).toLocaleString('ko-KR'):'시작 제한 없음')+' ~ '+(p.endsAt?new Date(p.endsAt).toLocaleString('ko-KR'):'종료 제한 없음')+' (기기 시간)';
    function periodMessage(p){const now=serverNow();return p.startsAt&&now<Date.parse(p.startsAt)?'이용 시작 전이에요.':p.endsAt&&now>=Date.parse(p.endsAt)?'이용 기간이 끝났어요.':'';}
    const pendingKey=()=> 'fl11-draw-'+hooks.user();
    function message(text){$('shopMessage').textContent=text;}
    function buttons(){return '<button class="btn shop-back" data-shop="packs">← 패키지 목록</button>';}
    function pendingDraw(){try{return JSON.parse(localStorage.getItem(pendingKey())||'null');}catch(e){return null;}}
    function countFor(id){return Math.max(1,Math.min(10,Math.round(Number(quantities.get(id))||1)));}
    function money(n){return Number(n).toLocaleString()+' 코인';}
    function status(p){return periodMessage(p)||(p.available===false||!p.odds?.length?'이용 불가':'판매 중');}
    async function open(){
      root.FL11PackReveal?.preload();
      const serial=++loadSerial;clearTimeout(boundaryTimer);
      $('team').hidden=true;$('account').hidden=true;$('shop').hidden=false;message('상점을 불러오고 있어요.');
      if(!hooks.user()){$('shopContent').innerHTML='<p class="note">선수 뽑기는 로그인한 계정에서 이용할 수 있어요.</p><button class="btn pri" data-shop="login">로그인 / 회원가입</button>';$('shopCoins').textContent='로그인 필요';message('');return;}
      try{await hooks.loadCatalog();const data=await hooks.api('/shop/');if(serial!==loadSerial||$('shop').hidden)return;packs=Array.isArray(data.packs)?data.packs:[];coins=data.coins;serverTime=Date.parse(data.serverNow);clockBase=performance.now();hooks.inventory(data);$('shopCoins').textContent=data.coins.toLocaleString()+' 코인';renderPacks();
        const pending=localStorage.getItem(pendingKey());message(pending?'응답을 받지 못한 뽑기가 있어요. 같은 패키지의 뽑기를 누르면 결과를 이어서 확인해요.':'');
      }catch(e){if(serial!==loadSerial)return;$('shopContent').innerHTML='<div class="shop-empty"><h3>상점을 불러오지 못했어요</h3><button class="btn" data-shop="refresh">다시 불러오기</button></div>';message(e.message);}
    }
    function renderPacks(){
      if(!packs.some(p=>p.id===selectedId))selectedId=packs[0]?.id;
      const p=packs.find(p=>p.id===selectedId);
      if(!p){$('shopContent').innerHTML='<div class="shop-empty"><span>PLAYER STORE</span><h3>새로운 패키지를 준비하고 있어요</h3><button class="btn" data-shop="refresh">새로고침</button></div>';return;}
      const cls=hooks.classFor({classId:p.classIds?.[0]}),pending=pendingDraw(),resume=pending?.packId===p.id,count=resume?Math.max(1,Math.min(10,Math.round(Number(pending.count)||1))):countFor(p.id),price=p.price*count,available=p.available!==false&&p.odds?.length>0&&!periodMessage(p),affordable=coins>=price;
      $('shopContent').innerHTML='<div class="shop-layout"><aside class="shop-catalog"><div class="catalog-heading"><span>패키지 <b>'+packs.length+'</b></span><button data-shop="refresh" aria-label="패키지 새로고침">↻</button></div><nav class="pack-list" aria-label="패키지 목록">'+packs.map(item=>{const type=hooks.classFor({classId:item.classIds?.[0]}),on=item.id===p.id;return '<button class="pack-option'+(on?' selected':'')+'" data-shop="select" data-id="'+esc(item.id)+'" aria-pressed="'+on+'" style="--pack-accent:'+esc(type.accent)+'"><span class="pack-mini" aria-hidden="true">'+esc(type.id==='BASE'?'FL':type.name.slice(0,2))+'</span><span><strong>'+esc(item.name)+'</strong><small>'+money(item.price)+' / 1회</small></span><i class="pack-status '+(status(item)==='판매 중'?'open':'')+'">'+status(item)+'</i></button>';}).join('')+'</nav></aside><article class="shop-detail"><div class="shop-feature" style="--pack-accent:'+esc(cls.accent)+'"><div class="pack-art" aria-hidden="true"><div class="pack-halo"></div><div class="foil-pack"><span>FLOODLIGHT ELEVEN</span><b>'+esc(p.classIds.includes('BALLON_DOR')?'BLD':p.classIds.includes('ICON')?'ICON':'FL11')+'</b><i>✦</i><small>PLAYER PACK</small></div></div><div class="pack-heading"><span class="shop-kicker">PLAYER COLLECTION</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||'새로운 선수를 영입하고 팀을 완성하세요.')+'</p><div class="pack-class-tags">'+p.classIds.map(id=>'<span>'+esc(hooks.classFor({classId:id}).name)+'</span>').join('')+'</div><p class="pack-period">'+esc(periodText(p))+'</p><span class="availability '+(available?'open':'')+'">'+status(p)+'</span></div></div><div class="shop-purchase"><div class="quantity-heading"><label for="shopDrawCount">뽑기 횟수</label><output id="shopCountValue" for="shopDrawCount">'+count+'회</output></div><input id="shopDrawCount" class="draw-range" type="range" min="1" max="10" step="1" value="'+count+'" data-count="'+esc(p.id)+'" aria-label="뽑기 횟수" '+(resume?'disabled':'')+'><div class="range-limits"><span>1회</span><span>10회</span></div><div class="purchase-total"><span>총 사용 코인</span><strong id="shopTotalPrice">'+money(price)+'</strong></div><div class="purchase-actions"><button class="btn" data-shop="odds" data-id="'+esc(p.id)+'">획득 확률</button><button class="btn pri" id="shopDrawButton" data-shop="draw" data-id="'+esc(p.id)+'" '+(!resume&&(!available||!affordable)?'disabled':'')+'>'+(resume?'결과 이어받기':!available?'현재 이용 불가':!affordable?'코인 부족':count+'회 뽑기')+'</button></div></div></article></div>';
      clearTimeout(boundaryTimer);const now=serverNow(),next=Math.min(...packs.flatMap(p=>[p.startsAt,p.endsAt]).filter(Boolean).map(Date.parse).filter(t=>t>now));if(Number.isFinite(next))boundaryTimer=setTimeout(()=>{if(!$('shop').hidden&&!busy&&$('shopContent').querySelector('.shop-layout'))renderPacks();},Math.min(2147483647,Math.max(1,next-now+30)));
    }
    function updateCount(input){const id=input.dataset.count;quantities.set(id,Math.max(1,Math.min(10,Math.round(Number(input.value)||1))));const p=packs.find(p=>p.id===id);if(!p)return;const count=countFor(id);input.value=count;$('shopCountValue').textContent=count+'회';$('shopTotalPrice').textContent=money(p.price*count);const button=$('shopDrawButton'),available=p.available!==false&&p.odds?.length>0&&!periodMessage(p);button.disabled=!available||coins<p.price*count;button.textContent=!available?'현재 이용 불가':coins<p.price*count?'코인 부족':count+'회 뽑기';}
    function odds(id){const p=packs.find(p=>p.id===id);if(!p)return;
      $('shopContent').innerHTML='<section class="shop-odds-view">'+buttons()+`<div class="odds-heading"><span class="shop-kicker">DROP RATES</span><h3>${esc(p.name)}</h3><p>선수별 획득 확률</p></div><input class="odds-search" id="oddsSearch" aria-label="선수·구단·클래스 검색" placeholder="선수·구단·클래스 검색"><div id="oddsRows" class="odds-table-wrap"></div></section>`;
      const render=()=>{const q=$('oddsSearch').value.toLowerCase(),rows=p.odds.filter(c=>(c.name+' '+c.clubId+' '+c.classId).toLowerCase().includes(q));$('oddsRows').innerHTML='<table class="shop-odds"><thead><tr><th>선수</th><th>클래스</th><th>OVR</th><th>최종 확률</th></tr></thead><tbody>'+rows.map(c=>`<tr><td>${esc(c.name)} · ${esc(c.clubId)}</td><td>${esc(c.classId)}</td><td>${c.ovr}</td><td>${(c.probability*100).toFixed(6)}%</td></tr>`).join('')+'</tbody></table>';};$('oddsSearch').addEventListener('input',render);render();
    }
    function reveal(result){
      const cards=result.cardIds.map(hooks.card).filter(Boolean),featured=cards.slice().sort((a,b)=>b.ovr-a.ovr)[0];if(!featured)return;
      const cls=hooks.classFor(featured),board=cls.boardArt?`background-image:linear-gradient(#0005,#0008),url('${cls.boardArt}')`:'';
      $('shopContent').innerHTML=`<div class="reveal-board" style="--class-accent:${cls.accent};${board}"><div><p class="board-name">${esc(cls.boardName||cls.name)}</p>${hooks.cardHTML(featured,{tag:'div'})}<h3>${esc(featured.name)}</h3><p>${esc(featured.club.name)} · OVR ${featured.ovr}</p></div></div><div class="reveal-results">${cards.map(c=>`<div class="reveal-item">${hooks.cardHTML(c,{tag:'div'})}<p>${esc(hooks.classFor(c).name)} · 보유 ${hooks.quantity(c.id)}장</p></div>`).join('')}</div><div class="r-b">${buttons()}<button class="btn pri" data-shop="team">팀에서 선수 변경</button></div>`;
      message(result.count+'회 뽑기 완료 · '+result.cost.toLocaleString()+' 코인 사용');
      if(root.FL11PackReveal)root.FL11PackReveal.play({classInfo:cls,card:featured,cardHTML:hooks.cardHTML(featured,{tag:'div'})});
    }
    async function draw(id){if(busy)return;const pack=packs.find(p=>p.id===id);if(!pack)return;
      let pending;try{pending=JSON.parse(localStorage.getItem(pendingKey())||'null');}catch(e){}
      if(pending&&pending.packId!==id){message('먼저 이전 패키지의 뽑기 결과를 이어서 확인해 주세요.');return;}
      if(!pending){const count=countFor(id);pending={packId:id,count,quote:pack.quote,requestId:crypto.randomUUID()};localStorage.setItem(pendingKey(),JSON.stringify(pending));}
      busy=true;$('shopContent').classList.add('shop-busy');message('선수를 영입하고 있어요…');
      try{if(!await hooks.flush())throw Error('팀 설정 저장을 마친 뒤 다시 시도해 주세요.');const data=await hooks.api('/shop/draw',{method:'POST',body:pending,keepalive:true});localStorage.removeItem(pendingKey());hooks.inventory(data);coins=data.coins;$('shopCoins').textContent=data.coins.toLocaleString()+' 코인';reveal(data.result);}
      catch(e){if(e.status&&e.status<500)localStorage.removeItem(pendingKey());if(e.status===409)await open();message(e.message);}
      finally{busy=false;$('shopContent').classList.remove('shop-busy');}
    }
    $('shopContent').addEventListener('click',event=>{const b=event.target.closest('[data-shop]');if(!b)return;const action=b.dataset.shop;if(action==='refresh'){if(!busy)open();}else if(action==='select'){if(!busy){selectedId=b.dataset.id;renderPacks();message('');}}else if(action==='packs'){renderPacks();message('');}else if(action==='odds')odds(b.dataset.id);else if(action==='draw')draw(b.dataset.id);else if(action==='login')hooks.openAccount();else if(action==='team'){$('shop').hidden=true;hooks.openTeam();}});
    $('shopContent').addEventListener('input',e=>{if(e.target.matches('input[data-count]')&&!busy)updateCount(e.target);});
    $('shopClose').addEventListener('click',()=>{if(!busy){$('shop').hidden=true;loadSerial++;clearTimeout(boundaryTimer);}});
    return {open};
  };
})(globalThis);

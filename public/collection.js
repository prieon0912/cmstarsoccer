// Collection book (도감): progress per club, league and special class, with one-time coin rewards paid by the server.
(function(root){
  root.FL11Collection=function(hooks){
    const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const leagueName=id=>(hooks.leagues.find(l=>l[0]===id)||[id,id])[1];
    let book=null,busy=false,serial=0,view={tab:'clubs',league:'PL',club:null,cls:null,filter:'all'};
    const pct=(a,b)=>b?Math.floor(a/b*100):0,money=n=>Number(n).toLocaleString()+' 코인';
    const message=t=>{$('bookMessage').textContent=t||'';};
    const bar=(a,b)=>`<span class="book-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${b}" aria-valuenow="${a}"><i style="width:${pct(a,b)}%"></i></span>`;
    const reward=id=>book.rewards.find(r=>r.id===id);
    function rewardTitle(r){
      if(r.kind==='club')return (hooks.club(r.clubId)?.name||r.clubId)+' 완성';
      if(r.kind==='league')return leagueName(r.league)+' 전 클럽 완성';
      if(r.kind==='class')return hooks.classFor({classId:r.classId}).name+' '+r.need+'종 수집';
      if(r.kind==='classComplete')return hooks.classFor({classId:r.classId}).name+' 전체 완성';
      if(r.kind==='total')return '선수 '+r.need+'종 수집';
      return '이전 도감 보상';
    }
    function rewardButton(r,compact){
      if(!r)return '';
      if(r.state==='claimed')return `<span class="book-state done">받음 · ${money(r.amount)}</span>`;
      if(r.state==='ready')return `<button class="btn pri book-claim" data-book="claim" data-id="${esc(r.id)}">${compact?'':'보상 받기 · '}${money(r.amount)}</button>`;
      return `<span class="book-state">${compact?'':'완성 보상 '}${money(r.amount)}</span>`;
    }
    async function open(){
      const mine=++serial;$('team').hidden=true;$('account').hidden=true;$('shop').hidden=true;$('collection').hidden=false;message('도감을 불러오고 있어요.');
      if(!hooks.user()){$('bookContent').innerHTML='<div class="book-empty"><span>COLLECTION</span><h3>도감은 로그인한 계정에서 이용할 수 있어요</h3><button class="btn pri" data-book="login">로그인 / 회원가입</button></div>';$('bookCoins').textContent='로그인 필요';message('');return;}
      try{await hooks.loadCatalog();const data=await hooks.api('/collection/');if(mine!==serial||$('collection').hidden)return;receive(data);message('');}
      catch(e){if(mine!==serial)return;$('bookContent').innerHTML='<div class="book-empty"><h3>도감을 불러오지 못했어요</h3><button class="btn" data-book="refresh">다시 불러오기</button></div>';message(e.message);}
    }
    function receive(data){book=data;hooks.inventory(data);$('bookCoins').textContent=data.coins.toLocaleString()+' 코인';render();}
    function summary(){
      return `<div class="book-summary"><div class="book-total"><span class="book-kicker">수집한 선수</span><strong>${book.owned.toLocaleString()}<small> / ${book.total.toLocaleString()}</small></strong>${bar(book.owned,book.total)}<em>${pct(book.owned,book.total)}% 완성</em></div>
        <div class="book-ready"><span class="book-kicker">받을 수 있는 보상</span><strong>${money(book.ready)}</strong><button class="btn pri" data-book="all"${book.ready?'':' disabled'}>모두 받기</button></div></div>
        <nav class="book-tabs" role="tablist">${[['clubs','클럽'],['classes','스페셜'],['rewards','보상']].map(([k,n])=>`<button role="tab" aria-selected="${view.tab===k}" data-book="tab" data-id="${k}">${n}${k==='rewards'&&book.rewards.some(r=>r.state==='ready')?' <i class="book-dot"></i>':''}</button>`).join('')}</nav>`;
    }
    function slots(ids){
      const owned=new Map((book.inventory||[]).map(r=>[r.cardId,r.quantity])),list=ids.filter(id=>view.filter==='all'||(view.filter==='owned')===owned.has(id));
      if(!list.length)return '<p class="book-none">해당하는 선수가 없어요.</p>';
      return '<div class="book-cards">'+list.map(id=>{const cd=hooks.card(id);if(!cd)return '';const n=owned.get(id);
        return `<div class="book-slot${n?'':' locked'}">${hooks.cardHTML(cd,{tag:'div'})}${n?(n>1?`<i class="book-qty">×${n}</i>`:''):'<span class="book-lock">미보유</span>'}</div>`;}).join('')+'</div>';
    }
    const filters=()=>`<div class="book-filters">${[['all','전체'],['owned','보유'],['missing','미보유']].map(([k,n])=>`<button aria-pressed="${view.filter===k}" data-book="filter" data-id="${k}">${n}</button>`).join('')}</div>`;
    function clubDetail(g){
      const c=hooks.club(g.clubId);
      return `<div class="book-detail"><button class="btn book-back" data-book="back">← 클럽 목록</button><div class="book-detail-head">${c?hooks.crest(c,true):''}<div><span class="book-kicker">${esc(leagueName(g.league))} · 베이스</span><h3>${esc(c?.name||g.clubId)}</h3>${bar(g.owned,g.cardIds.length)}<p>${g.owned} / ${g.cardIds.length}명</p></div>${rewardButton(reward('club:'+g.clubId))}</div>${filters()}${slots(g.cardIds)}</div>`;
    }
    function classDetail(g){
      const cls=hooks.classFor({classId:g.classId}),rs=book.rewards.filter(r=>r.classId===g.classId);
      return `<div class="book-detail" style="--class-accent:${cls.accent}"><button class="btn book-back" data-book="back">← 스페셜 목록</button><div class="book-detail-head"><span class="book-class-mark">${esc(cls.name)}</span><div><span class="book-kicker">스페셜 클래스</span><h3>${esc(cls.boardName||cls.name)}</h3>${bar(g.owned,g.cardIds.length)}<p>${g.owned} / ${g.cardIds.length}명</p></div></div>
        <div class="book-steps">${rs.map(r=>`<div class="book-step ${r.state}"><b>${r.kind==='classComplete'?'완성':r.need+'종'}</b>${rewardButton(r,true)}</div>`).join('')}</div>${filters()}${slots(g.cardIds)}</div>`;
    }
    function clubs(){
      const g=view.club&&book.clubs.find(x=>x.clubId===view.club);if(g)return clubDetail(g);
      const leagues=book.leagues.map(l=>l.league);if(!leagues.includes(view.league))view.league=leagues[0];
      const l=book.leagues.find(x=>x.league===view.league),lr=reward('league:'+view.league);
      return `<div class="book-chips">${book.leagues.map(x=>`<button aria-pressed="${x.league===view.league}" data-book="league" data-id="${x.league}">${esc(leagueName(x.league))} <small>${pct(x.owned,x.total)}%</small></button>`).join('')}</div>
        ${l?`<div class="book-league"><div><span class="book-kicker">${esc(leagueName(l.league))} 전 클럽 베이스</span><p>${l.owned} / ${l.total}명</p>${bar(l.owned,l.total)}</div>${rewardButton(lr)}</div>`:''}
        <div class="book-clubs">${book.clubs.filter(x=>x.league===view.league).map(x=>{const c=hooks.club(x.clubId),r=reward('club:'+x.clubId);
          return `<button class="book-club ${r?.state||''}" data-book="club" data-id="${esc(x.clubId)}">${c?hooks.crest(c,true):''}<span class="book-club-name">${esc(c?.name||x.clubId)}</span><span class="book-club-count">${x.owned}/${x.cardIds.length}</span>${bar(x.owned,x.cardIds.length)}<i class="book-club-badge">${r?.state==='claimed'?'완성':r?.state==='ready'?'보상 대기':money(r?.amount||0)}</i></button>`;}).join('')}</div>`;
    }
    function classes(){
      const g=view.cls&&book.classes.find(x=>x.classId===view.cls);if(g)return classDetail(g);
      if(!book.classes.length)return '<div class="book-empty"><span>SPECIAL</span><h3>아직 도감에 등록된 스페셜 카드가 없어요</h3><p class="note">발롱도르·ICON 같은 스페셜 카드가 출시되면 여기에 모여요.</p></div>';
      return '<div class="book-classes">'+book.classes.map(x=>{const cls=hooks.classFor({classId:x.classId}),ready=book.rewards.filter(r=>r.classId===x.classId&&r.state==='ready').length;
        return `<button class="book-class" style="--class-accent:${cls.accent}" data-book="class" data-id="${esc(x.classId)}"><span class="book-class-mark">${esc(cls.name)}</span><span><b>${esc(cls.boardName||cls.name)}</b><small>${x.owned} / ${x.cardIds.length}명${ready?' · 보상 '+ready+'개 대기':''}</small>${bar(x.owned,x.cardIds.length)}</span></button>`;}).join('')+'</div>';
    }
    function rewards(){
      const groups=[['total','누적 수집'],['league','리그 완성'],['club','클럽 완성'],['class','스페셜'],['retired','이전 보상']];
      const kindOf=r=>r.kind==='classComplete'?'class':r.kind;
      return groups.map(([k,n])=>{const list=book.rewards.filter(r=>kindOf(r)===k).sort((a,b)=>({ready:0,locked:1,claimed:2}[a.state]-{ready:0,locked:1,claimed:2}[b.state]));if(!list.length)return '';
        return `<section class="book-group"><h4>${n} <small>${list.filter(r=>r.state==='claimed').length} / ${list.length}</small></h4>${list.map(r=>`<div class="book-reward ${r.state}"><div><b>${esc(rewardTitle(r))}</b>${r.need?`<small>${r.progress} / ${r.need}</small>${bar(r.progress,r.need)}`:''}</div>${rewardButton(r,true)}</div>`).join('')}</section>`;}).join('');
    }
    function render(){if(!book)return;const body=view.tab==='clubs'?clubs():view.tab==='classes'?classes():rewards();$('bookContent').innerHTML=summary()+`<div class="book-body">${body}</div>`;}
    async function claim(body){
      if(busy)return;busy=true;$('bookContent').classList.add('book-busy');message('보상을 받고 있어요…');
      try{const data=await hooks.api('/collection/claim',{method:'POST',body});receive(data);message(data.credited?money(data.credited)+'을 받았어요.':'이미 받은 보상이에요.');}
      catch(e){message(e.message);if(e.status===409||e.status===404){try{receive(await hooks.api('/collection/'));}catch(_){}}}
      finally{busy=false;$('bookContent').classList.remove('book-busy');}
    }
    $('bookContent').addEventListener('click',e=>{const b=e.target.closest('[data-book]');if(!b||b.disabled)return;const a=b.dataset.book,id=b.dataset.id;
      if(a==='login'){$('collection').hidden=true;hooks.openAccount();return;}
      if(a==='refresh'){open();return;}
      if(a==='claim')return claim({rewardIds:[id]});
      if(a==='all')return claim({all:true});
      if(a==='tab'){view.tab=id;view.club=null;view.cls=null;view.filter='all';}
      else if(a==='league')view.league=id;
      else if(a==='club'){view.club=id;view.filter='all';}
      else if(a==='class'){view.cls=id;view.filter='all';}
      else if(a==='back'){view.club=null;view.cls=null;}
      else if(a==='filter')view.filter=id;
      render();if(a==='club'||a==='class'||a==='back'||a==='tab')$('bookContent').scrollTop=0;});
    $('bookClose').addEventListener('click',()=>{$('collection').hidden=true;serial++;});
    return {open};
  };
})(globalThis);

(function(root){
  let active=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const trophyArt=root.FL11_TROPHY_ASSET||'/assets/classes/ballon-trophy.png';
  const timings=Object.freeze({duration:9500,card:6000,iconCard:6000,settle:1500});
  let trophyPreload=null;
  function preload(){if(!trophyPreload&&root.Image){trophyPreload=new root.Image();trophyPreload.src=trophyArt;}}
  function iconRitual(){
    const leaves=Array.from({length:9},(_,i)=>{const a=(i*13-65)*Math.PI/180,x=200+112*Math.cos(a),y=200+112*Math.sin(a);return `<g style="--leaf:${i*.06}s"><ellipse cx="${x}" cy="${y}" rx="8" ry="18" transform="rotate(${i*13-25} ${x} ${y})"/><ellipse cx="${400-x}" cy="${y}" rx="8" ry="18" transform="rotate(${-i*13+25} ${400-x} ${y})"/></g>`;}).join('');
    return `<div class="pr-icon-floor"><svg viewBox="0 0 400 400"><circle cx="200" cy="200" r="150"/><circle cx="200" cy="200" r="128"/><path d="M200 30V370M30 200H370M80 80L320 320M80 320L320 80"/></svg></div><div class="pr-icon-seal"><svg viewBox="0 0 400 400"><circle class="pr-icon-trace" cx="200" cy="200" r="146"/><circle class="pr-icon-trace inner" cx="200" cy="200" r="137"/><g class="pr-icon-laurel">${leaves}</g><path class="pr-icon-monogram" d="M171 118H229V134H215V266H229V282H171V266H185V134H171Z"/><path class="pr-icon-crown" d="M177 96L182 77L200 88L218 77L223 96Z"/></svg><span>ETERNAL GREATNESS</span></div><div class="pr-icon-shards">${Array.from({length:12},(_,i)=>`<i style="--angle:${i*30}deg;--stagger:${i%4*.07}s"></i>`).join('')}</div><div class="pr-icon-ray"></div><div class="pr-icon-shock"><i></i><i></i></div>`;
  }
  function play({classInfo,card,cardHTML,onComplete=()=>{},autoClose=true}){
    if(active)active();const cls=classInfo,reduced=!!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const theme=['silver',...Object.keys(root.FL11_DESIGNS||{})].includes(cls.reveal)?cls.reveal:'silver';
    const ballon=theme.startsWith('ballon-'),icon=theme.startsWith('icon-'),cardAt=reduced?0:icon?timings.iconCard:timings.card;
    if(ballon)preload();
    const layer=document.createElement('div');layer.className='pack-cinema theme-'+theme+(icon?' icon-cinema':'')+(reduced?' motion-reduced':'');layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label',cls.name+' 선수 공개');layer.tabIndex=-1;
    layer.style.setProperty('--pr-accent',cls.accent||'#dce3eb');if(cls.boardArt)layer.style.setProperty('--pr-stage',`url('${cls.boardArt}')`);
    layer.style.setProperty('--pr-duration',timings.duration+'ms');layer.style.setProperty('--pr-flash-at',(cardAt-350)+'ms');layer.style.setProperty('--pr-clue-at',(cardAt-2200)+'ms');layer.style.setProperty('--pr-club-at',(cardAt-1100)+'ms');layer.style.setProperty('--pr-particle-at',cardAt+'ms');
    layer.innerHTML=`<div class="pr-scene" aria-hidden="true"><div class="pr-horizon"></div><div class="pr-floor"></div><div class="pr-portal"><i></i><i></i><i></i></div><div class="pr-doors"><i></i><i></i></div><div class="pr-orbit"></div><div class="pr-columns"><i></i><i></i><i></i><i></i></div><div class="pr-beams"><i></i><i></i><i></i></div><div class="pr-particles">${Array.from({length:32},(_,i)=>`<i style="--a:${i*137.5}deg;--d:${170+i%7*35}px;--delay:${(i%9)*.045}s"></i>`).join('')}</div></div><p class="pr-eyebrow">FLOODLIGHT ELEVEN · PLAYER REVEAL</p><h2 class="pr-title">${esc(cls.boardName||cls.name)}</h2><div class="pr-pack" aria-hidden="true"><span>✦</span><b>${esc(cls.name)}</b></div><div class="pr-clue" aria-hidden="true"><b>${esc(card.pos)}</b><span>${esc(card.club?.name||'')}</span></div><div class="pr-flash" aria-hidden="true"></div><div class="pr-player"><div class="pr-card">${cardHTML}</div><h3>${esc(card.name)}</h3><p>${esc(cls.name)} · ${esc(card.ovr)} OVR</p></div><button class="pr-skip" type="button">건너뛰기</button><button class="pr-continue" type="button" hidden>결과 보기</button>`;
    const player=layer.querySelector('.pr-player');player.hidden=true;
    const clue=layer.querySelector('.pr-clue');clue.innerHTML=`<b class="pr-position">${esc(card.pos)}</b><span class="pr-club">${esc(card.club?.name||'')}</span>`;
    if(icon){const ritual=document.createElement('div');ritual.className='pr-icon-ritual';ritual.setAttribute('aria-hidden','true');ritual.innerHTML=iconRitual();layer.appendChild(ritual);}
    if(ballon){const trophy=document.createElement('div');trophy.className='pr-trophy';trophy.setAttribute('aria-hidden','true');trophy.innerHTML=`<div class="pr-trophy-halo"></div><img src="${esc(trophyArt)}" alt="" decoding="async"><div class="pr-trophy-caption">THE GOLDEN FOOTBALL</div>`;layer.appendChild(trophy);const plinth=document.createElement('div');plinth.className='pr-plinth';plinth.setAttribute('aria-hidden','true');layer.appendChild(plinth);}
    document.body.appendChild(layer);const previous=document.activeElement,skip=layer.querySelector('.pr-skip'),next=layer.querySelector('.pr-continue');let done=false;
    const timers=[];function finish(){if(done)return;done=true;timers.forEach(clearTimeout);layer.remove();if(active===finish)active=null;onComplete();if(previous?.isConnected)previous.focus();}
    active=finish;skip.addEventListener('click',finish);next.addEventListener('click',finish);
    layer.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();finish();}else if(e.key==='Tab'){e.preventDefault();const buttons=next.hidden?[skip]:[skip,next],i=buttons.indexOf(document.activeElement);buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}});
    timers.push(setTimeout(()=>{player.hidden=false;},cardAt));timers.push(setTimeout(()=>{next.hidden=false;},reduced?50:cardAt+timings.settle));if(autoClose)timers.push(setTimeout(finish,reduced?900:timings.duration));skip.focus();return finish;
  }
  root.FL11PackReveal={play,preload,timings};
})(globalThis);

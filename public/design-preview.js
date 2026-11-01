(function(root){
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asset=v=>typeof v==='string'&&((/^\/assets\/[A-Za-z0-9_./-]+$/.test(v)&&!v.includes('..'))||v.startsWith('data:image/svg+xml,'))?v:'';
  function card(cls,model={}){
    const shape=['hex','shield','rect'].includes(cls.shape)?cls.shape:'shield',art=asset(cls.cardArt);
    return `<div class="design-card design-${shape}" style="--design-ink:${esc(cls.ink||'#1b222c')};--design-accent:${esc(cls.accent)};${art?`background-image:url('${esc(art)}')`:''}"><div class="design-top"><div><b>${model.ovr||94}</b><i>${esc(model.pos||'ST')}</i><span class="design-badge">FL</span></div><span class="design-shirt">${model.num||9}</span></div><strong>${esc(model.name||'PLAYER NAME')}</strong><div class="design-stats">${[['PAC',93],['SHO',96],['PAS',91],['DRI',95],['DEF',48],['PHY',87]].map(([n,v])=>`<span><b>${v}</b> ${n}</span>`).join('')}</div><small>${esc(cls.name||cls.boardName)}</small></div>`;
  }
  function play(cls){return root.FL11PackReveal.play({classInfo:cls,card:{name:'PLAYER NAME',pos:'ST',ovr:94,club:{name:'FLOODLIGHT XI'}},cardHTML:card(cls),autoClose:false});}
  root.FL11DesignPreview={card,play};
})(globalThis);

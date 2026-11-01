(function(root){
  const entries=[
    ['ballon-gold','발롱도르 · 골드 시상식','shield','#e5bb62','#fff0d0',"BALLON D’OR"],
    ['ballon-midnight','발롱도르 · 미드나이트','hex','#f3cf80','#f9eed7','GOLDEN NIGHT'],
    ['icon-ivory','ICON · 아이보리 신전','shield','#c6a66b','#493820','ICON'],
    ['icon-obsidian','ICON · 옵시디언','rect','#dcc08a','#fff1d2','ETERNAL ICON']
  ];
  const data=Object.fromEntries(entries.map(([id,label,shape,accent,ink,boardName])=>[id,{id,label,design:id,reveal:id,shape,accent,ink,boardName,cardArt:'/assets/classes/'+id+'-card.svg',boardArt:'/assets/classes/'+id+'-stage.svg',slotArt:'/assets/classes/'+id+'-slot.svg'}]));
  if(typeof module!=='undefined'&&module.exports)module.exports=data;else root.FL11_DESIGNS=data;
})(globalThis);

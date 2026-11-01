(function(root){
  const designs=typeof module!=='undefined'&&module.exports?require('./class-designs'):root.FL11_DESIGNS;
  const data={
    BASE:{id:'BASE',name:'베이스',accent:'#dce3eb',ink:'#1b222c',shape:'hex',cardArt:'',boardArt:'',slotArt:'',boardName:'SILVER REVEAL',reveal:'silver'},
    BALLON_DOR:{...designs['ballon-gold'],id:'BALLON_DOR',name:'발롱도르'},
    ICON:{...designs['icon-ivory'],id:'ICON',name:'ICON'}
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=data;else root.FL11_CLASSES=data;
})(globalThis);

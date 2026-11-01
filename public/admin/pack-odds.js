(function(root){
  function initial(pack,cards,classes){
    const classWeights={},classOvrWeights={};
    for(const c of classes){classWeights[c.id]=pack?0:100;classOvrWeights[c.id]={};for(const p of cards)if(p.classId===c.id&&p.active!==false)classOvrWeights[c.id][p.ovr]=(classOvrWeights[c.id][p.ovr]||0)+1;}
    if(pack?.classWeights!=null)return {classWeights:{...classWeights,...pack.classWeights},classOvrWeights:{...classOvrWeights,...structuredClone(pack.classOvrWeights||{})}};
    // Convert an existing OVR-first pack to the same joint probabilities.
    if(pack){
      const pool=cards.filter(c=>c.active!==false&&pack.classIds.includes(c.classId)),total=Object.values(pack.weights).reduce((n,w)=>n+(+w||0),0),joint={};
      for(const [ovr,w] of Object.entries(pack.weights)){if(!(w>0))continue;const group=pool.filter(c=>c.ovr===+ovr&&(pack.multipliers[c.id]??1)>0),mass=group.reduce((n,c)=>n+(pack.multipliers[c.id]??1),0);for(const c of group){const p=w/total*(pack.multipliers[c.id]??1)/mass;joint[c.classId]??={};joint[c.classId][ovr]=(joint[c.classId][ovr]||0)+p;}}
      for(const id of pack.classIds){const values=joint[id]||{},share=Object.values(values).reduce((n,v)=>n+v,0);classWeights[id]=share*100;classOvrWeights[id]=Object.fromEntries(Object.entries(values).map(([o,p])=>[o,share?p/share*100:0]));}
    }
    return {classWeights,classOvrWeights};
  }
  const api={initial};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FL11PackOdds=api;
})(globalThis);

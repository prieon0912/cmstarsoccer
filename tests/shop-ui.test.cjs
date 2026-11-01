const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const packs=[19,49,149].map((price,i)=>({id:'pack-'+i,name:'패키지 '+i,classIds:['BALLON_DOR','BASE'],price,quote:'quote-'+i,description:'선수 영입',available:true,odds:[{cardId:'a',name:'선수',classId:'BALLON_DOR',clubId:'MIL',ovr:96,probability:1}]}));
function setup(){const elements={},storage=new Map(),calls=[];let response={coins:1000,packs,serverNow:new Date().toISOString()};const el=id=>elements[id]??={hidden:false,value:'',textContent:'',innerHTML:'',disabled:false,classList:{add(){},remove(){}},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},querySelector(selector){return this.innerHTML.includes('shop-layout')&&selector==='.shop-layout'?{}:null;}};
  const hooks={user:()=> 'test-user',loadCatalog:async()=>{},inventory(){},classFor:()=>({id:'BALLON_DOR',name:'발롱도르',accent:'#e5bb62'}),flush:async()=>true,api:async(url,body)=>{if(url==='/shop/')return typeof response==='function'?response():structuredClone(response);calls.push(body.body);throw Error('연결이 끊겼어요.');}};
  const context=vm.createContext({document:{getElementById:el},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},performance:{now:()=>0},crypto:{randomUUID:()=> 'request-id-123456789'},setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/commerce.js'),'utf8'),context);const shop=context.FL11Commerce(hooks);
  const click=(action,id)=>el('shopContent').listeners.click({target:{closest:()=>({dataset:{shop:action,id}})}}),input=(id,count)=>el('shopContent').listeners.input({target:{dataset:{count:id},value:String(count),matches:()=>true}});
  return {el,shop,click,input,calls,storage,setResponse:r=>response=r};
}
test('all packages remain selectable, slider updates quantity and cost, and long OVR paragraphs are absent',async()=>{
  const h=setup();await h.shop.open();const html=h.el('shopContent').innerHTML;for(const p of packs)assert.ok(html.includes('data-id="'+p.id+'"'));assert.ok(html.includes('패키지 <b>3</b>'));assert.match(html,/type="range" min="1" max="10"/);assert.ok(!html.includes('<select'));
  h.click('select','pack-2');h.input('pack-2',10);assert.equal(h.el('shopCountValue').textContent,'10회');assert.equal(h.el('shopTotalPrice').textContent,'1,490 코인');assert.equal(h.el('shopDrawButton').disabled,true);
  h.input('pack-2',6);assert.equal(h.el('shopTotalPrice').textContent,'894 코인');assert.equal(h.el('shopDrawButton').disabled,false);h.click('select','pack-0');h.click('select','pack-2');assert.match(h.el('shopContent').innerHTML,/value="6" data-count="pack-2"/);
  h.click('odds','pack-2');assert.ok(!h.el('shopContent').innerHTML.includes('OVR 확률'));assert.ok(!h.el('shopContent').innerHTML.includes('중복 획득'));assert.ok(h.el('oddsRows').innerHTML.includes('100.000000%'));
});
test('slider quantity is sent to the server and interrupted draws reuse the same request even when coins run out',async()=>{
  const h=setup();await h.shop.open();h.click('select','pack-2');h.input('pack-2',6);h.click('draw','pack-2');await new Promise(setImmediate);assert.equal(h.calls[0].count,6);assert.equal(h.calls[0].packId,'pack-2');assert.equal(h.calls[0].quote,'quote-2');
  h.setResponse({coins:0,packs:packs.map(p=>({...p,available:false})),serverNow:new Date().toISOString()});await h.shop.open();assert.ok(h.el('shopContent').innerHTML.includes('결과 이어받기'));assert.match(h.el('shopContent').innerHTML,/value="6" data-count="pack-2"/);h.click('draw','pack-2');await new Promise(setImmediate);assert.deepEqual(h.calls[0],h.calls[1]);
});
test('late old responses cannot overwrite a newer package list',async()=>{
  const h=setup();let finishOld;h.setResponse(()=>new Promise(r=>finishOld=r));const old=h.shop.open();await new Promise(setImmediate);h.setResponse({coins:1000,packs,serverNow:new Date().toISOString()});await h.shop.open();finishOld({coins:1000,packs:[packs[0]],serverNow:new Date().toISOString()});await old;assert.ok(h.el('shopContent').innerHTML.includes('패키지 <b>3</b>'));
});

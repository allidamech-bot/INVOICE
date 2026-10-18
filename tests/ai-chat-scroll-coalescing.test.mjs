import test from 'node:test';
import assert from 'node:assert/strict';
import {attachAiChatScrollFollower} from '../dist/src/lib/ai-chat-scroll.js';
test('scroll follower coalesces updates and reconnects only when top-level turns change',()=>{
 const names=['window','MutationObserver','ResizeObserver'];
 const previous=names.map(name=>globalThis[name]);
 let mutation,queued=[],observes=0,disconnects=0;
 globalThis.window={requestAnimationFrame:fn=>(queued.push(fn),queued.length),cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){}};
 globalThis.MutationObserver=class{constructor(fn){mutation=fn;}observe(){}disconnect(){disconnects++;}};
 globalThis.ResizeObserver=class{observe(){observes++;}disconnect(){disconnects++;}};
 const box={scrollTop:0,scrollHeight:600,clientHeight:200,isConnected:true,children:[{},{}],addEventListener(){},removeEventListener(){}};
 try{
  const follower=attachAiChatScrollFollower(box);
  const count=observes;
  for(let i=0;i<30;i++)mutation([{type:'characterData',target:{}}]);
  assert.equal(queued.length,1,'many text mutations should use one animation frame');
  assert.equal(observes,count,'text updates do not reconnect resize observers');
  queued.shift()();
  assert.equal(box.scrollTop,600);
  mutation([{type:'childList',target:box}]);
  assert.ok(observes>count);
  follower.disconnect();assert.ok(disconnects>=3);
 }finally{names.forEach((name,i)=>{if(previous[i]===undefined)delete globalThis[name];else globalThis[name]=previous[i];});}
});

test('layout scroll after sending stays at latest turn, but manual history reading is respected',()=>{
 const names=['window','MutationObserver','ResizeObserver'],previous=names.map(n=>globalThis[n]);
 const events={},frames=[],timers=new Map();let next=0;
 globalThis.window={requestAnimationFrame:fn=>(frames.push(fn),frames.length),cancelAnimationFrame(){},setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)};
 globalThis.MutationObserver=class{observe(){}disconnect(){}};
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 const box={scrollTop:0,scrollHeight:1200,clientHeight:200,isConnected:true,children:[],addEventListener:(name,fn)=>{events[name]=fn;},removeEventListener:name=>{delete events[name];}};
 const settle=()=>{while(frames.length)frames.shift()();for(const [id,fn] of [...timers]){timers.delete(id);fn();}};
 try{
  const follower=attachAiChatScrollFollower(box);settle();
  box.scrollTop=0;events.scroll();settle();
  assert.equal(box.scrollTop,1200,'browser layout/focus scroll must not disable following');
  events.wheel({type:'wheel',target:box});box.scrollTop=200;events.scroll();settle();
  assert.equal(box.scrollTop,200,'deliberate history reading must not be pulled down');
  follower.followNewMessage();settle();assert.equal(box.scrollTop,1200);
  box.scrollHeight=1500;box.scrollTop=0;events.scroll();settle();assert.equal(box.scrollTop,1500);
  follower.disconnect();assert.deepEqual(Object.keys(events),[]);
 }finally{names.forEach((n,i)=>{if(previous[i]===undefined)delete globalThis[n];else globalThis[n]=previous[i];});}
});

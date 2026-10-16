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

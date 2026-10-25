import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
test('typing bursts schedule one layout read and never rewrite text or selection',()=>{
 const path='src/lib/ai-composer-input.ts';
 assert.ok(existsSync(path),'Composer needs a coalesced layout scheduler');
 const ctx={WeakMap,Math,window:{requestAnimationFrame:fn=>{frames.push(fn);return frames.length;}}},frames=[];
 const js=ts.transpile(readFileSync(path,'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS});
 ctx.exports={};vm.runInNewContext(js,ctx);
 let reads=0;const area={isConnected:true,value:'نص عربي English',selectionStart:4,selectionEnd:4,style:{},get scrollHeight(){reads++;return 80;}};
 for(let i=0;i<20;i++)ctx.exports.scheduleComposerResize(area);
 assert.equal(reads,0,'Typing must not synchronously force layout');assert.equal(frames.length,1);
 frames.shift()();assert.equal(reads,1);assert.equal(area.style.height,'80px');
 assert.equal(area.value,'نص عربي English');assert.equal(area.selectionStart,4);
 ctx.exports.scheduleComposerResize(area);area.isConnected=false;frames.shift()();assert.equal(reads,1,'Ignore detached composer after thread switch');
});

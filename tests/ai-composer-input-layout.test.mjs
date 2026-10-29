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
test('oversized pasted orders are retained and blocked before planning, never truncated',()=>{
 const ctx={exports:{},WeakMap,Math,window:{}};
 vm.runInNewContext(ts.transpile(readFileSync('src/lib/ai-composer-input.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}),ctx);
 assert.equal(typeof ctx.exports.composerSubmissionError,'function');
 assert.equal(ctx.exports.composerSubmissionError('x'.repeat(6000),false),'');
 assert.match(ctx.exports.composerSubmissionError('x'.repeat(6001),false),/6000/);
 assert.match(ctx.exports.composerSubmissionError('x'.repeat(6001),true),/6000/);
});
test('correcting a length-rejected message clears only its obsolete composer error',()=>{
 const source=readFileSync('scripts/ai-batch3-premium-conversation.mjs','utf8');
 const code=source.slice(source.indexOf("const textarea=React.createElement('textarea'")).match(/onChange:(event=>instance\.setState\([^\n]*?\)),onInput:event=>scheduleComposerResize/)[1];
 const state={input:'x'.repeat(6001),error:'Message exceeds 6000 characters',__composerLengthError:true};
 const instance={state,setState:update=>Object.assign(state,typeof update==='function'?update(state):update)};
 const change=vm.runInNewContext('('+code+')',{instance});change({target:{value:'Short correction'}});
 assert.equal(state.input,'Short correction');assert.equal(state.error,'');assert.equal(state.__composerLengthError,false);
 state.error='A provider is unavailable';change({target:{value:'Another edit'}});assert.equal(state.error,'A provider is unavailable');
});

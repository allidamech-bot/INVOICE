import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture(request=async()=>({source:{summary:'Safe source'}})){
 const calls=[],ctx={exports:{},require:()=>({requestAiJson:async(...args)=>{calls.push(args[0]);return request(...args);},readablePdfText:async()=> 'Selectable invoice text',readSpreadsheetFile:async()=>[],spreadsheetSheetsAsText:()=> 'SKU,quantity\nA1,2'}),Uint8Array,DOMException,btoa,Date,Math,Map,Set};
 vm.runInNewContext(ts.transpileModule(read('src/lib/ai-conversation-attachments.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);return {...ctx.exports,calls};
}
const signatures=[['image/png','image.png',[137,80,78,71,13,10,26,10]],['image/jpeg','image.jpg',[255,216,255,0]],['image/webp','image.webp',[82,73,70,70,0,0,0,0,87,69,66,80]],['application/pdf','file.pdf',[37,80,68,70,45,49,46,55]]];
for(const [mime,name,signature] of signatures)test(`${mime}: content signatures precede PDF/image analysis`,async()=>{
 const h=fixture(),good=new File([new Uint8Array(signature)],name,{type:mime}),bad=new File(['not a real file'],name,{type:mime});assert.ok((await h.conversationAttachmentPayload(good)).kind);await assert.rejects(h.analyzeConversationAttachment(bad),/content does not match/);assert.equal(h.calls.length,0);
});
test('pre-cancelled attachment never reads the file or calls a service',async()=>{
 const h=fixture(),controller=new AbortController(),phases=[];controller.abort();const file={name:'source.txt',type:'text/plain',size:2,text:()=>{throw Error('should not read');}};await assert.rejects(h.analyzeConversationAttachment(file,controller.signal,p=>phases.push(p)),{name:'AbortError'});assert.deepEqual(phases,['reading']);assert.equal(h.calls.length,0);
});
test('missing specific extraction uses an explicit read-only fallback rather than completing with null',async()=>{
 const h=fixture(async(url,payload)=>url==='/api/ai-inbox'?payload.mode==='source-summary'?{source:{summary:'Fallback'}}:{classification:{route:'supplier_purchase',confidence:0.8}}:{}),phases=[];const result=await h.analyzeConversationAttachment(new File(['SKU A1'], 'quote.txt',{type:'text/plain'}),undefined,p=>phases.push(p));assert.match(result.source.extracted,/Fallback/);assert.match(result.source.reason,/general read-only/);assert.deepEqual(phases,['reading','classifying','extracting','fallback','complete']);
});
for(const source of [null,{},[],undefined])test(`missing generic source (${JSON.stringify(source)}) fails explicitly without a complete phase`,async()=>{
 const h=fixture(async(_url,payload)=>payload.mode==='source-summary'?{source}:{classification:{route:'unknown'}}),phases=[];await assert.rejects(h.analyzeConversationAttachment(new File(['SKU A1'],'source.txt',{type:'text/plain'}),undefined,p=>phases.push(p)),/no readable data/);assert.ok(!phases.includes('complete'));
});
test('mixed file selection preserves all four sources and enforces count and total budgets',()=>{
 const h=fixture(),files=[new File(['a'],'a.txt',{type:'text/plain'}),new File(['a,b'],'b.csv',{type:'text/csv'}),new File([new Uint8Array(signatures[0][2])],'c.png',{type:'image/png'}),new File([new Uint8Array(signatures[3][2])],'d.pdf',{type:'application/pdf'})];assert.deepEqual([...h.validateConversationFiles(files)],files);assert.throws(()=>h.validateConversationFiles([...files,files[0]]),/up to 4/);assert.throws(()=>h.validateConversationFiles([{size:16_000_001}]),/16 MB/);
});
function generatedFunction(name,globals={}){
 const path='dist/src/components/AiCopilot.js',source=read(path),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let fn;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)fn=n;ts.forEachChild(n,visit);}visit(ast);assert.ok(fn,'actual final emitted function');const ctx={AbortController,DOMException,...globals};vm.runInNewContext(fn.getText(ast)+'\nthis.run='+name+';',ctx);return ctx.run;
}
function instance(){return{mounted:true,state:{conversationAttachments:[{id:'row',status:'ready',file:{name:'a.txt'}}]},setState(change){this.state={...this.state,...(typeof change==='function'?change(this.state):change)};}};}
test('cancelled older analysis cannot clear the newer controller or busy state, or install a late source',async()=>{
 const pending=[],run=generatedFunction('__lourexAnalyzeAttachments',{analyzeConversationAttachment:()=>new Promise(resolve=>pending.push(resolve))}),h=instance();
 const old=run(h,h.state.conversationAttachments);const rejected=assert.rejects(old,{name:'AbortError'});h.__lourexAttachmentAbort.abort();const newer=run(h,h.state.conversationAttachments),newController=h.__lourexAttachmentAbort;
 pending[0]({file:{name:'old.txt'},source:{id:'old'}});await rejected;assert.equal(h.__lourexAttachmentAbort,newController);assert.equal(h.state.attachmentBusy,true);assert.notEqual(h.state.conversationAttachments[0].source?.id,'old');
 pending[1]({file:{name:'new.txt'},source:{id:'new'}});await newer;assert.equal(h.state.attachmentBusy,false);assert.equal(h.state.conversationAttachments[0].source.id,'new');
});
test('unmounted conversation ignores progress and late analysis',async()=>{
 let complete,progress;const run=generatedFunction('__lourexAnalyzeAttachments',{analyzeConversationAttachment:(_file,_signal,p)=>{progress=p;return new Promise(resolve=>{complete=resolve;});}}),h=instance(),job=run(h,h.state.conversationAttachments),rejected=assert.rejects(job,{name:'AbortError'});h.mounted=false;const before=JSON.stringify(h.state);progress('extracting');complete({source:{id:'late'}});await rejected;assert.equal(JSON.stringify(h.state),before);
});
test('canonical cancellation aborts attachment and answer controllers together',()=>{
 const path='src/components/AiCopilot.tsx',source=read(path),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='AiCopilot'),member=cls.members.find(n=>n.name?.getText(ast)==='cancelRequest');const ctx={exports:{}};vm.runInNewContext(ts.transpileModule('class Harness{'+member.getText(ast)+'}\nexports.Harness=Harness;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);const h=new ctx.exports.Harness(),attachment=new AbortController(),answer=new AbortController();h.__lourexAttachmentAbort=attachment;h.requestController=answer;h.requestGeneration=1;h.pending=true;h.cancelRequest();assert.equal(attachment.signal.aborted,true);assert.equal(answer.signal.aborted,true);assert.equal(h.requestGeneration,2);assert.equal(h.pending,false);
});
function voiceFixture(webKit=false){
 const path='dist/ai-composer-v449.js',source=read(path),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),timers=[],stops=[];let fn;const constants=[];
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='__lourexStartVoice')fn=n;if(ts.isVariableDeclaration(n)&&['NATIVE_RELEASE_RETRY_LIMIT','NATIVE_RELEASE_RETRY_MS'].includes(n.name.getText(ast)))constants.push('const '+n.getText(ast)+';');ts.forEachChild(n,visit);}visit(ast);assert.ok(fn);assert.equal(constants.length,2);
 class Element{}const panel=new Element();panel.isConnected=true;const ctx={__lourexWebKitVoice:webKit,recognition:null,PANEL:'panel',HTMLElement:Element,document:{querySelector:()=>panel},composerStatus:()=>{},clearRecognitionReleaseTimer:()=>{},nativeReleaseUntil:0,recognitionReleaseTimer:0,__lourexTransientVoiceStartError:error=>error.name==='InvalidStateError',stopRecognition:(...args)=>stops.push(args),window:{setTimeout:fn=>{timers.push(fn);return timers.length;}},Date};vm.runInNewContext(constants.join('\n')+fn.getText(ast)+'\nthis.start=__lourexStartVoice;',ctx);return {ctx,panel,timers,stops};
}
for(const webKit of [false,true])test(`emitted voice owner (${webKit?'WebKit':'default'}) retries native release and starts again`,()=>{
 const f=voiceFixture(webKit);let calls=0;const first={start(){calls++;if(calls===1)throw Object.assign(Error('busy'),{name:'InvalidStateError'});}};f.ctx.recognition=first;f.ctx.start(first,f.panel);assert.equal(f.timers.length,1);f.timers.shift()();assert.equal(calls,2);assert.equal(f.stops.length,0);
 const second={start(){calls++;}};f.ctx.recognition=second;f.ctx.start(second,f.panel);assert.equal(calls,3);
});
test('emitted voice owner reports denied permission without retrying',()=>{
 const f=voiceFixture(),recognition={start(){throw Object.assign(Error('denied'),{name:'NotAllowedError'});}};f.ctx.recognition=recognition;f.ctx.start(recognition,f.panel);assert.equal(f.timers.length,0);assert.equal(f.stops.length,1);assert.equal(f.stops[0][3],'voiceDenied');
});
test('voice retry cannot restart an obsolete recognition instance after cancellation or panel removal',()=>{
 const f=voiceFixture();let calls=0;const recognition={start(){calls++;throw Object.assign(Error('busy'),{name:'InvalidStateError'});}};f.ctx.recognition=recognition;f.ctx.start(recognition,f.panel);f.ctx.recognition=null;f.timers.shift()();assert.equal(calls,1);f.ctx.recognition=recognition;f.panel.isConnected=false;f.ctx.start(recognition,f.panel);assert.equal(calls,1);
});
test('repeated selection retains existing sources; busy drops and over-budget batches cannot erase them',()=>{
 const h=instance(),validation=fixture().validateConversationFiles,add=generatedFunction('__lourexAddFiles',{__lourexFileKey:generatedFunction('__lourexFileKey'),validateConversationFiles:validation,t:en=>en}),a=new File(['a'],'a.txt'),b=new File(['b'],'b.csv');h.state.conversationAttachments=[{id:'a',file:a,status:'ready'}];
 add(h,[a,b]);assert.equal(h.state.conversationAttachments.length,2);assert.equal(h.state.conversationAttachments[0].id,'a');const kept=h.state.conversationAttachments;h.state.attachmentBusy=true;add(h,[new File(['c'],'c.txt')]);assert.equal(h.state.conversationAttachments,kept);assert.match(h.state.error,/stop it before adding files/);
 h.state.attachmentBusy=false;add(h,[new File(['c'],'c.txt'),new File(['d'],'d.txt'),new File(['e'],'e.txt')]);assert.equal(h.state.conversationAttachments,kept);assert.match(h.state.error,/up to 4/);
});

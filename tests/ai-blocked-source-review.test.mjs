import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {attachmentScopeKey,explicitAttachedFileFollowup} from '../dist/src/lib/ai-attachment-followup.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
function fixture(review){
 const code=readFileSync('dist/src/components/AiCopilot.js','utf8'),ast=ts.createSourceFile('copilot.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let fn;
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='__lourexInstallPremiumConversation')fn=n;ts.forEachChild(n,visit);}visit(ast);assert.ok(fn);
 let evidence=[];const ctx={attachmentScopeKey,explicitAttachedFileFollowup,t:en=>en,__lourexSetConversationSources:x=>{evidence=x;},__lourexGetConversationSources:()=>evidence,__lourexAnalyzeAttachments:async(_h,rows)=>rows.map(row=>({file:row.file,source:row.source}))};
 vm.runInNewContext(fn.getText(ast)+';this.install=__lourexInstallPremiumConversation;',ctx);
 const host={__intelligenceKernel:{mode:'controller',scope:{scope:'business',accountId:'a',workspaceId:'w',branchId:'b',threadId:'t'}},state:{input:'prepare source quote',messages:[]},setState(change){Object.assign(this.state,typeof change==='function'?change(this.state):change);},async ask(){this.__lourexSourceReviewRequired=review;this.state.input='';this.state.messages.push({id:'answer',role:'assistant',text:review?'Please review source rows':'Prepared'});}};
 ctx.install(host);const rows=[{id:'one',file:{name:'source.pdf'},status:'done',source:{fileName:'source.pdf',route:'quote_request',extracted:'{"items":[]}'}}];host.state.conversationAttachments=rows;return{host,rows};
}
test('a delivered review refusal retains exact completed sources and restores the draft',async()=>{
 const {host,rows}=fixture(true);await host.ask();assert.equal(host.state.conversationAttachments,rows);assert.equal(host.state.input,'prepare source quote');assert.equal(host.state.error,undefined);
});
test('a normal successful source reply still clears source chips',async()=>{
 const {host}=fixture(false);await host.ask();assert.equal(host.state.conversationAttachments.length,0);assert.equal(host.state.input,'');
});
test('source conversion refusal is a typed review outcome, never an executable proposal',async()=>{
 const vault=emptyVault(),before=structuredClone(vault);
 const source={fileName:'original.pdf',route:'quote_request',documentType:'rfq',confidence:.9,extracted:JSON.stringify({currency:'USD',items:[{sku:'QA-A',quantity:'8',unit:'PCS',unitPrice:'1.25'}]})};
 const result=await orchestrateAiToolRequest({message:'جهز عرض سعر من المرفقين',vault,language:'ar',context:{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'},conversationSources:[source,{...source,fileName:'correction.png'}]}});
 assert.equal(result.sourceReviewRequired,true);assert.equal(result.proposal,null);assert.equal(result.workingDraft,undefined);assert.deepEqual(vault,before);
});

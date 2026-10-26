import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileProgressLabel} from '../dist/src/lib/ai-file-progress.js';
import {CONVERSATION_ATTACHMENT_PROCESSING_BUDGET_MS,startConversationAttachmentBudget} from '../dist/src/lib/ai-conversation-attachments.js';

const file=(id,status='ready',phase)=>({id,status,phase,source:null});
const validRows=84;
const evidence=JSON.stringify({parser:'exact-spreadsheet-columns',
 sourceRowCount:validRows,items:Array.from({length:validRows},(_,i)=>({sku:'SKU-'+(i+1)}))});
test('F16 file progress reflects actual stage and accurate X/Y of multiple attachments',()=>{
 const rows=[file('a','processing','reading'),file('b','processing','extracting'),file('c')];
 assert.equal(fileProgressLabel(rows,rows[0],true),'الملف 1/3 · جارٍ قراءة الملف');
 assert.equal(fileProgressLabel(rows,rows[1],true),'الملف 2/3 · جارٍ استخراج البيانات');
 assert.equal(fileProgressLabel(rows,rows[2],false),'File 3/3 · Ready for analysis');
 assert.equal(fileProgressLabel([file('one','processing','classifying')],file('one','processing','classifying'),false),'Identifying document');
});
test('F16 84 extracted rows are shown only when deterministic source-row count matches all rows',()=>{
 const row={id:'rfq',status:'done',source:{quoteSheetCandidate:evidence}};
 assert.equal(fileProgressLabel([row],row,true),'اكتمل استخراج 84 صنفًا · راجع البيانات');
 assert.match(fileProgressLabel([row],row,false),/84 complete source rows/);
 const truncated={...row,source:{quoteSheetCandidate:JSON.stringify({parser:'exact-spreadsheet-columns',sourceRowCount:84,items:[{sku:'first only'}]})}};
 assert.doesNotMatch(fileProgressLabel([truncated],truncated,false),/84 complete source rows/);
 const modelOnly={...row,source:{extracted:evidence}};
 assert.doesNotMatch(fileProgressLabel([modelOnly],modelOnly,false),/84 complete source rows/);
});
test('F16 errors, missing stage and malformed source never produce fabricated counts',()=>{
 const rows=[file('x','error'),file('y','processing','unexpected')];
 assert.match(fileProgressLabel(rows,rows[0],true),/تعذر استخراج/);
 assert.match(fileProgressLabel(rows,rows[1],false),/Processing/);
 const row={id:'bad',status:'done',source:{quoteSheetCandidate:'not JSON'}};
 assert.match(fileProgressLabel([row],row,true),/راجع البيانات/);
 assert.doesNotMatch(fileProgressLabel([row],row,true),/صنفًا/);
});
test('F16 one deadline aborts the whole file-processing chain and clears its timer',async()=>{
 assert.equal(CONVERSATION_ATTACHMENT_PROCESSING_BUDGET_MS,75_000);
 const controller=new AbortController(),budget=startConversationAttachmentBudget(controller,10);
 await new Promise(resolve=>controller.signal.addEventListener('abort',resolve,{once:true}));
 assert.equal(budget.expired(),true);
 assert.equal(controller.signal.aborted,true);
 budget.dispose();
 const cancelled=new AbortController(),stopped=startConversationAttachmentBudget(cancelled,10);
 stopped.dispose();
 await new Promise(resolve=>setTimeout(resolve,15));
 assert.equal(stopped.expired(),false);
 assert.equal(cancelled.signal.aborted,false);
});
test('F16 generated attachment owner uses one deadline and returns a safe timeout failure',async()=>{
 const owner=await readFile(new URL('../scripts/ai-batch3-premium-conversation.mjs',import.meta.url),'utf8');
 assert.match(owner,/startConversationAttachmentBudget\(controller\)/);
 assert.match(owner,/if\(budget\.expired\(\)\)throw new Error/);
 assert.match(owner,/budget\.dispose\(\)/);
 assert.match(owner,/No draft was prepared/);
});
test('F16 generated browser UI uses verified progress rather than just file classification',async()=>{
 const script=await readFile(new URL('../scripts/ai-batch3-premium-conversation.mjs',import.meta.url),'utf8');
 const generated=await readFile(new URL('../dist/src/components/AiCopilot.js',import.meta.url),'utf8');
 assert.match(script,/const progressTarget=/);
 assert.match(script,/fileProgressLabel\(rows,row,instance\.props\.language==='ar'\)/);
 assert.match(generated,/import \{fileProgressLabel\} from '\.\.\/lib\/ai-file-progress\.js'/);
 assert.match(generated,/fileProgressLabel\(rows,row,instance\.props\.language==='ar'\)/);
 assert.match(generated,/validateConversationFiles\(rows\.map\(row=>row\.file\)\);if\(rows\.length>existing\.length\)/);
 assert.match(generated,/instance\.__lourexLastConversationSources=\[\]/);
 assert.match(generated,/typeof __lourexSetConversationSources==='function'/);
 assert.match(script,/startConversationAttachmentBudget\(controller\)/);
 assert.match(script,/budget\.expired\(\)/);
 assert.match(script,/90 seconds including planning/);
});

test('F16 incomplete or failed multi-file AI delivery keeps all selected attachments for retry',async()=>{
 const owner=await readFile(new URL('../scripts/ai-batch3-conversation-lifecycle-fix.mjs',import.meta.url),'utf8');
 const compiled=await readFile(new URL('../dist/src/components/AiCopilot.js',import.meta.url),'utf8');
 assert.match(owner,/Attachment response must be confirmed before its source chips are discarded/);
 assert.match(compiled,/const previousAssistantIds=new Set/);
 assert.match(compiled,/const verifiedResponse=/);
 assert.match(compiled,/if\(!verifiedResponse\|\|instance\.state\.error\)/);
 assert.match(compiled,/All attachments remain available to retry/);
 assert.match(compiled,/instance\.setState\(\{conversationAttachments:\[\],attachmentMenuOpen:false\}\)/);
});

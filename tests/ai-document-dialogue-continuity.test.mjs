import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sanitizeDocumentConversation,dialogueClaimsDocumentCreation,dialogueRepeatsLastAnswer,buildNaturalLourexPrompt} from '../api/_ai/lourex-dialogue.js';
const compiled=readFileSync('dist/src/lib/ai-intelligence-runtime.js','utf8');
const start=compiled.indexOf('export function pendingDocumentDialogue(');
const end=compiled.indexOf('export function intelligenceRequestMessage(',start);
const factory=new Function('currentConversationMode',compiled.slice(start,end).replaceAll('export function ','function ')+';return {pendingDocumentDialogue,intelligenceDraftGrounding};');
const {pendingDocumentDialogue:pending,intelligenceDraftGrounding:ground}=factory(host=>host.mode);
const turns=[{role:'user',text:'اعمل عرض سعر من منتجات شيبسيكو'},
 {role:'assistant',text:'كم كرتون من كل نوع؟'},
 {role:'user',text:'10 كراتين من كل نوع'},
 {role:'assistant',text:'هل لديك أي تفضيلات أخرى قبل المراجعة؟'},
 {role:'user',text:'لا'}];
test('short follow-ups retain the initiating document request and user facts',()=>{
 const state=pending(turns,'controller',false);
 assert.equal(state.kind,'proforma');
 assert.deepEqual(state.userFacts,[turns[0].text,'10 كراتين من كل نوع','لا']);
 assert.equal(state.lastQuestion,turns[3].text);
 assert.deepEqual(sanitizeDocumentConversation(state),state);
});
test('assistant claims and invented numeric values cannot ground a document',()=>{
 const messages=[...turns,{role:'assistant',text:'تم إعداد المسودة مع 999 كرتون USD 12345'},{role:'user',text:'جهزها'}];
 const text=ground({mode:'controller',state:{messages}}, {capability:'document.createDraft'},'جهزها');
 assert.ok(text.includes('10 كراتين'));
 assert.ok(!text.includes('999'));
 assert.ok(!text.includes('12345'));
 assert.equal(ground({mode:'controller',state:{messages}}, {capability:'item.archive'},'جهزها'),'جهزها');
});
test('Advisor, existing artifacts, cancelled tasks and another empty thread cannot inherit create intent',()=>{
 assert.equal(pending(turns,'advisor',false),null);
 assert.equal(pending(turns,'controller',true),null);
 assert.equal(pending([...turns,{role:'user',text:'ألغي الطلب'}],'controller',false),null);
 assert.equal(pending([{role:'user',text:'لا'}],'controller',false),null);
 assert.equal(pending([{role:'assistant',text:'اعمل عرض سعر'},{role:'user',text:'لا'}],'controller',false),null);
});
test('bounded context retains the initiating request through repeated clarification turns',()=>{
 const repeated=[turns[0],...Array.from({length:30},(_,i)=>({role:i%2?'user':'assistant',text:i%2?'لا':'هل لديك تفاصيل أخرى؟'}))];
 const state=pending(repeated,'controller',false);
 assert.equal(state.userFacts[0],turns[0].text);
 assert.ok(state.userFacts.length<=12);
 assert.equal(sanitizeDocumentConversation({kind:'proforma',userFacts:['لا'],lastQuestion:'create a quote'}),null);
});
test('Core routes a short Controller follow-up through the structured review gateway',()=>{
 const source=readFileSync('api/ai-core.js','utf8');
 const line=source.split('\n').find(line=>line.startsWith('function draftActionRequested('));
 const route=new Function('previewOnlyDocumentRequested',line+';return draftActionRequested;')(text=>/preview only|لا تحفظ/i.test(text));
 const context={conversationMode:'controller',documentConversation:pending(turns,'controller',false)};
 assert.equal(route('لا',context),true);
 assert.equal(route('10 كراتين',context),true);
 assert.equal(route('لا',{...context,documentConversation:null}),false);
 assert.equal(route('لا',{...context,conversationMode:'advisor'}),false);
 assert.equal(route('ألغي الطلب',context),false);
 assert.equal(route('لا تحفظ',context),false);
});
test('text-only dialogue rejects fabricated draft-completion claims and prompt respects current answers',()=>{
 assert.equal(dialogueClaimsDocumentCreation('تمام، تم إعداد مسودة عرض السعر. هل لديك تفاصيل أخرى؟'),true);
 assert.equal(dialogueClaimsDocumentCreation('Prepared the quotation draft.'),true);
 assert.equal(dialogueClaimsDocumentCreation('ما العملة المطلوبة لعرض السعر؟'),false);
 const prompt=buildNaturalLourexPrompt({message:'لا',context:{documentConversation:pending(turns,'controller',false)}},{mode:'controller'});
 assert.match(prompt,/no\/لا to an optional-preferences question means no extra preferences/);
 assert.match(prompt,/never claim a draft was created/);
 assert.ok(prompt.includes('10 كراتين'));
});

test('the exact previous optional question cannot pass as a fresh answer to no',()=>{
 const context={documentConversation:pending(turns,'controller',false)};
 assert.equal(dialogueRepeatsLastAnswer(turns[3].text,context,'لا'),true);
 assert.equal(dialogueRepeatsLastAnswer('ما العملة المطلوبة؟',context,'لا'),false);
 assert.equal(dialogueRepeatsLastAnswer(turns[3].text,context,'كرر سؤالك'),false);
});

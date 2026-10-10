import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyConversationalSession,reviseConversationalSession,conversationalReview,conversationProposal,customerOrdinal,validCommercialSession} from '../dist/src/lib/ai-conversational-engine.js';
import {assertAiDocumentCreateApproval} from '../dist/src/lib/ai-document-approval-guard.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
const operation=(type,fields={})=>({type,target:'',field:'',value:'',quantity:'',price:'',unit:'',mode:'set',evidence:'',...fields});
function quotation(){let state=emptyConversationalSession();state.customers=[{id:'c1',name:'First company'},{id:'c2',name:'Second company'}];return reviseConversationalSession(state,[operation('draft',{field:'currency',value:'USD',evidence:'دولار'}),operation('line',{target:'ريدبول',quantity:'4000',price:'22.50',unit:'كرتون',evidence:'ريدبول 4000 كرتون بسعر 22.50'}),operation('line',{target:'مونستر',quantity:'2000',price:'22.00',unit:'كرتون',evidence:'مونستر 2000 كرتون بسعر 22.00'}),operation('shipping',{value:'3000',evidence:'الشحن 3000'}),operation('terms',{field:'delivery',value:'مرسين',evidence:'التسليم مرسين'})],'دولار ريدبول 4000 كرتون بسعر 22.50 ومونستر 2000 كرتون بسعر 22.00 الشحن 3000 التسليم مرسين');}
test('Arabic quotation retains products, shipping and second-customer selection over ten turns',()=>{
 let state=quotation();const id=state.draft.lines[0].id;
 state=reviseConversationalSession(state,[operation('customer',{value:'2',evidence:'الثاني'})],'الثاني');
 state=reviseConversationalSession(state,[operation('adjust',{target:id,field:'quantity',mode:'add',value:'500',evidence:'ضيف 500 كرتون ريدبول'})],'ضيف 500 كرتون ريدبول');
 state=reviseConversationalSession(state,[operation('adjust',{target:id,field:'price',mode:'subtract',value:'0.5',evidence:'خفّض سعره نص دولار'})],'خفّض سعره نص دولار');
 for(let i=0;i<6;i++)state=reviseConversationalSession(state,[],'خلينا نناقش التسليم');
 assert.equal(state.draft.customerId,'c2');assert.equal(state.draft.lines[0].quantity,'4500.0000');assert.equal(state.draft.lines[0].price,'22.0000');assert.equal(state.draft.lines.length,2);assert.equal(state.draft.shipping,'3000');assert.equal(state.draft.delivery,'مرسين');
 assert.equal(conversationalReview(state.draft,state.customers).totals.grandTotal,'146000.00');assert.ok(conversationProposal(state.draft,state.customers,'ar'));assert.ok(validCommercialSession(JSON.parse(JSON.stringify(state))));
});
test('missing pallet conversion keeps carton quantity and blocks approval; known conversion is deterministic',()=>{
 let state=quotation();const id=state.draft.lines[0].id;
 state=reviseConversationalSession(state,[operation('packaging',{target:id,field:'pallets',value:'24',evidence:'الطبالي 24'})],'الطبالي 24');
 assert.equal(state.draft.lines[0].quantity,'4000');assert.match(conversationalReview(state.draft,state.customers).missing.join(' '),/cartonsPerPallet/);assert.equal(conversationProposal(state.draft,state.customers,'ar'),null);
 state=reviseConversationalSession(state,[operation('packaging',{target:id,field:'cartonsPerPallet',value:'100',evidence:'100 كرتون للطبلية'})],'100 كرتون للطبلية');assert.equal(state.draft.lines[0].quantity,'2400.00');
});
test('invalid or invented numbers abort every revision without modifying original draft',()=>{
 const state=quotation(),before=JSON.stringify(state),id=state.draft.lines[0].id;
 assert.throws(()=>reviseConversationalSession(state,[operation('adjust',{target:id,field:'quantity',value:'500',evidence:'500'}),operation('adjust',{target:id,field:'price',value:'90',evidence:'500'})],'500'),/not grounded/);
 assert.equal(JSON.stringify(state),before);
 assert.throws(()=>reviseConversationalSession(state,[operation('adjust',{target:id,field:'price',mode:'subtract',value:'500',evidence:'500'})],'500'),/Invalid decimal/);
});
test('customer ordinal is bound to the displayed ordering and cannot choose a different customer',()=>{
 assert.equal(customerOrdinal('the second one'),2);assert.equal(customerOrdinal('الثاني'),2);assert.equal(customerOrdinal('اختر العميل رقم ٢'),2);assert.equal(customerOrdinal('ضيف 500 كرتون'),null);
 const state=quotation();assert.throws(()=>reviseConversationalSession(state,[operation('customer',{value:'c1',evidence:'الثاني'})],'الثاني'),/does not match/);assert.throws(()=>reviseConversationalSession(state,[operation('customer',{value:'outside',evidence:'outside'})],'outside'),/unavailable/);
});
test('incomplete drafts can be discussed, currency conversion and attachment customer selection fail closed',()=>{
 const state=quotation();assert.equal(conversationProposal(state.draft,state.customers,'en'),null);
 assert.throws(()=>reviseConversationalSession(state,[operation('draft',{field:'currency',value:'EUR',evidence:'EUR'})],'EUR'),/conversion/);
 assert.throws(()=>reviseConversationalSession(state,[operation('customer',{value:'c2',evidence:'Second company'})],'analyze file',['Second company']),/Select the customer/);
});
test('reviewed conversational drafts accept 21 complete rows, guard still rejects cross-company and invalid shipping',()=>{
 let state=quotation();state=reviseConversationalSession(state,[operation('customer',{value:'2',evidence:'الثاني'})],'الثاني');
 for(let i=2;i<21;i++)state.draft.lines.push({...state.draft.lines[0],id:'extra-'+i,name:'Row '+i});
 const proposal=conversationProposal(state.draft,state.customers,'en'),vault=emptyVault();vault.customers=[{id:'c2',workspaceId:'default',companyNameEn:'Second company',companyNameAr:'',email:''}];
 assert.equal(proposal.items.length,21);assert.doesNotThrow(()=>assertAiDocumentCreateApproval(vault,proposal));
 assert.throws(()=>assertAiDocumentCreateApproval(vault,{...proposal,customerId:'outside'}),/active company/);assert.throws(()=>assertAiDocumentCreateApproval(vault,{...proposal,shipping:'-1'}),/shipping/);
});
test('restored drafts reject malformed state rather than trusting encrypted historical payloads',()=>{
 const state=quotation();assert.equal(validCommercialSession({...state,draft:{...state.draft,shipping:'NaN'}}),false);assert.equal(validCommercialSession({...state,draft:{...state.draft,lines:[state.draft.lines[0],state.draft.lines[0]]}}),false);
});

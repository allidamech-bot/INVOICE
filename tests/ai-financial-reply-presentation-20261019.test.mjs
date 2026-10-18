import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatAiBusinessRecordReply} from '../dist/src/lib/ai-tool-presentation.js';
import {parseFinancialReadout} from '../dist/src/lib/ai-financial-readout.js';

function fixture(){
 const doc={id:'private-doc-id',number:'INV-2026-0003',kind:'invoice',status:'final',
  issueDate:'2026-10-16',currency:'USD',customerName:'QA Invoice Buyer',
  itemCount:24,itemsTruncated:true,items:Array.from({length:20},(_,i)=>({
   id:'hidden-item-'+i,descriptionEn:'QA Product '+(i+1),
   descriptionAr:'صنف اختبار '+(i+1),quantity:'10',unit:'PCS',unitPrice:'1.03'})),
  totals:{subtotal:'3090.00',tax:'309.00',grandTotal:'3399.00'}};
 const customer={id:'secret-customer-id',name:'QA Invoice Buyer',
  receivables:[{currency:'USD',billed:'3399.00',paid:'399.00',outstanding:'3000.00'}]};
 const history={customerId:'secret-customer-id',statements:[{currency:'USD',
  billed:'3399.00',paid:'399.00',outstanding:'3000.00',entries:[
   {type:'invoice',date:'2026-10-16',reference:'INV-2026-0003',
    debit:'3399.00',credit:'0.00',balance:'3399.00'},
   {type:'payment',date:'2026-10-16',reference:'QA752-PAY-01 TEST ONLY',
    debit:'0.00',credit:'399.00',balance:'3000.00',relatedInvoiceNumber:'INV-2026-0003'}
  ]}]};
 return{answer:'Legacy wall of text',plan:{version:1,calls:[]},
  results:[
   {tool:'document.get',ok:true,class:'read',data:doc},
   {tool:'customer.getSummary',ok:true,class:'read',data:customer},
   {tool:'customer.getHistory',ok:true,class:'read',data:history}
  ]};
}
test('financial readout prioritizes invoice totals, payments and customer balance over optional twenty product lines',()=>{
 const result=fixture(),original=structuredClone(result);
 for(const language of ['ar','en']){
  const output=formatAiBusinessRecordReply(result,language);
  assert.ok(output);
  assert.match(output,/INV-2026-0003/);
  assert.match(output,/QA Invoice Buyer/);
  assert.match(output,/3090\.00/);
  assert.match(output,/309\.00/);
  assert.match(output,/3399\.00/);
  assert.match(output,/399\.00/);
  assert.match(output,/3000\.00/);
  assert.match(output,/QA752-PAY-01 TEST ONLY/);
  assert.match(output,/2026-10-16/);
  assert.match(output,/:::lourex-details/);
  assert.match(output,/:::lourex-end/);
  assert.ok(output.indexOf('QA752-PAY-01 TEST ONLY')<output.indexOf(':::lourex-details'));
  assert.doesNotMatch(output,/private-doc-id|secret-customer-id|Entries:\s*\.{3}/);
  assert.match(output,language==='ar'?/حركات الحساب المسجلة/:/Recorded account movements/);
  assert.match(output,language==='ar'?/القائمة جزئية/:/Partial list/);
  assert.ok(output.length<=4750);
 }
 assert.deepEqual(result,original,'display must never mutate business records');
});
test('read-only customer statements render independently and keep currencies separate',()=>{
 const data=fixture(),result={results:data.results.slice(1)};
 result.results[1].data.statements.push({currency:'EUR',entries:[
  {type:'payment',date:'2026-10-18',reference:'EUR-RECEIPT',credit:'20.00',balance:'40.00'}]});
 const output=formatAiBusinessRecordReply(result,'en');
 assert.match(output,/EUR-RECEIPT/);
 assert.match(output,/20\.00/);
 assert.match(output,/QA752-PAY-01 TEST ONLY/);
 assert.match(output,/399\.00/);
 assert.doesNotMatch(output,/:::lourex-details/);
});
test('an unrelated tool or an absent result does not replace original specialized renderer',()=>{
 assert.equal(formatAiBusinessRecordReply({results:[{tool:'product.getSummary',ok:true,data:{sku:'X'}}]},'en'),null);
 assert.equal(formatAiBusinessRecordReply({results:[]},'ar'),null);
});
test('an incomplete document never claims missing total and failed reads stay visible',()=>{
 const result=fixture();result.results[0].data={truncated:true,number:'INV-2026-0003'};
 result.results[2]={tool:'customer.getHistory',ok:false,summary:'Customer ledger unavailable',data:null};
 const output=formatAiBusinessRecordReply(result,'en');
 assert.match(output,/incomplete|Incomplete/i);
 assert.match(output,/Customer ledger unavailable/);
 assert.doesNotMatch(output,/:::lourex-details/);
});
test('large item listing cannot leak raw collapsible markup when trimmed',()=>{
 const result=fixture();
 result.results[0].data.items=result.results[0].data.items.map((item,i)=>({...item,descriptionEn:'Very long catalog identity '+('A'.repeat(160))+' '+i}));
 const output=formatAiBusinessRecordReply(result,'en');
 assert.ok(output.length<=4750);
 assert.equal(output.includes(':::lourex-details'),output.includes(':::lourex-end'));
});

test('pure canonical reader returns typed financial data, not nested React or accounting calculations',()=>{
 for(const language of ['ar','en']){
  const source=formatAiBusinessRecordReply(fixture(),language);
  const model=parseFinancialReadout(source);
  assert.ok(model);
  assert.match(model.title,/INV-2026-0003/);
  assert.equal(model.party,'QA Invoice Buyer');
  assert.equal(model.items.length,20);
  assert.equal(model.partial,true);
  assert.ok(model.sections.length>=3);
  assert.ok(model.sections.flatMap(row=>row.facts).some(row=>row.value.includes('3000.00')));
  assert.ok(model.sections.flatMap(row=>row.movements).some(row=>
    row.reference==='QA752-PAY-01 TEST ONLY'&&row.amount.includes('399.00')&&row.balance.includes('3000.00')));
  assert.doesNotMatch(JSON.stringify(model),/:::lourex|private-doc-id|secret-customer-id/);
 }
 assert.equal(parseFinancialReadout('## Invoice\n:::lourex-details x\nbad data'),null);
 assert.equal(parseFinancialReadout('ordinary free text'),null);
 assert.equal(parseFinancialReadout('## Invoice\n:::lourex-details x\n:::lourex-end\ntrailing'),null);
});
test('real shipped UI replaces legacy malformed financial JSX with ONE accessible financial report',async()=>{
 const previousReact=globalThis.React;
 const React={
  Fragment:Symbol.for('react.fragment'),
  createElement:(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}}),
  isValidElement:value=>Boolean(value&&typeof value==='object'&&'type'in value),
  cloneElement:(node,props,...children)=>({type:node.type,props:{...node.props,...props,...(children.length?{children:children.length===1?children[0]:children}:{})}}),
  Children:{toArray:value=>value===undefined||value===null?[]:Array.isArray(value)?value:[value]}
 };
 globalThis.React=React;
 try{
  const {renderConversationWorkspace}=await import('../dist/src/components/AiConversationWorkspace.js');
  const source=formatAiBusinessRecordReply(fixture(),'ar');
  let clicks=0;const copy=()=>clicks++;
  const e=React.createElement;
  const legacy=e('div',{className:'lourex-ai-structured-answer'},
    e('section',{className:'lourex-ai-answer-block is-summary'},
     e('div',{className:'lourex-ai-answer-copy'},e('p',{},'فاتورة INV-2026-0003 ### القيم المالية'),
       e('p',{},':::lourex-details أصناف المستند (20/24)'),
       e('ul',{},e('li',{},'1. QA Product 01')))));
  const turn=e('div',{className:'lourex-ai-messages'},
   e('div',{className:'lourex-ai-message user'},'أريد الفاتورة'),
   e('div',{className:'lourex-ai-message assistant'},legacy,
    e('div',{className:'lourex-ai-message-actions'},e('button',{onClick:copy},'نسخ'))));
  const host={props:{language:'ar'},state:{messages:[
   {role:'user',text:'أريد الفاتورة'},{role:'assistant',text:source}
  ]}};
  const rendered=renderConversationWorkspace(host,turn);
  const collect=node=>Array.isArray(node)?node.flatMap(collect):React.isValidElement(node)?[node,...collect(typeof node.type==='function'?node.type(node.props):node.props?.children)]:[];
  const nodes=collect(rendered);
  assert.equal(nodes.filter(n=>n.type==='article'&&n.props.className==='lxbr').length,1);
  assert.equal(nodes.filter(n=>n.type==='details'&&n.props.className==='lxbr-items').length,1);
  assert.equal(nodes.filter(n=>n.type==='summary').length,1);
  assert.ok(nodes.filter(n=>n.type==='h3').length>=1);
  assert.ok(nodes.filter(n=>n.type==='h4').length>=3);
  assert.ok(nodes.filter(n=>n.type==='dt').length>=5);
  assert.ok(nodes.some(n=>n.type==='bdi'&&String(n.props.children).includes('QA752-PAY-01')));
  assert.equal(nodes.some(n=>n.props?.className==='lourex-ai-structured-answer'),false);
  const visible=nodes.filter(n=>['h3','h4','p','dd','li','summary'].includes(n.type))
    .map(n=>JSON.stringify(n.props.children)).join(' ');
  assert.doesNotMatch(visible,/:::lourex|###/);
  assert.match(visible,/INV-2026-0003/);
  const button=nodes.find(n=>n.type==='button'&&n.props.onClick===copy);
  assert.ok(button);button.props.onClick();assert.equal(clicks,1);
  assert.ok(nodes.some(n=>n.props?.className?.includes?.('lourex-ai-message user')));
  // The original stored text must not be rewritten by presentation.
  assert.equal(host.state.messages[1].text,source);
 }finally{globalThis.React=previousReact;}
});
test('ordinary assistant replies and unrelated React action nodes are unchanged',async()=>{
 const previousReact=globalThis.React;
 const React={
  Fragment:Symbol.for('react.fragment'),
  createElement:(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}}),
  isValidElement:value=>Boolean(value&&typeof value==='object'&&'type'in value),
  cloneElement:(node,props,...children)=>({type:node.type,props:{...node.props,...(children.length?{children:children.length===1?children[0]:children}:{})}}),
  Children:{toArray:value=>value===undefined||value===null?[]:Array.isArray(value)?value:[value]}
 };
 globalThis.React=React;
 try{
  const {renderConversationWorkspace}=await import('../dist/src/components/AiConversationWorkspace.js');
  const e=React.createElement,clicked=()=>{};
  const tree=e('div',{className:'lourex-ai-messages'},
   e('div',{className:'lourex-ai-message assistant'},
    e('div',{className:'lourex-ai-structured-answer'},e('p',{},'Ordinary answer')),
    e('div',{className:'lourex-ai-message-actions'},e('button',{onClick:clicked},'Copy'))));
  const rendered=renderConversationWorkspace({props:{language:'en'},state:{messages:[{role:'assistant',text:'Ordinary answer'}]}},tree);
  const all=node=>Array.isArray(node)?node.flatMap(all):React.isValidElement(node)?[node,...all(node.props?.children)]:[];
  const nodes=all(rendered);
  assert.equal(nodes.filter(n=>n.type==='article'&&n.props.className==='lxbr').length,0);
  assert.ok(nodes.some(n=>n.props?.className==='lourex-ai-structured-answer'));
  assert.ok(nodes.some(n=>n.type==='button'&&n.props.onClick===clicked));
 }finally{globalThis.React=previousReact;}
});
test('production build has one report owner and precaches its typed modules',()=>{
 const ui=readFileSync('dist/src/components/AiConversationWorkspace.js','utf8');
 assert.match(ui,/parseFinancialReadout/);
 assert.match(ui,/AiFinancialReadout/);
 assert.doesNotMatch(ui,/originalFinancialReadout|lxw-ai-record-details/);
 const view=readFileSync('dist/src/components/AiFinancialReadout.js','utf8');
 assert.match(view,/lxbr-items/);
 const sw=readFileSync('dist/sw.js','utf8');
 assert.match(sw,/src\/components\/AiFinancialReadout\.js/);
 assert.match(sw,/src\/lib\/ai-financial-readout\.js/);
});

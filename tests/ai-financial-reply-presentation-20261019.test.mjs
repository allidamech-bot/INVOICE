import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatAiBusinessRecordReply} from '../dist/src/lib/ai-tool-presentation.js';

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
test('production bundle calls the concise financial formatter before falling back, and has accessible details renderer',()=>{
 const bundle=readFileSync('dist/src/components/AiCopilot.js','utf8');
 const call=bundle.indexOf('formatAiBusinessRecordReply(result,language)');
 const fallback=bundle.indexOf("if(!result?.results?.length)return String(result?.answer||'')");
 assert.ok(call>=0&&fallback>=0&&call<fallback);
 const workspace=readFileSync('dist/src/components/AiConversationWorkspace.js','utf8');
 assert.match(workspace,/lxw-ai-record-details/);
 assert.match(workspace,/:::lourex-end/);
 assert.match(workspace,/summary/);
});


test('actual workspace adapter renders a nested financial answer exactly once, keeps collapsible lines and original copy callback',async()=>{
 const previousReact=globalThis.React;
 const Fragment=Symbol.for('react.fragment');
 globalThis.React={
  Fragment,
  createElement:(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}}),
  isValidElement:value=>Boolean(value&&typeof value==='object'&&'type'in value),
  cloneElement:(node,props,...children)=>({type:node.type,props:{...node.props,...props,...(children.length?{children:children.length===1?children[0]:children}:{})}}),
  Children:{toArray:value=>value===undefined||value===null?[]:Array.isArray(value)?value:[value]}
 };
 try{
  const {renderConversationWorkspace}=await import('../dist/src/components/AiConversationWorkspace.js');
  const answer=formatAiBusinessRecordReply(fixture(),'ar');
  assert.ok(answer?.includes(':::lourex-details '));
  const e=globalThis.React.createElement;
  let copied=0;
  const callback=()=>copied++;
  // The shipped owner may nest response strings in the legacy copy wrapper.
  // That wrapper must not flatten the financial disclosure markers into text.
  const wrapped=e('div',{className:'lourex-ai-message assistant'},
   e('div',{className:'lourex-ai-answer-copy'},answer),
   e('div',{className:'lourex-ai-message-actions'},e('button',{onClick:callback},'Copy')));
  const plain=e('div',{className:'lourex-ai-message assistant'},answer);
  const host={props:{language:'ar'},state:{}};
  const descendants=node=>Array.isArray(node)?node.flatMap(descendants):
    node&&typeof node==='object'&&'type'in node?[node,...descendants(node.props?.children)]:[];
  for(const tree of [wrapped,plain]){
   const rendered=renderConversationWorkspace(host,tree);
   const nodes=descendants(rendered);
   assert.equal(nodes.filter(n=>n.type==='details'&&n.props.className==='lxw-ai-record-details').length,1);
   assert.equal(nodes.filter(n=>n.type==='summary').length,1);
   assert.equal(nodes.filter(n=>n.type==='section'&&n.props.className==='lxw-financial-answer').length,1);
   assert.ok(nodes.some(n=>n.type==='h3'));
   assert.ok(nodes.some(n=>n.type==='h4'));
   assert.ok(nodes.some(n=>n.type==='li'));
   // User-visible text must not expose internal readout delimiters.
   const outside=nodes.filter(n=>n.type==='p'||n.type==='h3'||n.type==='h4')
     .map(n=>JSON.stringify(n.props.children)).join(' ');
   assert.doesNotMatch(outside,/:::lourex-details|:::lourex-end/);
  }
  const wrappedRendered=renderConversationWorkspace(host,wrapped);
  const buttons=descendants(wrappedRendered).filter(n=>n.type==='button');
  assert.equal(buttons.length,1);assert.equal(buttons[0].props.onClick,callback);
  buttons[0].props.onClick();assert.equal(copied,1);
 }finally{globalThis.React=previousReact;}
});


test('actual post-build Stage 4 renderer hands a local financial record to workspace without splitting the disclosure',async()=>{
 const vm=await import('node:vm');
 const source=readFileSync('dist/src/components/AiCopilot.js','utf8');
 const begin=source.indexOf('function __lourexAnswerLines(');
 const end=source.indexOf('function __lourexDecisionCard(',begin);
 assert.ok(begin>=0&&end>begin,'the compiled legacy structured-answer owner must be present');
 const previousReact=globalThis.React;
 const Fragment=Symbol.for('react.fragment');
 const react={
  Fragment,
  createElement:(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}}),
  isValidElement:value=>Boolean(value&&typeof value==='object'&&'type'in value),
  cloneElement:(node,props,...children)=>({type:node.type,props:{...node.props,...props,...(children.length?{children:children.length===1?children[0]:children}:{})}}),
  Children:{toArray:value=>value===undefined||value===null?[]:Array.isArray(value)?value:[value]}
 };
 globalThis.React=react;
 try {
  const context=vm.createContext({React:react,__lourexHeadings:new Map(),__lourexInline:(_,text)=>[text]});
  vm.runInContext(source.slice(begin,end),context);
  const financial=formatAiBusinessRecordReply(fixture(),'ar');
  assert.ok(financial?.includes(':::lourex-details '));
  const handed=context.__lourexStructuredAnswer({},financial);
  assert.equal(handed,financial,'legacy Stage 4 must return the original local evidence text verbatim');
  assert.equal(typeof handed,'string','no legacy structured-answer cards are allowed for this readout');
  const {renderConversationWorkspace}=await import('../dist/src/components/AiConversationWorkspace.js');
  const e=react.createElement;
  const host={props:{language:'ar'},state:{}};
  const tree=e('div',{className:'lourex-ai-message assistant'},handed);
  const rendered=renderConversationWorkspace(host,tree);
  const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'&&'type'in node
   ?[node,...flatten(node.props?.children)]:[];
  const nodes=flatten(rendered);
  assert.equal(nodes.filter(n=>n.type==='section'&&n.props.className==='lxw-financial-answer').length,1);
  assert.equal(nodes.filter(n=>n.type==='details'&&n.props.className==='lxw-ai-record-details').length,1);
  assert.equal(nodes.filter(n=>n.type==='summary').length,1);
  assert.ok(nodes.filter(n=>n.type==='h3').length>=1);
  assert.ok(nodes.filter(n=>n.type==='h4').length>=2);
  assert.ok(nodes.some(n=>n.type==='li'));
  const userVisible=nodes.filter(n=>['p','h3','h4','li','summary'].includes(n.type))
   .map(n=>JSON.stringify(n.props.children)).join(' ');
  assert.doesNotMatch(userVisible,/:::lourex-(?:details|end)|###/);
  assert.match(userVisible,/INV-2026-0003/);
  assert.match(userVisible,/QA752-PAY-01 TEST ONLY/);
  assert.equal(nodes.some(n=>n.props?.className?.includes?.('lourex-ai-structured-answer')),false);
  // Other non-financial replies continue to use the legacy renderer safely.
  const ordinary=context.__lourexStructuredAnswer({},'Ordinary advisory response.');
  assert.equal(ordinary.type,'div');
  assert.equal(ordinary.props.className,'lourex-ai-structured-answer');
 }finally{globalThis.React=previousReact;}
});

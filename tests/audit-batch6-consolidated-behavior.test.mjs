import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function nodes(n){if(Array.isArray(n))return n.flatMap(nodes);return n&&typeof n==='object'?[n,...nodes(n.children||[])]:[];}
function fixture(lang='en',dimension='product'){
 const state=[dimension,'2026-01-01','2026-10-10','USD',''];let cursor=0;const keyHandler=()=>{},row={id:'r1',customerId:'c1',customerName:'Buyer',label:'Product',currency:'EUR',issueDate:'2026-10-01',documentId:'d1',number:'INV-1',taxRate:'10',taxableAmount:'100',outputVat:'10',grandTotal:'110',netSales:'100',totalCost:'80',grossProfit:'20',marginPercent:'20',profitComplete:true,missingCostItems:0,issuedInvoices:1,documents:1,note:''};
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),Component:class{constructor(props){this.props=props;}setState(change){this.state={...this.state,...change};}},useState:()=>{const i=cursor++;return[state[i],v=>{state[i]=v;}];},useMemo:fn=>fn()};
 const modules={Button:'Button',Select:'Select',Input:'Input',Icon:'Icon',t:(en,ar)=>lang==='ar'?ar:en,getUiLanguage:()=>lang,todayIso:()=> '2026-10-10',displayDate:v=>v,formatMoney:v=>v,isIsoDate:()=>true,handleTabKeyDown:keyHandler,normalizeReportPeriod:(from,to)=>({from,to}),financialDocuments:()=>[],productProfitabilityRows:()=>[row],invoiceProfitabilityRows:()=>[row],supplierProfitabilityRows:()=>[row],categoryProfitabilityRows:()=>[row],customerPerformanceReport:()=>[row],outputVatReport:()=>({currencies:[{currency:'EUR',outputVat:'10',taxableAmount:'100',documents:1,creditNotes:0,rates:[]}],rows:[row],rates:[],warnings:[],period:{from:'2026-01-01',to:'2026-10-10'}})};
 function load(name){const ctx={exports:{},React,require:()=>modules};vm.runInNewContext(ts.transpileModule(read('src/components/'+name+'.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,ctx);return ctx.exports[name];}
 return{load,state,keyHandler,resetCursor:()=>{cursor=0;}};
}
for(const lang of ['en','ar'])test(`${lang}: VAT preserves missing currency across period changes and scopes CSV; reset remains read-only`,()=>{
 const f=fixture(lang),Page=f.load('TaxVatCenter'),props={documents:[],company:{nameEn:'Test',nameAr:'اختبار',logoDataUrl:''}},before=JSON.stringify(props),page=new Page(props);page.state.currency='USD';let exported;page.exportCsv=rows=>{exported=rows;};
 let all=nodes(page.render()),select=all.find(n=>n.type==='Select');assert.equal(select.props.value,'USD');assert.ok(nodes(select).some(n=>n.type==='option'&&n.props.value==='USD'));
 all.find(n=>n.type==='Button'&&n.props.icon==='download').props.onClick();assert.equal(exported.length,0);
 page.state.from='2025-01-01';page.render();assert.equal(page.state.currency,'USD');
 all.find(n=>n.type==='Button'&&n.props.icon==='refresh').props.onClick();assert.equal(page.state.currency,'ALL');assert.equal(page.state.from,'');assert.equal(page.state.preset,'all');assert.equal(page.state.to,'2026-10-10');
 all=nodes(page.render());all.find(n=>n.type==='Button'&&n.props.icon==='download').props.onClick();assert.equal(exported.length,1);assert.equal(exported[0].currency,'EUR');assert.equal(JSON.stringify(props),before);
});
for(const dimension of ['product','customer','invoice','supplier','category'])test(`${dimension}: profitability tabs, missing currency and filter recovery retain dimension and records`,()=>{
 const f=fixture('en',dimension),Page=f.load('ProfitabilityReports'),props={documents:[],customers:[],payments:[],suppliers:[],purchases:[],items:[]},before=JSON.stringify(props);let all=nodes(Page(props)),tabs=all.filter(n=>n.props.role==='tab'),panel=all.find(n=>n.props.role==='tabpanel'),select=all.find(n=>n.type==='Select');assert.equal(tabs.length,5);assert.equal(tabs.filter(n=>n.props.tabIndex===0).length,1);assert.equal(tabs.find(n=>n.props.tabIndex===0).props.id,`profitability-tab-${dimension}`);assert.equal(panel.props['aria-labelledby'],`profitability-tab-${dimension}`);assert.ok(tabs.every(n=>n.props['aria-controls']===panel.props.id));assert.equal(all.find(n=>n.props.role==='tablist').props.onKeyDown,f.keyHandler);
 assert.equal(select.props.value,'USD');assert.ok(nodes(select).some(n=>n.type==='option'&&n.props.value==='USD'));assert.ok(all.some(n=>n.type==='Input'&&n.props['aria-label']==='Search profitability'));
 all.find(n=>n.type==='Button'&&n.props.icon==='refresh').props.onClick();assert.deepEqual(f.state,[dimension,'','2026-10-10','ALL','']);f.resetCursor();all=nodes(Page(props));assert.ok(all.some(n=>n.type==='tr'&&n.props.key==='r1:EUR'||n.type==='tr'&&n.props.key==='c1:EUR'));assert.equal(JSON.stringify(props),before);
});

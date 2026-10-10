import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function nodes(n){if(Array.isArray(n))return n.flatMap(nodes);return n&&typeof n==='object'?[n,...nodes(n.children||[])]:[];}
function fixture(lang='en'){
 const focused=[],Button='Button',Select='Select',tabHandler=()=>{};
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),Component:class{constructor(props){this.props=props;}setState(change,done){this.state={...this.state,...change};done?.();}}};
 const row={currency:'EUR',customerId:'c1',customerName:'Buyer',netSales:'12.00',grossProfit:'2.00',marginPercent:'16',collected:'0.00',outstanding:'12.00',overdue:'0.00',issuedInvoices:1,creditNotes:0,profitComplete:true,missingCostItems:0};
 const modules={t:(en,ar)=>lang==='ar'?ar:en,isArabic:()=>lang==='ar',getUiLanguage:()=>lang,todayIso:()=> '2026-10-10',displayDate:v=>v,formatMoney:(v,c)=>`${v} ${c}`,normalizeReportPeriod:(from,to)=>({from,to}),financialReportByCurrency:()=>[row],customerPerformanceReport:()=>[row],monthlyPerformanceReport:()=>[{...row,month:'2026-10'}],contextualReportQuestion:()=>'',handleTabKeyDown:tabHandler,Button,Select,Icon:'Icon',Input:'Input',Modal:'Modal',ConfirmDialog:'ConfirmDialog',CustomerAiCapture:'Capture',SalesPipelineLive:'Pipeline'};
 function load(name){const ctx={exports:{},React,require:()=>modules,document:{getElementById:id=>({focus:()=>focused.push(id)})}};vm.runInNewContext(ts.transpileModule(read('src/components/'+name+'.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,ctx);return ctx.exports[name];}
 return{load,focused,Button,Select,tabHandler};
}
function resumable(documents){
 const path='src/components/DocumentsPage.tsx',source=read(path),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='DocumentsPage'),member=cls.members.find(n=>n.name?.getText(ast)==='resumableDocument');assert.ok(member);
 const ctx={exports:{}};vm.runInNewContext(ts.transpileModule('class Harness{'+member.getText(ast)+'}\nexports.Harness=Harness;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);const h=new ctx.exports.Harness();h.props={documents};return h.resumableDocument();
}
test('resume chooses the newest editable active document while retaining cancelled records',()=>{
 const active={id:'active',status:'draft',updatedAt:'2026-10-01'},ready={id:'ready',status:'ready',updatedAt:'2026-10-02'},voided={id:'void',status:'draft',lifecycleStatus:'voided',updatedAt:'2026-10-10'},final={id:'final',status:'final',updatedAt:'2026-10-11'},docs=[voided,active,final,ready],before=JSON.stringify(docs);assert.equal(resumable(docs),ready);assert.equal(JSON.stringify(docs),before);
});
test('resume remains absent when only issued or cancelled documents exist',()=>{assert.equal(resumable([{status:'draft',lifecycleStatus:'voided',updatedAt:'2026-10-10'},{status:'final',updatedAt:'2026-10-11'}]),null);assert.equal(resumable([]),null);});
for(const lang of ['en','ar'])test(`${lang}: absent selected currency remains explicit and cannot leak other currencies into display or CSV`,()=>{
 const f=fixture(lang),Page=f.load('ReportsPage'),props={documents:[],payments:[],customers:[],company:{nameEn:'Test',nameAr:'اختبار',logoDataUrl:''}},page=new Page(props);page.state.currency='USD';const before=JSON.stringify(props);let exported;
 page.exportCsv=rows=>{exported=rows;};let tree=page.render(),all=nodes(tree),select=all.find(n=>n.type===f.Select);assert.equal(select.props.value,'USD');assert.ok(nodes(select).some(n=>n.type==='option'&&n.props.value==='USD'));assert.equal(all.filter(n=>n.props.className==='ta-report-kpi').length,0);
 all.find(n=>n.type===f.Button&&n.props.icon==='download').props.onClick();assert.equal(exported.length,0);
 page.state.from='2025-01-01';page.state.to='2025-02-01';page.render();assert.equal(page.state.currency,'USD');
 page.state.currency='EUR';all=nodes(page.render());assert.equal(all.filter(n=>n.props.className==='ta-report-kpi').length,1);all.find(n=>n.type===f.Button&&n.props.icon==='download').props.onClick();assert.equal(exported.length,1);assert.equal(exported[0].currency,'EUR');
 page.clearFilters();assert.equal(page.state.currency,'ALL');assert.equal(nodes(page.render()).filter(n=>n.props.className==='ta-report-kpi').length,1);assert.equal(JSON.stringify(props),before);
});
for(const lang of ['en','ar'])for(const [component,active] of [['CustomersPage','directory'],['SalesPipelineLive','pipeline']])test(`${lang} ${active}: tabs use a single tab stop, shared key handler and a valid labelled panel`,()=>{
 const f=fixture(lang),Page=f.load(component),page=new Page({customers:[],onShowDirectory:()=>{}});if(component==='CustomersPage')page.renderDialogs=()=>null;
 const tree=page.render(),all=nodes(tree),list=all.find(n=>n.props.role==='tablist'),tabs=all.filter(n=>n.props.role==='tab'),panel=all.find(n=>n.props.role==='tabpanel');assert.equal(list.props.onKeyDown,f.tabHandler);assert.equal(tabs.length,2);assert.equal(tabs.filter(n=>n.props.tabIndex===0).length,1);assert.equal(tabs.find(n=>n.props.tabIndex===0).props.id,`customers-tab-${active}`);assert.equal(panel.props['aria-labelledby'],`customers-tab-${active}`);assert.ok(tabs.every(n=>n.props['aria-controls']===panel.props.id));
});
test('directory switches keep focus on the selected tab and refuse departure during edits or operations',()=>{
 const f=fixture(),Page=f.load('CustomersPage'),page=new Page({customers:[]});page.changeWorkspace('pipeline');assert.equal(page.state.workspace,'pipeline');page.changeWorkspace('directory');assert.deepEqual(f.focused,['customers-tab-pipeline','customers-tab-directory']);
 for(const patch of [{busy:true},{editing:{}},{creatingDocument:'invoice'}]){page.state={...page.state,busy:false,editing:null,creatingDocument:'',...patch};page.changeWorkspace('pipeline');assert.equal(page.state.workspace,'directory');}assert.equal(f.focused.length,2);
});
test('pipeline directory action protects an active editor, deletion confirmation and pending save',()=>{
 const f=fixture(),Page=f.load('SalesPipelineLive');let exits=0;const page=new Page({onShowDirectory:()=>exits++});
 for(const patch of [{busy:true},{editing:{}},{deleting:{}}]){page.state={...page.state,busy:false,editing:null,deleting:null,...patch};page.showDirectory();assert.equal(exits,0);}page.state={...page.state,busy:false,editing:null,deleting:null};page.showDirectory();assert.equal(exits,1);
});

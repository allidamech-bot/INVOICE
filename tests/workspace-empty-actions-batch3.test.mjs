import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const React={createElement:(tag,props,...children)=>({tag,props:props??{},children}),Component:class{constructor(props){this.props=props;}setState(patch){this.state={...this.state,...patch};}}};
const Button=()=>null;
function load(file){
 const exports={};
 const imports={Button,t:en=>en,todayIso:()=> '2026-10-04',createPurchase:()=>({id:'new',items:[]}),createPurchaseItem:()=>({id:'line'})};
 const code=ts.transpileModule(readFileSync(`src/components/${file}.tsx`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 runInNewContext(code,{exports,require:()=>imports,React});return exports[file];
}
const OperationsPage=load('OperationsPage'),ReportsPage=load('ReportsPage');
function buttons(node){return !node||typeof node!=='object'?[]:[...(node.tag===Button?[node]:[]),...(node.children??[]).flatMap(buttons)];}

test('filtered operations empty state offers recovery without creating or saving records',()=>{
 const page=new OperationsPage({mode:'purchasing'});page.state.tab='purchases';page.state.search='missing';
 const empty=page.emptyState('backup','No purchases yet.','Create a purchase.');
 assert.equal(empty.children[1].children[0],'No matching records');
 const actions=buttons(empty);assert.equal(actions.length,1);assert.equal(actions[0].children[0],'Clear search');
 actions[0].props.onClick();assert.equal(page.state.search,'');assert.equal(page.state.purchaseEdit,null);
});

test('true purchase empty action reuses the canonical editor and its discard guard',()=>{
 const page=new OperationsPage({mode:'purchasing',purchases:[],suppliers:[],defaultCurrency:'USD'});page.state.tab='purchases';
 const action=buttons(page.emptyState('backup','No purchases yet.','Create a purchase.'))[0];
 assert.equal(action.children[0],'New Purchase');
 page.confirmDiscardCurrent=()=>false;action.props.onClick();assert.equal(page.state.purchaseEdit,null);
 page.confirmDiscardCurrent=()=>true;action.props.onClick();assert.equal(page.state.purchaseEdit.id,'new');
 assert.equal(page.state.purchaseEdit.items.length,1);
 page.state.busy=true;assert.equal(buttons(page.emptyState('backup','No purchases yet.','Create a purchase.'))[0].props.disabled,true);
 page.state.tab='inventory';page.state.search='missing';assert.equal(buttons(page.emptyState('items','No movements yet.','Record a movement.')).length,0,'do not invent an inventory posting action');
});

test('report recovery changes only transient filters and preserves source data',()=>{
 const props={documents:[{id:'issued'}],payments:[]};const snapshot=JSON.stringify(props);
 const page=new ReportsPage(props);page.state={...page.state,from:'2030-01-01',to:'2030-02-01',currency:'EUR',query:'missing',preset:null};
 page.clearFilters();assert.equal(page.state.from,'');assert.equal(page.state.to,'2026-10-04');
 assert.equal(page.state.currency,'ALL');assert.equal(page.state.query,'');assert.equal(page.state.preset,'all');
 assert.equal(JSON.stringify(props),snapshot);
});

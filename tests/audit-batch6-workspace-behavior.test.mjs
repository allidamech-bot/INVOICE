import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture(language='en',tab='products'){
 const calls=[],events=[];let permit=true;
 const Button=()=>null,Icon=()=>null;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),Component:class{constructor(props){this.props=props;}setState(change){this.state={...this.state,...change};}},useState:initial=>{const value=typeof initial==='function'?initial():initial;return [value==='products'||value==='treasury'?tab:value,value=>calls.push(value)];},useMemo:fn=>fn(),useEffect:()=>{}};
 const modules={Button,Icon,Input:'Input',Modal:'Modal',ConfirmDialog:'ConfirmDialog',DomainWorkspaceTabs:'Tabs',ProductPriceLists:'Prices',SavedItemsPage:'Catalog',InventoryPlanningLive:'Planning',WarehouseLocationsPage:'Locations',OperationsPage:'Operations',ContextualAdvisorAction:'Advisor',t:(en,ar)=>language==='ar'?ar:en,todayIso:()=> '2026-10-10',firstTab:()=> 'suppliers',confirmWorkspaceDeparture:()=>permit,inventoryBalances:()=>[],ensurePricingStyles:()=>{}};
 function load(name){const context={exports:{},require:()=>modules,React,window:{setTimeout:fn=>fn(),dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},Event:class{constructor(type){this.type=type;}}};runInNewContext(ts.transpileModule(read('src/components/'+name+'.tsx'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports[name];}
 return{load,calls,events,Button,permit:value=>{permit=value;}};
}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);return node&&typeof node==='object'?[node,...nodes(node.children||[])]:[];}
for(const lang of ['en','ar'])test(`${lang}: purchase empty and header actions agree; supplier shortcut respects discard and busy`,()=>{
 const f=fixture(lang),Page=f.load('OperationsPage'),page=new Page({mode:'purchasing',suppliers:[],purchases:[],defaultCurrency:'USD'});page.state.tab='purchases';page.confirmDiscardCurrent=()=>false;
 let tree=page.renderPurchases(),buttons=nodes(tree).filter(n=>n.type===f.Button),purchases=buttons.filter(n=>n.children.includes(lang==='ar'?'شراء جديد':'New Purchase'));
 assert.equal(purchases.length,2);assert.ok(purchases.every(n=>n.props.disabled));
 const link=buttons.find(n=>n.children.includes(lang==='ar'?'فتح الموردين':'Open suppliers'));assert.ok(link);link.props.onClick();assert.equal(page.state.tab,'purchases');
 page.confirmDiscardCurrent=()=>true;link.props.onClick();assert.equal(page.state.tab,'suppliers');assert.equal(page.state.purchaseEdit,null);
 page.state.tab='purchases';page.props.suppliers=[{id:'s1'}];buttons=nodes(page.renderPurchases()).filter(n=>n.type===f.Button);assert.equal(buttons.length,2);assert.ok(buttons.every(n=>!n.props.disabled));
 page.state.busy=true;assert.ok(nodes(page.renderPurchases()).filter(n=>n.type===f.Button).every(n=>n.props.disabled));
});
test('filtered purchase recovery stays enabled with no suppliers and changes only the search',()=>{
 const f=fixture(),Page=f.load('OperationsPage'),page=new Page({mode:'purchasing',suppliers:[],purchases:[]});page.state.tab='purchases';page.state.search='missing';
 const b=nodes(page.emptyState('backup','Empty','Description')).find(n=>n.type===f.Button);assert.equal(b.props.disabled,false);assert.equal(b.children[0],'Clear search');b.props.onClick();assert.equal(page.state.search,'');assert.equal(page.state.purchaseEdit,null);
});
for(const mode of ['finance','inventory'])test(`${mode}: embedded operations retains search and panel content without duplicate page heading`,()=>{
 const f=fixture(),Page=f.load('OperationsPage'),page=new Page({mode,embedded:true,suppliers:[],purchases:[],items:[],expenses:[],inventoryMovements:[]});
 page.renderSummary=()=>null;page.renderActionDialogs=()=>null;page.renderExpenses=()=>({type:'panel',props:{marker:'expenses'}});page.renderInventory=()=>({type:'panel',props:{marker:'inventory'}});
 const tree=page.render();assert.equal(nodes(tree).filter(n=>n.type==='h1').length,0);assert.equal(nodes(tree).filter(n=>n.type==='Input'&&n.props.type==='search').length,1);assert.ok(nodes(tree).some(n=>n.props?.marker));
 page.props.embedded=false;assert.equal(nodes(page.render()).filter(n=>n.type==='h1').length,1);
});
for(const lang of ['en','ar'])test(`${lang}: price-list edit rejects stale identities and cancelled departure; preserves exact item and pricing target`,()=>{
 const f=fixture(lang,'prices'),Workspace=f.load('ProductsInventoryWorkspace'),item={id:'p1',tags:[]},props={items:[item],inventoryMovements:[],purchases:[],suppliers:[],expenses:[],warehouses:[],currency:'USD'};
 const before=JSON.stringify(props),tree=Workspace(props),priceList=nodes(tree).find(n=>n.type==='Prices');assert.ok(priceList);
 priceList.props.onEdit({id:'missing'});assert.equal(f.events.length,0);assert.equal(f.calls.length,0);
 f.permit(false);priceList.props.onEdit(item);assert.equal(f.events.length,0);assert.equal(f.calls.length,0);
 f.permit(true);priceList.props.onEdit(item);assert.deepEqual(f.calls,['products']);assert.equal(f.events.length,1);assert.equal(f.events[0].type,'lourex-edit-product');assert.equal(f.events[0].detail.itemId,'p1');assert.equal(f.events[0].detail.section,'pricing');assert.equal(JSON.stringify(props),before);
});
test('Finance passes embedded mode to Expenses, retaining the financial tab and unchanged data',()=>{
 const f=fixture('en','expenses'),Finance=f.load('FinanceWorkspace'),props={expenses:[{id:'e1'}]};const tree=Finance(props),ops=nodes(tree).find(n=>n.type==='Operations');assert.ok(ops);assert.equal(ops.props.embedded,true);assert.equal(ops.props.mode,'finance');assert.equal(ops.props.expenses,props.expenses);assert.equal(nodes(tree).filter(n=>n.type==='h1').length,1);
});
for(const tab of ['inventory','movements'])test(`${tab}: parent inventory workspace embeds the canonical operations view`,()=>{
 const f=fixture('en',tab),Workspace=f.load('ProductsInventoryWorkspace'),props={items:[],inventoryMovements:[],purchases:[],suppliers:[],expenses:[],warehouses:[],currency:'USD'};
 const tree=Workspace(props),ops=nodes(tree).find(n=>n.type==='Operations');assert.ok(ops);assert.equal(ops.props.embedded,true);assert.equal(ops.props.mode,'inventory');assert.equal(ops.props.inventoryView,tab==='inventory'?'balances':'movements');assert.equal(ops.props.inventoryMovements,props.inventoryMovements);assert.equal(nodes(tree).filter(n=>n.type==='h1').length,1);
});

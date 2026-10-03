import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Real compiled classes with synchronous React state; no persistence or providers.
globalThis.React={createElement:(tag,props,...children)=>({tag,props,children}),Component:class{constructor(props){this.props=props;}setState(patch,callback){this.state={...this.state,...(typeof patch==='function'?patch(this.state,this.props):patch)};callback?.();}}};
const {GlobalSearch}=await import('../dist/src/components/GlobalSearch.js');
const {ProductLibraryWorkspace}=await import('../dist/src/components/ProductLibraryWorkspace.js');
const {CustomersPage}=await import('../dist/src/components/CustomersPage.js');
const {buildCustomer360}=await import('../dist/src/lib/relationship-360.js');
const {defaultCompany,customerSnapshotFrom}=await import('../dist/src/lib/defaults.js');
const {createBlankDocument}=await import('../dist/src/lib/documents.js');
const customer={id:'c1',companyNameEn:'Northstar Trading',companyNameAr:'نورث ستار للتجارة',contactPerson:'Samira',phone:'',email:'buyer@example.test',city:'Dubai',country:'UAE',updatedAt:'2026-01-01'};
const item={id:'p1',sku:'VAL-1',descriptionEn:'Industrial valve',descriptionAr:'صمام صناعي',lastCurrency:'USD',lastUnitPrice:'12',tags:[]};
const props={documents:[],customers:[customer],items:[item,{...item,id:'archived',archived:true}],suppliers:[],purchases:[],language:'en',onNavigate:()=>{}};

test('search requires every query token and returns canonical record identity',()=>{
 const search=new GlobalSearch(props);search.state.query='Northstar Dubai';assert.equal(search.results().length,1);
 search.state.query='Northstar nonexistent';assert.equal(search.results().length,0);
 search.state.query='VAL-1';assert.equal(search.results().length,1,'archived products stay excluded');
 const events=[];globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
 globalThis.window={setTimeout:fn=>fn(),dispatchEvent:event=>events.push(event)};
 search.results()[0].action();assert.deepEqual(events.map(e=>[e.type,e.detail]),[['lourex-open-product',{id:'p1'}]]);
 search.state.query='Northstar';search.results()[0].action();assert.equal(events.at(-1).detail.id,'c1');
});

test('customer exact-open rejects stale identity and protects an active form',()=>{
 const page=new CustomersPage({customers:[customer]});page.handleOpenCustomer({detail:{id:'missing'}});assert.equal(page.state.viewingId,'');
 page.state.editing={...customer};page.handleOpenCustomer({detail:{id:'c1'}});assert.equal(page.state.viewingId,'');
 page.state.editing=null;page.handleOpenCustomer({detail:{id:'c1'}});assert.equal(page.state.viewingId,'c1');
});

test('existing product price-list event now opens the record through dirty-state review',()=>{
 const page=new ProductLibraryWorkspace({items:[item],currency:'USD'});page.handleOpenProduct({detail:{itemId:'p1'}});assert.equal(page.state.editing.id,'p1');
 page.state.editing.descriptionEn='Unsaved edit';const other={...item,id:'p2'};page.props.items.push(other);
 page.handleOpenProduct({detail:{itemId:'p2'}});assert.equal(page.state.editing.id,'p1');assert.equal(page.state.discardAction,'select');assert.equal(page.state.pendingEdit.id,'p2');
 page.confirmDiscard();assert.equal(page.state.editing.id,'p2');
});

test('latest quotation remains available beyond the twelve recent-document preview',()=>{
 const company=defaultCompany();const quote=createBlankDocument('proforma','QUO-OLD',company);quote.customerSnapshot=customerSnapshotFrom(customer);quote.updatedAt='2025-12-01';
 const invoices=Array.from({length:13},(_,i)=>{const doc=createBlankDocument('invoice',`INV-${i}`,company);doc.customerSnapshot=customerSnapshotFrom(customer);doc.updatedAt=`2026-02-${String(i+1).padStart(2,'0')}`;return doc;});
 const result=buildCustomer360(customer,[quote,...invoices],[],[]);assert.equal(result.recentDocuments.length,12);assert.ok(!result.recentDocuments.some(row=>row.id===quote.id));assert.equal(result.latestQuotation.id,quote.id);
 quote.lifecycleStatus='voided';assert.equal(buildCustomer360(customer,[quote,...invoices],[],[]).latestQuotation,null);
});

test('historical diagnostics are opt-in while current quality gates remain required',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
 for(const job of ['legacy-browser-baseline','legacy-baseline'])assert.match(workflow,new RegExp(`${job}:\\n    if:.*workflow_dispatch.*inputs\\.legacy_diagnostics`));
 assert.match(workflow,/default: false/);assert.match(workflow,/needs:\s*\n\s*- verify\n\s*- browser-qa/);
});

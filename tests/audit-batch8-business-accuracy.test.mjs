import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {buildSalesPipeline} from '../dist/src/lib/sales-pipeline.js';
import {buildAiFinanceContext} from '../dist/src/lib/ai-finance.js';
import {buildAiBusinessContext} from '../dist/src/lib/ai-business.js';
import {buildAdvisorDataV2} from '../dist/src/lib/ai-advisor-v2.js';
import * as payments from '../dist/src/lib/payments.js';
import * as money from '../dist/src/lib/money.js';
import * as ids from '../dist/src/lib/id.js';
import {receivablesByCurrency} from '../dist/src/lib/receivables.js';
import {financialReportByCurrency} from '../dist/src/lib/reports.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,reversePurchase,inventoryBalances,spendByCurrency,createExpense,createManualInventoryMovement} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment,purchasePayableSummary} from '../dist/src/lib/payables.js';
import {createTreasuryAccount,createTreasuryEntry,appendTreasuryEntry,treasuryAccountBalance,treasuryProjection,treasuryTotals} from '../dist/src/lib/treasury-ledger.js';

const AS_OF='2026-10-04',stamp=day=>day+'T12:00:00.000Z';
function opportunity(id,day,stage='quote-sent',amount='300',currency='USD'){
 return{id,customerId:'buyer',title:id,stage,amount,currency,expectedCloseDate:'2026-10-20',nextAction:'Follow up',notes:'',linkedDocumentIds:[],lostReason:'',createdAt:stamp('2026-09-01'),updatedAt:stamp(day)};
}
function event(id,day,payload){return{id,documentId:'@lourex:crm-opportunity:'+(payload.opportunity?.id||payload.id),type:'created',at:stamp(day),note:'@lourex:crm-opportunity:v1:'+JSON.stringify(payload)};}
test('historical CRM replays prior versions and restores later-deleted opportunities, excluding future creations',()=>{
 const events=[event('1','2026-10-01',{kind:'upsert',opportunity:opportunity('changed','2026-10-01')}),event('2','2026-10-08',{kind:'upsert',opportunity:opportunity('changed','2026-10-08','won','900')}),event('3','2026-10-02',{kind:'upsert',opportunity:opportunity('deleted','2026-10-02','lead','50','EUR')}),event('4','2026-10-09',{kind:'delete',id:'deleted',updatedAt:stamp('2026-10-09')}),event('5','2026-10-10',{kind:'upsert',opportunity:{...opportunity('future','2026-10-10'),createdAt:stamp('2026-10-10')}})];
 const before=structuredClone(events),historical=buildSalesPipeline({documentEvents:events},AS_OF),current=buildSalesPipeline({documentEvents:events});
 assert.equal(historical.wonCount,0);assert.deepEqual(historical.openValues,[{currency:'EUR',amount:50,count:1},{currency:'USD',amount:300,count:1}]);assert.deepEqual(historical.opportunities.map(row=>row.id).sort(),['changed','deleted']);assert.equal(current.wonCount,1);assert.deepEqual(current.opportunities.map(row=>row.id).sort(),['changed','future']);assert.deepEqual(events,before);
});
test('cutoff includes end-of-day mutations, excludes backdated late events and rejects impossible snapshot dates',()=>{
 const row=opportunity('boundary',AS_OF),onDay=event('1',AS_OF,{kind:'upsert',opportunity:row});onDay.at=AS_OF+'T23:59:59.999Z';row.updatedAt=onDay.at;
 const late=event('2','2026-10-05',{kind:'upsert',opportunity:opportunity('late',AS_OF)}),malformed={...late,id:'3',at:'not-a-date'};
 assert.deepEqual(buildSalesPipeline({documentEvents:[onDay,late,malformed]},AS_OF).opportunities.map(row=>row.id),['boundary']);assert.throws(()=>buildSalesPipeline({documentEvents:[]},'2026-02-31'),/invalid/);
});
function invoice(id,{date='2026-10-01',currency='USD',amount='100'}={}){
 const v=emptyVault(),doc=createBlankDocument('invoice','INV-'+id,v.company);Object.assign(doc,{id,status:'final',lifecycleStatus:'active',role:'standard',currency,issueDate:date,dueDate:'2026-10-20',updatedAt:stamp(date),workspaceId:'default',branchId:'main'});doc.customerSnapshot={sourceCustomerId:'buyer',companyNameEn:'Historical Buyer',companyNameAr:'عميل قديم',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};doc.items=[{...doc.items[0],descriptionEn:'Widget',quantity:'1',unit:'PCS',unitPrice:amount,unitCost:'60'}];return doc;
}
function payment(doc,id='pay',amount='30',date='2026-10-02'){return payments.normalizePaymentRecord(doc,[],{id,date,amount,method:'bank-transfer',reference:'',notes:''},[doc]);}
test('advisor rebuilds mismatched finance at business cutoff instead of copying future sales, payments and evidence',()=>{
 const v=emptyVault(),old=invoice('old'),future=invoice('future',{date:'2026-10-08',amount:'900',currency:'EUR'});v.documents=[old,future];v.payments=[payment(old),payment(old,'later','70','2026-10-09')];
 const business=buildAiBusinessContext(v,AS_OF),futureFinance=buildAiFinanceContext(v,'','2026-10-10'),before=structuredClone(futureFinance),a=buildAdvisorDataV2(v,futureFinance,business);
 assert.equal(a.asOf,AS_OF);assert.deepEqual(a.sales.monthToDate.map(row=>[row.currency,row.netSales,row.collected]),[['USD','100.00','30.00']]);assert.equal(a.receivables.byCurrency[0].outstanding,'70.00');assert.ok(a.evidence.every(row=>row.currency!=='EUR'));assert.ok(a.limitations.includes('finance-context-rebuilt-at-advisor-asof'));assert.deepEqual(futureFinance,before);
 const aligned=buildAdvisorDataV2(v,buildAiFinanceContext(v,'',AS_OF),business);assert.deepEqual(a.sales,aligned.sales);assert.deepEqual(a.receivables,aligned.receivables);assert.equal(aligned.limitations.includes('finance-context-rebuilt-at-advisor-asof'),false);
});
test('advisor historical pipeline and Personal redaction share a cutoff without exposing future opportunities',()=>{
 const v=emptyVault();v.documentEvents=[event('1','2026-10-01',{kind:'upsert',opportunity:opportunity('known','2026-10-01')}),event('2','2026-10-09',{kind:'upsert',opportunity:opportunity('future','2026-10-09')})];const f=buildAiFinanceContext(v,'',AS_OF),b=buildAiBusinessContext(v,AS_OF),a=buildAdvisorDataV2(v,f,b);
 assert.deepEqual(a.pipeline.nextActions.map(row=>row.id),['known']);assert.equal(a.pipeline.openValues[0].amount,300);assert.deepEqual(buildAdvisorDataV2(v,f,b,'personal').pipeline.openValues,[]);assert.throws(()=>buildAdvisorDataV2(v,f,{...b,asOf:'2026-02-31'}),/invalid/);
});
test('historical advisor excludes products created after its cutoff from stock warnings',()=>{
 const {v,item}=operationalFixture();v.savedItems=[{...item,createdAt:stamp('2026-10-01')},{...item,id:'future-product',createdAt:stamp('2026-10-10')}];v.inventoryMovements=[];const a=buildAdvisorDataV2(v,buildAiFinanceContext(v,'',AS_OF),buildAiBusinessContext(v,AS_OF));assert.equal(a.inventory.totalItems,1);assert.equal(a.inventory.zeroItems,1);assert.deepEqual(a.inventory.rows.map(row=>row.itemId),['stock']);
});
function searchHarness(props,language='en'){
 const source=readFileSync(new URL('../dist/src/components/GlobalSearch.js',import.meta.url),'utf8');
 const React={Component:class{constructor(props){this.props=props;}setState(change,done){this.state={...this.state,...change};done?.();}},createElement:(type,props,...children)=>({type,props:props||{},children}),Fragment:'fragment'};
 const ctx={exports:{},React,window:{setTimeout:fn=>fn()},document:{},navigator:{platform:'Linux'},require:path=>path.includes('payments')?payments:path.includes('money')?money:path.includes('/id.')?{...ids,todayIso:()=>AS_OF}:path.includes('i18n')?{isArabic:()=>language==='ar',t:(en,ar)=>language==='ar'?ar:en}:path.includes('overlay-focus')?{unlockOverlayScroll:()=>{},restoreOverlayFocus:()=>{},ownsOverlay:()=>true}:path.includes('document-kinds')?{isSupplierDocumentKind:()=>false,documentKindLabel:()=>({en:'Invoice',ar:'فاتورة'})}:{Icon:()=>null}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);const h=new ctx.exports.GlobalSearch({...props,language});h.state={open:true,paymentPicker:true,query:''};return h;
}
const text=node=>Array.isArray(node)?node.map(text).join(' '):node&&typeof node==='object'?text(node.children):node==null?'':String(node);
function searchFixture(){const documents=Array.from({length:55},(_,i)=>invoice(String(i)));documents[0].updatedAt=stamp('2026-01-01');documents[0].number='INV-OLDEST-55';const paid=payment(documents[1],'paid','100'),part=payment(documents[2],'partial','30');documents[3].lifecycleStatus='voided';documents[4].status='draft';documents[5].role='credit-note';const credit={...invoice('credit',{amount:'100',date:'2026-10-02'}),role:'credit-note',creditForId:documents[6].id};documents.push(credit,invoice('future',{date:'2026-10-10'}),{...invoice('invalid'),issueDate:'2026-02-31'});return{documents,payments:[paid,part],customers:[],items:[],suppliers:[],purchases:[]};}
test('collection selector includes the oldest of 55 invoices and excludes settled, credited, voided, draft and future invoices',()=>{
 const h=searchHarness(searchFixture()),rows=h.paymentInvoices();assert.equal(rows.length,50);assert.ok(rows.some(row=>row.number==='INV-OLDEST-55'));for(const id of ['1','3','4','5','6','credit','future','invalid'])assert.ok(!rows.some(row=>row.id===id));h.state.query='oldest';assert.deepEqual(Array.from(h.paymentInvoices(),row=>row.id),['0']);h.state.query='عميل USD';assert.equal(h.paymentInvoices().length,50);h.state.query='not-found';assert.equal(h.paymentInvoices().length,0);
});
for(const language of ['en','ar'])test('collection UI exposes canonical remaining balance, partial/unpaid status and an enabled search ('+language+')',()=>{
 const h=searchHarness(searchFixture(),language),ui=text(h.renderPaymentPicker());assert.match(ui,/70\.00/);assert.match(ui,language==='ar'?/مسددة جزئيًا/:/Partially settled/);assert.match(ui,language==='ar'?/غير مسددة/:/Unpaid/);h.state.query='not-found';assert.match(text(h.renderPaymentPicker()),language==='ar'?/تطابق البحث/:/No matching collectible/);
 const nodes=[];function walk(n){if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){nodes.push(n);walk(n.children);}}walk(h.render());const input=nodes.find(n=>n.type==='input');assert.equal(input.props.disabled,undefined);input.props.onChange({target:{value:'OLDEST'}});assert.equal(h.paymentInvoices()[0].id,'0');
});
test('collection click rechecks current eligibility and payment authority prevents stale overcollection including future recorded settlements',()=>{
 const props=searchFixture(),h=searchHarness(props);let navigated=false;h.props.onNavigate=()=>{navigated=true;};const doc=props.documents[0];h.props.payments.push(payment(doc,'new-payment','100'));h.createPayment(doc);assert.equal(navigated,false);
 const partial=props.documents[2],futurePayment=payment(partial,'future-payment','70','2026-10-09');assert.throws(()=>payments.normalizePaymentRecord(partial,[...props.payments,futurePayment],{...payment(partial,'candidate','70'),id:'candidate'},props.documents),/cannot exceed/);
});
test('payment picker keyboard navigation uses its own result list and Escape restores general search',()=>{
 const h=searchHarness(searchFixture()),focused=[],rows=[{focus:()=>focused.push(0)},{focus:()=>focused.push(1)}];let selector='';h.panelRef={querySelectorAll:q=>{selector=q;return rows;}};h.inputRef={focus:()=>focused.push('input')};h.resultKeyDown({key:'ArrowDown',preventDefault(){}});assert.match(selector,/global-search-payment-list/);assert.deepEqual(focused,[0]);
 // Overlay ownership is mocked here; the full suite retains the shared DOM
 // focus/ownership tests. This case exercises the emitted Escape branch.
 h.panelRef=null;h.state.query='oldest';h.handleKeyDown({key:'Escape',preventDefault(){}});assert.equal(h.state.paymentPicker,false);assert.equal(h.state.query,'');assert.equal(focused.at(-1),'input');
});

function operationalFixture(){
 const v=emptyVault(),day=ids.todayIso(),supplier={...createSupplier(),nameEn:'Supplier',defaultCurrency:'USD'};v.suppliers=[supplier];const item={id:'stock',workspaceId:'default',createdAt:stamp('2026-01-01'),updatedAt:stamp('2026-01-01'),sku:'SKU',descriptionEn:'Widget',descriptionAr:'',unit:'PCS',hsCode:'',origin:'',packing:'',lastUnitCost:'5',lastCostCurrency:'EUR',lastUnitPrice:'',lastCurrency:'',usageCount:0,lastUsedAt:'',tags:[]};
 const draft=createPurchase([],v.suppliers,'USD');draft.date=day;draft.items=[{...createPurchaseItem(item),quantity:'10',unitCost:'8'}];draft.freight='20';const posted=postPurchase(draft,[item]);v.purchases=[posted.purchase];v.savedItems=posted.savedItems;v.inventoryMovements=posted.movements;return{v,day,supplier,posted,item};
}
test('reference sale/purchase/payment/expense reconciles inventory, profit, receivables, payables and allocated treasury without double-counting',()=>{
 const {v,day,supplier,posted}=operationalFixture(),doc=invoice('reference',{date:day,amount:'20'});doc.items[0].quantity='4';doc.items[0].unitCost='10';doc.dueDate=day;v.documents=[doc];v.payments=[payment(doc,'customer','30',day)];v.inventoryMovements.push(createManualInventoryMovement(v.savedItems[0],'issue','4',day,'Sale shipment','10','USD'));
 const supplierDraft=createSupplierPayment(posted.purchase,supplier,[]);v.supplierPayments=[normalizeSupplierPayment(posted.purchase,supplier,[],{...supplierDraft,date:day,amount:'25'})];v.expenses=[{...createExpense('EUR'),date:day,amount:'7',description:'Office expense'}];
 const account=createTreasuryAccount({label:'USD bank',kind:'bank',currency:'USD',workspaceId:'default',branchId:'main'});v.treasuryAccounts=[account];
 let linked=v;for(const [sourceType,source,toAccountId,fromAccountId] of [['customer-payment',v.payments[0],account.id,''],['supplier-payment',v.supplierPayments[0],'',account.id]])linked=appendTreasuryEntry(linked,{...createTreasuryEntry(toAccountId?'collection':'supplier-payment','USD'),workspaceId:'default',branchId:'main',date:day,amount:source.amount,sourceType,sourceId:source.id,toAccountId,fromAccountId});
 assert.equal(inventoryBalances(linked.savedItems,linked.inventoryMovements)[0].quantity,'6');assert.equal(purchasePayableSummary(linked.purchases[0],linked.supplierPayments,day).remaining,'75.00');assert.equal(receivablesByCurrency(linked.documents,linked.payments,day)[0].outstanding,'50.00');
 const report=financialReportByCurrency(linked.documents,linked.payments,day,day)[0];assert.equal(report.netSales,'80.00');assert.equal(report.totalCost,'40.00');assert.equal(report.grossProfit,'40.00');assert.equal(report.collected,'30.00');
 assert.equal(treasuryAccountBalance(account.id,linked.treasuryEntries,day),'5.00');const projection=treasuryProjection(linked.payments,linked.supplierPayments,linked.expenses,linked.treasuryEntries,[],'USD',day);assert.equal(projection.length,3);assert.equal(treasuryTotals(projection,'USD').net,'5.00');assert.equal(treasuryTotals(projection,'EUR').net,'-7.00');
 const advisor=buildAdvisorDataV2(linked,buildAiFinanceContext(linked,'',day),buildAiBusinessContext(linked,day));assert.equal(advisor.inventory.rows[0].quantity,'6');assert.equal(advisor.payables.byCurrency[0].remaining,'75.00');assert.equal(advisor.sales.today[0].grossProfit,'40.00');assert.deepEqual(advisor.expenses.byCurrency,[{currency:'EUR',expenses:'7.00'}]);assert.throws(()=>appendTreasuryEntry(linked,{...linked.treasuryEntries[0],id:'duplicate-source'}),/already allocated/);
});
test('purchase reversal cancels quantity and spend, restores prior cost currency and cannot post or reverse twice',()=>{
 const {v,posted,item}=operationalFixture(),reversed=reversePurchase(posted.purchase,'Returned',v.inventoryMovements,v.savedItems),movements=[...v.inventoryMovements,...reversed.movements];assert.equal(inventoryBalances(reversed.savedItems,movements)[0].quantity,'0');assert.equal(reversed.savedItems[0].lastUnitCost,item.lastUnitCost);assert.equal(reversed.savedItems[0].lastCostCurrency,'EUR');assert.deepEqual(spendByCurrency([reversed.purchase],[]),[]);assert.throws(()=>postPurchase(posted.purchase,v.savedItems,v.inventoryMovements),/Only draft/);assert.throws(()=>reversePurchase(posted.purchase,'Again',movements,v.savedItems),/already been reversed/);
});

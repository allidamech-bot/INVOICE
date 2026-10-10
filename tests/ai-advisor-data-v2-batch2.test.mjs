import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const AS_OF='2026-10-04';
const at=date=>`${date}T12:00:00.000Z`;

function supplier(){return{id:'supplier-1',createdAt:at('2026-01-01'),updatedAt:at('2026-09-01'),nameEn:'Source Co',nameAr:'',contactPerson:'',address:'',city:'Istanbul',country:'Türkiye',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',defaultCurrency:'USD',paymentTerms:'30 days',notes:''};}
function supplierSnapshot(source){return{sourceSupplierId:source.id,nameEn:source.nameEn,nameAr:source.nameAr,contactPerson:source.contactPerson,address:source.address,city:source.city,country:source.country,phone:source.phone,email:source.email,vatTaxNumber:source.vatTaxNumber,commercialRegistration:source.commercialRegistration};}
function item(){return{id:'item-1',workspaceId:'default',createdAt:at('2026-01-01'),updatedAt:at('2026-09-01'),sku:'SKU-1',descriptionEn:'Product One',descriptionAr:'المنتج الأول',hsCode:'1234',origin:'Türkiye',packing:'Carton',unit:'PCS',lastUnitPrice:'25',lastCurrency:'USD',lastUnitCost:'10',lastCostCurrency:'USD',usageCount:2,lastUsedAt:at('2026-09-01'),category:'Food',tags:[],favorite:false};}
function purchase(source,workspaceId='default',branchId='main'){
  return{id:`purchase-${workspaceId}`,workspaceId,branchId,number:`PUR-${workspaceId}`,date:'2026-08-01',dueDate:'2026-08-31',supplierSnapshot:supplierSnapshot(source),currency:'USD',items:[{id:`line-${workspaceId}`,savedItemId:'item-1',sku:'SKU-1',descriptionEn:'Product One',descriptionAr:'',quantity:'2',unit:'PCS',unitCost:'100',landedUnitCost:'100',previousUnitCost:'90',previousCostCurrency:'USD'}],freight:'0',duty:'0',otherCosts:'0',notes:'',status:'posted',postedAt:at('2026-08-01'),reversedAt:'',reverseReason:'',createdAt:at('2026-08-01'),updatedAt:at('2026-08-01')};
}

async function fixture(){
  const [{emptyVault,customerSnapshotFrom},{createBlankDocument},{buildAiFinanceContext},{buildAiBusinessContext},{buildAdvisorDataV2},{blankOpportunity,validatedOpportunityUpsertEvent}]=await Promise.all([
    import('../dist/src/lib/defaults.js'),import('../dist/src/lib/documents.js'),import('../dist/src/lib/ai-finance.js'),import('../dist/src/lib/ai-business.js'),import('../dist/src/lib/ai-advisor-v2.js'),import('../dist/src/lib/sales-pipeline.js')
  ]);
  const vault=emptyVault();
  const s=supplier();vault.suppliers=[s];vault.savedItems=[item()];
  const customer={id:'customer-1',workspaceId:'default',createdAt:at('2026-01-01'),updatedAt:at('2026-09-01'),companyNameEn:'Acme Trading',companyNameAr:'',contactPerson:'Ali',addressEn:'',addressAr:'',city:'Jeddah',country:'Saudi Arabia',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'USD',paymentTermPresetId:'',paymentTerms:'30 days',paymentDueDays:'30',creditLimit:'',creditCurrency:'',notes:''};vault.customers=[customer];
  const invoice=createBlankDocument('invoice','INV-ADV-001',vault.company);invoice.workspaceId='default';invoice.branchId='main';invoice.status='final';invoice.lifecycleStatus='active';invoice.issueDate='2026-09-01';invoice.dueDate='2026-09-15';invoice.currency='USD';invoice.customerSnapshot=customerSnapshotFrom(customer);invoice.items=[{id:'invoice-line',descriptionEn:'Product One',descriptionAr:'',hsCode:'',origin:'',packing:'',quantity:'4',unit:'PCS',unitPrice:'25',unitCost:'10'}];vault.documents=[invoice];
  vault.payments=[{id:'customer-pay-1',workspaceId:'default',branchId:'main',invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:customer.id,customerNameEn:customer.companyNameEn,customerNameAr:'',currency:'USD',amount:'20',date:'2026-09-10',method:'bank-transfer',reference:'BANK-IN',notes:'',createdAt:at('2026-09-10'),updatedAt:at('2026-09-10')}];
  const posted=purchase(s);vault.purchases=[posted];vault.supplierPayments=[{id:'supplier-pay-1',workspaceId:'default',branchId:'main',purchaseId:posted.id,purchaseNumber:posted.number,supplierId:s.id,supplierNameEn:s.nameEn,supplierNameAr:'',currency:'USD',amount:'50',date:'2026-09-01',method:'bank-transfer',reference:'BANK-OUT',notes:'',createdAt:at('2026-09-01'),updatedAt:at('2026-09-01')}];
  vault.expenses=[{id:'expense-1',workspaceId:'default',branchId:'main',date:'2026-09-20',category:'Freight',description:'Ocean freight',amount:'40',currency:'EUR',supplierId:'',reference:'EXP-1',notes:'',createdAt:at('2026-09-20'),updatedAt:at('2026-09-20')}];
  vault.inventoryMovements=[{id:'stock-open',workspaceId:'default',branchId:'main',itemId:'item-1',itemNameEn:'Product One',itemNameAr:'',sku:'SKU-1',date:'2026-09-01',type:'opening',quantity:'5',unitCost:'10',currency:'USD',sourceId:'',sourceNumber:'',note:'',createdAt:at('2026-09-01')},{id:'stock-issue',workspaceId:'default',branchId:'main',itemId:'item-1',itemNameEn:'Product One',itemNameAr:'',sku:'SKU-1',date:'2026-09-02',type:'issue',quantity:'-7',unitCost:'10',currency:'USD',sourceId:'',sourceNumber:'',note:'',createdAt:at('2026-09-02')}];
  vault.treasuryAccounts=[{id:'bank-usd',workspaceId:'default',branchId:'main',label:'Main Bank',kind:'bank',currency:'USD',bankAccountId:'',active:true,createdAt:at('2026-01-01'),updatedAt:at('2026-01-01')}];
  vault.treasuryEntries=[{id:'opening-bank',workspaceId:'default',branchId:'main',type:'opening-balance',date:'2026-01-01',currency:'USD',amount:'1000',fromAccountId:'',toAccountId:'bank-usd',sourceType:'manual',sourceId:'',reference:'OPEN',notes:'',reconciledAt:'',voidedAt:'',voidReason:'',createdAt:at('2026-01-01'),updatedAt:at('2026-01-01')}];
  vault.fxRates=[{id:'fx-usd-eur',workspaceId:'default',date:'2026-10-01',fromCurrency:'USD',toCurrency:'EUR',rate:'0.90',sourceLabel:'Recorded manual rate',notes:'',createdAt:at('2026-10-01'),updatedAt:at('2026-10-01')}];
  const opportunity=blankOpportunity(customer);opportunity.title='Acme Q4';opportunity.stage='quote-sent';opportunity.amount='300';opportunity.currency='USD';opportunity.nextAction='Follow up quote';opportunity.expectedCloseDate='2026-10-20';const upsert=validatedOpportunityUpsertEvent(vault,opportunity,'');// This fixture describes an opportunity already known at AS_OF, independent of the machine clock.
  const historical={...upsert.opportunity,createdAt:at('2026-09-01'),updatedAt:at(AS_OF)};
  vault.documentEvents=[...vault.documentEvents,{...upsert.event,at:at(AS_OF),note:'@lourex:crm-opportunity:v1:'+JSON.stringify({kind:'upsert',opportunity:historical})}];
  const finance=buildAiFinanceContext({documents:vault.documents,payments:vault.payments,customers:vault.customers,activeDocument:null},'Acme health');
  const business=buildAiBusinessContext(vault,AS_OF);
  return{vault,advisor:buildAdvisorDataV2(vault,finance,business,'business'),buildAdvisorDataV2,finance,business};
}

test('Advisor Data V2 exposes deterministic payables, treasury, expenses, inventory, FX and pipeline without currency mixing',async()=>{
  const {advisor}=await fixture();
  assert.equal(advisor.version,2);assert.equal(advisor.basis,'deterministic-advisor-data-v2');assert.equal(advisor.available,true);
  const payable=advisor.payables.byCurrency.find(row=>row.currency==='USD');assert.ok(payable);assert.equal(payable.purchases,'200.00');assert.equal(payable.paid,'50.00');assert.equal(payable.remaining,'150.00');assert.equal(payable.overdue,'150.00');
  assert.deepEqual(advisor.expenses.byCurrency,[{currency:'EUR',expenses:'40.00'}]);
  assert.equal(advisor.treasury.accounts[0].balance,'1000.00');assert.equal(advisor.treasury.accounts[0].currency,'USD');
  assert.equal(advisor.inventory.negativeItems,1);assert.equal(advisor.inventory.rows[0].state,'negative');assert.equal(advisor.inventory.rows[0].quantity,'-2');
  assert.deepEqual(advisor.fx.recordedPairs,['USD/EUR']);assert.equal(advisor.fx.latestRates[0].rate,'0.90');assert.equal(advisor.fx.policy,'recorded-rates-only-no-automatic-conversion');
  assert.equal(advisor.pipeline.openValues[0].currency,'USD');assert.equal(advisor.pipeline.openValues[0].amount,300);assert.equal(advisor.pipeline.nextActions[0].title,'Acme Q4');
  assert.equal('convertedTotal' in advisor,false);assert.ok(advisor.limitations.includes('no-cross-currency-total-without-deterministic-fx-result'));
});

test('Advisor company health is qualitative, evidence-backed and never emits a numeric score',async()=>{
  const {advisor}=await fixture();
  assert.equal(advisor.health.status,'Action Needed');assert.equal(advisor.health.score,null);
  assert.ok(advisor.health.signals.some(row=>row.code==='negative-inventory'&&row.severity==='action-needed'));
  assert.ok(advisor.health.signals.some(row=>row.code==='overdue-payables'&&row.severity==='watch'));
  const negative=advisor.evidence.find(row=>row.id==='inventory-negative');assert.ok(negative);assert.equal(negative.source,'operations.inventoryBalances');
  const payable=advisor.evidence.find(row=>row.id==='payable-USD');assert.ok(payable);assert.equal(payable.amount,'150.00');
  assert.deepEqual(advisor.responseContract.sections,['Summary','KPI','Table','Risk','Missing','Recommendation','Evidence','Actions']);
  assert.equal(advisor.responseContract.arithmeticPolicy,'use-provided-deterministic-values-do-not-recalculate-accounting');
});

test('Personal scope receives a deliberately redacted Advisor V2 context',async()=>{
  const {vault,buildAdvisorDataV2,finance,business}=await fixture();const personal=buildAdvisorDataV2(vault,finance,business,'personal');
  assert.equal(personal.available,false);assert.deepEqual(personal.payables.byCurrency,[]);assert.deepEqual(personal.treasury.accounts,[]);assert.deepEqual(personal.inventory.rows,[]);assert.deepEqual(personal.fx.latestRates,[]);assert.deepEqual(personal.pipeline.openValues,[]);assert.equal(personal.health.score,null);assert.ok(personal.missingData.some(row=>row.code==='business-context-unavailable'));
});

test('Batch 2 remains workspace/branch isolated by consuming the Batch 1 scoped vault',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');const {scopeVault}=await import('../dist/src/lib/workspaces.js');const {buildAiFinanceContext}=await import('../dist/src/lib/ai-finance.js');const {buildAiBusinessContext}=await import('../dist/src/lib/ai-business.js');const {buildAdvisorDataV2}=await import('../dist/src/lib/ai-advisor-v2.js');
  const vault=emptyVault(),s=supplier();vault.suppliers=[s];vault.savedItems=[item()];vault.purchases=[purchase(s,'workspace-two','branch-two')];
  const scoped=scopeVault(vault);assert.equal(scoped.purchases.length,0);
  const finance=buildAiFinanceContext({documents:scoped.documents,payments:scoped.payments,customers:scoped.customers,activeDocument:null},'payables');const business=buildAiBusinessContext(scoped,AS_OF);const advisor=buildAdvisorDataV2(scoped,finance,business,'business');assert.deepEqual(advisor.payables.byCurrency,[]);assert.equal(advisor.purchasing.postedPurchases,0);
});

test('Batch 2 build/runtime contracts keep actions on AI Core and read-only advice on Advisor V2',async()=>{
  const [pkg,installer,endpoint]=await Promise.all([readFile(new URL('../package.json',import.meta.url),'utf8'),readFile(new URL('../scripts/ai-batch2-advisor-data-v2.mjs',import.meta.url),'utf8'),readFile(new URL('../api/ai-advisor-v2.js',import.meta.url),'utf8')]);
  assert.match(pkg,/ai-batch1-entity-context-fix\.mjs && node scripts\/ai-batch2-advisor-data-v2\.mjs/);
  assert.match(installer,/buildAdvisorDataV2\(scopedVault, finance, business, prepared\.runtime\.scope\)/);
  assert.match(installer,/advisorV2ReadOnly/);assert.match(installer,/\? '\/api\/ai-advisor-v2' : '\/api\/ai-core'/);
  assert.match(endpoint,/sameOriginRequest/);assert.match(endpoint,/routeAiStructured/);assert.match(endpoint,/recorded FX rates are evidence only/i);assert.match(endpoint,/Never combine currencies/i);assert.match(endpoint,/Never create a numeric health score/i);assert.match(endpoint,/enum:\['workspace\.navigate'\]/);assert.doesNotMatch(endpoint,/document\.createDraft|item\.archive|item\.updateMetadata/);
});

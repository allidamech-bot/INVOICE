import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault, defaultCompany } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { buildAiBusinessContext } from '../dist/src/lib/ai-business.js';
import { buildCollectionTasks } from '../dist/src/lib/collections-workflow.js';
import { whatMattersToday } from '../dist/src/lib/daily-command-center.js';
import { buildProductPricingContext } from '../dist/src/lib/product-pricing-intelligence.js';
import { buildBusinessMemory } from '../dist/src/lib/business-memory.js';
import { askBusinessRecords } from '../dist/src/lib/business-search-ai.js';
import { createPurchase, createPurchaseItem, createSupplier } from '../dist/src/lib/operations.js';

function savedItemWithoutCurrency(){
  return {
    id:'missing-currency-item',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',
    sku:'MC-1',descriptionEn:'Currency not recorded',descriptionAr:'',hsCode:'1000',origin:'',packing:'',unit:'PCS',
    lastUnitPrice:'',lastCurrency:'',lastUnitCost:'10.00',lastCostCurrency:'',usageCount:0,lastUsedAt:'',
    category:'Test',tags:[],favorite:false,archived:false
  };
}

function legacyInvoice({id='legacy-inv-1',number='INV-LEGACY-1',issueDate='2026-01-01',dueDate='2026-02-01',amount='100.00',description='Service'}={}){
  const doc=createBlankDocument('invoice',number,defaultCompany());
  doc.id=id;doc.status='final';doc.lifecycleStatus='active';doc.role='standard';doc.currency='USD';doc.issueDate=issueDate;doc.dueDate=dueDate;
  doc.customerSnapshot={sourceCustomerId:'',companyNameEn:'Legacy Buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'legacy@example.com',vatTaxNumber:'',commercialRegistration:''};
  doc.items=[{...doc.items[0],quantity:'1',unitPrice:amount,descriptionEn:description}];
  doc.adjustments={discountEnabled:false,discountMode:'fixed',discountValue:'0.00',shippingEnabled:false,shipping:'0.00',otherChargesEnabled:false,otherCharges:'0.00',taxEnabled:false,taxPercent:'0'};
  return doc;
}

function legacyPayment(invoice,{id='legacy-payment',amount='10.00',date='2026-03-01'}={}){const stamp=`${date}T12:00:00.000Z`;return{id,invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:'',customerNameEn:'Legacy Buyer',customerNameAr:'',currency:invoice.currency,amount,date,method:'bank-transfer',reference:'LEGACY-PAY',notes:'',createdAt:stamp,updatedAt:stamp};}

function postedPurchase(item,date,unitCost='25.00'){
  const supplier=createSupplier();supplier.id='supplier-future';supplier.nameEn='Future Supplier';
  const purchase=createPurchase([], [supplier], 'USD');
  purchase.number='PUR-FUTURE';purchase.date=date;purchase.status='posted';purchase.postedAt=`${date}T12:00:00.000Z`;
  const line=createPurchaseItem(item);line.quantity='1';line.unitCost=unitCost;line.landedUnitCost=unitCost;
  purchase.items=[line];
  return purchase;
}

function memoryCustomer(){return{id:'memory-customer',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',companyNameEn:'Memory Buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'USD',paymentTermPresetId:'',paymentTerms:'',paymentDueDays:'',creditLimit:'',creditCurrency:'',notes:''};}
function memoryQuote(customer){const doc=createBlankDocument('proforma-invoice','PI-2026-MEMORY',defaultCompany());doc.id='memory-quote';doc.status='final';doc.lifecycleStatus='active';doc.issueDate='2026-01-01';doc.customerSnapshot={sourceCustomerId:customer.id,companyNameEn:customer.companyNameEn,companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};return doc;}
function linkedInvoice(quote,lifecycleStatus='active'){const doc=createBlankDocument('invoice','INV-2026-MEMORY',defaultCompany());doc.id=`linked-${lifecycleStatus}`;doc.status='draft';doc.lifecycleStatus=lifecycleStatus;doc.convertedFromId=quote.id;doc.customerSnapshot=quote.customerSnapshot;return doc;}

test('v450 AI business context leaves an unknown product currency empty instead of inventing USD',()=>{
  const vault=emptyVault();
  const item=savedItemWithoutCurrency();
  vault.savedItems=[item];
  const context=buildAiBusinessContext(vault,'2026-01-15');
  const row=context.products.rows.find(product=>product.id===item.id);
  assert.ok(row);
  assert.equal(row.currency,'');
  assert.equal(row.lastCost,'10.00');
});

test('v450 AI business and pricing contexts exclude purchase observations after the requested as-of date',()=>{
  const vault=emptyVault();
  const item={...savedItemWithoutCurrency(),id:'future-cost-item',lastUnitCost:'',updatedAt:'2026-01-01T00:00:00.000Z'};
  vault.savedItems=[item];
  vault.purchases=[postedPurchase(item,'2026-03-01')];
  const context=buildAiBusinessContext(vault,'2026-02-01');
  const row=context.products.rows.find(product=>product.id===item.id);
  assert.ok(row);
  assert.equal(row.lastCost,'');
  assert.equal(row.currency,'');
  assert.equal(context.suppliers.rows.length,0);
  assert.equal(context.suppliers.costAlerts.length,0);
  const pricing=buildProductPricingContext(vault,'','2026-02-01');
  const pricingRow=pricing.rows.find(product=>product.id===item.id);
  assert.ok(pricingRow);
  assert.equal(pricingRow.cost,'');
  assert.equal(pricingRow.pricingHealth,'no-cost');
  assert.equal(pricing.purchasing.recentPurchases.length,0);
});

test('v450 historical product intelligence excludes products created after the requested as-of date',()=>{
  const vault=emptyVault();const item={...savedItemWithoutCurrency(),id:'future-created-item',descriptionEn:'Future Created Product',createdAt:'2026-03-01T00:00:00.000Z',updatedAt:'2026-03-01T00:00:00.000Z'};vault.savedItems=[item];
  const before=buildAiBusinessContext(vault,'2026-02-15');
  assert.equal(before.products.rows.some(row=>row.id===item.id),false);
  assert.equal(before.actionCenter.candidates.some(row=>row.itemId===item.id),false);
  const pricingBefore=buildProductPricingContext(vault,'','2026-02-15');
  assert.equal(pricingBefore.rows.some(row=>row.id===item.id),false);
  assert.equal(whatMattersToday(vault,8,'2026-02-15').some(alert=>alert.searchQuery===item.descriptionEn),false);
  const after=buildAiBusinessContext(vault,'2026-03-02');
  assert.equal(after.products.rows.some(row=>row.id===item.id),true);
  assert.equal(buildProductPricingContext(vault,'','2026-03-02').rows.some(row=>row.id===item.id),true);
});

test('v450 future purchase drafts and invalid operations do not contaminate historical daily intelligence',()=>{
  const vault=emptyVault();const item={...savedItemWithoutCurrency(),id:'timeline-ops-item'};vault.savedItems=[item];
  const futureDraft=postedPurchase(item,'2026-03-10','12.00');futureDraft.id='future-draft';futureDraft.number='PUR-FUTURE-DRAFT';futureDraft.status='draft';
  const futureInvalid=postedPurchase(item,'2026-03-11','13.00');futureInvalid.id='future-invalid';futureInvalid.number='PUR-FUTURE-INVALID';futureInvalid.items[0].quantity='0';
  vault.purchases=[futureDraft,futureInvalid];
  const before=buildAiBusinessContext(vault,'2026-02-15');
  assert.equal(before.daily.draftPurchases,0);
  assert.equal(before.daily.invalidOperations,0);
  const pricingBefore=buildProductPricingContext(vault,'','2026-02-15');
  assert.equal(pricingBefore.purchasing.draftPurchases,0);
  assert.equal(whatMattersToday(vault,8,'2026-02-15').some(alert=>alert.kind==='purchase-draft'),false);
  const after=buildAiBusinessContext(vault,'2026-03-15');
  assert.equal(after.daily.draftPurchases,1);
  assert.ok(after.daily.invalidOperations>=1);
  assert.equal(buildProductPricingContext(vault,'','2026-03-15').purchasing.draftPurchases,1);
  assert.equal(whatMattersToday(vault,8,'2026-03-15').some(alert=>alert.key==='purchase-draft:future-draft'),true);
});

test('v450 AI business search ignores posted purchases that fail accounting validity',()=>{
  const vault=emptyVault();const item={...savedItemWithoutCurrency(),descriptionEn:'Search Product'};vault.savedItems=[item];
  const valid=postedPurchase(item,'2026-01-10','10.00');valid.id='purchase-valid';valid.number='PUR-VALID';
  const invalid=postedPurchase(item,'2026-02-10','99.00');invalid.id='purchase-invalid';invalid.number='PUR-INVALID';invalid.items[0].quantity='0';
  vault.purchases=[valid,invalid];
  const answer=askBusinessRecords(vault,'latest purchase price Search Product','2026-02-15');
  assert.equal(answer.intent,'last-purchase-price');
  assert.equal(answer.facts[0]?.value,'10.00 USD');
  assert.equal(answer.results.some(row=>row.id==='purchase-invalid'),false);
});

test('v450 AI business search excludes future-dated purchases, quotations and invoice quantities',()=>{
  const vault=emptyVault();const item={...savedItemWithoutCurrency(),descriptionEn:'Timeline Product'};vault.savedItems=[item];
  const pastPurchase=postedPurchase(item,'2026-01-10','11.00');pastPurchase.id='purchase-past';pastPurchase.number='PUR-PAST';
  const futurePurchase=postedPurchase(item,'2026-03-10','99.00');futurePurchase.id='purchase-future';futurePurchase.number='PUR-FUTURE-LATE';vault.purchases=[pastPurchase,futurePurchase];
  const customer=memoryCustomer();customer.country='Saudi Arabia';vault.customers=[customer];
  const pastQuote=memoryQuote(customer);pastQuote.id='quote-past';pastQuote.number='PI-PAST';pastQuote.issueDate='2026-01-20';
  const futureQuote=memoryQuote(customer);futureQuote.id='quote-future';futureQuote.number='PI-FUTURE';futureQuote.issueDate='2026-03-20';
  const pastInvoice=legacyInvoice({id:'country-past',number:'INV-COUNTRY-PAST',issueDate:'2026-01-25',dueDate:'2026-02-10',description:'Country Product'});pastInvoice.customerSnapshot={...pastInvoice.customerSnapshot,sourceCustomerId:customer.id,companyNameEn:customer.companyNameEn,country:customer.country};pastInvoice.items[0].quantity='2';
  const futureInvoice=legacyInvoice({id:'country-future',number:'INV-COUNTRY-FUTURE',issueDate:'2026-03-25',dueDate:'2026-04-10',description:'Country Product'});futureInvoice.customerSnapshot={...futureInvoice.customerSnapshot,sourceCustomerId:customer.id,companyNameEn:customer.companyNameEn,country:customer.country};futureInvoice.items[0].quantity='100';
  vault.documents=[pastQuote,futureQuote,pastInvoice,futureInvoice];
  const asOf='2026-02-15';
  const price=askBusinessRecords(vault,'latest purchase price Timeline Product',asOf);assert.equal(price.facts[0]?.value,'11.00 USD');assert.equal(price.results.some(row=>row.id==='purchase-future'),false);
  const quotes=askBusinessRecords(vault,'quotes last 3 months Memory Buyer',asOf);assert.equal(quotes.intent,'customer-documents');assert.deepEqual(quotes.results.map(row=>row.id),['quote-past']);
  const top=askBusinessRecords(vault,'top products Saudi Arabia',asOf);assert.equal(top.intent,'top-products-country');assert.equal(top.facts.find(row=>row.label==='Country Product')?.value,'2 PCS');
});

test('v450 collections and daily command center use the same requested as-of date',()=>{
  const vault=emptyVault();
  vault.documents=[legacyInvoice()];
  const tasks=buildCollectionTasks(vault,'2026-01-15');
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].priority,'normal');
  assert.equal(tasks[0].currencies[0].overdue,'0.00');
  const alerts=whatMattersToday(vault,8,'2026-01-15');
  assert.equal(alerts.some(alert=>alert.kind==='collection'),false);
});

test('v450 collections keep legacy receivable invoices attached to their derived customer account',()=>{
  const vault=emptyVault();
  const invoice=legacyInvoice();
  vault.documents=[invoice];
  const tasks=buildCollectionTasks(vault,'2026-03-15');
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].customerName,'Legacy Buyer');
  assert.equal(tasks[0].openInvoices.length,1);
  assert.equal(tasks[0].oldestOpenInvoice?.invoiceId,invoice.id);
  assert.equal(tasks[0].oldestOpenInvoice?.number,invoice.number);
  assert.equal(tasks[0].oldestOpenInvoice?.status,'overdue');
  assert.equal(tasks[0].oldestOverdueInvoice?.invoiceId,invoice.id);
});

test('v450 collection tasks distinguish oldest issued invoice from oldest overdue due date',()=>{
  const vault=emptyVault();
  const oldestIssued=legacyInvoice({id:'oldest-issued',number:'INV-OLD-ISSUE',issueDate:'2026-01-01',dueDate:'2026-03-10'});
  const oldestDue=legacyInvoice({id:'oldest-due',number:'INV-OLD-DUE',issueDate:'2026-02-01',dueDate:'2026-02-15'});
  vault.documents=[oldestIssued,oldestDue];
  const task=buildCollectionTasks(vault,'2026-04-01')[0];
  assert.ok(task);
  assert.equal(task.oldestOpenInvoice?.invoiceId,'oldest-issued');
  assert.equal(task.oldestOverdueInvoice?.invoiceId,'oldest-due');
  assert.deepEqual(task.openInvoices.map(row=>row.invoiceId),['oldest-issued','oldest-due']);
});

test('v450 legacy invoice payments count as collection activity even without a direct customer id',()=>{
  const vault=emptyVault();const invoice=legacyInvoice();const payment=legacyPayment(invoice);vault.documents=[invoice];vault.payments=[payment];
  const tasks=buildCollectionTasks(vault,'2026-03-15');
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].currencies[0].outstanding,'90.00');
  assert.equal(tasks[0].lastActivity.slice(0,10),'2026-03-01');
});

test('v450 historical customer intelligence excludes future invoices and preserves snapshot identity',()=>{
  const vault=emptyVault();
  const past=legacyInvoice({description:'Past Service'});
  const future=legacyInvoice({id:'legacy-future',number:'INV-LEGACY-FUTURE',issueDate:'2026-04-01',dueDate:'2026-04-15',amount:'900.00',description:'Future Service'});
  vault.documents=[past,future];
  const context=buildAiBusinessContext(vault,'2026-03-15');
  assert.equal(context.customers.rows.length,1);
  const customer=context.customers.rows[0];
  assert.equal(customer.customerName,'Legacy Buyer');
  assert.equal(customer.profitability.find(row=>row.currency==='USD')?.netRevenue,'100.00');
  assert.deepEqual(customer.topProducts.map(row=>row.name),['Past Service']);
  assert.ok(!customer.lastActivity||customer.lastActivity.slice(0,10)<='2026-03-15');
});

test('v450 business memory follows proforma invoices again when the linked invoice was voided',()=>{
  const vault=emptyVault();const customer=memoryCustomer();const quote=memoryQuote(customer);const voided=linkedInvoice(quote,'voided');
  vault.customers=[customer];vault.documents=[quote,voided];
  const memory=buildBusinessMemory(vault);
  assert.ok(memory.entries.some(entry=>entry.key===`quote:${quote.id}:unconverted`));
});

test('v450 business memory treats an active linked invoice draft as an existing conversion',()=>{
  const vault=emptyVault();const customer=memoryCustomer();const quote=memoryQuote(customer);const active=linkedInvoice(quote,'active');
  vault.customers=[customer];vault.documents=[quote,active];
  const memory=buildBusinessMemory(vault);
  assert.equal(memory.entries.some(entry=>entry.key===`quote:${quote.id}:unconverted`),false);
});

test('v450 Collections AI UI consumes the canonical collection task engine',async()=>{
  const source=await readFile(new URL('../src/components/CollectionsAiTool.tsx',import.meta.url),'utf8');
  assert.match(source,/buildCollectionTasks\(resumed\.vault,asOf\)/);
  assert.match(source,/oldestOverdueInvoice/);
  assert.doesNotMatch(source,/invoicePaymentSummary|receivableCustomerId|function openInvoices|function overdueInvoices/);
});

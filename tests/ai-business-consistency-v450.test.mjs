import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault, defaultCompany } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { buildAiBusinessContext } from '../dist/src/lib/ai-business.js';
import { buildCollectionTasks } from '../dist/src/lib/collections-workflow.js';
import { whatMattersToday } from '../dist/src/lib/daily-command-center.js';
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

function postedPurchase(item,date,unitCost='25.00'){
  const supplier=createSupplier();supplier.id='supplier-future';supplier.nameEn='Future Supplier';
  const purchase=createPurchase([], [supplier], 'USD');
  purchase.number='PUR-FUTURE';purchase.date=date;purchase.status='posted';purchase.postedAt=`${date}T12:00:00.000Z`;
  const line=createPurchaseItem(item);line.quantity='1';line.unitCost=unitCost;line.landedUnitCost=unitCost;
  purchase.items=[line];
  return purchase;
}

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

test('v450 AI business context excludes purchase observations after the requested as-of date',()=>{
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

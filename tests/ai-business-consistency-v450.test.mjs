import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault, defaultCompany } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { buildAiBusinessContext } from '../dist/src/lib/ai-business.js';
import { buildCollectionTasks } from '../dist/src/lib/collections-workflow.js';
import { whatMattersToday } from '../dist/src/lib/daily-command-center.js';

function savedItemWithoutCurrency(){
  return {
    id:'missing-currency-item',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',
    sku:'MC-1',descriptionEn:'Currency not recorded',descriptionAr:'',hsCode:'1000',origin:'',packing:'',unit:'PCS',
    lastUnitPrice:'',lastCurrency:'',lastUnitCost:'10.00',lastCostCurrency:'',usageCount:0,lastUsedAt:'',
    category:'Test',tags:[],favorite:false,archived:false
  };
}

function legacyInvoice({id='legacy-inv-1',number='INV-LEGACY-1',issueDate='2026-01-01',dueDate='2026-02-01',amount='100.00'}={}){
  const doc=createBlankDocument('invoice',number,defaultCompany());
  doc.id=id;doc.status='final';doc.lifecycleStatus='active';doc.role='standard';doc.currency='USD';doc.issueDate=issueDate;doc.dueDate=dueDate;
  doc.customerSnapshot={sourceCustomerId:'',companyNameEn:'Legacy Buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'legacy@example.com',vatTaxNumber:'',commercialRegistration:''};
  doc.items=[{...doc.items[0],quantity:'1',unitPrice:amount,descriptionEn:'Service'}];
  doc.adjustments={discountEnabled:false,discountMode:'fixed',discountValue:'0.00',shippingEnabled:false,shipping:'0.00',otherChargesEnabled:false,otherCharges:'0.00',taxEnabled:false,taxPercent:'0'};
  return doc;
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
  assert.equal(tasks[0].openInvoices.length,1);
  assert.equal(tasks[0].oldestOpenInvoice?.invoiceId,invoice.id);
  assert.equal(tasks[0].oldestOpenInvoice?.number,invoice.number);
  assert.equal(tasks[0].oldestOpenInvoice?.status,'overdue');
});

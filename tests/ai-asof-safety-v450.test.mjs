import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault, defaultCompany } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { buildProductPricingContext } from '../dist/src/lib/product-pricing-intelligence.js';
import { whatMattersToday } from '../dist/src/lib/daily-command-center.js';
import { createPurchase } from '../dist/src/lib/operations.js';

function product(overrides={}){
  return {
    id:'product-1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',
    sku:'SKU-1',descriptionEn:'Historical Product',descriptionAr:'',hsCode:'1000',origin:'',packing:'',unit:'PCS',
    lastUnitPrice:'',lastCurrency:'',lastUnitCost:'10.00',lastCostCurrency:'',usageCount:0,lastUsedAt:'',
    category:'Test',tags:[],favorite:false,archived:false,
    ...overrides
  };
}

test('v450 product pricing leaves unknown currency empty instead of assigning company/default USD',()=>{
  const vault=emptyVault();
  const item=product();vault.savedItems=[item];
  const pricing=buildProductPricingContext(vault,'','2026-02-01');
  const row=pricing.rows.find(entry=>entry.id===item.id);
  assert.ok(row);
  assert.equal(row.cost,'10.00');
  assert.equal(row.currency,'');
  assert.equal(row.pricingHealth,'no-sale-price');
});

test('v450 historical pricing and daily command center exclude future-created products, drafts and quotations',()=>{
  const vault=emptyVault();
  const futureProduct=product({
    id:'future-product',createdAt:'2026-03-01T00:00:00.000Z',updatedAt:'2026-03-01T00:00:00.000Z',
    sku:'',hsCode:'',category:'',lastUnitPrice:'5.00',lastCurrency:'USD',lastUnitCost:'10.00',lastCostCurrency:'USD'
  });
  vault.savedItems=[futureProduct];

  const draft=createPurchase([],[],'USD');
  draft.id='future-draft';draft.number='PUR-FUTURE-DRAFT';draft.status='draft';draft.date='2026-03-01';draft.updatedAt='2026-03-01T12:00:00.000Z';
  vault.purchases=[draft];

  const quote=createBlankDocument('proforma','PI-FUTURE',defaultCompany());
  quote.id='future-quote';quote.status='final';quote.lifecycleStatus='active';quote.issueDate='2026-03-01';quote.terms.validity='2026-02-01';
  vault.documents=[quote];

  const asOf='2026-02-01';
  const pricing=buildProductPricingContext(vault,'',asOf);
  assert.equal(pricing.rows.some(row=>row.id===futureProduct.id),false);
  assert.equal(pricing.purchasing.draftPurchases,0);

  const alerts=whatMattersToday(vault,8,asOf);
  assert.equal(alerts.some(alert=>alert.kind==='purchase-draft'),false);
  assert.equal(alerts.some(alert=>alert.kind==='quote-expiry'),false);
  assert.equal(alerts.some(alert=>alert.kind==='pricing'||alert.kind==='product-data'),false);
});

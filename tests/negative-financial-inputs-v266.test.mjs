import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createPurchase, createPurchaseItem, createSupplier, validatePurchase } from '../dist/src/lib/operations.js';
import { pricingSuggestedUnitPrice, validateCommercialCompany, validateCustomerCommercial } from '../dist/src/lib/commercial-controls.js';

function saved(){
  return {id:'item-1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',sku:'ITEM-1',descriptionEn:'Tracked item',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'20',lastCurrency:'USD',lastUnitCost:'10',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'2026-01-01T00:00:00.000Z',category:'',tags:[],favorite:false};
}

function validCustomer(){
  return {id:'customer-1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',companyNameEn:'Customer',companyNameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'USD',paymentTerms:'',notes:'',creditLimit:'1000',creditCurrency:'USD',paymentDueDays:'30',paymentTermPresetId:''};
}

test('purchase validation rejects tiny negative freight, duty and unit cost before rounding',()=>{
  const supplier=createSupplier();supplier.nameEn='Supplier';
  const item=saved();const purchase=createPurchase([], [supplier], 'USD');purchase.items=[createPurchaseItem(item)];
  purchase.items[0].unitCost='-0.0000000000001';
  purchase.freight='-0.00001';purchase.duty='-0.00001';purchase.otherCosts='-0.00001';
  const errors=validatePurchase(purchase,[item]).join(' | ');
  assert.match(errors,/unit cost must be zero or greater/i);
  assert.match(errors,/Freight must be zero or greater/i);
  assert.match(errors,/Duty must be zero or greater/i);
  assert.match(errors,/Other costs must be zero or greater/i);
});

test('customer commercial validation rejects a tiny negative credit limit',()=>{
  const customer=validCustomer();customer.creditLimit='-0.00001';
  assert.match(validateCustomerCommercial(customer),/credit limit|حد الائتمان/i);
});

test('company commercial validation rejects tiny negative tax and pricing percentages',()=>{
  const company=structuredClone(emptyVault().company);
  company.commercial.taxPresets=[{id:'tax-1',name:'VAT',rate:'-0.00001'}];
  assert.match(validateCommercialCompany(company),/tax rates|نسب الضريبة/i);
  company.commercial.taxPresets=[];
  company.commercial.pricing={...company.commercial.pricing,percent:'-0.00001'};
  assert.match(validateCommercialCompany(company),/pricing percentage|نسبة التسعير/i);
});

test('pricing suggestion refuses a negative cost even below internal precision',()=>{
  const policy={method:'markup',percent:'20',rounding:'0.01'};
  assert.equal(pricingSuggestedUnitPrice('-0.0000000000001',policy),'');
});

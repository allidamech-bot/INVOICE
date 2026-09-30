import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultCompany } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { buildAccountingGuardianReview } from '../dist/src/lib/accounting-guardian.js';

function savedProduct(){
  return {
    id:'guardian-currency-item',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',
    sku:'CUR-1',descriptionEn:'Currency Guard Product',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',
    lastUnitPrice:'200.00',lastCurrency:'',lastUnitCost:'100.00',lastCostCurrency:'',usageCount:1,lastUsedAt:'2026-01-01T00:00:00.000Z',
    category:'',tags:[],favorite:false,archived:false
  };
}

function quoteWithoutCurrency(){
  const company=defaultCompany();
  const doc=createBlankDocument('proforma','PI-TEST-1',company);
  doc.currency='';
  doc.customerSnapshot={sourceCustomerId:'customer-1',companyNameEn:'Test Customer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  doc.items=[{...doc.items[0],descriptionEn:'Currency Guard Product',quantity:'1',unit:'PCS',unitPrice:'50.00',unitCost:'100.00'}];
  return {doc,company};
}

test('v450 accounting guardian withholds all price-cost-policy comparisons when document currency is missing',()=>{
  const {doc,company}=quoteWithoutCurrency();
  const review=buildAccountingGuardianReview(doc,company,[savedProduct()],[],[],[]);
  assert.ok(review.issues.some(issue=>issue.code==='missing-currency'&&issue.severity==='critical'));
  assert.ok(!review.issues.some(issue=>issue.code==='below-cost'));
  assert.ok(!review.issues.some(issue=>issue.code==='below-pricing-policy'));
  assert.ok(!review.issues.some(issue=>issue.code==='suspicious-price-change'));
  assert.equal(review.costComplete,false);
  assert.ok(review.limitations.includes('missing-document-currency-withholds-price-cost-margin-and-credit-comparisons'));
});

test('v450 accounting guardian resumes comparable cost checks once a document currency is explicit',()=>{
  const {doc,company}=quoteWithoutCurrency();
  doc.currency='USD';
  doc.items[0].unitCost='100.00';
  const product=savedProduct();product.lastCostCurrency='USD';product.lastCurrency='USD';
  const review=buildAccountingGuardianReview(doc,company,[product],[],[],[]);
  assert.ok(!review.issues.some(issue=>issue.code==='missing-currency'));
  assert.ok(review.issues.some(issue=>issue.code==='below-cost'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createExpense} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

const stamp='2026-10-01T09:00:00.000Z';
function customer(id,name){
  return {id,createdAt:stamp,updatedAt:stamp,companyNameEn:name,companyNameAr:'',
    contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
    vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'USD',paymentTermPresetId:'',
    paymentTerms:'',paymentDueDays:'',creditLimit:'',creditCurrency:'',notes:''};
}
function supplier(id,name){
  return {...createSupplier(),id,nameEn:name,createdAt:stamp,updatedAt:stamp};
}
function unrelatedLocalExpense(base){
  return {...base,expenses:[{...createExpense('USD'),id:'separate-monthly-expense',
    description:'Monthly communications',amount:'7.00'}]};
}

test('remote customer changes cannot inject invalid email or credit controls during unrelated expense save',()=>{
  const original=customer('existing-credit-customer','North Trading');
  const base={...emptyVault(),customers:[original]},snapshot=JSON.stringify(base);
  const invalid=[
    [{...original,email:'invalid-at-example'},/valid email/i],
    [{...original,creditLimit:'1000.00',creditCurrency:''},/currency for the credit limit/i],
    [{...original,creditLimit:'-500.00',creditCurrency:'USD'},/credit limit must be zero or greater/i],
    [{...original,paymentDueDays:'30.5'},/whole number/i],
    [{...original,paymentDueDays:'3651'},/cannot exceed 3650/i],
  ];
  for(const [modified,error] of invalid){
    assert.throws(()=>mergeVaultIntent(base,unrelatedLocalExpense(base),
      {...base,customers:[modified]}),error);
    assert.equal(JSON.stringify(base),snapshot);
  }
});

test('remote customer creation cannot bypass normalized duplicate company identity',()=>{
  const original=customer('existing-customer','Falcon Global');
  const incoming=customer('new-remote-customer','  FALCON GLOBAL  ');
  const base={...emptyVault(),customers:[original]};
  assert.throws(()=>mergeVaultIntent(base,unrelatedLocalExpense(base),
    {...base,customers:[original,incoming]}),/customer already exists/i);
});

test('two new customer records with one ID must not silently collapse in cloud merge',()=>{
  const base=emptyVault();
  const first=customer('remote-customer-same-id','First Buyer');
  const second=customer(first.id,'Second Buyer');
  assert.throws(()=>mergeVaultIntent(base,unrelatedLocalExpense(base),
    {...base,customers:[first,second]}),/new customer IDs must be unique/i);
  assert.throws(()=>mergeVaultIntent(base,{...base,customers:[first,second]},base),
    /new customer IDs must be unique/i);
});

test('remote supplier cannot lose required name, valid email or chosen transaction currency',()=>{
  const original=supplier('supplier-remote-validation','Reliable Supply');
  const base={...emptyVault(),suppliers:[original]};
  for(const [changed,error] of [
    [{...original,nameEn:'',nameAr:''},/supplier name is required/i],
    [{...original,email:'bad-email'},/supplier email is invalid/i],
    [{...original,defaultCurrency:''},/supplier currency is required/i],
  ]){
    assert.throws(()=>mergeVaultIntent(base,unrelatedLocalExpense(base),
      {...base,suppliers:[changed]}),error);
  }
});

test('duplicate newly synced supplier identifiers must never overwrite one supplier with another',()=>{
  const base=emptyVault();
  const first=supplier('remote-new-duplicate-supplier','First Supplier');
  const second=supplier(first.id,'Second Supplier');
  assert.throws(()=>mergeVaultIntent(base,unrelatedLocalExpense(base),
    {...base,suppliers:[first,second]}),/new supplier IDs must be unique/i);
  assert.throws(()=>mergeVaultIntent(base,{...base,suppliers:[first,second]},base),
    /new supplier IDs must be unique/i);
});

test('legitimate customer credit update and new remote supplier survive an unrelated local expense',()=>{
  const buyer=customer('approved-buyer','Approved Buyer');
  const base={...emptyVault(),customers:[buyer]};
  const updated={...buyer,creditLimit:'1500.00',creditCurrency:'USD',paymentDueDays:'45'};
  const vendor=supplier('legitimate-new-supplier','Healthy Vendor');
  const merged=mergeVaultIntent(base,unrelatedLocalExpense(base),
    {...base,customers:[updated],suppliers:[vendor]});
  assert.equal(merged.customers[0].creditLimit,'1500.00');
  assert.equal(merged.customers[0].paymentDueDays,'45');
  assert.equal(merged.suppliers[0].nameEn,'Healthy Vendor');
  assert.equal(merged.expenses.length,1);
});

test('previously stored legacy customer and supplier fields are not retroactively validated or rewritten',()=>{
  const historic=customer('old-customer','Legacy Co');
  const vendor=supplier('old-supplier','Old Vendor');
  historic.creditLimit='1,2.00';vendor.email='legacy-invalid-email';
  const base={...emptyVault(),customers:[historic],suppliers:[vendor]};
  const before=JSON.stringify(base);
  const merged=mergeVaultIntent(base,unrelatedLocalExpense(base),structuredClone(base));
  assert.equal(merged.customers[0].creditLimit,'1,2.00');
  assert.equal(merged.suppliers[0].email,'legacy-invalid-email');
  assert.equal(merged.expenses.length,1);
  assert.equal(JSON.stringify(base),before);
});

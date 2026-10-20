import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

const stamp='2026-10-01T08:00:00.000Z';
function customer(id,name){
  return {id,createdAt:stamp,updatedAt:stamp,companyNameEn:name,
    companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',
    preferredCurrency:'USD',paymentTermPresetId:'',paymentTerms:'',
    paymentDueDays:'30',creditLimit:'1000.00',creditCurrency:'USD',notes:''};
}
const cashExpense=base=>({...base,expenses:[{...createExpense('USD'),
  id:'other-device-expense',description:'Office network',amount:'10.00'}]});

test('concurrent customer credit limit edits cannot silently overwrite the other device policy',()=>{
  const buyer=customer('credit-customer','Acme Buyer');
  const base={...emptyVault(),customers:[buyer]},snapshot=JSON.stringify(base);
  const latest={...base,customers:[{...buyer,creditLimit:'500.00',updatedAt:'2026-10-10T08:00:00.000Z'}]};
  const staleIntent={...base,customers:[{...buyer,creditLimit:'2000.00',updatedAt:'2026-10-10T09:00:00.000Z'}]};
  assert.throws(()=>mergeVaultIntent(base,staleIntent,latest),
    /Customer changed on another device/i);
  assert.equal(JSON.stringify(base),snapshot);
});

test('independent fields of one customer must not be overwritten by stale full-record saves',()=>{
  const buyer=customer('shared-customer','Regional Buyer');
  const base={...emptyVault(),customers:[buyer]};
  const remote={...base,customers:[{...buyer,creditLimit:'250.00',paymentDueDays:'7'}]};
  const local={...base,customers:[{...buyer,email:'finance@regional.example'}]};
  assert.throws(()=>mergeVaultIntent(base,local,remote),
    /Customer changed on another device/i);
});

test('local deletion of a customer being edited remotely must reject stale intent',()=>{
  const buyer=customer('active-customer','Active Trading');
  const base={...emptyVault(),customers:[buyer]};
  const remote={...base,customers:[{...buyer,creditLimit:'1500.00'}]};
  assert.throws(()=>mergeVaultIntent(base,{...base,customers:[]},remote),
    /Customer changed on another device/i);
});

test('different customers may be updated independently by two devices without losing either change',()=>{
  const first=customer('first-buyer','First Trading');
  const second=customer('second-buyer','Second Trading');
  const base={...emptyVault(),customers:[first,second]};
  const local={...base,customers:[{...first,creditLimit:'2000.00'},second]};
  const remote={...base,customers:[first,{...second,paymentDueDays:'45'}]};
  const merged=mergeVaultIntent(base,local,remote);
  assert.equal(merged.customers.find(row=>row.id===first.id).creditLimit,'2000.00');
  assert.equal(merged.customers.find(row=>row.id===second.id).paymentDueDays,'45');
  assert.equal(merged.customers.length,2);
});

test('identical concurrent customer changes and unrelated local expense remain valid',()=>{
  const first=customer('same-customer','Same Buyer');
  const base={...emptyVault(),customers:[first]};
  const changed={...first,creditLimit:'1300.00',updatedAt:'2026-10-10T12:00:00.000Z'};
  const merged=mergeVaultIntent(base,{...cashExpense(base),customers:[changed]},
    {...base,customers:[structuredClone(changed)]});
  assert.equal(merged.customers[0].creditLimit,'1300.00');
  assert.equal(merged.expenses.length,1);
});

test('unchanged legacy commercial credit value survives cloud JSON replay',()=>{
  const first={...customer('legacy-buyer','Historical Buyer'),creditLimit:'1,2.00'};
  const base={...emptyVault(),customers:[first]},prior=JSON.stringify(base);
  const merged=mergeVaultIntent(base,cashExpense(base),structuredClone(base));
  assert.equal(merged.customers[0].creditLimit,'1,2.00');
  assert.equal(merged.expenses.length,1);
  assert.equal(JSON.stringify(base),prior);
});

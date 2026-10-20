import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense,createPurchase,createPurchaseItem,createSupplier,postPurchase,reversePurchase} from '../dist/src/lib/operations.js';
import {supplierPayablesByCurrency} from '../dist/src/lib/payables.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function setup(){
  const supplier={...createSupplier(),id:'supplier-remote-posted',nameEn:'Service Supplier'};
  const draft=createPurchase([],[supplier],'USD');
  draft.id='purchase-remote-posted';
  draft.number='PUR-2026-SERVICE-1';
  draft.date='2026-10-01';draft.dueDate='2026-11-01';
  draft.items=[{...createPurchaseItem(),savedItemId:'',descriptionEn:'Operating service',
    quantity:'1',unitCost:'120.00'}];
  const posted=postPurchase(draft,[],[]).purchase;
  const base={...emptyVault(),suppliers:[supplier],purchases:[posted]};
  return {base,posted,supplier};
}
function localExpense(base){
  return {...base,expenses:[{...createExpense('USD'),id:'independent-office-expense',
    description:'Internet service',amount:'10.00'}]};
}

test('remote price increase or decrease of a posted service purchase cannot silently rewrite supplier payable',()=>{
  const {base,posted}=setup(),before=JSON.stringify(base);
  assert.equal(supplierPayablesByCurrency(base.purchases,[],'2026-10-10')[0].remaining,'120.00');
  for(const amount of ['300.00','5.00']){
    const revised={...posted,items:[{...posted.items[0],unitCost:amount}],
      updatedAt:'2026-10-10T11:00:00.000Z'};
    assert.throws(()=>mergeVaultIntent(base,localExpense(base),
      {...base,purchases:[revised]}),/posted purchases are immutable/i);
    assert.equal(JSON.stringify(base),before);
  }
});

test('remote rewriting posted supplier, currency, posting date, or purchase reference is refused',()=>{
  const {base,posted}=setup();
  const changes=[
    {...posted,currency:'EUR'},
    {...posted,number:'REWRITTEN-PUR-1'},
    {...posted,postedAt:'2026-10-15T09:00:00.000Z'},
    {...posted,supplierSnapshot:{...posted.supplierSnapshot,nameEn:'Other Supplier'}},
  ];
  for(const changed of changes)assert.throws(
    ()=>mergeVaultIntent(base,localExpense(base),{...base,purchases:[changed]}),
    /posted purchases are immutable/i);
});

test('remote reversal must retain original posted financial facts and contain reasoned chronological audit',()=>{
  const {base,posted}=setup();
  const valid=reversePurchase(posted,'Service cancelled',[],[]).purchase;
  const invalid=[
    {...valid,items:[{...valid.items[0],unitCost:'1.00'}]},
    {...valid,reverseReason:''},
    {...valid,reversedAt:'not-a-date',updatedAt:'not-a-date'},
    {...valid,reversedAt:'2020-01-01T09:00:00.000Z',updatedAt:'2020-01-01T09:00:00.000Z'},
    {...valid,updatedAt:'2026-10-01T09:00:00.000Z'}
  ];
  for(const entry of invalid)assert.throws(
    ()=>mergeVaultIntent(base,localExpense(base),{...base,purchases:[entry]}),
    /purchase reversal (cannot change|requires valid)/i);
});

test('legitimate remote reversal and independent local expense preserve pre-reversal payable history',()=>{
  const {base,posted}=setup(),reversed=reversePurchase(posted,'Service cancelled',[],[]).purchase;
  const saved=mergeVaultIntent(base,localExpense(base),
    {...base,purchases:[reversed]});
  assert.equal(saved.purchases[0].status,'reversed');
  assert.equal(saved.purchases[0].reverseReason,'Service cancelled');
  assert.equal(saved.expenses.length,1);
  assert.equal(supplierPayablesByCurrency(saved.purchases,[],'2026-10-10')[0].remaining,'120.00',
    'prior reporting date still sees the original supplier claim');
  assert.equal(supplierPayablesByCurrency(saved.purchases,[],'2026-10-21').length,0,
    'reversal removes the current supplier obligation');
});

test('reversed service purchases are immutable, but legacy posted values remain unchanged on unrelated edits',()=>{
  const {base,posted}=setup(),reversed=reversePurchase(posted,'Cancelled',[],[]).purchase;
  const historical={...base,purchases:[reversed]};
  assert.throws(()=>mergeVaultIntent(historical,localExpense(historical),{
    ...historical,purchases:[{...reversed,reverseReason:'Altered reason'}]
  }),/reversed purchases are immutable/i);
  const legacy={...base,purchases:[{...posted,items:[
    {...posted.items[0],unitCost:'1,2.00'}]}]};
  const prior=JSON.stringify(legacy);
  const saved=mergeVaultIntent(legacy,localExpense(legacy),structuredClone(legacy));
  assert.equal(saved.purchases[0].items[0].unitCost,'1,2.00');
  assert.equal(saved.expenses.length,1);
  assert.equal(JSON.stringify(legacy),prior);
});

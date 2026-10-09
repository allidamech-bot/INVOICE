import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {buildInventoryPlanning} from '../dist/src/lib/inventory-planning.js';

const day=(value)=>value+'T12:00:00.000Z';
function fixture(){
  const vault=emptyVault();
  const item={id:'b09.3-item',sku:'B09-001',descriptionEn:'Snack Carton',
    descriptionAr:'كرتون سناك',archived:false};
  vault.savedItems=[item];
  vault.suppliers=[
    {id:'supplier-old',nameEn:'Known supplier'},
    {id:'supplier-new',nameEn:'Future supplier'}
  ];
  const movement=(id,date,type,quantity,sourceId='')=>({
    id,itemId:item.id,itemNameEn:item.descriptionEn,itemNameAr:item.descriptionAr,
    sku:item.sku,date,type,quantity,unitCost:'1',currency:'USD',
    sourceId,sourceNumber:'',note:'',createdAt:day(date)
  });
  vault.inventoryMovements=[
    movement('open','2026-01-01','opening','10'),
    movement('issued','2026-01-10','issue','-4'),
    movement('future-receipt','2026-02-03','purchase','5','future-purchase'),
    movement('future-issue','2026-02-14','issue','-3')
  ];
  const purchase=(id,date,postedAt,supplierId)=>({
    id,number:id,date,postedAt,status:'posted',updatedAt:day(date),
    supplierSnapshot:{sourceSupplierId:supplierId},
    items:[{savedItemId:item.id}]
  });
  vault.purchases=[
    purchase('historical','2026-01-05',day('2026-01-05'),'supplier-old'),
    purchase('backdated-late-post','2026-01-06',day('2026-03-01'),'supplier-new'),
    purchase('future-purchase','2026-02-03',day('2026-02-03'),'supplier-new')
  ];
  const policy=(id,date,reorderPoint,targetStock)=>({
    id,documentId:'@lourex:inventory-plan:'+item.id,documentNumber:'',
    type:'created',at:day(date),
    note:'@lourex:inventory-plan:v1:'+JSON.stringify({kind:'upsert',policy:{
      itemId:item.id,reorderPoint,targetStock,safetyStock:'0',leadTimeDays:0,
      preferredSupplierId:'',notes:'',updatedAt:day(date)
    }}),
    relatedDocumentId:item.id,relatedDocumentNumber:'',amount:'',currency:''
  });
  vault.documentEvents=[
    policy('historical-policy','2026-01-03','8','15'),
    policy('future-policy','2026-02-06','2','7')
  ];
  return vault;
}
function row(vault,asOf,lookbackDays=30){
  const result=buildInventoryPlanning(vault,asOf,lookbackDays);
  assert.equal(result.rows.length,1);
  return result.rows[0];
}

test('B09.3: historical inventory balances never include later purchases, issues or future reorder policies',()=>{
  const vault=fixture();
  const old=row(vault,'2026-01-31');
  assert.equal(old.onHand,'6');
  assert.equal(old.averageDailyIssue,'0.1333');
  assert.equal(old.policy.reorderPoint,'8');
  assert.equal(old.policy.targetStock,'15');
  assert.equal(old.status,'reorder');
  assert.equal(old.suggestedOrder,'9');
  assert.equal(old.lastPurchase.id,'historical');
  assert.equal(old.preferredSupplier.id,'supplier-old');
  const current=row(vault,'2026-02-28');
  assert.equal(current.onHand,'8');
  assert.equal(current.policy.reorderPoint,'2');
  assert.equal(current.policy.targetStock,'7');
  assert.equal(current.lastPurchase.id,'future-purchase');
  assert.equal(current.preferredSupplier.id,'supplier-new');
});

test('B09.3: backdated purchases posted after the requested date cannot leak later supplier provenance',()=>{
  const vault=fixture();
  vault.purchases=vault.purchases.filter(purchase=>purchase.id!=='future-purchase');
  assert.equal(row(vault,'2026-01-31').lastPurchase.id,'historical');
  assert.equal(row(vault,'2026-01-31').preferredSupplier.id,'supplier-old');
  assert.equal(row(vault,'2026-03-31').lastPurchase.id,'backdated-late-post');
  assert.equal(row(vault,'2026-03-31').preferredSupplier.id,'supplier-new');
});

test('B09.3: future-only stock and supplier evidence remain absent in earlier snapshots',()=>{
  const vault=fixture();
  vault.inventoryMovements=vault.inventoryMovements.filter(movement=>movement.date>'2026-01-31');
  vault.purchases=vault.purchases.filter(purchase=>purchase.id==='future-purchase');
  const past=row(vault,'2026-01-31');
  assert.equal(past.onHand,'0');
  assert.equal(past.status,'critical');
  assert.equal(past.lastPurchase,null);
  assert.equal(past.preferredSupplier,null);
  assert.equal(past.averageDailyIssue,'0');
  assert.equal(row(vault,'2026-02-28').onHand,'2');
});

test('B09.3: present-day stock planning still uses all recorded movements and the latest policy',()=>{
  const vault=fixture();
  const next=row(vault,'2026-02-28');
  assert.equal(next.onHand,'8');
  assert.equal(next.status,'healthy');
  assert.equal(next.suggestedOrder,'0');
  assert.equal(next.policy.reorderPoint,'2');
  assert.equal(next.policy.targetStock,'7');
  assert.throws(()=>buildInventoryPlanning(vault,'2026-02-31'),/invalid/i);
});

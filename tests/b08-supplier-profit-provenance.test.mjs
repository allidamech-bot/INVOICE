import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {defaultCompany} from '../dist/src/lib/defaults.js';
import {productProfitabilityRows,supplierProfitabilityRows} from '../dist/src/lib/profitability-dimensions.js';

const WORKSPACE='workspace-a', BRANCH='branch-a';
function invoice(){
  const doc=createBlankDocument('invoice','INV-B08-PROVENANCE',defaultCompany());
  doc.id='b08-evidence-invoice';doc.status='final';doc.role='standard';doc.lifecycleStatus='active';
  doc.issueDate='2026-05-15';doc.currency='USD';
  doc.workspaceId=WORKSPACE;doc.branchId=BRANCH;
  doc.items=[{...doc.items[0],id:'b08-line',descriptionEn:'Widget',descriptionAr:'',unitPrice:'100.00',quantity:'1',unitCost:'40.00'}];
  doc.adjustments={...doc.adjustments,discountEnabled:false,shippingEnabled:false,otherChargesEnabled:false,taxEnabled:false};
  doc.internalCosts={shippingCost:'0.00',otherCost:'0.00'};
  return doc;
}
function item(workspaceId=WORKSPACE,branchId=BRANCH){
  return{id:'widget-1',workspaceId,branchId,descriptionEn:'Widget',descriptionAr:'',sku:'SKU-B08',category:'Hardware'};
}
function purchase(id,sourceId,date='2026-05-01',workspaceId=WORKSPACE,branchId=BRANCH){
  return{id,workspaceId,branchId,status:'posted',date,postedAt:date+'T00:00:00.000Z',
    supplierSnapshot:{sourceSupplierId:sourceId,nameEn:'Snapshot '+sourceId,nameAr:''},
    items:[{savedItemId:'widget-1'}]};
}
function supplier(id,workspaceId=WORKSPACE,branchId=BRANCH,nameEn='Live '+id){
  return{id,workspaceId,branchId,nameEn,nameAr:''};
}
function attributed(d,items,purchases,suppliers){
  const rows=supplierProfitabilityRows([d],items,purchases,suppliers);
  assert.equal(rows.length,1);
  return rows[0];
}
test('B08.2: latest posted purchase must match both the invoice workspace and branch',()=>{
  const d=invoice(),items=[item()];
  const valid=purchase('valid','supplier-valid','2026-04-01');
  const foreignBranch=purchase('foreign-branch','supplier-wrong','2026-05-12',WORKSPACE,'branch-b');
  const foreignWorkspace=purchase('foreign-workspace','supplier-wrong','2026-05-14','workspace-b',BRANCH);
  const s=[supplier('supplier-valid'),supplier('supplier-wrong')];
  const row=attributed(d,items,[valid,foreignBranch,foreignWorkspace],s);
  assert.equal(row.id,'supplier-valid');
  assert.equal(row.label,'Live supplier-valid');
  assert.equal(row.netSales,'100.00');
  assert.equal(row.totalCost,'40.00');
});

test('B08.2: wrong-scope saved-item matches cannot establish supplier provenance',()=>{
  const d=invoice();
  const row=attributed(d,[item('workspace-b','branch-b')],[purchase('p','supplier-foreign')],[supplier('supplier-foreign')]);
  assert.equal(row.label,'Unattributed');
  const product=productProfitabilityRows([d],[item('workspace-b','branch-b')])[0];
  assert.equal(product.id,'unmatched:Widget');
  assert.equal(product.netSales,'100.00');
  assert.equal(product.grossProfit,'60.00');
});

test('B08.2: malformed and future-dated purchases and anonymous supplier records are not provenance',()=>{
  const d=invoice(),items=[item()];
  const eligible=purchase('legit','supplier-legit','2026-03-01');
  const invalid=purchase('invalid-date','supplier-invalid','2026-02-31');
  const future=purchase('future','supplier-future','2026-06-01');
  const anonymous=purchase('anonymous','','2026-05-10');
  assert.equal(attributed(d,items,[eligible,invalid,future,anonymous],[supplier('supplier-legit')]).id,'supplier-legit');
});

test('B08.2: live supplier names must not be borrowed from another branch',()=>{
  const d=invoice();
  const original=purchase('purchase','supplier-1');
  const foreign=supplier('supplier-1',WORKSPACE,'branch-b','Foreign Branch Supplier');
  const row=attributed(d,[item()],[original],[foreign]);
  assert.equal(row.id,'supplier-1');
  assert.equal(row.label,'Snapshot supplier-1');
});

test('B08.2: legacy records with no scope may match each other but not a modern scoped document',()=>{
  const legacy=invoice();delete legacy.workspaceId;delete legacy.branchId;
  const legacyItem=item(undefined,undefined);delete legacyItem.workspaceId;delete legacyItem.branchId;
  const oldPurchase=purchase('legacy','supplier-old');delete oldPurchase.workspaceId;delete oldPurchase.branchId;
  const oldSupplier=supplier('supplier-old');delete oldSupplier.workspaceId;delete oldSupplier.branchId;
  assert.equal(attributed(legacy,[legacyItem],[oldPurchase],[oldSupplier]).label,'Live supplier-old');
  assert.equal(attributed(invoice(),[legacyItem],[oldPurchase],[oldSupplier]).label,'Unattributed');
});

test('B08.2: same-name catalog products in different workspaces select the scoped item',()=>{
  const d=invoice();
  const unrelated=item('workspace-b','branch-b');
  unrelated.id='foreign-widget';
  const correct=item();
  const records=[purchase('p-correct','supplier-correct')];
  const row=attributed(d,[unrelated,correct],records,[supplier('supplier-correct')]);
  assert.equal(row.id,'supplier-correct');
  assert.equal(productProfitabilityRows([d],[unrelated,correct])[0].id,'widget-1');
});

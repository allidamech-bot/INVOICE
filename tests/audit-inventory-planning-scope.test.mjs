import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {buildInventoryPlanning} from '../dist/src/lib/inventory-planning.js';
import {activateBranch,activateWorkspace,createBranch,createWorkspace} from '../dist/src/lib/workspaces.js';

// The live React class is checked without mounting DOM or writing encrypted data.
globalThis.React={createElement:()=>({}),Component:class{constructor(props){this.props=props;}setState(update){this.state={...this.state,...update};}}};
const {InventoryPlanningLive}=await import('../dist/src/components/InventoryPlanningLive.js');

const item=(id,workspaceId)=>({id,workspaceId,sku:id,descriptionEn:id,descriptionAr:id,unit:'PCS',archived:false});
const supplier=(id,workspaceId)=>({id,workspaceId,nameEn:id,nameAr:id});
function planEvent(itemId,workspaceId,branchId,reorderPoint){
  const at='2026-10-01T12:00:00.000Z';
  return{id:'plan-'+branchId,workspaceId,branchId,documentId:'@lourex:inventory-plan:'+itemId,
    documentNumber:itemId,type:'created',at,relatedDocumentId:itemId,
    relatedDocumentNumber:'',amount:'',currency:'',note:'@lourex:inventory-plan:v1:'+JSON.stringify({kind:'upsert',
      policy:{itemId,reorderPoint,targetStock:'100',safetyStock:'0',leadTimeDays:0,preferredSupplierId:'',notes:'',updatedAt:at}})};
}

test('live inventory planning never exposes products or suppliers of another company',()=>{
  let vault=emptyVault();
  vault.savedItems=[item('company-a-product','default')];
  vault.suppliers=[supplier('company-a-supplier','default')];
  vault=createWorkspace(vault,'Company B');
  const companyB=vault.workspaces.at(-1).id;
  vault.savedItems.push(item('company-b-product',companyB));
  vault.suppliers.push(supplier('company-b-supplier',companyB));
  const view=new InventoryPlanningLive({});

  const companyAView=view.loadSnapshot(vault);
  assert.deepEqual(companyAView.snapshot.rows.map(row=>row.item.id),['company-a-product']);
  assert.deepEqual(companyAView.suppliers.map(row=>row.id),['company-a-supplier']);

  const companyBView=view.loadSnapshot(activateWorkspace(vault,companyB));
  assert.deepEqual(companyBView.snapshot.rows.map(row=>row.item.id),['company-b-product']);
  assert.deepEqual(companyBView.suppliers.map(row=>row.id),['company-b-supplier']);
});

test('live inventory planning reads only branch-specific reorder policies',()=>{
  let vault=emptyVault();
  vault.savedItems=[item('shared-product','default')];
  vault=createBranch(vault,'Warehouse','WH');
  const otherBranch=vault.branches.at(-1).id;
  vault.documentEvents=[
    planEvent('shared-product','default','main','5'),
    planEvent('shared-product','default',otherBranch,'50')
  ];
  const view=new InventoryPlanningLive({});
  assert.equal(view.loadSnapshot(vault).snapshot.rows[0].policy.reorderPoint,'5');
  assert.equal(view.loadSnapshot(activateBranch(vault,otherBranch)).snapshot.rows[0].policy.reorderPoint,'50');
});

test('historical inventory supplier provenance survives a subsequent purchase reversal',()=>{
  const vault=emptyVault();
  const itemId='historical-reversed-item';
  const supplierId='historical-reversed-supplier';
  vault.savedItems=[item(itemId,'default')];
  vault.suppliers=[supplier(supplierId,'default')];
  const purchase={id:'historical-reversed-purchase',number:'PUR-REV',
    date:'2026-10-01',postedAt:'2026-10-01T10:00:00.000Z',
    reversedAt:'2026-10-20T10:00:00.000Z',status:'reversed',
    updatedAt:'2026-10-20T10:00:00.000Z',
    supplierSnapshot:{sourceSupplierId:supplierId},items:[{savedItemId:itemId}]};
  vault.purchases=[purchase];
  const before=buildInventoryPlanning(vault,'2026-10-09');
  assert.equal(before.rows[0].lastPurchase?.id,purchase.id);
  assert.equal(before.rows[0].preferredSupplier?.id,supplierId);
  const atReversal=buildInventoryPlanning(vault,'2026-10-20');
  assert.equal(atReversal.rows[0].lastPurchase,null);
  assert.equal(atReversal.rows[0].preferredSupplier,null);
});

test('historical supplier selection uses posting chronology rather than a later reversal update',()=>{
  const vault=emptyVault();
  const itemId='same-day-historical-item';
  vault.savedItems=[item(itemId,'default')];
  vault.suppliers=[supplier('early-supplier','default'),supplier('late-supplier','default')];
  const early={id:'early-reversed',number:'PUR-EARLY',date:'2026-10-01',
    status:'reversed',postedAt:'2026-10-01T08:00:00.000Z',reversedAt:'2026-10-20T09:00:00.000Z',
    updatedAt:'2026-10-20T09:00:00.000Z',supplierSnapshot:{sourceSupplierId:'early-supplier'},items:[{savedItemId:itemId}]};
  const late={id:'late-posted',number:'PUR-LATE',date:'2026-10-01',
    status:'posted',postedAt:'2026-10-01T14:00:00.000Z',updatedAt:'2026-10-01T14:00:00.000Z',
    supplierSnapshot:{sourceSupplierId:'late-supplier'},items:[{savedItemId:itemId}]};
  vault.purchases=[early,late];
  const snapshot=buildInventoryPlanning(vault,'2026-10-09');
  assert.equal(snapshot.rows[0].lastPurchase?.id,'late-posted');
  assert.equal(snapshot.rows[0].preferredSupplier?.id,'late-supplier');
});

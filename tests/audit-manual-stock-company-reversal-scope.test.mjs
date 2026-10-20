import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createManualInventoryMovement,reverseManualInventoryMovement} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

const bytes=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n');
const evidence=id=>({id,name:'warehouse-proof.pdf',mimeType:'application/pdf',
  size:bytes.length,dataUrl:'data:application/pdf;base64,'+bytes.toString('base64'),
  createdAt:new Date().toISOString()});
function fixture(){
 const vault=emptyVault(),at=new Date().toISOString();
 const item={id:'manual-scope-item',sku:'MAN-SCOPE',descriptionEn:'Tracked goods',
  descriptionAr:'',unit:'Carton',lastUnitCost:'4.00',lastCostCurrency:'USD',
  lastUnitPrice:'8.00',lastCurrency:'USD',usageCount:0,lastUsedAt:at,
  createdAt:at,updatedAt:at,workspaceId:'default'};
 vault.savedItems=[item];
 const opening={...createManualInventoryMovement(item,'opening','5',at.slice(0,10),
   'Verified opening cartons on inventory count'),id:'manual-scope-opening',
  workspaceId:'default',branchId:'main',reasonCategory:'opening',
  createdBy:'owner',evidence:evidence('manual-proof-opening')};
 const reversal={...reverseManualInventoryMovement(opening,at.slice(0,10)),
  id:'manual-scope-reversal',workspaceId:'default',branchId:'main',
  reasonCategory:'correction',createdBy:'owner',evidence:evidence('manual-proof-reversal')};
 return{vault,item,opening,reversal};
}
const unrelated=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('local new opening cannot create inventory for an item belonging to a different company',()=>{
 const {vault,opening}=fixture(),before=JSON.stringify(vault);
 assert.throws(()=>mergeVaultIntent(vault,{...vault,inventoryMovements:[
   {...opening,workspaceId:'foreign-company'}]},vault),
   /manual inventory.*company|manual stock.*company/i);
 assert.equal(JSON.stringify(vault),before);
});

test('remote foreign-company stock entry cannot pass through unrelated local settings save',()=>{
 const {vault,opening}=fixture(),before=JSON.stringify(vault);
 assert.throws(()=>mergeVaultIntent(vault,unrelated(vault),{...vault,inventoryMovements:[
   {...opening,workspaceId:'foreign-company'}]}),
   /manual inventory.*company|manual stock.*company/i);
 assert.equal(JSON.stringify(vault),before);
});

test('new manual reversal cannot offset another branch or company original movement',()=>{
 const {vault,opening,reversal}=fixture();
 const recorded={...vault,inventoryMovements:[opening]};
 for(const changed of [{workspaceId:'foreign-company'},{branchId:'different-branch'}]){
   assert.throws(()=>mergeVaultIntent(recorded,{...recorded,inventoryMovements:[
     opening,{...reversal,...changed}]},recorded),
     /manual inventory.*(company|branch)|manual stock.*(company|branch)/i);
 }
});

test('valid documented opening and its same-scope reversal preserve the exact ledger history',()=>{
 const {vault,opening,reversal}=fixture();
 const posted=mergeVaultIntent(vault,{...vault,inventoryMovements:[opening]},vault);
 const corrected=mergeVaultIntent(posted,{...posted,inventoryMovements:[
   ...posted.inventoryMovements,reversal]},posted);
 assert.deepEqual(corrected.inventoryMovements.map(row=>row.quantity),['5','-5']);
 assert.equal(corrected.inventoryMovements[0].id,opening.id);
 assert.equal(corrected.inventoryMovements[1].sourceId,opening.id);
});

test('unchanged historical manual stock proof is not rewritten by unrelated save',()=>{
 const {vault,opening}=fixture();
 const historic={...vault,inventoryMovements:[{...opening,workspaceId:'old-company'}]};
 const before=JSON.stringify(historic);
 const result=mergeVaultIntent(historic,unrelated(historic),structuredClone(historic));
 assert.equal(result.inventoryMovements[0].workspaceId,'old-company');
 assert.equal(JSON.stringify(historic),before);
});

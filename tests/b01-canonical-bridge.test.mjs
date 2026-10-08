import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const read=path=>readFile(path,'utf8');
const sliceFunction=(source,name,next)=>{
  const start=source.indexOf(name),end=source.indexOf(next,start+name.length);
  assert.ok(start>=0&&end>start,`Expected ${name} function in source`);
  return source.slice(start,end);
};

test('external/AI mutations now validate against the canonical vault invariants before save',async()=>{
  const source=await read('src/app/index.tsx');
  assert.match(source,/import \{ mergeVaultIntent \} from '\.\.\/storage\/vault-merge\.js'/);
  const bridge=sliceFunction(source,'    registerVaultMutationBridge(async mutation=>{','\n    // BaseApp already');
  assert.match(bridge,/const intended=applyWorkspaceScope\(latest,mutation\(latest\)\)/);
  assert.match(bridge,/const validated=mergeVaultIntent\(latest,intended,latest\)/);
  assert.match(bridge,/appendAuditEventsForVaultDiff\(latest,validated\)/);
  assert.ok(bridge.indexOf('mergeVaultIntent(')<bridge.indexOf('saveVault('));
  assert.doesNotMatch(bridge,/appendAuditEventsForVaultDiff\(latest,intended\)/);
});

test('authoritative warehouse validation rejects two transfers that overdraw the same bin',async()=>{
  const source=await read('src/storage/vault-merge.ts');
  const body=sliceFunction(source,'function guardNewWarehouseTransfers(', '\nfunction guardSavedItemInventoryRemoval(');
  const transpiled=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const warehouseItemQuantity=(itemId,location,ledger)=>ledger.reduce((sum,row)=>{
    if(row.itemId!==itemId)return sum;
    const q=BigInt(row.quantity);
    if(row.type==='transfer'){
      return sum+(row.fromWarehouseId===location?-q:0n)+(row.toWarehouseId===location?q:0n);
    }
    return sum+(location==='A'?q:0n);
  },0n);
  const check=new Function('inventoryMovementAccountingIsValid','warehouseItemQuantity','defaultWarehouseId','movementQuantity',`${transpiled};return guardNewWarehouseTransfers;`)(
    row=>row.type==='transfer'&&Number(row.quantity)>0&&row.fromWarehouseId!==row.toWarehouseId,
    warehouseItemQuantity,branch=>`warehouse-${branch}`,row=>BigInt(row.quantity)
  );
  const opening={id:'open',itemId:'p1',type:'opening',quantity:'10'};
  const transfer=(id,quantity,fromWarehouseId='A',toWarehouseId='B')=>({id,itemId:'p1',type:'transfer',quantity,fromWarehouseId,toWarehouseId});
  const base={inventoryMovements:[opening]};
  const latest={inventoryMovements:[opening],appSettings:{activeWorkspaceId:'ws',activeBranchId:'br'}};
  const warehouses=['A','B','C'].map(id=>({id,workspaceId:'ws',branchId:'br',active:true}));
  const items=[{id:'p1'}];
  assert.doesNotThrow(()=>check(base,{inventoryMovements:[opening,transfer('t1','4'),transfer('t2','6')]},latest,warehouses,items));
  assert.throws(()=>check(base,{inventoryMovements:[opening,transfer('t1','6'),transfer('t2','6')]},latest,warehouses,items),/latest available stock/);
  assert.throws(()=>check(base,{inventoryMovements:[opening,transfer('t1','11')]},latest,warehouses,items),/latest available stock/);
  const concurrentlyUpdated={...latest,inventoryMovements:[opening,transfer('older','7')]};
  assert.throws(()=>check(base,{inventoryMovements:[opening,transfer('new','4')]},concurrentlyUpdated,warehouses,items),/latest available stock/);
  assert.throws(()=>check(base,{inventoryMovements:[opening,transfer('t1','2','A','DISABLED')]},latest,warehouses,items),/no longer active/);
  assert.match(source,/guardNewWarehouseTransfers\(base,intended,latest,latest\.warehouses,savedItems\)/);
});

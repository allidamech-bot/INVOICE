import {isFiscalPurchaseReturn} from './purchase-return.mjs';
import {inspectReturnPostings,isReturnMovement} from './return-postings.js';
import {reviewDigest} from './commercial-source.js';
import {fail} from '../_accounting/period-format.js';
// Invoked only by isolated QA period writer, inside its final CAS. Every
// changed invoice is checked against the immutable server approval/issue.
export function createFiscalPeriodGuard(db,{closeProof}={}){
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
 const same=(a,b)=>a&&b&&reviewDigest(a)===reviewDigest(b);
 return async function guard(tx,uid,before,candidate,input){
  const returnWrites=[];
  const workspaces=new Set([...before.workspaces,...candidate.workspaces].map(w=>w.id));
  for(const workspaceId of workspaces){
   if(!id(workspaceId))fail(422,'FISCAL_SCOPE_INVALID');
   const base='fiscalPrivateV1/'+uid+'/workspaces/'+workspaceId;
   const w=await tx.get(db.doc(base));
   if(!w.exists)continue;
   const scope=w.data();
   if(scope.environment!=='simulation'||scope.syntheticOnly!==true||scope.accountUid!==uid||scope.workspaceId!==workspaceId)fail(422,'FISCAL_SCOPE_INVALID');
   if(input.operation==='close'&&input.workspaceId===workspaceId){
    if(typeof closeProof!=='function'||typeof scope.selectedEgsId!=='string'||!id(scope.selectedEgsId)||scope.commandsEnabled!==true)fail(409,'FISCAL_PERIOD_RECONCILIATION_REQUIRED');
    // The proof must be evaluated inside the same transaction as the close.
    // Missing evidence, unsupported scenarios and any discrepancy fail closed.
    try{return await closeProof(tx,{accountUid:uid,workspaceId,egsId:scope.selectedEgsId,environment:'simulation'},input.through);}
    catch{fail(409,'FISCAL_PERIOD_RECONCILIATION_REQUIRED');}
   }
   if(input.operation!=='commit')continue;
   const a=new Map(before.documents.filter(d=>d.workspaceId===workspaceId).map(d=>[d.id,d]));
   const b=new Map(candidate.documents.filter(d=>d.workspaceId===workspaceId).map(d=>[d.id,d]));
   const changed=[...new Set([...a.keys(),...b.keys()])].filter(k=>!same(a.get(k),b.get(k)));
   if(changed.length>100)fail(422,'FISCAL_CHANGE_LIMIT');
   for(const k of changed){
    if(!id(k))fail(422,'FISCAL_SCOPE_INVALID');
    const old=a.get(k),next=b.get(k);
    const intent=await tx.get(db.doc(base+'/issueIntents/'+k));
    const issue=await tx.get(db.doc(base+'/issues/'+k));
    if(intent.exists||issue.exists)fail(409,'FISCAL_DOCUMENT_LOCKED');
    // Commercial finalization of Saudi test invoices cannot bypass the server.
    const country=String(next?.companySnapshot?.country??'').trim().toUpperCase();
    if(next?.kind==='invoice'&&next.status==='final'&&(['SA','SAU','SAUDI ARABIA','KINGDOM OF SAUDI ARABIA','السعودية','المملكة العربية السعودية'].includes(country)||/^3\d{13}3$/.test(next.companySnapshot?.vatNumber??'')))fail(409,'FISCAL_DOCUMENT_LOCKED');
   }
   // Only the trusted supplier-return command can introduce these movements.
   // A stale browser or backup cannot delete, modify or inject one.
   const oldSupplierReturns=(before.inventoryMovements??[]).filter(m=>m.workspaceId===workspaceId&&isFiscalPurchaseReturn(m));
   const newSupplierReturns=(candidate.inventoryMovements??[]).filter(m=>m.workspaceId===workspaceId&&isFiscalPurchaseReturn(m));
   if(oldSupplierReturns.length!==newSupplierReturns.length||oldSupplierReturns.some(m=>!same(m,newSupplierReturns.find(x=>x.id===m.id)))||new Set(newSupplierReturns.map(m=>m.id)).size!==newSupplierReturns.length)fail(409,'FISCAL_PURCHASE_RETURN_LOCKED');
   const fiscalSources=new Set();
   const purchaseMovements=rows=>(rows??[]).filter(m=>m.workspaceId===workspaceId&&['purchase','purchase-reversal'].includes(m.type));
   const oldStock=purchaseMovements(before.inventoryMovements),newStock=purchaseMovements(candidate.inventoryMovements);
   for(const m of oldStock)if(!same(m,newStock.find(x=>x.id===m.id)))fiscalSources.add(m.sourceId);
   for(const m of newStock)if(!same(m,oldStock.find(x=>x.id===m.id)))fiscalSources.add(m.sourceId);
   if(fiscalSources.size>100)fail(422,'FISCAL_CHANGE_LIMIT');
   for(const k of fiscalSources){if(!id(k))fail(422,'FISCAL_SCOPE_INVALID');const posting=await tx.get(db.doc(base+'/accountingEntries/purchase-'+k)),claim=await tx.get(db.doc(base+'/purchaseTreatmentClaims/'+k));if(posting.exists||claim.exists)fail(409,'FISCAL_PURCHASE_LOCKED');}
   const oldReturns=(before.inventoryMovements??[]).filter(m=>m.workspaceId===workspaceId&&isReturnMovement(m)),newReturns=(candidate.inventoryMovements??[]).filter(m=>m.workspaceId===workspaceId&&isReturnMovement(m));
   const oldIds=new Set(oldReturns.map(m=>m.id)),newIds=new Set(newReturns.filter(m=>!oldIds.has(m.id)).map(m=>m.id));
   if(newIds.size&&scope.commandsEnabled!==true)fail(409,'FISCAL_RETURN_POSTING_REQUIRED');
   if(oldReturns.length||newReturns.length){
     try{const result=await inspectReturnPostings(db,tx,{accountUid:uid,workspaceId},candidate,{newMovementIds:newIds});if(result.missing.length)fail(409,'FISCAL_RETURN_POSTING_REQUIRED');returnWrites.push(...result.writes);}
     catch{fail(409,'FISCAL_RETURN_POSTING_REQUIRED');}
   }
   const oldPurchase=new Map(before.purchases.filter(p=>p.workspaceId===workspaceId).map(p=>[p.id,p])),newPurchase=new Map(candidate.purchases.filter(p=>p.workspaceId===workspaceId).map(p=>[p.id,p]));
   for(const [k,v] of oldPurchase){if(same(v,newPurchase.get(k)))continue;if(!id(k))fail(422,'FISCAL_SCOPE_INVALID');const posting=await tx.get(db.doc(base+'/accountingEntries/purchase-'+k)),claim=await tx.get(db.doc(base+'/purchaseTreatmentClaims/'+k));if(posting.exists||claim.exists)fail(409,'FISCAL_PURCHASE_LOCKED');}
  }
  for(const w of returnWrites)tx.create(w.ref,w.record);
 };
}

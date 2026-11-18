import {reviewDigest} from './commercial-source.js';
import {fail} from '../_accounting/period-format.js';
// Invoked only by isolated QA period writer, inside its final CAS. Every
// changed invoice is checked against the immutable server approval/issue.
export function createFiscalPeriodGuard(db){
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
 const same=(a,b)=>a&&b&&reviewDigest(a)===reviewDigest(b);
 return async function guard(tx,uid,before,candidate,input){
  const workspaces=new Set([...before.workspaces,...candidate.workspaces].map(w=>w.id));
  for(const workspaceId of workspaces){
   if(!id(workspaceId))fail(422,'FISCAL_SCOPE_INVALID');
   const base='fiscalPrivateV1/'+uid+'/workspaces/'+workspaceId;
   const w=await tx.get(db.doc(base));
   if(!w.exists)continue;
   const scope=w.data();
   if(scope.environment!=='simulation'||scope.syntheticOnly!==true||scope.accountUid!==uid||scope.workspaceId!==workspaceId)fail(422,'FISCAL_SCOPE_INVALID');
   if(input.operation==='close'&&input.workspaceId===workspaceId){
    // Explicitly block commercial period closure while fiscal acceptance and
    // posting reconciliation remain incomplete, rather than freeze a gap.
    fail(409,'FISCAL_PERIOD_RECONCILIATION_REQUIRED');
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
   const oldPurchase=new Map(before.purchases.filter(p=>p.workspaceId===workspaceId).map(p=>[p.id,p])),newPurchase=new Map(candidate.purchases.filter(p=>p.workspaceId===workspaceId).map(p=>[p.id,p]));
   for(const [k,v] of oldPurchase){if(same(v,newPurchase.get(k)))continue;if(!id(k))fail(422,'FISCAL_SCOPE_INVALID');const posting=await tx.get(db.doc(base+'/accountingEntries/purchase-'+k)),claim=await tx.get(db.doc(base+'/purchaseTreatmentClaims/'+k));if(posting.exists||claim.exists)fail(409,'FISCAL_PURCHASE_LOCKED');}
  }
 };
}

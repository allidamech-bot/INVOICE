import {reviewDigest} from './commercial-source.js';
import {fiscalCompanySourceDigest} from './production-profile.js';
import {fail} from '../_accounting/period-format.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const id=v=>typeof v==='string'&&ID.test(v);
const equal=(a,b)=>a===b||a!==undefined&&b!==undefined&&reviewDigest(a)===reviewDigest(b);
const data=s=>s.exists?s.data():null;
const scoped=(r,uid,w)=>r?.environment==='production'&&r.accountUid===uid&&r.workspaceId===w;
function map(rows){const m=new Map();for(const r of rows??[]){if(!id(r.id)||m.has(r.id))fail(422,'FISCAL_SCOPE_INVALID');m.set(r.id,r);}return m;}
// A server-owned registered Phase-2 issuer is not a browser-selected mode.
// Do not infer a taxpayer obligation from a VAT-looking string or country.
export function createProductionPeriodGuard(db){
 return async function guard(tx,uid,before,candidate,input){
  if(!id(uid))fail(422,'FISCAL_SCOPE_INVALID');
  const a=map(before.documents),b=map(candidate.documents),groups=new Map();
  for(const k of new Set([...a.keys(),...b.keys()])){
   const old=a.get(k),next=b.get(k);if(equal(old,next))continue;
   for(const w of new Set([old?.workspaceId,next?.workspaceId].filter(Boolean))){
    if(!id(w))fail(422,'FISCAL_SCOPE_INVALID');
    if(!groups.has(w))groups.set(w,[]);groups.get(w).push({k,old,next});
   }
  }
  // Protect legal identity and enrolled branch records even when no invoice is edited.
  const oldW=map(before.workspaces),newW=map(candidate.workspaces),oldB=map(before.branches),newB=map(candidate.branches);
  const identityChanges=new Set(),branchChanges=new Map();
  for(const w of new Set([...oldW.keys(),...newW.keys()])){
   if(equal(oldW.get(w)?.company,newW.get(w)?.company)&&!!oldW.get(w)===!!newW.get(w))continue;
   identityChanges.add(w);if(!groups.has(w))groups.set(w,[]);
  }
  for(const k of new Set([...oldB.keys(),...newB.keys()])){
   const old=oldB.get(k),next=newB.get(k);if(equal(old,next))continue;
   for(const w of new Set([old?.workspaceId,next?.workspaceId].filter(Boolean))){
    if(!id(w))fail(422,'FISCAL_SCOPE_INVALID');if(!groups.has(w))groups.set(w,[]);
    if(!branchChanges.has(w))branchChanges.set(w,new Set());branchChanges.get(w).add(k);
   }
  }
  if(input.operation==='close'){if(!id(input.workspaceId))fail(422,'FISCAL_SCOPE_INVALID');if(!groups.has(input.workspaceId))groups.set(input.workspaceId,[]);}
  // The prior generation is trusted, but every new or modified document
  // is checked for private intent/issue locks, including moves between workspaces.
  // Bound Firestore reads. Ordinary large account uploads are not subject to
  // the fiscal change cap unless the company has enrolled units.
  for(const [w,changes] of groups){
   const base='fiscalProductionV1/'+uid+'/workspaces/'+w;
   const units=await tx.get(db.collection(base+'/egs').limit(101));
   if(units.docs.length>100)fail(422,'FISCAL_CHANGE_LIMIT');
   if(!units.docs.length)continue;
   const active=[];
   for(const snap of units.docs){
    const r=snap.data();
    if(!scoped(r,uid,w)||!id(r.egsId)||r.egsId!==snap.id||!['active','enrolling'].includes(r.state)||r.issuer?.saRegime!=='phase-2'||r.issuer.accountUid!==uid||r.issuer.workspaceId!==w||typeof r.issuer.effectiveFrom!=='string'||!DAY.test(r.issuer.effectiveFrom))fail(422,'FISCAL_SCOPE_INVALID');
    // An independently registered issuer already has a verified effective
    // date; pending certificate activation must not open a bypass.
    active.push(r.issuer.effectiveFrom);
    if(branchChanges.get(w)?.has(r.branchId))fail(409,'FISCAL_REGISTERED_BRANCH_LOCKED');
   }
   if(identityChanges.has(w)){
    let unchanged=false;try{unchanged=fiscalCompanySourceDigest(oldW.get(w)?.company)===fiscalCompanySourceDigest(newW.get(w)?.company);}catch{}
    if(!unchanged)fail(409,'FISCAL_REGISTERED_IDENTITY_LOCKED');
   }
   const effective=active.sort()[0];
   if(input.operation==='close'&&w===input.workspaceId&&input.through>=effective)fail(409,'FISCAL_PERIOD_RECONCILIATION_REQUIRED');
   if(changes.length>100)fail(422,'FISCAL_CHANGE_LIMIT');
   for(const {k,old,next} of changes){
    const intent=data(await tx.get(db.doc(base+'/issueIntents/'+k))),issue=data(await tx.get(db.doc(base+'/issues/'+k)));
    if(intent||issue)fail(409,'FISCAL_DOCUMENT_LOCKED');
    for(const doc of [old,next])if(doc?.workspaceId===w&&doc.kind==='invoice'&&doc.status==='final'&&(typeof doc.issueDate!=='string'||!DAY.test(doc.issueDate)||doc.issueDate>=effective))fail(409,'FISCAL_ISSUANCE_REQUIRED');
   }
  }
 };
}

// PRIVATE emergency revocation boundary. Never expose this as a customer route.
// An operator can stop further use of one EGS without deleting its identity,
// invoice chain, authority attempts, receipts or previously accepted invoices.
// Recovery requires a separately reviewed re-enrollment/rotation procedure.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const HEX=/^[a-f0-9]{64}$/;
const SCOPE=['environment','accountUid','workspaceId','egsId'];
const REASONS=new Set(['suspected-key-compromise','certificate-revoked',
  'taxpayer-request','confirmed-security-incident']);
const need=(ok,code='PRODUCTION_SECURITY_HOLD_DENIED')=>{if(!ok)throw Error(code);};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&
  Object.keys(o).sort().join(',')===keys.slice().sort().join(',');
const same=(a,b,fields)=>a&&b&&fields.every(k=>a[k]===b[k]);
const data=s=>s.exists?s.data():null;
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;

export function createProductionSecurityHold({
  db,authorizeOperator,verifyEvidence,clock=()=>new Date().toISOString()
}){
  need(typeof db?.doc==='function'&&typeof db?.runTransaction==='function'&&
    [authorizeOperator,verifyEvidence,clock].every(f=>typeof f==='function'));
  return async function hold(input,operatorContext){
    const scope=input?.scope;
    need(exact(input,['scope','reason','evidenceDigest'])&&exact(scope,SCOPE)&&
      scope.environment==='production'&&SCOPE.slice(1).every(k=>
        typeof scope[k]==='string'&&ID.test(scope[k]))&&
      REASONS.has(input.reason)&&HEX.test(input.evidenceDigest??''));
    const s=Object.freeze(Object.fromEntries(SCOPE.map(k=>[k,scope[k]])));
    need(await authorizeOperator(s,operatorContext,'security-hold')===true);
    need(await verifyEvidence(Object.freeze({
      scope:s,reason:input.reason,evidenceDigest:input.evidenceDigest
    }))===true,'PRODUCTION_SECURITY_EVIDENCE_UNVERIFIED');
    const at=clock();
    need(iso(at),'PRODUCTION_SECURITY_HOLD_DENIED');
    const root='fiscalProductionV1/'+s.accountUid+'/workspaces/'+s.workspaceId+
      '/egs/'+s.egsId;
    return db.runTransaction(async tx=>{
      const unit=data(await tx.get(db.doc(root)));
      need(unit&&same(unit,s,SCOPE)&&['enrolling','active'].includes(unit.state),
        'PRODUCTION_SECURITY_SCOPE_NOT_FOUND');
      const ref=db.doc(root+'/security/hold'),prior=data(await tx.get(ref));
      if(prior){
        need(same(prior,s,SCOPE)&&prior.state==='held'&&
          prior.reason===input.reason&&prior.evidenceDigest===input.evidenceDigest,
          'PRODUCTION_SECURITY_HOLD_CONFLICT');
        return {state:'already-held'};
      }
      // Immutable Create, never Update: this is a permanent denial barrier.
      tx.create(ref,{...s,state:'held',reason:input.reason,
        evidenceDigest:input.evidenceDigest,heldAt:at});
      return {state:'held'};
    });
  };
}

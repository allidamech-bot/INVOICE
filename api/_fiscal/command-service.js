import {readSimulationContext} from './simulation-scope.js';
import {requiredComplianceChecks} from './onboarding.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const states=new Set(['checking','restart-required','checks-complete','operational-request-held','operational-recorded']);
const statuses=new Set(['queued','submitting','uncertain','retryable','rejected','cleared','reported']);
function need(ok,code='FISCAL_COMMAND_FORBIDDEN'){if(!ok)throw Error(code);}
const id=v=>typeof v==='string'&&ID.test(v);
const version=v=>Number.isSafeInteger(v)&&v>0;
const data=s=>s.exists?s.data():null;
const same=(row,s)=>row&&['accountUid','workspaceId','egsId','environment'].every(k=>row[k]===s[k]);
export function parseFiscalCommand(v){
  need(v&&typeof v==='object'&&!Array.isArray(v),'INVALID_COMMAND');
  const op=v.operation,keys=['operation','workspaceId'];
  need(['inspect','enroll','check','operational','approve','prepare','submit'].includes(op)&&id(v.workspaceId),'INVALID_COMMAND');
  if(['approve','prepare','submit'].includes(op)){keys.push('documentId','documentRevision');need(id(v.documentId)&&version(v.documentRevision),'INVALID_COMMAND');}
  if(op==='enroll'){keys.push('otp');need(typeof v.otp==='string'&&/^\d{6}$/.test(v.otp),'INVALID_COMMAND');}
  if(['check','operational','submit'].includes(op)){keys.push('expectedVersion');need(version(v.expectedVersion),'INVALID_COMMAND');}
  need(Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'INVALID_COMMAND');return {...v};
}
export function createFiscalCommandService({db,approve,enrollment,prepare,submit}){
  need(typeof db?.runTransaction==='function'&&typeof db?.doc==='function'&&typeof approve==='function','FISCAL_COMMAND_UNAVAILABLE');
  return async function execute(identity,input){
    const cmd=parseFiscalCommand(input),op=cmd.operation;
    need(identity?.role==='owner'&&id(identity.uid));
    const base='fiscalPrivateV1/'+identity.uid+'/workspaces/'+cmd.workspaceId;
    const c=await db.runTransaction(async tx=>{
      const w=data(await tx.get(db.doc(base)));
      need(w?.accountUid===identity.uid&&w.workspaceId===cmd.workspaceId&&w.environment==='simulation'&&w.syntheticOnly===true&&w.commandsEnabled===true&&id(w.selectedEgsId));
      const s={accountUid:identity.uid,workspaceId:cmd.workspaceId,egsId:w.selectedEgsId,environment:'simulation'};
      const {unit}=await readSimulationContext(db,tx,s);need(typeof unit.active==='boolean','FISCAL_COMMAND_UNAVAILABLE');
      const row=data(await tx.get(db.doc(base+'/egs/'+s.egsId+'/onboarding/current')));
      let onboarding=null;
      if(row){need(same(row.binding,s)&&states.has(row.state)&&version(row.version)&&Array.isArray(row.checks),'FISCAL_COMMAND_UNAVAILABLE');const required=requiredComplianceChecks(row.functionalityMap);need(row.checks.length<=required.length&&new Set(row.checks.map(x=>x.type)).size===row.checks.length&&row.checks.every(x=>required.includes(x.type)&&['verified-pass','verified-fail'].includes(x.outcome)),'FISCAL_COMMAND_UNAVAILABLE');onboarding={state:row.state,version:row.version,passed:row.checks.filter(x=>x.outcome==='verified-pass').length,required:required.length};}
      const review=cmd.documentId?data(await tx.get(db.doc(base+'/issueReviews/'+cmd.documentId))):null,issue=cmd.documentId?data(await tx.get(db.doc(base+'/issues/'+cmd.documentId))):null,intent=cmd.documentId?data(await tx.get(db.doc(base+'/issueIntents/'+cmd.documentId))):null;
      const reviewed=Boolean(same(review,s)&&review.state==='approved'&&review.documentId===cmd.documentId&&review.documentRevision===cmd.documentRevision);
      if(issue)need(issue.accountUid===s.accountUid&&issue.workspaceId===s.workspaceId&&issue.egsId===s.egsId&&issue.documentId===cmd.documentId&&statuses.has(issue.status),'FISCAL_COMMAND_UNAVAILABLE');
      if(intent)need(same(intent,s)&&intent.documentId===cmd.documentId&&intent.state==='approved','FISCAL_COMMAND_UNAVAILABLE');
      return {s,unit,onboarding,reviewed,issue,intent};
    });
    const {s,unit}=c;
    if(op==='inspect')return {environment:'simulation',workspaceId:s.workspaceId,unitActive:unit.active,onboarding:c.onboarding,capabilities:{enrollment:!!enrollment,approval:unit.active,preparation:unit.active&&typeof prepare==='function',submission:unit.active&&typeof submit==='function'}};
    if(['enroll','check','operational'].includes(op)){
      need(!unit.active);const method={enroll:'begin',check:'check',operational:'operational'}[op];need(typeof enrollment?.[method]==='function','FISCAL_VERIFICATION_UNAVAILABLE');
      const r=await enrollment[method](identity,{workspaceId:s.workspaceId,egsId:s.egsId,...(op==='enroll'?{otp:cmd.otp}:{expectedVersion:cmd.expectedVersion})});
      return {environment:'simulation',state:r.state,version:r.version};
    }
    need(unit.active&&c.reviewed&&(!c.intent||c.intent.documentRevision===cmd.documentRevision),'FISCAL_REVIEW_REQUIRED');
    if(op==='submit'){
      need(typeof submit==='function','FISCAL_VERIFICATION_UNAVAILABLE');need(c.issue?.status==='queued'&&c.issue.version===cmd.expectedVersion,'FISCAL_STALE_ISSUE');
      const r=await submit(s,cmd.documentId,cmd.expectedVersion);return {environment:'simulation',documentId:cmd.documentId,status:r.status,version:r.version};
    }
    if(op==='prepare')need(typeof prepare==='function','FISCAL_VERIFICATION_UNAVAILABLE');
    const a=await approve(identity,{workspaceId:s.workspaceId,egsId:s.egsId,documentId:cmd.documentId},{expectedDocumentRevision:cmd.documentRevision,requireCommandEnabled:true});
    need(a.documentRevision===cmd.documentRevision,'FISCAL_REVIEW_REQUIRED');
    if(op==='approve')return {environment:'simulation',documentId:cmd.documentId,status:'approved',documentRevision:a.documentRevision};
    const r=await prepare(s,cmd.documentId);return {environment:'simulation',documentId:cmd.documentId,status:r.status,version:r.version};
  };
}

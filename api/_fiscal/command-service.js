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
  need(['inspect','enroll','check','operational','document-status','review','approve','prepare','submit','recover','reconcile','download','post-sale','post-purchase','post-purchase-cost','post-purchase-adjustment','post-purchase-return','post-supplier-settlement','vat-report'].includes(op)&&id(v.workspaceId),'INVALID_COMMAND');
  if(['document-status','review','approve','prepare','submit','recover','reconcile','download','post-sale'].includes(op)){keys.push('documentId','documentRevision');need(id(v.documentId)&&version(v.documentRevision),'INVALID_COMMAND');}
  if(op==='post-purchase-adjustment'||op==='post-purchase-return'){keys.push('adjustmentId');need(id(v.adjustmentId),'INVALID_COMMAND');}
  if(op==='post-purchase'||op==='post-purchase-cost'){keys.push('purchaseId');need(id(v.purchaseId),'INVALID_COMMAND');}
  if(op==='post-supplier-settlement'){keys.push('settlementId');need(id(v.settlementId),'INVALID_COMMAND');}
  if(op==='vat-report'){keys.push('from','to');need(typeof v.from==='string'&&typeof v.to==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.from)&&/^\d{4}-\d{2}-\d{2}$/.test(v.to),'INVALID_COMMAND');}
  if(op==='download'){keys.push('format');need(['xml','pdf'].includes(v.format),'INVALID_COMMAND');}
  if(op==='review'){keys.push('invoiceType','supplyDate','paymentMeans');need(['standard','simplified'].includes(v.invoiceType)&&typeof v.supplyDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.supplyDate)&&['10','30','42','48','1'].includes(v.paymentMeans),'INVALID_COMMAND');}
  if(op==='enroll'){keys.push('otp');need(typeof v.otp==='string'&&/^\d{6}$/.test(v.otp),'INVALID_COMMAND');}
  if(['check','operational','submit','recover','reconcile'].includes(op)){keys.push('expectedVersion');need(version(v.expectedVersion),'INVALID_COMMAND');}
  need(Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'INVALID_COMMAND');return {...v};
}
export function createFiscalCommandService({db,approve,reviewDocument,enrollment,prepare,submit,recover,reconcile,responseStatus,output,accounting,clock=()=>new Date().toISOString()}){
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
      // A successful remote request with a lost local response can leave an
      // enrollment attempt held even before onboarding/current exists.
      let enrollmentHeld=false;
      if(op==='inspect'||['enroll','check','operational'].includes(op)){
        for(const key of ['compliance-csid',...requiredComplianceChecks('1100').map(t=>'check-'+t),'operational-csid']){
          const attempt=data(await tx.get(db.doc(base+'/egs/'+s.egsId+'/enrollmentAttempts/'+key)));
          if(attempt){need(same(attempt,s)&&['held','completed'].includes(attempt.state),'FISCAL_COMMAND_UNAVAILABLE');if(attempt.state==='held')enrollmentHeld=true;}
        }
      }
      const review=cmd.documentId?data(await tx.get(db.doc(base+'/issueReviews/'+cmd.documentId))):null,issue=cmd.documentId?data(await tx.get(db.doc(base+'/issues/'+cmd.documentId))):null,intent=cmd.documentId?data(await tx.get(db.doc(base+'/issueIntents/'+cmd.documentId))):null;
      const sourceMeta=cmd.documentId?data(await tx.get(db.doc('users/'+s.accountUid+'/workspace/meta'))):null;
      const reviewed=Boolean(sourceMeta?.chunkStorage==='period-generations-v1'&&review?.sourceRevision===sourceMeta.revision&&review?.sourceSha256===sourceMeta.sha256&&same(review,s)&&review.state==='approved'&&review.documentId===cmd.documentId&&review.documentRevision===cmd.documentRevision);
      if(issue)need(issue.accountUid===s.accountUid&&issue.workspaceId===s.workspaceId&&issue.egsId===s.egsId&&issue.documentId===cmd.documentId&&statuses.has(issue.status),'FISCAL_COMMAND_UNAVAILABLE');
      if(intent)need(same(intent,s)&&intent.documentId===cmd.documentId&&intent.state==='approved','FISCAL_COMMAND_UNAVAILABLE');
      let response=null,artifacts={xml:false,pdf:false};
      if(op==='document-status'&&issue&&typeof responseStatus==='function'){
        need(intent&&intent.documentRevision===cmd.documentRevision&&intent.sha256===issue.snapshotDigest,'FISCAL_REVIEW_CHANGED');
        response=await responseStatus(tx,s,issue,clock());
        if(output)artifacts=await output.availability(tx,s,issue,cmd.documentRevision);
      }
      return {s,unit,onboarding,reviewed,issue,intent,enrollmentHeld,response,artifacts};
    });
    const {s,unit}=c;
    if(op==='inspect')return {environment:'simulation',workspaceId:s.workspaceId,unitActive:unit.active,onboarding:c.onboarding,enrollmentHeld:c.enrollmentHeld,capabilities:{enrollment:!!enrollment,approval:unit.active,preparation:unit.active&&typeof prepare==='function',submission:unit.active&&typeof submit==='function'}};
    if(['enroll','check','operational'].includes(op)){
      need(!unit.active);need(!c.enrollmentHeld,'ONBOARDING_ATTEMPT_HELD');const method={enroll:'begin',check:'check',operational:'operational'}[op];need(typeof enrollment?.[method]==='function','FISCAL_VERIFICATION_UNAVAILABLE');
      const r=await enrollment[method](identity,{workspaceId:s.workspaceId,egsId:s.egsId,...(op==='enroll'?{otp:cmd.otp}:{expectedVersion:cmd.expectedVersion})});
      return {environment:'simulation',state:r.state,version:r.version};
    }
    if(op==='vat-report'||op==='post-purchase'||op==='post-purchase-cost'||op==='post-purchase-adjustment'||op==='post-purchase-return'||op==='post-supplier-settlement'||op==='post-sale'){
      need(accounting,'FISCAL_ACCOUNTING_UNAVAILABLE');
      if(op==='vat-report')return accounting.report(s,cmd.from,cmd.to);
      if(op==='post-supplier-settlement')return {environment:'simulation',...await accounting.postSupplierSettlement(s,cmd.settlementId)};
      if(op==='post-purchase-return')return {environment:'simulation',...await accounting.postPurchaseReturn(s,cmd.adjustmentId)};
      if(op==='post-purchase-adjustment')return {environment:'simulation',...await accounting.postPurchaseAdjustment(s,cmd.adjustmentId)};
      if(op==='post-purchase-cost')return {environment:'simulation',...await accounting.postPurchaseCost(s,cmd.purchaseId)};
      if(op==='post-purchase')return {environment:'simulation',...await accounting.postPurchase(s,cmd.purchaseId)};
      need(c.issue&&c.intent&&c.intent.documentRevision===cmd.documentRevision&&c.intent.sha256===c.issue.snapshotDigest&&['cleared','reported'].includes(c.issue.status),'FISCAL_POSTING_NOT_ELIGIBLE');
      return {environment:'simulation',documentId:cmd.documentId,...await accounting.postSale(s,cmd.documentId,cmd.documentRevision)};
    }
    if(op==='document-status'){
      if(c.intent)need(c.intent.documentRevision===cmd.documentRevision,'FISCAL_REVIEW_CHANGED');
      return {environment:'simulation',documentId:cmd.documentId,documentRevision:cmd.documentRevision,status:c.issue?.status||(c.intent?'approved':c.reviewed?'reviewed':'not-reviewed'),version:c.issue?.version??null,response:c.response,artifacts:c.artifacts,capabilities:{recovery:typeof recover==='function'&&c.response?.recoveryAvailable===true,reconciliation:typeof reconcile==='function'&&c.issue?.status==='uncertain'&&c.response?.hasReceipt===true,review:unit.active&&typeof reviewDocument==='function',approval:unit.active,preparation:unit.active&&typeof prepare==='function',submission:unit.active&&typeof submit==='function'}};
    }
    if(op==='download'){
      need(output&&c.issue&&c.intent&&c.intent.documentRevision===cmd.documentRevision&&c.intent.sha256===c.issue.snapshotDigest&&['cleared','reported'].includes(c.issue.status),'FISCAL_OUTPUT_UNAVAILABLE');
      return output.read(s,cmd.documentId,cmd.documentRevision,cmd.format);
    }
    if(op==='recover'||op==='reconcile'){
      // A previously submitted immutable issue must remain recoverable even
      // if an unrelated edit has since advanced the workspace manifest.
      need(c.issue&&c.intent&&c.intent.documentRevision===cmd.documentRevision&&c.intent.sha256===c.issue.snapshotDigest&&c.issue.version===cmd.expectedVersion,'FISCAL_STALE_ISSUE');
      const fn=op==='recover'?recover:reconcile;
      need(typeof fn==='function','FISCAL_VERIFICATION_UNAVAILABLE');
      need(c.issue.status===(op==='recover'?'submitting':'uncertain'),'FISCAL_STALE_ISSUE');
      const r=await fn(s,cmd.documentId,cmd.expectedVersion);
      return {environment:'simulation',documentId:cmd.documentId,status:r.status,version:r.version};
    }
    if(op==='review'){
      need(unit.active&&typeof reviewDocument==='function','FISCAL_VERIFICATION_UNAVAILABLE');
      const r=await reviewDocument(identity,{workspaceId:s.workspaceId,egsId:s.egsId,documentId:cmd.documentId,documentRevision:cmd.documentRevision,invoiceType:cmd.invoiceType,supplyDate:cmd.supplyDate,paymentMeans:cmd.paymentMeans});
      return {environment:'simulation',...r};
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

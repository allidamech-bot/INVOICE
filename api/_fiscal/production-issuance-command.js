// Public command boundary: derive the unit from the published invoice branch.
// A request never chooses a taxpayer, environment, credential, amount or EGS.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const id=v=>typeof v==='string'&&ID.test(v);
const version=v=>Number.isSafeInteger(v)&&v>0;
const need=(v,c='FISCAL_ISSUANCE_FORBIDDEN')=>{if(!v)throw Error(c);};
const data=r=>r.exists?r.data():null;
const terminal=s=>['cleared','reported'].includes(s);
const statuses=['queued','submitting','uncertain','retryable','rejected','cleared','reported'];
export function parseProductionIssuanceCommand(v){
  need(v&&typeof v==='object'&&!Array.isArray(v),'INVALID_FISCAL_ISSUANCE');
  const op=v.operation,keys=['operation','workspaceId','documentId','documentRevision'];
  need(['issuance-document-status','issuance-review','issuance-approve','issuance-prepare','issuance-submit','issuance-recover','issuance-reconcile','issuance-post-sale','issuance-download'].includes(op)&&id(v.workspaceId)&&id(v.documentId)&&version(v.documentRevision),'INVALID_FISCAL_ISSUANCE');
  if(op==='issuance-review'){keys.push('invoiceType','supplyDate','paymentMeans');need(['standard','simplified'].includes(v.invoiceType)&&typeof v.supplyDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.supplyDate)&&['10','30','42','48','1'].includes(v.paymentMeans),'INVALID_FISCAL_ISSUANCE');}
  if(['issuance-submit','issuance-recover','issuance-reconcile'].includes(op)){keys.push('expectedVersion');need(version(v.expectedVersion),'INVALID_FISCAL_ISSUANCE');}
  if(op==='issuance-download'){keys.push('format');need(['xml','pdf'].includes(v.format),'INVALID_FISCAL_ISSUANCE');}
  need(Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'INVALID_FISCAL_ISSUANCE');
  return {...v};
}
export function createProductionIssuanceCommand({db,loadWorkspace,issuance,authority,clock=()=>new Date().toISOString()}){
  const configured=Boolean(issuance&&authority&&typeof authority.readUnit==='function'&&['review','approve','prepare','submit','recover','reconcile','postSale','responseStatus'].every(k=>typeof issuance[k]==='function')&&typeof issuance.output?.availability==='function'&&typeof issuance.output?.read==='function');
  const empty=(cmd)=>({environment:'production',documentId:cmd.documentId,documentRevision:cmd.documentRevision,status:'not-reviewed',version:null,response:null,artifacts:{xml:false,pdf:false},capabilities:{review:false,approval:false,preparation:false,submission:false,recovery:false,reconciliation:false},commercialPosted:false});
  return async(identity,input)=>{
    const cmd=parseProductionIssuanceCommand(input),op=cmd.operation;
    need(identity?.role==='owner'&&id(identity.uid));
    const c=await db.runTransaction(async tx=>{
      const w=await loadWorkspace(tx,{accountUid:identity.uid,workspaceId:cmd.workspaceId});
      const docs=(w.documents??[]).filter(d=>d.id===cmd.documentId&&d.workspaceId===cmd.workspaceId);
      need(docs.length===1&&docs[0].revision===cmd.documentRevision,'FISCAL_ISSUANCE_SOURCE_CHANGED');
      const doc=docs[0];
      need(doc.kind==='invoice'&&doc.invoiceMode==='tax'&&['draft','final'].includes(doc.status)&&id(doc.branchId)&&w.branches.some(b=>b.id===doc.branchId&&b.workspaceId===cmd.workspaceId&&b.active===true));
      if(!configured)return null;
      const base='fiscalProductionV1/'+identity.uid+'/workspaces/'+cmd.workspaceId;
      const get=async p=>data(await tx.get(db.doc(base+'/'+p)));
      const [review,intent,issue,posting]=await Promise.all(['issueReviews/','issueIntents/','issues/','accountingEntries/sale-'].map(p=>get(p+doc.id)));
      const matches=r=>r?.environment==='production'&&r.accountUid===identity.uid&&r.workspaceId===cmd.workspaceId&&id(r.egsId);
      for(const row of [review,intent,issue,posting].filter(Boolean))need(matches(row),'FISCAL_ISSUANCE_SOURCE_CHANGED');
      if(intent)need(intent.state==='approved'&&intent.documentId===doc.id&&intent.documentRevision===doc.revision,'FISCAL_ISSUANCE_SOURCE_CHANGED');
      if(issue)need(intent&&issue.documentId===doc.id&&issue.egsId===intent.egsId&&issue.snapshotDigest===intent.sha256&&statuses.includes(issue.status)&&version(issue.version),'FISCAL_ISSUANCE_SOURCE_CHANGED');
      if(posting)need(issue&&terminal(issue.status)&&posting.sourceId===doc.id&&posting.egsId===issue.egsId&&posting.sourceRevision===doc.revision&&posting.uuid===issue.uuid&&posting.snapshotDigest===issue.snapshotDigest&&posting.evidenceDigest===issue.resultDigest&&posting.commercialPosted===true&&doc.status==='final','FISCAL_ISSUANCE_SOURCE_CHANGED');
      if(doc.status==='final'&&!posting)return null; // historical commercial invoices are never reissued
      const candidates=await tx.get(db.collection(base+'/egs').limit(101));
      need(candidates.docs.length<=100,'FISCAL_ISSUANCE_UNAVAILABLE');
      const units=candidates.docs.map(s=>{const r=s.data();need(matches(r)&&r.egsId===s.id,'FISCAL_ISSUANCE_FORBIDDEN');return r;}).filter(r=>r.branchId===doc.branchId&&r.state==='active');
      const frozen=issue?.egsId??intent?.egsId;
      const eligible=frozen?units.filter(r=>r.egsId===frozen):units;
      // Multiple active units require an explicit server-side assignment; never pick one randomly.
      if(eligible.length!==1)return null;
      const scope={accountUid:identity.uid,workspaceId:cmd.workspaceId,egsId:eligible[0].egsId,environment:'production'};
      const unit=await authority.readUnit(tx,scope);
      need(matches(unit)&&unit.egsId===scope.egsId&&unit.branchId===doc.branchId&&unit.state==='active','FISCAL_ISSUANCE_FORBIDDEN');
      const reviewed=Boolean(review?.state==='approved'&&review.egsId===scope.egsId&&review.documentId===doc.id&&review.documentRevision===doc.revision&&review.sourceRevision===w.sourceRevision&&review.sourceSha256===w.sourceSha256&&review.periodGeneration===w.periodGeneration);
      let response=null,artifacts={xml:false,pdf:false};
      if(op==='issuance-document-status'&&issue){
        response=await issuance.responseStatus(tx,scope,issue,clock());
        artifacts=await issuance.output.availability(tx,scope,issue,cmd.documentRevision);
      }
      return {scope,doc,reviewed,intent,issue,posting,response,artifacts};
    });
    if(!c){need(op==='issuance-document-status','FISCAL_ISSUANCE_UNAVAILABLE');return empty(cmd);}
    const {scope,doc,issue,intent,posting}=c;
    const response=()=>({environment:'production',documentId:doc.id,documentRevision:doc.revision,refreshRequired:true});
    const identityArgs={workspaceId:scope.workspaceId,egsId:scope.egsId,documentId:doc.id};
    if(op==='issuance-document-status')return {...empty(cmd),status:issue?.status??(intent?'approved':c.reviewed?'reviewed':'not-reviewed'),version:issue?.version??null,response:c.response,artifacts:c.artifacts,commercialPosted:!!posting,capabilities:{review:doc.status==='draft'&&!intent&&!issue,approval:!intent&&!issue&&c.reviewed,preparation:!!intent&&!issue,submission:issue?.status==='queued',recovery:issue?.status==='submitting'&&c.response?.recoveryAvailable===true,reconciliation:issue?.status==='uncertain'&&c.response?.hasReceipt===true}};
    if(op==='issuance-download'){need(issue&&terminal(issue.status));return issuance.output.read(scope,doc.id,doc.revision,cmd.format);}
    if(op==='issuance-post-sale'){need(issue&&terminal(issue.status));await issuance.postSale(scope,doc.id,doc.revision);return response();}
    if(op==='issuance-submit'||op==='issuance-recover'||op==='issuance-reconcile'){
      const expected={'issuance-submit':'queued','issuance-recover':'submitting','issuance-reconcile':'uncertain'}[op];
      need(issue?.status===expected&&issue.version===cmd.expectedVersion,'FISCAL_ISSUANCE_SOURCE_CHANGED');
      const method={'issuance-submit':'submit','issuance-recover':'recover','issuance-reconcile':'reconcile'}[op];
      await issuance[method](scope,doc.id,issue.version);
      // Authority acceptance is durable even when commercial posting needs
      // reconciliation. Never hide acceptance behind a second exception.
      // Posting is an idempotent explicit action (also available after reload).
      return response();
    }
    need(doc.status==='draft'&&!issue,'FISCAL_ISSUANCE_SOURCE_CHANGED');
    if(op==='issuance-review'){need(!intent);await issuance.review(identity,{...identityArgs,documentRevision:doc.revision,invoiceType:cmd.invoiceType,supplyDate:cmd.supplyDate,paymentMeans:cmd.paymentMeans});}
    else if(op==='issuance-approve'){need(c.reviewed&&!intent);await issuance.approve(identity,identityArgs,{expectedDocumentRevision:doc.revision,requireCommandEnabled:true});}
    else if(op==='issuance-prepare'){need(intent);await issuance.prepare(scope,doc.id);}
    else need(false);
    return response();
  };
}

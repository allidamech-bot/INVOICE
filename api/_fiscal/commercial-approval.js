import {readSimulationContext,simulationBase} from './simulation-scope.js';
import {currentFiscalSource} from './commercial-source.js';
import {hashArtifact} from './fiscal-artifacts.js';
import {readApprovedIntent} from './issue-intent.js';
import {mapCommercialFiscalInvoice} from './commercial-invoice.js';

const ID=/^[A-Za-z0-9_-]{1,128}$/;
function need(ok,code='FISCAL_APPROVAL_FORBIDDEN'){if(!ok)throw Error(code);}
// Internal only: identity is obtained from an authenticated server boundary.
// A request can identify a draft, never supply totals, issuer or approval.
export function createCommercialIssueApproval({db,clock=()=>new Date().toISOString()}){
  need(typeof db?.runTransaction==='function'&&typeof db?.doc==='function'&&typeof clock==='function','FISCAL_APPROVAL_UNAVAILABLE');
  return async function approve(identity,command){
    need(identity?.role==='owner'&&typeof identity.uid==='string'&&ID.test(identity.uid));
    need(command&&Object.keys(command).length===3&&['workspaceId','egsId','documentId'].every(k=>typeof command[k]==='string'&&ID.test(command[k])));
    const {documentId}=command,scope=Object.freeze({environment:'simulation',accountUid:identity.uid,workspaceId:command.workspaceId,egsId:command.egsId});
    const base=simulationBase(scope);
    const at=clock();
    need(typeof at==='string'&&Number.isFinite(Date.parse(at))&&new Date(at).toISOString()===at,'FISCAL_ISSUE_TIME_INVALID');
    const {validateMeta,decodeWorkspace}=await import('../_accounting/period-format.js');
    return db.runTransaction(async tx=>{
      const {unit}=await readSimulationContext(db,tx,scope,{active:true});
      const source=await currentFiscalSource(db,tx,scope,documentId);
      const meta=validateMeta(source.meta);
      // Bound the preview transaction to ~4.3 MB. Never silently truncate.
      need(meta.chunkCount<=24,'FISCAL_SOURCE_SIZE_UNSUPPORTED');
      const chunks=[];
      for(let i=0;i<meta.chunkCount;i++){
        const snap=await tx.get(db.doc(source.root+'/periodGenerations/'+meta.revision+'/chunks/chunk-'+meta.revision+'-'+String(i).padStart(5,'0')));
        chunks.push(snap.exists?snap.data():null);
      }
      const payload=decodeWorkspace(meta,chunks);
      const matches=payload.documents.filter(d=>d.id===documentId);
      need(matches.length===1,'FISCAL_DOCUMENT_NOT_FOUND');
      const doc=matches[0],review=source.review.review,issuer=source.review.issuer;
      need(payload.workspaces.some(w=>w.id===scope.workspaceId)&&payload.branches.some(b=>b.id===doc.branchId&&b.workspaceId===scope.workspaceId&&b.active===true));
      need(!source.closedThrough||doc.issueDate>source.closedThrough,'FISCAL_PERIOD_CLOSED');
      // Require exact persisted source revision and reviewed draft; an altered
      // workspace cannot be substituted with a client-provided document.
      need(doc.revision===source.review.documentRevision&&doc.revision===review.documentRevision,'FISCAL_REVIEW_CHANGED');
      const ref=db.doc(base+'/issueIntents/'+documentId),prior=await tx.get(ref),issued=await tx.get(db.doc(base+'/issues/'+documentId));
      if(prior.exists){
        const old=readApprovedIntent(prior,scope,documentId);
        need(Object.keys(source.binding).every(k=>old.payload.source?.[k]===source.binding[k])&&JSON.stringify(old.payload.document)===JSON.stringify(doc),'FISCAL_APPROVAL_ALREADY_BOUND');
        if(issued.exists)need(issued.data().snapshotDigest===old.digest,'FISCAL_APPROVAL_ALREADY_BOUND');
        return {documentId,status:'approved',documentRevision:doc.revision};
      }
      need(!issued.exists,'FISCAL_APPROVAL_ALREADY_BOUND');
      // Apply all existing commercial-to-UBL gates BEFORE freezing the intent.
      // Placeholder UUID is never reserved or sent; preparation generates it.
      mapCommercialFiscalInvoice({scope,document:doc,issuer,review,identity:{documentId,uuid:'00000000-0000-4000-8000-000000000000',icv:unit.nextIcv,previousInvoiceHash:unit.previousInvoiceHash,generatedAt:at}});
      const bytes=Buffer.from(JSON.stringify({document:doc,issuer,review,generatedAt:at,source:source.binding}));
      need(bytes.length<=512*1024,'FISCAL_INTENT_TOO_LARGE');
      tx.create(ref,{...scope,documentId,state:'approved',documentRevision:doc.revision,generatedAt:at,sha256:hashArtifact(bytes),bytes:bytes.toString('base64')});
      return {documentId,status:'approved',documentRevision:doc.revision};
    });
  };
}

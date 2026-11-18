import {readSimulationContext,simulationBase} from './simulation-scope.js';
import {currentPublishedFiscalSource,reviewDigest} from './commercial-source.js';
import {mapCommercialFiscalInvoice} from './commercial-invoice.js';
import {resolveFiscalCreditOriginal} from './commercial-credit.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const same=(row,s)=>row&&['accountUid','workspaceId','egsId','environment'].every(k=>row[k]===s[k]);
const data=s=>s.exists?s.data():null;
const clean=v=>typeof v==='string'?v.trim():'';
function need(ok,code='FISCAL_REVIEW_REQUIRED'){if(!ok)throw Error(code);}
function legalParty(p,source,s,seller,invoiceType){
  need(same(p,s)&&p.state==='approved'&&p.party&&typeof p.sourceAddress==='string'&&p.sourceAddress.trim()&&clean(source?.addressAr||source?.addressEn)===p.sourceAddress.trim());
  if(!seller)need(Array.isArray(p.allowedInvoiceTypes)&&p.allowedInvoiceTypes.includes(invoiceType)&&p.customerId===source.sourceCustomerId);
  return structuredClone(p.party);
}
export function createCommercialReview({db,clock=()=>new Date().toISOString()}){
  need(typeof db?.runTransaction==='function'&&typeof db?.doc==='function'&&typeof clock==='function','FISCAL_REVIEW_UNAVAILABLE');
  return async function review(identity,cmd){
    need(identity?.role==='owner'&&typeof identity.uid==='string'&&ID.test(identity.uid));
    need(cmd&&Object.keys(cmd).length===7&&['workspaceId','egsId','documentId'].every(k=>typeof cmd[k]==='string'&&ID.test(cmd[k]))&&Number.isSafeInteger(cmd.documentRevision)&&cmd.documentRevision>0&&['standard','simplified'].includes(cmd.invoiceType)&&['10','30','42','48','1'].includes(cmd.paymentMeans)&&typeof cmd.supplyDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(cmd.supplyDate),'INVALID_COMMAND');
    const s={accountUid:identity.uid,workspaceId:cmd.workspaceId,egsId:cmd.egsId,environment:'simulation'},base=simulationBase(s),at=clock();
    const {validateMeta,decodeWorkspace}=await import('../_accounting/period-format.js');
    return db.runTransaction(async tx=>{
      const {unit,workspace}=await readSimulationContext(db,tx,s,{active:true});
      need(workspace.commandsEnabled===true&&workspace.selectedEgsId===s.egsId);
      const source=await currentPublishedFiscalSource(db,tx,s,cmd.documentId),meta=validateMeta(source.meta);
      need(meta.chunkCount<=24,'FISCAL_SOURCE_SIZE_UNSUPPORTED');
      const chunks=[];for(let i=0;i<meta.chunkCount;i++){const row=await tx.get(db.doc(source.root+'/periodGenerations/'+meta.revision+'/chunks/chunk-'+meta.revision+'-'+String(i).padStart(5,'0')));chunks.push(data(row));}
      const payload=decodeWorkspace(meta,chunks),docs=payload.documents.filter(d=>d.id===cmd.documentId);
      need(docs.length===1,'FISCAL_DOCUMENT_NOT_FOUND');const d=docs[0];
      need(d.revision===cmd.documentRevision&&payload.workspaces.some(w=>w.id===s.workspaceId)&&payload.branches.some(b=>b.id===d.branchId&&b.workspaceId===s.workspaceId&&b.active===true),'FISCAL_REVIEW_CHANGED');
      need(!source.closedThrough||d.issueDate>source.closedThrough,'FISCAL_PERIOD_CLOSED');
      const profile=data(await tx.get(db.doc(base+'/egs/'+s.egsId+'/enrollment/approved'))),sellerProfile=data(await tx.get(db.doc(base+'/sellerProfile/current')));
      need(same(profile,s)&&profile.state==='approved'&&profile.issuer&&unit.issuerVat===profile.issuer.vatNumber&&unit.operationalCredentialRef,'FISCAL_ISSUER_NOT_VERIFIED');
      const seller=legalParty(sellerProfile,d.companySnapshot,s,true,cmd.invoiceType);
      need(seller.vatNumber===unit.issuerVat,'FISCAL_ISSUER_NOT_VERIFIED');
      let buyer=null;
      if(d.customerSnapshot){const customerId=d.customerSnapshot.sourceCustomerId;need(typeof customerId==='string'&&ID.test(customerId));const p=data(await tx.get(db.doc(base+'/buyerProfiles/'+customerId)));buyer=legalParty(p,d.customerSnapshot,s,false,cmd.invoiceType);}
      else need(cmd.invoiceType==='simplified'&&sellerProfile.allowAnonymousSimplified===true);
      // Zero-rate/exemption/out-of-scope classification is an independent,
      // revision-bound private decision; never infer it from a disabled tax box.
      const classification=data(await tx.get(db.doc(base+'/taxClassifications/'+d.id)));
      let tax={taxCategory:'S',taxRate:'15'};
      if(classification){
        need(same(classification,s)&&classification.state==='approved'&&classification.documentId===d.id&&classification.documentRevision===d.revision&&classification.sourceRevision===meta.revision&&classification.sourceSha256===meta.sha256&&['Z','E','O'].includes(classification.category)&&classification.rate==='0'&&typeof classification.evidenceDigest==='string'&&/^[a-f0-9]{64}$/.test(classification.evidenceDigest),'FISCAL_TAX_REVIEW_REQUIRED');
        tax={taxCategory:classification.category,taxRate:'0',reasonCode:classification.reasonCode,reasonText:classification.reasonText,classificationDigest:classification.evidenceDigest};
      }
      let correction={};
      if(d.role==='credit-note'){
        const original=await resolveFiscalCreditOriginal(db,tx,s,d);
        const remarks=typeof d.terms?.remarks==='string'?d.terms.remarks:'';
        const reasons=remarks.split('\n').filter(x=>x.startsWith('Reason / السبب: '));
        need(reasons.length===1&&reasons[0].slice(15).trim()&&remarks.includes('VAT treatment: source invoice tax / المعالجة الضريبية: ضريبة الفاتورة الأصلية')&&!remarks.includes('VAT treatment: unchanged VAT'),'FISCAL_CORRECTION_REASON_REQUIRED');
        correction={...original,correctionReason:reasons[0].slice('Reason / السبب: '.length).trim()};
      }
      const review={...s,sourceDocumentId:d.id,branchId:d.branchId,documentRevision:d.revision,invoiceType:cmd.invoiceType,seller,buyer,...tax,...correction,supplyDate:cmd.supplyDate,paymentMeans:cmd.paymentMeans};
      const ref=db.doc(base+'/issueReviews/'+d.id),prior=data(await tx.get(ref)),intent=data(await tx.get(db.doc(base+'/issueIntents/'+d.id))),issue=data(await tx.get(db.doc(base+'/issues/'+d.id)));
      const record={...s,state:'approved',documentId:d.id,sourceRevision:meta.revision,sourceSha256:meta.sha256,periodGeneration:source.control.generation,documentRevision:d.revision,issuer:profile.issuer,review};
      // Review classification and statutory details are verified against the
      // original draft. The browser cannot supply addresses, amounts or tax.
      mapCommercialFiscalInvoice({scope:s,document:d,issuer:record.issuer,review,identity:{documentId:d.id,uuid:'00000000-0000-4000-8000-000000000000',icv:unit.nextIcv,previousInvoiceHash:unit.previousInvoiceHash,generatedAt:at}});
      if(intent||issue)need(prior&&reviewDigest(prior)===reviewDigest(record),'FISCAL_APPROVAL_ALREADY_BOUND');
      if(prior&&reviewDigest(prior)===reviewDigest(record))return {documentId:d.id,documentRevision:d.revision,status:'reviewed'};
      if(prior)tx.update(ref,record);else tx.create(ref,record);
      return {documentId:d.id,documentRevision:d.revision,status:'reviewed'};
    });
  };
}

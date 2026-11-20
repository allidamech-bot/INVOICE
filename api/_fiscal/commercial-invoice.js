import {assertFiscalIssuerIdentity} from '../../dist/src/lib/fiscal-issuer.js';
import {resolveFiscalRoute} from '../../dist/src/lib/fiscal-routing.js';
import {calculateTotals,normalizeDecimalInput,isFinancialDecimalInput,decimalToScaled} from '../../dist/src/lib/money.js';
import {buildFiscalCandidate} from './ubl-draft.js';

// Translate the existing commercial document, not a second editable invoice.
// Only verified server-resolved statutory fields may fill its missing fields.
// Unsupported or conflicting pricing and tax cases are refused, never guessed.
const country=v=>['SA','SAU','SAUDI ARABIA','KINGDOM OF SAUDI ARABIA','السعودية','المملكة العربية السعودية'].includes(String(v??'').trim().toUpperCase());
const unitCodes=Object.freeze({UNIT:'EA',PCS:'PCE',PC:'PCE',PCE:'PCE',EA:'EA',KG:'KGM',KGM:'KGM',L:'LTR',LTR:'LTR',M:'MTR',MTR:'MTR',H:'HUR',HUR:'HUR'});
const trim=v=>typeof v==='string'?v.trim():'';
function require(ok,code){if(!ok)throw Error(code);}
function dec(v,scale=4){
  require(typeof v==='string'&&isFinancialDecimalInput(v),'INVALID_COMMERCIAL_AMOUNT');
  const n=normalizeDecimalInput(v);
  require(/^\d+(?:\.\d*)?$|^\.\d+$/.test(n),'INVALID_COMMERCIAL_AMOUNT');
  let [w='',f='']=n.split('.');
  require(f.replace(/0+$/,'').length<=scale,'UNSUPPORTED_COMMERCIAL_PRECISION');
  w=(w||'0').replace(/^0+(?=\d)/,'');f=f.replace(/0+$/,'');
  require(w.length<=18,'INVALID_COMMERCIAL_AMOUNT');
  return w+(f?'.'+f:'');
}
function sameParty(source,verified,seller){
  require(source&&verified&&country(source.country)&&verified.country==='SA','FISCAL_PARTY_MISMATCH');
  const legal=trim(seller?source.nameAr:source.companyNameAr)||trim(seller?source.nameEn:source.companyNameEn);
  require(legal&&legal===trim(verified.name)&&trim(seller?source.vatNumber:source.vatTaxNumber)===verified.vatNumber&&trim(source.commercialRegistration)===verified.crn&&trim(source.city)===trim(verified.city),'FISCAL_PARTY_MISMATCH');
}
export function mapCommercialFiscalInvoice({scope,document,issuer,review,identity}){
  const d=document,r=review;
  require(['simulation','production'].includes(scope?.environment)&&d?.id===identity?.documentId&&d.workspaceId===scope.workspaceId&&d.branchId===r?.branchId&&Number.isSafeInteger(d.revision)&&d.revision>=1&&d.revision===r.documentRevision,'FISCAL_DOCUMENT_SCOPE_MISMATCH');
  require(d.invoiceMode===undefined||d.invoiceMode==='tax','FISCAL_ORDINARY_INVOICE_NOT_ELIGIBLE');
  require(!d.fiscalAdvance&&d.kind==='invoice'&&['standard','credit-note'].includes(d.role)&&d.status==='draft'&&d.lifecycleStatus==='active'&&!d.voidedAt&&typeof d.currency==='string'&&!d.letter,'FISCAL_COMMERCIAL_CASE_UNSUPPORTED');
  require(r?.sourceDocumentId===d.id&&r.accountUid===scope.accountUid&&r.workspaceId===scope.workspaceId&&r.egsId===scope.egsId,'FISCAL_REVIEW_SCOPE_MISMATCH');
  assertFiscalIssuerIdentity(issuer,scope,d.issueDate);
  require(issuer.issuerCountry==='SA'&&issuer.saRegime==='phase-2'&&issuer.vatNumber===r.seller?.vatNumber&&trim(issuer.legalName)===trim(r.seller?.name),'FISCAL_ISSUER_NOT_VERIFIED');
  const scenario=r.scenario;
  require(scenario===undefined||scenario&&(d.role==='standard'&&['debit-note','advance-receipt','advance-settlement'].includes(scenario.kind)||d.role==='credit-note'&&scenario.kind==='advance-refund')&&d.currency==='SAR'&&r.invoiceType==='standard'&&r.fiscalContext===undefined,'FISCAL_SPECIAL_SCENARIO_INVALID');
  const kind=d.role==='credit-note'?'credit-note':scenario?.kind==='debit-note'?'debit-note':scenario?.kind==='advance-receipt'?'prepayment':'invoice';
  require(kind==='debit-note'?!!r.original&&r.originalDocumentId===scenario.originalDocumentId&&typeof r.correctionReason==='string'&&r.correctionReason.trim().length>0&&!d.creditForId:kind==='credit-note'?typeof d.creditForId==='string'&&d.creditForId!==d.id&&r.originalDocumentId===d.creditForId&&r.original?.number===d.creditForNumber&&typeof r.correctionReason==='string'&&r.correctionReason.trim().length>0:!d.creditForId&&!r.original&&!r.originalDocumentId&&!r.correctionReason,'FISCAL_ORIGINAL_REQUIRED');
  const route=resolveFiscalRoute(kind==='prepayment'?'invoice':kind,issuer,r.invoiceType);
  require(route.route==='sa-clearance'||route.route==='sa-reporting','FISCAL_ROUTE_NOT_ELIGIBLE');
  sameParty(d.companySnapshot,r.seller,true);
  const context={};
  if(r.fiscalContext!==undefined){
    require(kind==='invoice'&&r.invoiceType==='standard'&&r.fiscalContext&&typeof r.fiscalContext==='object'&&Object.keys(r.fiscalContext).length>0&&Object.keys(r.fiscalContext).every(k=>['rate','exportClassification','special'].includes(k)),'UNSUPPORTED_COMMERCIAL_FISCAL_CONTEXT');
    for(const key of Object.keys(r.fiscalContext)){
      const value=r.fiscalContext[key];require(value&&typeof value==='object'&&!Array.isArray(value)&&!Object.hasOwn(value,'uuid'),'INVALID_COMMERCIAL_FISCAL_CONTEXT');
      context[key]={...structuredClone(value),uuid:identity.uuid};
    }
  }
  require(d.currency==='SAR'||(kind==='invoice'&&r.invoiceType==='standard'&&context.rate),'FISCAL_FX_EVIDENCE_REQUIRED');
  if(r.buyer===null){require(r.invoiceType==='simplified'&&d.customerSnapshot===null,'FISCAL_BUYER_REQUIRED');}
  else if(context.exportClassification){
    const customer=d.customerSnapshot,verified=r.buyer,legal=trim(customer?.companyNameAr)||trim(customer?.companyNameEn);
    // Match the original structured foreign party. A foreign country or
    // foreign currency alone never establishes export classification.
    require(customer&&verified.country!=='SA'&&trim(customer.country).toUpperCase()===verified.country&&legal&&legal===trim(verified.name)&&trim(customer.city)===trim(verified.city)&&['TIN','CRN'].includes(verified.otherIdScheme)&&trim(verified.otherId)===(verified.otherIdScheme==='TIN'?trim(customer.vatTaxNumber):trim(customer.commercialRegistration)),'FISCAL_PARTY_MISMATCH');
  }else sameParty(d.customerSnapshot,r.buyer,false);
  const cls={category:r.taxCategory,rate:r.taxRate,...(r.taxCategory==='S'?{}:{reasonCode:r.reasonCode,reasonText:r.reasonText})};
  require(r.taxCategory==='S'?r.taxRate==='15'&&d.adjustments?.taxEnabled===true&&dec(d.adjustments.taxPercent)==='15': ['Z','E','O'].includes(r.taxCategory)&&r.taxRate==='0'&&typeof r.classificationDigest==='string'&&/^[a-f0-9]{64}$/.test(r.classificationDigest)&&(!d.adjustments?.taxEnabled||dec(d.adjustments.taxPercent)==='0'),'FISCAL_TAX_REVIEW_REQUIRED');
  if(kind==='credit-note'||kind==='debit-note')require(r.original?.mode===r.invoiceType&&r.originalTax?.category===r.taxCategory&&r.originalTax?.rate===r.taxRate&&(r.taxCategory==='S'||r.originalTax.reasonCode===r.reasonCode),'FISCAL_CORRECTION_TAX_MISMATCH');
  require(Array.isArray(d.items)&&d.items.length>0&&d.items.length<=500,'INVALID_COMMERCIAL_LINES');
  const lines=d.items.map(l=>{
    const code=unitCodes[trim(l.unit).toUpperCase()];
    require(code,'FISCAL_UNIT_UNSUPPORTED');
    return {id:l.id,name:trim(l.descriptionAr)||trim(l.descriptionEn),quantity:dec(l.quantity),unitNetPrice:dec(l.unitPrice),unitCode:code,...cls};
  });
  const a=d.adjustments;
  require(typeof a.discountEnabled==='boolean'&&typeof a.shippingEnabled==='boolean'&&typeof a.otherChargesEnabled==='boolean'&&(!a.discountEnabled||['fixed','percent'].includes(a.discountMode)),'INVALID_COMMERCIAL_ADJUSTMENTS');
  if(a.discountEnabled){dec(a.discountValue,a.discountMode==='fixed'?2:4);if(a.discountMode==='percent')require(decimalToScaled(dec(a.discountValue),4)<=1000000n,'INVALID_COMMERCIAL_DISCOUNT');}
  if(a.shippingEnabled)dec(a.shipping,2);
  if(a.otherChargesEnabled)require(dec(a.otherCharges,2)==='0','FISCAL_OTHER_CHARGE_REVIEW_REQUIRED');
  const commercial=calculateTotals(d.items,a),adjustments=[];
  if(a.discountEnabled&&a.discountMode==='fixed')require(decimalToScaled(dec(a.discountValue,2),2)<=decimalToScaled(commercial.subtotal,2),'INVALID_COMMERCIAL_DISCOUNT');
  if(commercial.discount!=='0.00')adjustments.push({kind:'allowance',amount:commercial.discount,...cls,adjustmentReasonCode:'95',adjustmentReasonText:'Discount'});
  if(commercial.shipping!=='0.00')adjustments.push({kind:'charge',amount:commercial.shipping,...cls,adjustmentReasonCode:'FC',adjustmentReasonText:'Freight'});
  const issueAt=new Date(identity.generatedAt);
  require(Number.isFinite(issueAt.getTime())&&issueAt.toISOString()===identity.generatedAt&&d.issueDate===identity.generatedAt.slice(0,10),'FISCAL_ISSUE_DATE_MISMATCH');
  const invoice={currency:d.currency,mode:r.invoiceType,kind,uuid:identity.uuid,icv:identity.icv,previousInvoiceHash:identity.previousInvoiceHash,number:d.number,issueDate:d.issueDate,issueTime:identity.generatedAt.slice(11,19),supplyDate:r.supplyDate,paymentMeans:r.paymentMeans,seller:structuredClone(r.seller),buyer:structuredClone(r.buyer),lines,...(adjustments.length?{adjustments}:{}),...(['credit-note','debit-note'].includes(kind)?{original:structuredClone(r.original),correctionReason:r.correctionReason}:{})};
  if(scenario?.kind==='debit-note'||scenario?.kind==='advance-receipt'){
    require(typeof scenario.evidenceDigest==='string'&&/^[a-f0-9]{64}$/.test(scenario.evidenceDigest)&&scenario.gross===commercial.grandTotal&&commercial.grandTotal!=='0.00','FISCAL_SCENARIO_EVIDENCE_MISMATCH');
  }
  if(scenario?.kind==='advance-refund')require(scenario.receiptId===d.creditForId&&typeof scenario.evidenceDigest==='string'&&/^[a-f0-9]{64}$/.test(scenario.evidenceDigest)&&typeof scenario.cashDigest==='string'&&/^[a-f0-9]{64}$/.test(scenario.cashDigest)&&typeof scenario.treasuryEntryId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(scenario.treasuryEntryId)&&d.items.every(l=>l.stockTreatment==='non-stock'&&!l.savedItemId)&&scenario.gross===commercial.grandTotal,'FISCAL_ADVANCE_REFUND_EVIDENCE_MISMATCH');
  if(scenario?.kind==='advance-receipt'){
    delete invoice.supplyDate;
    context.prepayment={kind:'receipt',uuid:identity.uuid,receivedAt:scenario.receivedAt,receivedGross:scenario.gross,evidenceDigest:scenario.evidenceDigest};
  }
  if(scenario?.kind==='advance-settlement'){
    require(Array.isArray(scenario.references)&&scenario.references.length>0&&scenario.references.every(x=>x.category===r.taxCategory&&x.rate===r.taxRate),'FISCAL_ADVANCE_CLASS_MISMATCH');
    context.prepayment={kind:'adjustment',uuid:identity.uuid,references:structuredClone(scenario.references)};
  }
  const candidate=buildFiscalCandidate(invoice,context);
  const t=candidate.totals;
  require(t.lineNetTotal===commercial.subtotal&&t.documentAllowances===commercial.discount&&t.documentCharges===commercial.shipping&&t.vatTotal===commercial.tax&&t.taxInclusiveTotal===commercial.grandTotal,'FISCAL_COMMERCIAL_TOTAL_MISMATCH');
  if(scenario?.kind==='advance-refund')require(scenario.net===t.taxExclusiveTotal&&scenario.vat===t.vatTotal&&scenario.gross===t.taxInclusiveTotal,'FISCAL_ADVANCE_REFUND_EVIDENCE_MISMATCH');
  require(decimalToScaled(t.taxInclusiveTotal,2)>0n||kind==='invoice','FISCAL_ZERO_CORRECTION');
  return {invoice,candidate,commercial,context,mode:route.route==='sa-clearance'?'clearance':'reporting'};
}

import {assertFiscalIssuerIdentity} from '../../dist/src/lib/fiscal-issuer.js';
import {resolveFiscalRoute} from '../../dist/src/lib/fiscal-routing.js';
import {calculateTotals,normalizeDecimalInput,isFinancialDecimalInput} from '../../dist/src/lib/money.js';
import {buildFiscalCandidate} from './ubl-draft.js';

// Translate the existing commercial document, not a second editable invoice.
// Only verified server-resolved statutory fields may fill its missing fields.
// Unsupported or conflicting pricing and tax cases are refused, never guessed.
const country=v=>['SA','SAU','SAUDI ARABIA','KINGDOM OF SAUDI ARABIA','السعودية','المملكة العربية السعودية'].includes(String(v??'').trim().toUpperCase());
const unitCodes=Object.freeze({PCS:'PCE',PC:'PCE',PCE:'PCE',EA:'EA',KG:'KGM',KGM:'KGM',L:'LTR',LTR:'LTR',M:'MTR',MTR:'MTR',H:'HUR',HUR:'HUR'});
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
  require(scope?.environment==='simulation'&&d?.id===identity?.documentId&&d.workspaceId===scope.workspaceId&&d.branchId===r?.branchId&&Number.isSafeInteger(d.revision)&&d.revision>=1&&d.revision===r.documentRevision,'FISCAL_DOCUMENT_SCOPE_MISMATCH');
  require(d.kind==='invoice'&&d.role==='standard'&&d.status==='draft'&&d.lifecycleStatus==='active'&&!d.creditForId&&!d.voidedAt&&d.currency==='SAR'&&!d.letter,'FISCAL_COMMERCIAL_CASE_UNSUPPORTED');
  require(r?.sourceDocumentId===d.id&&r.accountUid===scope.accountUid&&r.workspaceId===scope.workspaceId&&r.egsId===scope.egsId,'FISCAL_REVIEW_SCOPE_MISMATCH');
  assertFiscalIssuerIdentity(issuer,scope,d.issueDate);
  require(issuer.issuerCountry==='SA'&&issuer.saRegime==='phase-2'&&issuer.vatNumber===r.seller?.vatNumber&&trim(issuer.legalName)===trim(r.seller?.name),'FISCAL_ISSUER_NOT_VERIFIED');
  const route=resolveFiscalRoute('invoice',issuer,r.invoiceType);
  require(route.route==='sa-clearance'||route.route==='sa-reporting','FISCAL_ROUTE_NOT_ELIGIBLE');
  sameParty(d.companySnapshot,r.seller,true);
  if(r.buyer===null){require(r.invoiceType==='simplified'&&d.customerSnapshot===null,'FISCAL_BUYER_REQUIRED');}
  else sameParty(d.customerSnapshot,r.buyer,false);
  require(r.taxCategory==='S'&&r.taxRate==='15'&&d.adjustments?.taxEnabled===true&&dec(d.adjustments.taxPercent)==='15','FISCAL_TAX_REVIEW_REQUIRED');
  require(Array.isArray(d.items)&&d.items.length>0&&d.items.length<=500,'INVALID_COMMERCIAL_LINES');
  const lines=d.items.map(l=>{
    const code=unitCodes[trim(l.unit).toUpperCase()];
    require(code,'FISCAL_UNIT_UNSUPPORTED');
    return {id:l.id,name:trim(l.descriptionAr)||trim(l.descriptionEn),quantity:dec(l.quantity),unitNetPrice:dec(l.unitPrice),unitCode:code,category:'S',rate:'15'};
  });
  const a=d.adjustments;
  require(typeof a.discountEnabled==='boolean'&&typeof a.shippingEnabled==='boolean'&&typeof a.otherChargesEnabled==='boolean'&&(!a.discountEnabled||['fixed','percent'].includes(a.discountMode)),'INVALID_COMMERCIAL_ADJUSTMENTS');
  if(a.discountEnabled){dec(a.discountValue,a.discountMode==='fixed'?2:4);if(a.discountMode==='percent')require(Number(dec(a.discountValue))<=100,'INVALID_COMMERCIAL_DISCOUNT');}
  if(a.shippingEnabled)dec(a.shipping,2);
  if(a.otherChargesEnabled)require(dec(a.otherCharges,2)==='0','FISCAL_OTHER_CHARGE_REVIEW_REQUIRED');
  const commercial=calculateTotals(d.items,a),adjustments=[];
  if(a.discountEnabled&&a.discountMode==='fixed')require(Number(dec(a.discountValue,2))<=Number(commercial.subtotal),'INVALID_COMMERCIAL_DISCOUNT');
  if(commercial.discount!=='0.00')adjustments.push({kind:'allowance',amount:commercial.discount,category:'S',rate:'15',adjustmentReasonCode:'95',adjustmentReasonText:'Discount'});
  if(commercial.shipping!=='0.00')adjustments.push({kind:'charge',amount:commercial.shipping,category:'S',rate:'15',adjustmentReasonCode:'FC',adjustmentReasonText:'Freight'});
  const issueAt=new Date(identity.generatedAt);
  require(Number.isFinite(issueAt.getTime())&&issueAt.toISOString()===identity.generatedAt&&d.issueDate===identity.generatedAt.slice(0,10),'FISCAL_ISSUE_DATE_MISMATCH');
  const invoice={currency:'SAR',mode:r.invoiceType,kind:'invoice',uuid:identity.uuid,icv:identity.icv,previousInvoiceHash:identity.previousInvoiceHash,number:d.number,issueDate:d.issueDate,issueTime:identity.generatedAt.slice(11,19),supplyDate:r.supplyDate,paymentMeans:r.paymentMeans,seller:structuredClone(r.seller),buyer:structuredClone(r.buyer),lines,...(adjustments.length?{adjustments}:{})};
  const candidate=buildFiscalCandidate(invoice);
  const t=candidate.totals;
  require(t.lineNetTotal===commercial.subtotal&&t.documentAllowances===commercial.discount&&t.documentCharges===commercial.shipping&&t.vatTotal===commercial.tax&&t.taxInclusiveTotal===commercial.grandTotal,'FISCAL_COMMERCIAL_TOTAL_MISMATCH');
  return {invoice,candidate,commercial,mode:route.route==='sa-clearance'?'clearance':'reporting'};
}

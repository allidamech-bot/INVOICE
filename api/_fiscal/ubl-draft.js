import {calculateFiscalTax} from '../../dist/src/lib/fiscal-tax.js';
import {FIRST_PREVIOUS_INVOICE_HASH} from '../../dist/src/lib/fiscal-issuance.js';

import {fiscalDocumentContext} from './fiscal-document-context.js';
import {resolvePrepayment} from './prepayment.js';
import {resolveSpecialFiscalContext} from './special-fiscal-context.js';

// Restricted unsigned UBL candidate writer; existing domestic API is unchanged.
// Extended API requires trusted server-resolved FX/export/prepayment context.
// Never send its output to a buyer or authority before a trusted SDK gate.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VAT=/^3[0-9]{13}3$/;
function safe(value,max=256){
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value)||Buffer.from(value,'utf8').toString('utf8')!==value)throw Error('INVALID_XML_TEXT');
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
}
const e=(name,value)=>'<cbc:'+name+'>'+safe(value)+'</cbc:'+name+'>';
const monetary=(name,value,currency)=>'<cbc:'+name+' currencyID="'+currency+'">'+safe(value)+'</cbc:'+name+'>';
const scheme='<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>';
// Explicitly restricted domestic subset of ZATCA v1.2 section 11.2.4.
// Export, citizen-specific and other special transactions require distinct subtype mapping.
const exemptionCodes=Object.freeze({Z:['VATEX-SA-35','VATEX-SA-36'],E:['VATEX-SA-29','VATEX-SA-29-7','VATEX-SA-30'],O:['VATEX-SA-OOS']});
function validateClass(v, approvedExtra=[]){
  if(v.category==='S'){
    if(v.rate!=='15'||v.reasonCode!==undefined||v.reasonText!==undefined)throw Error('UNSUPPORTED_VAT_CLASS');
  }else{
    if(!Object.hasOwn(exemptionCodes,v.category)||v.rate!=='0'||!(exemptionCodes[v.category].includes(v.reasonCode)||(v.category==='Z'&&approvedExtra.includes(v.reasonCode))))throw Error('UNSUPPORTED_VAT_CLASS');
    safe(v.reasonText);
  }
}
function category(name,v,breakdown=false){
  return '<cac:'+name+'>'+e('ID',v.category)+e('Percent',v.rate)
    +(breakdown&&v.category!=='S'?e('TaxExemptionReasonCode',v.reasonCode)+e('TaxExemptionReason',v.reasonText):'')+scheme+'</cac:'+name+'>';
}
function decimalMoney(value){
  if(typeof value!=='string'||!/^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,2})?$/.test(value))throw Error('INVALID_ADJUSTMENT_AMOUNT');
  const [whole,fraction='']=value.split('.');return whole+'.'+fraction.padEnd(2,'0');
}
function allowanceCharge(kind,value,reasonCode,reasonText,cls,amount){
  const allowed=kind==='allowance'?['95']:kind==='charge'?['FC']:[];
  if(!allowed.includes(reasonCode))throw Error('UNSUPPORTED_ADJUSTMENT_REASON');
  const money=decimalMoney(value);if(money==='0.00')throw Error('ZERO_ADJUSTMENT');
  return '<cac:AllowanceCharge>'+e('ChargeIndicator',kind==='charge'?'true':'false')+e('AllowanceChargeReasonCode',reasonCode)+e('AllowanceChargeReason',reasonText)+amount('Amount',money)+(cls?category('TaxCategory',cls):'')+'</cac:AllowanceCharge>';
}
function party(p,role){
  if(!p||p.country!=='SA'||Object.keys(p).some(key=>!['country','vatNumber','crn','building','postal','street','district','city','name'].includes(key))||typeof p.vatNumber!=='string'||!VAT.test(p.vatNumber)||typeof p.crn!=='string'||!/^[0-9]{10}$/.test(p.crn)
    ||typeof p.building!=='string'||!/^[0-9]{4}$/.test(p.building)||typeof p.postal!=='string'||!/^[0-9]{5}$/.test(p.postal))throw Error('INVALID_PARTY');
  return '<cac:'+role+'><cac:Party><cac:PartyIdentification><cbc:ID schemeID="CRN">'+safe(p.crn)+'</cbc:ID></cac:PartyIdentification>'
    +'<cac:PostalAddress>'+e('StreetName',p.street)+e('BuildingNumber',p.building)+e('CitySubdivisionName',p.district)+e('CityName',p.city)+e('PostalZone',p.postal)
    +'<cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country></cac:PostalAddress>'
    +'<cac:PartyTaxScheme>'+e('CompanyID',p.vatNumber)+scheme+'</cac:PartyTaxScheme><cac:PartyLegalEntity>'+e('RegistrationName',p.name)+'</cac:PartyLegalEntity></cac:Party></cac:'+role+'>';
}
// Restricted ISO 3166-1 subset and buyer IDs for the standard export path.
// No Saudi buyer VAT number or guessed other identification.
function citizenBuyer(p){
  if(!p||p.country!=='SA'||Object.keys(p).some(k=>!['country','nationalId','name','building','postal','street','district','city'].includes(k))||typeof p.nationalId!=='string'||!/^1[0-9]{9}$/.test(p.nationalId)||!/^[0-9]{4}$/.test(p.building)||!/^[0-9]{5}$/.test(p.postal))throw Error('INVALID_CITIZEN_BUYER');
  return '<cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="NAT">'+safe(p.nationalId)+'</cbc:ID></cac:PartyIdentification>'
    +'<cac:PostalAddress>'+e('StreetName',p.street)+e('BuildingNumber',p.building)+e('CitySubdivisionName',p.district)+e('CityName',p.city)+e('PostalZone',p.postal)
    +'<cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country></cac:PostalAddress>'
    +'<cac:PartyLegalEntity>'+e('RegistrationName',p.name)+'</cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>';
}
function exportBuyer(p){
  if(!p||!['TR','US','GB','AE','DE','FR','NL','CA','EG','JO','SY','QA','KW','BH','OM','CN','JP','IN'].includes(p.country)
    ||Object.keys(p).some(k=>!['country','otherId','otherIdScheme','street','city','postal','name'].includes(k))
    ||!['TIN','CRN','PAS','OTH'].includes(p.otherIdScheme)||typeof p.otherId!=='string'||!/^[A-Za-z0-9]{1,64}$/.test(p.otherId))throw Error('INVALID_EXPORT_BUYER');
  return '<cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="'+p.otherIdScheme+'">'+safe(p.otherId)+'</cbc:ID></cac:PartyIdentification>'
    +'<cac:PostalAddress>'+e('StreetName',p.street)+e('CityName',p.city)+(p.postal===undefined?'':e('PostalZone',p.postal))
    +'<cac:Country>'+e('IdentificationCode',p.country)+'</cac:Country></cac:PostalAddress>'
    +'<cac:PartyLegalEntity>'+e('RegistrationName',p.name)+'</cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>';
}
function date(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('INVALID_DATE');
  return value;
}
export function buildFiscalCandidate(input,context={}){
  if(!input||Object.keys(input).some(key=>!['currency','mode','kind','uuid','icv','previousInvoiceHash','number','issueDate','issueTime','supplyDate','paymentMeans','seller','buyer','lines','original','correctionReason','adjustments'].includes(key))||!['standard','simplified'].includes(input.mode)||!['invoice','credit-note','debit-note','prepayment'].includes(input.kind)||input.prepaid!==undefined||input.discount!==undefined||input.shipping!==undefined||input.fx!==undefined)throw Error('UNSUPPORTED_XML_CASE');
  if(typeof input.uuid!=='string'||!UUID.test(input.uuid)||typeof input.icv!=='string'||typeof input.previousInvoiceHash!=='string')throw Error('INVALID_XML_IDENTITY');
  if(!/^[1-9][0-9]{0,17}$/.test(input.icv)||(input.icv==='1'?input.previousInvoiceHash!==FIRST_PREVIOUS_INVOICE_HASH:!/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(input.previousInvoiceHash)))throw Error('INVALID_CHAIN');
  date(input.issueDate);
  const {prepayment,special,...fiscalContext}=context;
  const profile=fiscalDocumentContext(input,fiscalContext);
  if(prepayment!==undefined&&profile.exportCode)throw Error('UNSUPPORTED_EXPORT_PREPAYMENT');
  const amount=(name,value)=>monetary(name,value,profile.currency);
  if(typeof input.issueTime!=='string'||!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(input.issueTime)||!['10','30','42','48','1'].includes(input.paymentMeans))throw Error('INVALID_ISSUE_DETAILS');
  if(input.kind==='prepayment'){if(input.supplyDate!==undefined)throw Error('UNEXPECTED_SUPPLY_DATE');}
  else if(date(input.supplyDate)>input.issueDate)throw Error('UNSUPPORTED_SUPPLY_DATE');
  if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>500||input.lines.some(l=>!l||Object.keys(l).some(key=>!['id','name','quantity','unitNetPrice','unitCode','category','rate','reasonCode','reasonText','allowance','allowanceReasonCode','allowanceReasonText'].includes(key))||typeof l.unitCode!=='string'||!['PCE','KGM','LTR','MTR','HUR','EA'].includes(l.unitCode)))throw Error('UNSUPPORTED_XML_LINE');
  if(special!==undefined&&prepayment!==undefined)throw Error('UNSUPPORTED_SPECIAL_PREPAYMENT');
  const specialProfile=resolveSpecialFiscalContext(input,special,profile.exportCode);
  const reasons=new Map(), classes=new Set();
  function register(v){
    if(profile.exportCode){
      const approvedText=profile.exportCode==='VATEX-SA-32'?['Export of goods','صادرات السلع من المملكة']:['Export of services','صادرات الخدمات من المملكة'];
      if(v.category!=='Z'||v.rate!=='0'||v.reasonCode!==profile.exportCode||!approvedText.includes(v.reasonText))throw Error('EXPORT_CLASSIFICATION_MISMATCH');
    }else validateClass(v,specialProfile.exemptionCodes);
    classes.add(v.category);
    if(v.category!=='S'){
      const old=reasons.get(v.category);
      if(old&&(old.reasonCode!==v.reasonCode||old.reasonText!==v.reasonText))throw Error('CONFLICTING_VAT_REASONS');
      reasons.set(v.category,{reasonCode:v.reasonCode,reasonText:v.reasonText});
    }
  }
  const lineAllowances=input.lines.map(line=>{
    register(line);
    if(line.allowance===undefined){
      if(line.allowanceReasonCode!==undefined||line.allowanceReasonText!==undefined)throw Error('UNEXPECTED_ALLOWANCE_REASON');
      return '';
    }
    return allowanceCharge('allowance',line.allowance,line.allowanceReasonCode,line.allowanceReasonText,undefined,amount);
  });
  if(input.adjustments!==undefined&&(!Array.isArray(input.adjustments)||!input.adjustments.length||input.adjustments.length>500))throw Error('INVALID_DOCUMENT_ADJUSTMENTS');
  const adjustmentXml=(input.adjustments??[]).map(a=>{
    if(!a||Object.keys(a).some(k=>!['kind','amount','category','rate','reasonCode','reasonText','adjustmentReasonCode','adjustmentReasonText'].includes(k)))throw Error('INVALID_DOCUMENT_ADJUSTMENT');
    register(a);
    return allowanceCharge(a.kind,a.amount,a.adjustmentReasonCode,a.adjustmentReasonText,a,amount);
  }).join('');
  // Do not claim the more complex mixed out-of-scope scenario is supported.
  if(classes.has('O')&&classes.size>1)throw Error('UNSUPPORTED_MIXED_OUT_OF_SCOPE');
  const sellerXml=party(input.seller,'AccountingSupplierParty');
  if(input.mode==='standard'&&input.buyer==null)throw Error('BUYER_REQUIRED');
  // The anonymous retail path deliberately accepts no incomplete buyer object.
  const buyerXml=input.buyer===null&&input.mode==='simplified'
    ? '<cac:AccountingCustomerParty><cac:Party/></cac:AccountingCustomerParty>'
    : specialProfile.citizen?citizenBuyer(input.buyer):profile.exportCode?exportBuyer(input.buyer):party(input.buyer,'AccountingCustomerParty');
  let billing='',reason='';
  if(input.kind==='invoice'||input.kind==='prepayment'){
    if(input.original!==undefined||input.correctionReason!==undefined)throw Error('UNEXPECTED_CORRECTION');
  }else{
    // Original is an immutable reference supplied by the trusted future ledger.
    // Structural matching does not verify ownership or remaining credit balance.
    const o=input.original;
    if(!o||Object.keys(o).some(k=>!['number','uuid','issueDate','mode','sellerVat','buyerVat'].includes(k))
      ||typeof o.uuid!=='string'||!UUID.test(o.uuid)||o.uuid===input.uuid||o.number===input.number
      ||o.mode!==input.mode||o.sellerVat!==input.seller.vatNumber||o.buyerVat!==(input.buyer?.vatNumber??null)
      ||date(o.issueDate)>input.issueDate)throw Error('INVALID_ORIGINAL_REFERENCE');
    billing='<cac:BillingReference><cac:InvoiceDocumentReference>'+e('ID',o.number)+e('IssueDate',o.issueDate)+'</cac:InvoiceDocumentReference></cac:BillingReference>';
    reason=e('InstructionNote',input.correctionReason);
  }
  const code=({invoice:'388','credit-note':'381','debit-note':'383',prepayment:'386'})[input.kind];
  const subtype=specialProfile.subtype;
  const totals=calculateFiscalTax({lines:input.lines,adjustments:input.adjustments});
  const vatSar=profile.vatSar(totals.vatTotal);
  const advance=resolvePrepayment(input,totals,prepayment);
  const lines=input.lines.map((line,i)=>{
    const t=totals.lines[i];
    const gross=BigInt(t.net.replace('.',''))+BigInt(t.vat.replace('.',''));
    const grossString=String(gross/100n)+'.'+String(gross%100n).padStart(2,'0');
    return '<cac:InvoiceLine>'+e('ID',String(i+1))+'<cbc:InvoicedQuantity unitCode="'+line.unitCode+'">'+safe(line.quantity)+'</cbc:InvoicedQuantity>'+amount('LineExtensionAmount',t.net)+lineAllowances[i]
      +'<cac:TaxTotal>'+amount('TaxAmount',t.vat)+amount('RoundingAmount',grossString)+'</cac:TaxTotal>'
      +'<cac:Item>'+e('Name',line.name)+category('ClassifiedTaxCategory',line)+'</cac:Item><cac:Price>'+amount('PriceAmount',line.unitNetPrice)+'</cac:Price></cac:InvoiceLine>';
  }).join('');
  const advanceLines=advance?.kind==='adjustment'?advance.rows.map((r,i)=>
    '<cac:InvoiceLine>'+e('ID',String(input.lines.length+i+1))+'<cbc:InvoicedQuantity unitCode="PCE">0.00</cbc:InvoicedQuantity>'+amount('LineExtensionAmount','0.00')
    +'<cac:DocumentReference>'+e('ID',r.number)+e('UUID',r.uuid)+e('IssueDate',r.issueDate)+e('IssueTime',r.issueTime+'Z')+e('DocumentTypeCode','386')+'</cac:DocumentReference>'
    +'<cac:TaxTotal>'+amount('TaxAmount','0.00')+amount('RoundingAmount','0.00')+'<cac:TaxSubtotal>'+amount('TaxableAmount',r.net)+amount('TaxAmount',r.vat)+category('TaxCategory',r)+'</cac:TaxSubtotal></cac:TaxTotal>'
    +'<cac:Item>'+e('Name','تسوية دفعة مقدمة')+category('ClassifiedTaxCategory',r)+'</cac:Item><cac:Price>'+amount('PriceAmount','0.00')+'</cac:Price></cac:InvoiceLine>'
  ).join(''):'';
  const subtotals=totals.breakdown.map(t=>'<cac:TaxSubtotal>'+amount('TaxableAmount',t.taxableAmount)+amount('TaxAmount',t.vat)+category('TaxCategory',{...t,...reasons.get(t.category)},true)+'</cac:TaxSubtotal>').join('');
  const xml='<?xml version="1.0" encoding="UTF-8"?>'
    +'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
    +e('ProfileID','reporting:1.0')+e('ID',input.number)+e('UUID',input.uuid)+e('IssueDate',input.issueDate)+e('IssueTime',input.issueTime+'Z')+'<cbc:InvoiceTypeCode name="'+subtype+'">'+code+'</cbc:InvoiceTypeCode>'
    +e('DocumentCurrencyCode',profile.currency)+e('TaxCurrencyCode','SAR')+billing
    +'<cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID>'+e('UUID',input.icv)+'</cac:AdditionalDocumentReference>'
    +'<cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">'+safe(input.previousInvoiceHash)+'</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>'
    +sellerXml+buyerXml
    +(input.kind==='prepayment'?'':'<cac:Delivery>'+e('ActualDeliveryDate',input.supplyDate)+(specialProfile.supplyEnd?e('LatestDeliveryDate',specialProfile.supplyEnd):'')+'</cac:Delivery>')
    +'<cac:PaymentMeans>'+e('PaymentMeansCode',input.paymentMeans)+reason+'</cac:PaymentMeans>'
    +adjustmentXml+'<cac:TaxTotal>'+monetary('TaxAmount',vatSar,'SAR')+'</cac:TaxTotal>'
    +'<cac:TaxTotal>'+amount('TaxAmount',totals.vatTotal)+subtotals+'</cac:TaxTotal>'
    +'<cac:LegalMonetaryTotal>'+amount('LineExtensionAmount',totals.lineNetTotal)+amount('TaxExclusiveAmount',totals.taxExclusiveTotal)+amount('TaxInclusiveAmount',totals.taxInclusiveTotal)+(totals.documentAllowances!=='0.00'?amount('AllowanceTotalAmount',totals.documentAllowances):'')+(totals.documentCharges!=='0.00'?amount('ChargeTotalAmount',totals.documentCharges):'')+(advance?.kind==='adjustment'?amount('PrepaidAmount',advance.prepaid):'')+amount('PayableAmount',advance?.kind==='adjustment'?advance.payable:totals.taxInclusiveTotal)+'</cac:LegalMonetaryTotal>'+lines+advanceLines+'</Invoice>';
  const bytes=Buffer.from(xml,'utf8');
  if(bytes.length>512*1024)throw Error('XML_TOO_LARGE');
  return {status:'unsigned-candidate',bytes,totals,...(special?{specialContext:structuredClone(special)}:{}),...(advance?{prepaymentContext:advance}:{}),...(profile.currency!=='SAR'||profile.exportCode?{fiscalContext:{currency:profile.currency,vatSar,rate:context.rate?{...context.rate}:null,exportClassification:context.exportClassification?{...context.exportClassification}:null}}:{})};
}

// Preserve the original domestic contract and scope for existing signing callers.
export function buildDomesticFiscalCandidate(input){
  if(input?.currency!=='SAR')throw Error('UNSUPPORTED_XML_CASE');
  return buildFiscalCandidate(input);
}

// Preserve the original narrow function contract for existing callers.
export function buildDomesticStandardInvoiceCandidate(input){
  if(!input||input.mode!=='standard'||input.kind!=='invoice')throw Error('UNSUPPORTED_XML_CASE');
  return buildDomesticFiscalCandidate(input);
}

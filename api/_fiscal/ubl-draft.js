import {calculateFiscalTax} from '../../dist/src/lib/fiscal-tax.js';
import {FIRST_PREVIOUS_INVOICE_HASH} from '../../dist/src/lib/fiscal-issuance.js';

// Restricted UBL candidate writer: domestic SAR, standard-rated sales only,
// without discounts, prepayments, shipping or corrections. No final signature.
// Never send its output to a buyer or authority before a trusted SDK gate.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VAT=/^3[0-9]{13}3$/;
function safe(value,max=256){
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value)||Buffer.from(value,'utf8').toString('utf8')!==value)throw Error('INVALID_XML_TEXT');
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
}
const e=(name,value)=>'<cbc:'+name+'>'+safe(value)+'</cbc:'+name+'>';
const amount=(name,value)=>'<cbc:'+name+' currencyID="SAR">'+safe(value)+'</cbc:'+name+'>';
const scheme='<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>';
function category(name){return '<cac:'+name+'><cbc:ID>S</cbc:ID><cbc:Percent>15</cbc:Percent>'+scheme+'</cac:'+name+'>';}
function party(p,role){
  if(!p||!VAT.test(p.vatNumber)||typeof p.vatNumber!=='string'||typeof p.crn!=='string'||!/^[0-9]{10}$/.test(p.crn)
    ||typeof p.building!=='string'||!/^[0-9]{4}$/.test(p.building)||typeof p.postal!=='string'||!/^[0-9]{5}$/.test(p.postal))throw Error('INVALID_PARTY');
  return '<cac:'+role+'><cac:Party><cac:PartyIdentification><cbc:ID schemeID="CRN">'+safe(p.crn)+'</cbc:ID></cac:PartyIdentification>'
    +'<cac:PostalAddress>'+e('StreetName',p.street)+e('BuildingNumber',p.building)+e('CitySubdivisionName',p.district)+e('CityName',p.city)+e('PostalZone',p.postal)
    +'<cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country></cac:PostalAddress>'
    +'<cac:PartyTaxScheme>'+e('CompanyID',p.vatNumber)+scheme+'</cac:PartyTaxScheme><cac:PartyLegalEntity>'+e('RegistrationName',p.name)+'</cac:PartyLegalEntity></cac:Party></cac:'+role+'>';
}
function date(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('INVALID_DATE');
  return value;
}
export function buildDomesticStandardInvoiceCandidate(input){
  if(!input||Object.keys(input).some(key=>!['currency','mode','kind','uuid','icv','previousInvoiceHash','number','issueDate','issueTime','supplyDate','paymentMeans','seller','buyer','lines'].includes(key))||input.currency!=='SAR'||input.mode!=='standard'||input.kind!=='invoice'||input.adjustments!==undefined||input.prepaid!==undefined||input.discount!==undefined||input.shipping!==undefined||input.fx!==undefined)throw Error('UNSUPPORTED_XML_CASE');
  if(typeof input.uuid!=='string'||!UUID.test(input.uuid)||typeof input.icv!=='string'||typeof input.previousInvoiceHash!=='string')throw Error('INVALID_XML_IDENTITY');
  if(!/^[1-9][0-9]{0,17}$/.test(input.icv)|| (input.icv==='1'?input.previousInvoiceHash!==FIRST_PREVIOUS_INVOICE_HASH:! /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(input.previousInvoiceHash)))throw Error('INVALID_CHAIN');
  date(input.issueDate);
  if(typeof input.issueTime!=='string'||! /^(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(input.issueTime)||!['10','30','42','48','1'].includes(input.paymentMeans))throw Error('INVALID_ISSUE_DETAILS');
  if(date(input.supplyDate)>input.issueDate)throw Error('UNSUPPORTED_SUPPLY_DATE');
  if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>500||input.lines.some(l=>!l||Object.keys(l).some(key=>!['id','name','quantity','unitNetPrice','unitCode','category','rate'].includes(key))||l.category!=='S'||l.rate!=='15'||l.allowance!==undefined||l.reasonCode!==undefined||typeof l.unitCode!=='string'||!['PCE','KGM','LTR','MTR','HUR','EA'].includes(l.unitCode)))throw Error('UNSUPPORTED_XML_LINE');
  const totals=calculateFiscalTax({lines:input.lines});
  const lines=input.lines.map((line,i)=>{
    const t=totals.lines[i];
    const gross=BigInt(t.net.replace('.',''))+BigInt(t.vat.replace('.',''));
    const grossString=String(gross/100n)+'.'+String(gross%100n).padStart(2,'0');
    return '<cac:InvoiceLine>'+e('ID',String(i+1))+'<cbc:InvoicedQuantity unitCode="'+line.unitCode+'">'+safe(line.quantity)+'</cbc:InvoicedQuantity>'+amount('LineExtensionAmount',t.net)
      +'<cac:TaxTotal>'+amount('TaxAmount',t.vat)+amount('RoundingAmount',grossString)+'</cac:TaxTotal>'
      +'<cac:Item>'+e('Name',line.name)+category('ClassifiedTaxCategory')+'</cac:Item><cac:Price>'+amount('PriceAmount',line.unitNetPrice)+'</cac:Price></cac:InvoiceLine>';
  }).join('');
  const xml='<?xml version="1.0" encoding="UTF-8"?>'
    +'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
    +e('ProfileID','reporting:1.0')+e('ID',input.number)+e('UUID',input.uuid)+e('IssueDate',input.issueDate)+e('IssueTime',input.issueTime+'Z')+'<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>'
    +e('DocumentCurrencyCode','SAR')+e('TaxCurrencyCode','SAR')
    +'<cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID>'+e('UUID',input.icv)+'</cac:AdditionalDocumentReference>'
    +'<cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">'+safe(input.previousInvoiceHash)+'</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>'
    +party(input.seller,'AccountingSupplierParty')+party(input.buyer,'AccountingCustomerParty')
    +'<cac:Delivery>'+e('ActualDeliveryDate',input.supplyDate)+'</cac:Delivery>'
    +'<cac:PaymentMeans>'+e('PaymentMeansCode',input.paymentMeans)+'</cac:PaymentMeans>'
    +'<cac:TaxTotal>'+amount('TaxAmount',totals.vatTotal)+'</cac:TaxTotal>'
    +'<cac:TaxTotal>'+amount('TaxAmount',totals.vatTotal)+'<cac:TaxSubtotal>'+amount('TaxableAmount',totals.taxExclusiveTotal)+amount('TaxAmount',totals.vatTotal)+category('TaxCategory')+'</cac:TaxSubtotal></cac:TaxTotal>'
    +'<cac:LegalMonetaryTotal>'+amount('LineExtensionAmount',totals.lineNetTotal)+amount('TaxExclusiveAmount',totals.taxExclusiveTotal)+amount('TaxInclusiveAmount',totals.taxInclusiveTotal)+amount('PayableAmount',totals.taxInclusiveTotal)+'</cac:LegalMonetaryTotal>'+lines+'</Invoice>';
  const bytes=Buffer.from(xml,'utf8');
  if(bytes.length>512*1024)throw Error('XML_TOO_LARGE');
  return {status:'unsigned-candidate',bytes,totals};
}

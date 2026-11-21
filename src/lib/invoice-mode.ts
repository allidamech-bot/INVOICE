import type { InvoiceMode, LourexDocument } from '../types.js';

function saudiIssuer(doc:Pick<LourexDocument,'companySnapshot'>):boolean{
  const country=String(doc.companySnapshot?.country||'').trim().toUpperCase();
  return ['SA','SAU','SAUDI ARABIA','KINGDOM OF SAUDI ARABIA','السعودية','المملكة العربية السعودية'].includes(country)||/^3\d{13}3$/.test(doc.companySnapshot?.vatNumber||'');
}

export function withInvoiceMode(doc:LourexDocument,mode:InvoiceMode):LourexDocument{
  if(doc.kind!=='invoice'||doc.role!=='standard'||doc.status!=='draft'||doc.invoiceMode!==undefined||!['ordinary','tax'].includes(mode))throw new Error('Invalid invoice type selection.');
  // Preserve an explicitly configured tax preset. Otherwise leave the rate
  // for review, with the Saudi standard rate as a suggested default only.
  const rate=doc.adjustments.taxEnabled?doc.adjustments.taxPercent:saudiIssuer(doc)?'15':'';
  return {...doc,invoiceMode:mode,adjustments:{...doc.adjustments,taxEnabled:mode==='tax',taxPercent:mode==='ordinary'?'0':rate}};
}
export function invoiceModeValid(doc:LourexDocument):boolean{
  if(doc.invoiceMode===undefined)return true; // never reclassify historical records
  if(doc.kind!=='invoice'||!doc.adjustments)return false;
  const noVat=doc.adjustments.taxEnabled===false&&typeof doc.adjustments.taxPercent==='string'&&/^0(?:\.0+)?$/.test(doc.adjustments.taxPercent);
  if(doc.invoiceMode==='ordinary')return noVat;
  // Credit-note type inherits the source invoice. The existing reviewed
  // "keep VAT" treatment is a monetary credit without reversing tax.
  return doc.invoiceMode==='tax'&&(doc.adjustments.taxEnabled===true||doc.role==='credit-note'&&noVat);
}
export function assertInvoiceMode(doc:LourexDocument,previous?:LourexDocument):void{
  if(!invoiceModeValid(doc)||previous&&previous.invoiceMode!==doc.invoiceMode)throw new Error('Invoice type and VAT settings must remain consistent.');
}
export function needsSaudiFiscalIssuance(doc:Pick<LourexDocument,'kind'|'invoiceMode'|'companySnapshot'>):boolean{
  return doc.kind==='invoice'&&doc.invoiceMode==='tax'&&saudiIssuer(doc);
}

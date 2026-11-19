import type { InvoiceMode, LourexDocument } from '../types.js';

export function withInvoiceMode(doc:LourexDocument,mode:InvoiceMode):LourexDocument{
  if(doc.kind!=='invoice'||doc.role!=='standard'||doc.status!=='draft'||!['ordinary','tax'].includes(mode))throw new Error('Invalid invoice type selection.');
  return {...doc,invoiceMode:mode,adjustments:{...doc.adjustments,taxEnabled:mode==='tax',taxPercent:mode==='ordinary'?'0':doc.adjustments.taxPercent||'0'}};
}
export function invoiceModeValid(doc:LourexDocument):boolean{
  if(doc.invoiceMode===undefined)return true; // never reclassify historical records
  if(doc.kind!=='invoice'||!doc.adjustments)return false;
  if(doc.invoiceMode==='ordinary')return doc.adjustments.taxEnabled===false&&typeof doc.adjustments.taxPercent==='string'&&/^0(?:\.0+)?$/.test(doc.adjustments.taxPercent);
  return doc.invoiceMode==='tax'&&doc.adjustments.taxEnabled===true;
}
export function assertInvoiceMode(doc:LourexDocument,previous?:LourexDocument):void{
  if(!invoiceModeValid(doc)||previous&&previous.invoiceMode!==doc.invoiceMode)throw new Error('Invoice type and VAT settings must remain consistent.');
}
export function needsSaudiFiscalIssuance(doc:Pick<LourexDocument,'kind'|'invoiceMode'|'companySnapshot'>):boolean{
  if(doc.kind!=='invoice'||doc.invoiceMode!=='tax')return false;
  const country=String(doc.companySnapshot?.country||'').trim().toUpperCase();
  return ['SA','SAU','SAUDI ARABIA','KINGDOM OF SAUDI ARABIA','السعودية','المملكة العربية السعودية'].includes(country)||/^3\d{13}3$/.test(doc.companySnapshot?.vatNumber||'');
}

import type { LourexDocument } from '../types.js';
import { paginateItems } from './documents.js';
import { decimalToScaled, isDecimalInput } from './money.js';

export type DocumentQualityCode =
  | 'company-name-missing'
  | 'logo-missing'
  | 'bank-incomplete'
  | 'signature-missing'
  | 'stamp-missing'
  | 'zero-price'
  | 'multi-page'
  | 'long-description';

export interface DocumentQualityIssue {
  code: DocumentQualityCode;
  level: 'warning'|'info';
}

export function documentQualityIssues(doc: LourexDocument): DocumentQualityIssue[] {
  const issues: DocumentQualityIssue[]=[];
  const companyName=(doc.companySnapshot.nameEn||doc.companySnapshot.nameAr).trim();
  if(!companyName)issues.push({code:'company-name-missing',level:'warning'});
  const logo=doc.companySnapshot.logoDataUrl.trim();
  if(!logo||logo.includes('lourex-logo.svg'))issues.push({code:'logo-missing',level:'info'});
  if(doc.appearance.showBank){
    const bank=doc.companySnapshot.bank;
    const essential=[bank.bankName,bank.accountName,bank.iban,bank.swift].filter(value=>value.trim()).length;
    if(essential<2)issues.push({code:'bank-incomplete',level:'warning'});
  }
  if(doc.appearance.showSignature&&!doc.companySnapshot.signatureDataUrl.trim())issues.push({code:'signature-missing',level:'warning'});
  if(doc.appearance.showStamp&&!doc.companySnapshot.stampDataUrl.trim())issues.push({code:'stamp-missing',level:'warning'});
  if(doc.items.some(item=>isDecimalInput(item.unitPrice)&&decimalToScaled(item.unitPrice)===0n))issues.push({code:'zero-price',level:'warning'});
  if(paginateItems(doc.items).length>1)issues.push({code:'multi-page',level:'info'});
  if(doc.items.some(item=>(item.descriptionEn.length+item.descriptionAr.length)>900))issues.push({code:'long-description',level:'info'});
  return issues;
}

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

function usesSeparateDetailsPage(doc:LourexDocument):boolean{
  const values=Object.values(doc.terms).filter(value=>value.trim());
  const termsCount=values.length;
  const detailsChars=values.reduce((sum,value)=>sum+value.length,0)+doc.notes.length;
  const bank=doc.appearance.showBank&&Object.values(doc.companySnapshot.bank).some(value=>value.trim());
  const signing=(doc.appearance.showSignature&&Boolean(doc.companySnapshot.signatureDataUrl))||(doc.appearance.showStamp&&Boolean(doc.companySnapshot.stampDataUrl));
  const adjustments=[doc.adjustments.discountEnabled,doc.adjustments.shippingEnabled,doc.adjustments.otherChargesEnabled,doc.adjustments.taxEnabled].filter(Boolean).length;
  const score=termsCount+(doc.notes.trim()?3:0)+(bank?4:0)+(signing?3:0)+adjustments;
  return score>=10||detailsChars>700||values.some(value=>value.length>260)||doc.notes.length>420;
}

function firstPageCapacity(doc:LourexDocument):number{
  const c=doc.customerSnapshot;
  const values=[
    doc.companySnapshot.nameEn,doc.companySnapshot.nameAr,doc.companySnapshot.addressEn,doc.companySnapshot.addressAr,doc.companySnapshot.city,doc.companySnapshot.country,
    doc.companySnapshot.phone,doc.companySnapshot.email,doc.companySnapshot.website,doc.companySnapshot.vatNumber,doc.companySnapshot.taxNumber,doc.companySnapshot.commercialRegistration,
    c?.companyNameEn??'',c?.companyNameAr??'',c?.addressEn??'',c?.addressAr??'',c?.city??'',c?.country??'',c?.phone??'',c?.email??'',c?.vatTaxNumber??'',c?.commercialRegistration??''
  ].map(value=>value.trim()).filter(Boolean);
  const chars=values.reduce((sum,value)=>sum+value.length,0);
  const pressure=chars+values.length*18+(doc.language==='bilingual'?120:0);
  if(pressure>1050)return 2;
  if(pressure>780)return 3;
  if(pressure>560)return 4;
  if(pressure>380)return 5;
  return 7;
}

export function estimatedDocumentPageCount(doc:LourexDocument):number{
  const separateDetails=usesSeparateDetailsPage(doc);
  const itemPages=paginateItems(doc.items,!separateDetails,firstPageCapacity(doc));
  return itemPages.length+(separateDetails?1:0);
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
  if(estimatedDocumentPageCount(doc)>1)issues.push({code:'multi-page',level:'info'});
  if(doc.items.some(item=>(item.descriptionEn.length+item.descriptionAr.length)>900))issues.push({code:'long-description',level:'info'});
  return issues;
}

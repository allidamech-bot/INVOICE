import type { DocumentItem, LourexDocument } from '../types.js';
import { paginateItems } from './documents.js';
import { decimalToScaled, isDecimalInput } from './money.js';
import { documentDisplayValue, hasDocumentLanguageMismatch, type DocumentValueKind } from './document-language.js';

export type DocumentQualityCode =
  | 'company-name-missing'
  | 'logo-missing'
  | 'bank-incomplete'
  | 'signature-missing'
  | 'stamp-missing'
  | 'zero-price'
  | 'multi-page'
  | 'long-description'
  | 'language-mismatch';

export interface DocumentQualityIssue {
  code: DocumentQualityCode;
  level: 'warning'|'info';
}

function visibleIdentityValues(doc:LourexDocument,english:string,arabic:string):string[]{
  const en=english.trim();const ar=arabic.trim();
  if(doc.language==='en'){
    const visible=documentDisplayValue(en,'en');
    return visible?[visible]:[];
  }
  if(doc.language==='ar'){
    const visible=ar||en;
    return visible?[visible]:[];
  }
  return [en,ar].filter(Boolean);
}

function firstPageCapacity(doc:LourexDocument):number{
  const c=doc.customerSnapshot;
  const values=[
    ...visibleIdentityValues(doc,doc.companySnapshot.nameEn,doc.companySnapshot.nameAr),
    ...visibleIdentityValues(doc,doc.companySnapshot.addressEn,doc.companySnapshot.addressAr),
    doc.companySnapshot.city,doc.companySnapshot.country,
    doc.companySnapshot.phone,doc.companySnapshot.email,doc.companySnapshot.website,doc.companySnapshot.vatNumber,doc.companySnapshot.taxNumber,doc.companySnapshot.commercialRegistration,
    ...visibleIdentityValues(doc,c?.companyNameEn??'',c?.companyNameAr??''),
    ...visibleIdentityValues(doc,c?.addressEn??'',c?.addressAr??''),
    c?.city??'',c?.country??'',c?.phone??'',c?.email??'',c?.vatTaxNumber??'',c?.commercialRegistration??''
  ].map(value=>value.trim()).filter(Boolean);
  const chars=values.reduce((sum,value)=>sum+value.length,0);
  const pressure=chars+values.length*18+(doc.language==='bilingual'?120:0);
  if(pressure>1050)return 2;
  if(pressure>780)return 3;
  if(pressure>560)return 4;
  if(pressure>380)return 5;
  return 7;
}

function displayedItemText(doc:LourexDocument,descriptionEn:string,descriptionAr:string):string{
  if(doc.language==='en')return descriptionEn.trim();
  if(doc.language==='ar')return descriptionAr.trim();
  return `${descriptionEn} ${descriptionAr}`.trim();
}

function wrappedCellWeight(value:string,charactersPerLine:number):number{return value.trim()?Math.max(1,Math.ceil(value.trim().length/charactersPerLine)):0;}
function itemWeight(doc:LourexDocument,item:DocumentItem):number{
  const description=wrappedCellWeight(displayedItemText(doc,item.descriptionEn,item.descriptionAr),95);
  const hs=doc.appearance.showHsCode?wrappedCellWeight(item.hsCode,26):0;
  const origin=doc.appearance.showOrigin?wrappedCellWeight(documentDisplayValue(item.origin,doc.language,'country'),20):0;
  const packing=doc.appearance.showPacking?wrappedCellWeight(documentDisplayValue(item.packing,doc.language),24):0;
  const unit=wrappedCellWeight(documentDisplayValue(item.unit,doc.language,'unit'),14);
  return Math.max(1,description,hs,origin,packing,unit);
}

function termKind(key:string):DocumentValueKind{
  if(key==='Incoterm')return 'technical';
  if(key==='Country of Origin')return 'country';
  if(key==='Port of Loading'||key==='Final Destination')return 'neutral';
  return 'prose';
}
function displayedClosingValues(doc:LourexDocument):string[]{
  const t=doc.terms;
  const rows:Array<[string,string]>=[['Incoterm',t.incoterm],['Payment Terms',t.paymentTerms],['Packing',t.packing],['Delivery Time',t.deliveryTime],['Port of Loading',t.portOfLoading],['Final Destination',t.finalDestination],['Country of Origin',t.countryOfOrigin],['Validity',t.validity],['Remarks',t.remarks]];
  return rows.map(([key,value])=>documentDisplayValue(value,doc.language,termKind(key))).filter(Boolean);
}

function usesSeparateDetailsPage(doc:LourexDocument):boolean{
  const values=displayedClosingValues(doc);
  const termsCount=values.length;
  const notes=documentDisplayValue(doc.notes,doc.language);
  const detailsChars=values.reduce((sum,value)=>sum+value.length,0)+notes.length;
  const bank=doc.appearance.showBank&&Object.values(doc.companySnapshot.bank).some(value=>value.trim());
  const signing=(doc.appearance.showSignature&&Boolean(doc.companySnapshot.signatureDataUrl))||(doc.appearance.showStamp&&Boolean(doc.companySnapshot.stampDataUrl));
  const adjustments=[doc.adjustments.discountEnabled,doc.adjustments.shippingEnabled,doc.adjustments.otherChargesEnabled,doc.adjustments.taxEnabled].filter(Boolean).length;
  const score=termsCount+(notes?3:0)+(bank?4:0)+(signing?3:0)+adjustments;

  const hardOverflow=detailsChars>1400||values.some(value=>value.length>520)||notes.length>900;
  if(hardOverflow)return true;

  const complexClosing=score>=10||detailsChars>700||values.some(value=>value.length>260)||notes.length>420;
  if(!complexClosing)return false;

  const tentative=paginateItems(doc.items,true,firstPageCapacity(doc),doc.language,item=>itemWeight(doc,item));
  const last=tentative[tentative.length-1]??[];
  const lastWeight=last.reduce((sum,item)=>sum+itemWeight(doc,item),0);
  const allowedLastWeight=score>=16?2:score>=13?3:5;
  return lastWeight>allowedLastWeight;
}

function weightedItemPageFloor(doc:LourexDocument):number{
  const firstCapacity=firstPageCapacity(doc);
  const totalWeight=doc.items.reduce((sum,item)=>sum+itemWeight(doc,item),0);
  if(totalWeight<=firstCapacity)return 1;
  return 1+Math.ceil((totalWeight-firstCapacity)/13);
}

export function estimatedDocumentPageCount(doc:LourexDocument):number{
  const separateDetails=usesSeparateDetailsPage(doc);
  const itemPages=paginateItems(doc.items,!separateDetails,firstPageCapacity(doc),doc.language,item=>itemWeight(doc,item));
  const itemPageCount=Math.max(itemPages.length,weightedItemPageFloor(doc));
  return itemPageCount+(separateDetails?1:0);
}

export function documentQualityIssues(doc: LourexDocument): DocumentQualityIssue[] {
  const issues: DocumentQualityIssue[]=[];
  const companyName=visibleIdentityValues(doc,doc.companySnapshot.nameEn,doc.companySnapshot.nameAr).join(' / ');
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
  if(hasDocumentLanguageMismatch(doc))issues.push({code:'language-mismatch',level:'warning'});
  if(estimatedDocumentPageCount(doc)>1)issues.push({code:'multi-page',level:'info'});
  if(doc.items.some(item=>displayedItemText(doc,item.descriptionEn,item.descriptionAr).length>900))issues.push({code:'long-description',level:'info'});
  return issues;
}

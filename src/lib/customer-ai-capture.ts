import type { Customer } from '../types.js';
import { makeId } from './id.js';

export const CUSTOMER_AI_FIELDS=['companyNameEn','companyNameAr','commercialRegistration','vatTaxNumber','addressEn','addressAr','city','country','phone','email','contactPerson'] as const;
export type CustomerAiFieldKey=typeof CUSTOMER_AI_FIELDS[number];

export interface CustomerAiFieldEvidence{
  value:string;
  confidence:number;
  sourceFile:string;
  sourcePage:string;
  sourceExcerpt:string;
}

export interface CustomerAiProposal{
  fields:Record<CustomerAiFieldKey,CustomerAiFieldEvidence>;
  conflicts:Array<{field:CustomerAiFieldKey;values:Array<{value:string;confidence:number;sourceFile:string;sourcePage:string}>}>;
}

export interface CustomerDuplicateCandidate{
  customer:Customer;
  score:number;
  reasons:Array<'commercialRegistration'|'vatTaxNumber'|'email'|'phone'|'companyNameEn'|'companyNameAr'>;
}

const emptyEvidence=():CustomerAiFieldEvidence=>({value:'',confidence:0,sourceFile:'',sourcePage:'',sourceExcerpt:''});

export function emptyCustomerAiProposal():CustomerAiProposal{
  return {fields:Object.fromEntries(CUSTOMER_AI_FIELDS.map(key=>[key,emptyEvidence()])) as Record<CustomerAiFieldKey,CustomerAiFieldEvidence>,conflicts:[]};
}

function cleanText(value:unknown,max=500):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function confidence(value:unknown):number{const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(1,number)):0;}

export function normalizeCustomerAiProposal(value:any):CustomerAiProposal{
  const proposal=emptyCustomerAiProposal();
  for(const key of CUSTOMER_AI_FIELDS){
    const row=value?.fields?.[key]??{};
    proposal.fields[key]={value:cleanText(row.value),confidence:confidence(row.confidence),sourceFile:cleanText(row.sourceFile,180),sourcePage:cleanText(row.sourcePage,20),sourceExcerpt:cleanText(row.sourceExcerpt,220)};
  }
  return proposal;
}

function comparisonValue(key:CustomerAiFieldKey,value:string):string{
  if(key==='email')return normalizeEmail(value);
  if(key==='phone')return normalizePhone(value);
  if(key==='commercialRegistration'||key==='vatTaxNumber')return normalizeIdentifier(value);
  return normalizeName(value);
}

export function mergeCustomerAiProposals(proposals:CustomerAiProposal[]):CustomerAiProposal{
  const merged=emptyCustomerAiProposal();
  const conflicts:CustomerAiProposal['conflicts']=[];
  for(const key of CUSTOMER_AI_FIELDS){
    const candidates=proposals.map(proposal=>proposal.fields[key]).filter(field=>field.value.trim()).sort((a,b)=>b.confidence-a.confidence);
    if(!candidates.length)continue;
    merged.fields[key]={...candidates[0]!};
    const distinct=new Map<string,CustomerAiFieldEvidence>();
    for(const candidate of candidates){const normalized=comparisonValue(key,candidate.value);if(normalized&&!distinct.has(normalized))distinct.set(normalized,candidate);}
    if(distinct.size>1)conflicts.push({field:key,values:[...distinct.values()].slice(0,4).map(row=>({value:row.value,confidence:row.confidence,sourceFile:row.sourceFile,sourcePage:row.sourcePage}))});
  }
  merged.conflicts=conflicts;
  return merged;
}

export function normalizeName(value:string):string{
  return value.normalize('NFKC').toLowerCase().replace(/[\u0640\u064b-\u065f\u0670]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
export function normalizeIdentifier(value:string):string{return value.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');}
export function normalizeEmail(value:string):string{return value.normalize('NFKC').trim().toLowerCase();}
export function normalizePhone(value:string):string{let digits=value.replace(/\D/g,'');while(digits.startsWith('00'))digits=digits.slice(2);return digits;}

function customerValues(customer:Customer){return{
  commercialRegistration:normalizeIdentifier(customer.commercialRegistration),
  vatTaxNumber:normalizeIdentifier(customer.vatTaxNumber),
  email:normalizeEmail(customer.email),
  phone:normalizePhone(customer.phone),
  companyNameEn:normalizeName(customer.companyNameEn),
  companyNameAr:normalizeName(customer.companyNameAr),
};}

export function findCustomerDuplicateCandidates(customers:Customer[],candidate:Customer):CustomerDuplicateCandidate[]{
  const incoming=customerValues(candidate);
  return customers.filter(customer=>customer.id!==candidate.id).map(customer=>{
    const existing=customerValues(customer);let score=0;const reasons:CustomerDuplicateCandidate['reasons']=[];
    const add=(key:CustomerDuplicateCandidate['reasons'][number],points:number)=>{if(incoming[key]&&existing[key]===incoming[key]){score+=points;reasons.push(key);}};
    add('commercialRegistration',100);add('vatTaxNumber',90);add('email',70);add('phone',60);add('companyNameEn',40);add('companyNameAr',40);
    return {customer,score,reasons};
  }).filter(row=>row.score>=40).sort((a,b)=>b.score-a.score||b.reasons.length-a.reasons.length).slice(0,8);
}

export function customerFromAiProposal(proposal:CustomerAiProposal,existing?:Customer):Customer{
  const now=new Date().toISOString();
  const base:Customer=existing?structuredClone(existing):{id:makeId('customer'),createdAt:now,updatedAt:now,companyNameEn:'',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'',paymentTermPresetId:'',paymentTerms:'',paymentDueDays:'',creditLimit:'',creditCurrency:'',notes:''};
  for(const key of CUSTOMER_AI_FIELDS){const extracted=proposal.fields[key].value.trim();if(extracted)(base as any)[key]=extracted;}
  base.updatedAt=now;
  return base;
}

export function customerAiFieldLabel(key:CustomerAiFieldKey,arabic=false):string{
  const labels:Record<CustomerAiFieldKey,[string,string]>={companyNameEn:['Company name (English)','اسم الشركة بالإنجليزية'],companyNameAr:['Company name (Arabic)','اسم الشركة بالعربية'],commercialRegistration:['Commercial registration','السجل التجاري'],vatTaxNumber:['VAT / Tax number','الرقم الضريبي / القيمة المضافة'],addressEn:['Address (English)','العنوان بالإنجليزية'],addressAr:['Address (Arabic)','العنوان بالعربية'],city:['City','المدينة'],country:['Country','الدولة'],phone:['Phone','الهاتف'],email:['Email','البريد الإلكتروني'],contactPerson:['Contact person','جهة الاتصال']};
  return labels[key][arabic?1:0];
}

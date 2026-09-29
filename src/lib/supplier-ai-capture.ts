import type { Supplier } from '../types.js';
import { makeId } from './id.js';

export const SUPPLIER_AI_FIELDS=['nameEn','nameAr','commercialRegistration','vatTaxNumber','address','city','country','phone','email','contactPerson','defaultCurrency','paymentTerms'] as const;
export type SupplierAiFieldKey=typeof SUPPLIER_AI_FIELDS[number];
export interface SupplierAiFieldEvidence{value:string;confidence:number;sourceFile:string;sourcePage:string;sourceExcerpt:string;}
export interface SupplierAiProposal{fields:Record<SupplierAiFieldKey,SupplierAiFieldEvidence>;conflicts:Array<{field:SupplierAiFieldKey;values:Array<{value:string;confidence:number;sourceFile:string;sourcePage:string}>}>;}
export interface SupplierDuplicateCandidate{supplier:Supplier;score:number;reasons:Array<'commercialRegistration'|'vatTaxNumber'|'email'|'phone'|'nameEn'|'nameAr'>;}

const emptyEvidence=():SupplierAiFieldEvidence=>({value:'',confidence:0,sourceFile:'',sourcePage:'',sourceExcerpt:''});
export function emptySupplierAiProposal():SupplierAiProposal{return{fields:Object.fromEntries(SUPPLIER_AI_FIELDS.map(key=>[key,emptyEvidence()])) as Record<SupplierAiFieldKey,SupplierAiFieldEvidence>,conflicts:[]};}
function cleanText(value:unknown,max=500):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function confidence(value:unknown):number{const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(1,number)):0;}
export function normalizeSupplierAiProposal(value:any):SupplierAiProposal{const proposal=emptySupplierAiProposal();for(const key of SUPPLIER_AI_FIELDS){const row=value?.fields?.[key]??{};proposal.fields[key]={value:cleanText(row.value),confidence:confidence(row.confidence),sourceFile:cleanText(row.sourceFile,180),sourcePage:cleanText(row.sourcePage,20),sourceExcerpt:cleanText(row.sourceExcerpt,220)};}return proposal;}
export function normalizeSupplierName(value:string):string{return value.normalize('NFKC').toLowerCase().replace(/[\u0640\u064b-\u065f\u0670]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
export function normalizeSupplierIdentifier(value:string):string{return value.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');}
export function normalizeSupplierEmail(value:string):string{return value.normalize('NFKC').trim().toLowerCase();}
export function normalizeSupplierPhone(value:string):string{let digits=value.replace(/\D/g,'');while(digits.startsWith('00'))digits=digits.slice(2);return digits;}
function compare(key:SupplierAiFieldKey,value:string):string{if(key==='email')return normalizeSupplierEmail(value);if(key==='phone')return normalizeSupplierPhone(value);if(key==='commercialRegistration'||key==='vatTaxNumber')return normalizeSupplierIdentifier(value);return normalizeSupplierName(value);}
export function mergeSupplierAiProposals(proposals:SupplierAiProposal[]):SupplierAiProposal{
  const merged=emptySupplierAiProposal(),conflicts:SupplierAiProposal['conflicts']=[];
  for(const key of SUPPLIER_AI_FIELDS){const candidates=proposals.map(proposal=>proposal.fields[key]).filter(field=>field.value.trim()).sort((a,b)=>b.confidence-a.confidence);if(!candidates.length)continue;merged.fields[key]={...candidates[0]!};const distinct=new Map<string,SupplierAiFieldEvidence>();for(const candidate of candidates){const normalized=compare(key,candidate.value);if(normalized&&!distinct.has(normalized))distinct.set(normalized,candidate);}if(distinct.size>1)conflicts.push({field:key,values:[...distinct.values()].slice(0,4).map(row=>({value:row.value,confidence:row.confidence,sourceFile:row.sourceFile,sourcePage:row.sourcePage}))});}
  merged.conflicts=conflicts;return merged;
}
function supplierValues(supplier:Supplier){return{commercialRegistration:normalizeSupplierIdentifier(supplier.commercialRegistration),vatTaxNumber:normalizeSupplierIdentifier(supplier.vatTaxNumber),email:normalizeSupplierEmail(supplier.email),phone:normalizeSupplierPhone(supplier.phone),nameEn:normalizeSupplierName(supplier.nameEn),nameAr:normalizeSupplierName(supplier.nameAr)};}
export function findSupplierDuplicateCandidates(suppliers:Supplier[],candidate:Supplier):SupplierDuplicateCandidate[]{
  const incoming=supplierValues(candidate);return suppliers.filter(supplier=>supplier.id!==candidate.id).map(supplier=>{const existing=supplierValues(supplier);let score=0;const reasons:SupplierDuplicateCandidate['reasons']=[];const add=(key:SupplierDuplicateCandidate['reasons'][number],points:number)=>{if(incoming[key]&&existing[key]===incoming[key]){score+=points;reasons.push(key);}};add('commercialRegistration',100);add('vatTaxNumber',90);add('email',70);add('phone',60);add('nameEn',40);add('nameAr',40);return{supplier,score,reasons};}).filter(row=>row.score>=40).sort((a,b)=>b.score-a.score||b.reasons.length-a.reasons.length).slice(0,8);
}
export function supplierFromAiProposal(proposal:SupplierAiProposal,existing?:Supplier):Supplier{
  const now=new Date().toISOString();const base:Supplier=existing?structuredClone(existing):{id:makeId('supplier'),createdAt:now,updatedAt:now,nameEn:'',nameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',defaultCurrency:'',paymentTerms:'',notes:''};
  for(const key of SUPPLIER_AI_FIELDS){const extracted=proposal.fields[key].value.trim();if(extracted)(base as any)[key]=key==='defaultCurrency'?extracted.toUpperCase():extracted;}base.updatedAt=now;return base;
}
export function supplierAiFieldLabel(key:SupplierAiFieldKey,arabic=false):string{const labels:Record<SupplierAiFieldKey,[string,string]>={nameEn:['Supplier name (English)','اسم المورد بالإنجليزية'],nameAr:['Supplier name (Arabic)','اسم المورد بالعربية'],commercialRegistration:['Commercial registration','السجل التجاري'],vatTaxNumber:['VAT / Tax number','الرقم الضريبي / القيمة المضافة'],address:['Address','العنوان'],city:['City','المدينة'],country:['Country','الدولة'],phone:['Phone','الهاتف'],email:['Email','البريد الإلكتروني'],contactPerson:['Contact person','جهة الاتصال'],defaultCurrency:['Default currency','العملة الافتراضية'],paymentTerms:['Payment terms','شروط الدفع']};return labels[key][arabic?1:0];}

import type { ConversationKernel } from './ai-conversation-kernel.js';
import type { VaultPayload } from '../types.js';
import { workspaceDocument, type WorkspaceCommand } from './ai-workspace-model.js';
import { scopeVault } from './workspaces.js';

/** Explicit exact references open a scoped saved preview, never a navigation approval. */
export function savedDocumentPreviewId(kernel:ConversationKernel,vault:VaultPayload,message:string):string|null{
 if(kernel.scope.scope==='personal')return null;
 const text=message.normalize('NFKC').trim();
 const match=text.match(/^(?:افتح\s+معاينة\s+(?:(?:عرض السعر|الفاتورة|المستند)\s+)?|open\s+(?:a\s+)?(?:read-only\s+)?preview\s+(?:of\s+)?(?:quotation\s+|invoice\s+|document\s+)?)([a-z0-9_-]{1,120})(?:\s+فقط دون تعديل أو حفظ أي سجل|\s+دون تعديل أو حفظ|\s+only without (?:editing or saving|changes)|\s+فقط)?[.!؟]?$/iu);
 if(!match)return null;
 const reference=match[1]!.toUpperCase();
 const rows=scopeVault(vault).documents.filter(row=>row.kind!=='draft'&&(row.id.toUpperCase()===reference||row.number.toUpperCase()===reference));
 if(rows.length!==1)throw new Error(rows.length?'Document reference is ambiguous. Choose an exact record.':'Document not found in this company and branch.');
 return rows[0]!.id;
}
/** Exact local commands only. Ambiguous trade instructions use the existing review planner. */
export function commercialDraftCommand(kernel:ConversationKernel,vault:VaultPayload,message:string):WorkspaceCommand|null {
 if(!kernel.artifact||kernel.scope.scope==='personal')return null;
 const doc=workspaceDocument(kernel,vault,'en');if(!doc||doc.status!=='draft')return null;
 const digits='٠١٢٣٤٥٦٧٨٩',eastern='۰۱۲۳۴۵۶۷۸۹';
 const m=message.normalize('NFKC').replace(/[٠-٩۰-۹]/g,c=>String(digits.includes(c)?digits.indexOf(c):eastern.indexOf(c))).replace(/٫/g,'.').trim();
 const repricing=m.match(/^(?:reduce all (?:unit )?prices by|خفض سعر كل الأصناف بمقدار|خفض سعر جميع الأصناف بمقدار)\s+(\d+(?:\.\d+)?)\s+([A-Z]{3})\s+(?:except (?:the )?last (?:line )?by|إلا الأخير بمقدار|عدا الأخير بمقدار)\s+(\d+(?:\.\d+)?)(?:\s+([A-Z]{3}))?\s*[.!؟]?$/iu);
 if(repricing){if(repricing[4]&&repricing[4].toUpperCase()!==repricing[2]!.toUpperCase())throw new Error('Currencies differ; no repricing applied.');return{kind:'reprice',artifactId:doc.id,revision:doc.revision,currency:repricing[2]!.toUpperCase(),reduction:repricing[1]!,lastReduction:repricing[3]!};}
 // Recognize the complete conversational instruction, not a price fragment
 // inside unrelated text. The same revision-bound command performs the math.
 const natural=m.replace(/[\u064b-\u065f\u0670]/g,'').match(/^(?:في نفس المسودة[،,]\s*)?(?:أنقص|انقص|خفض)\s+سعر\s+(?:كل كرتون|كل بوكس|كل الأصناف|جميع الأصناف)\s+(.+?)\s*[،,]\s*(?:باستثناء|إلا|الا|عدا)\s+(?:الصنف الأخير|الصنف الاخير|الأخير|الاخير)\s+(?:أنقص|انقص|خفض)\s+(.+?)(?:[.!؟]\s*(?:أبق|ابق)\s+الكميات كما هي[،,]\s*ولا تحفظ[.!؟]?|[.!؟]\s*ولا تحفظ[.!؟]?|[.!؟]?)$/u);
 if(natural){
   const amount=(text:string)=>{
     const value=text.trim();
     if(/^نصف دولار$/.test(value))return{value:'0.5',currency:'USD'};
     if(/^دولارا?(?: كاملا?)?$/.test(value))return{value:'1',currency:'USD'};
     const numeric=value.match(/^(\d+(?:\.\d+)?)\s*(USD|EUR|SAR|TRY|دولار(?:ا)?|يورو|ريال)?$/iu);
     if(!numeric)return null;
     const unit=numeric[2]||doc.currency;
     return{value:numeric[1]!,currency:/^دولار/.test(unit)?'USD':unit==='يورو'?'EUR':unit==='ريال'?'SAR':unit.toUpperCase()};
   };
   const all=amount(natural[1]!),last=amount(natural[2]!);
   if(all&&last){if(all.currency!==last.currency||all.currency!==doc.currency)throw new Error('Currencies differ; no repricing applied.');return{kind:'reprice',artifactId:doc.id,revision:doc.revision,currency:all.currency,reduction:all.value,lastReduction:last.value};}
 }
 const terms=m.match(/^(?:change delivery to|غير التسليم إلى|غيّر التسليم إلى|عدل التسليم إلى)\s+((?:EXW|FCA|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\s+.{1,140})$/iu);
 if(terms)return{kind:'terms',artifactId:doc.id,revision:doc.revision,incoterm:terms[1]!,paymentTerms:doc.terms.find(t=>t.label==='paymentTerms')?.value||'',deliveryTime:doc.terms.find(t=>t.label==='deliveryTime')?.value||''};
 return null;
}

import type { ConversationKernel } from './ai-conversation-kernel.js';
import type { VaultPayload } from '../types.js';
import { workspaceDocument, type WorkspaceCommand } from './ai-workspace-model.js';
import { scopeVault } from './workspaces.js';

/** Read-only document requests must resolve an exact saved reference in the
 * current company/branch before the PDF workspace opens. Never infer the
 * "latest" document or use a partial number, and never save or issue here. */
export function savedDocumentPreviewId(kernel:ConversationKernel,vault:VaultPayload,message:string):string|null{
 if(kernel.scope.scope!=='business'||kernel.mode!=='controller'||
    kernel.scope.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
    kernel.scope.branchId!==(vault.appSettings.activeBranchId||'main'))return null;
 const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
 const normalize=(value:string)=>value.normalize('NFKC')
  .replace(/[٠-٩۰-۹]/g,ch=>String(ar.includes(ch)?ar.indexOf(ch):fa.indexOf(ch))).trim();
 const text=normalize(String(message||''));
 if(!text||text.length>1200)return null;
 const strict=text.match(/^(?:افتح\s+معاينة\s+(?:(?:عرض السعر|الفاتورة|المستند)\s+)?|open\s+(?:a\s+)?(?:read-only\s+)?preview\s+(?:of\s+)?(?:quotation\s+|invoice\s+|document\s+)?)([a-z0-9_-]{1,120})(?:\s+فقط دون تعديل أو حفظ أي سجل|\s+دون تعديل أو حفظ|\s+only without (?:editing or saving|changes)|\s+فقط)?[.!؟]?$/iu);
 const action=/^(?:افتح(?:\s+لي)?|أفتح(?:\s+لي)?|اعرض|أعرض|ارني|أرني|اظهر|أظهر|أعطني|اعطني|أرسل|ارسل|هات|جهز|جهّز|open|show|preview|download|give|send|generate)(?:\s|$)/iu.test(text);
 const subject=/(?:\bpdf\b|بي\s*دي\s*[إأا]ف|معاين[ةه]|(?:ال)?فاتور[ةه]|عرض\s*(?:ال)?سعر|(?:ال)?مستند|(?:ال)?وثيق[ةه]|\b(?:invoice|quotation|document|quote|preview)\b)/iu.test(text);
 // A question about a document or report navigation is not PDF authorization.
 if(!strict&&(!action||!subject||/^(?:افتح|أفتح)\s+(?:التقرير|تقرير)/iu.test(text)))return null;
 // This read-only shortcut may satisfy only one exact reference. Requests
 // combining preview with modification, issue, posting or deletion must not
 // silently execute just the preview half of a multi-step instruction.
 const withoutMutations=text
  .replace(/(?:دون|بدون|لا)\s+(?:تعديل|تعدّل|تعديلها|تعديله|تغيير|تغيّر|حفظ|حذف|إصدار|اعتماد|ترحيل)(?:\s+أو\s+(?:حفظ|تعديل|حذف|اعتماد|إصدار))*/giu,' ')
  .replace(/\b(?:without|do not|don't)\s+(?:editing|saving|changes|deleting|issuing)(?:\s+(?:or|and)\s+(?:editing|saving|deleting|issuing))*/giu,' ');
 if(/(?:\b(?:delete|remove|finalize|issue|post|modify|edit|update)\b|(?:احذف|أحذف|امسح|عدّل|عدل|غيّر|غير|اصدر|أصدر|رحّل|رحل|اعتمد)(?:\s|$))/iu.test(withoutMutations))return null;
 const referencedNumbers=[...text.matchAll(/\b[A-Z]{2,10}[-_]\d{2,}(?:[-_]\d{1,})+\b/giu)].map(m=>m[0]!.toUpperCase());
 if(new Set(referencedNumbers).size>1)throw new Error('Document reference is ambiguous. Choose exactly one saved document.');
 const scoped=scopeVault(vault);
 const escaped=(value:string)=>value.replace(/[.*+?^$()|[\]{}]/g,'\\$&');
 const contains=(reference:string)=>{
   if(!reference||reference.length>120)return false;
   return new RegExp('(^|[^\\p{L}\\p{N}_-])'+escaped(normalize(reference))+'(?=$|[^\\p{L}\\p{N}_-])','iu').test(text);
 };
 const matches=scoped.documents.filter(row=>row.kind!=='draft'&&
   (contains(String(row.id||''))||contains(String(row.number||''))));
 if(matches.length>1)throw new Error('Document reference is ambiguous. Choose exactly one saved document.');
 if(matches.length===1)return matches[0]!.id;
 // A user supplied an exact reference but it is not in the scoped vault.
 // Never substitute the last unrelated document or generic navigation.
 if(strict||/(?:رقم|number|#)\s*[:#]?\s*[A-Z0-9][A-Z0-9_-]{2,119}/iu.test(text)||
   /\b[A-Z]{2,10}[-_]\d{2,}(?:[-_]\d{1,})+\b/iu.test(text))
   throw new Error('Document not found in this company and branch.');
 return null;
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

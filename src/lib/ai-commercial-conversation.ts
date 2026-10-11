import type { ConversationKernel } from './ai-conversation-kernel.js';
import type { VaultPayload } from '../types.js';
import { workspaceDocument, type WorkspaceCommand } from './ai-workspace-model.js';
/** Exact local commands only. Ambiguous trade instructions use the existing review planner. */
export function commercialDraftCommand(kernel:ConversationKernel,vault:VaultPayload,message:string):WorkspaceCommand|null {
 if(!kernel.artifact||kernel.scope.scope==='personal')return null;
 const doc=workspaceDocument(kernel,vault,'en');if(!doc||doc.status!=='draft')return null;
 const digits='٠١٢٣٤٥٦٧٨٩',eastern='۰۱۲۳۴۵۶۷۸۹';
 const m=message.normalize('NFKC').replace(/[٠-٩۰-۹]/g,c=>String(digits.includes(c)?digits.indexOf(c):eastern.indexOf(c))).replace(/٫/g,'.').trim();
 const repricing=m.match(/^(?:reduce all (?:unit )?prices by|خفض سعر كل الأصناف بمقدار|خفض سعر جميع الأصناف بمقدار)\s+(\d+(?:\.\d+)?)\s+([A-Z]{3})\s+(?:except (?:the )?last (?:line )?by|إلا الأخير بمقدار|عدا الأخير بمقدار)\s+(\d+(?:\.\d+)?)(?:\s+([A-Z]{3}))?\s*[.!؟]?$/iu);
 if(repricing){if(repricing[4]&&repricing[4].toUpperCase()!==repricing[2]!.toUpperCase())throw new Error('Currencies differ; no repricing applied.');return{kind:'reprice',artifactId:doc.id,revision:doc.revision,currency:repricing[2]!.toUpperCase(),reduction:repricing[1]!,lastReduction:repricing[3]!};}
 const terms=m.match(/^(?:change delivery to|غير التسليم إلى|غيّر التسليم إلى|عدل التسليم إلى)\s+((?:EXW|FCA|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\s+.{1,140})$/iu);
 if(terms)return{kind:'terms',artifactId:doc.id,revision:doc.revision,incoterm:terms[1]!,paymentTerms:doc.terms.find(t=>t.label==='paymentTerms')?.value||'',deliveryTime:doc.terms.find(t=>t.label==='deliveryTime')?.value||''};
 return null;
}

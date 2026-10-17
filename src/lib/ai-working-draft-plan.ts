import type {ConversationKernel} from './ai-conversation-kernel.js';
import type {VaultPayload} from '../types.js';
import {applyWorkspaceCommand,workspaceDocument,workspaceDrafting} from './ai-workspace-model.js';
import {aiDraftUndoDepth} from './ai-document-limits.js';
import {normalizeDecimalInput} from './money.js';

/** A PDF refresh is an output request following an unsaved field edit, not
 * an extra draft cell operation. Never interpret an explicit negation as consent. */
export function wantsWorkingDraftPdfRefresh(message:string):boolean{
  const text=String(message||'').normalize('NFKC');
  if(!/\bpdf\b|بي\s*دي\s*[إأا]ف/iu.test(text))return false;
  if(/(?:لا|دون|بدون|never|don't|do not|without)\s+(?:حدّث|حدث|تحديث|إنشاء|انشاء|عرض|معاينة|update|refresh|generate|show|open|preview)?\s*(?:معاينة\s*)?(?:\bpdf\b|بي\s*دي\s*[إأا]ف)/iu.test(text))return false;
  return /معاين|اعرض|أعرض|اظهر|أظهر|حد[ّث]?|تحديث|جدد|جدّد|جهز|جهّز|أنشئ|انشئ|preview|refresh|update|generate|render|show|open/iu.test(text);
}

/** Model patches are untrusted. Revalidate scope, version, exact line identity
 * and replacement evidence locally; never copy a model-supplied document. */
export function applyWorkingDraftPlan(kernel:ConversationKernel,vault:VaultPayload,plan:any,message:string):ConversationKernel{
  const a=kernel.artifact;
  if(kernel.mode!=='controller'||kernel.scope.scope!=='business'||!a||plan?.action!=='edit'||
    plan.artifactId!==a.id||plan.revision!==a.revision||!Array.isArray(plan.operations)||
    !plan.operations.length||plan.operations.length>20)throw new Error('The draft or plan changed. Nothing was modified.');
  const current=workspaceDocument(kernel,vault,'en');
  if(!current)throw new Error('The document is outside the active company.');
  const next=structuredClone(kernel),seen=new Set<string>();
  for(const op of plan.operations){
    if(op?.field==='customerId'){
      const matches=workspaceDrafting(vault).customers.filter(row=>row.name.trim().toLocaleLowerCase()===String(op.evidence||'').trim().toLocaleLowerCase());
      if(matches.length!==1||matches[0]!.id!==op.value||!message.includes(op.evidence)||seen.has('customerId'))throw new Error('Identify one exact existing customer.');
      seen.add('customerId');applyWorkspaceCommand(next,vault,{kind:'customer',artifactId:a.id,revision:next.artifact!.revision,entityId:op.value});continue;
    }
    if(!op||Object.keys(op).some(key=>!['lineId','field','value','evidence'].includes(key))||
      !current.rows.some(row=>row.id===op.lineId)||
      !['quantity','unitPrice','descriptionEn','descriptionAr','unit'].includes(op.field)||
      typeof op.value!=='string'||typeof op.evidence!=='string'||!op.evidence.trim()||!message.includes(op.evidence))
      throw new Error('The edit is not grounded in this request and document.');
    const numeric=op.field==='quantity'||op.field==='unitPrice';
    if(numeric){
      const supplied:string[]=(String(op.evidence).match(/-?[0-9٠-٩۰-۹]+(?:[.,٫][0-9٠-٩۰-۹]+)?/g)||[]).map(normalizeDecimalInput);
      if(!supplied.some(value=>Number(value)===Number(op.value))||!/^\d+(?:\.\d+)?$/.test(op.value))
        throw new Error('The requested numeric value is missing from the user message.');
    }else if(!op.evidence.includes(op.value))throw new Error('The replacement text was not supplied by the user.');
    const key=op.lineId+'|'+op.field;if(seen.has(key))throw new Error('Conflicting edits need clarification.');seen.add(key);
    applyWorkspaceCommand(next,vault,{kind:'cell',artifactId:a.id,revision:next.artifact!.revision,
      lineId:op.lineId,field:op.field,value:op.value});
  }
  if(JSON.stringify(next.artifact!.proposal)===JSON.stringify(a.proposal))return kernel;
  // One user turn is one undo revision, regardless of the number of patches.
  const limit=aiDraftUndoDepth(current.rows.length);
  next.artifact!.undo=[...a.undo,structuredClone(a.proposal)].slice(-limit);
  next.artifact!.undoLineIds=[...(a.undoLineIds||[]),[...a.lineIds]].slice(-limit);
  next.artifact!.redo=[];next.artifact!.redoLineIds=[];next.artifact!.revision=a.revision+1;
  return next;
}

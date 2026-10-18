import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const target='dist/src/components/AiCopilot.js';
let source=await readFile(target,'utf8');
if(!source.includes('__lourexNaturalLanguageOsBatch4'))throw new Error('AI conversation Batch 4 closeout requires the Stage 4 owner.');
if(source.includes('__lourexNaturalLanguageOsBatch4Closeout'))throw new Error('AI conversation Batch 4 closeout is already installed.');

// The Stage 4 owner now implements complete cancellation itself. Keep this
// closeout as a guard, not a second replacement of an obsolete implementation.
if(!source.includes("__lourexAdvanceToolPresentation(instance,'dismissed')")||!source.includes("Remaining steps cancelled"))throw new Error('AI conversation Batch 4 closeout requires the hardened cancellation lifecycle.');
if(!source.includes("status:'dismissed'"))throw new Error('AI conversation Batch 4 closeout requires cancelled steps to lose approval state.');

const messageToken="if(tokens.has('lourex-ai-messages')){const card=__lourexToolActivityCard(instance);if(card)children.push(card);}";
if(!source.includes(messageToken))throw new Error('AI conversation Batch 4 closeout could not find the tool activity placement.');
source=source.replace(messageToken,"if(tokens.has('lourex-ai-messages')&&(instance.state?.messages||[]).length){const card=__lourexToolActivityCard(instance);if(card)children.push(card);}");

/* Keep executive response structure fully localized. Stage 4 originally emitted
   English section headings even when the conversation language was Arabic. */
const localizedSections=[
  ["ar?'Summary':'Summary'","ar?'ملخص':'Summary'"],
  ["ar?'Known':'Known'","ar?'معلومات مسجلة':'Known'"],
  ["ar?'Actions':'Actions'","ar?'إجراءات للمراجعة':'Actions'"],
  ["ar?'Warning':'Warning'","ar?'تنبيه':'Warning'"],
  ["ar?'Risk':'Risk'","ar?'مخاطر':'Risk'"],
  ["instance.props.language==='ar'?'Actions: تم تطبيق الخطوة بعد موافقتك. ':'Actions: Step applied after your approval. '","instance.props.language==='ar'?'الإجراءات: تم تطبيق الخطوة بعد موافقتك. ':'Actions: Step applied after your approval. '"]
];
for(const [before,after] of localizedSections){
  // Stage 4 may already have localized headings during a later AI repair.
  // Accept the canonical Arabic output, but do not silently accept a missing owner.
  if(source.includes(before))source=source.replaceAll(before,after);
  else if(!source.includes(after))throw new Error(`AI conversation Batch 4 closeout could not localize section token: ${before}`);
}

// The final chat reply renderer must not flatten statement rows into "Entries: ...".
const historyToken="const detail=row.tool==='document.get'?formatAiDocumentEvidence(row.data,ar?'ar':'en'):__lourexCompactObject(row.data,0,ar)";
if(!source.includes(historyToken))throw new Error('Shipped AI customer-history formatter owner changed; refusing silent truncation.');
const explicitHistory="const detail=row.tool==='customer.getHistory'?formatAiCustomerHistoryEvidence(row.data,ar?'ar':'en'):row.tool==='customer.getSummary'?formatAiCustomerSummaryEvidence(row.data,ar?'ar':'en'):"+historyToken.slice('const detail='.length);
source="import {formatAiCustomerHistoryEvidence,formatAiCustomerSummaryEvidence} from '../lib/ai-tool-presentation.js';\n"+source.replace(historyToken,explicitHistory);

source+='\nconst __lourexNaturalLanguageOsBatch4Closeout=true;\n';
if(!source.includes("__lourexAdvanceToolPresentation(instance,'dismissed')"))throw new Error('AI conversation Batch 4 closeout failed to retain cancellation handling.');
if(!source.includes("tokens.has('lourex-ai-messages')&&(instance.state?.messages||[]).length"))throw new Error('AI conversation Batch 4 closeout failed to hide stale tool activity in blank conversations.');
if(!source.includes("ar?'ملخص':'Summary'")||!source.includes("ar?'معلومات مسجلة':'Known'")||!source.includes("ar?'إجراءات للمراجعة':'Actions'")||!source.includes("ar?'تنبيه':'Warning'")||!source.includes("ar?'مخاطر':'Risk'"))throw new Error('AI conversation Batch 4 closeout failed to localize Arabic executive sections.');
await writeFile(target,source);
execFileSync(process.execPath,['--check',target],{stdio:'inherit'});
console.log('[LOUREX AI] Conversation Batch 4 closeout installed: dismissed plans clear all pending approval states, blank conversations cannot show stale tool activity, and executive sections remain localized in Arabic.');

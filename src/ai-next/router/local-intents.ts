/**
 * R05 local intents. These are syntactically unambiguous operations only.
 * They do not claim broader NLU, persist drafts or invoke any AI provider.
 */
import type {AuthenticatedScope,ReviewDraft} from '../domain/contracts.js';
import {newReviewDraft} from '../guarded-finance/drafts.js';
import type {R05TaskClass} from './eligibility.js';

const arabicMarks=/[\u064b-\u065f\u0670\u0640]/g;
function normalize(input:string):string {
  return input.normalize('NFKC').replace(arabicMarks,'').trim()
    .replace(/[.!؟?،,؛;]+$/gu,'').replace(/\s+/gu,' ').toLowerCase();
}
const greetings=new Map<string,string>([
  ['السلام عليكم','وعليكم السلام ورحمة الله وبركاته. كيف يمكنني مساعدتك؟'],
  ['السلام عليكم ورحمة الله وبركاته','وعليكم السلام ورحمة الله وبركاته. كيف يمكنني مساعدتك؟'],
  ['مرحبا','مرحباً، كيف يمكنني مساعدتك؟'],
  ['اهلا','أهلاً، كيف يمكنني مساعدتك؟'],
  ['أهلا','أهلاً، كيف يمكنني مساعدتك؟'],
  ['hi','Hello. How can I help?'],
  ['hello','Hello. How can I help?'],
  ['شكرا','على الرحب والسعة.'],
  ['شكراً','على الرحب والسعة.'],
  ['thanks','You're welcome.'],
  ['thank you','You're welcome.'],
]);
const blankQuote=/^(?:أنشئ|انشئ|أنشأ|ابدأ|ابدا|افتح|سوي|اعمل|create|start|open)\s+(?:(?:لي|من فضلك)\s+)?(?:مسودة\s+)?(?:عرض\s+سعر|quotation(?:\s+draft)?|quote(?:\s+draft)?)\s*(?:جديد(?:ة|ا)?|new|فارغ(?:ة|ا)?)?$/iu;
const blankQuoteAlt=/^(?:new|empty)\s+(?:quote|quotation)\s+draft$/iu;

export type LocalR05Intent = {kind:'greeting';reply:string} | {kind:'new_quote_draft'};
export function recognizeR05LocalIntent(text:string,attachmentCount=0):LocalR05Intent|null{
  if(typeof text!=='string'||text.length>6000||attachmentCount!==0)return null;
  const value=normalize(text);
  if(greetings.has(value))return {kind:'greeting',reply:greetings.get(value)!};
  if(blankQuote.test(value)||blankQuoteAlt.test(value))return {kind:'new_quote_draft'};
  return null;
}
export function classifyR05Task(text:string,attachmentCount=0):R05TaskClass{
  const local=recognizeR05LocalIntent(text,attachmentCount);
  if(local)return local.kind==='greeting'?'local_greeting':'local_draft_start';
  const value=normalize(text);
  if(!value)return 'clarification';
  if(/\b(approve|approval|execute|save invoice|post payment)\b|(?:وافق|اعتمد|احفظ\s+الفاتورة|رحل\s+القيد)/iu.test(value))
    return 'approval_preparation'; // still NOT an execution permission
  if(/(?:غير|عدل|عدّل|احذف|اضف|أضف)\s+|(?:edit|change|remove|add)\s+/iu.test(value))
    return 'draft_modification';
  if(/(?:الملف|المرفق|المستند|pdf|excel|spreadsheet|attachment|file|document)/iu.test(value))
    return /(?:قارن|compare|مقارنة)/iu.test(value)?'document_comparison':'document_read';
  if(/(?:عرض\s+سعر|quotation|quote)/iu.test(value))
    return 'quotation_preparation';
  if(/(?:رصيد|عميل|شركة|منتجات الشركة|inventory|customer|company records)/iu.test(value))
    return 'business_read';
  if(/(?:تحليل|ارباح|أرباح|profit|financial analysis)/iu.test(value))
    return 'financial_analysis';
  return 'general_conversation';
}
export type LocalR05Result =
  | {kind:'reply';reply:string;providerCalls:0}
  | {kind:'draft';reply:string;draft:ReviewDraft;providerCalls:0};

export async function runR05Local(input:{
  text:string;
  attachedSourceIds:readonly string[];
  // These values must come from an authenticated server coordinator.
  scope:AuthenticatedScope;
  draftId:string;
  now:string;
}):Promise<LocalR05Result|null>{
  const intent=recognizeR05LocalIntent(input.text,input.attachedSourceIds.length);
  if(!intent)return null;
  if(intent.kind==='greeting')return {kind:'reply',reply:intent.reply,providerCalls:0};
  // This is an UNSAVED local proposal; do not call any finance save API.
  const draft=await newReviewDraft({
    scope:input.scope,draftId:input.draftId,kind:'quotation',sourceIds:[],
    sourceManifestHash:'0'.repeat(64),lineItems:[],customerId:null,currency:null,now:input.now,
  });
  return {
    kind:'draft',providerCalls:0,draft,
    reply:'تم بدء مسودة عرض سعر غير محفوظة. من هو العميل، وما الأصناف والكميات والأسعار المطلوبة؟',
  };
}

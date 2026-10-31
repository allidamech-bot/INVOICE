/**
 * R07P: conservative bilingual structured-intent recognizer.
 *
 * Entire-utterance templates only, never a provider, finance writer,
 * entitlement grant, or a trusted business fact. The R07P planner MUST
 * authenticate the actor and load audited context before proposing edits.
 * An unrecognized phrase is not a guess: the semantic path owns it.
 */
import type {R07PSemanticCandidate} from './semantic-planner.js';

export const R07P_LOCAL_STRUCTURED_INTENTS_ACTIVE=false as const;
type Fact=R07PSemanticCandidate['facts'][number];

const marks=/[\u064b-\u065f\u0670\u0640]/gu;
const eastern=/[\u0660-\u0669\u06f0-\u06f9]/gu;
function normalize(raw:string,lower=true):string{
  const normalized=raw.normalize('NFKC').replace(marks,'')
    .replace(eastern,c=>String(c.charCodeAt(0)-
      (c.charCodeAt(0)<=0x0669?0x0660:0x06f0)))
    .replace(/[،,؛;]+/gu,' ')
    .replace(/[.!؟?]+$/gu,'')
    .trim().replace(/\s+/gu,' ');
  return lower?normalized.replace(/[أإآ]/gu,'ا').toLowerCase():normalized;
}
const make=(action:R07PSemanticCandidate['action'],
  reference:R07PSemanticCandidate['reference'],
  facts:Fact[]=[],missingFields:string[]=[]):R07PSemanticCandidate=>({
  action,reference,subject:null,facts,missingFields,sourceIds:[],
});
const edit=(name:string,value:string):R07PSemanticCandidate=>
  make('edit_draft','active_draft',[{name,value}]);
const number=(raw:string):string|null=>{
  if(!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u.test(raw))return null;
  return raw;
};
const numberWord=(raw:string):string|null=>
  raw==='twelve'?'12':raw==='عشرين'?'20':number(raw);
const unsafeCompound=/(?:^| )(?:و?(?:احفظ|اصدر|وافق|اعتمد|نفذ|احذف)|save|issue|approve|execute|post|delete|and then|then)(?: |$)/iu;
const clientName=/^[\p{L}\p{M}\p{N} .'-]{2,100}$/u;

/**
 * With the local, opt-in Controller enabled, never allow a downstream model
 * to reinterpret just ONE part of an unsafe or unsupported compound command.
 * This rejects unsupported multiple targets until a real, receipt-aware
 * batch-authorization protocol exists. It does not mutate any draft.
 */
export function requiresR07PCompoundClarification(raw:string):boolean{
  if(typeof raw!=='string'||raw.length>6000)return false;
  const value=normalize(raw);
  if(['احفظ العرض واصدره','approve and post this invoice'].includes(value))
    return false; // Already approval-only in R07P, NEVER an execution.
  if(unsafeCompound.test(value))return true;
  const targets=[
    /(?:العميل|customer)/u,
    /(?:العملة|currency)/u,
    /(?:الكمية|quantity)/u,
    /(?:السعر|price)/u,
  ];
  const mentions=targets.filter(r=>r.test(value)).length;
  // Only full-utterance recognized patches may combine fields.
  return mentions>=2 && /(?: و[\p{L}]| and )/u.test(value) &&
    recognizeR07PLocalStructuredIntent(raw)===null;
}

/**
 * Returns only syntactic candidates; no account, draft, line, price or
 * customer is ever verified here. No automatic finance execution intent.
 */
export function recognizeR07PLocalStructuredIntent(raw:string):
  R07PSemanticCandidate|null{
  if(typeof raw!=='string'||raw.length>300||
    /[\u0000-\u001f\u007f]/u.test(raw))return null;
  const value=normalize(raw);
  if(!value)return null;
  if(value==='احفظ العرض واصدره')
    return make('request_approval','active_draft');
  if(value==='approve and post this invoice')
    return make('request_approval','none');
  if(unsafeCompound.test(value))return null;

  // A single, fully scoped line patch can safely contain BOTH fields.
  // This is NOT a general multi-action executor: the existing R07P
  // audited context must verify exactly one line, and R07R applies one
  // transactional review-draft revision with one R07D receipt.
  // Match the entire sentence; extra instructions, currency or approval
  // words must not be silently dropped.
  let paired=value.match(
    /^(?:خلي|غير|عدل) الكمية (\d{1,12}(?:\.\d{1,6})?) و(?:السعر|سعر القطعة) (\d{1,12}(?:\.\d{1,6})?)$/u
  )||value.match(
    /^set (?:the )?quantity to (\d{1,12}(?:\.\d{1,6})?) and (?:the )?unit price to (\d{1,12}(?:\.\d{1,6})?)$/u
  );
  if(paired){
    const quantity=number(paired[1]!),price=number(paired[2]!);
    return quantity&&quantity!=='0'&&price?
      make('edit_draft','active_draft',[
        {name:'quantity',value:quantity},
        {name:'selling_unit_price',value:price},
      ]):null;
  }
  paired=value.match(
    /^(?:خلي|غير|عدل) (?:السعر|سعر القطعة) (\d{1,12}(?:\.\d{1,6})?) والكمية (\d{1,12}(?:\.\d{1,6})?)$/u
  )||value.match(
    /^set (?:the )?unit price to (\d{1,12}(?:\.\d{1,6})?) and (?:the )?quantity to (\d{1,12}(?:\.\d{1,6})?)$/u
  );
  if(paired){
    const price=number(paired[1]!),quantity=number(paired[2]!);
    return quantity&&quantity!=='0'&&price?
      make('edit_draft','active_draft',[
        {name:'quantity',value:quantity},
        {name:'selling_unit_price',value:price},
      ]):null;
  }

  // Exact no-write/read-only controls.
  if(['لا تحفظ العرض هلق',"don't issue it yet"].includes(value))
    return make('discuss','active_draft');
  if(['فرجيني مسودة العرض','show the current quote draft',
    'اعمل preview للمسودة'].includes(value))
    return make('preview_draft','active_draft');
  if(['اقرا اخر عرض سعر عملناه','read the last quotation'].includes(value))
    return make('read_business','last_quotation');
  if(['اقرا الملف المرفق وحضر معلوماته',
    'read the attached spreadsheet and extract line items',
    'اقرا الـ pdf اللي ارسلته'].includes(value))
    return make('read_file','none',[],['verified_source']);

  // An explicit approval phrase above is proposal-only and cannot execute.
  // Customer aliases remain untrusted until the existing server-side
  // unique-customer resolver identifies a scoped customer.
  let match=value.match(/^(?:خلي|حط|غير|عدل) العميل (.+)$/u)||
    value.match(/^لا قصدي العميل (.+)$/u)||
    value.match(/^change the customer to (.+)$/u);
  if(match){
    const original=normalize(raw,false);
    const originalMatch=original.match(/^(?:خلي|حط|غير|عدل) العميل (.+)$/iu)||
      original.match(/^لا قصدي العميل (.+)$/iu)||
      original.match(/^change the customer to (.+)$/iu);
    const alias=originalMatch?.[1]?.trim()??'';
    if(!clientName.test(alias))return null;
    return edit('customer_name',alias);
  }
  // Corrections explicitly take the FINAL requested quantity, never the
  // old value from "20 -> 30".
  match=value.match(/^بدل الكمية \d{1,12} خليها (\d{1,12})$/u);
  if(match){
    const n=number(match[1]!);
    return n?edit('quantity',n):null;
  }
  match=value.match(/^بدل عدد القطع الى (\d{1,12}|عشرين)$/u)||
    value.match(/^set the quantity to (\d{1,12}|twelve)$/u);
  if(match){
    const n=numberWord(match[1]!);
    return n?edit('quantity',n):null;
  }
  match=value.match(/^(?:لا )?خلي (?:الكمية|quantity) (\d{1,12})(?: (pcs))?$/iu);
  if(match){
    const n=number(match[1]!);
    return n?make('edit_draft','active_draft',
      [...[{name:'quantity',value:n}],...(match[2]?[{name:'unit',value:'PCS'}]:[])]):null;
  }
  // Never resolve "second item" from a model-proposed ordinal. Explicitly
  // request an authoritative line ID, even when one line exists.
  match=value.match(/^بالنسبة لل second item خلي الكمية (\d{1,12})$/u);
  if(match){
    const n=number(match[1]!);
    return n?make('edit_draft','active_draft',
      [{name:'quantity',value:n}],['line_id']):null;
  }

  match=value.match(/^السعر مو \d{1,12}(?:\.\d{1,6})? هو (\d{1,12}(?:\.\d{1,6})?)$/u)||
    value.match(/^خلي سعر القطعة (\d{1,12}(?:\.\d{1,6})?) دولار$/u)||
    value.match(/^i meant a unit price of (\d{1,12}(?:\.\d{1,6})?) dollars?$/u)||
    value.match(/^عدل price الى (\d{1,12}(?:\.\d{1,6})?) usd$/u);
  if(match){
    const n=number(match[1]!);
    return n?edit('selling_unit_price',n):null;
  }
  if(['خلي العملة دولار امريكي','خلي العملة usd',
    'خلي currency usd'].includes(value))
    return edit('currency','USD');
  if(['غير الوحدة لكرتون','change the unit to cartons'].includes(value))
    return edit('unit','carton');
  if(value==='عدل السعر')
    return make('edit_draft','active_draft',[],['selling_unit_price']);
  if(value==='change that one')
    return make('edit_draft','active_draft',[],['target_field','line_id']);
  if(value==='خلي نفس السعر للصنف الاول')
    return make('edit_draft','active_draft',[],['selling_unit_price','line_id']);

  return null;
}

/** Bounded local interpretation. Only control words are normalized; source
 * document names, SKUs and values are never rewritten by this interpreter. */
export type DraftMessageIntent =
  | {kind:'edit'; command:string; preview:boolean; days:number}
  | {kind:'read'; field:'subtotal'|'validity'}
  | {kind:'clarify'} | {kind:'semantic'} | {kind:'other'};
function tokens(message:string):string[]{
  return message.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/gu,'').replace(/[أإآ]/gu,'ا')
    .replace(/[٠-٩۰-۹]/gu,c=>String('٠١٢٣٤٥٦٧٨٩'.includes(c)?'٠١٢٣٤٥٦٧٨٩'.indexOf(c):'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .toLowerCase().replace(/[،,.!?؟:؛]/gu,' ').trim().split(/\s+/u).filter(Boolean).map(word=>({صلاحيه:'صلاحية',الصلاحيه:'الصلاحية',خللي:'خلي',خليلي:'خلي'} as Record<string,string>)[word]??word);
}
const numbers:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,واحد:1,واحدة:1,اثنين:2,اثنان:2,ثلاثة:3,اربعة:4,خمسة:5,ستة:6,سبعة:7,ثمانية:8,تسعة:9,عشرة:10,اتناشر:12,تنعش:12,ثنعش:12,اثناشر:12,اثناعشر:12};
const fieldWords=new Set(['صلاحية','الصلاحية','صالح','صالحة','validity','valid']);
const contextWords=new Set(['العرض','عرض','السعر','سعر','quotation','quote','offer','the','a','this','هالعرض','مسودة','المسودة','draft']);
const verbs=new Set(['خلي','خلى','خل','اجعل','غير','عدل','حدد','بدي','ابي','ابغى','اريد','عايز','set','change','update','make','keep']);
const grammar=new Set(['الى','لمدة','مدة','يضل','يظل','يبقى','يكون','for','to','be','it']);
const dayWords=new Set(['يوم','يوما','ايام','days','day']);
const previewWords=new Set(['اعد','تجهيز','جهز','افتح','اعرض','ورجيني','وريني','المعاينة','معاينة','pdf','preview','show','open','refresh','regenerate','the','please']);
export function interpretDraftMessage(message:string):DraftMessageIntent{
  const normalized=tokens(message);
  if(!normalized.length)return{kind:'clarify'};
  // Bare number and meaningless keyboard tokens have no executable semantics.
  if(normalized.length===1&&(/^\d+$/.test(normalized[0]!)||/^(?:abcxyz|[bcdfghjklmnpqrstvwxyz]{5,})$/i.test(normalized[0]!)))return{kind:'clarify'};
  const field=normalized.some(word=>fieldWords.has(word));
  const question=normalized.some(word=>['شو','كم','ما','what','whats'].includes(word));
  if(question&&normalized.some(word=>['اجمالي','الاجمالي','المجموع','total','subtotal'].includes(word))&&normalized.every(word=>contextWords.has(word)||['شو','كم','ما','هو','اجمالي','الاجمالي','المجموع','total','subtotal','what','whats','is'].includes(word)))return{kind:'read',field:'subtotal'};
  if(['لا اللي قبله','previous one','no previous one'].includes(normalized.join(' ')))return{kind:'semantic'};
  if(!field){
    // Only an action-bearing turn may enter the semantic draft planner.
    // Numbers and ordinary questions alone are not edit authorization.
    const actions=new Set([...verbs,'save','approve','confirm','احفظ','اعتمد','جهز','انشئ','اعمل','prepare','create','generate','edit','correct','put','replace','remove','delete','add','increase','reduce','undo','redo','اضف','ضيف','احذف','امسح','تراجع','ارجع','اعد','صحح','ارفع','زد','بدل','تغير','تضف','ترفع','تصحيح','تعديل']);
    return normalized.some(word=>actions.has(word))?{kind:'semantic'}:{kind:'other'};
  }
  if(question&&!normalized.some(word=>verbs.has(word)))return{kind:'read',field:'validity'};
  const segments=message.split(/\s+(?:ثم|و?بعدين|and\s+then|then)\s+|\s*&&\s*/iu);
  if(segments.length>2)return{kind:'clarify'};
  const controls=tokens(segments[0]!);
  if(!controls.some(word=>verbs.has(word)))return{kind:'clarify'};
  let preview=false;
  if(segments.length===2){
    const output=tokens(segments[1]!);
    if(!output.length||!output.some(word=>['المعاينة','معاينة','preview','pdf'].includes(word))||!output.every(word=>previewWords.has(word)))return{kind:'clarify'};
    preview=true;
  }
  // Remove a bounded date anchor only; never accept a second unvalidated action.
  const anchor=['from quotation date','from quote date','من تاريخ العرض','من تاريخ عرض السعر'];
  let body=controls.join(' ');
  for(const suffix of anchor)if(body.endsWith(suffix))body=body.slice(0,-suffix.length).trim();
  body=body.replace(/اثني عشر|اثنا عشر|اثني عشره|اثنا عشره/gu,'12');
  const words=body.split(' '),values:number[]=[];
  for(const word of words){
    if(/^\d{1,4}$/.test(word))values.push(Number(word));
    else if(Object.hasOwn(numbers,word))values.push(numbers[word]!);
    else if(!fieldWords.has(word)&&!contextWords.has(word)&&!verbs.has(word)&&!grammar.has(word)&&!dayWords.has(word)&&word!=='please')return{kind:'clarify'};
  }
  if(values.length!==1||!words.some(word=>dayWords.has(word))||values[0]!<1||values[0]!>3650)return{kind:'clarify'};
  return{kind:'edit',days:values[0]!,command:`set validity to ${values[0]} days`,preview};
}

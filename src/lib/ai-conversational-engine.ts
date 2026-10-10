import {resumeVaultSession} from '../storage/vault.js';
import type {VaultPayload} from '../types.js';
import type {AiDocumentDraftProposal} from '../components/AiCopilot.js';
import {calculateTotals,decimalToScaled,lineTotal,normalizeDecimalInput} from './money.js';
import {scopeVault} from './workspaces.js';
import {requestAiJson} from './ai-request.js';
import {assistantCapabilityAllowed} from './ai-assistant-foundation.js';
import {loadAssistantState,saveAssistantState} from '../storage/assistant-store.js';

export interface CommercialLine{id:string;name:string;quantity:string;price:string;unit:string;pallets:string;cartonsPerPallet:string;containers:string;cartonsPerContainer:string;}
export interface ConversationDraft{version:1;revision:number;kind:'proforma'|'invoice';currency:string;customerId:string;lines:CommercialLine[];shipping:string;delivery:string;paymentTerms:string;incoterm:string;notes:string;pallets:string;containers:string;focus:string;changes:Array<{label:string;before:string;after:string;}>;warnings:string[];}
export interface CustomerChoice{id:string;name:string;}
export interface ConversationalSession{summary?:string;draft:ConversationDraft|null;customers:CustomerChoice[];history:Array<{role:'user'|'assistant';text:string;}>;}
export interface SemanticOperation{type:string;target:string;field:string;value:string;quantity:string;price:string;unit:string;mode:string;evidence:string;}
export const emptyConversationalSession=():ConversationalSession=>({draft:null,customers:[],history:[]});
const sessions=new Map<string,ConversationalSession>();
export function customerOrdinal(message:string):number|null{
  const input=norm(message).replace(/[.!؟]+$/g,'');
  const words:Record<string,number>={'الأول':1,'الاول':1,'الأولى':1,'الاولى':1,'الثاني':2,'الثانية':2,'الثالث':3,'الثالثة':3,'الرابع':4,'الرابعة':4,'الخامس':5,'الخامسة':5,'first':1,'second':2,'third':3,'fourth':4,'fifth':5};
  const token=input.replace(/^(?:اختار|اختر|اختَر|بدي|the|choose|select)\s+(?:العميل\s+|customer\s+)?/,'').replace(/\s+(?:واحد|one)$/,'');
  if(words[token])return words[token]!;
  const match=input.match(/^(?:(?:اختر|اختار)\s+العميل\s+(?:رقم\s+)?|choose customer number |select customer )([0-9٠-٩]{1,2})$/);
  return match?Number(normalizeDecimalInput(match[1]!)):null;
}
const str=(v:unknown,max=500):string=>typeof v==='string'?v.trim().slice(0,max):'';
function decimal(v:string,positive=false):string{
  const result=normalizeDecimalInput(v);
  if(!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,4})?$/.test(result)||(positive&&decimalToScaled(result)<=0n))throw new Error('Invalid decimal / رقم غير صالح');
  return result;
}
function scaled(v:bigint):string{const neg=v<0n;const n=neg?-v:v;return(neg?'-':'')+String(n/10000n)+'.'+String(n%10000n).padStart(4,'0');}
function norm(v:string):string{return v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();}
function groundNumber(value:string,evidence:string):void{
  const target=decimalToScaled(decimal(value));
  const tokens=evidence.match(/[0-9٠-٩۰-۹]+(?:[.,٫٬][0-9٠-٩۰-۹]+)*/g)||[];
  if(tokens.some(token=>decimalToScaled(normalizeDecimalInput(token))===target))return;
  if(target===5000n&&/(?:نص|نصف|half)/iu.test(evidence))return;
  throw new Error('The number is not grounded in your message / الرقم غير موجود في رسالتك');
}
const freshDraft=():ConversationDraft=>({version:1,revision:0,kind:'proforma',currency:'',customerId:'',lines:[],shipping:'',delivery:'',paymentTerms:'',incoterm:'',notes:'',pallets:'',containers:'',focus:'',changes:[],warnings:[]});

/** Transactional reducer: model understands meaning; this reducer validates
 * provenance, resolves identities and performs decimal arithmetic. No vault writes. */
export function reviseConversationalSession(previous:ConversationalSession,operations:SemanticOperation[],message:string,sourceTexts:string[]=[]):ConversationalSession{
  if(!Array.isArray(operations)||operations.length>200)throw new Error('Too many draft revisions. No line was dropped.');
  const next:ConversationalSession=JSON.parse(JSON.stringify(previous));
  if(!operations.length)return next;
  const draft=next.draft??freshDraft();draft.changes=[];draft.warnings=[];
  const change=(label:string,before:string,after:string)=>draft.changes.push({label,before,after});
  for(const op of operations){
    const evidence=str(op.evidence,6000);
    if(!evidence||(!message.includes(evidence)&&!sourceTexts.some(source=>source.includes(evidence))))throw new Error('Missing source evidence. Draft preserved.');
    if(op.type==='draft'){
      if(op.field==='kind'&&['proforma','invoice'].includes(op.value))draft.kind=op.value as 'proforma'|'invoice';
      else if(op.field==='currency'){
        const currency=str(op.value,3).toUpperCase();
        const aliases:Record<string,RegExp>={USD:/usd|dollar|دولار/iu,EUR:/eur|euro|يورو/iu,SAR:/sar|saudi|سعودي/iu,TRY:/try|turkish|تركي/iu};
        if(!/^[A-Z]{3}$/.test(currency)||(!norm(evidence).includes(currency.toLowerCase())&&!aliases[currency]?.test(evidence)))throw new Error('Currency requires explicit evidence.');
        if(draft.currency&&draft.currency!==currency&&(draft.lines.length||draft.shipping))throw new Error('Currency conversion requires a separate reviewed workflow.');
        draft.currency=currency;
      }else throw new Error('Unsupported draft field.');
    }else if(op.type==='customer'){
      // Only current-message selection can link a customer. Attachments cannot select one.
      if(!message.includes(evidence))throw new Error('Select the customer in chat.');
      const ordinal=Number(op.value);const customer=next.customers.find(c=>c.id===op.value)||next.customers[Number.isInteger(ordinal)&&ordinal>0?ordinal-1:-1];
      if(!customer)throw new Error('Customer selection is unavailable in this company.');
      const selectedOrdinal=customerOrdinal(message);
      if(selectedOrdinal!==null?next.customers[selectedOrdinal-1]?.id!==customer.id:!norm(message).includes(norm(customer.name)))throw new Error('Customer selection does not match your response.');
      change('Customer',draft.customerId,customer.name);draft.customerId=customer.id;
    }else if(op.type==='line'){
      const name=str(op.target,160);
      if(!name||!norm(evidence).includes(norm(name)))throw new Error('Product description requires explicit source wording.');
      if(draft.lines.length>=200)throw new Error('Draft exceeds 200 lines. Split explicitly; nothing was dropped.');
      for(const value of [op.quantity,op.price])if(value)groundNumber(value,evidence);
      const row:CommercialLine={id:'line-'+(draft.revision+1)+'-'+draft.lines.length,name,quantity:op.quantity?decimal(op.quantity,true):'',price:op.price?decimal(op.price):'',unit:str(op.unit,40),pallets:'',cartonsPerPallet:'',containers:'',cartonsPerContainer:''};
      if(row.unit&&!norm(evidence).includes(norm(row.unit)))throw new Error('Unit requires explicit evidence.');
      draft.lines.push(row);draft.focus=row.id;change(name,'',`${row.quantity} × ${row.price}`);
    }else if(op.type==='adjust'||op.type==='remove'||op.type==='packaging'){
      const row=draft.lines.find(line=>line.id===op.target);
      if(op.type==='packaging'&&!op.target&&['pallets','containers'].includes(op.field)){
        groundNumber(op.value,evidence);const field=op.field as 'pallets'|'containers';change(field,draft[field],op.value);draft[field]=decimal(op.value,true);continue;
      }
      if(!row)throw new Error('Choose an existing draft line before editing it.');
      if(op.type==='remove'){draft.lines=draft.lines.filter(line=>line.id!==row.id);change(row.name,`${row.quantity} × ${row.price}`,'Removed');continue;}
      groundNumber(op.value,evidence);
      if(op.type==='packaging'){
        if(!['pallets','cartonsPerPallet','containers','cartonsPerContainer'].includes(op.field))throw new Error('Unsupported packaging field.');
        const field=op.field as 'pallets'|'cartonsPerPallet'|'containers'|'cartonsPerContainer';change(row.name+' '+field,row[field],op.value);row[field]=decimal(op.value,true);
        const count=field==='pallets'||field==='cartonsPerPallet'?'pallets':'containers';
        const ratio=count==='pallets'?'cartonsPerPallet':'cartonsPerContainer';
        if(row[count]&&row[ratio]){const before=row.quantity;row.quantity=lineTotal(row[count],row[ratio]);change(row.name+' quantity (packaging)',before,row.quantity);}
      }else{
        if(!['quantity','price'].includes(op.field)||!['set','add','subtract'].includes(op.mode))throw new Error('Unsupported line revision.');
        const field=op.field as 'quantity'|'price';const before=row[field];
        if(op.mode!=='set'&&!before)throw new Error('Current value is missing; specify it before applying a delta.');
        const v=decimal(op.value,field==='quantity');const value=op.mode==='set'?v:scaled(decimalToScaled(before)+(op.mode==='subtract'?-1n:1n)*decimalToScaled(v));
        row[field]=decimal(value,field==='quantity');change(row.name+' '+field,before,row[field]);
      }
      draft.focus=row.id;
    }else if(op.type==='shipping'){
      groundNumber(op.value,evidence);change('Shipping',draft.shipping,op.value);draft.shipping=decimal(op.value);
    }else if(op.type==='terms'){
      if(!['delivery','paymentTerms','incoterm','notes'].includes(op.field)||!norm(evidence).includes(norm(op.value)))throw new Error('Commercial terms require explicit source wording.');
      const field=op.field as 'delivery'|'paymentTerms'|'incoterm'|'notes';change(field,draft[field],op.value);draft[field]=str(op.value);
    }else throw new Error('Unsupported semantic operation.');
  }
  draft.revision++;next.draft=draft;return next;
}

export function conversationalReview(draft:ConversationDraft,customers:CustomerChoice[]){
  const missing:string[]=[];if(!draft.currency)missing.push('Currency / العملة');if(!customers.some(row=>row.id===draft.customerId))missing.push('Customer / العميل');if(!draft.lines.length)missing.push('Products / الأصناف');
  for(const row of draft.lines){
    if(!row.quantity)missing.push(row.name+': quantity / الكمية');if(!row.price)missing.push(row.name+': price / السعر');
    for(const [count,ratio] of [['pallets','cartonsPerPallet'],['containers','cartonsPerContainer']] as const){
      if(row[count]&&!row[ratio])missing.push(row.name+': '+ratio+' / بيانات التعبئة');
      if(row[count]&&row[ratio]&&row.quantity&&decimalToScaled(lineTotal(row[count],row[ratio]))!==decimalToScaled(row.quantity))missing.push(row.name+': packaging conflicts with carton quantity / تعارض التعبئة والكمية');
    }
  }
  if(draft.pallets&&!draft.lines.every(row=>row.cartonsPerPallet))missing.push('Cartons per pallet for every product / كراتين الطبلية لكل صنف');
  if(draft.containers&&!draft.lines.every(row=>row.cartonsPerContainer))missing.push('Cartons per container for every product / كراتين الحاوية لكل صنف');
  for(const count of ['pallets','containers'] as const)if(draft[count]){
    const allocated=draft.lines.reduce((sum,row)=>sum+decimalToScaled(row[count]||'0'),0n);
    if(allocated!==decimalToScaled(draft[count]))missing.push('Allocate '+count+' to products / وزّع العدد على الأصناف');
  }
  const complete=draft.lines.length>0&&draft.lines.every(row=>row.quantity&&row.price);
  const totals=complete?calculateTotals(draft.lines.map(row=>({quantity:row.quantity,unitPrice:row.price})),{discountEnabled:false,discountMode:'fixed',discountValue:'0',shippingEnabled:Boolean(draft.shipping),shipping:draft.shipping||'0',otherChargesEnabled:false,otherCharges:'0',taxEnabled:false,taxPercent:'0'}):null;
  return{missing,totals,lines:draft.lines.map(row=>({...row,total:row.quantity&&row.price?lineTotal(row.quantity,row.price):''}))};
}

export function conversationProposal(draft:ConversationDraft,customers:CustomerChoice[],language:'ar'|'en'):AiDocumentDraftProposal|null{
  if(conversationalReview(draft,customers).missing.length)return null;
  return{capability:'document.createDraft',reviewedConversation:true,kind:draft.kind,customerId:draft.customerId,customerDraft:null,currency:draft.currency,language,packing:[draft.pallets?draft.pallets+' pallets':'',draft.containers?draft.containers+' containers':''].filter(Boolean).join('; '),shipping:draft.shipping,items:draft.lines.map(row=>({savedItemId:'',descriptionEn:row.name,descriptionAr:'',quantity:row.quantity,unitPrice:row.price,unit:row.unit,packing:[row.pallets?row.pallets+' pallets':'',row.cartonsPerPallet?row.cartonsPerPallet+' cartons/pallet':'',row.containers?row.containers+' containers':'',row.cartonsPerContainer?row.cartonsPerContainer+' cartons/container':''].filter(Boolean).join('; ')})),incoterm:draft.incoterm,paymentTerms:draft.paymentTerms,deliveryTime:draft.delivery,validity:'',remarks:'',notes:draft.notes,label:language==='ar'?'مراجعة وحفظ المسودة':'Review and save draft',rationale:language==='ar'?'لم يُحفظ شيء. راجع كل الأصناف والتفاصيل ثم وافق.':'Nothing saved. Review every line and detail, then approve.'};
}

function sessionKey(runtime:any):string{return[runtime.operatorId,runtime.scope,runtime.workspaceId,runtime.branchId,runtime.threadId].map(v=>str(v,120)).join('|');}
export function forgetConversationalSessions():void{sessions.clear();}
export function finishConversationalDraft(runtime:any):void{const session=conversationSessionFor(runtime);if(session)session.draft=null;}
export function conversationSessionFor(runtime:any):ConversationalSession|null{return sessions.get(sessionKey(runtime))??null;}
export function validCommercialSession(value:any):value is ConversationalSession{
  try{
    if(!value||!Array.isArray(value.customers)||value.customers.length>24||!Array.isArray(value.history)||value.history.length>24)return false;
    if(value.customers.some((c:any)=>typeof c.id!=='string'||typeof c.name!=='string'))return false;
    const d=value.draft;if(d===null)return true;
    if(!d||d.version!==1||!Number.isInteger(d.revision)||!['proforma','invoice'].includes(d.kind)||!Array.isArray(d.lines)||d.lines.length>200)return false;
    for(const f of ['currency','customerId','shipping','delivery','paymentTerms','incoterm','notes','pallets','containers','focus'])if(typeof d[f]!=='string'||d[f].length>500)return false;
    if(d.currency&&!/^[A-Z]{3}$/.test(d.currency))return false;
    const ids=new Set<string>();for(const row of d.lines){if(!row||!row.id||ids.has(row.id)||typeof row.name!=='string'||row.name.length>160)return false;ids.add(row.id);for(const f of ['quantity','price','pallets','cartonsPerPallet','containers','cartonsPerContainer'])if(typeof row[f]!=='string'||(row[f]&&decimal(row[f],f!=='price')!==row[f]))return false;}
    for(const f of ['shipping','pallets','containers'])if(d[f])decimal(d[f],f!=='shipping');
    return Array.isArray(d.changes)&&Array.isArray(d.warnings);
  }catch{return false;}
}
export async function persistCommercialSession(runtime:any):Promise<void>{
  if(runtime?.scope!=='business'||!runtime.threadId)return;
  const session=conversationSessionFor(runtime);if(!session)return;
  const resumed=await resumeVaultSession();if(!resumed)return;
  const store=await loadAssistantState(resumed.key);
  const thread=store.threads.find(t=>t.id===runtime.threadId&&t.scope==='business'&&t.workspaceId===runtime.workspaceId&&t.branchId===runtime.branchId);
  if(!thread)return;
  thread.commercialSession=session;await saveAssistantState(resumed.key,store);
}
export async function conversationalRequest(input:{message:string;vault:VaultPayload;context:any;language:'en'|'ar';signal?:AbortSignal;}):Promise<any|null>{
  const runtime=input.context?.assistantRuntime;
  if(!runtime)return null;
  const key=sessionKey(runtime);const business=runtime.scope==='business';
  let previous=sessions.get(key)??emptyConversationalSession();
  if(business&&!sessions.has(key)&&runtime.threadId){
    const resumed=await resumeVaultSession();
    if(resumed){const store=await loadAssistantState(resumed.key);const thread=store.threads.find(t=>t.id===runtime.threadId&&t.scope==='business'&&t.workspaceId===runtime.workspaceId&&t.branchId===runtime.branchId);if(validCommercialSession(thread?.commercialSession))previous=thread!.commercialSession as ConversationalSession;}
  }
  if(!previous.history.length&&Array.isArray(input.context.conversationalHistory))previous={...previous,history:input.context.conversationalHistory.slice(-24).map((m:any)=>({role:m.role==='user'?'user':'assistant',text:String(m.text||'').slice(0,4000)}))};
  if(!business&&previous.draft)previous=emptyConversationalSession();
  if(business){
    const scoped=scopeVault(input.vault);
    if(!previous.customers.length)previous={...previous,customers:scoped.customers.slice(0,24).map(row=>({id:row.id,name:row.companyNameAr||row.companyNameEn||row.contactPerson}))};
    previous={...previous,customers:previous.customers.filter(c=>scoped.customers.some(row=>row.id===c.id))};
  }
  const sources=business&&Array.isArray(input.context.conversationSources)?input.context.conversationSources.map((row:any)=>({fileName:str(row.fileName,180),extracted:str(row.extracted,12000)})).slice(0,4):[];
  const ordinal=business&&previous.draft?customerOrdinal(input.message):null;
  const payload=ordinal!==null?{handled:true,intent:'customer-selection',summary:previous.summary,answer:input.language==='ar'?'ربطت اختيارك بالمسودة فقط. يمكنك متابعة التعديل قبل الحفظ.':'Linked your selection to the unsaved draft. You can keep refining it.',questions:[],operations:[{type:'customer',target:'',field:'',value:String(ordinal),quantity:'',price:'',unit:'',mode:'set',evidence:input.message}]}:await requestAiJson('/api/ai-core',{message:input.message,conversation:{scope:runtime.scope,language:input.language,summary:previous.summary||input.context.conversationalSummary||'',history:previous.history,draft:business?previous.draft:null,customers:business?previous.customers:[],products:business?input.context.drafting?.items:[],sources}},input.signal);
  if(input.signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(!payload.handled)return null;
  if(!business&&payload.operations?.length)throw new Error('Company operations are unavailable in this conversation mode.');
  const next=business?reviseConversationalSession(previous,payload.operations||[],input.message,sources.map((row:any)=>row.extracted)):previous;
  const answer=String(payload.answer||'').trim()+((payload.questions||[]).length?'\n\n'+payload.questions.join('\n'):'');
  next.history=[...previous.history,{role:'user' as const,text:input.message},{role:'assistant' as const,text:answer}].slice(-24);
  next.summary=str(payload.summary,2400)||previous.summary||'';
  sessions.set(key,next);
  const proposal=business&&next.draft&&assistantCapabilityAllowed(input.vault,'document.createDraft','business')?conversationProposal(next.draft,next.customers,input.language):null;
  return{answer,proposal,__conversation:next,__conversationShipping:next.draft?.shipping||'',plan:{version:1,goal:String(payload.intent||'Conversation'),calls:[]},results:[],plannedBy:'ai'};
}

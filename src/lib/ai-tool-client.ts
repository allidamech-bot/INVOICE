import type { VaultPayload } from '../types.js';
import { requestAiJson } from './ai-request.js';
import { scopeVault } from './workspaces.js';
import { resumeVaultSession } from '../storage/vault.js';
import { createAiToolRuntime, deterministicAiToolPlan, executeAiToolPlan, validateAiToolPlan, compactToolResults, type AiToolPlan, type AiToolResult, type AiToolId } from './ai-tool-orchestrator.js';
import { buildCfoBrief, buildDealDeskDecision, formatCfoBrief, formatDealDeskDecision, isCfoIntent, isDealDeskIntent } from './ai-cfo-deal-desk.js';
import { handleAssistantLocalCommand } from './ai-personal-assistant.js';
import { aiToolPlannerCatalog } from './ai-tool-orchestrator.js';
import {requestedAiProductImport} from './ai-product-source-import.js';

export interface AiToolOrchestrationResult{answer:string;proposal:any|null;plan:AiToolPlan;results:AiToolResult[];plannedBy:'local'|'ai';}
function clean(value:unknown,max=500):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function formatData(data:unknown,max=2200):string{try{const text=JSON.stringify(data,null,2);return text.length<=max?text:`${text.slice(0,max)}\n…`;}catch{return clean(data,max);}}
function titleFor(tool:string,ar:boolean):string{const map:Record<string,[string,string]>={
  'customer.getSummary':['Customer summary','ملخص العميل'],'customer.getReceivables':['Receivables','الذمم المستحقة'],'customer.getHistory':['Customer history','سجل العميل'],'supplier.getSummary':['Supplier summary','ملخص المورد'],'product.getSummary':['Product summary','ملخص المنتج'],'product.getCostHistory':['Cost history','سجل التكلفة'],'document.get':['Document','المستند'],'purchase.get':['Purchase','الشراء'],'finance.getSummary':['Financial summary','الملخص المالي'],'treasury.getSnapshot':['Treasury','الخزينة'],'reports.getMetrics':['Report metrics','مؤشرات التقرير'],'inventory.getStatus':['Inventory','المخزون'],'search.records':['Search results','نتائج البحث'],'pricing.margin':['Gross margin','هامش الربح'],'pricing.markup':['Markup','الزيادة على التكلفة'],'pricing.targetPrice':['Target price','السعر المستهدف'],'landedCost.calculate':['Landed cost','تكلفة الوصول'],'scenario.calculate':['Scenario','السيناريو'],'fx.convertUsingRecordedRate':['FX conversion','تحويل العملة'],'receivables.aging':['Receivables aging','أعمار الذمم'],'breakEven.calculate':['Break-even','نقطة التعادل'],'inventory.coverage':['Inventory coverage','تغطية المخزون'],'quotation.prepare':['Quotation preview','معاينة عرض السعر'],'invoice.prepare':['Invoice preview','معاينة الفاتورة'],'customer.prepare':['Customer preview','معاينة العميل'],'supplier.prepare':['Supplier preview','معاينة المورد'],'purchase.prepare':['Purchase preview','معاينة الشراء'],'reminder.prepare':['Reminder preview','معاينة التذكير'],'message.prepare':['Message preview','معاينة الرسالة'],'report.prepare':['Report preview','معاينة التقرير']};const row=map[tool];return row?(ar?row[1]:row[0]):tool;}
function formatAnswer(plan:AiToolPlan,results:AiToolResult[],language:'en'|'ar'):string{const ar=language==='ar',ok=results.filter(row=>row.ok),failed=results.filter(row=>!row.ok);const lines:string[]=[ar?'Summary':'Summary',ar?`استخدم LOUREX ${results.length} أداة محلية لهذه المهمة. لم يتم تنفيذ أي تغيير غير معتمد.`:`LOUREX used ${results.length} local tool${results.length===1?'':'s'} for this request. No unapproved change was executed.`];for(const row of ok){lines.push('',titleFor(row.tool,ar),formatData(row.data));}if(failed.length){lines.push('',ar?'Warning':'Warning',...failed.map(row=>`- ${row.tool}: ${row.summary}`));}const execute=results.filter(row=>row.class==='execute'&&row.ok);if(execute.length){lines.push('',ar?'Actions':'Actions',ar?'يوجد إجراء مجهّز يحتاج موافقتك قبل التطبيق.':'A prepared action requires your approval before it can be applied.');}if(results.some(row=>row.class==='high-impact')){lines.push('',ar?'Risk':'Risk',ar?'الإجراء المالي عالي التأثير محمي ولا ينفذه الذكاء الاصطناعي. استخدم مسار LOUREX المحمي للمراجعة والتنفيذ.':'The requested high-impact financial action is protected and cannot be executed by AI. Use the protected LOUREX workflow to review and complete it.');}return lines.join('\n').slice(0,5000);}
function likelyToolIntent(message:string,context:any):boolean{const q=clean(message,6000).toLowerCase();if(!q)return false;if(context?.assistantRuntime?.entity?.id&&/(?:this|هذا|هذه|هال|current|الحالي|الحالية)/i.test(q))return true;return /(?:open|go to|navigate|search|find|show|list|compare|prepare|create|update|change|remind|task|customer|supplier|product|inventory|stock|purchase|invoice|quotation|quote|receivable|overdue|cash|bank|treasury|margin|markup|price|cost|landed|break.?even|fx|currency|report|scenario|deal|profitability|finalize|payment|delete|post|افتح|روح|اذهب|ابحث|دور|اعرض|قارن|جهز|أنشئ|انشئ|عدل|غيّر|غير|ذكرني|مهمة|عميل|مورد|منتج|مخزون|شراء|مشتريات|فاتورة|عرض سعر|ذمم|متأخر|سيولة|بنك|خزينة|هامش|سعر|تكلفة|وصول|تعادل|عملة|تقرير|سيناريو|صفقة|ربحية|رحل|دفعة|احذف)/i.test(q);}

function previewOnlyDocumentIntent(message:string):boolean{
  const q=clean(message,6000).toLowerCase();
  return Boolean(q&&/(?:preview\s*only|only\s+(?:a\s+)?preview|do\s+not\s+save|don't\s+save|without\s+saving|review\s*only|just\s+(?:show|preview)|no\s+save|معاينة\s*فقط|للمعاينة\s*فقط|لا\s*تحفظ|بدون\s*حفظ|فقط\s*اعرض|اعرض\s*فقط)/i.test(q));
}
function mentionedDocumentKind(message:string):'proforma'|'invoice'|null{
  const q=clean(message,6000).toLowerCase();
  if(/(?:quotation|quote|proforma|عرض\s*سعر|بروفورما)/i.test(q))return'proforma';
  if(/(?:invoice|فاتورة)/i.test(q))return'invoice';
  return null;
}
function requestedDocumentKind(message:string):'proforma'|'invoice'|null{
  const q=clean(message,6000).toLowerCase();
  if(!q||previewOnlyDocumentIntent(q))return null;
  const action=/(?:create|make|generate|build|draft|prepare|produce|أنشئ|انشئ|جهز|جهّز|حضّر|حضر|اعمل|سوي|سوّي)/i.test(q);
  return action?mentionedDocumentKind(q):null;
}
export function promoteDocumentCreationPlan(plan:AiToolPlan,message:string):AiToolPlan{
  if(previewOnlyDocumentIntent(message)){
    const hintedKind=mentionedDocumentKind(message);
    const calls=plan.calls.map(call=>{
      if(call.tool!=='document.createDraft')return call;
      const argKind=clean((call.args as any)?.kind,30)==='invoice'?'invoice':clean((call.args as any)?.kind,30)==='proforma'?'proforma':hintedKind;
      if(!argKind)return call;
      return{...call,tool:argKind==='invoice'?'invoice.prepare':'quotation.prepare' as AiToolId,args:{...call.args,kind:argKind},reason:'Prepare a review-only document preview without saving.'};
    });
    return{...plan,calls};
  }
  const kind=requestedDocumentKind(message);if(!kind||plan.calls.some(call=>call.tool==='document.createDraft'))return plan;
  const target=kind==='invoice'?'invoice.prepare':'quotation.prepare',index=plan.calls.findIndex(call=>call.tool===target);if(index<0)return plan;
  const calls=[...plan.calls],current=calls[index]!;
  calls[index]={...current,tool:'document.createDraft',args:{...current.args,kind,label:clean((current.args as any)?.label,80)||(kind==='invoice'?'Create invoice draft':'Create quotation draft')},reason:current.reason||'Create a real LOUREX draft after visible approval.'};
  return{...plan,calls};
}

/** Attachments are untrusted data; never pass their contents as user
 * instructions. A truncated source may be analyzed, but not turned into a
 * write proposal whose omitted rows the user has not reviewed. */
const PLANNER_SOURCE_CHARS=2800;
export interface AiPlannerSourceFact{fileName:string;documentType:string;route:string;confidence:number;extracted:string;truncated:boolean;}
export function aiPlannerSourceFacts(sources:unknown):AiPlannerSourceFact[]{
  if(!Array.isArray(sources))return [];
  return sources.slice(0,4).filter(row=>row&&typeof row==='object').map(row=>{
    const item=row as Record<string,unknown>;
    const extracted=String(item.extracted??'');
    const confidence=Number(item.confidence);
    return{
      fileName:clean(item.fileName,180),documentType:clean(item.documentType,80),
      route:clean(item.route,40),confidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):0,
      extracted:extracted.slice(0,PLANNER_SOURCE_CHARS),truncated:extracted.length>PLANNER_SOURCE_CHARS
    };
  }).filter(row=>Boolean(row.fileName));
}
export function explicitAiActionRequest(message:string):boolean{
  return /\b(?:create|make|generate|build|save|add|update|edit|change|remove|archive|restore|record|register|set|prepare|open|navigate|go to)\b|(?:أنشئ|انشئ|أنشء|سوي|سوّي|اعمل|اصنع|جهز|جهّز|سجل|سجّل|أضف|اضف|عدّل|عدل|غيّر|غير|احفظ|خزّن|خزن|حدّث|حدث|افتح|اذهب|احذف|امسح|اعتمد)/iu.test(message);
}

/** When an explicit user action fails to plan, do not quietly replace the
 * operation with conversational output that could suggest it was performed. */
export function aiPlanningUnavailableResult(message:string,language:'en'|'ar',reason:'unavailable'|'invalid'|'limited'='unavailable'):AiToolOrchestrationResult{
  const ar=language==='ar';
  const answer=reason==='limited'
    ?(ar?'تعذر تجهيز الإجراء لأن طلبات AI بلغت الحد المؤقت. لم أغيّر أي بيانات. حاول مجددًا لاحقًا أو استخدم القسم المختص مباشرة.':'The AI planner is temporarily rate limited. No data was changed. Try again later or use the relevant workspace directly.')
    :reason==='invalid'
      ?(ar?'لم أتمكن من إنشاء خطة آمنة وواضحة لهذا الإجراء. لم أغيّر أي بيانات. حدّد الأصناف أو المستندات والتعديلات المطلوبة، ثم أعد المحاولة.':'I could not form a valid, safe action plan. No data was changed. Specify the affected products or documents and the required edits, then retry.')
      :(ar?'تعذر الاتصال بمخطط أوامر LOUREX. لم يتم إنشاء أي إجراء أو تعديل بيانات. أعد المحاولة أو استخدم القسم المختص مباشرة.':'The LOUREX action planner is unavailable. No action was prepared and no data was changed. Retry or use the relevant workspace directly.');
  return{answer,proposal:null,plan:{version:1,goal:clean(message,240),calls:[]},results:[],plannedBy:'local'};
}

export async function orchestrateAiToolRequest(input:{message:string;vault:VaultPayload;context:any;language:'en'|'ar';signal?:AbortSignal;}):Promise<AiToolOrchestrationResult|null>{
  const sources=aiPlannerSourceFacts(input.context?.conversationSources);
  const hasSources=sources.length>0;
  const scopedVault=scopeVault(input.vault);const runtime=createAiToolRuntime(scopedVault,input.context);
  // The user's own message must expressly request registration. Untrusted file
  // instructions never authorize a write, and source rows are not truncated here.
  if(hasSources&&runtime.scope==='business'&&requestedAiProductImport(input.message)){
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:[{id:'source-registration-1',tool:'product.importSource',args:{sources:input.context.conversationSources},reason:'User explicitly asked to register the attached product list.'}]};
    const execution=executeAiToolPlan(runtime,plan);
    return{answer:formatAnswer(plan,execution.results,input.language),proposal:execution.proposal,plan,results:execution.results,plannedBy:'local'};
  }
  if(!hasSources&&runtime.scope!=='temporary'){
    const resumed=await resumeVaultSession();
    if(resumed){
      const local=await handleAssistantLocalCommand(resumed.key,{message:input.message,scope:runtime.scope,workspaceId:runtime.workspaceId,branchId:runtime.branchId,language:input.language,threadId:clean(input.context?.assistantRuntime?.threadId,120)});
      if(local){const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:[]};return{answer:local.answer,proposal:local.proposal,plan,results:[],plannedBy:'local'};}
    }
  }
  if(!hasSources&&isCfoIntent(input.message)){
    const brief=buildCfoBrief(input.context?.advisorV2);if(brief){
      if(!brief.available){const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:[]};return{answer:formatCfoBrief(brief,input.language),proposal:null,plan,results:[],plannedBy:'local'};}
      const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:[{id:'cfo-local-1',tool:'finance.getSummary',args:{},reason:'Build the CFO brief from deterministic Advisor V2 evidence.'}]};const execution=executeAiToolPlan(runtime,plan);return{answer:formatCfoBrief(brief,input.language),proposal:null,plan,results:execution.results,plannedBy:'local'};
    }
  }
  const dealDesk=!hasSources&&isDealDeskIntent(input.message);let plan=hasSources?null:deterministicAiToolPlan(input.message,runtime),plannedBy:'local'|'ai'='local';
  if(!plan){
    // Explicit user commands must always reach the planner, including short
    // Arabic commands such as "احفظ جميع الأصناف" with no attachment.
    if(!likelyToolIntent(input.message,input.context)&&!explicitAiActionRequest(input.message))return null;
    plannedBy='ai';
    const entity=input.context?.assistantRuntime?.entity??{};
    const actionRequested=explicitAiActionRequest(input.message);
    let payload:any;
    try{
      payload=await requestAiJson('/api/ai-inbox',{mode:'tool-plan',message:input.message,scope:runtime.scope,screen:input.context?.screen||'',entity:{type:clean(entity.type,30),id:clean(entity.id,120),label:clean(entity.label,160)},sources},input.signal,15_000);
    }catch(error){
      if(input.signal?.aborted)throw error;
      if(!actionRequested)return null;
      const limited=error instanceof Error&&/(?:rate.?limit|too many|429)/i.test(error.message);
      return aiPlanningUnavailableResult(input.message,input.language,limited?'limited':'unavailable');
    }
    plan=validateAiToolPlan(payload?.plan,runtime.scope);
    if(!plan||!plan.calls.length)return actionRequested?aiPlanningUnavailableResult(input.message,input.language,'invalid'):null;
    // Catalog-wide transformations are authorized ONLY by the deterministic
    // interpretation of an explicit user message, never by model or file text.
    if(plan.calls.some(call=>call.tool==='product.bulkUpdate'&&Object.hasOwn(call.args,'transform')))
      return aiPlanningUnavailableResult(input.message,input.language,'invalid');
    if(hasSources){
      const allowed=new Map(aiToolPlannerCatalog(runtime.scope).map(def=>[def.id,def.class]));
      const writes=plan.calls.some(call=>allowed.get(call.tool)==='execute'||allowed.get(call.tool)==='high-impact');
      if(writes&&sources.some(source=>source.truncated)){
        return{answer:input.language==='ar'?'الملفات المرفقة أكبر من الحد الآمن لتنفيذ عملية كاملة. افتح استيراد الملفات لمراجعة كل الصفوف قبل الحفظ. لم يُنفّذ أي تغيير.':'The attachments contain more data than the safe action-planning limit. Use the full file importer to review every row. No changes were made.',proposal:null,plan:{version:1,calls:[],goal:clean(input.message,240)},results:[],plannedBy:'local'};
      }
      // File contents cannot grant permission to edit data. Only the user's
      // explicit message can authorize a reviewable execution proposal.
      if(writes&&!actionRequested)return null;
    }
  }
  plan=promoteDocumentCreationPlan(plan,input.message);
  const execution=executeAiToolPlan(runtime,plan);const answer=dealDesk?formatDealDeskDecision(buildDealDeskDecision(plan,execution.results),input.language):formatAnswer(plan,execution.results,input.language);return{answer,proposal:execution.proposal,plan,results:execution.results,plannedBy};
}

export function aiToolAuditSummary(result:AiToolOrchestrationResult):string{return JSON.stringify({plannedBy:result.plannedBy,goal:result.plan.goal,tools:compactToolResults(result.results).map(row=>({tool:row.tool,ok:row.ok,source:row.source}))});}

import type { VaultPayload } from '../types.js';
import { requestAiJson, AiRequestError } from './ai-request.js';
import { scopeVault } from './workspaces.js';
import { resumeVaultSession } from '../storage/vault.js';
import { createAiToolRuntime, deterministicAiToolPlan, executeAiToolPlan, validateAiToolPlan, compactToolResults, proposalForExecutableTool, type AiToolPlan, type AiToolResult, type AiToolId, type AiToolRuntime } from './ai-tool-orchestrator.js';
import { buildCfoBrief, buildDealDeskDecision, formatCfoBrief, formatDealDeskDecision, isCfoIntent, isDealDeskIntent } from './ai-cfo-deal-desk.js';
import { handleAssistantLocalCommand } from './ai-personal-assistant.js';
import { aiToolPlannerCatalog } from './ai-tool-orchestrator.js';
import {requestedAiProductImport,requestedAiProductSkuGeneration} from './ai-product-source-import.js';
import {reviseAiProductImportDraft,parseAiProductDraftCommand} from './ai-product-import-draft.js';
import {type AiProductSourceImportBatch} from './ai-product-source-import.js';
import {explicitQuoteConversionIntent,quoteSourceWorkingDraft} from './ai-quote-source-draft.js';
import {summarizeReadOnlyProductSources} from './ai-product-source-review.js';
import {operationalPoDraftRequested,requestedPoRfqNumber} from './ai-operational-po-draft.js';
import {isAiGoodsReceiptRequest,parseAiGoodsReceiptRequest} from './ai-operational-goods-receipt.js';
import {operationalDeliveryDraftRequested,requestedDeliverySalesOrderNumber} from './ai-operational-dn-draft.js';
import {isAiConfirmPhysicalDeliveryIntent,parseAiConfirmPhysicalDeliveryRequest} from './ai-operational-delivery-confirmation.js';
import {isAiStockIssueIntent} from './ai-operational-stock-issue.js';
import {isAiSupplierInvoiceMatchIntent,parseAiSupplierInvoiceMatchRequest} from './ai-operational-supplier-invoice-match.js';
import {isAiConfirmedInvoiceDraftIntent,requestedInvoiceDeliveryNumber} from './ai-operational-delivery-invoice-draft.js';
import {isAiStoredQuotationInvoiceIntent,requestedStoredQuotationNumber,prepareAiStoredQuotationInvoice} from './ai-stored-quotation-invoice.js';
import {isAiCustomerCollectionIntent,parseAiCustomerCollection} from './ai-operational-customer-collection.js';
import {isAiSupplierSettlementIntent,parseAiSupplierSettlement} from './ai-operational-supplier-settlement.js';
import {isAiSupplierPostingIntent,parseAiSupplierPosting} from './ai-operational-supplier-posting.js';
import {isAiReceivablesRankingIntent,aiReceivablesRanking} from './ai-receivables-ranking.js';
import {isOperationalDocumentStatusIntent,operationalDocumentStatus} from './ai-operational-document-status.js';
import {isAiInvoiceStockEvidenceIntent,aiInvoiceStockEvidence} from './ai-invoice-stock-evidence.js';
import {requestedCatalogQuoteFamily,naturalCatalogQuoteReply} from './ai-catalog-conversation.js';
import {graphKindAllowed} from './ai-business-memory-graph.js';
import {strictAiActor} from './ai-foundation-approval.js';
import {exactTextQuotePreview} from './ai-text-quote-preview.js';
import {namedRecordReadPlan} from './ai-named-record-read.js';

export interface AiToolOrchestrationResult{answer:string;proposal:any|null;workingDraft?:any;plan:AiToolPlan;results:AiToolResult[];plannedBy:'local'|'ai';}
function clean(value:unknown,max=500):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function formatData(data:unknown,max=2200):string{try{const text=JSON.stringify(data,null,2);return text.length<=max?text:`${text.slice(0,max)}\n…`;}catch{return clean(data,max);}}
function titleFor(tool:string,ar:boolean):string{const map:Record<string,[string,string]>={
  'customer.getSummary':['Customer summary','ملخص العميل'],'customer.getReceivables':['Receivables','الذمم المستحقة'],'customer.getHistory':['Customer history','سجل العميل'],'supplier.getSummary':['Supplier summary','ملخص المورد'],'product.getSummary':['Product summary','ملخص المنتج'],'product.getCostHistory':['Cost history','سجل التكلفة'],'document.get':['Document','المستند'],'purchase.get':['Purchase','الشراء'],'finance.getSummary':['Financial summary','الملخص المالي'],'treasury.getSnapshot':['Treasury','الخزينة'],'reports.getMetrics':['Report metrics','مؤشرات التقرير'],'inventory.getStatus':['Inventory','المخزون'],'search.records':['Search results','نتائج البحث'],'pricing.margin':['Gross margin','هامش الربح'],'pricing.markup':['Markup','الزيادة على التكلفة'],'pricing.targetPrice':['Target price','السعر المستهدف'],'landedCost.calculate':['Landed cost','تكلفة الوصول'],'scenario.calculate':['Scenario','السيناريو'],'fx.convertUsingRecordedRate':['FX conversion','تحويل العملة'],'receivables.aging':['Receivables aging','أعمار الذمم'],'breakEven.calculate':['Break-even','نقطة التعادل'],'inventory.coverage':['Inventory coverage','تغطية المخزون'],'quotation.prepare':['Quotation preview','معاينة عرض السعر'],'invoice.prepare':['Invoice preview','معاينة الفاتورة'],'customer.prepare':['Customer preview','معاينة العميل'],'supplier.prepare':['Supplier preview','معاينة المورد'],'purchase.prepare':['Purchase preview','معاينة الشراء'],'reminder.prepare':['Reminder preview','معاينة التذكير'],'message.prepare':['Message preview','معاينة الرسالة'],'report.prepare':['Report preview','معاينة التقرير']};const row=map[tool];return row?(ar?row[1]:row[0]):tool;}
/** Human-readable verified tool evidence, not an opaque JSON wall. A record
 * always occupies its own list line; no mutation or model inference occurs. */
function readableToolValue(value:unknown):string{
  if(value===null||value===undefined||value==='')return '—';
  if(Array.isArray(value))return value.map(entry=>typeof entry==='object'?JSON.stringify(entry):String(entry)).join('، ').slice(0,650);
  if(typeof value==='object')return JSON.stringify(value).slice(0,650);
  return String(value).replace(/[\r\n]+/g,' ').slice(0,280);
}
function toolFacts(data:unknown,ar:boolean):string[]{
  // Upstream fits may be preview-only fragments, never complete records.
  if(data&&typeof data==='object'&&!Array.isArray(data)&&(data as Record<string,unknown>).truncated===true)
    return [ar?'تنبيه: نتيجة الأداة غير مكتملة، ولا يمكن اعتماد الجزء المعروض باعتباره جميع البيانات. اطلب نطاقًا أصغر.':'Notice: the tool result is incomplete. The partial preview is not the full data; request a smaller range.'];
  if(Array.isArray(data)){
    const rows=data.slice(0,50).map(row=>{
      if(!row||typeof row!=='object')return '- '+readableToolValue(row);
      const object=row as Record<string,unknown>;
      const identity=readableToolValue(object.label||object.name||object.sku||object.number||object.id||'');
      const facts=Object.entries(object).filter(([key,value])=>!['label','name','id'].includes(key)&&value!==undefined&&value!==null&&value!=='')
        .slice(0,9).map(([key,value])=>key+': '+readableToolValue(value));
      return '- '+[identity,...facts].filter(Boolean).join(' — ');
    });
    if(data.length>50)rows.unshift(ar
      ?'نتيجة جزئية: '+data.length+' سجلًا بالمجموع؛ جرى تجهيز أول 50 فقط، و'+(data.length-50)+' سجلًا غير معروض. اطلب البقية على دفعات.'
      :'Partial result: '+data.length+' total records; only the first 50 were prepared, with '+(data.length-50)+' more not shown. Request more in batches.');
    return rows;
  }
  if(data&&typeof data==='object'){
    const object=data as Record<string,unknown>;
    const entries=Object.entries(object).filter(([,value])=>value!==undefined&&value!==null);
    const lines=entries.slice(0,28).flatMap(([key,value])=>{
      if(Array.isArray(value)&&value.length&&value.every(item=>item&&typeof item==='object'))
        return [key+':',...toolFacts(value,ar)];
      return ['- '+key+': '+readableToolValue(value)];
    });
    if(entries.length>28)lines.unshift(ar
      ?'نتيجة مختصرة: '+(entries.length-28)+' حقلًا إضافيًا غير معروض.'
      :'Summary only: '+(entries.length-28)+' additional fields are not shown.');
    if(object.incomplete===true)lines.unshift(ar
      ?'تنبيه: المصدر أعلن أن النتيجة جزئية. اطلب السجلات المتبقية قبل اعتبار القائمة مكتملة.'
      :'Notice: the source marks this result incomplete. Request the remaining records before relying on a full list.');
    for(const key of ['costHistory','history'] as const){
      const total=object[key+'Total'],shown=object[key+'Shown'];
      if(object[key+'Incomplete']===true&&typeof total==='number'&&typeof shown==='number'&&
        Number.isSafeInteger(total)&&Number.isSafeInteger(shown)&&total>shown&&shown>=0){
        lines.unshift(ar
          ?'تنبيه: سجل تكلفة الصنف جزئي؛ المعروض '+shown+' من أصل '+total+' سعر شراء مسجل. العملات والأسعار محفوظة كما هي؛ لا تفترض متوسط تكلفة من الجزء المعروض.'
          :'Notice: product purchase cost history is partial; showing '+shown+' of '+total+' recorded entries. Currencies and prices are unchanged; do not infer a historical average from these rows.');
      }
    }
    for(const [key,kind] of [['recentDocuments','document'],['recentPurchases','purchase']] as const){
      const total=object[key+'Total'],shown=object[key+'Shown'];
      if(object[key+'Incomplete']===true&&typeof total==='number'&&typeof shown==='number'&&
        Number.isSafeInteger(total)&&Number.isSafeInteger(shown)&&total>shown&&shown>=0){
        lines.unshift(ar
          ?'تنبيه: قائمة '+(kind==='document'?'المستندات':'المشتريات')+' الأخيرة جزئية؛ المعروض '+shown+' من أصل '+total+'. المجاميع المالية تحسب من السجلات المؤهلة كاملة، وليس من القائمة المختصرة.'
          :'Notice: recent '+kind+' list is partial; showing '+shown+' of '+total+'. Financial totals are calculated from all eligible records, not from this shortened list.');
      }
    }
    return lines;
  }
  return [ar?'النتيجة: '+readableToolValue(data):'Result: '+readableToolValue(data)];
}
/** Keep the posted customer statement readable: generic object preview text
 * truncates the nested entries array and hides payment references/amounts. */
function customerHistoryFacts(data:unknown,ar:boolean):string[]{
  if(!data||typeof data!=='object'||Array.isArray(data))return toolFacts(data,ar);
  const history=data as Record<string,unknown>;
  if(!Array.isArray(history.statements))return toolFacts(data,ar);
  if(!history.statements.length)return[ar?'لا توجد قيود في كشف هذا العميل.':'No customer statement entries were recorded.'];
  const lines:string[]=[];
  for(const value of history.statements){
    if(!value||typeof value!=='object'||Array.isArray(value))continue;
    const statement=value as Record<string,unknown>,currency=clean(statement.currency,8)||'—';
    lines.push('**'+currency+'** — '+(ar?'إجمالي الفواتير: ':'Billed: ')+clean(statement.billed,40)+
      ' · '+(ar?'المدفوع: ':'Paid: ')+clean(statement.paid,40)+
      ' · '+(ar?'المستحق: ':'Outstanding: ')+clean(statement.outstanding,40));
    const entries=Array.isArray(statement.entries)?statement.entries:[];
    const total=typeof statement.entriesTotal==='number'&&Number.isSafeInteger(statement.entriesTotal)&&statement.entriesTotal>=entries.length
      ?statement.entriesTotal:entries.length;
    if(statement.incomplete===true||total>entries.length)lines.push(ar
      ?'تنبيه: كشف جزئي — عرض آخر '+entries.length+' من أصل '+total+' حركة مسجلة بعملة '+currency+'. الأرصدة الإجمالية تشمل كل الحركات.'
      :'Partial history — showing the most recent '+entries.length+' of '+total+' recorded '+currency+' entries. Currency totals include all entries.');
    if(!entries.length){lines.push(ar?'لا توجد حركات مسجلة لهذه العملة.':'No recorded entries for this currency.');continue;}
    for(const value of entries){
      if(!value||typeof value!=='object'||Array.isArray(value))continue;
      const entry=value as Record<string,unknown>,type=clean(entry.type,24);
      const kind=type==='payment'?(ar?'تحصيل':'Payment'):type==='invoice'?(ar?'فاتورة':'Invoice'):type==='credit-note'?(ar?'إشعار دائن':'Credit note'):(ar?'حركة':'Entry');
      const invoice=clean(entry.relatedInvoiceNumber,120);
      lines.push('- '+[
        clean(entry.date,24),kind,clean(entry.reference,180),
        (ar?'مدين: ':'Debit: ')+clean(entry.debit,40)+' '+currency,
        (ar?'دائن: ':'Credit: ')+clean(entry.credit,40)+' '+currency,
        (ar?'الرصيد بعد الحركة: ':'Balance after: ')+clean(entry.balance,40)+' '+currency,
        invoice?(ar?'الفاتورة: ':'Invoice: ')+invoice:''
      ].filter(Boolean).join(' — '));
    }
  }
  return lines.length?lines:[ar?'تعذر عرض قيود كشف العميل.':'Customer statement entries could not be displayed.'];
}

function boundedToolAnswer(answer:string,ar:boolean):string{
  const limit=5000;
  if(answer.length<=limit)return answer;
  const notice=ar?'\n\n… هذا عرض مختصر فقط؛ توجد نتائج إضافية لم تُعرض. اطلب نطاقًا أصغر أو النتائج على دفعات.':'\n\n… This is a partial answer; additional results are not shown. Request a smaller range or batches.';
  const prefix=answer.slice(0,limit-notice.length);
  const lastLine=prefix.lastIndexOf('\n');
  return (lastLine>0?prefix.slice(0,lastLine):prefix).trimEnd()+notice;
}
function formatAnswer(plan:AiToolPlan,results:AiToolResult[],language:'en'|'ar'):string{
  const ar=language==='ar',ok=results.filter(row=>row.ok),failed=results.filter(row=>!row.ok),lines:string[]=[];
  for(const row of ok){
    lines.push('**'+titleFor(row.tool,ar)+'**',...(row.tool==='customer.getHistory'?customerHistoryFacts(row.data,ar):toolFacts(row.data,ar)),'');
  }
  if(failed.length){
    lines.push(ar?'لم أتمكن من استكمال هذه الجزئية، ولم أغيّر أي سجل:':'This part could not be completed; no records were changed:');
    for(const row of failed)lines.push('- '+row.summary);
  }
  if(results.some(row=>row.class==='execute'&&row.ok))
    lines.push(ar?'جهّزت الإجراء للمراجعة، ولن يُطبّق إلا بعد موافقتك.':'The action is ready for review and will not apply without your approval.');
  if(results.some(row=>row.class==='high-impact'))
    lines.push(ar?'الترحيل أو تحريك المخزون يحتاج مسار الاعتماد المحاسبي المحمي.':'Posting or stock movements require the protected accounting approval workflow.');
  return boundedToolAnswer(lines.join('\n').trim()||(ar?'ما لقيت بيانات مؤكدة لهذا الطلب. شو التفصيل اللي بدك نراجعه؟':'I could not verify matching data. What would you like to check?'),ar);
}
export const formatAiToolAnswer=formatAnswer;
function likelyToolIntent(message:string,context:any):boolean{const q=clean(message,6000).toLowerCase();if(!q)return false;if(context?.assistantRuntime?.entity?.id&&/(?:this|هذا|هذه|هال|current|الحالي|الحالية)/i.test(q))return true;return /(?:open|go to|navigate|search|find|show|list|compare|prepare|create|update|change|remind|task|customer|supplier|product|inventory|stock|purchase|invoice|quotation|quote|receivable|overdue|cash|bank|treasury|margin|markup|price|cost|landed|break.?even|fx|currency|report|scenario|deal|profitability|finalize|payment|delete|post|افتح|روح|اذهب|ابحث|دور|اعرض|قارن|جهز|أنشئ|انشئ|عدل|غيّر|غير|ذكرني|مهمة|عميل|مورد|منتج|مخزون|شراء|مشتريات|فاتورة|عرض سعر|ذمم|متأخر|سيولة|بنك|خزينة|هامش|سعر|تكلفة|وصول|تعادل|عملة|تقرير|سيناريو|صفقة|ربحية|رحل|دفعة|احذف|مديونية|مديون|ديون|رصيد|مبيعات|زبون|زبائن|تحصيل|مصاري|balance|owed|outstanding|debt)/i.test(q);}

function previewOnlyDocumentIntent(message:string):boolean{
  const q=clean(message,6000).toLowerCase();
  return Boolean(q&&/(?:preview\s*only|only\s+(?:a\s+)?preview|do\s+not\s+save|don't\s+save|without\s+saving|review\s*only|just\s+(?:show|preview)|no\s+save|معاينة\s*فقط|للمعاينة\s*فقط|لا\s*تحفظ|بدون\s*حفظ|فقط\s*اعرض|اعرض\s*فقط|للمراجعة\s*فقط|فقط\s*للمراجعة|للعرض\s*فقط)/i.test(q));
}
function mentionedDocumentKind(message:string):'proforma'|'invoice'|null{
  const q=clean(message,6000).toLowerCase();
  if(/(?:quotation|quote|proforma|عرض\s*سعر|بروفورما)/i.test(q))return'proforma';
  if(/(?:invoice|فاتورة)/i.test(q))return'invoice';
  return null;
}
/** Detect the *requested output*, not an unrelated input document. The
 * first document named after a positive create verb is the new document;
 * "create invoice from quotation" must never create another quotation. */
function requestedDocumentKind(message:string):'proforma'|'invoice'|null{
  const q=clean(message,6000).toLowerCase();
  if(!q||previewOnlyDocumentIntent(q))return null;
  const verb=/\b(?:create|make|generate|build|draft|prepare|produce)\b|(?:أنشئ|انشئ|إنشاء|انشاء|جهز|جهّز|تجهيز|حضّر|حضر|اعمل|سوي|سوّي)/giu;
  const target=/^\s*(?:(?:me|an?|the|new|customer|client|sales|purchase|draft|one|commercial|لي|للعميل|العميل|مسودة|جديد|جديدة)\s+){0,6}(quotation|quote|proforma|عرض\s*سعر|بروفورما|invoice|فاتورة)/iu;
  for(const match of q.matchAll(verb)){
    const prefix=q.slice(Math.max(0,match.index-30),match.index);
    if(/(?:\b(?:do\s+not|don't|never|not|without)\b|(?:^|[\s،,;])(?:لا|ولا|بدون))\s*(?:ت)?\s*$/iu.test(prefix))continue;
    const after=q.slice(match.index+match[0].length,match.index+match[0].length+90);
    // "prepare a preview of invoice" is a preview request, not authorization
    // to create a durable document even when the planner selected PREPARE.
    if(/^\s*(?:(?:me|an?|the|a|new|draft|لي|مسودة)\s+){0,4}(?:preview\b|معاينة)(?:\s|$)/iu.test(after))continue;
    const found=after.match(target);
    if(found)return /^(?:invoice|فاتورة)$/iu.test(found[1]!)?'invoice':'proforma';
  }
  return null;
}
/** Negated user instructions override any model-generated createDraft plan.
 * Source text and planner guesses cannot reverse this prohibition. */
function explicitlyNegatedDocumentCreation(message:string):boolean{
  const q=clean(message,6000);
  return /(?:\b(?:do\s+not|don't|never|without)\s+(?:create|make|generate|build|draft|prepare|produce)\b|(?:^|[\s،,;])(?:لا|ولا|بدون)\s*(?:ت)?(?:نشئ|نشيء|انشئ|أنشئ|جهز|جهّز|حضر|حضّر|عمل|اعمل|سوي|سوّي|إنشاء|انشاء|تجهيز))[^.!؟\n]{0,110}(?:invoice|quotation|quote|proforma|فاتورة|عرض\s*سعر|بروفورما)/iu.test(q);
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

/** Preserve PREPARE-only quotes as edit-ready, unsaved conversation artifacts.
 * This is NOT an approval proposal: it must never reach any vault writer. */
export function previewOnlyWorkingDraft(plan:AiToolPlan,results:AiToolResult[],runtime:AiToolRuntime):any|null{
  if(runtime.scope!=='business'||runtime.conversationMode!=='controller')return null;
  // One exact preview only. A mixed/executable plan is not a safe source of
  // implicitly staged quote data; it requires its own approval path.
  if(plan.calls.length!==1||results.length!==1||results[0]?.ok!==true||results[0]?.class!=='prepare')return null;
  const call=plan.calls[0]!,result=results[0]!;
  if(!['quotation.prepare','invoice.prepare'].includes(call.tool)||result.tool!==call.tool||result.id!==call.id)return null;
  const data=result.data as any;
  if(!data||data.status!=='preview-only'||data.approvalRequired!==false||!Array.isArray(data.items)||data.kind!==(call.tool==='quotation.prepare'?'proforma':'invoice'))return null;
  // Reject truncated or inconsistent results rather than silently losing rows.
  const converted=proposalForExecutableTool({
    ...call,tool:'document.createDraft',
    args:{...call.args,kind:data.kind},
    reason:'Unsaved working review from a prepare-only action; never approved for saving.'
  },runtime);
  if(!converted||converted.capability!=='document.createDraft'||!Array.isArray(converted.items)||!converted.items.length)return null;
  if(JSON.stringify(converted.items)!==JSON.stringify(data.items))return null;
  return converted;
}

/** Attachments are untrusted data; never pass their contents as user
 * instructions. A truncated source may be analyzed, but not turned into a
 * write proposal whose omitted rows the user has not reviewed. */
const PLANNER_SOURCE_CHARS=2800;
export interface AiPlannerSourceFact{fileName:string;documentType:string;route:string;confidence:number;extracted:string;truncated:boolean;}
export function aiPlannerSourceFacts(sources:unknown):AiPlannerSourceFact[]{
  if(!Array.isArray(sources))return [];
  return sources.slice(0,10).filter(row=>row&&typeof row==='object').map(row=>{
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
  if(/^(?:how|why|should|explain|كيف|ليش|لماذا|اشرح|هل\s+تنصح|شو\s+رأيك)(?:\s|$)/iu.test(message.trim()))return false;
  return /\b(?:create|make|generate|build|save|add|update|edit|change|remove|archive|restore|record|register|set|prepare|open|navigate|go to)\b|(?:أنشئ|انشئ|أنشء|سوي|سوّي|اعمل|اصنع|جهز|جهّز|سجل|سجّل|أضف|اضف|عدّل|عدل|غيّر|غير|احفظ|خزّن|خزن|حدّث|حدث|افتح|اذهب|احذف|امسح|اعتمد|تجهز|تجهّز|تعمل|تضيف|تعدل|تعدّل|تغيّر)/iu.test(message);
}

/** When an explicit user action fails to plan, do not quietly replace the
 * operation with conversational output that could suggest it was performed. */
export function aiPlanningUnavailableResult(message:string,language:'en'|'ar',reason:'unavailable'|'invalid'|'limited'|'not-configured'='unavailable'):AiToolOrchestrationResult{
  const ar=language==='ar';
  const answer=reason==='not-configured'
    ?(ar?'مزوّدو AI غير مهيّئين لهذه النسخة من الموقع. لم يتم تجهيز الإجراء أو تغيير أي بيانات. يمكن استخدام الأدوات المحلية من مساحة العمل.':'AI providers are not configured for this deployment. No action was prepared and no data changed. Local tools remain available in the workspace.')
    :reason==='limited'
    ?(ar?'تعذر تجهيز الإجراء لأن طلبات AI بلغت الحد المؤقت. لم أغيّر أي بيانات. حاول مجددًا لاحقًا أو استخدم القسم المختص مباشرة.':'The AI planner is temporarily rate limited. No data was changed. Try again later or use the relevant workspace directly.')
    :reason==='invalid'
      ?(ar?'لم أتمكن من إنشاء خطة آمنة وواضحة لهذا الإجراء. لم أغيّر أي بيانات. حدّد الأصناف أو المستندات والتعديلات المطلوبة، ثم أعد المحاولة.':'I could not form a valid, safe action plan. No data was changed. Specify the affected products or documents and the required edits, then retry.')
      :(ar?'تعذر الاتصال بمخطط أوامر LOUREX. لم يتم إنشاء أي إجراء أو تعديل بيانات. أعد المحاولة أو استخدم القسم المختص مباشرة.':'The LOUREX action planner is unavailable. No action was prepared and no data was changed. Retry or use the relevant workspace directly.');
  return{answer,proposal:null,plan:{version:1,goal:clean(message,240),calls:[]},results:[],plannedBy:'local'};
}

export async function orchestrateAiToolRequest(input:{message:string;vault:VaultPayload;context:any;language:'en'|'ar';signal?:AbortSignal;}):Promise<AiToolOrchestrationResult|null>{
  const rawSources=input.context?.conversationSources;
  const sources=aiPlannerSourceFacts(rawSources);
  // Never silently analyze only the first ten files or omit an invalid file.
  // This boundary precedes any provider request or executable proposal.
  if(Array.isArray(rawSources)&&rawSources.length&&(rawSources.length>10||sources.length!==rawSources.length)){
    return{answer:input.language==='ar'
      ?'تعذر تحليل جميع المرفقات بأمان: الحد الأقصى عشرة ملفات، ويجب أن يكون لكل ملف اسم ومصدر صالح. قسّم الملفات أو أعد رفع الملف غير الصالح. لم يُجهّز إجراء ولم يُغيّر أي سجل.'
      :'Unable to safely analyze every attachment: at most ten supported, named sources are permitted. Split the files or replace the invalid source. No action was staged and no records changed.',
      proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
  }
  const hasSources=sources.length>0;
  // Do not let an absent/malformed conversationMode inherit the legacy
  // orchestrator's Controller default. The live boundary is deny-by-default;
  // only the explicit selected Controller tab may stage an action.
  const safeMode=input.context?.conversationMode==='controller'?'controller':'advisor';
  const scopedVault=scopeVault(input.vault);
  const runtime=createAiToolRuntime(scopedVault,{...(input.context||{}),conversationMode:safeMode});
  // A fully specified REVIEW-ONLY quote must be usable even if the free AI
  // planner cannot return a valid tool plan. This creates a scoped in-chat
  // artifact, not a save proposal or vault write. Ambiguity falls through.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&previewOnlyDocumentIntent(input.message)){
    const workingDraft=exactTextQuotePreview(input.message);
    if(workingDraft)return{
      answer:input.language==='ar'
        ?'جهزت بطاقة عرض السعر للمراجعة فقط من البيانات التي ذكرتها. لم أحفظ مستندًا أو أنشئ عميلًا.'
        :'Prepared an unsaved quotation card from your exact input. No document or customer was saved.',
      proposal:null,workingDraft,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'
    };
  }
  // An incomplete named-family quote starts with a real catalog conversation.
  // Never let a generic search.records plan masquerade as a prepared quotation.
  // Quantified/customer-specific instructions continue to their normal guarded
  // planning workflow. This response is read-only and never stages approval.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'){
    const family=requestedCatalogQuoteFamily(input.message);
    if(family){
      if(!graphKindAllowed(strictAiActor(input.vault).role,'product'))
        return{answer:input.language==='ar'
          ?'صلاحيات الحساب الحالي لا تسمح بعرض كتالوج المنتجات. لم أجهز عرض سعر أو أعرض بيانات مخفية.'
          :'Your current operator role cannot view the product catalog. No quotation or private product list was prepared.',
          proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
      return{answer:naturalCatalogQuoteReply(scopedVault,family,input.language),
        proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},
        results:[],plannedBy:'local'};
    }
  }

  // Exact saved quotation → invoice is a distinct canonical conversion, not
  // model-synthesized invoice creation. Never infer lines or amounts from a
  // conversation when an issued saved quotation was named as the source.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&
      isAiStoredQuotationInvoiceIntent(input.message)){
    const number=requestedStoredQuotationNumber(input.message);
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:[]};
    if(!number)return{answer:input.language==='ar'
      ?'اذكر رقم عرض سعر محفوظ واحدًا بالكامل (مثل QUO-2026-0001) لإنشاء مسودة فاتورة مرتبطة به. لن أنسخ البنود من الذاكرة أو أعتمد طلبًا بلا مصدر.'
      :'Provide exactly one complete saved quotation number (for example QUO-2026-0001). I will link the invoice draft to the saved record, not reconstruct its lines.',
      proposal:null,plan,results:[],plannedBy:'local'};
    try{
      const review=prepareAiStoredQuotationInvoice(scopedVault,number);
      const proposal={capability:'tool.execute' as const,tool:'document.createDraft' as const,
        args:review,preview:review.preview,label:'Review invoice from '+review.sourceNumber,
        rationale:'Convert one exact issued quotation through the original document lifecycle. This only creates an unissued linked invoice draft after approval.'};
      return{answer:input.language==='ar'
        ?'وجدت عرض السعر المحفوظ '+review.sourceNumber+' وجهزت مراجعة فاتورة '+review.expectedInvoiceNumber+
         ' بكل '+review.lineCount+' بند وشروطها الأصلية. لم أحفظ أو أصدر الفاتورة. يلزم موافقتك لتسجيل المسودة المرتبطة بالمصدر.'
        :'Found issued quotation '+review.sourceNumber+' and prepared invoice draft '+review.expectedInvoiceNumber+
         ' from all '+review.lineCount+' original lines and terms. No draft has been saved or issued; your approval is required.',
        proposal,plan,results:[],plannedBy:'local'};
    }catch(error){
      return{answer:(input.language==='ar'?'تعذر تحويل عرض السعر المحفوظ: ':'Saved quotation conversion blocked: ')+
        (error instanceof Error?error.message:String(error))+' — No records changed.',
        proposal:null,plan,results:[],plannedBy:'local'};
    }
  }
  // A complete structured RFQ already contains the source's actual rows.
  // Never re-send only the first 2800 chars to a planner which might silently
  // lose trailing products. Stage the whole verified quote as UNSAVED.
  if(hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&explicitQuoteConversionIntent(input.message)&&(sources.some(source=>source.route==='quote_request'||source.route==='supplier_purchase')||
    input.context.conversationSources?.some?.((source:any)=>typeof source?.quoteSheetCandidate==='string'&&source.quoteSheetCandidate.length>0))){
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:[]};
    try{
      const workingDraft=quoteSourceWorkingDraft(input.context.conversationSources,runtime,input.message);
      if(!workingDraft)throw new Error('SOURCE_INCOMPLETE: The RFQ could not be prepared as a complete unsaved quotation.');
      const sourceCount=Array.isArray(input.context.conversationSources)?input.context.conversationSources.length:1;
      const message=input.language==='ar'
        ?'استخرجت '+workingDraft.items.length+' صنفًا من '+sourceCount+' ملف/ملفات، وجهزت مسودة عرض سعر داخل المحادثة فقط. لم أحفظها أو أصدرها. تكلفة المورد لا تتحول تلقائيًا إلى سعر بيع: الأسعار الناقصة تحتاج تحديدك، ويمكنك طلب هامش ربح محدد. راجع العميل والعملة والوحدات قبل PDF أو الحفظ.'
        :'Extracted '+workingDraft.items.length+' source lines from '+sourceCount+' attachment(s) into an unsaved quotation draft. Nothing was saved or issued. Supplier costs never become customer selling prices automatically. Supply a selling price or request an explicit gross margin, and review the buyer, currency and units before PDF or save.';
      return{answer:message,proposal:null,workingDraft,plan,results:[],plannedBy:'local'};
    }catch(error){
      return{answer:(input.language==='ar'?'لم أجهّز مسودة من المرفق: ':'No quotation draft was prepared from this attachment: ')+(error instanceof Error?error.message:String(error))+' — No records changed.',
        proposal:null,plan,results:[],plannedBy:'local'};
    }
  }
  // An explicitly pending in-memory draft belongs to this company/thread only.
  // No upload contents, model output or prior assistant replies may authorize edits.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode!=='advisor'&&input.context?.pendingProductImport){
    const batch=input.context.pendingProductImport as AiProductSourceImportBatch;
    const change=parseAiProductDraftCommand(input.message);
    if(change){
      try{
        const revised=reviseAiProductImportDraft(scopedVault,batch,input.message);
        const proposal={capability:'tool.execute' as const,tool:'product.importSource' as const,args:revised,
          preview:revised.rows.map(row=>({...row.preview,fileName:row.fileName})),
          label:'Review '+revised.rows.length+' staged products',
          rationale:'Updated the unsaved product catalog. Check every row and price before approving a single save.'};
        const answer=input.language==='ar'
          ?'تم تعديل المسودة فقط، ولم يُحفظ أي صنف. راجع جميع الأصناف والأسعار والعملات وأكواد SKU قبل الموافقة. يمكنك إعطاء تعديل آخر أو اعتماد القائمة.'
          :'Only the pending draft changed; no products were saved. Review all SKUs, prices and currencies before approval. You can make another edit or approve the list.';
        return{answer,proposal,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
      }catch(error){
        return{answer:(input.language==='ar'?'تعذر تعديل المسودة: ':'Draft edit rejected: ')+(error instanceof Error?error.message:String(error))+' — No products saved.',
          proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
      }
    }
    if(requestedAiProductImport(input.message)||/^(?:سجلها|سجّلها|احفظها|اعتمدها|سجلهم|سجّلهم|احفظهم|save (?:it|them)|register (?:it|them))[\s.!؟]*$/iu.test(input.message.trim())){
      const proposal={capability:'tool.execute' as const,tool:'product.importSource' as const,args:batch,
        preview:batch.rows.map(row=>({...row.preview,fileName:row.fileName})),label:'Review '+batch.rows.length+' staged products',
        rationale:'Previously staged catalog: inspect every row before approving its registration.'};
      return{answer:input.language==='ar'?'المسودة جاهزة للمراجعة. لم يُسجَّل أي صنف بعد؛ اضغط موافقة للتسجيل أو اطلب تعديلًا آخر.':'Draft ready for review. No products were registered. Approve the list or request another edit.',
        proposal,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
    }
  }
  // Reading or analyzing a product list never prepares a registration proposal.
  // In particular, 'حلل الملف' must not create an Approve/Reject business action.
  // Verified rows are summarized locally without allowing file instructions to
  // invoke model-planned mutations; explicit registration is handled below.
  if(hasSources&&runtime.scope==='business'&&runtime.conversationMode!=='advisor'&&sources.every(row=>row.route==='product_list')&&!requestedAiProductImport(input.message)){
    return{answer:summarizeReadOnlyProductSources(input.context.conversationSources,input.language),
      proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
  }
  // The user's own message must expressly request registration. Untrusted file
  // instructions never authorize a write, and source rows are not truncated here.
  if(hasSources&&runtime.scope==='business'&&runtime.conversationMode!=='advisor'&&requestedAiProductImport(input.message)){
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:[{id:'source-registration-1',tool:'product.importSource',args:{sources:input.context.conversationSources,generateMissingSku:requestedAiProductSkuGeneration(input.message)},reason:'User explicitly asked to register the attached product list.'}]};
    const execution=executeAiToolPlan(runtime,plan);
    return{answer:formatAnswer(plan,execution.results,input.language),proposal:execution.proposal,plan,results:execution.results,plannedBy:'local'};
  }
  // Three-way supplier bill match: exact issued PO + physically received
  // goods + every user-supplied invoice price, total and due date.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&isAiSupplierInvoiceMatchIntent(input.message)){
    let request:ReturnType<typeof parseAiSupplierInvoiceMatchRequest>=null;
    try{request=parseAiSupplierInvoiceMatchRequest(input.message);}catch(error){
      return{answer:(error instanceof Error?error.message:String(error))+' No records changed.',
        proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
    }
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:request?
      [{id:'local-vendor-bill-three-way-match',tool:'procurement.matchSupplierBill',args:{match:request},
        reason:'Exact supplier bill, PO, received quantities, unit prices, dates and total were supplied by the user.'}]:[]};
    if(!request)return{answer:input.language==='ar'
      ?'لمطابقة فاتورة المورد: حدّد رقم PO، مرجع الفاتورة، تاريخها، الاستحقاق، كميات وأسعار جميع البنود، والإجمالي. لم أغيّر البيانات.'
      :'Supply exact PO, vendor bill reference, invoice and due dates, every quantity and price, and total. No records changed.',
      proposal:null,plan,results:[],plannedBy:'local'};
    const executed=executeAiToolPlan(runtime,plan);
    return{answer:executed.proposal?(input.language==='ar'
       ?'جهّزت مطابقة فاتورة المورد '+request.invoiceReference+' مع أمر الشراء والاستلامات. تسجيل المطابقة يحتاج موافقة منفصلة، ولا ينشئ ذمة أو يرحّل مخزونًا.'
       :'Prepared vendor bill '+request.invoiceReference+' three-way match. Recording needs separate approval and does not post payables or stock.')
       :executed.results.map(x=>x.summary).join('\n'),
      proposal:executed.proposal,plan,results:executed.results,plannedBy:'local'};
  }
  // Post exactly one ALREADY MATCHED vendor bill as a new posted purchase.
  // No model-generated SKU selection or combined cash instruction is accepted.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&isAiSupplierPostingIntent(input.message)){
    let request:ReturnType<typeof parseAiSupplierPosting>=null;
    try{request=parseAiSupplierPosting(input.message);}catch(error){
      return{answer:(error instanceof Error?error.message:String(error))+' No changes applied.',
        proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
    }
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:request?
      [{id:'exact-matched-vendor-bill-posting',tool:'procurement.postMatchedSupplierBill',args:{posting:request},
        reason:'User specified one already matched vendor bill, primary warehouse and exact line-ordered catalog SKUs.'}]:[]};
    if(!request)return{answer:input.language==='ar'
      ?'لترحيل فاتورة مورد مطابقة: اذكر رقم PO، مرجع فاتورة المورد المطابقة، كود المستودع الرئيسي والأصناف SKU لكل بند بالترتيب. لا يمكن دمج الترحيل مع السداد أو تعليمات أخرى.'
      :'For matched vendor bill posting, supply one exact PO number, matched bill reference, primary warehouse code and ordered SKU list. Posting cannot be bundled with payment.',
      proposal:null,plan,results:[],plannedBy:'local'};
    const executed=executeAiToolPlan(runtime,plan);
    return{answer:executed.proposal?(input.language==='ar'
      ?'جهزت مراجعة ترحيل الفاتورة المطابقة '+request.invoiceReference+' إلى المخزون والذمم الدائنة، دون أي سداد. يلزم توقيع موافقة المالك أو المسؤول أولًا، وقد تلزم موافقة سياسة ترحيل الشراء إن كانت مفعلة.'
      :'Prepared a complete stock and payable posting preview for the matched bill '+request.invoiceReference+'. No cash payment. Independent owner/admin approval is required, plus any enabled purchase posting policy.')
      :executed.results.map(x=>x.summary).join('\n'),proposal:executed.proposal,plan,results:executed.results,plannedBy:'local'};
  }
  // Invoice issuance owns NEW sales stock deductions. Legacy delivery-note issue
  // requests must not create an approval card or an action that could debit twice.
  if(!hasSources&&runtime.scope==='business'&&isAiStockIssueIntent(input.message)){
    return{answer:input.language==='ar'
      ?'تم إيقاف الصرف المنفصل من سند التسليم. يصرف المخزون مرة واحدة عند إصدار فاتورة البيع النهائية، أو عبر حركة يدوية موثقة بالسبب وملف الإثبات. لم تُسجّل أي حركة.'
      :'Separate stock deduction from Delivery Notes is retired. Stock is debited once when the final sales invoice is issued, or through a documented manual movement with a reason and evidence file. No movement was posted.',
      proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
  }
  // A confirmed delivery invoice is created as an unissued draft only;
  // original source quantities and unit prices are supplied by the ledger,
  // never guessed by a model or from attachment instructions.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&isAiConfirmedInvoiceDraftIntent(input.message)){
    const number=requestedInvoiceDeliveryNumber(input.message);
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),
      calls:number?[{id:'confirmed-dn-to-invoice-draft',tool:'sales.createConfirmedInvoiceDraft',
        args:{deliveryNoteNumber:number},reason:'User explicitly named one confirmed delivery for a separately reviewed sales invoice DRAFT.'}]:[]};
    if(!number)return{answer:input.language==='ar'
      ?'حدّد رقم سند تسليم مؤكد DN-... واحدًا بالكامل لتجهيز مسودة فاتورة، دون إصدارها أو تعديل المخزون.'
      :'Give one exact confirmed DN number to prepare an invoice draft. Nothing is issued or posted.',
      proposal:null,plan,results:[],plannedBy:'local'};
    const executed=executeAiToolPlan(runtime,plan);
    return{answer:executed.proposal?(input.language==='ar'
      ?'جهزت مراجعة مسودة فاتورة من سند التسليم المؤكد '+number+' بجميع البنود وأسعارها. الحفظ يتطلب موافقتك، والإصدار والتحصيل إجراءان منفصلان.'
      :'Prepared a complete invoice draft review from confirmed delivery '+number+'. Saving requires separate approval; issuance and collection are separate.')
      :executed.results.map(row=>row.summary).join('\n'),
      proposal:executed.proposal,plan,results:executed.results,plannedBy:'local'};
  }
  // Supplier payment is REAL cash and only attaches to an existing POSTED
  // purchase. A matched supplier invoice or PO is never a payable by itself.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&isAiSupplierSettlementIntent(input.message)){
    let request:ReturnType<typeof parseAiSupplierSettlement>=null;
    try{request=parseAiSupplierSettlement(input.message);}catch(error){
      return{answer:(error instanceof Error?error.message:String(error))+' No supplier payment recorded.',
        proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
    }
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),
      calls:request?[{id:'supplier-payment-exact',tool:'procurement.recordSupplierPayment',
        args:{settlement:request},reason:'Exact posted purchase, amount, currency, date, method and external reference from user.'}]:[]};
    if(!request)return{answer:input.language==='ar'
       ?'لسداد مورد: اذكر رقم الشراء المُرحّل PUR والمبلغ والعملة والتاريخ والطريقة والمرجع البنكي. لا يجوز السداد بمجرد وجود PO أو فاتورة مطابقة، ولم أسجل دفعة.'
       :'Specify one posted PUR purchase number, exact amount/currency, date, method and unique external reference. A PO or matched bill alone cannot be paid. Nothing recorded.',
       proposal:null,plan,results:[],plannedBy:'local'};
    const executed=executeAiToolPlan(runtime,plan);
    return{answer:executed.proposal?(input.language==='ar'
       ?'جهزت مراجعة سداد المورد '+request.amount+' '+request.currency+' مقابل الشراء المُرحّل '+request.purchaseNumber+'. لم أسجل السداد؛ يعتمد على موافقة مالية منفصلة وإعادة فحص الرصيد.'
       :'Prepared '+request.amount+' '+request.currency+' supplier settlement for posted purchase '+request.purchaseNumber+'. Nothing paid yet; separate finance approval and fresh payable verification required.')
       :executed.results.map(x=>x.summary).join('\n'),
      proposal:executed.proposal,plan,results:executed.results,plannedBy:'local'};
  }
  // Customer collection records real MONEY and is strictly user-grounded.
  // Never infer an amount, currency or external bank reference from model data.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&isAiCustomerCollectionIntent(input.message)){
    let request:ReturnType<typeof parseAiCustomerCollection>=null;
    try{request=parseAiCustomerCollection(input.message);}catch(error){
      return{answer:(error instanceof Error?error.message:String(error))+' No payment recorded.',
        proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
    }
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),
      calls:request?[{id:'exact-invoice-collection',tool:'sales.recordCustomerCollection',
       args:{collection:request},reason:'User supplied exact issued invoice, amount, currency, date, method and distinct reference.'}]:[]};
    if(!request)return{answer:input.language==='ar'
      ?'لتحصيل فاتورة: اذكر رقم INV والمبلغ والعملة والتاريخ والطريقة والمرجع. مثال: سجّل تحصيل فاتورة INV-2026-0001، المبلغ 100 USD، التاريخ 2026-10-13، الطريقة bank-transfer، المرجع BANK-123. لم أسجّل دفعة.'
      :'Specify invoice number, amount and currency, date, method and unique reference. No payment recorded.',
      proposal:null,plan,results:[],plannedBy:'local'};
    const result=executeAiToolPlan(runtime,plan);
    return{answer:result.proposal?(input.language==='ar'
      ?'حضّرت مراجعة تحصيل '+request.amount+' '+request.currency+' للفاتورة '+request.invoiceNumber+
        '. لم أسجّل الدفعة بعد؛ الموافقة المستقلة لازمة ويعاد فحص الرصيد عند الحفظ.'
      :'Prepared '+request.amount+' '+request.currency+' collection review for '+request.invoiceNumber+
        '. No payment was recorded; separate approval and balance revalidation are required.')
      :result.results.map(x=>x.summary).join('\n'),
      proposal:result.proposal,plan,results:result.results,plannedBy:'local'};
  }
  // User-provided physical confirmation with one explicit DN, reference
  // and date. NEVER equate issuing a DN with actual physical delivery.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&isAiConfirmPhysicalDeliveryIntent(input.message)){
    let requested:ReturnType<typeof parseAiConfirmPhysicalDeliveryRequest>=null;
    try{requested=parseAiConfirmPhysicalDeliveryRequest(input.message);}catch(error){
      return{answer:(error instanceof Error?error.message:String(error))+' No records changed.',
        proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
    }
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:requested?
      [{id:'review-physical-delivery',tool:'sales.confirmPhysicalDelivery',args:{confirmation:requested},
        reason:'User supplied one exact physical delivery note, reference and date.'}]:[]};
    if(!requested)return{answer:input.language==='ar'
      ?'لتأكيد التسليم فعليًا، اذكر رقم سند التسليم DN، والمرجع الميداني، والتاريخ. لا يُخصم المخزون من مجرد التأكيد.'
      :'To record physical delivery, specify the exact issued DN number, proof reference and date. No stock is deducted by confirmation.',
      proposal:null,plan,results:[],plannedBy:'local'};
    const executed=executeAiToolPlan(runtime,plan);
    return{answer:executed.proposal
       ?(input.language==='ar'?'جهّزت مراجعة تأكيد التسليم الفعلي لسند '+requested.deliveryNoteNumber+'. يتطلب التسجيل موافقة منفصلة، دون خصم مخزون أو إصدار فاتورة.'
          :'Prepared physical delivery confirmation for '+requested.deliveryNoteNumber+'. Recording requires separate approval; no stock or invoice is posted.')
       :executed.results.map(r=>r.summary).join('\n'),
      proposal:executed.proposal,plan,results:executed.results,plannedBy:'local'};
  }
  // Exact Sales Order -> unissued delivery note. Never infer shipment,
  // confirm delivery or prepare a stock-issuing action from this request.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&operationalDeliveryDraftRequested(input.message)){
    const number=requestedDeliverySalesOrderNumber(input.message);
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),
      calls:number?[{id:'local-dn-from-so',tool:'sales.createDeliveryDraft',args:{salesOrderNumber:number},
        reason:'User explicitly identified one accepted Sales Order for a draft delivery note.'}]:[]};
    if(!number)return{answer:input.language==='ar'
       ?'اذكر رقم أمر البيع المعتمد SO-... بدقة حتى أجهز مسودة سند تسليم فقط، دون تأكيد أو صرف مخزون.'
       :'Provide an exact accepted Sales Order number to prepare an unissued DN draft without confirming delivery or posting stock.',
       proposal:null,plan,results:[],plannedBy:'local'};
    const executed=executeAiToolPlan(runtime,plan);
    const answer=executed.proposal?(input.language==='ar'
       ?'حضّرت مراجعة مسودة سند تسليم لكل الكميات المتبقية في '+number+'. الحفظ يتطلب موافقتك؛ لا يوجد تأكيد تسليم أو صرف مخزون.'
       :'Prepared the complete remaining-line delivery draft for '+number+'. Saving requires your approval; no delivery confirmation or stock posting.')
       :executed.results.map(row=>row.summary).join('\n');
    return{answer,proposal:executed.proposal,plan,results:executed.results,plannedBy:'local'};
  }
  // A goods receipt is PHYSICAL evidence, never inferred from PO quantities.
  // The user must state the PO, dated receiving reference and EACH measured
  // line quantity before a separately approved record can be prepared.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&isAiGoodsReceiptRequest(input.message)){
    let requested:ReturnType<typeof parseAiGoodsReceiptRequest>=null;
    try{requested=parseAiGoodsReceiptRequest(input.message);}catch(error){
      return{answer:(error instanceof Error?error.message:String(error))+' No records changed.',
        proposal:null,plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
    }
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),
      calls:requested?[{id:'local-reviewed-goods-receipt',tool:'procurement.recordGoodsReceipt',args:{receipt:requested},
        reason:'Explicit PO, physical receipt reference, date and every counted quantity supplied by the user.'}]:[]};
    if(!requested)return{answer:input.language==='ar'
      ?'لتجهيز استلام بضاعة: اذكر أمر الشراء PO، ومرجع الاستلام، والتاريخ، وكميات كل سطر بالترتيب (اكتب صفرًا للسطر غير المستلم). لا يوجد حفظ أو ترحيل.'
      :'To prepare receipt, specify the exact PO, receipt reference, date and all line quantities in order, including zero for unreceived lines. Nothing saved or posted.',
      proposal:null,plan,results:[],plannedBy:'local'};
    const executed=executeAiToolPlan(runtime,plan);
    const answer=executed.proposal?(input.language==='ar'
      ?'أعددت مراجعة استلام '+requested.reference+' لكميات جميع بنود '+requested.purchaseOrderNumber+
        '. لا يسجل الاستلام إلا بموافقة مستقلة، ولن يرحّل المخزون أو ينشئ فاتورة.'
      :'Prepared physical receipt '+requested.reference+' for all lines in '+requested.purchaseOrderNumber+
        '. Recording requires separate approval; it does not post inventory or issue a supplier invoice.')
      :executed.results.map(row=>row.summary).join('\n');
    return{answer,proposal:executed.proposal,plan,results:executed.results,plannedBy:'local'};
  }
  // Deterministic PO request from a user-named exact RFQ. File/model text
  // cannot identify the source or authorize saving or inventory movement.
  if(!hasSources&&runtime.scope==='business'&&runtime.conversationMode==='controller'&&operationalPoDraftRequested(input.message)){
    const number=requestedPoRfqNumber(input.message);
    const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:number?[{id:'local-po-from-rfq',tool:'procurement.createPoFromRfq',args:{rfqNumber:number},reason:'The user explicitly requested a PO draft from one identified issued RFQ.'}]:[]};
    if(!number)return{answer:input.language==='ar'?'حدّد رقم RFQ صادرًا واحدًا بالكامل لتجهيز مسودة أمر الشراء. لم أنشئ شيئًا أو أغيّر المخزون.':'Specify one exact issued RFQ number to prepare the purchase order draft. No records or stock changed.',proposal:null,plan,results:[],plannedBy:'local'};
    const executed=executeAiToolPlan(runtime,plan);
    const summary=executed.proposal
      ?input.language==='ar'?'جهزت مراجعة مسودة أمر شراء من '+number+' بكل البنود. لن يتم حفظ المسودة إلا بعد موافقتك. لا يوجد استلام بضاعة أو ترحيل مخزون.':'Prepared a complete linked PO draft review from '+number+'. Saving the draft requires your approval. No receipt or stock posting.'
      :executed.results.map(row=>row.summary).join('\n');
    return{answer:summary,proposal:executed.proposal,plan,results:executed.results,plannedBy:'local'};
  }
  // Invoice issuance cannot imply stock deduction: the linked delivery stock
  // ledger is the only supported evidence, including in read-only Advisor mode.
  if(!hasSources&&runtime.scope==='business'&&isAiInvoiceStockEvidenceIntent(input.message)){
    return{answer:aiInvoiceStockEvidence(scopedVault,input.message,input.language),proposal:null,
      plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
  }
  // Business operational status reads are proof-bound and never stage
  // a receipt, issue a delivery, save a purchase order or change stock.
  if(!hasSources&&runtime.scope==='business'&&isOperationalDocumentStatusIntent(input.message)){
    return{answer:operationalDocumentStatus(scopedVault,input.message,input.language),proposal:null,
      plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
  }
  // F19: Advisor and Controller read the real issued-invoice ledger for the
  // highest customer receivables, rather than falling into generic search.
  // This is strictly read-only and never sums currencies or includes drafts.
  if(!hasSources&&runtime.scope==='business'&&isAiReceivablesRankingIntent(input.message)){
    return{answer:aiReceivablesRanking(scopedVault,input.message,input.language),proposal:null,
      plan:{version:1,goal:clean(input.message,240),calls:[]},results:[],plannedBy:'local'};
  }
  if(!hasSources&&runtime.scope!=='temporary'){
    const resumed=await resumeVaultSession();
    if(resumed){
      const local=await handleAssistantLocalCommand(resumed.key,{message:input.message,scope:runtime.scope,workspaceId:runtime.workspaceId,branchId:runtime.branchId,language:input.language,threadId:clean(input.context?.assistantRuntime?.threadId,120)});
      if(local){const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:[]};
        if(runtime.conversationMode==='advisor'&&local.proposal)return null; // Discuss the request without preparing an action.
        return{answer:local.answer,proposal:local.proposal,plan,results:[],plannedBy:'local'};}
    }
  }
  if(!hasSources&&isCfoIntent(input.message)){
    const brief=buildCfoBrief(input.context?.advisorV2);if(brief){
      if(!brief.available){const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:[]};return{answer:formatCfoBrief(brief,input.language),proposal:null,plan,results:[],plannedBy:'local'};}
      const plan:AiToolPlan={version:1,goal:clean(input.message,240),calls:[{id:'cfo-local-1',tool:'finance.getSummary',args:{},reason:'Build the CFO brief from deterministic Advisor V2 evidence.'}]};const execution=executeAiToolPlan(runtime,plan);return{answer:formatCfoBrief(brief,input.language),proposal:null,plan,results:execution.results,plannedBy:'local'};
    }
  }
  const dealDesk=!hasSources&&isDealDeskIntent(input.message);let plan=hasSources?null:(namedRecordReadPlan(input.message,runtime)??deterministicAiToolPlan(input.message,runtime)),plannedBy:'local'|'ai'='local';
  // Advisor remains a genuine conversation. An imperative may be discussed or
  // evaluated, but a deterministic mutation/navigation plan must not replace
  // the advisor's reply with execution errors or a proposed action.
  if(runtime.conversationMode==='advisor'){
    const permitted=new Set(aiToolPlannerCatalog(runtime.scope,'advisor').map(row=>row.id));
    if(plan?.calls.some(call=>!permitted.has(call.tool)))return null;
  }
  if(!plan){
    // Controller must report failed action planning; Advisor instead answers
    // through the regular conversational model without triggering tool planning.
    if(runtime.conversationMode==='advisor'&&explicitAiActionRequest(input.message))return null;
    // Natural business questions may retrieve verified records as well as
    // explicit commands. Ordinary conversation still uses the dialogue model.
    if(!hasSources&&!explicitAiActionRequest(input.message)&&!likelyToolIntent(input.message,input.context))return null;
    plannedBy='ai';
    const entity=input.context?.assistantRuntime?.entity??{};
    const actionRequested=explicitAiActionRequest(input.message);
    let payload:any;
    try{
      payload=await requestAiJson('/api/ai-inbox',{mode:'tool-plan',conversationMode:runtime.conversationMode==='controller'?'controller':'advisor',workingMemory:input.context?.conversationWorkingMemory||'',message:input.message,scope:runtime.scope,screen:input.context?.screen||'',entity:{type:clean(entity.type,30),id:clean(entity.id,120),label:clean(entity.label,160)},sources},input.signal,15_000);
    }catch(error){
      if(input.signal?.aborted)throw error;
      // A tool-planning service failure must not prevent ordinary discussion.
      // The model has NOT staged any mutation, so the normal business-dialogue
      // gateway can explain the request or ask for missing information.
      return null;
    }
    plan=validateAiToolPlan(payload?.plan,runtime.scope,runtime.conversationMode);
    if(!plan||!plan.calls.length)return null; // discuss instead of exposing planner JSON errors
    if(!actionRequested){
      const classes=new Map(aiToolPlannerCatalog(runtime.scope,runtime.conversationMode).map(row=>[row.id,row.class]));
      if(plan.calls.some(call=>!['read','calculate'].includes(String(classes.get(call.tool)))))return null;
    }
    // Customer/supplier master mutations are permitted only from the strict
    // local parser of the user's own command, never from model-generated plans.
    if(plan.calls.some(call=>['procurement.createPoFromRfq','procurement.recordGoodsReceipt','sales.createDeliveryDraft','sales.confirmPhysicalDelivery','sales.issueConfirmedStock','procurement.matchSupplierBill','procurement.postMatchedSupplierBill','sales.createConfirmedInvoiceDraft','sales.recordCustomerCollection','procurement.recordSupplierPayment'].includes(call.tool)))return null;
    if(plan.calls.some(call=>call.tool==='customer.master'||call.tool==='supplier.master'))
      return null;
    // Catalog-wide transformations are authorized ONLY by the deterministic
    // interpretation of an explicit user message, never by model or file text.
    if(plan.calls.some(call=>call.tool==='product.bulkUpdate'&&(Object.hasOwn(call.args,'transform')||Object.hasOwn(call.args,'groupPrice'))))
      return null;
    if(hasSources){
      const allowed=new Map(aiToolPlannerCatalog(runtime.scope,runtime.conversationMode).map(def=>[def.id,def.class]));
      const writes=plan.calls.some(call=>allowed.get(call.tool)==='execute'||allowed.get(call.tool)==='high-impact');
      if(writes&&sources.some(source=>source.truncated)){
        return{answer:input.language==='ar'?'الملفات المرفقة أكبر من الحد الآمن لتنفيذ عملية كاملة. افتح استيراد الملفات لمراجعة كل الصفوف قبل الحفظ. لم يُنفّذ أي تغيير.':'The attachments contain more data than the safe action-planning limit. Use the full file importer to review every row. No changes were made.',proposal:null,plan:{version:1,calls:[],goal:clean(input.message,240)},results:[],plannedBy:'local'};
      }
      // File contents cannot grant permission to edit data. Only the user's
      // explicit message can authorize a reviewable execution proposal.
      if(writes&&!actionRequested)return null;
    }
  }
  if(runtime.conversationMode!=='advisor')plan=promoteDocumentCreationPlan(plan,input.message);
  // A model-selected document kind must agree with the explicit user target,
  // including "invoice from quotation" and "quote from invoice" requests.
  // Fail closed rather than preparing the wrong approval payload.
  if(runtime.conversationMode==='controller'){
    const desiredKind=requestedDocumentKind(input.message);
    const creates=plan.calls.filter(call=>call.tool==='document.createDraft');
    if(creates.length&&explicitlyNegatedDocumentCreation(input.message))
      return aiPlanningUnavailableResult(input.message,input.language,'invalid');
    if(desiredKind&&creates.some(call=>(clean(call.args.kind,30)==='invoice'?'invoice':'proforma')!==desiredKind))
      return aiPlanningUnavailableResult(input.message,input.language,'invalid');
    if(desiredKind&&!creates.length&&plan.calls.some(call=>
      (call.tool==='invoice.prepare'&&desiredKind!=='invoice')||
      (call.tool==='quotation.prepare'&&desiredKind!=='proforma')))
      return aiPlanningUnavailableResult(input.message,input.language,'invalid');
  }
  const execution=executeAiToolPlan(runtime,plan);
  // An incomplete/truncated attachment cannot become a supposedly complete
  // working quote simply because the LLM chose the PREPARE tool.
  const workingDraft=hasSources&&sources.some(source=>source.truncated)
    ?null:previewOnlyWorkingDraft(plan,execution.results,runtime);
  const baseAnswer=dealDesk?formatDealDeskDecision(buildDealDeskDecision(plan,execution.results),input.language):formatAnswer(plan,execution.results,input.language);
  const previewPrepared=plan.calls.length===1&&['quotation.prepare','invoice.prepare'].includes(plan.calls[0]!.tool);
  const note=workingDraft
    ?(input.language==='ar'?'\n\nمسودة عمل جاهزة داخل المحادثة (غير محفوظة). يمكنك تعديل الأصناف، التراجع، أو طلب PDF قبل أي اعتماد.':'\n\nUnsaved working draft available in this conversation. Revise lines, undo, or request PDF without approving or saving.')
    :previewPrepared&&hasSources&&sources.some(source=>source.truncated)
      ?(input.language==='ar'?'\n\nالمرفق ناقص في سياق التخطيط، لذلك لم أجهّز مسودة عمل قابلة للاعتماد. أعد رفع ملف قابل للقراءة بالكامل.':'\n\nAttachment content was truncated; no complete working draft was staged. Provide a fully readable source.'): '';
  return{answer:boundedToolAnswer(baseAnswer+note,input.language==='ar'),proposal:execution.proposal,workingDraft:workingDraft||undefined,plan,results:execution.results,plannedBy};
}

export function aiToolAuditSummary(result:AiToolOrchestrationResult):string{return JSON.stringify({plannedBy:result.plannedBy,goal:result.plan.goal,tools:compactToolResults(result.results).map(row=>({tool:row.tool,ok:row.ok,source:row.source}))});}

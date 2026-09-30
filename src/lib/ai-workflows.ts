import type { Customer, LourexDocument, Supplier, VaultPayload } from '../types.js';

export type AiInboxRoute='customer'|'supplier'|'supplier_purchase'|'quote_request'|'product_list'|'unknown';
export type AiInboxDocumentType='commercial_registration'|'customer_rfq'|'supplier_quote'|'supplier_invoice'|'purchase_invoice'|'product_catalog'|'price_list'|'company_file'|'unknown';
export interface AiInboxClassification {route:AiInboxRoute;documentType:AiInboxDocumentType;confidence:number;reason:string;}
export type AiWorkflowMode='guardian'|'collections'|'cfo'|'daily'|'memory'|'products'|'suppliers';

export interface AiBusinessSearchResult {
  kind:'customer'|'document'|'product'|'supplier'|'purchase';
  id:string;
  label:string;
  detail:string;
  score:number;
}

const MODE_PROMPTS:Record<AiWorkflowMode,{en:string;ar:string}>={
  guardian:{
    en:'Act as LOUREX Accounting Guardian. Review the deterministic finance and business context for inconsistencies, missing cost data, invalid operations, overdue exposure, pricing-below-cost signals and unusual cost changes. Separate confirmed deterministic flags from items that only need review. Do not accuse fraud and do not invent accounting entries.',
    ar:'اعمل كحارس المحاسبة في LOUREX. راجع السياق المالي والتجاري الحتمي بحثًا عن التناقضات، بيانات التكلفة الناقصة، العمليات غير الصالحة، التعرض للمستحقات المتأخرة، البيع تحت التكلفة والتغيرات غير المعتادة في التكلفة. افصل المؤشرات الحتمية المؤكدة عن الأمور التي تحتاج مراجعة فقط. لا تتهم بوجود احتيال ولا تخترع قيودًا محاسبية.'
  },
  collections:{
    en:'Give me the LOUREX collections brief. Prioritize customers that need follow-up using deterministic overdue amounts, aging, open invoices and payment behavior. Keep currencies separate. Explain why each priority is high/medium/normal and suggest the next follow-up action. Do not claim any message was sent.',
    ar:'أعطني موجز التحصيل في LOUREX. رتب العملاء الذين يحتاجون متابعة اعتمادًا على المبالغ المتأخرة وأعمار الديون والفواتير المفتوحة وسلوك الدفع المحسوب حتميًا. أبقِ العملات منفصلة. اشرح سبب أولوية كل عميل واقترح خطوة المتابعة التالية. لا تدّعِ أن أي رسالة تم إرسالها.'
  },
  cfo:{
    en:'Give me a CFO brief for LOUREX using only deterministic context: sales, collections, receivables, overdue exposure, gross profit when complete, customer profitability, product pricing/cost signals and supplier purchasing changes. Keep currencies separate and explicitly state limitations such as unavailable cash/bank ledger or incomplete costs.',
    ar:'أعطني موجز CFO لـ LOUREX باستخدام السياق الحتمي فقط: المبيعات، التحصيل، الذمم، التعرض للمتأخرات، الربح الإجمالي عندما تكون التكلفة مكتملة، ربحية العملاء، إشارات تسعير/تكلفة المنتجات وتغيرات المشتريات والموردين. أبقِ العملات منفصلة واذكر بوضوح القيود مثل عدم توفر دفتر النقد/البنك أو نقص التكلفة.'
  },
  daily:{
    en:'Give me today’s LOUREX command-center brief. Summarize today versus the previous day, collections, issued invoices, purchases, expenses, inventory activity, missing costs, invalid operations, important cost alerts and the top actions that deserve attention. Use only deterministic context.',
    ar:'أعطني موجز مركز قيادة LOUREX لليوم. لخّص اليوم مقابل اليوم السابق، التحصيل، الفواتير الصادرة، المشتريات، المصروفات، حركة المخزون، التكاليف الناقصة، العمليات غير الصالحة، أهم تنبيهات التكلفة وأهم الإجراءات التي تستحق الانتباه. استخدم السياق الحتمي فقط.'
  },
  memory:{
    en:'Build a read-only LOUREX business-memory brief from the current deterministic records. Surface recurring or durable facts worth remembering: customer payment patterns, frequently used products, dormant/duplicate/incomplete products, supplier cost observations, recent cost shifts and important open receivable patterns. This is derived memory only; do not claim anything was permanently stored.',
    ar:'أنشئ موجز ذاكرة أعمال للقراءة فقط من سجلات LOUREX الحتمية الحالية. أبرز الحقائق المتكررة أو المستقرة التي تستحق التذكر: أنماط دفع العملاء، المنتجات المستخدمة، المنتجات الخاملة/المكررة/الناقصة، ملاحظات تكاليف الموردين، تحركات التكلفة الحديثة وأنماط الذمم المفتوحة المهمة. هذه ذاكرة مشتقة فقط؛ لا تدّعِ أن شيئًا حُفظ بشكل دائم.'
  },
  products:{
    en:'Give me the product intelligence brief: pricing health, current cost versus sale price when comparable, suggested price from company policy, cost-change alerts, missing metadata/cost, dormancy and duplicates. Do not modify any product or price.',
    ar:'أعطني موجز ذكاء المنتجات: صحة التسعير، التكلفة الحالية مقابل سعر البيع عندما تكون المقارنة صالحة، السعر المقترح من سياسة الشركة، تنبيهات تغير التكلفة، البيانات/التكلفة الناقصة، الخمول والتكرار. لا تعدل أي منتج أو سعر.'
  },
  suppliers:{
    en:'Give me the supplier and purchasing intelligence brief. Compare only the same saved item in the same currency, explain unit-cost versus landed-cost observations, recent supplier cost changes and posted-purchase alerts. Do not rank suppliers beyond the observed comparison basis and do not post or modify purchases.',
    ar:'أعطني موجز ذكاء الموردين والمشتريات. قارن فقط نفس الصنف المحفوظ وبنفس العملة، واشرح تكلفة الوحدة مقابل تكلفة الوصول، تغيرات تكاليف الموردين الحديثة وتنبيهات المشتريات المرحلة. لا ترتب الموردين خارج أساس المقارنة المرصود ولا ترحّل أو تعدل أي عملية شراء.'
  }
};

export function aiWorkflowPrompt(mode:AiWorkflowMode,arabic:boolean):string{return MODE_PROMPTS[mode][arabic?'ar':'en'];}

function normalize(value:string):string{return value.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670]/g,'').replace(/[^\p{L}\p{N}@.+-]+/gu,' ').replace(/\s+/g,' ').trim();}
function queryTokens(query:string):string[]{return Array.from(new Set(normalize(query).split(' ').filter(token=>token.length>=2))).slice(0,12);}
function scoreText(text:string,tokens:string[]):number{const value=normalize(text);if(!value||!tokens.length)return 0;let score=0;for(const token of tokens){if(value===token)score+=12;else if(value.startsWith(token))score+=7;else if(value.includes(token))score+=4;}return score;}
function customerName(customer:Customer):string{return(customer.companyNameEn||customer.companyNameAr||customer.contactPerson||'Customer').trim();}
function supplierName(supplier:Supplier):string{return(supplier.nameEn||supplier.nameAr||supplier.contactPerson||'Supplier').trim();}
function documentParty(doc:LourexDocument):string{return(doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||doc.supplierSnapshot?.nameEn||doc.supplierSnapshot?.nameAr||'').trim();}
function add(results:AiBusinessSearchResult[],kind:AiBusinessSearchResult['kind'],id:string,label:string,detail:string,text:string,tokens:string[],boost=0):void{const score=scoreText(text,tokens)+boost;if(score>0)results.push({kind,id,label:label||id,detail,score});}

export function searchBusinessRecords(vault:VaultPayload,query:string,limit=24):AiBusinessSearchResult[]{
  const tokens=queryTokens(query);if(!tokens.length)return[];const results:AiBusinessSearchResult[]=[];
  for(const customer of vault.customers){const label=customerName(customer);add(results,'customer',customer.id,label,[customer.email,customer.phone,[customer.city,customer.country].filter(Boolean).join(', ')].filter(Boolean).join(' · '),[label,customer.companyNameEn,customer.companyNameAr,customer.contactPerson,customer.email,customer.phone,customer.city,customer.country,customer.vatTaxNumber,customer.commercialRegistration,customer.notes].join(' '),tokens);}
  for(const doc of vault.documents){const party=documentParty(doc),label=[doc.number,party].filter(Boolean).join(' — ')||doc.number;const itemText=doc.items.slice(0,30).map(item=>[item.descriptionEn,item.descriptionAr,item.hsCode,item.origin].join(' ')).join(' ');add(results,'document',doc.id,label,[doc.kind,doc.status,doc.currency,doc.issueDate].filter(Boolean).join(' · '),[doc.number,doc.kind,doc.status,doc.currency,party,doc.notes,doc.terms.remarks,itemText].join(' '),tokens,/^\w+-?\d/i.test(query)&&normalize(doc.number).includes(normalize(query))?20:0);}
  for(const item of vault.savedItems){const label=(item.descriptionEn||item.descriptionAr||item.sku||'Product').trim();add(results,'product',item.id,label,[item.sku,item.unit,item.category].filter(Boolean).join(' · '),[item.sku??'',item.descriptionEn,item.descriptionAr,item.hsCode,item.origin,item.packing,item.category??'',...(item.tags??[])].join(' '),tokens);}
  for(const supplier of vault.suppliers){const label=supplierName(supplier);add(results,'supplier',supplier.id,label,[supplier.email,supplier.phone,[supplier.city,supplier.country].filter(Boolean).join(', ')].filter(Boolean).join(' · '),[label,supplier.nameEn,supplier.nameAr,supplier.contactPerson,supplier.email,supplier.phone,supplier.city,supplier.country,supplier.vatTaxNumber,supplier.commercialRegistration,supplier.notes].join(' '),tokens);}
  for(const purchase of vault.purchases){const party=(purchase.supplierSnapshot?.nameEn||purchase.supplierSnapshot?.nameAr||'').trim();const itemText=purchase.items.slice(0,30).map(item=>[item.sku,item.descriptionEn,item.descriptionAr].join(' ')).join(' ');add(results,'purchase',purchase.id,[purchase.number,party].filter(Boolean).join(' — ')||purchase.number,[purchase.status,purchase.currency,purchase.date].filter(Boolean).join(' · '),[purchase.number,purchase.status,purchase.currency,purchase.date,party,purchase.notes,itemText].join(' '),tokens);}
  return results.sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label)).slice(0,Math.max(1,Math.min(50,limit)));
}

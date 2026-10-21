import {explicitSourceDecimal} from './numbers.js';

/**
 * Read-only, bounded, exact synthetic invoice balance.
 * Only questions with a self-contained invoice amount, explicit payments and a
 * remaining-balance question qualify. No data access, LLM, FX or action calls.
 */
const DIGITS='0-9٠-٩۰-۹';
const NUMBER_REGEX=new RegExp('['+DIGITS+']['+DIGITS+',٬.٫]*','gu');
const INVOICE=/(?:فاتور[ةه]|invoice|bill)/iu;
const PAYMENT=/(?:دفعت|دفعنا|دفعة|دفعات|الدفعات|سددت|سددنا|تسديد|paid|payments?|instalments?|installments?)/iu;
const REMAINING=/(?:المتبقي|المتبقية|الباقي|باقي|يتبقى|تبقى|كم\s+بقي|كم\s+ضل|remaining|remain|balance\s+due|still\s+owe|outstanding)/iu;
const RECORDS=/(?:محفوظ[ةه]?|مسجل[ةه]?|في\s+(?:النظام|حساب\s+الشركة)|رقم\s+الفاتورة|بيانات\s+الشركة|saved|recorded|in\s+lourex|invoice\s+(?:id|number|no\.?))/iu;
const HYPOTHETICAL=/(?:افتراض|افتراضي|افتراضية|افترض|لنفترض|سيناريو|مثال|إذا|اذا|لو\s|hypothetical|suppose|assuming|scenario|what\s+if|for\s+example)/iu;
const EXTRA_TERMS=/(?:ضريبة|الضريبة|خصم|الفائدة|فوائد|صرف\s+العمل|سعر\s+الصرف|إشعار\s+دائن|tax|vat|discount|interest|exchange\s+rate|fx\s+rate|credit\s+note)/iu;
const THREE_DECIMAL=new Set(['KWD','BHD','OMR','JOD','TND','IQD']);
const CODES=/(?:\b(?:USD|EUR|SAR|AED|GBP|TRY|KWD|BHD|OMR|JOD|TND|IQD|EGP|QAR|CAD|AUD|CNY|JPY)\b)/giu;

function monetaryCurrencies(message){
  const matches=[...message.matchAll(CODES)].map(match=>match[0].toUpperCase());
  const patterns=[
    [/دولار\s*(?:أمريكي|امريكي)/giu,'USD'],
    [/ريال\s*سعودي/giu,'SAR'],[/درهم\s*إماراتي|درهم\s*اماراتي/giu,'AED'],
    [/ليرة\s*تركية/giu,'TRY'],[/يورو/giu,'EUR'],
    [/دولار/giu,'دولار'],[/ريال/giu,'ريال'],[/درهم/giu,'درهم'],
    [/دينار/giu,'دينار'],[/ليرة/giu,'ليرة']
  ];
  for(const [pattern,label] of patterns)if(pattern.test(message))matches.push(label);
  const distinct=new Set(matches);
  // The generic Arabic word is not a second currency if an explicit code
  // unambiguously identifies that same named unit.
  if(distinct.has('USD'))distinct.delete('دولار');
  if(distinct.has('SAR'))distinct.delete('ريال');
  if(distinct.has('AED'))distinct.delete('درهم');
  if(distinct.has('TRY'))distinct.delete('ليرة');
  if(distinct.size>1)return{ambiguous:true,label:''};
  return{ambiguous:false,label:distinct.values().next().value||''};
}
function scaled(value,precision){
  const exact=explicitSourceDecimal(value,12);
  if(!exact)return null;
  const parts=exact.split('.');
  const fractional=parts[1]||'';
  if(fractional.length>precision)return null;
  const whole=BigInt(parts[0]);
  const factor=10n**BigInt(precision);
  const fraction=BigInt(fractional.padEnd(precision,'0')||'0');
  return whole*factor+fraction;
}
function display(value,precision){
  const factor=10n**BigInt(precision);
  return (value/factor).toString()+'.'+(value%factor).toString().padStart(precision,'0');
}
function rejectSummary(ar,reason){
  if(reason==='currency')return ar
    ?'هذه حسبة افتراضية بعملات مختلفة أو غير واضحة. لا يمكن حساب المتبقي بعملة واحدة دون سعر صرف صريح وموثوق. لم يتم تعديل أي سجل.'
    :'This hypothetical contains conflicting or unclear currencies. A single remaining balance needs an explicit, verified exchange rate. No record was changed.';
  return ar
    ?'لا يمكن إجراء حسبة افتراضية موثوقة من هذه الأرقام؛ يرجى تحديد قيمة الفاتورة والدفعات والعملة صراحةً، وإيضاح أي ضرائب أو خصومات. لم يتم تعديل أي سجل.'
    :'I cannot reliably calculate this hypothetical from the supplied amounts. Specify the invoice total, each payment and its currency, and clarify any taxes or discounts. No record was changed.';
}
export function hypotheticalInvoiceBalance(message,language='en'){
  const original=String(message||'').trim();
  if(!original||original.length>2500||!INVOICE.test(original)||!PAYMENT.test(original)||!REMAINING.test(original))return null;
  // An actual saved invoice lookup must never be replaced by a toy example.
  if(RECORDS.test(original)&&!HYPOTHETICAL.test(original))return null;
  if(/(?:\bINV[-_/]?\d|\bPI[-_/]?\d|فاتورة\s*رقم)/iu.test(original)&&!HYPOTHETICAL.test(original))return null;
  const ar=language==='ar'||(/[\u0600-\u06ff]/u.test(original)&&language!=='en');
  const currency=monetaryCurrencies(original);
  if(currency.ambiguous)return{kind:'invoice-balance-needs-review',answer:rejectSummary(ar,'currency')};
  const rawNumbers=[...original.matchAll(NUMBER_REGEX)].map(match=>match[0].replace(/[.,٫٬]+$/u,''));
  const precision=THREE_DECIMAL.has(currency.label)?3:2;
  // Reject complex arithmetic, ambiguous decimal syntax and unexplained numbers
  // instead of manufacturing a seemingly plausible accounting result.
  if(EXTRA_TERMS.test(original)||rawNumbers.length<2||rawNumbers.length>10)
    return{kind:'invoice-balance-needs-review',answer:rejectSummary(ar,'amounts')};
  const amounts=rawNumbers.map(x=>scaled(x,precision));
  if(amounts.some(x=>x===null))return{kind:'invoice-balance-needs-review',answer:rejectSummary(ar,'amounts')};
  const [total,...payments]=amounts;
  if(total===null||total===0n||!payments.length)return{kind:'invoice-balance-needs-review',answer:rejectSummary(ar,'amounts')};
  const paid=payments.reduce((sum,value)=>sum+value,0n);
  const outstanding=total>paid?total-paid:0n;
  const excess=paid>total?paid-total:0n;
  const unit=currency.label?' '+currency.label:'';
  const steps=payments.map(p=>display(p,precision)).join(' + ');
  const answer=ar
    ?'حسبة افتراضية فقط، دون استخدام سجلات الشركة أو تعديلها.\n'
      +'قيمة الفاتورة: '+display(total,precision)+unit+'\n'
      +'الدفعات: '+steps+' = '+display(paid,precision)+unit+'\n'
      +(excess?'المتبقي: 0.'+'0'.repeat(precision)+unit+'؛ زيادة المدفوع: '+display(excess,precision)+unit+'.':
        'المتبقي: '+display(total,precision)+' − '+display(paid,precision)+' = '+display(outstanding,precision)+unit+'.')
      +(currency.label?'':'\nالعملة غير محددة في السؤال.')
    :'Hypothetical calculation only; no company records were read or changed.\n'
      +'Invoice total: '+display(total,precision)+unit+'\n'
      +'Payments: '+steps+' = '+display(paid,precision)+unit+'\n'
      +(excess?'Remaining: 0.'+'0'.repeat(precision)+unit+'; overpayment: '+display(excess,precision)+unit+'.':
        'Remaining: '+display(total,precision)+' − '+display(paid,precision)+' = '+display(outstanding,precision)+unit+'.')
      +(currency.label?'':'\nNo currency was specified.');
  return{kind:'invoice-balance-exact',answer,currency:currency.label,
    invoiceTotal:display(total,precision),payments:payments.map(x=>display(x,precision)),
    paid:display(paid,precision),remaining:display(outstanding,precision)};
}

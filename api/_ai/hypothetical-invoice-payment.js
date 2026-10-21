/** Read-only deterministic calculation. No company data, FX or write actions. */
const NUMBER=/(?<![\p{L}\p{N}.,+-])(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|\d{1,12}(?:\.\d{1,4})?)(?!(?:[\p{L}\p{N}]|[.,]\d))/gu;
const CODES=/(?<![A-Za-z])(?:USD|SAR|EUR|AED|TRY|GBP|CAD|AUD|JPY|KWD|BHD|QAR|OMR|EGP)(?![A-Za-z])/gi;
const CURRENCY_WORDS=[
 [/(?:دولار\s+أمريكي|US\s+dollars?)/giu,'USD'],
 [/(?:ريال\s+سعودي|Saudi\s+riyals?)/giu,'SAR'],
 [/(?:يورو|euros?)/giu,'EUR'],
 [/(?:ليرة\s+تركية|Turkish\s+liras?)/giu,'TRY'],
 [/(?:درهم\s+إماراتي|UAE\s+dirhams?)/giu,'AED'],
 [/(?:دولار|dollars?)/giu,'دولار'],
 [/(?:ريال|riyals?)/giu,'ريال'],
 [/(?:درهم|dirhams?)/giu,'درهم'],
 [/(?:ليرة|liras?)/giu,'ليرة']
];
const MONEY_SCALE=10000n;
function normalizeText(value){
 return String(value||'').normalize('NFKC')
 .replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-0x660))
 .replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-0x6f0))
 .replace(/٬/g,',').replace(/٫/g,'.')
 .replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g,'');
}
function numericTokens(value){return Array.from(value.matchAll(NUMBER),match=>match[0]);}
function decimalUnits(raw){
 const value=raw.replaceAll(',','');
 if(!/^\d{1,12}(?:\.\d{1,4})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');
 return BigInt(whole)*MONEY_SCALE+BigInt(fraction.padEnd(4,'0')||'0');
}
function printUnits(n){
 const sign=n<0n?'-':'',unsigned=n<0n?-n:n;
 const whole=unsigned/MONEY_SCALE;
 const fraction=String(unsigned%MONEY_SCALE).padStart(4,'0').replace(/0+$/,'').padEnd(2,'0');
 return sign+String(whole)+'.'+fraction;
}
function currencies(message){
 const codes=new Set();
 for(const match of message.matchAll(CODES))codes.add(match[0].toUpperCase());
 let other=message.replace(CODES,' ');
 for(const [pattern,code] of CURRENCY_WORDS){
   if(pattern.test(other)){codes.add(code);other=other.replace(pattern,' ');}
   pattern.lastIndex=0;
 }
 if(codes.has('USD'))codes.delete('دولار');
 if(codes.has('SAR'))codes.delete('ريال');
 if(codes.has('AED'))codes.delete('درهم');
 if(codes.has('TRY'))codes.delete('ليرة');
 return [...codes];
}
const HYPOTHESIS=/(?:افتراضي(?:ة|ه)?|افترض|فرضاً|فرضًا|على\s+سبيل\s+المثال|لو\s+عندي|اذا\s+عندي|إذا\s+عندي|hypothetical|suppose|imagine|assume|let'?s\s+say|for\s+example|if\s+i\s+(?:have|had))/iu;
const INVOICE=/(?:فاتور[ةه]|invoice|bill)/iu;
const REMAINING=/(?:المتبق[يي]|الباقي|بقي|بتبقى|كم\s+بضل|remaining|remain|left|balance\s+due|still\s+owe)/iu;
const PAYMENT=/(?:دفعت|دفعنا|دفعة|دفعات|سددت|سددنا|سداد|paid|payments?|installments?)/iu;
const NOT_SIMPLE=/(?:\d{1,4}[-/]\d{1,2}[-/]\d{1,4}|سنة\s*\d|عام\s*\d|ضريبة|الضريبة|خصم|discount|tax|vat|refund|استرجاع|استرداد|تحويل\s+عملة|سعر\s+صرف|exchange\s+rate|interest|فائدة|٪|%)/iu;
const RECORD_ACTION=/(?:احفظ|سجل\s+دفعة|أنشئ|إنشاء|أصدر|رحل|post\s+(?:a|the)\s+payment|record\s+payment|save\s+invoice|create\s+invoice)/iu;
/** Never invoke for actual saved invoices, tax, discounts, FX or mutations. */
export function hypotheticalInvoicePaymentAnswer(rawMessage,language='ar'){
 const message=normalizeText(rawMessage)
   .replace(/(^|[\s،؛])و(?=\d)/g,'$1و ')
   .replace(/(?<=\d)و(?=\d)/g,' و ');
 if(message.length>1600||!HYPOTHESIS.test(message)||!INVOICE.test(message)||
    !REMAINING.test(message)||NOT_SIMPLE.test(message)||RECORD_ACTION.test(message))return null;
 const payment=PAYMENT.exec(message);
 if(!payment)return null;
 const leading=message.slice(0,payment.index),trailing=message.slice(payment.index+payment[0].length);
 const remainingQuestion=REMAINING.exec(trailing);
 if(!remainingQuestion||remainingQuestion.index===0)return null;
 const paymentText=trailing.slice(0,remainingQuestion.index);
 if(INVOICE.test(paymentText)||numericTokens(trailing.slice(remainingQuestion.index)).length>0)return null;
 const totals=numericTokens(leading),payments=numericTokens(paymentText);
 if(totals.length!==1||payments.length<1||payments.length>12)return null;
 const invoiceTotal=decimalUnits(totals[0]);
 if(invoiceTotal===null||invoiceTotal<=0n)return null;
 const amounts=payments.map(decimalUnits);
 if(amounts.some(a=>a===null))return null;
 const paid=amounts.reduce((sum,value)=>sum+value,0n);
 const available=currencies(message),ar=language==='ar';
 if(available.length>1){
  return {answer:ar?'المثال يذكر أكثر من عملة. لا يمكن طرح الدفعات من الفاتورة دون تحويل معتمد وواضح؛ لم أستخدم أرصدة الشركة ولم تُسجل أي عملية.':'This hypothetical contains multiple currencies. I cannot subtract payments without an explicitly supported conversion. No company records were consulted or changed.',currency:'',invoiceTotal:printUnits(invoiceTotal),paid:printUnits(paid),remaining:'',overpayment:'',paymentCount:amounts.length};
 }
 const currency=available[0]||'',unit=currency?' '+currency:'';
 const balance=invoiceTotal-paid,detail=amounts.map(printUnits).join(' + ');
 const description=(ar?'فاتورة افتراضية: ':'Hypothetical invoice: ')+printUnits(invoiceTotal)+unit+
   (ar?'. مجموع الدفعات: ':'. Payments: ')+detail+' = '+printUnits(paid)+unit+'. ';
 const result=ar
   ?(balance>=0n?'المتبقي: '+printUnits(balance)+unit+'. ':'لا يوجد مبلغ متبقٍ؛ المدفوعات تتجاوز قيمة الفاتورة بـ '+printUnits(-balance)+unit+'. ')+
      (currency?'':'العملة غير محددة في السؤال. ')+'هذه عملية حسابية افتراضية فقط، ولم أستخدم سجلات الشركة أو أنشئ دفعة.'
   :(balance>=0n?'Remaining: '+printUnits(balance)+unit+'. ':'Nothing remains due; payments exceed the invoice by '+printUnits(-balance)+unit+'. ')+
      (currency?'':'Currency was not specified. ')+'No company records were read or modified.';
 return {answer:description+result,currency,invoiceTotal:printUnits(invoiceTotal),paid:printUnits(paid),remaining:printUnits(balance>0n?balance:0n),overpayment:printUnits(balance<0n?-balance:0n),paymentCount:amounts.length};
}

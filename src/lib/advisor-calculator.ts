import { decimalToScaled, isNonNegativeDecimalInput, lineTotal, normalizeDecimalInput } from './money.js';

export interface AdvisorCalculation {
  kind:'margin-price'|'markup-price'|'sale-profit'|'landed-cost'|'unit-profitability';
  summary:string;
}

const NUMBER='([0-9٠-٩۰-۹]+(?:[.,٫٬][0-9٠-٩۰-۹]+)?)';

function normalizedNumber(value:string|undefined):string{
  const normalized=normalizeDecimalInput(String(value??''));
  return isNonNegativeDecimalInput(normalized)?normalized:'';
}

function capture(message:string,patterns:string[]):string{
  for(const source of patterns){
    const match=message.match(new RegExp(source,'iu'));
    const value=normalizedNumber(match?.[1]);
    if(value)return value;
  }
  return'';
}

function roundedDivide(value:bigint,divisor:bigint):bigint{
  if(divisor===0n)return 0n;
  const sign=(value<0n)!==(divisor<0n)?-1n:1n;
  const a=value<0n?-value:value,b=divisor<0n?-divisor:divisor;
  return ((a+b/2n)/b)*sign;
}

function fixed(value:bigint,decimals=2):string{
  const scale=10n**BigInt(decimals),sign=value<0n?'-':'',abs=value<0n?-value:value;
  return `${sign}${abs/scale}.${(abs%scale).toString().padStart(decimals,'0')}`;
}

function scaled4ToMoney(value:bigint):string{return fixed(roundedDivide(value,100n),2);}
function cents(value:string):bigint{return decimalToScaled(value,2);}
function moneyDifference(left:string,right:string):string{return fixed(cents(left)-cents(right),2);}
function percentOf(part:string,total:string):string{
  const denominator=cents(total);if(denominator===0n)return'0.00';
  return fixed(roundedDivide(cents(part)*10_000n,denominator),2);
}

function costValue(message:string):string{return capture(message,[
  `(?:cost|unit cost|costs?)\\s*(?:is|=|:|at)?\\s*${NUMBER}`,
  `(?:تكلفته|تكلفتها|تكلفتي|التكلفة|تكلفة|الكلفة|كلفته|كلفتها)\\s*(?:هي|=|:)?\\s*${NUMBER}`
]);}
function marginValue(message:string):string{return capture(message,[
  `(?:margin|gross margin)\\s*(?:of|is|=|:)?\\s*${NUMBER}`,
  `(?:هامش(?:\\s+ربح)?|هامش الربح)\\s*(?:هو|=|:)?\\s*${NUMBER}`
]);}
function markupValue(message:string):string{return capture(message,[
  `(?:markup)\\s*(?:of|is|=|:)?\\s*${NUMBER}`,
  `(?:زيادة على التكلفة|مارك\\s*أب|ماركاب)\\s*(?:هي|=|:)?\\s*${NUMBER}`
]);}
function quantityValue(message:string):string{return capture(message,[
  `(?:quantity|qty|sold|buy|buying|purchase|purchasing)\\s*(?:of|is|=|:)?\\s*${NUMBER}`,
  `(?:بعت|اشتريت|شراء|الكمية|كمية)\\s*(?:هي|=|:)?\\s*${NUMBER}`,
  `${NUMBER}\\s*(?:cartons?|boxes|pcs|pieces|units|كرتون|كراتين|صندوق|صناديق|قطعة|قطع|وحدة|وحدات)`
]);}
function sellingValue(message:string):string{return capture(message,[
  `(?:selling price|sale price|sell at|sold at|price)\\s*(?:is|=|:|at)?\\s*${NUMBER}`,
  `(?:سعر البيع|سعر بيعه|سعر بيع|بعت بسعر|بيع بسعر|بسعر بيع)\\s*(?:هو|=|:)?\\s*${NUMBER}`,
  `(?:بـ|ب)\\s*${NUMBER}\\s*(?:usd|sar|ريال|دولار|\$)?`
]);}
function freightValue(message:string):string{return capture(message,[`(?:freight|shipping)\\s*(?:is|=|:)?\\s*${NUMBER}`,`(?:شحن|الشحن)\\s*(?:هو|=|:)?\\s*${NUMBER}`]);}
function dutyValue(message:string):string{return capture(message,[`(?:duty|customs?)\\s*(?:is|=|:)?\\s*${NUMBER}`,`(?:جمارك|الجمارك|رسوم جمركية)\\s*(?:هي|=|:)?\\s*${NUMBER}`]);}
function otherValue(message:string):string{return capture(message,[`(?:other costs?|other charges?)\\s*(?:is|=|:)?\\s*${NUMBER}`,`(?:تكاليف أخرى|تكاليف اخرى|مصاريف أخرى|مصاريف اخرى)\\s*(?:هي|=|:)?\\s*${NUMBER}`]);}

/** A deliberately narrow scalar calculation: current-message labels only,
 * one unambiguous cost/price pair, same explicit currency or neither supplied. */
export function explicitAdvisorUnitProfitability(message:string,language:'en'|'ar'='en'):AdvisorCalculation|null{
  if(!/\b(?:calculate|compute|what\s+is|what's)\b|احسب|كم\s+(?:هامش|نسبة)/iu.test(message))return null;
  if(/\b(?:do\s+not|don't|without)\s+(?:calculate|compute)\b|لا\s+تحسب|دون\s+حساب|\b(?:translate|repeat|reproduce|quote|recommend|explain|compare|create|invoice)\b|ترجم|انسخ|اكتب\s+النص|اشرح|قارن|تنصح|أنشئ|انشئ|فاتورة|عرض\s+سعر/iu.test(message))return null;
  if(/[%٪]|\b(?:quantity|qty|total|freight|shipping|tax|duty)\b|الكمية|كمية|إجمالي|اجمالي|شحن|ضريبة|جمارك/iu.test(message))return null;
  const intent=message.replace(/\bnot\s+(?:gross\s+)?(?:margin|markup)\b|ليس\s+(?:نسبة\s+)?(?:الزيادة على التكلفة|هامش الربح)/giu,'');
  const margin=/\b(?:gross\s+)?margin\b|هامش/iu.test(intent),markup=/\bmarkup\b|الزيادة على التكلفة/iu.test(intent);
  if(margin===markup)return null;
  const numeric='([0-9٠-٩۰-۹]+(?:[.٫][0-9٠-٩۰-۹]+)?)(?![\\p{L}\\p{N}_]|[.,٫٬][0-9٠-٩۰-۹])';
  const currency='(USD|EUR|SAR|AED|TRY|GBP|JPY|CNY|CHF|KWD|QAR|دولار|يورو|ريال|ليرة|\\$|€)';
  const pair=(labels:string)=>Array.from(message.matchAll(new RegExp('(?<![\\p{L}\\p{N}_])[وف]?(?:'+labels+')\\s*(?:is|at|هو|هي|=|:)?\\s*'+numeric+'(?:\\s*'+currency+'(?![\\p{L}\\p{N}_]))?','giu')));
  const costs=pair('unit cost|cost|تكلفة الوحدة|التكلفة|تكلفة|الكلفة'),prices=pair('selling price|sale price|price|سعر البيع|سعر بيع');
  if(costs.length!==1||prices.length!==1)return null;
  const normalizeCurrency=(v:string|undefined)=>({دولار:'USD',يورو:'EUR',ريال:'SAR',ليرة:'TRY','$':'USD','€':'EUR'}[v||'']||String(v||'').toUpperCase());
  const costCurrency=normalizeCurrency(costs[0]![2]),priceCurrency=normalizeCurrency(prices[0]![2]);
  if(costCurrency!==priceCurrency)return null;
  if(!costCurrency&&/\b[A-Z]{3}\b/.test(message))return null;
  const cost=normalizedNumber(costs[0]![1]),price=normalizedNumber(prices[0]![1]);
  if(!cost||!price)return null;
  const c=decimalToScaled(cost,4),p=decimalToScaled(price,4),denominator=margin?p:c,ar=language==='ar';
  if(denominator===0n)return{kind:'unit-profitability',summary:ar?'لا يمكن حساب النسبة لأن أساس القسمة يساوي صفرًا.':'The percentage is undefined because its denominator is zero.'};
  const percent=fixed(roundedDivide((p-c)*10_000n,denominator),2),basis=ar?(margin?'هامش الربح على المبيعات':'نسبة الزيادة على التكلفة'):(margin?'Gross margin on sales':'Markup on cost');
  return{kind:'unit-profitability',summary:ar?`${basis}: ${percent}%. الحسبة المحلية: (${price} − ${cost}) ÷ ${margin?price:cost} × 100.`:`${basis}: ${percent}%. Local calculation: (${price} − ${cost}) / ${margin?price:cost} × 100.`};
}

export function advisorCalculation(message:string,language:'en'|'ar'='en'):AdvisorCalculation|null{
  const explicit=explicitAdvisorUnitProfitability(message,language);if(explicit)return explicit;
  const ar=language==='ar';
  const cost=costValue(message),margin=marginValue(message),markup=markupValue(message);
  if(cost&&margin){
    const costScaled=decimalToScaled(cost,4),marginBasis=decimalToScaled(margin,2);
    if(marginBasis>=0n&&marginBasis<10_000n){
      const price=scaled4ToMoney(roundedDivide(costScaled*10_000n,10_000n-marginBasis));
      return{kind:'margin-price',summary:ar?`الحسبة: تكلفة الوحدة ${cost}، وهامش الربح المستهدف ${margin}%. سعر البيع المطلوب لتحقيق هذا الهامش هو ${price}.`:`Calculation: unit cost ${cost}, target gross margin ${margin}%. Required selling price: ${price}.`};
    }
  }
  if(cost&&markup){
    const costScaled=decimalToScaled(cost,4),markupBasis=decimalToScaled(markup,2);
    if(markupBasis>=0n){
      const price=scaled4ToMoney(roundedDivide(costScaled*(10_000n+markupBasis),10_000n));
      return{kind:'markup-price',summary:ar?`الحسبة: تكلفة الوحدة ${cost}، والزيادة على التكلفة ${markup}%. سعر البيع الناتج هو ${price}.`:`Calculation: unit cost ${cost}, markup on cost ${markup}%. Resulting selling price: ${price}.`};
    }
  }

  const quantity=quantityValue(message),selling=sellingValue(message);
  if(quantity&&selling&&cost){
    const revenue=lineTotal(quantity,selling),totalCost=lineTotal(quantity,cost),profit=moneyDifference(revenue,totalCost),marginPercent=percentOf(profit,revenue);
    return{kind:'sale-profit',summary:ar?`الحسبة: الكمية ${quantity}، سعر البيع ${selling}، تكلفة الوحدة ${cost}. إجمالي المبيعات ${revenue}، إجمالي التكلفة ${totalCost}، إجمالي الربح ${profit}، وهامش الربح ${marginPercent}%.`:`Calculation: quantity ${quantity}, selling price ${selling}, unit cost ${cost}. Revenue ${revenue}, total cost ${totalCost}, gross profit ${profit}, gross margin ${marginPercent}%.`};
  }

  const freight=freightValue(message),duty=dutyValue(message),other=otherValue(message);
  if(quantity&&cost&&(freight||duty||other)){
    const subtotal=lineTotal(quantity,cost),totalCents=cents(subtotal)+cents(freight||'0')+cents(duty||'0')+cents(other||'0');
    const quantityScaled=decimalToScaled(quantity,4);
    if(quantityScaled>0n){
      const landedUnitScaled=roundedDivide(totalCents*1_000_000n,quantityScaled);
      const landedTotal=fixed(totalCents,2),landedUnit=fixed(landedUnitScaled,4);
      return{kind:'landed-cost',summary:ar?`حسبة تكلفة الوصول: الكمية ${quantity}، سعر الشراء للوحدة ${cost}، قيمة البضاعة ${subtotal}، الشحن ${freight||'0.00'}، الجمارك ${duty||'0.00'}، التكاليف الأخرى ${other||'0.00'}. إجمالي تكلفة الوصول ${landedTotal}، وتكلفة الوصول للوحدة ${landedUnit}.`:`Landed-cost calculation: quantity ${quantity}, unit purchase cost ${cost}, goods subtotal ${subtotal}, freight ${freight||'0.00'}, duty/customs ${duty||'0.00'}, other costs ${other||'0.00'}. Landed total ${landedTotal}; landed cost per unit ${landedUnit}.`};
    }
  }
  return null;
}

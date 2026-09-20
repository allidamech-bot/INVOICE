import { decimalToScaled, isNonNegativeDecimalInput, lineTotal, normalizeDecimalInput } from './money.js';

export interface AdvisorCalculation {
  kind:'margin-price'|'markup-price'|'sale-profit'|'landed-cost';
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

export function advisorCalculation(message:string):AdvisorCalculation|null{
  const cost=costValue(message),margin=marginValue(message),markup=markupValue(message);
  if(cost&&margin){
    const costScaled=decimalToScaled(cost,4),marginBasis=decimalToScaled(margin,2);
    if(marginBasis>=0n&&marginBasis<10_000n){
      const priceScaled=roundedDivide(costScaled*10_000n,10_000n-marginBasis);
      return{kind:'margin-price',summary:`Deterministic calculator: unit cost ${cost}; target gross margin ${margin}%; required selling price ${scaled4ToMoney(priceScaled)}.`};
    }
  }
  if(cost&&markup){
    const costScaled=decimalToScaled(cost,4),markupBasis=decimalToScaled(markup,2);
    if(markupBasis>=0n){
      const priceScaled=roundedDivide(costScaled*(10_000n+markupBasis),10_000n);
      return{kind:'markup-price',summary:`Deterministic calculator: unit cost ${cost}; markup on cost ${markup}%; required selling price ${scaled4ToMoney(priceScaled)}.`};
    }
  }

  const quantity=quantityValue(message),selling=sellingValue(message);
  if(quantity&&selling&&cost){
    const revenue=lineTotal(quantity,selling),totalCost=lineTotal(quantity,cost),profit=moneyDifference(revenue,totalCost),marginPercent=percentOf(profit,revenue);
    return{kind:'sale-profit',summary:`Deterministic calculator: quantity ${quantity}; selling price ${selling}; unit cost ${cost}; revenue ${revenue}; total cost ${totalCost}; gross profit ${profit}; gross margin ${marginPercent}%.`};
  }

  const freight=freightValue(message),duty=dutyValue(message),other=otherValue(message);
  if(quantity&&cost&&(freight||duty||other)){
    const subtotal=lineTotal(quantity,cost),totalCents=cents(subtotal)+cents(freight||'0')+cents(duty||'0')+cents(other||'0');
    const quantityScaled=decimalToScaled(quantity,4);
    if(quantityScaled>0n){
      const landedUnitScaled=roundedDivide(totalCents*1_000_000n,quantityScaled);
      return{kind:'landed-cost',summary:`Deterministic calculator: quantity ${quantity}; unit purchase cost ${cost}; subtotal ${subtotal}; freight ${freight||'0.00'}; duty/customs ${duty||'0.00'}; other costs ${other||'0.00'}; landed total ${fixed(totalCents,2)}; landed cost per unit ${fixed(landedUnitScaled,4)}.`};
    }
  }
  return null;
}

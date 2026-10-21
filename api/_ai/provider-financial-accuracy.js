import {classifySyntheticProviderAnswer,selectedResponse} from './provider-diagnostic-classifier.js';

// Fully fictional QA questions; no customer, invoice, currency-market or workspace data is read.
// Monetary operations use clean two-decimal test fixtures with exact expected values.
export const FINANCIAL_QA_CASES=Object.freeze([
 Object.freeze({id:'D1',expected:214.2,label:'Discount + tax'}),
 Object.freeze({id:'D2',expected:725,label:'Partial receipts'}),
 Object.freeze({id:'D3',expected:220.8,label:'Fixed FX conversion'}),
 Object.freeze({id:'D4',expected:770,label:'Credit note balance'}),
 Object.freeze({id:'D5',expected:100,label:'Tax-inclusive net'})
]);

export const FINANCIAL_QA_PROMPT=`You are answering FIVE INDEPENDENT, SYNTHETIC bookkeeping arithmetic exercises. No customer data. Return ONLY a valid JSON object with EXACTLY five numeric keys "D1", "D2", "D3", "D4", "D5"; no explanation, no prose, no currency symbols, no markdown. Use two-decimal money precision.
D1: Fictional sale: 6 units at 40.00 USD each. Subtract a 15% invoice discount, then add 5% sales tax on the discounted amount. Final invoice total USD?
D2: Fictional invoice for 1250.00 USD received two payments of 325.75 USD and 199.25 USD. Remaining outstanding balance USD?
D3: Synthetic exchange rate: 1 USD = exactly 0.92 EUR for this exercise. Convert 240.00 USD to EUR.
D4: Fictional invoice 900.00 USD before 10% tax. Then issue a credit note for 200.00 USD before the same 10% tax, fully reducing the invoice. Remaining invoice due including tax USD?
D5: Fictional price includes 18% tax, gross is exactly 118.00 USD. Net amount before tax USD?
Return JSON ONLY: {"D1":number,"D2":number,"D3":number,"D4":number,"D5":number}.`;

function parseFixedJson(text){
 if(typeof text!=='string'||text.length>1600)return null;
 const trimmed=text.trim();
 const match=trimmed.match(/^\`{3}(?:json)?\s*([\s\S]*?)\s*\`{3}$/i);
 const candidate=match?match[1].trim():trimmed;
 try{
  const data=JSON.parse(candidate);
  if(!data||typeof data!=='object'||Array.isArray(data))return null;
  if(Object.keys(data).length!==FINANCIAL_QA_CASES.length)return null;
  if(Object.keys(data).some(key=>!FINANCIAL_QA_CASES.some(item=>item.id===key)))return null;
  if(FINANCIAL_QA_CASES.some(item=>typeof data[item.id]!=='number'||!Number.isFinite(data[item.id])||Math.abs(data[item.id])>1e9))return null;
  return data;
 }catch{return null;}
}

export function classifyFinancialAccuracyResponse(response,provider){
 // Reuse the existing provider-sensitive finish/error handling, which exposes no raw error.
 const baseline=classifySyntheticProviderAnswer(response,provider);
 if(['OUTPUT_BLOCKED','OUTPUT_TRUNCATED','PROVIDER_ERROR','INVALID_RESPONSE'].includes(baseline.status))return{...baseline,score:0,total:FINANCIAL_QA_CASES.length};
 const selected=selectedResponse(response,provider);
 if(['LENGTH','MAX_TOKENS','MAX_OUTPUT_TOKENS'].includes(String(selected.finish||'').toUpperCase()))
  return{status:'OUTPUT_TRUNCATED',reason:'EMPTY_CONTENT',score:0,total:FINANCIAL_QA_CASES.length};
 const parsed=parseFixedJson(selected.text);
 if(!parsed)return{
  status:'ANSWER_FORMAT',reason:'INVALID_JSON_OBJECT',score:0,total:FINANCIAL_QA_CASES.length,
  ...(baseline.actualModel?{actualModel:baseline.actualModel}:{})
 };
 const cases=FINANCIAL_QA_CASES.map(item=>{
  const reported=parsed[item.id],correct=Math.abs(Math.round(reported*100)-Math.round(item.expected*100))===0;
  return{id:item.id,expected:item.expected,reported,correct};
 });
 const score=cases.filter(item=>item.correct).length;
 return{
  status:score===cases.length?'PASSED':score>0?'PARTIAL':'WRONG_ANSWER',
  score,total:cases.length,cases,
  ...(baseline.actualModel?{actualModel:baseline.actualModel}:{}),
  ...(baseline.finishReason?{finishReason:baseline.finishReason}:{})
 };
}

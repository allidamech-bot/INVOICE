// Restricted server-only draft context. No rate lookup or tax eligibility is
// inferred here. The caller must independently resolve authoritative evidence.
const DIGEST=/^[a-f0-9]{64}$/;
const currencies=new Set(['USD','EUR','GBP','TRY','AED','QAR','BHD','KWD','OMR']);
// Restrict to currencies whose normal minor unit is two decimal places.
for(const code of ['BHD','KWD','OMR'])currencies.delete(code);
function date(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
function fields(o,allowed){return o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>allowed.includes(k));}
export function fiscalDocumentContext(input,context={}){
  if(!fields(context,['rate','exportClassification']))throw Error('INVALID_FISCAL_CONTEXT');
  const currency=input.currency;
  if(currency!=='SAR'&&!currencies.has(currency))throw Error('UNSUPPORTED_FISCAL_CURRENCY');
  let rate=null;
  if(currency!=='SAR'){
    const r=context.rate;
    if(!fields(r,['currency','sarPerUnit','taxDueDate','rateDate','source','evidenceDigest','uuid'])||r.currency!==currency||r.uuid!==input.uuid||r.source!=='SAMA'||typeof r.evidenceDigest!=='string'||!DIGEST.test(r.evidenceDigest)||!date(r.taxDueDate)||r.rateDate!==r.taxDueDate||r.taxDueDate>input.issueDate||typeof r.sarPerUnit!=='string'||!/^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,8})?$/.test(r.sarPerUnit))throw Error('FISCAL_FX_EVIDENCE_REQUIRED');
    const [whole,fraction='']=r.sarPerUnit.split('.');rate=BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));
    if(rate===0n)throw Error('INVALID_FISCAL_RATE');
    // Correction exchange-rate handling requires independently verified original terms.
    if(input.kind!=='invoice')throw Error('UNSUPPORTED_FX_CORRECTION');
  }else if(context.rate!==undefined)throw Error('UNEXPECTED_FISCAL_RATE');
  let exportCode=null;
  if(context.exportClassification!==undefined){
    const x=context.exportClassification;
    if(!fields(x,['kind','uuid','buyerCountry','evidenceDigest'])||x.uuid!==input.uuid||typeof x.evidenceDigest!=='string'||!DIGEST.test(x.evidenceDigest)||x.buyerCountry!==input.buyer?.country||x.buyerCountry==='SA'||input.mode!=='standard'||input.kind!=='invoice'||!['goods','services'].includes(x.kind))throw Error('UNSUPPORTED_EXPORT_CLASSIFICATION');
    exportCode=x.kind==='goods'?'VATEX-SA-32':'VATEX-SA-33';
  }
  return Object.freeze({currency,exportCode,vatSar(value){
    if(typeof value!=='string'||!/^(?:0|[1-9][0-9]{0,17})\.[0-9]{2}$/.test(value))throw Error('INVALID_FISCAL_VAT_TOTAL');
    if(rate===null)return value;
    const cents=(BigInt(value.replace('.',''))*rate+50000000n)/100000000n;
    if(cents>=10n**20n)throw Error('FISCAL_VAT_OVERFLOW');
    return String(cents/100n)+'.'+String(cents%100n).padStart(2,'0');
  }});
}

// Internal draft-only prepayment mapping. Evidence and remaining balances must
// be resolved and reserved by the trusted ledger, never by browser input.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const TIME=/^(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
function fields(x,names){return x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>names.includes(k));}
function day(x){return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;}
function cents(x){if(typeof x!=='string'||!/^(?:0|[1-9][0-9]{0,17})\.[0-9]{2}$/.test(x))throw Error('INVALID_PREPAYMENT_AMOUNT');return BigInt(x.replace('.',''));}
const money=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
const digest=x=>typeof x==='string'&&DIGEST.test(x);
export function resolvePrepayment(input,totals,context){
  if(context===undefined){if(input.kind==='prepayment')throw Error('PREPAYMENT_RECEIPT_REQUIRED');return null;}
  if(input.currency!=='SAR'||!input.buyer?.vatNumber||!['standard','simplified'].includes(input.mode)||!context||context.uuid!==input.uuid)throw Error('UNSUPPORTED_PREPAYMENT_SCOPE');
  const gross=cents(totals.taxInclusiveTotal);
  if(input.kind==='prepayment'){
    if(!fields(context,['kind','uuid','receivedAt','receivedGross','evidenceDigest'])||context.kind!=='receipt'||!digest(context.evidenceDigest)||!day(context.receivedAt)||context.receivedAt!==input.issueDate||cents(context.receivedGross)!==gross||gross===0n||input.supplyDate!==undefined)throw Error('INVALID_PREPAYMENT_RECEIPT');
    return {kind:'receipt',receiptEvidenceDigest:context.evidenceDigest};
  }
  if(input.kind!=='invoice'||!fields(context,['kind','uuid','references'])||context.kind!=='adjustment'||!Array.isArray(context.references)||!context.references.length||context.references.length>100)throw Error('INVALID_PREPAYMENT_ADJUSTMENT');
  const seen=new Set(),numbers=new Map(),identities=new Map(),rows=[];let paid=0n;
  for(const r of context.references){
    if(!fields(r,['uuid','number','issueDate','issueTime','typeCode','currency','mode','status','sellerVat','buyerVat','artifactDigest','category','rate','net','vat','remainingNet','remainingVat'])||typeof r.uuid!=='string'||!UUID.test(r.uuid)||r.uuid===input.uuid||typeof r.number!=='string'||!r.number.trim()||r.number.length>256||r.number===input.number||!day(r.issueDate)||!TIME.test(r.issueTime)||r.issueDate+'T'+r.issueTime>=input.issueDate+'T'+input.issueTime||r.typeCode!=='386'||r.currency!==input.currency||r.mode!==input.mode||r.status!==(r.mode==='standard'?'cleared':'reported')||r.sellerVat!==input.seller?.vatNumber||r.buyerVat!==input.buyer.vatNumber||!digest(r.artifactDigest))throw Error('INVALID_PREPAYMENT_REFERENCE');
    if(!(r.category==='S'?['5','15'].includes(r.rate):['Z','E','O'].includes(r.category)&&r.rate==='0'))throw Error('INVALID_PREPAYMENT_CATEGORY');
    const key=r.uuid+':'+r.category+':'+r.rate;
    if(seen.has(key)||(numbers.has(r.number)&&numbers.get(r.number)!==r.uuid))throw Error('DUPLICATE_PREPAYMENT');
    const identity=JSON.stringify([r.number,r.issueDate,r.issueTime,r.artifactDigest]);
    if(identities.has(r.uuid)&&identities.get(r.uuid)!==identity)throw Error('PREPAYMENT_IDENTITY_MISMATCH');
    seen.add(key);numbers.set(r.number,r.uuid);identities.set(r.uuid,identity);
    const net=cents(r.net),vat=cents(r.vat);
    if(net===0n||vat!==(net*BigInt(r.rate)+50n)/100n||net>cents(r.remainingNet)||vat>cents(r.remainingVat))throw Error('INVALID_PREPAYMENT_BALANCE');
    paid+=net+vat;rows.push({...r});
  }
  // The official guide also permits negative payoff. This restricted path keeps
  // any excess unapplied until the refund/credit lifecycle is implemented.
  if(paid>gross)throw Error('PREPAYMENT_EXCEEDS_INVOICE');
  return {kind:'adjustment',rows,prepaid:money(paid),payable:money(gross-paid)};
}

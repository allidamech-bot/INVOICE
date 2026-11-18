/** Domestic SAR VAT reconciliation preview; not a statutory return or posting engine.
 * Trusted server must authenticate scope, validate evidence, approve eligibility
 * and assign the tax recognition period. Never derive credits from purchase cost.
 */
export interface FiscalVatScope { accountUid: string; workspaceId: string; vatNumber: string }
export interface FiscalVatEntry extends FiscalVatScope {
  id: string; documentNumber: string; counterpartyVat: string; evidenceDigest: string;
  source: 'sale' | 'purchase'; kind: 'invoice' | 'credit-note' | 'debit-note';
  originalId?: string; issueDate: string; taxDate: string; currency: 'SAR';
  net: string; vat: string; deductibleVat: string;
  review: 'recognized' | 'pending' | 'excluded';
}
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const VAT=/^3[0-9]{13}3$/;
const DIGEST=/^[a-f0-9]{64}$/;
function date(value:string):boolean{
  return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
function cents(value:string):bigint{
  if(typeof value!=='string'||!/^(?:0|[1-9][0-9]{0,17})\.[0-9]{2}$/.test(value))throw Error('Invalid VAT amount.');
  return BigInt(value.replace('.',''));
}
function money(value:bigint):string{
  const abs=value<0n?-value:value;
  return (value<0n?'-':'')+String(abs/100n)+'.'+String(abs%100n).padStart(2,'0');
}
function cleanNumber(value:string):boolean{
  return typeof value==='string'&&value.length>0&&value.length<=128&&value===value.trim()&&!/[\u0000-\u001f\u007f]/.test(value);
}
export function fiscalVatPreview(scope:FiscalVatScope,entries:readonly FiscalVatEntry[],from:string,to:string){
  if(!scope||typeof scope.accountUid!=='string'||!ID.test(scope.accountUid)||typeof scope.workspaceId!=='string'||!ID.test(scope.workspaceId)||typeof scope.vatNumber!=='string'||!VAT.test(scope.vatNumber)||!date(from)||!date(to)||from>to)throw Error('Invalid VAT scope or period.');
  if(!Array.isArray(entries)||entries.length>100000)throw Error('Invalid VAT register.');
  const seen=new Map<string,FiscalVatEntry>(),keys=new Set<string>(),evidence=new Set<string>();
  for(const row of entries){
    if(!row||row.accountUid!==scope.accountUid||row.workspaceId!==scope.workspaceId||row.vatNumber!==scope.vatNumber)throw Error('VAT scope mismatch.');
    if(typeof row.id!=='string'||!ID.test(row.id)||seen.has(row.id)||!cleanNumber(row.documentNumber)||typeof row.counterpartyVat!=='string'||!VAT.test(row.counterpartyVat)||typeof row.evidenceDigest!=='string'||!DIGEST.test(row.evidenceDigest)||evidence.has(row.evidenceDigest)||row.currency!=='SAR'||!date(row.issueDate)||!date(row.taxDate)||!['sale','purchase'].includes(row.source)||!['invoice','credit-note','debit-note'].includes(row.kind)||!['recognized','pending','excluded'].includes(row.review))throw Error('Invalid or duplicate VAT record.');
    const key=JSON.stringify([row.source,row.source==='purchase'?row.counterpartyVat:scope.vatNumber,row.documentNumber]);
    if(keys.has(key))throw Error('Duplicate VAT document number.');
    const net=cents(row.net),vat=cents(row.vat),deductible=cents(row.deductibleVat);
    if(vat>net||deductible>vat||(row.source==='sale'&&deductible!==0n)||(row.review!=='recognized'&&deductible!==0n))throw Error('Invalid VAT deduction.');
    if(row.kind==='invoice'?row.originalId!==undefined:typeof row.originalId!=='string'||!ID.test(row.originalId)||row.originalId===row.id)throw Error('Invalid correction reference.');
    seen.set(row.id,row);keys.add(key);evidence.add(row.evidenceDigest);
  }
  const credited=new Map<string,{net:bigint;vat:bigint;deductible:bigint;nondeductible:bigint}>();
  for(const row of entries){
    if(row.kind==='invoice')continue;
    const original=seen.get(row.originalId!);
    if(!original||original.kind!=='invoice'||original.source!==row.source||original.counterpartyVat!==row.counterpartyVat||original.issueDate>row.issueDate||original.taxDate>row.taxDate||(row.review==='recognized'&&original.review!=='recognized'))throw Error('Invalid VAT original document.');
    if(row.kind!=='credit-note'||row.review!=='recognized')continue;
    // Conservative initial policy: credits cannot exceed original amounts; debit
    // notes do not extend capacity until a reviewed statutory policy is available.
    const old=credited.get(original.id)??{net:0n,vat:0n,deductible:0n,nondeductible:0n};
    const vat=cents(row.vat),deductible=cents(row.deductibleVat);
    const total={net:old.net+cents(row.net),vat:old.vat+vat,deductible:old.deductible+deductible,nondeductible:old.nondeductible+vat-deductible};
    if(total.net>cents(original.net)||total.vat>cents(original.vat)||total.deductible>cents(original.deductibleVat)||total.nondeductible>cents(original.vat)-cents(original.deductibleVat))throw Error('Credit exceeds original VAT capacity.');
    credited.set(original.id,total);
  }
  let salesNet=0n,outputVat=0n,purchasesNet=0n,inputVat=0n,deductibleVat=0n,pendingCount=0,excludedCount=0;
  const rows=entries.filter(row=>row.taxDate>=from&&row.taxDate<=to).map(row=>{
    if(row.review==='pending')pendingCount++;
    else if(row.review==='excluded')excludedCount++;
    else{
      const sign=row.kind==='credit-note'?-1n:1n;
      if(row.source==='sale'){salesNet+=sign*cents(row.net);outputVat+=sign*cents(row.vat);}
      else{purchasesNet+=sign*cents(row.net);inputVat+=sign*cents(row.vat);deductibleVat+=sign*cents(row.deductibleVat);}
    }
    return {...row};
  }).sort((a,b)=>a.taxDate.localeCompare(b.taxDate)||a.id.localeCompare(b.id));
  return {version:'domestic-sar-preview-v1' as const,from,to,currency:'SAR' as const,rows,
    salesNet:money(salesNet),outputVat:money(outputVat),purchasesNet:money(purchasesNet),inputVat:money(inputVat),
    deductibleVat:money(deductibleVat),nonDeductibleVat:money(inputVat-deductibleVat),netVat:money(outputVat-deductibleVat),pendingCount,excludedCount,
    readyForFiling:false as const};
}

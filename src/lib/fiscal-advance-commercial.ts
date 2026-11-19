import type { LourexDocument, VaultPayload, FiscalAdvanceBinding } from '../types.js';

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const HEX=/^[a-f0-9]{64}$/;
const need=(ok:unknown):void=>{if(!ok)throw new Error('FISCAL_ADVANCE_COMMERCIAL_INVALID');};
const day=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const identifier=(v:unknown):v is string=>typeof v==='string'&&ID.test(v);
const digest=(v:unknown):v is string=>typeof v==='string'&&HEX.test(v);
const cents=(v:string):bigint=>{need(typeof v==='string'&&/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(v));return BigInt(v.replace('.',''));};
const money=(v:bigint):string=>String(v/100n)+'.'+String(v%100n).padStart(2,'0');
const sum=(net:string,vat:string,gross:string):boolean=>cents(net)+cents(vat)===cents(gross)&&cents(gross)>0n;
const sameParty=(a:LourexDocument,b:LourexDocument):boolean=>a.workspaceId===b.workspaceId&&a.branchId===b.branchId&&a.currency===b.currency&&a.customerSnapshot?.sourceCustomerId===b.customerSnapshot?.sourceCustomerId&&a.customerSnapshot?.vatTaxNumber===b.customerSnapshot?.vatTaxNumber&&a.companySnapshot?.vatNumber===b.companySnapshot?.vatNumber;

/** Strict server-issued binding, never a user-entered invoice payment. */
export function readFiscalAdvance(doc:LourexDocument):FiscalAdvanceBinding|undefined{
  const b=doc.fiscalAdvance;if(b===undefined)return undefined;
  need(b&&typeof b==='object'&&!Array.isArray(b)&&doc.kind==='invoice'&&(b.kind==='refund'?doc.role==='credit-note':doc.role==='standard')&&doc.status==='final'&&doc.lifecycleStatus==='active'&&doc.currency==='SAR'&&identifier(doc.id)&&identifier(doc.workspaceId)&&identifier(doc.branchId)&&identifier(doc.customerSnapshot?.sourceCustomerId)&&day(doc.issueDate)&&digest(b.evidenceDigest)&&sum(b.net,b.vat,b.gross));
  if(b.kind==='receipt'){
    need(Object.keys(b).length===6&&identifier(b.treasuryEntryId)&&Array.isArray(doc.items)&&doc.items.length>0&&doc.items.every(l=>l.stockTreatment==='non-stock'));
  }else if(b.kind==='refund'){
    need(Object.keys(b).length===9&&identifier(b.receiptId)&&b.receiptId!==doc.id&&doc.creditForId===b.receiptId&&digest(b.resultDigest)&&digest(b.cashDigest)&&identifier(b.treasuryEntryId)&&Array.isArray(doc.items)&&doc.items.length>0&&doc.items.every(l=>l.stockTreatment==='non-stock'&&!l.savedItemId)&&cents(b.net)>0n);
  }else{
    need(b.kind==='settlement'&&Object.keys(b).length===6&&Array.isArray(b.allocations)&&b.allocations.length>0&&b.allocations.length<=10);
    let n=0n,v=0n;const ids=new Set<string>();
    for(const a of b.allocations){need(a&&Object.keys(a).length===4&&identifier(a.receiptId)&&a.receiptId!==doc.id&&!ids.has(a.receiptId)&&cents(a.net)>0n&&sum(a.net,a.vat,a.gross));ids.add(a.receiptId);n+=cents(a.net);v+=cents(a.vat);}
    need(n===cents(b.net)&&v===cents(b.vat));
  }
  return b;
}
export function isFiscalAdvanceReceipt(doc:LourexDocument):boolean{return readFiscalAdvance(doc)?.kind==='receipt';}
export function isFiscalAdvanceRefund(doc:LourexDocument):boolean{return readFiscalAdvance(doc)?.kind==='refund';}
// Only an exact immutable refund linked to an active original receipt counts.
export function fiscalRefundMatchesReceipt(receipt:LourexDocument,credit:LourexDocument):boolean{
  if(receipt.fiscalAdvance?.kind!=='receipt'||credit.fiscalAdvance?.kind!=='refund')return false;
  const a=readFiscalAdvance(receipt),b=readFiscalAdvance(credit);
  return a?.kind==='receipt'&&b?.kind==='refund'&&b.receiptId===receipt.id&&credit.creditForNumber===receipt.number&&sameParty(receipt,credit)&&credit.issueDate>=receipt.issueDate&&cents(b.net)<=cents(a.net)&&cents(b.vat)<=cents(a.vat);
}
export function fiscalAdvanceAppliedCents(doc:LourexDocument):bigint{const b=readFiscalAdvance(doc);return b?.kind==='settlement'?cents(b.gross):0n;}
export function fiscalReceivableCents(doc:LourexDocument,gross:bigint):bigint{const b=readFiscalAdvance(doc);if(!b)return gross;const covered=cents(b.gross);need(covered<=gross);if(b.kind==='receipt'||b.kind==='refund'){need(covered===gross);return 0n;}return gross-covered;}
export function fiscalRecognizedTax(doc:LourexDocument,net:bigint,vat:bigint):{net:bigint;vat:bigint}{const b=readFiscalAdvance(doc);if(!b)return {net,vat};const n=cents(b.net),v=cents(b.vat);need(n<=net&&v<=vat);if(b.kind==='receipt'||b.kind==='refund'){need(n===net&&v===vat);return {net,vat};}return {net:net-n,vat:vat-v};}
export type AdvanceTotals=(doc:LourexDocument)=>{grandTotal:string;tax:string};
/** A receipt is one already-recorded cash/bank deposit, not another PaymentRecord.
 * A settlement allocates liabilities at its issue date and must never create cash. */
export function assertFiscalAdvanceIntegrity(vault:Pick<VaultPayload,'documents'|'payments'|'treasuryEntries'|'treasuryAccounts'|'inventoryMovements'>,totals:AdvanceTotals):void{
  const docs=vault.documents.filter(d=>d.fiscalAdvance!==undefined);if(!docs.length)return;
  const byId=new Map(vault.documents.map(d=>[d.id,d]));need(byId.size===vault.documents.length);
  const receipts=new Map<string,{doc:LourexDocument;binding:Extract<FiscalAdvanceBinding,{kind:'receipt'}>}>(),cash=new Set<string>();
  const applications:typeof docs=[];
  for(const d of docs){const b=readFiscalAdvance(d)!;const t=totals(d),g=cents(t.grandTotal),v=cents(t.tax);need(g>=v);fiscalRecognizedTax(d,g-v,v);fiscalReceivableCents(d,g);
    need(!vault.documents.some(c=>c.role==='credit-note'&&c.creditForId===d.id&&c.status==='final'&&c.lifecycleStatus!=='voided'&&!fiscalRefundMatchesReceipt(d,c)));
    if(b.kind==='receipt'){
      need(!cash.has(b.treasuryEntryId));cash.add(b.treasuryEntryId);
      const rows=vault.treasuryEntries.filter(e=>e.id===b.treasuryEntryId);need(rows.length===1);const e=rows[0]!;
      need(e.workspaceId===d.workspaceId&&e.branchId===d.branchId&&e.currency===d.currency&&e.date===d.issueDate&&e.type==='deposit'&&e.sourceType==='manual'&&!e.sourceId&&!e.fromAccountId&&identifier(e.toAccountId)&&!e.voidedAt&&cents(e.amount)===cents(b.gross));
      const accounts=vault.treasuryAccounts.filter(a=>a.id===e.toAccountId);need(accounts.length===1&&accounts[0]!.workspaceId===d.workspaceId&&accounts[0]!.branchId===d.branchId&&accounts[0]!.currency===d.currency);
      need(!vault.payments.some(p=>p.invoiceId===d.id)&&!vault.inventoryMovements.some(m=>m.sourceId===d.id));
      receipts.set(d.id,{doc:d,binding:b});
    }else{
      if(b.kind==='refund'){
        need(!cash.has(b.treasuryEntryId));cash.add(b.treasuryEntryId);
        const rows=vault.treasuryEntries.filter(e=>e.id===b.treasuryEntryId);need(rows.length===1);const e=rows[0]!;
        need(e.workspaceId===d.workspaceId&&e.branchId===d.branchId&&e.currency===d.currency&&e.date===d.issueDate&&e.type==='withdrawal'&&e.sourceType==='manual'&&!e.sourceId&&!e.toAccountId&&identifier(e.fromAccountId)&&!e.voidedAt&&cents(e.amount)===cents(b.gross));
        const accounts=vault.treasuryAccounts.filter(a=>a.id===e.fromAccountId);need(accounts.length===1&&accounts[0]!.workspaceId===d.workspaceId&&accounts[0]!.branchId===d.branchId&&accounts[0]!.currency===d.currency);
        need(!vault.payments.some(p=>p.invoiceId===d.id)&&!vault.inventoryMovements.some(m=>m.sourceId===d.id));
      }
      applications.push(d);
    }
  }
  const used=new Map<string,{net:bigint;vat:bigint}>();
  for(const d of applications.sort((a,b)=>a.issueDate.localeCompare(b.issueDate)||a.id.localeCompare(b.id))){
    const b=readFiscalAdvance(d)!;if(b.kind==='receipt')throw new Error('FISCAL_ADVANCE_COMMERCIAL_INVALID');
    if(b.kind==='refund'){const receipt=receipts.get(b.receiptId);need(receipt&&fiscalRefundMatchesReceipt(receipt.doc,d));}
    const allocations=b.kind==='refund'?[b]:b.allocations;
    for(const a of allocations){const receipt=receipts.get(a.receiptId);need(receipt&&sameParty(receipt.doc,d)&&receipt.doc.issueDate<=d.issueDate);const r=receipt!;const prev=used.get(a.receiptId)??{net:0n,vat:0n};const next={net:prev.net+cents(a.net),vat:prev.vat+cents(a.vat)};need(next.net<=cents(r.binding.net)&&next.vat<=cents(r.binding.vat));used.set(a.receiptId,next);}
    const payments=vault.payments.filter(p=>p.invoiceId===d.id);const seen=new Set<string>();let paid=0n;
    for(const p of payments){need(p.id&&!seen.has(p.id)&&p.workspaceId===d.workspaceId&&p.branchId===d.branchId&&p.currency===d.currency&&p.customerId===d.customerSnapshot?.sourceCustomerId&&p.invoiceNumber===d.number&&day(p.date)&&p.date>=d.issueDate&&cents(p.amount)>0n);seen.add(p.id);paid+=cents(p.amount);}
    need(paid<=fiscalReceivableCents(d,cents(totals(d).grandTotal)));
  }
}
export function fiscalAdvanceBalances(documents:LourexDocument[],through:string):{receiptId:string;number:string;date:string;gross:string;applied:string;refunded:string;remaining:string}[]{
  need(day(through));const docs=documents.filter(d=>d.issueDate<=through&&d.fiscalAdvance!==undefined),used=new Map<string,bigint>(),refunds=new Map<string,bigint>();
  for(const d of docs){const b=readFiscalAdvance(d)!;if(b.kind==='settlement')for(const a of b.allocations)used.set(a.receiptId,(used.get(a.receiptId)??0n)+cents(a.gross));else if(b.kind==='refund'){const receipt=docs.find(x=>x.id===b.receiptId);need(receipt&&fiscalRefundMatchesReceipt(receipt,d));refunds.set(b.receiptId,(refunds.get(b.receiptId)??0n)+cents(b.gross));}}
  return docs.flatMap(d=>{const b=readFiscalAdvance(d)!;if(b.kind!=='receipt')return [];const applied=used.get(d.id)??0n,refunded=refunds.get(d.id)??0n;need(applied+refunded<=cents(b.gross));return [{receiptId:d.id,number:d.number,date:d.issueDate,gross:b.gross,applied:money(applied),refunded:money(refunded),remaining:money(cents(b.gross)-applied-refunded)}];}).sort((a,b)=>a.date.localeCompare(b.date)||a.receiptId.localeCompare(b.receiptId));
}

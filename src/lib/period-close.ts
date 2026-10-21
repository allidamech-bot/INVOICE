import type {VaultPayload} from '../types.js';
import {isIsoDate} from './id.js';
import {financialReportByCurrency} from './reports.js';
import {outputVatReport} from './tax-vat.js';
import {receivablesByCurrency,customerStatement,receivableCustomerId} from './receivables.js';
import {supplierPayablesByCurrency,supplierStatement} from './payables.js';
import {treasuryProjection,treasuryAccountBalance} from './treasury-ledger.js';
import {warehouseItemQuantity,defaultWarehouseId} from './warehouses.js';

export interface PeriodCloseBoundary {workspaceId:string;through:string;}
type Json = null|boolean|number|string|Json[]|{[key:string]:Json};
export interface ClosedPeriodState {
  version:1;workspaceId:string;through:string;
  sources:{[key:string]:Json[]};
  branches:Array<{
    branchId:string;
    sales:ReturnType<typeof financialReportByCurrency>;
    vat:ReturnType<typeof outputVatReport>;
    receivables:ReturnType<typeof receivablesByCurrency>;
    payables:ReturnType<typeof supplierPayablesByCurrency>;
    customers:Array<{customerId:string;statement:ReturnType<typeof customerStatement>}>;
    suppliers:Array<{supplierId:string;statement:ReturnType<typeof supplierStatement>}>;
    treasury:ReturnType<typeof treasuryProjection>;
    accounts:Array<{accountId:string;currency:string;balance:string}>;
    inventory:Array<{itemId:string;warehouseId:string;quantity:string}>;
  }>;
}

// Stable, detached JSON is the retained data, not a hash of unavailable inputs.
function stable(value:unknown):Json {
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
    .filter(([,item])=>item!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0)
    .map(([key,item])=>[key,stable(item)]));
  throw new Error('Closed period data must be finite JSON.');
}
function ordered<T extends {id:string}>(rows:T[]):T[]{return [...rows].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
function omit(record:object,keys:string[]):any{return Object.fromEntries(Object.entries(record).filter(([key])=>!keys.includes(key)));}
function day(value:string):string {
  if(typeof value!=='string'||!isIsoDate(value))throw new Error('Closed period transaction date is invalid.');
  return value;
}
function timestampDay(value:string):string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    ||!Number.isFinite(Date.parse(value)))throw new Error('Closed period event date is invalid.');
  return day(value.slice(0,10));
}

/** Pure foundation over a migrated, schema-validated full account payload.
 * The caller must supply authenticated server-owned boundaries.
 * This function neither authorizes a close nor installs client/server write guards.
 */
export function closedPeriodState(vault:VaultPayload,boundary:PeriodCloseBoundary):ClosedPeriodState {
  const through=day(boundary.through),workspaceId=boundary.workspaceId;
  if(!workspaceId||vault.workspaces.filter(w=>w.id===workspaceId).length!==1)
    throw new Error('Closed period workspace is missing or ambiguous.');
  const companyCurrency=vault.workspaces.find(w=>w.id===workspaceId)!.smartDefaults.currency;
  function currency(value:string):string {
    if(typeof value!=='string'||! /^[A-Z]{3}$/.test(value))throw new Error('Closed period currency is missing or invalid.');
    return value;
  }
  currency(companyCurrency);
  const branches=vault.branches.filter(b=>b.workspaceId===workspaceId);
  if(new Set(branches.map(b=>b.id)).size!==branches.length)throw new Error('Closed period duplicate branch identity.');
  const branchIds=new Set(branches.map(b=>b.id));
  function scoped<T extends {id:string;workspaceId?:string;branchId?:string}>(rows:T[],branchScoped=true):T[]{
    const ids=new Set<string>();
    for(const row of rows){
      if(!row.id||ids.has(row.id))throw new Error('Closed period duplicate or missing record identity.');
      ids.add(row.id);
      if(!row.workspaceId||branchScoped&&!row.branchId)throw new Error('Closed period record scope is missing.');
      if(row.workspaceId===workspaceId&&branchScoped&&!branchIds.has(row.branchId!))throw new Error('Closed period branch scope is invalid.');
    }
    return ordered(rows.filter(row=>row.workspaceId===workspaceId));
  }
  const dated=<T extends {date:string}>(rows:T[])=>rows.filter(row=>day(row.date)<=through);
  // Keep later cancellations out of the historical source projection only for
  // engines which explicitly preserve the state before the cancellation date.
  function asOfVoid<T extends {voidedAt?:string}>(row:T):T {
    if(!row.voidedAt||timestampDay(row.voidedAt)>through)return omit(row,['voidedAt','voidReason','updatedAt']);
    return omit(row,['updatedAt']);
  }
  const allDocuments=scoped(vault.documents),allPurchases=scoped(vault.purchases);
  const documents=allDocuments.filter(d=>d.kind==='invoice'&&d.status==='final')
    .filter(d=>day(d.issueDate)<=through);
  const payments=dated(scoped(vault.payments));
  const purchases=dated(allPurchases.filter(p=>p.status!=='draft')).map(p=>{
    if(p.postedAt)timestampDay(p.postedAt);
    if(p.reversedAt)timestampDay(p.reversedAt);
    return p.status==='reversed'&&p.reversedAt&&timestampDay(p.reversedAt)>through
      ?{...p,status:'posted' as const,reversedAt:'',reverseReason:''}:p;
  });
  const supplierPayments=dated(scoped(vault.supplierPayments)).map(asOfVoid);
  const expenses=dated(scoped(vault.expenses));
  const movements=dated(scoped(vault.inventoryMovements));
  const entries=dated(scoped(vault.treasuryEntries)).map(asOfVoid).map(e=>({
    ...e,reconciledAt:e.reconciledAt&&timestampDay(e.reconciledAt)>through?'':e.reconciledAt
  }));
  const reconciliations=scoped(vault.treasuryReconciliations).filter(r=>timestampDay(r.createdAt)<=through&&(!r.reconciledAt||timestampDay(r.reconciledAt)<=through));
  const rates=dated(scoped(vault.fxRates,false));
  for(const row of [...documents,...payments,...purchases,...supplierPayments,...expenses,...movements,...entries])currency(row.currency);
  for(const rate of rates){currency(rate.fromCurrency);currency(rate.toCurrency);}
  function sameSourceScope(row:{branchId?:string;currency:string},source:{branchId?:string;currency:string}|undefined):boolean {
    return Boolean(source&&row.branchId===source.branchId&&row.currency===source.currency);
  }
  for(const payment of payments){
    const source=allDocuments.find(d=>d.id===payment.invoiceId&&d.kind==='invoice'&&d.role!=='credit-note'&&d.status==='final');
    if(!sameSourceScope(payment,source)||source&&receivableCustomerId(source)!==payment.customerId)
      throw new Error('Closed period customer payment source reference is invalid.');
  }
  for(const payment of supplierPayments){
    const source=allPurchases.find(p=>p.id===payment.purchaseId&&p.status!=='draft');
    if(!sameSourceScope(payment,source)||source&&source.supplierSnapshot?.sourceSupplierId&&source.supplierSnapshot.sourceSupplierId!==payment.supplierId)
      throw new Error('Closed period supplier payment source reference is invalid.');
  }
  for(const credit of documents.filter(d=>d.role==='credit-note')){
    const source=allDocuments.find(d=>d.id===credit.creditForId&&d.kind==='invoice'&&d.role!=='credit-note'&&d.status==='final');
    if(!sameSourceScope(credit,source))throw new Error('Closed period credit note source reference is invalid.');
  }
  const accountIds=new Set(entries.flatMap(e=>[e.fromAccountId,e.toAccountId]).filter(Boolean));
  const accounts=scoped(vault.treasuryAccounts).filter(a=>accountIds.has(a.id));
  for(const id of accountIds)if(!accounts.some(a=>a.id===id))throw new Error('Closed period treasury account scope is missing.');
  for(const entry of entries)for(const id of [entry.fromAccountId,entry.toAccountId].filter(Boolean)){
    const account=accounts.find(a=>a.id===id)!;
    if(account.branchId!==entry.branchId)throw new Error('Closed period treasury account scope does not match its entry.');
    if(account.currency!==entry.currency)throw new Error('Closed period treasury account currency does not match its entry.');
  }
  const warehouses=scoped(vault.warehouses);
  const sourceDocs=documents.map(d=>omit(d,['appearance','notes','attachments','letter','updatedAt','createdAt','companySnapshot','language']));
  const stripUpdated=(row:object)=>omit(row,['updatedAt']);
  const sourceRows={documents:sourceDocs,payments:payments.map(stripUpdated),purchases:purchases.map(stripUpdated),
    supplierPayments:supplierPayments.map(stripUpdated),expenses:expenses.map(stripUpdated),inventoryMovements:movements,
    treasuryEntries:entries.map(stripUpdated),treasuryReconciliations:reconciliations.map(stripUpdated),
    treasuryAccounts:accounts.map(a=>omit(a,['updatedAt','active','label'])),fxRates:rates.map(stripUpdated)};
  const activeBranches=new Set([...documents,...payments,...purchases,...supplierPayments,...expenses,...movements,...entries,...reconciliations].map(r=>r.branchId));
  const reports=branches.filter(b=>activeBranches.has(b.id)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(branch=>{
    const atBranch=<T extends {branchId?:string}>(rows:T[])=>rows.filter(r=>r.branchId===branch.id);
    const docs=atBranch(documents),pays=atBranch(payments),buys=atBranch(purchases),supplierPays=atBranch(supplierPayments),bank=atBranch(entries),stock=atBranch(movements);
    const customerIds=[...new Set(docs.filter(d=>d.role!=='credit-note').map(receivableCustomerId))].sort();
    const supplierIds=[...new Set(buys.map(p=>p.supplierSnapshot?.sourceSupplierId||`legacy-purchase:${p.id}`))].sort();
    const defaultId=defaultWarehouseId(branch.id);
    const locationIds=[...new Set(stock.flatMap(m=>[m.fromWarehouseId||defaultId,m.toWarehouseId||defaultId]))].sort();
    for(const id of locationIds)if(!warehouses.some(w=>w.id===id&&w.branchId===branch.id))throw new Error('Closed period warehouse scope is missing.');
    return {branchId:branch.id,sales:financialReportByCurrency(docs,pays,'',through),vat:outputVatReport(docs,'',through),
      receivables:receivablesByCurrency(docs,pays,through),payables:supplierPayablesByCurrency(buys,supplierPays,through),
      customers:customerIds.map(customerId=>({customerId,statement:customerStatement(customerId,docs,pays,through)})),
      suppliers:supplierIds.map(supplierId=>({supplierId,statement:supplierStatement(supplierId,buys,supplierPays,through)})),
      treasury:treasuryProjection(pays,supplierPays,atBranch(expenses),bank,atBranch(reconciliations),companyCurrency,through).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0),
      accounts:atBranch(accounts).map(a=>({accountId:a.id,currency:a.currency,balance:treasuryAccountBalance(a.id,bank,through)})),
      inventory:[...new Set(stock.map(m=>m.itemId))].sort().flatMap(itemId=>locationIds.map(warehouseId=>{
        const scaled=warehouseItemQuantity(itemId,warehouseId,stock,defaultId),abs=scaled<0n?-scaled:scaled;
        return{itemId,warehouseId,quantity:`${scaled<0n?'-':''}${abs/10000n}.${(abs%10000n).toString().padStart(4,'0')}`};
      }))};
  });
  return stable({version:1,workspaceId,through,sources:sourceRows,branches:reports}) as unknown as ClosedPeriodState;
}

export function assertClosedPeriodUnchanged(before:VaultPayload,after:VaultPayload,boundaries:PeriodCloseBoundary[]):void {
  for(const boundary of boundaries){
    if(JSON.stringify(closedPeriodState(before,boundary))!==JSON.stringify(closedPeriodState(after,boundary)))
      throw new Error(`Closed period through ${boundary.through} cannot be changed. Reopen it before applying this correction.`);
  }
}

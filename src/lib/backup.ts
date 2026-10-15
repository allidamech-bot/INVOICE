import type { EncryptedBackupFile, VaultPayload } from '../types.js';
import { createEncryptedBackup, decryptBackup } from '../crypto/crypto.js';
import { APP_SCHEMA_VERSION } from './defaults.js';
import { assertPostedInvoiceStockDocumentIntegrity } from './invoice-stock.js';
import { assertInvoiceVoidStockIntegrity } from './invoice-void-stock.js';
import { assertSalesReturnIntegrity } from './sales-returns.js';
import type { InventoryMovementRecord } from '../types.js';

/** A separate, high-entropy export password is safer than the 4–12 digit
 * device-unlock PIN. Imported v1 backups remain decryptable with their legacy PIN. */
export function backupPasswordIssue(password:string,pin=''):string{
  if(password.length<12)return 'Backup password must have at least 12 characters.';
  if(password.length>128)return 'Backup password must not exceed 128 characters.';
  const counts=new Map<string,number>();
  for(const char of password)counts.set(char,(counts.get(char)??0)+1);
  const highlyRepetitive=Math.max(0,...counts.values())>password.length*0.6;
  if(new Set(password).size<4||/^\d+$/.test(password)||highlyRepetitive)return 'Use a strong backup passphrase, not a numeric PIN or repeated characters.';
  if(pin&&password===pin)return 'The backup password must be different from the device PIN.';
  return '';
}

function downloadFallback(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportBackup(pin: string, vault: VaultPayload): Promise<void> {
  const data = await createEncryptedBackup(pin, vault);
  const filename = `LOUREX-Backup-${new Date().toISOString().slice(0,10)}.lourex-backup`;
  const file = new File([JSON.stringify(data, null, 2)], filename, { type: 'application/json' });

  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (typeof navigator.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await navigator.share({
        files: [file],
        title: 'LOUREX Invoice Backup',
        text: 'Encrypted LOUREX Invoice backup. Choose “Save to Files” to keep it on this device.'
      });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Backup sharing was canceled. No file has been saved.');
    }
  }

  downloadFallback(file);
}

/** Validate the decrypted vault before migration, which intentionally supplies
 * defaults for older versions. In a current-schema backup, a missing collection
 * indicates corruption rather than a legitimately old data model. */
const CURRENT_VAULT_COLLECTIONS=[
  'customers','suppliers','purchases','supplierPayments','expenses','inventoryMovements',
  'treasuryAccounts','treasuryEntries','treasuryReconciliations','fxRates','warehouses',
  'workspaces','branches','teamMembers','approvalPolicies','approvalRequests','recurringWorkflows',
  'documents','documentEvents','documentRevisions','payments','savedItems'
] as const;

export function assertRestorableBackupVault(value:unknown):asserts value is VaultPayload{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Backup data is incomplete. The existing workspace was not changed.');
  const raw=value as Record<string,unknown>;
  if(!Number.isSafeInteger(raw.schemaVersion)||Number(raw.schemaVersion)<1||Number(raw.schemaVersion)>APP_SCHEMA_VERSION)
    throw new Error('This backup uses an unsupported data version. Update LOUREX before restoring to avoid losing records.');
  const isObject=(item:unknown)=>Boolean(item&&typeof item==='object'&&!Array.isArray(item));
  if(!isObject(raw.company)||!isObject(raw.appSettings))
    throw new Error('Backup data is incomplete. The existing workspace was not changed.');
  if(!Array.isArray(raw.customers))throw new Error('Backup collection "customers" is missing or invalid. The existing workspace was not changed.');
  if(!Array.isArray(raw.documents))throw new Error('Backup collection "documents" is missing or invalid. The existing workspace was not changed.');
  const required=Number(raw.schemaVersion)>=21;
  for(const key of CURRENT_VAULT_COLLECTIONS){
    const rows=raw[key];
    if(rows===undefined&&!required)continue; // Older schemas may predate this collection.
    if(!Array.isArray(rows)||rows.some(row=>!isObject(row)))
      throw new Error(`Backup collection "${key}" is missing or invalid. The existing workspace was not changed.`);
  }
  if(!Array.isArray(raw.workspaces)&&required)throw new Error('Backup workspaces are missing.');
  if(!Array.isArray(raw.branches)&&required)throw new Error('Backup branches are missing.');
  // A structurally valid JSON file can still contain forged, orphaned or
  // partially removed STOCK ledger entries. This guard runs before accepting
  // a local import AND before hydrating a cloud snapshot. Historical vaults
  // without the new invoice-based stock ledger remain fully compatible.
  const movements=(raw.inventoryMovements??[]) as InventoryMovementRecord[];
  if(movements.some(row=>{
    const id=typeof row.id==='string'?row.id:'';
    return id.startsWith('sales-invoice-stock:')||id.startsWith('sales-invoice-void-stock:')
      ||id.startsWith('sales-credit-stock:')
      ||Boolean(row.salesReturn||row.salesReturnCorrection||row.invoiceVoidStock)
      ||typeof row.note==='string'&&row.note.startsWith('@lourex:invoice-stock:v1:');
  })){
    try{
      const vault=value as VaultPayload;
      assertPostedInvoiceStockDocumentIntegrity(vault.documents,vault.inventoryMovements);
      assertInvoiceVoidStockIntegrity(vault.documents,vault.inventoryMovements);
      assertSalesReturnIntegrity(vault);
    }catch(error){
      throw new Error('Backup posted-invoice stock ledger or physical receipt evidence is invalid. No existing workspace data was changed.',
        {cause:error});
    }
  }
}

export async function readBackup(file: File, pin: string): Promise<VaultPayload> {
  if (file.size > 50 * 1024 * 1024) throw new Error('Backup file is too large.');
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('Backup file is not valid JSON.'); }
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('This is not a valid LOUREX backup.');
  const candidate=parsed as Partial<EncryptedBackupFile>;
  if(candidate.format!=='LOUREX_BACKUP'||candidate.version!==1)throw new Error('This is not a valid LOUREX backup.');
  const restored=await decryptBackup(pin,candidate as EncryptedBackupFile);
  assertRestorableBackupVault(restored);
  return restored;
}

/**
 * Explicit user-requested portable copy of the Firebase-authoritative workspace.
 * Export files are NOT encrypted by LOUREX; the user controls where they save it.
 */
export async function exportPlainBackup(vault:VaultPayload):Promise<void>{
  assertRestorableBackupVault(vault);
  const data={format:'LOUREX_WORKSPACE_EXPORT_V2',version:2,createdAt:new Date().toISOString(),payload:vault};
  const file=new File([JSON.stringify(data)],`LOUREX-Account-${new Date().toISOString().slice(0,10)}.lourex-json`,{type:'application/json'});
  const nav=navigator as Navigator & {canShare?:(data?:ShareData)=>boolean};
  if(typeof navigator.share==='function'&&(!nav.canShare||nav.canShare({files:[file]}))){
    try{
      await navigator.share({files:[file],title:'LOUREX local copy'});
      return;
    }catch(error){
      if(error instanceof DOMException&&error.name==='AbortError')
        throw new Error('The local backup was cancelled and has not been saved.');
    }
  }
  downloadFallback(file);
}

/**
 * Importing an older but structurally valid account copy must never silently
 * erase final invoice stock debits or their immutable correction evidence.
 * Users may still import a complete identical audit ledger plus newer unrelated
 * records. True historical rollback requires a separately audited recovery path.
 */
export function assertPostedStockRestoreContinuity(current:VaultPayload,replacement:VaultPayload):void{
  const protectedStock=(row:InventoryMovementRecord):boolean=>{
    const id=row.id||'';
    return id.startsWith('sales-invoice-stock:')
      ||id.startsWith('sales-invoice-void-stock:')
      ||id.startsWith('sales-credit-stock:')
      ||id.startsWith('sales-credit-stock-correction:')
      ||Boolean(row.salesReturn||row.salesReturnCorrection||row.invoiceVoidStock)
      ||typeof row.note==='string'&&row.note.startsWith('@lourex:invoice-stock:v1:');
  };
  const previous=current.inventoryMovements.filter(protectedStock);
  if(!previous.length)return;
  const incoming=new Map(replacement.inventoryMovements.map(row=>[row.id,row]));
  const requireSame=(original:unknown,other:unknown)=>{
    if(JSON.stringify(original)!==JSON.stringify(other))
      throw new Error('This older local copy would erase or modify posted invoice stock/return audit history. Existing account data was not replaced.');
  };
  const documentIds=new Set<string>();
  for(const row of previous){
    requireSame(row,incoming.get(row.id));
    if(row.sourceId&&row.id.startsWith('sales-invoice-stock:'))documentIds.add(row.sourceId);
    if(row.invoiceVoidStock?.invoiceId)documentIds.add(row.invoiceVoidStock.invoiceId);
    if(row.salesReturn){
      documentIds.add(row.salesReturn.invoiceId);
      documentIds.add(row.salesReturn.creditNoteId);
    }
  }
  const existingDocuments=new Map(current.documents.map(doc=>[doc.id,doc]));
  const restoredDocuments=new Map(replacement.documents.map(doc=>[doc.id,doc]));
  for(const id of documentIds)requireSame(existingDocuments.get(id),restoredDocuments.get(id));
}

export async function readPlainBackup(file:File):Promise<VaultPayload>{
  if(file.size>50*1024*1024)throw new Error('Local backup is larger than 50 MB.');
  let parsed:any;
  try{parsed=JSON.parse(await file.text());}
  catch{throw new Error('The selected local backup is not valid JSON.');}
  if(parsed?.format!=='LOUREX_WORKSPACE_EXPORT_V2'||parsed.version!==2)
    throw new Error('This is not a current LOUREX local copy. Older encrypted backups cannot be opened without their original password.');
  assertRestorableBackupVault(parsed.payload);
  return parsed.payload;
}

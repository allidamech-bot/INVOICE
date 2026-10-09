import type { DocumentKind, EncryptedVaultRecord, SecurityMetadata, VaultPayload } from '../types.js';
import { APP_SCHEMA_VERSION, companySnapshotFrom, emptyVault } from '../lib/defaults.js';
import { normalizeValidityDays } from '../lib/id.js';
import { normalizeLetterData, normalizeWatermark } from '../lib/document-extras.js';
import { createRecoveryCode, createSecurity, createSecurityForChangedPin, createSecurityFromRecovery, decryptVault, encryptVault, recoverVaultKey, verifyPin } from '../crypto/crypto.js';
import { createSafetySnapshot, getEncryptedVault, getSecurity, putRecord, putSecurityAndVault } from './db.js';
import { DEFAULT_APPROVAL_POLICIES, defaultOwnerMember, normalizeApprovalPolicies } from '../lib/governance.js';
import { clearSession, getSessionKey, isSessionExpired, touchSession } from './session.js';

const TEMPLATE_IDS = new Set(['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon']);
const LATIN_FONTS = new Set(['auto','inter','source-sans','montserrat','playfair']);
const ARABIC_FONTS = new Set(['auto','cairo','tajawal','noto-kufi','noto-naskh']);
const TEXT_SCALES = new Set(['small','normal','large']);
const AUTO_LOCK_VALUES = new Set([0,5,15,30]);
const PAYMENT_METHODS = new Set(['cash','bank-transfer','card','cheque','other']);
const DOCUMENT_EVENT_TYPES = new Set(['created','issued','reissued','revision-started','revision-discarded','voided','credit-note-created','payment-recorded','payment-deleted','converted','audit']);
const PURCHASE_STATUSES = new Set(['draft','posted','reversed']);
const INVENTORY_MOVEMENT_TYPES = new Set(['opening','purchase','purchase-reversal','issue','adjustment','transfer']);
const RECURRING_TARGETS = new Set(['document','purchase']);
const RECURRING_CADENCES = new Set(['weekly','monthly','quarterly','yearly']);
const DOCUMENT_KINDS = new Set<DocumentKind>(['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt']);
const TEAM_ROLES = new Set(['owner','admin','finance','sales','purchasing','viewer']);
const TEAM_STATUSES = new Set(['active','suspended']);
const APPROVAL_ACTIONS = new Set(['issue-document','post-purchase','reverse-purchase']);
const APPROVAL_STATUSES = new Set(['pending','approved','rejected']);

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}
function cleanCurrency(value:unknown,fallback='USD'):string{return (stringValue(value,fallback).trim().toUpperCase()||fallback);}
function cleanPrefix(value:unknown,fallback:string):string{return (stringValue(value,fallback).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||fallback);}
function booleanValue(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback; }
function finiteNumber(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function languageValue(value: unknown, fallback: 'en'|'ar'|'bilingual' = 'en'): 'en'|'ar'|'bilingual' { return value === 'en' || value === 'ar' || value === 'bilingual' ? value : fallback; }
function uiLanguageValue(value: unknown, fallback: 'en'|'ar' = 'en'): 'en'|'ar' { return value === 'ar' || value === 'en' ? value : fallback; }
function templateValue(value: unknown, fallback: any = 'executive'): any { return typeof value === 'string' && TEMPLATE_IDS.has(value) ? value : fallback; }
function documentKindValue(value:unknown,fallback:DocumentKind='proforma'):DocumentKind{return typeof value==='string'&&DOCUMENT_KINDS.has(value as DocumentKind)?value as DocumentKind:fallback;}
function hexColorValue(value:unknown,fallback=''):string{const candidate=stringValue(value).trim();return /^#[0-9a-f]{6}$/i.test(candidate)?candidate:fallback;}
function textScaleValue(value:unknown):'small'|'normal'|'large'|undefined{return typeof value==='string'&&TEXT_SCALES.has(value)?value as 'small'|'normal'|'large':undefined;}
function nowIso(): string { return new Date().toISOString(); }
function normalizeBankAccounts(value:unknown):any[]{
  if(!Array.isArray(value))return[];const seen=new Set<string>();const result:any[]=[];
  value.forEach((account:any,index)=>{const id=stringValue(account?.id,`bank-${index+1}`).trim()||`bank-${index+1}`;if(id==='primary'||seen.has(id))return;seen.add(id);result.push({id,label:stringValue(account?.label,`Bank ${index+2}`),bankName:stringValue(account?.bankName),accountName:stringValue(account?.accountName),iban:stringValue(account?.iban),swift:stringValue(account?.swift),currency:cleanCurrency(account?.currency,'USD')});});return result;
}
function normalizeTaxPresets(value:unknown):any[]{if(!Array.isArray(value))return[];const seen=new Set<string>();const result:any[]=[];value.forEach((preset:any,index)=>{const id=stringValue(preset?.id,`tax-${index+1}`).trim()||`tax-${index+1}`;if(seen.has(id))return;seen.add(id);result.push({id,name:stringValue(preset?.name),rate:stringValue(preset?.rate,'0')});});return result;}
function normalizePaymentTermPresets(value:unknown,fallback:any[]):any[]{if(!Array.isArray(value))return fallback.map(item=>({...item}));const seen=new Set<string>();const result:any[]=[];value.forEach((preset:any,index)=>{const id=stringValue(preset?.id,`term-${index+1}`).trim()||`term-${index+1}`;if(seen.has(id))return;seen.add(id);result.push({id,label:stringValue(preset?.label),days:Math.min(3650,Math.max(0,Math.trunc(finiteNumber(preset?.days,0))))});});return result;}
function normalizeCommercial(value:any,fallback:any):any{const source=value&&typeof value==='object'?value:{};return{taxPresets:normalizeTaxPresets(source.taxPresets),defaultTaxPresetId:stringValue(source.defaultTaxPresetId),paymentTermPresets:normalizePaymentTermPresets(source.paymentTermPresets,fallback.paymentTermPresets),defaultPaymentTermPresetId:stringValue(source.defaultPaymentTermPresetId),pricing:{method:source.pricing?.method==='margin'?'margin':'markup',percent:stringValue(source.pricing?.percent,fallback.pricing.percent),rounding:['0.01','0.05','0.10','0.50','1.00'].includes(source.pricing?.rounding)?source.pricing.rounding:fallback.pricing.rounding}};}

export async function setupVault(pin: string, initial: VaultPayload = emptyVault(),recoveryCode?:string): Promise<{ key: CryptoKey; vault: VaultPayload; recoveryCode:string }> {
  const { metadata, key,recoveryCode:createdRecoveryCode } = await createSecurity(pin,recoveryCode);
  const encrypted = await encryptVault(key, initial);
  await putSecurityAndVault(metadata, encrypted);
  return { key, vault: initial,recoveryCode:createdRecoveryCode };
}

export function migrateVault(vault: VaultPayload): VaultPayload {
  if (!vault || typeof vault !== 'object') throw new Error('Local data is corrupted.');
  const sourceVersion = finiteNumber((vault as any).schemaVersion, 0);
  if (sourceVersion > APP_SCHEMA_VERSION) throw new Error('This data was created by a newer LOUREX Invoice version.');
  const defaults = emptyVault();
  const sourceCompany = (vault as any).company ?? {};
  const sourceBank = sourceCompany.bank ?? {};
  const defaultBank = defaults.company.bank;
  const migrated = { ...defaults, ...vault, schemaVersion: APP_SCHEMA_VERSION } as VaultPayload;

  migrated.company = {
    ...defaults.company,
    ...sourceCompany,
    nameEn:stringValue(sourceCompany.nameEn), nameAr:stringValue(sourceCompany.nameAr), logoDataUrl:stringValue(sourceCompany.logoDataUrl),
    addressEn:stringValue(sourceCompany.addressEn), addressAr:stringValue(sourceCompany.addressAr), city:stringValue(sourceCompany.city), country:stringValue(sourceCompany.country),
    phone:stringValue(sourceCompany.phone), email:stringValue(sourceCompany.email), website:stringValue(sourceCompany.website), vatNumber:stringValue(sourceCompany.vatNumber), taxNumber:stringValue(sourceCompany.taxNumber), commercialRegistration:stringValue(sourceCompany.commercialRegistration),
    bank:{
      bankName:stringValue(sourceBank.bankName,defaultBank.bankName), accountName:stringValue(sourceBank.accountName,defaultBank.accountName), iban:stringValue(sourceBank.iban,defaultBank.iban),
      swift:stringValue(sourceBank.swift,defaultBank.swift), currency:cleanCurrency(sourceBank.currency,defaultBank.currency)
    },
    bankAccounts:normalizeBankAccounts(sourceCompany.bankAccounts), defaultBankAccountId:stringValue(sourceCompany.defaultBankAccountId,'primary')||'primary',
    commercial:normalizeCommercial(sourceCompany.commercial,defaults.company.commercial),
    signatureDataUrl:stringValue(sourceCompany.signatureDataUrl), stampDataUrl:stringValue(sourceCompany.stampDataUrl),
    defaultCurrency:cleanCurrency(sourceCompany.defaultCurrency,defaults.company.defaultCurrency), defaultLanguage:languageValue(sourceCompany.defaultLanguage,defaults.company.defaultLanguage),
    defaultPaymentTerms:stringValue(sourceCompany.defaultPaymentTerms), defaultIncoterm:stringValue(sourceCompany.defaultIncoterm), defaultDeliveryTime:stringValue(sourceCompany.defaultDeliveryTime),
    defaultValidityDays:normalizeValidityDays(finiteNumber(sourceCompany.defaultValidityDays,defaults.company.defaultValidityDays)), defaultFooterText:stringValue(sourceCompany.defaultFooterText), defaultNotes:stringValue(sourceCompany.defaultNotes)
  };
  if(!new Set(['primary',...migrated.company.bankAccounts.map(account=>account.id)]).has(migrated.company.defaultBankAccountId))migrated.company.defaultBankAccountId='primary';
  if(migrated.company.commercial.defaultTaxPresetId&&!migrated.company.commercial.taxPresets.some(item=>item.id===migrated.company.commercial.defaultTaxPresetId))migrated.company.commercial.defaultTaxPresetId='';
  if(migrated.company.commercial.defaultPaymentTermPresetId&&!migrated.company.commercial.paymentTermPresets.some(item=>item.id===migrated.company.commercial.defaultPaymentTermPresetId))migrated.company.commercial.defaultPaymentTermPresetId='';

  const sourceSettings = (vault as any).appSettings ?? {};
  const sourceNumbering = sourceSettings.numbering ?? {};
  const sourceSmart = sourceSettings.smartDefaults ?? {};
  const favoriteTemplateIds = Array.isArray(sourceSmart.favoriteTemplateIds)
    ? Array.from(new Set(sourceSmart.favoriteTemplateIds.filter((id:unknown): id is string => typeof id === 'string' && TEMPLATE_IDS.has(id)))) as any
    : defaults.appSettings.smartDefaults.favoriteTemplateIds;
  migrated.appSettings = {
    ...defaults.appSettings,
    ...sourceSettings,
    autoLockMinutes: AUTO_LOCK_VALUES.has(sourceSettings.autoLockMinutes) ? sourceSettings.autoLockMinutes : defaults.appSettings.autoLockMinutes,
    uiLanguage: uiLanguageValue(sourceSettings.uiLanguage, defaults.appSettings.uiLanguage),
    activeTeamMemberId:stringValue(sourceSettings.activeTeamMemberId,'owner')||'owner',
    activeWorkspaceId:stringValue(sourceSettings.activeWorkspaceId,'default')||'default',
    activeBranchId:stringValue(sourceSettings.activeBranchId,'main')||'main',
    numbering: {
      proformaPrefix:cleanPrefix(sourceNumbering.proformaPrefix,defaults.appSettings.numbering.proformaPrefix), invoicePrefix:cleanPrefix(sourceNumbering.invoicePrefix,defaults.appSettings.numbering.invoicePrefix), creditNotePrefix:cleanPrefix(sourceNumbering.creditNotePrefix,defaults.appSettings.numbering.creditNotePrefix), purchaseOrderPrefix:cleanPrefix(sourceNumbering.purchaseOrderPrefix,defaults.appSettings.numbering.purchaseOrderPrefix||'PO'), draftPrefix:cleanPrefix(sourceNumbering.draftPrefix,defaults.appSettings.numbering.draftPrefix||'DR'),
      proformaLast:Math.max(0,Math.trunc(finiteNumber(sourceNumbering.proformaLast,defaults.appSettings.numbering.proformaLast))), invoiceLast:Math.max(0,Math.trunc(finiteNumber(sourceNumbering.invoiceLast,defaults.appSettings.numbering.invoiceLast))), creditNoteLast:Math.max(0,Math.trunc(finiteNumber(sourceNumbering.creditNoteLast,defaults.appSettings.numbering.creditNoteLast))), purchaseOrderLast:Math.max(0,Math.trunc(finiteNumber(sourceNumbering.purchaseOrderLast,defaults.appSettings.numbering.purchaseOrderLast||0))), draftLast:Math.max(0,Math.trunc(finiteNumber(sourceNumbering.draftLast,defaults.appSettings.numbering.draftLast||0))),
      proformaYear:Math.trunc(finiteNumber(sourceNumbering.proformaYear,defaults.appSettings.numbering.proformaYear)), invoiceYear:Math.trunc(finiteNumber(sourceNumbering.invoiceYear,defaults.appSettings.numbering.invoiceYear)), creditNoteYear:Math.trunc(finiteNumber(sourceNumbering.creditNoteYear,defaults.appSettings.numbering.creditNoteYear)), purchaseOrderYear:Math.trunc(finiteNumber(sourceNumbering.purchaseOrderYear,defaults.appSettings.numbering.purchaseOrderYear||new Date().getFullYear())), draftYear:Math.trunc(finiteNumber(sourceNumbering.draftYear,defaults.appSettings.numbering.draftYear||new Date().getFullYear()))
    },
    smartDefaults:{
      currency:cleanCurrency(sourceSmart.currency,defaults.appSettings.smartDefaults.currency), language:languageValue(sourceSmart.language,defaults.appSettings.smartDefaults.language),
      incoterm:stringValue(sourceSmart.incoterm), paymentTerms:stringValue(sourceSmart.paymentTerms), deliveryTime:stringValue(sourceSmart.deliveryTime),
      quoteTemplateId:templateValue(sourceSmart.quoteTemplateId,defaults.appSettings.smartDefaults.quoteTemplateId), invoiceTemplateId:templateValue(sourceSmart.invoiceTemplateId,defaults.appSettings.smartDefaults.invoiceTemplateId), favoriteTemplateIds
    }
  };
  if (sourceVersion < 2) migrated.appSettings.autoLockMinutes = 0;
  if (sourceVersion < 3) {
    migrated.appSettings.smartDefaults = {
      ...migrated.appSettings.smartDefaults,
      currency:migrated.company.defaultCurrency || migrated.appSettings.smartDefaults.currency,
      language:migrated.company.defaultLanguage || migrated.appSettings.smartDefaults.language,
      incoterm:migrated.company.defaultIncoterm || migrated.appSettings.smartDefaults.incoterm,
      paymentTerms:migrated.company.defaultPaymentTerms || migrated.appSettings.smartDefaults.paymentTerms,
      deliveryTime:migrated.company.defaultDeliveryTime || migrated.appSettings.smartDefaults.deliveryTime
    };
  }
  if(sourceVersion<14&&migrated.appSettings.numbering.proformaPrefix==='PI')migrated.appSettings.numbering.proformaPrefix='QUO';

  migrated.customers = Array.isArray((vault as any).customers) ? (vault as any).customers.map((customer:any) => ({
    id:stringValue(customer?.id), createdAt:stringValue(customer?.createdAt,nowIso()), updatedAt:stringValue(customer?.updatedAt,customer?.createdAt ? stringValue(customer.createdAt) : nowIso()),
    companyNameEn:stringValue(customer?.companyNameEn), companyNameAr:stringValue(customer?.companyNameAr), contactPerson:stringValue(customer?.contactPerson),
    addressEn:stringValue(customer?.addressEn), addressAr:stringValue(customer?.addressAr), city:stringValue(customer?.city), country:stringValue(customer?.country), phone:stringValue(customer?.phone), email:stringValue(customer?.email),
    vatTaxNumber:stringValue(customer?.vatTaxNumber), commercialRegistration:stringValue(customer?.commercialRegistration),
    preferredCurrency:stringValue(customer?.preferredCurrency).trim().toUpperCase(), paymentTermPresetId:stringValue(customer?.paymentTermPresetId), paymentTerms:stringValue(customer?.paymentTerms), paymentDueDays:stringValue(customer?.paymentDueDays), creditLimit:stringValue(customer?.creditLimit), creditCurrency:stringValue(customer?.creditCurrency).trim().toUpperCase(), notes:stringValue(customer?.notes)
  })) : [];

  migrated.suppliers = Array.isArray((vault as any).suppliers) ? (vault as any).suppliers.map((supplier:any)=>({
    id:stringValue(supplier?.id),createdAt:stringValue(supplier?.createdAt,nowIso()),updatedAt:stringValue(supplier?.updatedAt,supplier?.createdAt?stringValue(supplier.createdAt):nowIso()),
    nameEn:stringValue(supplier?.nameEn),nameAr:stringValue(supplier?.nameAr),contactPerson:stringValue(supplier?.contactPerson),address:stringValue(supplier?.address),city:stringValue(supplier?.city),country:stringValue(supplier?.country),phone:stringValue(supplier?.phone),email:stringValue(supplier?.email),vatTaxNumber:stringValue(supplier?.vatTaxNumber),commercialRegistration:stringValue(supplier?.commercialRegistration),defaultCurrency:cleanCurrency(supplier?.defaultCurrency,migrated.appSettings.smartDefaults.currency||'USD'),paymentTerms:stringValue(supplier?.paymentTerms),notes:stringValue(supplier?.notes)
  })) : [];

  migrated.purchases = Array.isArray((vault as any).purchases) ? (vault as any).purchases.map((purchase:any)=>({
    id:stringValue(purchase?.id),number:stringValue(purchase?.number),date:stringValue(purchase?.date),dueDate:stringValue(purchase?.dueDate,stringValue(purchase?.date)),supplierSnapshot:purchase?.supplierSnapshot&&typeof purchase.supplierSnapshot==='object'?{
      sourceSupplierId:stringValue(purchase.supplierSnapshot.sourceSupplierId),nameEn:stringValue(purchase.supplierSnapshot.nameEn),nameAr:stringValue(purchase.supplierSnapshot.nameAr),contactPerson:stringValue(purchase.supplierSnapshot.contactPerson),address:stringValue(purchase.supplierSnapshot.address),city:stringValue(purchase.supplierSnapshot.city),country:stringValue(purchase.supplierSnapshot.country),phone:stringValue(purchase.supplierSnapshot.phone),email:stringValue(purchase.supplierSnapshot.email),vatTaxNumber:stringValue(purchase.supplierSnapshot.vatTaxNumber),commercialRegistration:stringValue(purchase.supplierSnapshot.commercialRegistration)
    }:null,currency:cleanCurrency(purchase?.currency,migrated.appSettings.smartDefaults.currency||'USD'),items:Array.isArray(purchase?.items)?purchase.items.map((item:any)=>({
      id:stringValue(item?.id),savedItemId:stringValue(item?.savedItemId),sku:stringValue(item?.sku),descriptionEn:stringValue(item?.descriptionEn),descriptionAr:stringValue(item?.descriptionAr),quantity:stringValue(item?.quantity,'0'),unit:stringValue(item?.unit,'PCS'),unitCost:stringValue(item?.unitCost,'0'),landedUnitCost:stringValue(item?.landedUnitCost),previousUnitCost:stringValue(item?.previousUnitCost),previousCostCurrency:stringValue(item?.previousCostCurrency).trim().toUpperCase()
    })):[],freight:stringValue(purchase?.freight,'0.00'),duty:stringValue(purchase?.duty,'0.00'),otherCosts:stringValue(purchase?.otherCosts,'0.00'),notes:stringValue(purchase?.notes),status:PURCHASE_STATUSES.has(purchase?.status)?purchase.status:'draft',postedAt:stringValue(purchase?.postedAt),reversedAt:stringValue(purchase?.reversedAt),reverseReason:stringValue(purchase?.reverseReason),createdAt:stringValue(purchase?.createdAt,nowIso()),updatedAt:stringValue(purchase?.updatedAt,purchase?.createdAt?stringValue(purchase.createdAt):nowIso())
  })) : [];

  migrated.supplierPayments = Array.isArray((vault as any).supplierPayments) ? (vault as any).supplierPayments.map((payment:any)=>({
    workspaceId:stringValue(payment?.workspaceId,'default'),branchId:stringValue(payment?.branchId,'main'),
    id:stringValue(payment?.id),purchaseId:stringValue(payment?.purchaseId),purchaseNumber:stringValue(payment?.purchaseNumber),supplierId:stringValue(payment?.supplierId),supplierNameEn:stringValue(payment?.supplierNameEn),supplierNameAr:stringValue(payment?.supplierNameAr),currency:cleanCurrency(payment?.currency,migrated.appSettings.smartDefaults.currency||'USD'),amount:stringValue(payment?.amount,'0.00'),date:stringValue(payment?.date),method:PAYMENT_METHODS.has(payment?.method)?payment.method:'other',reference:stringValue(payment?.reference),notes:stringValue(payment?.notes),voidedAt:stringValue(payment?.voidedAt),voidReason:stringValue(payment?.voidReason),createdAt:stringValue(payment?.createdAt,nowIso()),updatedAt:stringValue(payment?.updatedAt,payment?.createdAt?stringValue(payment.createdAt):nowIso())
  })) : [];

  migrated.expenses = Array.isArray((vault as any).expenses) ? (vault as any).expenses.map((expense:any)=>({
    id:stringValue(expense?.id),date:stringValue(expense?.date),category:stringValue(expense?.category,'General'),description:stringValue(expense?.description),amount:stringValue(expense?.amount,'0'),currency:cleanCurrency(expense?.currency,migrated.appSettings.smartDefaults.currency||'USD'),supplierId:stringValue(expense?.supplierId),reference:stringValue(expense?.reference),notes:stringValue(expense?.notes),createdAt:stringValue(expense?.createdAt,nowIso()),updatedAt:stringValue(expense?.updatedAt,expense?.createdAt?stringValue(expense.createdAt):nowIso())
  })) : [];

  migrated.inventoryMovements = Array.isArray((vault as any).inventoryMovements) ? (vault as any).inventoryMovements.map((movement:any)=>({
    id:stringValue(movement?.id),itemId:stringValue(movement?.itemId),itemNameEn:stringValue(movement?.itemNameEn),itemNameAr:stringValue(movement?.itemNameAr),sku:stringValue(movement?.sku),date:stringValue(movement?.date),type:INVENTORY_MOVEMENT_TYPES.has(movement?.type)?movement.type:'adjustment',quantity:stringValue(movement?.quantity,'0'),unitCost:stringValue(movement?.unitCost),currency:stringValue(movement?.currency).trim().toUpperCase(),sourceId:stringValue(movement?.sourceId),sourceNumber:stringValue(movement?.sourceNumber),note:stringValue(movement?.note),fromWarehouseId:stringValue(movement?.fromWarehouseId),toWarehouseId:stringValue(movement?.toWarehouseId),createdAt:stringValue(movement?.createdAt,nowIso())
  })) : [];
  migrated.treasuryAccounts=Array.isArray((vault as any).treasuryAccounts)?(vault as any).treasuryAccounts.map((account:any)=>({id:stringValue(account?.id),workspaceId:stringValue(account?.workspaceId,'default')||'default',branchId:stringValue(account?.branchId,'main')||'main',label:stringValue(account?.label,'Treasury Account'),kind:account?.kind==='cash'?'cash':'bank',currency:cleanCurrency(account?.currency,migrated.appSettings.smartDefaults.currency||'USD'),bankAccountId:stringValue(account?.bankAccountId),active:booleanValue(account?.active,true),createdAt:stringValue(account?.createdAt,nowIso()),updatedAt:stringValue(account?.updatedAt,account?.createdAt?stringValue(account.createdAt):nowIso())})).filter((account:any)=>account.id):[];
  migrated.treasuryEntries=Array.isArray((vault as any).treasuryEntries)?(vault as any).treasuryEntries.map((entry:any)=>({id:stringValue(entry?.id),workspaceId:stringValue(entry?.workspaceId,'default')||'default',branchId:stringValue(entry?.branchId,'main')||'main',type:['opening-balance','deposit','withdrawal','transfer','collection','supplier-payment','reconciliation'].includes(entry?.type)?entry.type:'deposit',date:stringValue(entry?.date),currency:cleanCurrency(entry?.currency,migrated.appSettings.smartDefaults.currency||'USD'),amount:stringValue(entry?.amount,'0.00'),fromAccountId:stringValue(entry?.fromAccountId),toAccountId:stringValue(entry?.toAccountId),sourceType:['customer-payment','supplier-payment'].includes(entry?.sourceType)?entry.sourceType:'manual',sourceId:stringValue(entry?.sourceId),reference:stringValue(entry?.reference),notes:stringValue(entry?.notes),reconciledAt:stringValue(entry?.reconciledAt),voidedAt:stringValue(entry?.voidedAt),voidReason:stringValue(entry?.voidReason),createdAt:stringValue(entry?.createdAt,nowIso()),updatedAt:stringValue(entry?.updatedAt,entry?.createdAt?stringValue(entry.createdAt):nowIso())})).filter((entry:any)=>entry.id):[];
  for(const entry of migrated.treasuryEntries){for(const accountId of [entry.fromAccountId,entry.toAccountId]){if(!accountId||migrated.treasuryAccounts.some((account:any)=>account.id===accountId&&account.workspaceId===entry.workspaceId&&account.branchId===entry.branchId))continue;const metadata=accountId==='primary'?migrated.company.bank:(migrated.company.bankAccounts||[]).find((account:any)=>account.id===accountId);migrated.treasuryAccounts.push({id:accountId,workspaceId:entry.workspaceId||'default',branchId:entry.branchId||'main',label:stringValue((metadata as any)?.label,(metadata as any)?.bankName||accountId),kind:'bank',currency:cleanCurrency((metadata as any)?.currency,entry.currency||migrated.appSettings.smartDefaults.currency||'USD'),bankAccountId:accountId,active:true,createdAt:entry.createdAt||nowIso(),updatedAt:entry.updatedAt||entry.createdAt||nowIso()});}}
  migrated.treasuryReconciliations=Array.isArray((vault as any).treasuryReconciliations)?(vault as any).treasuryReconciliations.map((entry:any)=>({id:stringValue(entry?.id),workspaceId:stringValue(entry?.workspaceId,'default')||'default',branchId:stringValue(entry?.branchId,'main')||'main',movementKey:stringValue(entry?.movementKey),reconciledAt:stringValue(entry?.reconciledAt,nowIso()),note:stringValue(entry?.note),createdAt:stringValue(entry?.createdAt,nowIso()),updatedAt:stringValue(entry?.updatedAt,entry?.createdAt?stringValue(entry.createdAt):nowIso())})).filter((entry:any)=>entry.id&&entry.movementKey):[];
  migrated.fxRates=Array.isArray((vault as any).fxRates)?(vault as any).fxRates.map((rate:any)=>({id:stringValue(rate?.id),workspaceId:stringValue(rate?.workspaceId,'default')||'default',date:stringValue(rate?.date),fromCurrency:cleanCurrency(rate?.fromCurrency,'USD'),toCurrency:cleanCurrency(rate?.toCurrency,'EUR'),rate:stringValue(rate?.rate),sourceLabel:stringValue(rate?.sourceLabel),notes:stringValue(rate?.notes),createdAt:stringValue(rate?.createdAt,nowIso()),updatedAt:stringValue(rate?.updatedAt,rate?.createdAt?stringValue(rate.createdAt):nowIso())})).filter((rate:any)=>rate.id):[];
  migrated.warehouses=Array.isArray((vault as any).warehouses)?(vault as any).warehouses.map((warehouse:any)=>({id:stringValue(warehouse?.id),workspaceId:stringValue(warehouse?.workspaceId,'default')||'default',branchId:stringValue(warehouse?.branchId,'main')||'main',name:stringValue(warehouse?.name,'Warehouse'),code:stringValue(warehouse?.code,'WH').trim().toUpperCase()||'WH',active:booleanValue(warehouse?.active,true),createdAt:stringValue(warehouse?.createdAt,nowIso()),updatedAt:stringValue(warehouse?.updatedAt,warehouse?.createdAt?stringValue(warehouse.createdAt):nowIso())})).filter((warehouse:any)=>warehouse.id):[];

  migrated.teamMembers = Array.isArray((vault as any).teamMembers) ? (vault as any).teamMembers.map((member:any)=>({
    id:stringValue(member?.id),displayName:stringValue(member?.displayName),email:stringValue(member?.email),role:TEAM_ROLES.has(member?.role)?member.role:'viewer',status:TEAM_STATUSES.has(member?.status)?member.status:'active',createdAt:stringValue(member?.createdAt,nowIso()),updatedAt:stringValue(member?.updatedAt,member?.createdAt?stringValue(member.createdAt):nowIso())
  })).filter((member:any)=>member.id&&member.displayName) : [];
  if(!migrated.teamMembers.some(member=>member.id==='owner'))migrated.teamMembers.unshift(defaultOwnerMember());
  const rawPolicies=Array.isArray((vault as any).approvalPolicies)?(vault as any).approvalPolicies.map((policy:any)=>({id:stringValue(policy?.id),action:APPROVAL_ACTIONS.has(policy?.action)?policy.action:'issue-document',enabled:booleanValue(policy?.enabled,false),approverRoles:Array.isArray(policy?.approverRoles)?policy.approverRoles.filter((role:any)=>TEAM_ROLES.has(role)):[]})):[];
  migrated.approvalPolicies=normalizeApprovalPolicies(rawPolicies as any);
  migrated.approvalRequests=Array.isArray((vault as any).approvalRequests)?(vault as any).approvalRequests.map((request:any)=>({
    id:stringValue(request?.id),action:APPROVAL_ACTIONS.has(request?.action)?request.action:'issue-document',entityType:request?.entityType==='purchase'?'purchase':'document',entityId:stringValue(request?.entityId),entityLabel:stringValue(request?.entityLabel),entityUpdatedAt:stringValue(request?.entityUpdatedAt),requestedByMemberId:stringValue(request?.requestedByMemberId,'owner'),status:APPROVAL_STATUSES.has(request?.status)?request.status:'pending',decidedByMemberId:stringValue(request?.decidedByMemberId),decisionNote:stringValue(request?.decisionNote),createdAt:stringValue(request?.createdAt,nowIso()),decidedAt:stringValue(request?.decidedAt)
  })).filter((request:any)=>request.id&&request.entityId):[];
  if(!migrated.teamMembers.some(member=>member.id===migrated.appSettings.activeTeamMemberId&&member.status==='active'))migrated.appSettings.activeTeamMemberId=migrated.teamMembers.find(member=>member.role==='owner'&&member.status==='active')?.id??migrated.teamMembers.find(member=>member.status==='active')?.id??'owner';

  migrated.recurringWorkflows = Array.isArray((vault as any).recurringWorkflows) ? (vault as any).recurringWorkflows.map((workflow:any)=>{
    const target=RECURRING_TARGETS.has(workflow?.target)?workflow.target:'document';
    const cadence=RECURRING_CADENCES.has(workflow?.cadence)?workflow.cadence:'monthly';
    const documentTemplate=target==='document'&&workflow?.documentTemplate&&typeof workflow.documentTemplate==='object'?structuredClone(workflow.documentTemplate):null;
    const purchaseTemplate=target==='purchase'&&workflow?.purchaseTemplate&&typeof workflow.purchaseTemplate==='object'?structuredClone(workflow.purchaseTemplate):null;
    if(documentTemplate){documentTemplate.role='standard';documentTemplate.status='draft';documentTemplate.lifecycleStatus='active';documentTemplate.revision=1;documentTemplate.creditForId='';documentTemplate.creditForNumber='';documentTemplate.voidedAt='';documentTemplate.voidReason='';documentTemplate.convertedFromId='';documentTemplate.attachments=[];}
    if(purchaseTemplate){purchaseTemplate.status='draft';purchaseTemplate.postedAt='';purchaseTemplate.reversedAt='';purchaseTemplate.reverseReason='';}
    return{
      id:stringValue(workflow?.id),workspaceId:stringValue(workflow?.workspaceId,'default')||'default',branchId:stringValue(workflow?.branchId,'main')||'main',target,title:stringValue(workflow?.title),sourceId:stringValue(workflow?.sourceId),sourceNumber:stringValue(workflow?.sourceNumber),cadence,
      interval:Math.max(1,Math.min(52,Math.trunc(finiteNumber(workflow?.interval,1)))),nextRunDate:stringValue(workflow?.nextRunDate),endDate:stringValue(workflow?.endDate),enabled:booleanValue(workflow?.enabled,true),
      documentTemplate,purchaseTemplate,
      generatedRuns:Array.isArray(workflow?.generatedRuns)?workflow.generatedRuns.map((run:any)=>({id:stringValue(run?.id),scheduledFor:stringValue(run?.scheduledFor),generatedId:stringValue(run?.generatedId),generatedNumber:stringValue(run?.generatedNumber),createdAt:stringValue(run?.createdAt,nowIso())})).filter((run:any)=>run.id&&run.scheduledFor&&run.generatedId&&run.generatedNumber):[],
      createdAt:stringValue(workflow?.createdAt,nowIso()),updatedAt:stringValue(workflow?.updatedAt,workflow?.createdAt?stringValue(workflow.createdAt):nowIso())
    };
  }).filter((workflow:any)=>workflow.id&&workflow.nextRunDate&&(workflow.documentTemplate||workflow.purchaseTemplate)) : [];

  migrated.savedItems = Array.isArray((vault as any).savedItems) ? (vault as any).savedItems.map((item:any)=>({
    id:stringValue(item?.id), createdAt:stringValue(item?.createdAt,nowIso()), updatedAt:stringValue(item?.updatedAt,item?.createdAt ? stringValue(item.updatedAt) : nowIso()),
    sku:stringValue(item?.sku), descriptionEn:stringValue(item?.descriptionEn), descriptionAr:stringValue(item?.descriptionAr), hsCode:stringValue(item?.hsCode), origin:stringValue(item?.origin), packing:stringValue(item?.packing), unit:stringValue(item?.unit,'PCS'),
    lastUnitPrice:stringValue(item?.lastUnitPrice ?? item?.unitPrice), lastCurrency:cleanCurrency(item?.lastCurrency,migrated.appSettings.smartDefaults.currency || 'USD'),
    lastUnitCost:stringValue(item?.lastUnitCost), lastCostCurrency:stringValue(item?.lastCostCurrency).trim().toUpperCase(),
    usageCount:Math.max(0,Math.trunc(finiteNumber(item?.usageCount,0))), lastUsedAt:stringValue(item?.lastUsedAt,item?.updatedAt ? stringValue(item.updatedAt) : nowIso()),
    category:stringValue(item?.category), tags:Array.isArray(item?.tags)?Array.from(new Set(item.tags.map((tag:unknown)=>stringValue(tag).trim()).filter(Boolean))):[], favorite:booleanValue(item?.favorite,false)
  })) : [];

  migrated.payments = Array.isArray((vault as any).payments) ? (vault as any).payments.map((payment:any)=>({
    id:stringValue(payment?.id), invoiceId:stringValue(payment?.invoiceId), invoiceNumber:stringValue(payment?.invoiceNumber), customerId:stringValue(payment?.customerId),
    customerNameEn:stringValue(payment?.customerNameEn), customerNameAr:stringValue(payment?.customerNameAr), currency:cleanCurrency(payment?.currency,migrated.appSettings.smartDefaults.currency||'USD'),
    amount:stringValue(payment?.amount,'0.00'), date:stringValue(payment?.date), method:PAYMENT_METHODS.has(payment?.method)?payment.method:'other',
    reference:stringValue(payment?.reference), notes:stringValue(payment?.notes), createdAt:stringValue(payment?.createdAt,nowIso()), updatedAt:stringValue(payment?.updatedAt,payment?.createdAt?stringValue(payment.createdAt):nowIso())
  })) : [];

  const fallbackCompanySnapshot = companySnapshotFrom(defaults.company);
  migrated.documents = Array.isArray((vault as any).documents) ? (vault as any).documents.map((document:any) => {
    const companySnapshot = document?.companySnapshot ?? {};
    const companyBank = companySnapshot.bank ?? {};
    const appearance = document?.appearance ?? {};
    const terms = document?.terms ?? {};
    const adjustments = document?.adjustments ?? {};
    const internalCosts = document?.internalCosts ?? {};
    const customerSnapshot = document?.customerSnapshot && typeof document.customerSnapshot === 'object' ? document.customerSnapshot : null;
    const supplierSnapshot = document?.supplierSnapshot && typeof document.supplierSnapshot === 'object' ? document.supplierSnapshot : null;
    const attachments = Array.isArray(document?.attachments) ? document.attachments.filter((attachment:any)=>attachment&&typeof attachment==='object').slice(0,8).map((attachment:any)=>({
      id:stringValue(attachment?.id),name:stringValue(attachment?.name),mimeType:stringValue(attachment?.mimeType),size:Math.max(0,Math.trunc(finiteNumber(attachment?.size,0))),dataUrl:stringValue(attachment?.dataUrl),createdAt:stringValue(attachment?.createdAt,nowIso())
    })).filter((attachment:any)=>attachment.id&&attachment.name&&attachment.dataUrl) : [];
    const normalizedCompanySnapshot = {
      ...fallbackCompanySnapshot,
      ...companySnapshot,
      nameEn:stringValue(companySnapshot.nameEn,fallbackCompanySnapshot.nameEn), nameAr:stringValue(companySnapshot.nameAr,fallbackCompanySnapshot.nameAr), logoDataUrl:stringValue(companySnapshot.logoDataUrl,fallbackCompanySnapshot.logoDataUrl),
      addressEn:stringValue(companySnapshot.addressEn,fallbackCompanySnapshot.addressEn), addressAr:stringValue(companySnapshot.addressAr,fallbackCompanySnapshot.addressAr), city:stringValue(companySnapshot.city,fallbackCompanySnapshot.city), country:stringValue(companySnapshot.country,fallbackCompanySnapshot.country),
      phone:stringValue(companySnapshot.phone,fallbackCompanySnapshot.phone), email:stringValue(companySnapshot.email,fallbackCompanySnapshot.email), website:stringValue(companySnapshot.website,fallbackCompanySnapshot.website),
      vatNumber:stringValue(companySnapshot.vatNumber,fallbackCompanySnapshot.vatNumber), taxNumber:stringValue(companySnapshot.taxNumber,fallbackCompanySnapshot.taxNumber), commercialRegistration:stringValue(companySnapshot.commercialRegistration,fallbackCompanySnapshot.commercialRegistration),
      bank:{
        bankName:stringValue(companyBank.bankName,fallbackCompanySnapshot.bank.bankName), accountName:stringValue(companyBank.accountName,fallbackCompanySnapshot.bank.accountName), iban:stringValue(companyBank.iban,fallbackCompanySnapshot.bank.iban),
        swift:stringValue(companyBank.swift,fallbackCompanySnapshot.bank.swift), currency:cleanCurrency(companyBank.currency,fallbackCompanySnapshot.bank.currency)
      },
      signatureDataUrl:stringValue(companySnapshot.signatureDataUrl,fallbackCompanySnapshot.signatureDataUrl), stampDataUrl:stringValue(companySnapshot.stampDataUrl,fallbackCompanySnapshot.stampDataUrl), footerText:stringValue(companySnapshot.footerText,fallbackCompanySnapshot.footerText)
    };
    return {
      id:stringValue(document?.id), kind:documentKindValue(document?.kind), role:document?.role==='credit-note'?'credit-note':'standard', status:document?.status === 'final' ? 'final' : 'draft', lifecycleStatus:document?.lifecycleStatus==='voided'?'voided':'active', revision:Math.max(1,Math.trunc(finiteNumber(document?.revision,1))), creditForId:stringValue(document?.creditForId), creditForNumber:stringValue(document?.creditForNumber), voidedAt:stringValue(document?.voidedAt), voidReason:stringValue(document?.voidReason), bankAccountId:stringValue(document?.bankAccountId), paymentTermPresetId:stringValue(document?.paymentTermPresetId),
      number:stringValue(document?.number), issueDate:stringValue(document?.issueDate), dueDate:stringValue(document?.dueDate), currency:cleanCurrency(document?.currency,migrated.appSettings.smartDefaults.currency || migrated.company.defaultCurrency || 'USD'),
      language:languageValue(document?.language,migrated.appSettings.smartDefaults.language),
      customerSnapshot:customerSnapshot ? {
        sourceCustomerId:stringValue(customerSnapshot.sourceCustomerId), companyNameEn:stringValue(customerSnapshot.companyNameEn), companyNameAr:stringValue(customerSnapshot.companyNameAr), contactPerson:stringValue(customerSnapshot.contactPerson),
        addressEn:stringValue(customerSnapshot.addressEn), addressAr:stringValue(customerSnapshot.addressAr), city:stringValue(customerSnapshot.city), country:stringValue(customerSnapshot.country), phone:stringValue(customerSnapshot.phone), email:stringValue(customerSnapshot.email),
        vatTaxNumber:stringValue(customerSnapshot.vatTaxNumber), commercialRegistration:stringValue(customerSnapshot.commercialRegistration)
      } : null,
      supplierSnapshot:supplierSnapshot ? {
        sourceSupplierId:stringValue(supplierSnapshot.sourceSupplierId),nameEn:stringValue(supplierSnapshot.nameEn),nameAr:stringValue(supplierSnapshot.nameAr),contactPerson:stringValue(supplierSnapshot.contactPerson),address:stringValue(supplierSnapshot.address),city:stringValue(supplierSnapshot.city),country:stringValue(supplierSnapshot.country),phone:stringValue(supplierSnapshot.phone),email:stringValue(supplierSnapshot.email),vatTaxNumber:stringValue(supplierSnapshot.vatTaxNumber),commercialRegistration:stringValue(supplierSnapshot.commercialRegistration)
      } : null,
      supplierReference:stringValue(document?.supplierReference),attachments,
      companySnapshot:normalizedCompanySnapshot,
      items:Array.isArray(document?.items) ? document.items.map((item:any)=>({
        id:stringValue(item?.id), descriptionEn:stringValue(item?.descriptionEn), descriptionAr:stringValue(item?.descriptionAr), hsCode:stringValue(item?.hsCode), origin:stringValue(item?.origin), packing:stringValue(item?.packing),
        quantity:stringValue(item?.quantity,'1'), unit:stringValue(item?.unit,'Carton'), unitPrice:stringValue(item?.unitPrice), unitCost:stringValue(item?.unitCost)
      })) : [],
      terms:{
        incoterm:stringValue(terms.incoterm), paymentTerms:stringValue(terms.paymentTerms), packing:stringValue(terms.packing), deliveryTime:stringValue(terms.deliveryTime), portOfLoading:stringValue(terms.portOfLoading),
        finalDestination:stringValue(terms.finalDestination), countryOfOrigin:stringValue(terms.countryOfOrigin), validity:stringValue(terms.validity), remarks:stringValue(terms.remarks)
      },
      adjustments:{
        discountEnabled:booleanValue(adjustments.discountEnabled,false), discountMode:adjustments.discountMode === 'percent' ? 'percent' : 'fixed', discountValue:stringValue(adjustments.discountValue,'0.00'),
        shippingEnabled:booleanValue(adjustments.shippingEnabled,false), shipping:stringValue(adjustments.shipping,'0.00'), otherChargesEnabled:booleanValue(adjustments.otherChargesEnabled,false), otherCharges:stringValue(adjustments.otherCharges,'0.00'),
        taxEnabled:booleanValue(adjustments.taxEnabled,false), taxPercent:stringValue(adjustments.taxPercent,'0')
      },
      internalCosts:{shippingCost:stringValue(internalCosts.shippingCost,'0.00'),otherCost:stringValue(internalCosts.otherCost,'0.00')},
      appearance:{
        templateId:templateValue(appearance.templateId,'executive'), paletteMode:appearance.paletteMode === 'custom' ? 'custom' : 'auto', accentColor:hexColorValue(appearance.accentColor,'#b58b4f'),
        latinFont:typeof appearance.latinFont === 'string' && LATIN_FONTS.has(appearance.latinFont) ? appearance.latinFont : 'auto', arabicFont:typeof appearance.arabicFont === 'string' && ARABIC_FONTS.has(appearance.arabicFont) ? appearance.arabicFont : 'auto',
        primaryTextColor:hexColorValue(appearance.primaryTextColor), secondaryTextColor:hexColorValue(appearance.secondaryTextColor), headingTextColor:hexColorValue(appearance.headingTextColor),
        textScale:textScaleValue(appearance.textScale), documentTitleScale:textScaleValue(appearance.documentTitleScale), sectionHeadingScale:textScaleValue(appearance.sectionHeadingScale), bodyTextScale:textScaleValue(appearance.bodyTextScale), tableTextScale:textScaleValue(appearance.tableTextScale),
        showBank:booleanValue(appearance.showBank,true), showSignature:booleanValue(appearance.showSignature,Boolean(normalizedCompanySnapshot.signatureDataUrl)), showStamp:booleanValue(appearance.showStamp,Boolean(normalizedCompanySnapshot.stampDataUrl)),
        showHsCode:booleanValue(appearance.showHsCode,true), showOrigin:booleanValue(appearance.showOrigin,true), showPacking:booleanValue(appearance.showPacking,false), watermark:normalizeWatermark(appearance.watermark)
      },
      letter:document?.kind==='draft'?normalizeLetterData(document?.letter,languageValue(document?.language,migrated.appSettings.smartDefaults.language)):null,
      notes:stringValue(document?.notes), convertedFromId:stringValue(document?.convertedFromId), createdAt:stringValue(document?.createdAt,nowIso()), updatedAt:stringValue(document?.updatedAt,document?.createdAt ? stringValue(document.createdAt) : nowIso())
    };
  }) : [];

  migrated.documentEvents = Array.isArray((vault as any).documentEvents) ? (vault as any).documentEvents.map((event:any)=>({
    id:stringValue(event?.id),documentId:stringValue(event?.documentId),documentNumber:stringValue(event?.documentNumber),type:DOCUMENT_EVENT_TYPES.has(event?.type)?event.type:'created',at:stringValue(event?.at,nowIso()),note:stringValue(event?.note),relatedDocumentId:stringValue(event?.relatedDocumentId),relatedDocumentNumber:stringValue(event?.relatedDocumentNumber),amount:stringValue(event?.amount),currency:cleanCurrency(event?.currency,migrated.appSettings.smartDefaults.currency||'USD'),auditEntityType:['document','customer','supplier','product','purchase'].includes(String(event?.auditEntityType||''))?event.auditEntityType:undefined,auditEntityId:stringValue(event?.auditEntityId),auditEntityLabel:stringValue(event?.auditEntityLabel),auditAction:['created','updated','deleted','posted','reversed'].includes(String(event?.auditAction||''))?event.auditAction:undefined,auditActorKind:event?.auditActorKind==='system'?'system':event?.auditActorKind==='user'?'user':undefined,workspaceId:stringValue(event?.workspaceId,'default')||'default',branchId:stringValue(event?.branchId,'main')||'main'
  })) : [];
  migrated.documentRevisions = Array.isArray((vault as any).documentRevisions) ? (vault as any).documentRevisions.map((revision:any)=>{
    const snapshot=revision?.snapshot&&typeof revision.snapshot==='object'?structuredClone(revision.snapshot):null;if(!snapshot)return null;
    snapshot.kind=documentKindValue(snapshot.kind);snapshot.role=snapshot.role==='credit-note'?'credit-note':'standard';snapshot.lifecycleStatus=snapshot.lifecycleStatus==='voided'?'voided':'active';snapshot.revision=Math.max(1,Math.trunc(finiteNumber(snapshot.revision,1)));snapshot.creditForId=stringValue(snapshot.creditForId);snapshot.creditForNumber=stringValue(snapshot.creditForNumber);snapshot.voidedAt=stringValue(snapshot.voidedAt);snapshot.voidReason=stringValue(snapshot.voidReason);
    snapshot.items=Array.isArray(snapshot.items)?snapshot.items.map((item:any)=>({...item,unitCost:stringValue(item?.unitCost)})):[];
    snapshot.internalCosts={shippingCost:stringValue(snapshot.internalCosts?.shippingCost,'0.00'),otherCost:stringValue(snapshot.internalCosts?.otherCost,'0.00')};
    return{id:stringValue(revision?.id),documentId:stringValue(revision?.documentId),documentNumber:stringValue(revision?.documentNumber),revision:Math.max(1,Math.trunc(finiteNumber(revision?.revision,1))),snapshot,createdAt:stringValue(revision?.createdAt,nowIso())};
  }).filter(Boolean) as any : [];

  const rawScope=(key:string,branchScoped:boolean)=>{const source=Array.isArray((vault as any)[key])?(vault as any)[key]:[];return new Map(source.map((row:any)=>[stringValue(row?.id),{workspaceId:stringValue(row?.workspaceId,'default')||'default',branchId:branchScoped?(stringValue(row?.branchId,'main')||'main'):''}]));};
  const restoreScope=(key:keyof VaultPayload,branchScoped:boolean)=>{const map=rawScope(String(key),branchScoped),rows=(migrated as any)[key]??[];(migrated as any)[key]=rows.map((row:any)=>({...row,...(map.get(row.id)??{workspaceId:'default',branchId:branchScoped?'main':''})}));};
  (['customers','suppliers','savedItems','fxRates'] as const).forEach(key=>restoreScope(key,false));
  (['purchases','supplierPayments','expenses','inventoryMovements','treasuryAccounts','treasuryEntries','treasuryReconciliations','warehouses','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests'] as const).forEach(key=>restoreScope(key,true));

  const rawWorkspaces=Array.isArray((vault as any).workspaces)?(vault as any).workspaces:[];
  migrated.workspaces=rawWorkspaces.map((workspace:any,index:number)=>({
    id:stringValue(workspace?.id,index===0?'default':''),name:stringValue(workspace?.name,workspace?.company?.nameEn||workspace?.company?.nameAr||`Workspace ${index+1}`),
    company:{...defaults.company,...structuredClone(workspace?.company&&typeof workspace.company==='object'?workspace.company:{})},
    numbering:{...migrated.appSettings.numbering,...structuredClone(workspace?.numbering&&typeof workspace.numbering==='object'?workspace.numbering:{})},
    smartDefaults:{...migrated.appSettings.smartDefaults,...structuredClone(workspace?.smartDefaults&&typeof workspace.smartDefaults==='object'?workspace.smartDefaults:{})},
    createdAt:stringValue(workspace?.createdAt,nowIso()),updatedAt:stringValue(workspace?.updatedAt,workspace?.createdAt?stringValue(workspace.createdAt):nowIso())
  })).filter((workspace:any)=>workspace.id&&workspace.name);
  if(!migrated.workspaces.length)migrated.workspaces=[{id:'default',name:migrated.company.nameEn||migrated.company.nameAr||'LOUREX',company:structuredClone(migrated.company),numbering:structuredClone(migrated.appSettings.numbering),smartDefaults:structuredClone(migrated.appSettings.smartDefaults),createdAt:nowIso(),updatedAt:nowIso()}];
  const rawBranches=Array.isArray((vault as any).branches)?(vault as any).branches:[];
  migrated.branches=rawBranches.map((branch:any,index:number)=>({id:stringValue(branch?.id,index===0?'main':''),workspaceId:stringValue(branch?.workspaceId,'default')||'default',name:stringValue(branch?.name,'Main Branch'),code:stringValue(branch?.code,'MAIN').trim().toUpperCase()||'MAIN',city:stringValue(branch?.city),country:stringValue(branch?.country),active:booleanValue(branch?.active,true),createdAt:stringValue(branch?.createdAt,nowIso()),updatedAt:stringValue(branch?.updatedAt,branch?.createdAt?stringValue(branch.createdAt):nowIso())})).filter((branch:any)=>branch.id&&branch.workspaceId);
  for(const workspace of migrated.workspaces)if(!migrated.branches.some(branch=>branch.workspaceId===workspace.id&&branch.active))migrated.branches.push({id:workspace.id==='default'?'main':`branch-${workspace.id}`,workspaceId:workspace.id,name:'Main Branch',code:'MAIN',city:workspace.company.city,country:workspace.company.country,active:true,createdAt:nowIso(),updatedAt:nowIso()});
  for(const branch of migrated.branches){
    if(!migrated.warehouses.some(warehouse=>warehouse.workspaceId===branch.workspaceId&&warehouse.branchId===branch.id))migrated.warehouses.push({id:`warehouse-${branch.id}`,workspaceId:branch.workspaceId,branchId:branch.id,name:branch.name||'Primary Location',code:(branch.code||'MAIN').toUpperCase(),active:true,createdAt:branch.createdAt||nowIso(),updatedAt:branch.updatedAt||nowIso()});
  }
  migrated.inventoryMovements=migrated.inventoryMovements.map(movement=>{
    const branchId=movement.branchId||'main',fallback=`warehouse-${branchId}`;
    if(movement.type==='transfer')return movement;
    const negative=String(movement.quantity||'').trim().startsWith('-');
    return {...movement,fromWarehouseId:movement.fromWarehouseId||(negative?fallback:''),toWarehouseId:movement.toWarehouseId||(!negative?fallback:'')};
  });
  if(!migrated.workspaces.some(workspace=>workspace.id===migrated.appSettings.activeWorkspaceId))migrated.appSettings.activeWorkspaceId=migrated.workspaces.find(workspace=>workspace.id==='default')?.id??migrated.workspaces[0]!.id;
  const activeWorkspace=migrated.workspaces.find(workspace=>workspace.id===migrated.appSettings.activeWorkspaceId)!;
  if(!migrated.branches.some(branch=>branch.workspaceId===activeWorkspace.id&&branch.id===migrated.appSettings.activeBranchId&&branch.active))migrated.appSettings.activeBranchId=migrated.branches.find(branch=>branch.workspaceId===activeWorkspace.id&&branch.active)!.id;
  migrated.company=structuredClone(activeWorkspace.company);
  migrated.appSettings.numbering=structuredClone(activeWorkspace.numbering);
  migrated.appSettings.smartDefaults=structuredClone(activeWorkspace.smartDefaults);

  const unique = (values: string[], label: string): void => {
    const seen = new Set<string>();
    for (const id of values) {
      if (!id || seen.has(id)) throw new Error(`Local data contains duplicate or invalid ${label} IDs.`);
      seen.add(id);
    }
  };
  unique(migrated.customers.map(c => c.id), 'customer');
  unique(migrated.suppliers.map(s => s.id), 'supplier');
  unique(migrated.purchases.map(p => p.id), 'purchase');
  unique(migrated.supplierPayments.map(p => p.id), 'supplier payment');
  unique(migrated.expenses.map(e => e.id), 'expense');
  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');
  unique(migrated.treasuryAccounts.map(m => m.id), 'treasury account');
  unique(migrated.treasuryEntries.map(m => m.id), 'treasury entry');
  unique(migrated.treasuryReconciliations.map(m => m.id), 'treasury reconciliation');
  unique(migrated.fxRates.map(m => m.id), 'FX rate');
  unique(migrated.warehouses.map(m => m.id), 'warehouse');
  unique(migrated.workspaces.map(w => w.id), 'workspace');
  unique(migrated.branches.map(b => b.id), 'branch');
  unique(migrated.teamMembers.map(m => m.id), 'team member');
  unique(migrated.approvalPolicies.map(p => p.id), 'approval policy');
  unique(migrated.approvalRequests.map(r => r.id), 'approval request');
  unique(migrated.recurringWorkflows.map(r => r.id), 'recurring workflow');
  for(const workflow of migrated.recurringWorkflows)unique(workflow.generatedRuns.map(run=>run.id),'recurring run');
  unique(migrated.documents.map(d => d.id), 'document');
  unique(migrated.documentEvents.map(e => e.id), 'document event');
  unique(migrated.documentRevisions.map(r => r.id), 'document revision');
  unique(migrated.payments.map(p => p.id), 'payment');
  unique(migrated.savedItems.map(i=>i.id),'saved item');
  for (const document of migrated.documents) unique(document.items.map(i => i.id), 'item');
  return migrated;
}

export async function unlockVault(pin: string): Promise<{ key: CryptoKey; vault: VaultPayload; security: SecurityMetadata }> {
  const security = await getSecurity();
  const encrypted = await getEncryptedVault();
  if (!security || !encrypted) throw new Error('LOUREX Invoice has not been set up on this device.');
  const key = await verifyPin(pin, security);
  const rawVault = await decryptVault(key, encrypted);
  const sourceVersion=Number(rawVault.schemaVersion ?? 0);
  if(sourceVersion!==APP_SCHEMA_VERSION)await createSafetySnapshot('pre-migration',sourceVersion);
  const vault = migrateVault(rawVault);
  if (sourceVersion !== APP_SCHEMA_VERSION) await saveVault(key, vault);
  return { key, vault, security };
}

export async function resumeVaultSession(): Promise<{ key: CryptoKey; vault: VaultPayload } | null> {
  const session = await getSessionKey();
  if (!session) return null;
  const encrypted = await getEncryptedVault();
  if (!encrypted) { await clearSession(); return null; }
  try {
    const rawVault = await decryptVault(session.key, encrypted);
    const sourceVersion=Number(rawVault.schemaVersion ?? 0);
    if(sourceVersion!==APP_SCHEMA_VERSION)await createSafetySnapshot('pre-migration',sourceVersion);
    const vault = migrateVault(rawVault);
    if (isSessionExpired(session.lastActivity, vault.appSettings.autoLockMinutes)) {
      await clearSession();
      return null;
    }
    if (sourceVersion !== APP_SCHEMA_VERSION) await saveVault(session.key, vault);
    touchSession();
    return { key: session.key, vault };
  } catch {
    await clearSession();
    return null;
  }
}

export async function saveVault(key: CryptoKey, vault: VaultPayload): Promise<EncryptedVaultRecord> {
  try {
    const encrypted=await encryptVault(key, { ...vault, schemaVersion: APP_SCHEMA_VERSION });
    await putRecord(encrypted);
    return encrypted;
  }
  catch (error) {
    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'UnknownError')) throw new Error('Local storage is full. Export a backup and free device storage.');
    throw error;
  }
}

export async function restoreVaultWithCurrentKey(key: CryptoKey, vault: VaultPayload): Promise<VaultPayload> {
  await createSafetySnapshot('pre-restore');
  const migrated = migrateVault(vault);
  await saveVault(key, migrated);
  return migrated;
}

export async function changePin(currentPin: string, newPin: string): Promise<{ key: CryptoKey; security: SecurityMetadata; recoveryCode?:string }> {
  const unlocked = await unlockVault(currentPin);
  await createSafetySnapshot('pre-pin-change',unlocked.vault.schemaVersion);
  const currentSecurity=await getSecurity();
  if(!currentSecurity)throw new Error('Security settings are missing.');
  const {metadata,key,recoveryCode}=await createSecurityForChangedPin(currentPin,newPin,currentSecurity);
  const encrypted = await encryptVault(key, unlocked.vault);
  await putSecurityAndVault(metadata, encrypted);
  return { key, security: metadata,recoveryCode };
}

export async function recoverPinWithRecoveryKey(code:string,newPin:string):Promise<{key:CryptoKey;security:SecurityMetadata;vault:VaultPayload}>{
  const [security,encrypted]=await Promise.all([getSecurity(),getEncryptedVault()]);
  if(!security||!encrypted)throw new Error('LOUREX encrypted data is not available on this device.');
  const recovered=await recoverVaultKey(code,security);
  const vault=migrateVault(await decryptVault(recovered.key,encrypted));
  await createSafetySnapshot('pre-pin-change',vault.schemaVersion);
  const next=await createSecurityFromRecovery(newPin,recovered.masterBytes,code,security);
  const nextVault=await encryptVault(next.key,vault);
  await putSecurityAndVault(next.metadata,nextVault);
  return{key:next.key,security:next.metadata,vault};
}

export async function renewPinRecoveryKey(pin:string):Promise<{key:CryptoKey;security:SecurityMetadata;vault:VaultPayload;recoveryCode:string}>{
  const [unlocked,security]=await Promise.all([unlockVault(pin),getSecurity()]);
  if(!security)throw new Error('Security settings are missing.');
  const unwrapped=await createSecurityForChangedPin(pin,pin,security);
  const recoveryCode=createRecoveryCode();
  const next=await createSecurityFromRecovery(pin,unwrapped.masterBytes,recoveryCode,security);
  const encrypted=await encryptVault(next.key,unlocked.vault);
  await putSecurityAndVault(next.metadata,encrypted);
  return{key:next.key,security:next.metadata,vault:unlocked.vault,recoveryCode};
}

export async function replaceVaultWithPin(pin: string, vault: VaultPayload): Promise<{ key: CryptoKey; security: SecurityMetadata; vault: VaultPayload }> {
  await createSafetySnapshot('pre-restore');
  const migrated = migrateVault(vault);
  const { metadata, key } = await createSecurity(pin);
  const encrypted = await encryptVault(key, migrated);
  await putSecurityAndVault(metadata, encrypted);
  return { key, security: metadata, vault: migrated };
}

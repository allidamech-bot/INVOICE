import type { SecurityMetadata, VaultPayload } from '../types.js';
import { APP_SCHEMA_VERSION, companySnapshotFrom, emptyVault } from '../lib/defaults.js';
import { normalizeValidityDays } from '../lib/id.js';
import { createSecurity, decryptVault, encryptVault, verifyPin } from '../crypto/crypto.js';
import { createSafetySnapshot, getEncryptedVault, getSecurity, putRecord, putSecurityAndVault } from './db.js';
import { clearSession, getSessionKey, isSessionExpired, touchSession } from './session.js';

const TEMPLATE_IDS = new Set(['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon']);
const LATIN_FONTS = new Set(['auto','inter','source-sans','montserrat','playfair']);
const ARABIC_FONTS = new Set(['auto','cairo','tajawal','noto-kufi','noto-naskh']);
const AUTO_LOCK_VALUES = new Set([0,5,15,30]);
const PAYMENT_METHODS = new Set(['cash','bank-transfer','card','cheque','other']);
const DOCUMENT_EVENT_TYPES = new Set(['created','issued','reissued','revision-started','revision-discarded','voided','credit-note-created','payment-recorded','payment-deleted','converted']);

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
function nowIso(): string { return new Date().toISOString(); }

export async function setupVault(pin: string, initial: VaultPayload = emptyVault()): Promise<{ key: CryptoKey; vault: VaultPayload }> {
  const { metadata, key } = await createSecurity(pin);
  const encrypted = await encryptVault(key, initial);
  await putSecurityAndVault(metadata, encrypted);
  return { key, vault: initial };
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
    signatureDataUrl:stringValue(sourceCompany.signatureDataUrl), stampDataUrl:stringValue(sourceCompany.stampDataUrl),
    defaultCurrency:cleanCurrency(sourceCompany.defaultCurrency,defaults.company.defaultCurrency), defaultLanguage:languageValue(sourceCompany.defaultLanguage,defaults.company.defaultLanguage),
    defaultPaymentTerms:stringValue(sourceCompany.defaultPaymentTerms), defaultIncoterm:stringValue(sourceCompany.defaultIncoterm), defaultDeliveryTime:stringValue(sourceCompany.defaultDeliveryTime),
    defaultValidityDays:normalizeValidityDays(finiteNumber(sourceCompany.defaultValidityDays,defaults.company.defaultValidityDays)), defaultFooterText:stringValue(sourceCompany.defaultFooterText), defaultNotes:stringValue(sourceCompany.defaultNotes)
  };

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
    numbering: {
      proformaPrefix:cleanPrefix(sourceNumbering.proformaPrefix,defaults.appSettings.numbering.proformaPrefix), invoicePrefix:cleanPrefix(sourceNumbering.invoicePrefix,defaults.appSettings.numbering.invoicePrefix), creditNotePrefix:cleanPrefix(sourceNumbering.creditNotePrefix,defaults.appSettings.numbering.creditNotePrefix),
      proformaLast:Math.max(0,Math.trunc(finiteNumber(sourceNumbering.proformaLast,defaults.appSettings.numbering.proformaLast))), invoiceLast:Math.max(0,Math.trunc(finiteNumber(sourceNumbering.invoiceLast,defaults.appSettings.numbering.invoiceLast))), creditNoteLast:Math.max(0,Math.trunc(finiteNumber(sourceNumbering.creditNoteLast,defaults.appSettings.numbering.creditNoteLast))),
      proformaYear:Math.trunc(finiteNumber(sourceNumbering.proformaYear,defaults.appSettings.numbering.proformaYear)), invoiceYear:Math.trunc(finiteNumber(sourceNumbering.invoiceYear,defaults.appSettings.numbering.invoiceYear)), creditNoteYear:Math.trunc(finiteNumber(sourceNumbering.creditNoteYear,defaults.appSettings.numbering.creditNoteYear))
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

  migrated.customers = Array.isArray((vault as any).customers) ? (vault as any).customers.map((customer:any) => ({
    id:stringValue(customer?.id), createdAt:stringValue(customer?.createdAt,nowIso()), updatedAt:stringValue(customer?.updatedAt,customer?.createdAt ? stringValue(customer.createdAt) : nowIso()),
    companyNameEn:stringValue(customer?.companyNameEn), companyNameAr:stringValue(customer?.companyNameAr), contactPerson:stringValue(customer?.contactPerson),
    addressEn:stringValue(customer?.addressEn), addressAr:stringValue(customer?.addressAr), city:stringValue(customer?.city), country:stringValue(customer?.country), phone:stringValue(customer?.phone), email:stringValue(customer?.email),
    vatTaxNumber:stringValue(customer?.vatTaxNumber), commercialRegistration:stringValue(customer?.commercialRegistration), notes:stringValue(customer?.notes)
  })) : [];

  migrated.savedItems = Array.isArray((vault as any).savedItems) ? (vault as any).savedItems.map((item:any)=>({
    id:stringValue(item?.id), createdAt:stringValue(item?.createdAt,nowIso()), updatedAt:stringValue(item?.updatedAt,item?.createdAt ? stringValue(item.updatedAt) : nowIso()),
    sku:stringValue(item?.sku), descriptionEn:stringValue(item?.descriptionEn), descriptionAr:stringValue(item?.descriptionAr), hsCode:stringValue(item?.hsCode), origin:stringValue(item?.origin), packing:stringValue(item?.packing), unit:stringValue(item?.unit,'PCS'),
    lastUnitPrice:stringValue(item?.lastUnitPrice ?? item?.unitPrice), lastCurrency:cleanCurrency(item?.lastCurrency,migrated.appSettings.smartDefaults.currency || 'USD'),
    usageCount:Math.max(0,Math.trunc(finiteNumber(item?.usageCount,0))), lastUsedAt:stringValue(item?.lastUsedAt,item?.updatedAt ? stringValue(item.updatedAt) : nowIso()),
    category:stringValue(item?.category), tags:Array.isArray(item?.tags)?Array.from(new Set(item.tags.map((tag:unknown)=>stringValue(tag).trim()).filter(Boolean))):[], favorite:booleanValue(item?.favorite,false)
  })) : [];

  migrated.payments = Array.isArray((vault as any).payments) ? (vault as any).payments.map((payment:any)=>({
    id:stringValue(payment?.id), invoiceId:stringValue(payment?.invoiceId), invoiceNumber:stringValue(payment?.invoiceNumber), customerId:stringValue(payment?.customerId),
    customerNameEn:stringValue(payment?.customerNameEn), customerNameAr:stringValue(payment?.customerNameAr), currency:cleanCurrency(payment?.currency,migrated.appSettings.smartDefaults.currency||'USD'),
    amount:stringValue(payment?.amount,'0.00'), date:stringValue(payment?.date), method:PAYMENT_METHODS.has(payment?.method)?payment.method:'other',
    reference:stringValue(payment?.reference), notes:stringValue(payment?.notes), createdAt:stringValue(payment?.createdAt,nowIso()), updatedAt:stringValue(payment?.updatedAt,payment?.createdAt?stringValue(payment.createdAt):nowIso())
  })) : [];

  // Historical document snapshots must never inherit today's company details.
  // Missing legacy fields are filled only with safe blank/default snapshot values.
  const fallbackCompanySnapshot = companySnapshotFrom(defaults.company);
  migrated.documents = Array.isArray((vault as any).documents) ? (vault as any).documents.map((document:any) => {
    const companySnapshot = document?.companySnapshot ?? {};
    const companyBank = companySnapshot.bank ?? {};
    const appearance = document?.appearance ?? {};
    const terms = document?.terms ?? {};
    const adjustments = document?.adjustments ?? {};
    const customerSnapshot = document?.customerSnapshot && typeof document.customerSnapshot === 'object' ? document.customerSnapshot : null;
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
      id:stringValue(document?.id), kind:document?.kind === 'invoice' ? 'invoice' : 'proforma', role:document?.role==='credit-note'?'credit-note':'standard', status:document?.status === 'final' ? 'final' : 'draft', lifecycleStatus:document?.lifecycleStatus==='voided'?'voided':'active', revision:Math.max(1,Math.trunc(finiteNumber(document?.revision,1))), creditForId:stringValue(document?.creditForId), creditForNumber:stringValue(document?.creditForNumber), voidedAt:stringValue(document?.voidedAt), voidReason:stringValue(document?.voidReason),
      number:stringValue(document?.number), issueDate:stringValue(document?.issueDate), dueDate:stringValue(document?.dueDate), currency:cleanCurrency(document?.currency,migrated.appSettings.smartDefaults.currency || migrated.company.defaultCurrency || 'USD'),
      language:languageValue(document?.language,migrated.appSettings.smartDefaults.language),
      customerSnapshot:customerSnapshot ? {
        sourceCustomerId:stringValue(customerSnapshot.sourceCustomerId), companyNameEn:stringValue(customerSnapshot.companyNameEn), companyNameAr:stringValue(customerSnapshot.companyNameAr), contactPerson:stringValue(customerSnapshot.contactPerson),
        addressEn:stringValue(customerSnapshot.addressEn), addressAr:stringValue(customerSnapshot.addressAr), city:stringValue(customerSnapshot.city), country:stringValue(customerSnapshot.country), phone:stringValue(customerSnapshot.phone), email:stringValue(customerSnapshot.email),
        vatTaxNumber:stringValue(customerSnapshot.vatTaxNumber), commercialRegistration:stringValue(customerSnapshot.commercialRegistration)
      } : null,
      companySnapshot:normalizedCompanySnapshot,
      items:Array.isArray(document?.items) ? document.items.map((item:any)=>({
        id:stringValue(item?.id), descriptionEn:stringValue(item?.descriptionEn), descriptionAr:stringValue(item?.descriptionAr), hsCode:stringValue(item?.hsCode), origin:stringValue(item?.origin), packing:stringValue(item?.packing),
        quantity:stringValue(item?.quantity,'1'), unit:stringValue(item?.unit,'Carton'), unitPrice:stringValue(item?.unitPrice)
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
      appearance:{
        templateId:templateValue(appearance.templateId,'executive'), paletteMode:appearance.paletteMode === 'custom' ? 'custom' : 'auto', accentColor:stringValue(appearance.accentColor,'#b58b4f'),
        latinFont:typeof appearance.latinFont === 'string' && LATIN_FONTS.has(appearance.latinFont) ? appearance.latinFont : 'auto', arabicFont:typeof appearance.arabicFont === 'string' && ARABIC_FONTS.has(appearance.arabicFont) ? appearance.arabicFont : 'auto',
        showBank:booleanValue(appearance.showBank,true), showSignature:booleanValue(appearance.showSignature,Boolean(normalizedCompanySnapshot.signatureDataUrl)), showStamp:booleanValue(appearance.showStamp,Boolean(normalizedCompanySnapshot.stampDataUrl)),
        showHsCode:booleanValue(appearance.showHsCode,true), showOrigin:booleanValue(appearance.showOrigin,true), showPacking:booleanValue(appearance.showPacking,false)
      },
      notes:stringValue(document?.notes), convertedFromId:stringValue(document?.convertedFromId), createdAt:stringValue(document?.createdAt,nowIso()), updatedAt:stringValue(document?.updatedAt,document?.createdAt ? stringValue(document.createdAt) : nowIso())
    };
  }) : [];

  migrated.documentEvents = Array.isArray((vault as any).documentEvents) ? (vault as any).documentEvents.map((event:any)=>({
    id:stringValue(event?.id),documentId:stringValue(event?.documentId),documentNumber:stringValue(event?.documentNumber),type:DOCUMENT_EVENT_TYPES.has(event?.type)?event.type:'created',at:stringValue(event?.at,nowIso()),note:stringValue(event?.note),relatedDocumentId:stringValue(event?.relatedDocumentId),relatedDocumentNumber:stringValue(event?.relatedDocumentNumber),amount:stringValue(event?.amount),currency:cleanCurrency(event?.currency,migrated.appSettings.smartDefaults.currency||'USD')
  })) : [];
  migrated.documentRevisions = Array.isArray((vault as any).documentRevisions) ? (vault as any).documentRevisions.map((revision:any)=>{
    const snapshot=revision?.snapshot&&typeof revision.snapshot==='object'?structuredClone(revision.snapshot):null;if(!snapshot)return null;
    snapshot.role=snapshot.role==='credit-note'?'credit-note':'standard';snapshot.lifecycleStatus=snapshot.lifecycleStatus==='voided'?'voided':'active';snapshot.revision=Math.max(1,Math.trunc(finiteNumber(snapshot.revision,1)));snapshot.creditForId=stringValue(snapshot.creditForId);snapshot.creditForNumber=stringValue(snapshot.creditForNumber);snapshot.voidedAt=stringValue(snapshot.voidedAt);snapshot.voidReason=stringValue(snapshot.voidReason);
    return{id:stringValue(revision?.id),documentId:stringValue(revision?.documentId),documentNumber:stringValue(revision?.documentNumber),revision:Math.max(1,Math.trunc(finiteNumber(revision?.revision,1))),snapshot,createdAt:stringValue(revision?.createdAt,nowIso())};
  }).filter(Boolean) as any : [];

  const unique = (values: string[], label: string): void => {
    const seen = new Set<string>();
    for (const id of values) {
      if (!id || seen.has(id)) throw new Error(`Local data contains duplicate or invalid ${label} IDs.`);
      seen.add(id);
    }
  };
  unique(migrated.customers.map(c => c.id), 'customer');
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

export async function saveVault(key: CryptoKey, vault: VaultPayload): Promise<void> {
  try { await putRecord(await encryptVault(key, { ...vault, schemaVersion: APP_SCHEMA_VERSION })); }
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

export async function changePin(currentPin: string, newPin: string): Promise<{ key: CryptoKey; security: SecurityMetadata }> {
  const unlocked = await unlockVault(currentPin);
  await createSafetySnapshot('pre-pin-change',unlocked.vault.schemaVersion);
  const { metadata, key } = await createSecurity(newPin);
  const encrypted = await encryptVault(key, unlocked.vault);
  await putSecurityAndVault(metadata, encrypted);
  return { key, security: metadata };
}

export async function replaceVaultWithPin(pin: string, vault: VaultPayload): Promise<{ key: CryptoKey; security: SecurityMetadata; vault: VaultPayload }> {
  await createSafetySnapshot('pre-restore');
  const migrated = migrateVault(vault);
  const { metadata, key } = await createSecurity(pin);
  const encrypted = await encryptVault(key, migrated);
  await putSecurityAndVault(metadata, encrypted);
  return { key, security: metadata, vault: migrated };
}
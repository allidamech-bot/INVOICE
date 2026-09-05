import type { AppSettings, CompanySettings, Customer, LourexDocument, SavedItem, VaultPayload } from '../types.js';
import { findSavedItemDuplicate, normalizeSavedItemIdentity } from '../lib/saved-items.js';
import { t } from '../lib/i18n.js';

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length===b.length && a.every((value,index)=>value===b[index]);
}

function mergeRecords<T extends { id:string }>(base:T[], intended:T[], latest:T[]):T[]{
  if(intended===base)return latest;
  const baseById=new Map(base.map(item=>[item.id,item]));
  const intendedById=new Map(intended.map(item=>[item.id,item]));
  const removed=new Set(base.filter(item=>!intendedById.has(item.id)).map(item=>item.id));
  const result=latest.filter(item=>!removed.has(item.id));
  const indexById=new Map(result.map((item,index)=>[item.id,index]));
  for(const item of intended){
    const before=baseById.get(item.id);
    if(before&&before===item)continue;
    const index=indexById.get(item.id);
    if(index===undefined){indexById.set(item.id,result.length);result.push(item);}
    else result[index]=item;
  }
  return result;
}

function documentRevision(document:LourexDocument):number{return Math.max(1,Math.trunc(document.revision||1));}
function documentChangedSinceBase(base:LourexDocument,latest:LourexDocument):boolean{
  return base.updatedAt!==latest.updatedAt||base.status!==latest.status||base.lifecycleStatus!==latest.lifecycleStatus||documentRevision(base)!==documentRevision(latest);
}
function preserveConcurrentDocument(base:LourexDocument,intended:LourexDocument,latest:LourexDocument):boolean{
  if(!documentChangedSinceBase(base,latest))return false;
  if(latest.lifecycleStatus==='voided'&&intended.lifecycleStatus!=='voided')return true;
  if(latest.status==='final'&&intended.status==='draft')return true;
  if(documentRevision(latest)>documentRevision(intended))return true;
  return false;
}
function mergeDocuments(base:LourexDocument[],intended:LourexDocument[],latest:LourexDocument[]):LourexDocument[]{
  if(intended===base)return latest;
  const baseById=new Map(base.map(item=>[item.id,item]));
  const intendedById=new Map(intended.map(item=>[item.id,item]));
  const result:LourexDocument[]=[];
  const seen=new Set<string>();
  for(const latestItem of latest){
    const before=baseById.get(latestItem.id);
    const wanted=intendedById.get(latestItem.id);
    if(!wanted){
      if(!before||documentChangedSinceBase(before,latestItem))result.push(latestItem);
      seen.add(latestItem.id);
      continue;
    }
    if(before&&before===wanted){result.push(latestItem);seen.add(latestItem.id);continue;}
    result.push(before&&preserveConcurrentDocument(before,wanted,latestItem)?latestItem:wanted);
    seen.add(latestItem.id);
  }
  for(const item of intended)if(!seen.has(item.id))result.push(item);
  return result;
}

function customerIdentity(value:string):string{return normalizeSavedItemIdentity(value);}
function customerNames(customer:Customer):string[]{return [customer.companyNameEn,customer.companyNameAr].map(customerIdentity).filter(Boolean);}
function guardCustomerIdentityChanges(base:Customer[],intended:Customer[],merged:Customer[]):void{
  if(intended===base)return;
  const baseById=new Map(base.map(customer=>[customer.id,customer]));
  for(const customer of intended){
    const before=baseById.get(customer.id);
    const namesChanged=!before||customerIdentity(before.companyNameEn)!==customerIdentity(customer.companyNameEn)||customerIdentity(before.companyNameAr)!==customerIdentity(customer.companyNameAr);
    if(!namesChanged)continue;
    const names=customerNames(customer);
    if(!names.length)throw new Error(t('Company name is required.','اسم الشركة مطلوب.'));
    const duplicate=merged.find(existing=>existing.id!==customer.id&&customerNames(existing).some(name=>names.includes(name)));
    if(duplicate)throw new Error(t('This customer already exists. Open the existing customer to edit it.','هذا العميل موجود بالفعل. افتح العميل الموجود لتعديله.'));
  }
}

function savedItemIdentityChanged(before:SavedItem|undefined,item:SavedItem):boolean{
  return !before||normalizeSavedItemIdentity(before.descriptionEn)!==normalizeSavedItemIdentity(item.descriptionEn)||normalizeSavedItemIdentity(before.descriptionAr)!==normalizeSavedItemIdentity(item.descriptionAr)||(before.sku??'').normalize('NFKC').trim().replace(/\s+/g,'').toLocaleUpperCase()!==(item.sku??'').normalize('NFKC').trim().replace(/\s+/g,'').toLocaleUpperCase();
}
function guardSavedItemIdentityChanges(base:SavedItem[],intended:SavedItem[],merged:SavedItem[]):void{
  if(intended===base)return;
  const baseById=new Map(base.map(item=>[item.id,item]));
  for(const item of intended){
    if(!savedItemIdentityChanged(baseById.get(item.id),item))continue;
    if(!item.descriptionEn.trim()&&!item.descriptionAr.trim())throw new Error(t('Enter an English or Arabic description.','أدخل وصفًا بالإنجليزية أو العربية.'));
    if(findSavedItemDuplicate(merged,item))throw new Error(t('This item already exists or uses a duplicate SKU. Open the existing item to edit it.','هذا الصنف موجود بالفعل أو يستخدم SKU مكررًا. افتح الصنف الموجود لتعديله.'));
  }
}

function mergeCompany(base:CompanySettings,intended:CompanySettings,latest:CompanySettings):CompanySettings{
  if(intended===base)return latest;
  const next:CompanySettings={...latest,bank:{...latest.bank},bankAccounts:latest.bankAccounts.map(account=>({...account})),commercial:{...latest.commercial,taxPresets:latest.commercial.taxPresets.map(item=>({...item})),paymentTermPresets:latest.commercial.paymentTermPresets.map(item=>({...item})),pricing:{...latest.commercial.pricing}}};
  const keys:Array<Exclude<keyof CompanySettings,'bank'|'bankAccounts'|'commercial'>>=[
    'nameEn','nameAr','logoDataUrl','addressEn','addressAr','city','country','phone','email','website','vatNumber','taxNumber','commercialRegistration','defaultBankAccountId',
    'signatureDataUrl','stampDataUrl','defaultCurrency','defaultLanguage','defaultPaymentTerms','defaultIncoterm','defaultDeliveryTime','defaultValidityDays','defaultFooterText','defaultNotes'
  ];
  for(const key of keys)if(intended[key]!==base[key])(next as any)[key]=intended[key];
  const bankKeys:Array<keyof CompanySettings['bank']>=['bankName','accountName','iban','swift','currency'];
  for(const key of bankKeys)if(intended.bank[key]!==base.bank[key])next.bank[key]=intended.bank[key];
  if(JSON.stringify(intended.bankAccounts)!==JSON.stringify(base.bankAccounts))next.bankAccounts=intended.bankAccounts.map(account=>({...account}));
  if(JSON.stringify(intended.commercial)!==JSON.stringify(base.commercial))next.commercial={...intended.commercial,taxPresets:intended.commercial.taxPresets.map(item=>({...item})),paymentTermPresets:intended.commercial.paymentTermPresets.map(item=>({...item})),pricing:{...intended.commercial.pricing}};
  return next;
}

function mergeAppSettings(base:AppSettings,intended:AppSettings,latest:AppSettings):AppSettings{
  if(intended===base)return latest;
  const next:AppSettings={...latest,numbering:{...latest.numbering},smartDefaults:{...latest.smartDefaults,favoriteTemplateIds:[...latest.smartDefaults.favoriteTemplateIds]}};
  if(intended.autoLockMinutes!==base.autoLockMinutes)next.autoLockMinutes=intended.autoLockMinutes;
  if(intended.uiLanguage!==base.uiLanguage)next.uiLanguage=intended.uiLanguage;
  const numberingKeys:Array<keyof AppSettings['numbering']>=['proformaPrefix','invoicePrefix','creditNotePrefix','proformaLast','invoiceLast','creditNoteLast','proformaYear','invoiceYear','creditNoteYear'];
  for(const key of numberingKeys)if(intended.numbering[key]!==base.numbering[key])(next.numbering as any)[key]=intended.numbering[key];
  const smartKeys:Array<Exclude<keyof AppSettings['smartDefaults'],'favoriteTemplateIds'>>=['currency','language','incoterm','paymentTerms','deliveryTime','quoteTemplateId','invoiceTemplateId'];
  for(const key of smartKeys)if(intended.smartDefaults[key]!==base.smartDefaults[key])(next.smartDefaults as any)[key]=intended.smartDefaults[key];
  if(!sameArray(intended.smartDefaults.favoriteTemplateIds,base.smartDefaults.favoriteTemplateIds))next.smartDefaults.favoriteTemplateIds=[...intended.smartDefaults.favoriteTemplateIds];
  return next;
}

export function mergeVaultIntent(base:VaultPayload,intended:VaultPayload,latest:VaultPayload):VaultPayload{
  const customers=mergeRecords(base.customers,intended.customers,latest.customers);
  const savedItems=mergeRecords(base.savedItems,intended.savedItems,latest.savedItems);
  guardCustomerIdentityChanges(base.customers,intended.customers,customers);
  guardSavedItemIdentityChanges(base.savedItems,intended.savedItems,savedItems);
  return {
    ...latest,
    schemaVersion:Math.max(latest.schemaVersion,intended.schemaVersion),
    company:mergeCompany(base.company,intended.company,latest.company),
    customers,
    suppliers:mergeRecords(base.suppliers,intended.suppliers,latest.suppliers),
    purchases:mergeRecords(base.purchases,intended.purchases,latest.purchases),
    expenses:mergeRecords(base.expenses,intended.expenses,latest.expenses),
    inventoryMovements:mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements),
    documents:mergeDocuments(base.documents,intended.documents,latest.documents),
    documentEvents:mergeRecords(base.documentEvents,intended.documentEvents,latest.documentEvents),
    documentRevisions:mergeRecords(base.documentRevisions,intended.documentRevisions,latest.documentRevisions),
    payments:mergeRecords(base.payments,intended.payments,latest.payments),
    savedItems,
    appSettings:mergeAppSettings(base.appSettings,intended.appSettings,latest.appSettings)
  };
}
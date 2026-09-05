import type { AppSettings, CompanySettings, Customer, LourexDocument, SavedItem, VaultPayload } from '../types.js';
import { findSavedItemDuplicate, normalizeSavedItemIdentity } from '../lib/saved-items.js';
import { decimalToScaled, isDecimalInput } from '../lib/money.js';
import { assertDocumentLifecycleInvariant } from '../lib/document-lifecycle.js';
import { assertInvoicePaymentInvariant } from '../lib/payments.js';
import { t } from '../lib/i18n.js';
import { guardOperationsMerge } from './operations-merge-guard.js';

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

function financialInvoiceIds(base:VaultPayload,intended:VaultPayload):Set<string>{
  const ids=new Set<string>();
  if(intended.payments!==base.payments){
    const baseById=new Map(base.payments.map(payment=>[payment.id,payment]));
    const intendedById=new Map(intended.payments.map(payment=>[payment.id,payment]));
    for(const payment of intended.payments){
      const before=baseById.get(payment.id);
      if(before===payment)continue;
      if(payment.invoiceId)ids.add(payment.invoiceId);
      if(before?.invoiceId&&before.invoiceId!==payment.invoiceId)ids.add(before.invoiceId);
    }
    for(const payment of base.payments)if(!intendedById.has(payment.id)&&payment.invoiceId)ids.add(payment.invoiceId);
  }
  if(intended.documents!==base.documents){
    const baseById=new Map(base.documents.map(document=>[document.id,document]));
    const intendedById=new Map(intended.documents.map(document=>[document.id,document]));
    for(const document of intended.documents){
      const before=baseById.get(document.id);
      if(before===document)continue;
      for(const candidate of [before,document]){
        if(!candidate)continue;
        if(candidate.role==='credit-note'){
          if(candidate.creditForId)ids.add(candidate.creditForId);
        }else if(candidate.kind==='invoice')ids.add(candidate.id);
      }
    }
    for(const document of base.documents){
      if(intendedById.has(document.id))continue;
      if(document.role==='credit-note'){
        if(document.creditForId)ids.add(document.creditForId);
      }else if(document.kind==='invoice')ids.add(document.id);
    }
  }
  return ids;
}
function guardFinancialSettlementChanges(base:VaultPayload,intended:VaultPayload,documents:LourexDocument[],payments:VaultPayload['payments']):void{
  const affected=financialInvoiceIds(base,intended);
  if(!affected.size)return;
  for(const invoiceId of affected){
    const invoice=documents.find(document=>document.id===invoiceId&&document.kind==='invoice'&&document.role!=='credit-note');
    const linkedPayments=payments.filter(payment=>payment.invoiceId===invoiceId);
    const linkedCredits=documents.filter(document=>document.role==='credit-note'&&document.creditForId===invoiceId&&document.status==='final'&&document.lifecycleStatus!=='voided');
    if(!invoice){
      if(linkedPayments.length||linkedCredits.length)throw new Error('Financial activity cannot remain linked to a missing source invoice.');
      continue;
    }
    if((linkedPayments.length||linkedCredits.length)&&(invoice.status!=='final'||invoice.lifecycleStatus==='voided'))throw new Error('An invoice with payments or issued credit notes must remain an active final invoice.');
    assertInvoicePaymentInvariant(invoice,payments,documents);
    assertDocumentLifecycleInvariant(invoice,documents,payments);
    for(const credit of linkedCredits)assertDocumentLifecycleInvariant(credit,documents,payments);
  }
}

function text(value:unknown):string{return typeof value==='string'?value:'';}
function customerIdentity(value:string):string{return normalizeSavedItemIdentity(value);}
function customerNames(customer:Customer):string[]{return [text(customer.companyNameEn),text(customer.companyNameAr)].map(customerIdentity).filter(Boolean);}
function customerFieldChanged(before:Customer|undefined,customer:Customer,key:keyof Customer):boolean{return !before||text(before[key])!==text(customer[key]);}
function guardCustomerChanges(base:Customer[],intended:Customer[],merged:Customer[]):void{
  if(intended===base)return;
  const baseById=new Map(base.map(customer=>[customer.id,customer]));
  for(const customer of intended){
    const before=baseById.get(customer.id);
    const namesChanged=!before||customerIdentity(text(before.companyNameEn))!==customerIdentity(text(customer.companyNameEn))||customerIdentity(text(before.companyNameAr))!==customerIdentity(text(customer.companyNameAr));
    if(namesChanged){
      const names=customerNames(customer);
      if(!names.length)throw new Error(t('Company name is required.','اسم الشركة مطلوب.'));
      const duplicate=merged.find(existing=>existing.id!==customer.id&&customerNames(existing).some(name=>names.includes(name)));
      if(duplicate)throw new Error(t('This customer already exists. Open the existing customer to edit it.','هذا العميل موجود بالفعل. افتح العميل الموجود لتعديله.'));
    }
    if(customerFieldChanged(before,customer,'email')){
      const email=text(customer.email).trim();
      if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error(t('Enter a valid email address or leave it empty.','أدخل بريدًا إلكترونيًا صحيحًا أو اترك الحقل فارغًا.'));
    }
    const commercialChanged=!before||(['creditLimit','creditCurrency','paymentDueDays'] as Array<keyof Customer>).some(key=>customerFieldChanged(before,customer,key));
    if(commercialChanged){
      const creditLimit=text(customer.creditLimit).trim();
      const creditCurrency=text(customer.creditCurrency).trim();
      const dueDays=text(customer.paymentDueDays).trim();
      if(creditLimit&&(!isDecimalInput(creditLimit)||decimalToScaled(creditLimit,2)<0n))throw new Error(t('Credit limit must be zero or greater.','يجب أن يكون حد الائتمان صفرًا أو أكثر.'));
      if(creditLimit&&!creditCurrency)throw new Error(t('Choose a currency for the credit limit.','اختر عملة لحد الائتمان.'));
      if(dueDays&&!/^\d+$/.test(dueDays))throw new Error(t('Payment due days must be a whole number.','يجب أن تكون أيام الاستحقاق رقمًا صحيحًا.'));
      if(/^\d+$/.test(dueDays)&&Number(dueDays)>3650)throw new Error(t('Payment due days cannot exceed 3650.','لا يمكن أن تتجاوز أيام الاستحقاق 3650 يومًا.'));
    }
  }
}

function savedItemSku(value:unknown):string{return text(value).normalize('NFKC').trim().replace(/\s+/g,'').toLocaleUpperCase();}
function savedItemIdentityChanged(before:SavedItem|undefined,item:SavedItem):boolean{
  return !before||normalizeSavedItemIdentity(text(before.descriptionEn))!==normalizeSavedItemIdentity(text(item.descriptionEn))||normalizeSavedItemIdentity(text(before.descriptionAr))!==normalizeSavedItemIdentity(text(item.descriptionAr))||savedItemSku(before.sku)!==savedItemSku(item.sku);
}
function guardSavedItemChanges(base:SavedItem[],intended:SavedItem[],merged:SavedItem[]):void{
  if(intended===base)return;
  const baseById=new Map(base.map(item=>[item.id,item]));
  for(const item of intended){
    const before=baseById.get(item.id);
    const identityChanged=savedItemIdentityChanged(before,item);
    const commercialChanged=!before||identityChanged||text(before.unit)!==text(item.unit)||text(before.lastUnitPrice)!==text(item.lastUnitPrice);
    if(commercialChanged){
      if(!text(item.descriptionEn).trim()&&!text(item.descriptionAr).trim())throw new Error(t('Enter an English or Arabic description.','أدخل وصفًا بالإنجليزية أو العربية.'));
      if(!text(item.unit).trim())throw new Error(t('Unit is required.','الوحدة مطلوبة.'));
      const price=text(item.lastUnitPrice).trim();
      if(price&&(!isDecimalInput(price)||decimalToScaled(price)<0n))throw new Error(t('Enter a valid non-negative price.','أدخل سعرًا صالحًا يساوي صفرًا أو أكثر.'));
    }
    if(identityChanged&&findSavedItemDuplicate(merged,item))throw new Error(t('This item already exists or uses a duplicate SKU. Open the existing item to edit it.','هذا الصنف موجود بالفعل أو يستخدم SKU مكررًا. افتح الصنف الموجود لتعديله.'));
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
  const suppliers=mergeRecords(base.suppliers,intended.suppliers,latest.suppliers);
  const purchases=mergeRecords(base.purchases,intended.purchases,latest.purchases);
  const expenses=mergeRecords(base.expenses,intended.expenses,latest.expenses);
  const inventoryMovements=mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);
  const documents=mergeDocuments(base.documents,intended.documents,latest.documents);
  const payments=mergeRecords(base.payments,intended.payments,latest.payments);
  guardCustomerChanges(base.customers,intended.customers,customers);
  guardSavedItemChanges(base.savedItems,intended.savedItems,savedItems);
  guardFinancialSettlementChanges(base,intended,documents,payments);
  guardOperationsMerge(base,intended,latest,{suppliers,purchases,expenses,inventoryMovements,savedItems});
  return {
    ...latest,
    schemaVersion:Math.max(latest.schemaVersion,intended.schemaVersion),
    company:mergeCompany(base.company,intended.company,latest.company),
    customers,
    suppliers,
    purchases,
    expenses,
    inventoryMovements,
    documents,
    documentEvents:mergeRecords(base.documentEvents,intended.documentEvents,latest.documentEvents),
    documentRevisions:mergeRecords(base.documentRevisions,intended.documentRevisions,latest.documentRevisions),
    payments,
    savedItems,
    appSettings:mergeAppSettings(base.appSettings,intended.appSettings,latest.appSettings)
  };
}
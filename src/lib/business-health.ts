import type { Customer, SavedItem, Supplier, VaultPayload } from '../types.js';

export type BusinessHealthSeverity='warning'|'review';
export type BusinessHealthArea='company'|'customers'|'suppliers'|'products'|'purchasing';
export type BusinessHealthTarget='settings'|'customers'|'operations'|'items';

export interface BusinessHealthIssue{
  id:string;
  area:BusinessHealthArea;
  severity:BusinessHealthSeverity;
  count:number;
  target:BusinessHealthTarget;
  labelEn:string;
  labelAr:string;
  detailEn:string;
  detailAr:string;
}

export interface BusinessHealthSnapshot{
  status:'ready'|'needs-attention';
  issueCount:number;
  warningCount:number;
  reviewCount:number;
  issues:BusinessHealthIssue[];
}

function text(value:unknown):string{return String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();}
function key(value:unknown):string{return text(value).toLocaleLowerCase('en-US').replace(/[\s\-_.()+]/g,'');}
function emailKey(value:unknown):string{return text(value).toLocaleLowerCase('en-US');}
function hasName(record:{nameEn?:string;nameAr?:string;companyNameEn?:string;companyNameAr?:string}):boolean{
  return Boolean(text(record.nameEn)||text(record.nameAr)||text(record.companyNameEn)||text(record.companyNameAr));
}
function productLabel(item:SavedItem):string{return text(item.sku)||text(item.descriptionEn)||text(item.descriptionAr)||item.id;}
function isActiveItem(item:SavedItem):boolean{return !item.archived;}

function duplicateGroupCount(values:string[]):number{
  const counts=new Map<string,number>();
  for(const raw of values){const value=raw.trim();if(!value)continue;counts.set(value,(counts.get(value)??0)+1);}
  let groups=0;
  for(const count of counts.values())if(count>1)groups+=1;
  return groups;
}

function customerDuplicateGroups(customers:Customer[]):number{
  const byVat=duplicateGroupCount(customers.map(row=>key(row.vatTaxNumber)));
  const byCr=duplicateGroupCount(customers.map(row=>key(row.commercialRegistration)));
  const byEmail=duplicateGroupCount(customers.map(row=>emailKey(row.email)));
  const byPhone=duplicateGroupCount(customers.map(row=>key(row.phone)));
  const byName=duplicateGroupCount(customers.map(row=>key(row.companyNameEn)||key(row.companyNameAr)));
  return byVat+byCr+byEmail+byPhone+byName;
}

function supplierDuplicateGroups(suppliers:Supplier[]):number{
  const byVat=duplicateGroupCount(suppliers.map(row=>key(row.vatTaxNumber)));
  const byCr=duplicateGroupCount(suppliers.map(row=>key(row.commercialRegistration)));
  const byEmail=duplicateGroupCount(suppliers.map(row=>emailKey(row.email)));
  const byPhone=duplicateGroupCount(suppliers.map(row=>key(row.phone)));
  const byName=duplicateGroupCount(suppliers.map(row=>key(row.nameEn)||key(row.nameAr)));
  return byVat+byCr+byEmail+byPhone+byName;
}

function productDuplicateGroups(items:SavedItem[]):number{
  const active=items.filter(isActiveItem);
  const bySku=duplicateGroupCount(active.map(row=>key(row.sku)));
  const byDescription=duplicateGroupCount(active.map(row=>key(row.descriptionEn)||key(row.descriptionAr)));
  return bySku+byDescription;
}

function issue(
  id:string,
  area:BusinessHealthArea,
  severity:BusinessHealthSeverity,
  count:number,
  target:BusinessHealthTarget,
  labelEn:string,
  labelAr:string,
  detailEn:string,
  detailAr:string
):BusinessHealthIssue|null{
  return count>0?{id,area,severity,count,target,labelEn,labelAr,detailEn,detailAr}:null;
}

export function buildBusinessHealth(vault:VaultPayload):BusinessHealthSnapshot{
  const issues:Array<BusinessHealthIssue|null>=[];
  const company=vault.company;

  issues.push(issue(
    'company-identity','company','warning',hasName({nameEn:company.nameEn,nameAr:company.nameAr})?0:1,'settings',
    'Company identity needs attention','هوية الشركة تحتاج مراجعة',
    'Add at least one company legal/display name before issuing business documents.','أضف اسمًا واحدًا على الأقل للشركة قبل إصدار مستندات الأعمال.'
  ));
  issues.push(issue(
    'company-default-currency','company','warning',text(company.defaultCurrency)?0:1,'settings',
    'Default currency is missing','العملة الافتراضية غير محددة',
    'Choose a default currency. LOUREX will not invent or convert a currency automatically.','اختر العملة الافتراضية. لن يخترع LOUREX عملة أو يحول العملات تلقائيًا.'
  ));
  const bankReady=Boolean(text(company.bank?.bankName)||text(company.bank?.iban)||company.bankAccounts.some(account=>text(account.bankName)||text(account.iban)));
  issues.push(issue(
    'company-bank-readiness','company','review',bankReady?0:1,'settings',
    'Bank details have not been configured','بيانات البنك غير مهيأة',
    'Review bank details if you plan to show payment instructions on documents.','راجع بيانات البنك إذا كنت ستعرض تعليمات الدفع على المستندات.'
  ));
  const taxIdentityReady=Boolean(text(company.vatNumber)||text(company.taxNumber)||text(company.commercialRegistration));
  issues.push(issue(
    'company-tax-identity','company','review',taxIdentityReady?0:1,'settings',
    'Tax / registration identity not recorded','بيانات الضريبة أو التسجيل غير مسجلة',
    'Review VAT, tax or commercial-registration identifiers if they apply to your business and jurisdiction.','راجع رقم VAT أو الضريبة أو السجل التجاري إذا كانت تنطبق على نشاطك واختصاصك.'
  ));

  const customersMissingName=vault.customers.filter(row=>!hasName(row)).length;
  const customersMissingContact=vault.customers.filter(row=>!text(row.email)&&!text(row.phone)&&!text(row.contactPerson)).length;
  const customersMissingCurrency=vault.customers.filter(row=>!text(row.preferredCurrency)).length;
  issues.push(issue('customers-missing-name','customers','warning',customersMissingName,'customers','Customers without a name','عملاء بدون اسم','Every customer record needs an identifiable company/person name.','يجب أن يحتوي كل سجل عميل على اسم شركة أو شخص يمكن التعرف عليه.'));
  issues.push(issue('customers-missing-contact','customers','review',customersMissingContact,'customers','Customers without contact details','عملاء بدون بيانات تواصل','Add email, phone or a contact person where available.','أضف البريد أو الهاتف أو جهة الاتصال عندما تكون متوفرة.'));
  issues.push(issue('customers-missing-currency','customers','review',customersMissingCurrency,'customers','Customers without preferred currency','عملاء بدون عملة مفضلة','Review preferred currency where customer-specific currency behavior is needed.','راجع العملة المفضلة عندما تحتاج سلوك عملة خاصًا بالعميل.'));
  issues.push(issue('customers-duplicates','customers','review',customerDuplicateGroups(vault.customers),'customers','Possible duplicate customer groups','مجموعات عملاء محتملة التكرار','Matched by repeated VAT/CR/email/phone/name. Review before merging or deleting anything.','تم التطابق عبر VAT أو السجل أو البريد أو الهاتف أو الاسم المتكرر. راجع قبل دمج أو حذف أي شيء.'));

  const suppliersMissingName=vault.suppliers.filter(row=>!hasName(row)).length;
  const suppliersMissingContact=vault.suppliers.filter(row=>!text(row.email)&&!text(row.phone)&&!text(row.contactPerson)).length;
  const suppliersMissingCurrency=vault.suppliers.filter(row=>!text(row.defaultCurrency)).length;
  issues.push(issue('suppliers-missing-name','suppliers','warning',suppliersMissingName,'operations','Suppliers without a name','موردون بدون اسم','Every supplier record needs an identifiable name.','يجب أن يحتوي كل سجل مورد على اسم يمكن التعرف عليه.'));
  issues.push(issue('suppliers-missing-contact','suppliers','review',suppliersMissingContact,'operations','Suppliers without contact details','موردون بدون بيانات تواصل','Add email, phone or a contact person where available.','أضف البريد أو الهاتف أو جهة الاتصال عندما تكون متوفرة.'));
  issues.push(issue('suppliers-missing-currency','suppliers','review',suppliersMissingCurrency,'operations','Suppliers without default currency','موردون بدون عملة افتراضية','Review supplier currency before using supplier-specific purchase defaults.','راجع عملة المورد قبل استخدام افتراضات شراء خاصة بالمورد.'));
  issues.push(issue('suppliers-duplicates','suppliers','review',supplierDuplicateGroups(vault.suppliers),'operations','Possible duplicate supplier groups','مجموعات موردين محتملة التكرار','Matched by repeated VAT/CR/email/phone/name. Review before changing records.','تم التطابق عبر VAT أو السجل أو البريد أو الهاتف أو الاسم المتكرر. راجع قبل تغيير السجلات.'));

  const activeItems=vault.savedItems.filter(isActiveItem);
  const productsMissingDescription=activeItems.filter(row=>!text(row.descriptionEn)&&!text(row.descriptionAr)).length;
  const productsMissingUnit=activeItems.filter(row=>!text(row.unit)).length;
  const productsMissingCost=activeItems.filter(row=>!text(row.lastUnitCost)||!text(row.lastCostCurrency)).length;
  const productsMissingSku=activeItems.filter(row=>!text(row.sku)).length;
  issues.push(issue('products-missing-description','products','warning',productsMissingDescription,'items','Products without description','أصناف بدون وصف','Add an English or Arabic description so products remain identifiable across documents.','أضف وصفًا عربيًا أو إنجليزيًا حتى يبقى الصنف قابلًا للتعريف عبر المستندات.'));
  issues.push(issue('products-missing-unit','products','warning',productsMissingUnit,'items','Products without unit','أصناف بدون وحدة','Review the unit instead of assuming PCS or another unit.','راجع الوحدة بدل افتراض PCS أو أي وحدة أخرى.'));
  issues.push(issue('products-missing-cost','products','warning',productsMissingCost,'items','Products with incomplete cost data','أصناف ببيانات تكلفة ناقصة','Cost and cost currency are required for reliable profitability. No cost is estimated.','التكلفة وعملتها ضروريتان لربحية موثوقة. لن يتم تقدير تكلفة مفقودة.'));
  issues.push(issue('products-missing-sku','products','review',productsMissingSku,'items','Products without SKU','أصناف بدون SKU','Add SKU where your catalog workflow uses product codes.','أضف SKU عندما يعتمد كتالوجك على رموز الأصناف.'));
  issues.push(issue('products-duplicates','products','review',productDuplicateGroups(activeItems),'items','Possible duplicate product groups','مجموعات أصناف محتملة التكرار','Matched by repeated SKU or normalized description. Review before archiving or merging.','تم التطابق عبر SKU أو وصف موحد متكرر. راجع قبل الأرشفة أو الدمج.'));

  const postedPurchasesMissingSupplier=vault.purchases.filter(row=>row.status==='posted'&&!row.supplierSnapshot).length;
  const postedPurchasesMissingCurrency=vault.purchases.filter(row=>row.status==='posted'&&!text(row.currency)).length;
  issues.push(issue('purchases-missing-supplier','purchasing','warning',postedPurchasesMissingSupplier,'operations','Posted purchases without supplier','مشتريات مرحلة بدون مورد','Review posted purchase records that do not identify their supplier.','راجع سجلات المشتريات المرحلة التي لا تحدد المورد.'));
  issues.push(issue('purchases-missing-currency','purchasing','warning',postedPurchasesMissingCurrency,'operations','Posted purchases without currency','مشتريات مرحلة بدون عملة','Every posted purchase needs its original transaction currency. LOUREX does not infer FX.','يجب أن تحتوي كل عملية شراء مرحلة على عملتها الأصلية. لا يستنتج LOUREX سعر صرف.'));

  const finalIssues=issues.filter((row):row is BusinessHealthIssue=>Boolean(row));
  const warningCount=finalIssues.filter(row=>row.severity==='warning').reduce((sum,row)=>sum+row.count,0);
  const reviewCount=finalIssues.filter(row=>row.severity==='review').reduce((sum,row)=>sum+row.count,0);
  return{
    status:finalIssues.length?'needs-attention':'ready',
    issueCount:warningCount+reviewCount,
    warningCount,
    reviewCount,
    issues:finalIssues
  };
}

export function describeBusinessHealthIssue(issue:BusinessHealthIssue,language:'en'|'ar'):{label:string;detail:string}{
  return language==='ar'?{label:issue.labelAr,detail:issue.detailAr}:{label:issue.labelEn,detail:issue.detailEn};
}

export function businessHealthDebugLabel(item:SavedItem):string{return productLabel(item);}

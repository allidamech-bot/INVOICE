import type { VaultPayload } from '../types.js';

export type SetupReadinessStatus='complete'|'attention'|'review';
export type SetupReadinessTarget='settings'|'items'|'data';

export interface SetupReadinessCheck{
  id:string;
  status:SetupReadinessStatus;
  target:SetupReadinessTarget;
  labelEn:string;
  labelAr:string;
  detailEn:string;
  detailAr:string;
}

export interface SetupReadinessSnapshot{
  basis:'deterministic-derived-read-only';
  checks:SetupReadinessCheck[];
  complete:number;
  attention:number;
  review:number;
}

function text(value:unknown):string{return String(value??'').normalize('NFKC').trim();}
function check(id:string,status:SetupReadinessStatus,target:SetupReadinessTarget,labelEn:string,labelAr:string,detailEn:string,detailAr:string):SetupReadinessCheck{return{id,status,target,labelEn,labelAr,detailEn,detailAr};}

export function buildSetupReadiness(vault:VaultPayload):SetupReadinessSnapshot{
  const company=vault.company;
  const numbering=vault.appSettings.numbering;
  const identityReady=Boolean(text(company.nameEn)||text(company.nameAr))&&Boolean(text(company.country))&&Boolean(text(company.defaultCurrency));
  const legalReady=Boolean(text(company.vatNumber)||text(company.taxNumber)||text(company.commercialRegistration));
  const legacyBankReady=Boolean(text(company.bank.bankName)&&text(company.bank.accountName)&&(text(company.bank.iban)||text(company.bank.swift)));
  const accountBankReady=company.bankAccounts.some(account=>Boolean(text(account.bankName)&&text(account.accountName)&&(text(account.iban)||text(account.swift))));
  const numberingReady=Boolean(text(numbering.proformaPrefix)&&text(numbering.invoicePrefix)&&text(numbering.creditNotePrefix));
  const commercialReady=Boolean(text(company.defaultCurrency)&&text(company.defaultPaymentTerms)&&text(company.defaultIncoterm));
  const activeProducts=vault.savedItems.filter(item=>!item.archived);
  const productCostReady=activeProducts.length===0||activeProducts.every(item=>Boolean(text(item.lastUnitCost)&&text(item.lastCostCurrency)));
  const checks:SetupReadinessCheck[]=[
    check('company-identity',identityReady?'complete':'attention','settings','Company identity','هوية الشركة',identityReady?'Company name, country and default currency are configured.':'Add a company name, country and default currency before relying on document defaults.','اسم الشركة والدولة والعملة الافتراضية مضبوطة.','أضف اسم الشركة والدولة والعملة الافتراضية قبل الاعتماد على افتراضات المستندات.'),
    check('legal-tax-identity',legalReady?'complete':'review','settings','Legal & tax identity','الهوية القانونية والضريبية',legalReady?'At least one tax or commercial-registration identifier is recorded.':'No VAT, tax or commercial-registration identifier is recorded. This may be valid for some businesses; review what applies to your jurisdiction.','يوجد معرّف ضريبي أو سجل تجاري واحد على الأقل.','لا يوجد VAT أو رقم ضريبي أو سجل تجاري. قد يكون ذلك صحيحًا لبعض الأنشطة؛ راجع ما ينطبق على اختصاصك.'),
    check('bank-identity',(legacyBankReady||accountBankReady)?'complete':'review','settings','Bank identity','بيانات البنك',(legacyBankReady||accountBankReady)?'A complete bank identity is available for document workflows.':'No complete bank identity is configured. Add one only when documents or collections need payment instructions.','توجد بيانات بنك مكتملة لمسارات المستندات.','لا توجد بيانات بنك مكتملة. أضفها فقط عندما تحتاج المستندات أو التحصيل إلى تعليمات دفع.'),
    check('document-numbering',numberingReady?'complete':'attention','settings','Document numbering','ترقيم المستندات',numberingReady?'Core quotation, invoice and credit-note prefixes are configured.':'One or more core document prefixes are empty.','بادئات عرض السعر والفاتورة والإشعار الدائن الأساسية مضبوطة.','إحدى بادئات المستندات الأساسية أو أكثر فارغة.'),
    check('commercial-defaults',commercialReady?'complete':'review','settings','Commercial defaults','الافتراضات التجارية',commercialReady?'Currency, payment terms and Incoterm defaults are configured.':'Some commercial defaults are empty. They are optional, but completing them reduces repetitive document entry.','العملة وشروط الدفع وIncoterm الافتراضية مضبوطة.','بعض الافتراضات التجارية فارغة. هي اختيارية، لكن إكمالها يقلل الإدخال المتكرر.'),
    check('automatic-lock',vault.appSettings.autoLockMinutes>0?'complete':'review','settings','Automatic lock','القفل التلقائي',vault.appSettings.autoLockMinutes>0?`Automatic lock is set to ${vault.appSettings.autoLockMinutes} minutes.`:'Automatic lock is disabled. Review this choice on shared or mobile devices.',vault.appSettings.autoLockMinutes>0?`القفل التلقائي مضبوط على ${vault.appSettings.autoLockMinutes} دقيقة.`:'القفل التلقائي معطل. راجع هذا الخيار خصوصًا على الأجهزة المشتركة أو المحمولة.'),
    check('product-cost-readiness',productCostReady?'complete':'attention','items','Product cost readiness','جاهزية تكاليف المنتجات',productCostReady?'Active products contain cost and cost-currency metadata.':'Some active products are missing cost or cost currency, so profitability can remain incomplete.','المنتجات النشطة تحتوي على التكلفة وعملتها.','بعض المنتجات النشطة ينقصها التكلفة أو عملة التكلفة، لذلك قد تبقى الربحية غير مكتملة.'),
    check('backup-cloud-runtime','review','data','Backup & cloud sync','النسخ الاحتياطي والمزامنة','Backup recency and live cloud connectivity are not inferred from the encrypted business payload. Review the Data/Cloud controls directly.','لا يتم استنتاج حداثة النسخة الاحتياطية أو اتصال السحابة الحي من بيانات الأعمال المشفرة. راجع عناصر البيانات/السحابة مباشرة.'),
    check('auth-recovery-runtime','review','settings','Account & recovery health','سلامة الحساب والاسترداد','Authentication-provider reachability is a live runtime concern and is not guessed from stored business records. Review Account/Security when needed.','توفر مزود تسجيل الدخول مسألة تشغيل حي ولا يتم تخمينها من سجلات الأعمال. راجع الحساب/الأمان عند الحاجة.')
  ];
  return{
    basis:'deterministic-derived-read-only',
    checks,
    complete:checks.filter(row=>row.status==='complete').length,
    attention:checks.filter(row=>row.status==='attention').length,
    review:checks.filter(row=>row.status==='review').length
  };
}

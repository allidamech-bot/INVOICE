from pathlib import Path


def replace(path, old, new, label):
    p = Path(path)
    s = p.read_text()
    if new in s:
        return
    if old not in s:
        raise SystemExit(f"{path}: missing {label}")
    p.write_text(s.replace(old, new))


replace(
    "src/types.ts",
    "export type DocumentKind = 'draft' | 'rfq' | 'proforma' | 'proforma-invoice' | 'purchase-order' | 'invoice' | 'delivery-note' | 'payment-receipt' | 'statement-account';",
    "export type DocumentKind = 'draft' | 'rfq' | 'proforma' | 'proforma-invoice' | 'purchase-order' | 'invoice' | 'delivery-note' | 'payment-receipt';",
    "DocumentKind statement cleanup",
)

replace(
    "src/lib/document-kinds.ts",
    "  kind: DocumentKind | 'credit-note';",
    "  kind: DocumentKind | 'credit-note' | 'statement-account';",
    "catalog special kinds",
)
replace(
    "src/lib/document-kinds.ts",
    "export function documentBankAllowed(kind:DocumentKind):boolean{return businessDocumentDefinition(kind).bankAllowed;}",
    "export function documentBankAllowed(kind:DocumentKind,role:DocumentRole='standard'):boolean{return businessDocumentDefinition(kind,role).bankAllowed;}",
    "role-aware bank policy",
)

replace(
    "src/storage/vault.ts",
    "const DOCUMENT_KINDS = new Set<DocumentKind>(['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt','statement-account']);",
    "const DOCUMENT_KINDS = new Set<DocumentKind>(['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt']);",
    "vault document kinds",
)

replace(
    "src/lib/documents.ts",
    "  const auxiliaryKind=kind==='rfq'||kind==='proforma-invoice'||kind==='delivery-note'||kind==='payment-receipt'||kind==='statement-account';",
    "  const auxiliaryKind=kind==='rfq'||kind==='proforma-invoice'||kind==='delivery-note'||kind==='payment-receipt';",
    "auxiliary kinds",
)
replace(
    "src/lib/documents.ts",
    "    dueDate: (kind === 'proforma' || kind === 'proforma-invoice') ? addDaysIso(issueDate, validityDays) : kind === 'purchase-order' || kind === 'draft' || kind === 'rfq' || kind === 'delivery-note' || kind === 'payment-receipt' || kind === 'statement-account' ? '' : paymentPreset ? addDaysIso(issueDate,paymentPreset.days) : '',",
    "    dueDate: (kind === 'proforma' || kind === 'proforma-invoice') ? addDaysIso(issueDate, validityDays) : kind === 'purchase-order' || kind === 'draft' || kind === 'rfq' || kind === 'delivery-note' || kind === 'payment-receipt' ? '' : paymentPreset ? addDaysIso(issueDate,paymentPreset.days) : '',",
    "blank document due-date kinds",
)
replace(
    "src/lib/documents.ts",
    "    appearance: { templateId: 'executive', paletteMode: 'auto', accentColor: kind==='draft'?'#8e7cf3':kind==='rfq'?'#2563eb':kind==='purchase-order'?'#c88f37':kind==='delivery-note'?'#7c8b95':kind==='payment-receipt'?'#0f9f7f':kind==='statement-account'?'#6d5bd0':'#159fa7', latinFont: 'auto', arabicFont: 'auto', showBank: documentBankAllowed(kind), showSignature: Boolean(company.signatureDataUrl), showStamp: Boolean(company.stampDataUrl), showHsCode: true, showOrigin: true, showPacking: false, watermark: defaultWatermark() },",
    "    appearance: { templateId: 'executive', paletteMode: 'auto', accentColor: kind==='draft'?'#8e7cf3':kind==='rfq'?'#2563eb':kind==='purchase-order'?'#c88f37':kind==='delivery-note'?'#7c8b95':kind==='payment-receipt'?'#0f9f7f':'#159fa7', latinFont: 'auto', arabicFont: 'auto', showBank: documentBankAllowed(kind), showSignature: Boolean(company.signatureDataUrl), showStamp: Boolean(company.stampDataUrl), showHsCode: true, showOrigin: true, showPacking: false, watermark: defaultWatermark() },",
    "statement accent cleanup",
)

Path("src/lib/readiness.ts").write_text("""import type { LourexDocument } from '../types.js';
import { validateDocument } from './documents.js';
import { decimalToScaled, isDecimalInput } from './money.js';
import { documentPriceOptional, isSupplierDocumentKind } from './document-kinds.js';

export interface ReadinessGroup {
  key: 'document'|'customer'|'items'|'pricing';
  complete: boolean;
}

export interface DocumentReadiness {
  percent: number;
  complete: number;
  total: number;
  remaining: number;
  ready: boolean;
  groups: ReadinessGroup[];
}

const fixedPositive = (value: string) => isDecimalInput(value) && decimalToScaled(value) > 0n;
const fixedNonNegative = (value: string) => isDecimalInput(value) && decimalToScaled(value) >= 0n;

export function getDocumentReadiness(doc: LourexDocument): DocumentReadiness {
  const errors=validateDocument(doc);
  const priceOptional=documentPriceOptional(doc.kind);
  const requirements: boolean[] = [];
  const documentChecks = [
    !errors.number,
    !errors.issueDate,
    Boolean(doc.currency.trim()),
    !errors.dueDate
  ];
  requirements.push(...documentChecks);

  const customerComplete = isSupplierDocumentKind(doc.kind) ? !errors.supplier : !errors.customer;
  requirements.push(customerComplete);

  const itemDetailChecks: boolean[] = [];
  const pricingChecks: boolean[] = [];
  if (!doc.items.length) requirements.push(false);
  for (const item of doc.items) {
    const descriptionComplete = doc.language === 'ar'
      ? Boolean(item.descriptionAr.trim())
      : doc.language === 'bilingual'
        ? Boolean(item.descriptionEn.trim() && item.descriptionAr.trim())
        : Boolean(item.descriptionEn.trim());
    const details=[descriptionComplete,Boolean(item.unit.trim()),fixedPositive(item.quantity)];
    itemDetailChecks.push(...details);
    requirements.push(...details);
    if(!priceOptional){
      const priceComplete=fixedNonNegative(item.unitPrice);
      pricingChecks.push(priceComplete);
      requirements.push(priceComplete);
    }
  }

  if (!priceOptional && doc.adjustments.discountEnabled) requirements.push(!errors.discount);
  if (!priceOptional && doc.adjustments.shippingEnabled) requirements.push(!errors.shipping);
  if (!priceOptional && doc.adjustments.otherChargesEnabled) requirements.push(!errors.otherCharges);
  if (!priceOptional && doc.adjustments.taxEnabled) requirements.push(!errors.tax);

  const total = Math.max(1, requirements.length);
  const complete = requirements.filter(Boolean).length;
  const percent = Math.max(0, Math.min(100, Math.round((complete / total) * 100)));
  return {
    percent,
    complete,
    total,
    remaining: Math.max(0, total - complete),
    ready: Object.keys(errors).length === 0,
    groups: [
      { key: 'document', complete: documentChecks.every(Boolean) },
      { key: 'customer', complete: customerComplete },
      { key: 'items', complete: doc.items.length > 0 && itemDetailChecks.every(Boolean) },
      { key: 'pricing', complete: priceOptional || (doc.items.length > 0 && pricingChecks.every(Boolean) && !errors.discount && !errors.shipping && !errors.otherCharges && !errors.tax) }
    ]
  };
}
""")

replace(
    "src/components/AppShell.tsx",
    "<button type=\"button\" role=\"menuitem\" data-kind=\"statement-account\" data-order=\"10\" onClick={()=>this.createDocument('statement-account')}><Icon name=\"file\"/><span><strong>{t('Statement of Account','كشف حساب')}</strong><small>{t('Customer account statement','كشف حركة ورصيد حساب العميل')}</small></span></button>",
    "<button type=\"button\" role=\"menuitem\" data-kind=\"statement-account\" data-order=\"10\" onClick={()=>this.navigate('receivables')}><Icon name=\"file\"/><span><strong>{t('Statement of Account','كشف حساب')}</strong><small>{t('Open the existing customer statement workflow in Finance','فتح كشف حساب العميل الموجود في المالية')}</small></span></button>",
    "statement menu routing",
)

replace(
    "public/document-entry-v302.js",
    "    const kind=explicit||fallbackKinds[index]||'';\n    if(!kind)return;\n    try{window.sessionStorage.setItem(pendingKindKey,kind);}catch{}",
    "    const kind=explicit||fallbackKinds[index]||'';\n    const creatableKinds=new Set(['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt']);\n    if(!kind||!creatableKinds.has(kind)){try{window.sessionStorage.removeItem(pendingKindKey);}catch{}return;}\n    try{window.sessionStorage.setItem(pendingKindKey,kind);}catch{}",
    "creatable kind guard",
)

p=Path("src/components/DocumentsPage.tsx")
s=p.read_text()
s=s.replace("  onCreateCreditNote?: (doc:LourexDocument) => void;\n}","  onCreateCreditNote?: (doc:LourexDocument) => void;\n  onOpenStatements?: () => void;\n}")
s=s.replace("    const statements=typeCount('statement-account');\n","")
s=s.replace("<b>{resume.kind==='draft'?(resume.letter?.subject||t('Company Draft','مسودة شركة')):formatMoney(calculateTotals(resume.items,resume.adjustments).grandTotal,resume.currency)}</b>","<b>{resume.kind==='draft'?(resume.letter?.subject||t('Company Draft','مسودة شركة')):documentPriceOptional(resume.kind)?'—':formatMoney(calculateTotals(resume.items,resume.adjustments).grandTotal,resume.currency)}</b>")
s=s.replace("<button type=\"button\" className={this.overviewActive('statement-account','all')?'active':''} aria-pressed={this.overviewActive('statement-account','all')} onClick={()=>this.setOverview('statement-account','all')}><span>10 · {t('Statement of Account','كشف حساب')}</span><strong>{statements}</strong></button>","<button type=\"button\" onClick={()=>this.props.onOpenStatements?.()}><span>10 · {t('Statement of Account','كشف حساب')}</span><strong aria-hidden=\"true\">↗</strong></button>")
s=s.replace("<strong className=\"register-amount\"><bdi>{doc.kind==='draft'?'—':formatMoney(totals.grandTotal,doc.currency)}</bdi></strong>","<strong className=\"register-amount\"><bdi>{doc.kind==='draft'||documentPriceOptional(doc.kind)?'—':formatMoney(totals.grandTotal,doc.currency)}</bdi></strong>")
if "statement-account','all'" in s:
    raise SystemExit("DocumentsPage still contains statement-account filter")
p.write_text(s)

replace(
    "src/app/App.tsx",
    "onCreateCreditNote={(doc)=>void this.createCreditNote(doc)}/>:null}",
    "onCreateCreditNote={(doc)=>void this.createCreditNote(doc)} onOpenStatements={()=>navigate('receivables')}/>:null}",
    "Documents statement navigation",
)

p=Path("src/components/GlobalSearch.tsx")
s=p.read_text()
s=s.replace("import { isArabic, t } from '../lib/i18n.js';\nimport { Icon } from './UI.js';", "import { isArabic, t } from '../lib/i18n.js';\nimport { documentKindLabel, isSupplierDocumentKind } from '../lib/document-kinds.js';\nimport { Icon } from './UI.js';")
s=s.replace("function documentCustomer(document:LourexDocument):string{return localized(document.customerSnapshot?.companyNameEn||'',document.customerSnapshot?.companyNameAr||'',t('No customer','بدون عميل'));}", "function documentCustomer(document:LourexDocument):string{if(document.kind==='draft')return document.letter?.subject||document.letter?.recipient||t('Company document','مستند شركة');if(isSupplierDocumentKind(document.kind))return localized(document.supplierSnapshot?.nameEn||'',document.supplierSnapshot?.nameAr||'',t('No supplier','بدون مورد'));return localized(document.customerSnapshot?.companyNameEn||'',document.customerSnapshot?.companyNameAr||'',t('No customer','بدون عميل'));}")
s=s.replace("      const label=document.role==='credit-note'?t('Credit note','إشعار دائن'):document.kind==='invoice'?t('Invoice','فاتورة'):t('Quotation','عرض سعر');", "      const kind=documentKindLabel(document.kind,document.role);const label=t(kind.en,kind.ar);")
if "document.kind==='invoice'?t('Invoice'" in s:
    raise SystemExit("GlobalSearch still has legacy document label fallback")
p.write_text(s)

p=Path("src/lib/document-quality.ts")
s=p.read_text()
s=s.replace("import { documentDisplayValue, hasDocumentLanguageMismatch, type DocumentValueKind } from './document-language.js';", "import { documentDisplayValue, hasDocumentLanguageMismatch, type DocumentValueKind } from './document-language.js';\nimport { documentBankAllowed, documentPriceOptional } from './document-kinds.js';")
s=s.replace("  const bank=doc.appearance.showBank&&Object.values(doc.companySnapshot.bank).some(value=>value.trim());", "  const bank=documentBankAllowed(doc.kind,doc.role)&&doc.appearance.showBank&&Object.values(doc.companySnapshot.bank).some(value=>value.trim());")
s=s.replace("  if(doc.appearance.showBank){", "  if(documentBankAllowed(doc.kind,doc.role)&&doc.appearance.showBank){")
s=s.replace("  if(doc.items.some(item=>isDecimalInput(item.unitPrice)&&decimalToScaled(item.unitPrice)===0n))issues.push({code:'zero-price',level:'warning'});", "  if(!documentPriceOptional(doc.kind)&&doc.items.some(item=>isDecimalInput(item.unitPrice)&&decimalToScaled(item.unitPrice)===0n))issues.push({code:'zero-price',level:'warning'});")
p.write_text(s)

for path in ["src/templates/TemplateRenderer.tsx","src/components/EditorPageCore.tsx"]:
    p=Path(path)
    s=p.read_text()
    s=s.replace("documentBankAllowed(doc.kind)","documentBankAllowed(doc.kind,doc.role)")
    s=s.replace("documentBankAllowed(d.kind)","documentBankAllowed(d.kind,d.role)")
    p.write_text(s)

p=Path("src/components/EditorPageCore.tsx")
s=p.read_text()
s=s.replace("const defaultTemplateId=d.kind==='proforma'?this.props.smartDefaults.quoteTemplateId:this.props.smartDefaults.invoiceTemplateId;", "const defaultTemplateId=(d.kind==='proforma'||d.kind==='proforma-invoice'||d.kind==='rfq')?this.props.smartDefaults.quoteTemplateId:d.kind==='invoice'?this.props.smartDefaults.invoiceTemplateId:d.appearance.templateId;")
old="(d.kind==='proforma'||d.kind==='proforma-invoice')?t('Valid Until','صالح حتى'):isPurchaseOrder?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق')"
new="d.kind==='rfq'?t('Response Due','آخر موعد لاستلام العرض'):(d.kind==='proforma'||d.kind==='proforma-invoice')?t('Valid Until','صالح حتى'):isPurchaseOrder?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق')"
s=s.replace(old,new)
s=s.replace("<div className=\"editor-grand-total-chip\"><span>{isPurchaseOrder?t('Order Total','إجمالي الطلب'):t('Grand Total','الإجمالي')}</span><strong>{formatMoney(totals.grandTotal,d.currency)}</strong></div>", "<div className=\"editor-grand-total-chip\"><span>{priceOptional?t('Non-financial','غير مالي'):isPurchaseOrder?t('Order Total','إجمالي الطلب'):t('Grand Total','الإجمالي')}</span><strong>{priceOptional?'—':formatMoney(totals.grandTotal,d.currency)}</strong></div>")
p.write_text(s)

p=Path("src/templates/TemplateRenderer.tsx")
s=p.read_text()
old="(doc.kind === 'proforma'||doc.kind==='proforma-invoice') ? 'Valid Until' : doc.kind==='purchase-order' ? 'Requested Delivery' : 'Due Date', (doc.kind === 'proforma'||doc.kind==='proforma-invoice') ? 'صالح حتى' : doc.kind==='purchase-order' ? 'التسليم المطلوب' : 'تاريخ الاستحقاق'"
new="doc.kind==='rfq' ? 'Response Due' : (doc.kind === 'proforma'||doc.kind==='proforma-invoice') ? 'Valid Until' : doc.kind==='purchase-order' ? 'Requested Delivery' : 'Due Date', doc.kind==='rfq' ? 'آخر موعد لاستلام العرض' : (doc.kind === 'proforma'||doc.kind==='proforma-invoice') ? 'صالح حتى' : doc.kind==='purchase-order' ? 'التسليم المطلوب' : 'تاريخ الاستحقاق'"
s=s.replace(old,new)
p.write_text(s)

p=Path("tests/v312-business-document-suite.test.mjs")
s=p.read_text()
s=s.replace("  for(const kind of ['rfq','proforma-invoice','delivery-note','payment-receipt','statement-account'])assert.ok(vault.includes(`'${kind}'`));", "  for(const kind of ['rfq','proforma-invoice','delivery-note','payment-receipt'])assert.ok(vault.includes(`'${kind}'`));\n  assert.ok(!vault.includes(\"'statement-account'\"),'statement workflow must remain owned by Finance rather than vault document kinds');")
if "v312 pre-merge audit keeps search" not in s:
    s += """

test('v312 pre-merge audit keeps search, readiness and routing semantically aligned',async()=>{
  const [search,readiness,shell,entry,page,quality]=await Promise.all([
    read('src/components/GlobalSearch.tsx'),read('src/lib/readiness.ts'),read('src/components/AppShell.tsx'),
    read('public/document-entry-v302.js'),read('src/components/DocumentsPage.tsx'),read('src/lib/document-quality.ts')
  ]);
  assert.match(search,/documentKindLabel\(document\.kind,document\.role\)/);
  assert.match(search,/isSupplierDocumentKind\(document\.kind\)/);
  assert.match(readiness,/const priceOptional=documentPriceOptional\(doc\.kind\)/);
  assert.match(readiness,/isSupplierDocumentKind\(doc\.kind\)/);
  assert.match(shell,/data-kind=\"statement-account\"[^>]+navigate\('receivables'\)/);
  assert.match(entry,/const creatableKinds=new Set/);
  assert.match(entry,/removeItem\(pendingKindKey\)/);
  assert.match(page,/documentPriceOptional\(doc\.kind\)\?'—'/);
  assert.match(quality,/!documentPriceOptional\(doc\.kind\)/);
});
"""
p.write_text(s)

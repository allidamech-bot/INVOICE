from pathlib import Path


def read(path): return Path(path).read_text()
def write(path,text): Path(path).write_text(text)
def replace(path,old,new,label,all=False):
    s=read(path)
    if new in s and old not in s:return
    if old not in s:raise SystemExit(f'{path}: missing {label}')
    write(path,s.replace(old,new) if all else s.replace(old,new,1))
def insert_after(path,marker,addition,label):
    s=read(path)
    if addition.strip() in s:return
    if marker not in s:raise SystemExit(f'{path}: missing {label}')
    write(path,s.replace(marker,marker+addition,1))

# Schema v14 separates legacy Quotation numbering (QUO) from Proforma Invoice (PI).
replace('src/lib/defaults.ts',
"// v13 adds optional watermarks and encrypted free-form company Draft documents.\nexport const APP_SCHEMA_VERSION = 13;",
"// v13 adds optional watermarks and encrypted free-form company Draft documents.\n// v14 separates Quotation (QUO) from Proforma Invoice (PI) and finalizes the v312 business-document suite.\nexport const APP_SCHEMA_VERSION = 14;",'schema v14')
replace('src/lib/defaults.ts',"numbering: { proformaPrefix: 'PI', invoicePrefix: 'INV'","numbering: { proformaPrefix: 'QUO', invoicePrefix: 'INV'",'quotation default prefix')

p=Path('src/storage/vault.ts');s=p.read_text();marker="\n\n  migrated.customers = Array.isArray((vault as any).customers)";insert="\n  // v14 reserves PI for Proforma Invoice. Existing Quotation documents remain intact; only future quotation numbering moves to QUO.\n  if(sourceVersion<14&&migrated.appSettings.numbering.proformaPrefix==='PI')migrated.appSettings.numbering.proformaPrefix='QUO';\n"
if insert.strip() not in s:
    if marker not in s:raise SystemExit('src/storage/vault.ts: migration marker missing')
    s=s.replace(marker,insert+marker,1);p.write_text(s)

# Central semantics shared by editor/output/defaults.
insert_after('src/lib/document-kinds.ts',
"export function documentBankAllowed(kind:DocumentKind,role:DocumentRole='standard'):boolean{return businessDocumentDefinition(kind,role).bankAllowed;}",
"\nexport type DocumentSecondaryDateKind='none'|'valid-until'|'requested-delivery'|'due-date'|'response-due';\nexport function documentSecondaryDateKind(kind:DocumentKind,role:DocumentRole='standard'):DocumentSecondaryDateKind{\n  if(role==='credit-note'||kind==='draft'||kind==='delivery-note'||kind==='payment-receipt')return'none';\n  if(kind==='proforma'||kind==='proforma-invoice')return'valid-until';\n  if(kind==='purchase-order')return'requested-delivery';\n  if(kind==='rfq')return'response-due';\n  return'due-date';\n}\nexport function documentUsesCommercialDefaults(kind:DocumentKind):boolean{return kind!=='draft'&&kind!=='payment-receipt';}\n",'document semantic helpers')

# Numbering/defaults/validation.
replace('src/lib/documents.ts',
"import { documentBankAllowed, documentNumberPrefix, documentPriceOptional, isSupplierDocumentKind } from './document-kinds.js';",
"import { documentBankAllowed, documentNumberPrefix, documentPriceOptional, documentSecondaryDateKind, documentUsesCommercialDefaults, isSupplierDocumentKind } from './document-kinds.js';",'document-kind imports')
insert_after('src/lib/documents.ts',"const liveNumberReservations=new WeakMap<object,NumberReservation>();","\nconst liveAuxiliaryReservations=new WeakMap<object,{year:number;values:Record<string,number>}>();",'auxiliary number reservations')
replace('src/lib/documents.ts',
"  const fallbackPrefix=isProforma?'PI':isPurchaseOrder?'PO':isDraft?'DR':'INV';",
"  const fallbackPrefix=isProforma?'QUO':isPurchaseOrder?'PO':isDraft?'DR':'INV';",'quotation fallback')
replace('src/lib/documents.ts',
"    seq=vault.documents.reduce((max,document)=>{const match=document.number.trim().match(matchPattern);return match?Math.max(max,Number(match[1])||0):max;},0);\n    let number='';\n    do{seq+=1;number=`${prefix}-${year}-${String(seq).padStart(4,'0')}`;}while(used.has(number.toLowerCase()));\n    return {number,vault};",
"    const scanned=vault.documents.reduce((max,document)=>{const match=document.number.trim().match(matchPattern);return match?Math.max(max,Number(match[1])||0):max;},0);\n    const live=liveAuxiliaryReservations.get(sourceNumbering);const reserved=live?.year===year?(live.values[kind]??0):0;seq=Math.max(scanned,reserved);\n    let number='';\n    do{seq+=1;number=`${prefix}-${year}-${String(seq).padStart(4,'0')}`;}while(used.has(number.toLowerCase()));\n    const values=live?.year===year?{...live.values}:{};values[kind]=seq;liveAuxiliaryReservations.set(sourceNumbering,{year,values});\n    return {number,vault};",'auxiliary number collision guard')
replace('src/lib/documents.ts',"  const taxPreset=defaultTaxPreset(company);\n  return {","  const taxPreset=defaultTaxPreset(company);\n  const usesCommercialDefaults=documentUsesCommercialDefaults(kind);\n  return {",'commercial defaults flag')
replace('src/lib/documents.ts',
"id: makeId('doc'), kind, role:'standard', status: 'draft', lifecycleStatus:'active', revision:1, creditForId:'', creditForNumber:'', voidedAt:'', voidReason:'', bankAccountId:company.defaultBankAccountId||'primary', paymentTermPresetId:paymentPreset?.id||'', number, issueDate,",
"id: makeId('doc'), kind, role:'standard', status: 'draft', lifecycleStatus:'active', revision:1, creditForId:'', creditForNumber:'', voidedAt:'', voidReason:'', bankAccountId:company.defaultBankAccountId||'primary', paymentTermPresetId:usesCommercialDefaults?(paymentPreset?.id||''):'', number, issueDate,",'receipt preset isolation')
replace('src/lib/documents.ts',
"terms: { incoterm: company.defaultIncoterm, paymentTerms: paymentPreset?.label||company.defaultPaymentTerms, packing: '', deliveryTime: company.defaultDeliveryTime, portOfLoading: '', finalDestination: '', countryOfOrigin: '', validity: '', remarks: '' },",
"terms: { incoterm: usesCommercialDefaults?company.defaultIncoterm:'', paymentTerms: usesCommercialDefaults?(paymentPreset?.label||company.defaultPaymentTerms):'', packing: '', deliveryTime: usesCommercialDefaults?company.defaultDeliveryTime:'', portOfLoading: '', finalDestination: '', countryOfOrigin: '', validity: '', remarks: '' },",'receipt terms isolation')
replace('src/lib/documents.ts',
"adjustments: { discountEnabled: false, discountMode: 'fixed', discountValue: '0.00', shippingEnabled: false, shipping: '0.00', otherChargesEnabled: false, otherCharges: '0.00', taxEnabled: Boolean(taxPreset), taxPercent: taxPreset?.rate||'0' },",
"adjustments: documentPriceOptional(kind)?{ discountEnabled:false, discountMode:'fixed', discountValue:'0.00', shippingEnabled:false, shipping:'0.00', otherChargesEnabled:false, otherCharges:'0.00', taxEnabled:false, taxPercent:'0' }:{ discountEnabled: false, discountMode: 'fixed', discountValue: '0.00', shippingEnabled: false, shipping: '0.00', otherChargesEnabled: false, otherCharges:'0.00', taxEnabled: Boolean(taxPreset), taxPercent: taxPreset?.rate||'0' },",'optional-price adjustment defaults')
replace('src/lib/documents.ts',
"  if ((doc.kind === 'proforma' || doc.kind === 'proforma-invoice') && !doc.dueDate) errors.dueDate = 'Valid until date is required.';\n  if (doc.kind === 'purchase-order' && !doc.dueDate) errors.dueDate = 'Requested delivery date is required.';\n  if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=(doc.kind==='proforma'||doc.kind==='proforma-invoice'||doc.kind==='rfq')?'Valid until date is invalid.':doc.kind==='purchase-order'?'Requested delivery date is invalid.':'Due date is invalid.';\n  else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=(doc.kind==='proforma'||doc.kind==='proforma-invoice'||doc.kind==='rfq')?'Valid until date cannot be before issue date.':doc.kind==='purchase-order'?'Requested delivery cannot be before order date.':'Due date cannot be before issue date.';",
"  const secondaryDate=documentSecondaryDateKind(doc.kind,doc.role);\n  if(secondaryDate==='valid-until'&&!doc.dueDate)errors.dueDate='Valid until date is required.';\n  if(secondaryDate==='requested-delivery'&&!doc.dueDate)errors.dueDate='Requested delivery date is required.';\n  if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=secondaryDate==='valid-until'?'Valid until date is invalid.':secondaryDate==='requested-delivery'?'Requested delivery date is invalid.':secondaryDate==='response-due'?'Response due date is invalid.':'Due date is invalid.';\n  else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=secondaryDate==='valid-until'?'Valid until date cannot be before issue date.':secondaryDate==='requested-delivery'?'Requested delivery cannot be before order date.':secondaryDate==='response-due'?'Response due date cannot be before issue date.':'Due date cannot be before issue date.';",'secondary date validation')

# Smart defaults: only real commercial documents update future defaults.
insert_after('src/app/App.tsx',"import { isLetterDocument } from '../lib/document-extras.js';","\nimport { documentUsesCommercialDefaults } from '../lib/document-kinds.js';",'app semantic import')
replace('src/app/App.tsx',"const updatesSmartDefaults=!auto&&updated.kind!=='draft';","const updatesSmartDefaults=!auto&&documentUsesCommercialDefaults(updated.kind);",'smart-default predicate')
replace('src/app/App.tsx',"const templateDefault=updated.kind==='proforma'?{quoteTemplateId:updated.appearance.templateId}:updated.kind==='invoice'?{invoiceTemplateId:updated.appearance.templateId}:{};","const templateDefault=(updated.kind==='proforma'||updated.kind==='proforma-invoice'||updated.kind==='rfq')?{quoteTemplateId:updated.appearance.templateId}:updated.kind==='invoice'?{invoiceTemplateId:updated.appearance.templateId}:{};",'template smart default')
replace('src/app/App.tsx',"if(!auto)this.showToast(updated.kind==='draft'?t('Company draft saved.','تم حفظ مسودة الشركة.'):t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'),'success');","if(!auto)this.showToast(updated.kind==='draft'?t('Company draft saved.','تم حفظ مسودة الشركة.'):updatesSmartDefaults?t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'):t('Document saved.','تم حفظ المستند.'),'success');",'smart-default toast')

# Editor: RFQ response interval, hidden irrelevant dates, truly optional price UI.
replace('src/components/EditorPageCore.tsx',
"import { documentBankAllowed, documentKindLabel, documentPriceOptional, isSupplierDocumentKind } from '../lib/document-kinds.js';",
"import { documentBankAllowed, documentKindLabel, documentPriceOptional, documentSecondaryDateKind, documentUsesCommercialDefaults, isSupplierDocumentKind } from '../lib/document-kinds.js';",'editor semantic imports')
replace('src/components/EditorPageCore.tsx',
"    if(d.kind==='proforma'||d.kind==='proforma-invoice'||d.kind==='rfq'){\n      if(!isIsoDate(value))return next;\n      const validityDays=daysBetweenIso(d.issueDate,d.dueDate)??normalizeValidityDays(this.props.company.defaultValidityDays);\n      return {...next,dueDate:addDaysIso(value,validityDays)};\n    }",
"    if(d.kind==='proforma'||d.kind==='proforma-invoice'){\n      if(!isIsoDate(value))return next;\n      const validityDays=daysBetweenIso(d.issueDate,d.dueDate)??normalizeValidityDays(this.props.company.defaultValidityDays);\n      return {...next,dueDate:addDaysIso(value,validityDays)};\n    }\n    if(d.kind==='rfq'){if(!isIsoDate(value)||!d.dueDate)return next;const responseDays=daysBetweenIso(d.issueDate,d.dueDate);return responseDays===null?next:{...next,dueDate:addDaysIso(value,responseDays)};}", 'rfq response date behavior')
replace('src/components/EditorPageCore.tsx',"  private selectCustomer=(c:Customer)=>{this.mutate(d=>applyCustomerCommercialDefaults({...d,customerSnapshot:customerSnapshotFrom(c)},c,this.props.company));","  private selectCustomer=(c:Customer)=>{this.mutate(d=>{const next={...d,customerSnapshot:customerSnapshotFrom(c)};return documentUsesCommercialDefaults(d.kind)?applyCustomerCommercialDefaults(next,c,this.props.company):next;});",'receipt customer defaults')
replace('src/components/EditorPageCore.tsx',"  private setCurrentTemplateDefault=()=>{const templateId=this.state.doc.appearance.templateId;const smart=this.state.doc.kind==='proforma'?{...this.props.smartDefaults,quoteTemplateId:templateId}:{...this.props.smartDefaults,invoiceTemplateId:templateId};void this.saveTemplateDefaults(smart);};","  private setCurrentTemplateDefault=()=>{const templateId=this.state.doc.appearance.templateId,kind=this.state.doc.kind;if(kind!=='invoice'&&kind!=='proforma'&&kind!=='proforma-invoice'&&kind!=='rfq')return;const smart=(kind==='proforma'||kind==='proforma-invoice'||kind==='rfq')?{...this.props.smartDefaults,quoteTemplateId:templateId}:{...this.props.smartDefaults,invoiceTemplateId:templateId};void this.saveTemplateDefaults(smart);};",'template default guard')
replace('src/components/EditorPageCore.tsx',"    const priceOptional=documentPriceOptional(d.kind);\n    const error=","    const priceOptional=documentPriceOptional(d.kind);\n    const secondaryDateKind=documentSecondaryDateKind(d.kind,d.role);\n    const secondaryDateLabel=secondaryDateKind==='response-due'?t('Response Due','آخر موعد لاستلام العرض'):secondaryDateKind==='valid-until'?t('Valid Until','صالح حتى'):secondaryDateKind==='requested-delivery'?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق');\n    const secondaryDateRequired=secondaryDateKind==='valid-until'||secondaryDateKind==='requested-delivery';\n    const error=",'editor secondary date vars')
old="<Field label={d.kind==='rfq'?t('Response Due','آخر موعد لاستلام العرض'):(d.kind==='proforma'||d.kind==='proforma-invoice')?t('Valid Until','صالح حتى'):isPurchaseOrder?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق')} className={d.kind==='proforma'||d.kind==='proforma-invoice'||isPurchaseOrder?'required-field':''} error={error('dueDate')}><EditorDateInput label={d.kind==='rfq'?t('Response Due','آخر موعد لاستلام العرض'):(d.kind==='proforma'||d.kind==='proforma-invoice')?t('Valid Until','صالح حتى'):isPurchaseOrder?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق')} value={d.dueDate} onChange={value=>this.field('dueDate',value)}/></Field>"
new="{secondaryDateKind!=='none'?<Field label={secondaryDateLabel} className={secondaryDateRequired?'required-field':''} error={error('dueDate')}><EditorDateInput label={secondaryDateLabel} value={d.dueDate} onChange={value=>this.field('dueDate',value)}/></Field>:null}"
replace('src/components/EditorPageCore.tsx',old,new,'editor secondary date field')
replace('src/components/EditorPageCore.tsx',"const zeroPrice=i.unitPrice.trim()!==''&&isDecimalInput(i.unitPrice)&&decimalToScaled(i.unitPrice)===0n;","const zeroPrice=!priceOptional&&i.unitPrice.trim()!==''&&isDecimalInput(i.unitPrice)&&decimalToScaled(i.unitPrice)===0n;",'optional zero-price warning')
replace('src/components/EditorPageCore.tsx',"<span className=\"item-line-total\">{formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</span>","<span className=\"item-line-total\">{priceOptional?'—':formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</span>",'optional line total header')
replace('src/components/EditorPageCore.tsx',"{suggestedPrice&&suggestedPrice!==i.unitPrice?<button type=\"button\" className=\"pricing-suggestion-chip\"","{!priceOptional&&suggestedPrice&&suggestedPrice!==i.unitPrice?<button type=\"button\" className=\"pricing-suggestion-chip\"",'optional suggestion')
replace('src/components/EditorPageCore.tsx',"<Field label={isPurchaseOrder?t(`Unit Cost (${d.currency})`,`تكلفة الوحدة (${d.currency})`):t(`Unit Price (${d.currency})`,`سعر الوحدة (${d.currency})`)} className=\"required-field\" error={error(`item-${index}-price`)}>","<Field label={isPurchaseOrder?t(`Unit Cost (${d.currency})`,`تكلفة الوحدة (${d.currency})`):priceOptional?t(`Unit Price (${d.currency}) — optional`,`سعر الوحدة (${d.currency}) — اختياري`):t(`Unit Price (${d.currency})`,`سعر الوحدة (${d.currency})`)} className={priceOptional?'':'required-field'} error={error(`item-${index}-price`)}>",'optional unit price field')
replace('src/components/EditorPageCore.tsx',"<footer><span>{t('Line Total','إجمالي السطر')}</span><strong>{formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</strong></footer>","<footer><span>{t('Line Total','إجمالي السطر')}</span><strong>{priceOptional?'—':formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</strong></footer>",'optional line total footer')
# Hide totals section entirely for RFQ / Delivery Note.
p=Path('src/components/EditorPageCore.tsx');s=p.read_text();start_marker="        <section className={`editor-section ${sectionHasError('discount','shipping','otherCharges','tax')?'section-has-error':''}`}><div className=\"section-heading\"><span>04</span><h2>{t('Totals','الإجماليات')}</h2></div>";next_marker="\n\n        <section className=\"editor-section\"><div className=\"section-heading\"><span>05</span><h2>{t('Commercial Terms','الشروط التجارية')}</h2></div>"
if "        {!priceOptional?<section className={`editor-section ${sectionHasError('discount'" not in s:
    a=s.find(start_marker);b=s.find(next_marker,a)
    if a<0 or b<0:raise SystemExit('Editor totals section markers missing')
    block=s[a:b];s=s[:a]+"        {!priceOptional?"+block[len('        '):]+":null}"+s[b:];p.write_text(s)

# Renderer: secondary dates and receipt terms follow the same semantics.
replace('src/templates/TemplateRenderer.tsx',
"import { documentBankAllowed, documentKindTitle, documentPriceOptional, isSupplierDocumentKind } from '../lib/document-kinds.js';",
"import { documentBankAllowed, documentKindTitle, documentPriceOptional, documentSecondaryDateKind, documentUsesCommercialDefaults, isSupplierDocumentKind } from '../lib/document-kinds.js';",'renderer semantic imports')
p=Path('src/templates/TemplateRenderer.tsx');s=p.read_text();old="function MetaBlock({ document: doc }: { document: LourexDocument }): any {\n  const currency=documentCurrency(doc);\n  return <div className=\"doc-meta\"><div className=\"meta-number\"><b>{localized(doc, 'No.', 'الرقم')}</b><span>{doc.number}</span></div>{doc.revision>1?<div className=\"meta-revision\"><b>{localized(doc,'Revision','المراجعة')}</b><span>R{doc.revision}</span></div>:null}{doc.creditForNumber?<div className=\"meta-source\"><b>{localized(doc,'Source Invoice','الفاتورة الأصلية')}</b><span>{doc.creditForNumber}</span></div>:null}<div className=\"meta-issue\"><b>{localized(doc, doc.kind==='purchase-order'?'Order Date':'Issue Date', doc.kind==='purchase-order'?'تاريخ الطلب':'تاريخ الإصدار')}</b><span>{displayDate(doc.issueDate, doc.language)}</span></div>{doc.dueDate ? <div className=\"meta-due\"><b>{localized(doc, doc.kind==='rfq' ? 'Response Due' : (doc.kind === 'proforma'||doc.kind==='proforma-invoice') ? 'Valid Until' : doc.kind==='purchase-order' ? 'Requested Delivery' : 'Due Date', doc.kind==='rfq' ? 'آخر موعد لاستلام العرض' : (doc.kind === 'proforma'||doc.kind==='proforma-invoice') ? 'صالح حتى' : doc.kind==='purchase-order' ? 'التسليم المطلوب' : 'تاريخ الاستحقاق')}</b><span>{displayDate(doc.dueDate, doc.language)}</span></div> : null}<div className=\"meta-currency\"><b>{localized(doc, 'Currency', 'العملة')}</b><span>{currency}</span></div></div>;\n}"
new="function MetaBlock({ document: doc }: { document: LourexDocument }): any {\n  const currency=documentCurrency(doc);const secondary=documentSecondaryDateKind(doc.kind,doc.role);const dateEn=secondary==='response-due'?'Response Due':secondary==='valid-until'?'Valid Until':secondary==='requested-delivery'?'Requested Delivery':'Due Date';const dateAr=secondary==='response-due'?'آخر موعد لاستلام العرض':secondary==='valid-until'?'صالح حتى':secondary==='requested-delivery'?'التسليم المطلوب':'تاريخ الاستحقاق';\n  return <div className=\"doc-meta\"><div className=\"meta-number\"><b>{localized(doc, 'No.', 'الرقم')}</b><span>{doc.number}</span></div>{doc.revision>1?<div className=\"meta-revision\"><b>{localized(doc,'Revision','المراجعة')}</b><span>R{doc.revision}</span></div>:null}{doc.creditForNumber?<div className=\"meta-source\"><b>{localized(doc,'Source Invoice','الفاتورة الأصلية')}</b><span>{doc.creditForNumber}</span></div>:null}<div className=\"meta-issue\"><b>{localized(doc, doc.kind==='purchase-order'?'Order Date':'Issue Date', doc.kind==='purchase-order'?'تاريخ الطلب':'تاريخ الإصدار')}</b><span>{displayDate(doc.issueDate, doc.language)}</span></div>{doc.dueDate&&secondary!=='none'?<div className=\"meta-due\"><b>{localized(doc,dateEn,dateAr)}</b><span>{displayDate(doc.dueDate, doc.language)}</span></div>:null}<div className=\"meta-currency\"><b>{localized(doc, 'Currency', 'العملة')}</b><span>{currency}</span></div></div>;\n}"
if new not in s:
    if old not in s:raise SystemExit('TemplateRenderer MetaBlock missing')
    s=s.replace(old,new,1);p.write_text(s)
replace('src/templates/TemplateRenderer.tsx',"function Terms({ document: doc }: { document: LourexDocument }): any {\n  const t = doc.terms;","function Terms({ document: doc }: { document: LourexDocument }): any {\n  if(!documentUsesCommercialDefaults(doc.kind))return null;\n  const t = doc.terms;",'receipt terms output')
replace('src/templates/TemplateRenderer.tsx',"function displayedClosingValues(doc:LourexDocument):string[]{\n  const t=doc.terms;","function displayedClosingValues(doc:LourexDocument):string[]{\n  if(!documentUsesCommercialDefaults(doc.kind))return[];\n  const t=doc.terms;",'closing terms output')

# Quality/pagination mirrors the renderer.
replace('src/lib/document-quality.ts',"import { documentBankAllowed, documentPriceOptional } from './document-kinds.js';","import { documentBankAllowed, documentPriceOptional, documentUsesCommercialDefaults } from './document-kinds.js';",'quality imports')
replace('src/lib/document-quality.ts',"function displayedClosingValues(doc:LourexDocument):string[]{\n  const t=doc.terms;","function displayedClosingValues(doc:LourexDocument):string[]{\n  if(!documentUsesCommercialDefaults(doc.kind))return[];\n  const t=doc.terms;",'quality closing terms')

# Validation translations.
insert_after('src/lib/i18n.ts',"    'Due date cannot be before issue date.':'لا يمكن أن يكون تاريخ الاستحقاق قبل تاريخ الإصدار.',","\n    'Requested delivery date is required.':'تاريخ التسليم المطلوب مطلوب.',\n    'Requested delivery date is invalid.':'تاريخ التسليم المطلوب غير صالح.',\n    'Requested delivery cannot be before order date.':'لا يمكن أن يكون التسليم المطلوب قبل تاريخ الطلب.',\n    'Response due date is invalid.':'آخر موعد لاستلام العرض غير صالح.',\n    'Response due date cannot be before issue date.':'لا يمكن أن يكون آخر موعد لاستلام العرض قبل تاريخ الإصدار.',",'date validation translations')
insert_after('src/lib/i18n.ts',"    'Select a customer.':'اختر عميلاً.',","\n    'Select a supplier.':'اختر موردًا.',",'supplier validation translation')

# Focused regression coverage.
p=Path('tests/v312-business-document-suite.test.mjs');s=p.read_text()
if 'v312 final clean audit separates numbering and document semantics' not in s:
    s += r'''

test('v312 final clean audit separates numbering and document semantics',async()=>{
  const [defaults,vault,kinds,docs,app,editor,renderer]=await Promise.all([
    read('src/lib/defaults.ts'),read('src/storage/vault.ts'),read('src/lib/document-kinds.ts'),read('src/lib/documents.ts'),read('src/app/App.tsx'),read('src/components/EditorPageCore.tsx'),read('src/templates/TemplateRenderer.tsx')
  ]);
  assert.match(defaults,/APP_SCHEMA_VERSION = 14/);
  assert.match(defaults,/proformaPrefix: 'QUO'/);
  assert.match(vault,/sourceVersion<14&&migrated\.appSettings\.numbering\.proformaPrefix==='PI'/);
  assert.match(kinds,/documentSecondaryDateKind/);
  assert.match(kinds,/documentUsesCommercialDefaults/);
  assert.match(docs,/liveAuxiliaryReservations/);
  assert.match(docs,/fallbackPrefix=isProforma\?'QUO'/);
  assert.match(docs,/Response due date is invalid/);
  assert.match(app,/documentUsesCommercialDefaults\(updated\.kind\)/);
  assert.match(editor,/secondaryDateKind/);
  assert.match(editor,/priceOptional\?'—':formatMoney\(lineTotal/);
  assert.match(editor,/\{!priceOptional\?<section/);
  assert.match(renderer,/secondary!=='none'/);
  assert.match(renderer,/documentUsesCommercialDefaults\(doc\.kind\)/);
});
'''
    p.write_text(s)

for path in ['src/lib/defaults.ts','src/storage/vault.ts','src/lib/document-kinds.ts','src/lib/documents.ts','src/app/App.tsx','src/components/EditorPageCore.tsx','src/templates/TemplateRenderer.tsx']:
    p=Path(path);p.write_text(p.read_text().rstrip()+'\n')
print('v312 final clean audit patch applied')

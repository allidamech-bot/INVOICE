from pathlib import Path


def replace(path, old, new, label, all=False):
    p=Path(path); s=p.read_text()
    if new in s and old not in s:
        return
    if old not in s:
        raise SystemExit(f'{path}: missing {label}')
    p.write_text(s.replace(old,new) if all else s.replace(old,new,1))


def append_after(path, marker, addition, label):
    p=Path(path); s=p.read_text()
    if addition.strip() in s:
        return
    if marker not in s:
        raise SystemExit(f'{path}: missing {label}')
    p.write_text(s.replace(marker,marker+addition,1))

# ---------------------------------------------------------------------------
# One semantic source of truth for dates/defaults + safe numbering namespaces.
# ---------------------------------------------------------------------------
append_after(
    'src/lib/document-kinds.ts',
    "export function documentBankAllowed(kind:DocumentKind,role:DocumentRole='standard'):boolean{return businessDocumentDefinition(kind,role).bankAllowed;}",
    "\nexport type DocumentSecondaryDateKind='none'|'valid-until'|'requested-delivery'|'due-date'|'response-due';\n"
    "export function documentSecondaryDateKind(kind:DocumentKind,role:DocumentRole='standard'):DocumentSecondaryDateKind{\n"
    "  if(role==='credit-note'||kind==='draft'||kind==='delivery-note'||kind==='payment-receipt')return'none';\n"
    "  if(kind==='proforma'||kind==='proforma-invoice')return'valid-until';\n"
    "  if(kind==='purchase-order')return'requested-delivery';\n"
    "  if(kind==='rfq')return'response-due';\n"
    "  return'due-date';\n"
    "}\n"
    "export function documentUsesCommercialDefaults(kind:DocumentKind):boolean{return kind!=='draft'&&kind!=='payment-receipt';}\n",
    'document semantic helpers'
)

replace(
    'src/lib/defaults.ts',
    "// v13 adds optional watermarks and encrypted free-form company Draft documents.\nexport const APP_SCHEMA_VERSION = 13;",
    "// v13 adds optional watermarks and encrypted free-form company Draft documents.\n// v14 separates Quotation (QUO) from Proforma Invoice (PI) and adds the v312 document suite.\nexport const APP_SCHEMA_VERSION = 14;",
    'schema version 14'
)
replace('src/lib/defaults.ts',"numbering: { proformaPrefix: 'PI', invoicePrefix: 'INV'","numbering: { proformaPrefix: 'QUO', invoicePrefix: 'INV'",'quotation default prefix')

p=Path('src/storage/vault.ts'); s=p.read_text()
migration="  if(sourceVersion<14&&migrated.appSettings.numbering.proformaPrefix==='PI')migrated.appSettings.numbering.proformaPrefix='QUO';\n"
marker="  if (sourceVersion < 3) {\n"
if migration.strip() not in s:
    at=s.find("\n\n  migrated.customers =")
    if at<0: raise SystemExit('src/storage/vault.ts: v14 migration insertion point missing')
    s=s[:at]+"\n  // v14 reserves PI for Proforma Invoice; legacy Quotation PI becomes QUO.\n"+migration+s[at:]
p.write_text(s)

replace(
    'src/lib/documents.ts',
    "import { documentBankAllowed, documentNumberPrefix, documentPriceOptional, isSupplierDocumentKind } from './document-kinds.js';",
    "import { documentBankAllowed, documentNumberPrefix, documentPriceOptional, documentSecondaryDateKind, documentUsesCommercialDefaults, isSupplierDocumentKind } from './document-kinds.js';",
    'document semantic imports'
)
append_after('src/lib/documents.ts',"const liveNumberReservations=new WeakMap<object,NumberReservation>();","\nconst liveAuxiliaryReservations=new WeakMap<object,{year:number;values:Record<string,number>}>();",'auxiliary reservation map')
replace('src/lib/documents.ts',"const fallbackPrefix=isProforma?'PI':isPurchaseOrder?'PO':isDraft?'DR':'INV';","const fallbackPrefix=isProforma?'QUO':isPurchaseOrder?'PO':isDraft?'DR':'INV';",'quotation fallback prefix')
replace(
    'src/lib/documents.ts',
    "    seq=vault.documents.reduce((max,document)=>{const match=document.number.trim().match(matchPattern);return match?Math.max(max,Number(match[1])||0):max;},0);\n    let number='';\n    do{seq+=1;number=`${prefix}-${year}-${String(seq).padStart(4,'0')}`;}while(used.has(number.toLowerCase()));\n    return {number,vault};",
    "    const scanned=vault.documents.reduce((max,document)=>{const match=document.number.trim().match(matchPattern);return match?Math.max(max,Number(match[1])||0):max;},0);\n    const auxiliaryLive=liveAuxiliaryReservations.get(sourceNumbering);\n    const reserved=auxiliaryLive?.year===year?(auxiliaryLive.values[kind]??0):0;\n    seq=Math.max(scanned,reserved);\n    let number='';\n    do{seq+=1;number=`${prefix}-${year}-${String(seq).padStart(4,'0')}`;}while(used.has(number.toLowerCase()));\n    const values=auxiliaryLive?.year===year?{...auxiliaryLive.values}:{};\n    values[kind]=seq;liveAuxiliaryReservations.set(sourceNumbering,{year,values});\n    return {number,vault};",
    'auxiliary live numbering'
)
replace('src/lib/documents.ts',"  const taxPreset=defaultTaxPreset(company);\n  return {","  const taxPreset=defaultTaxPreset(company);\n  const usesCommercialDefaults=documentUsesCommercialDefaults(kind);\n  return {",'commercial defaults flag')
replace(
    'src/lib/documents.ts',
    "id: makeId('doc'), kind, role:'standard', status: 'draft', lifecycleStatus:'active', revision:1, creditForId:'', creditForNumber:'', voidedAt:'', voidReason:'', bankAccountId:company.defaultBankAccountId||'primary', paymentTermPresetId:paymentPreset?.id||'', number, issueDate,",
    "id: makeId('doc'), kind, role:'standard', status: 'draft', lifecycleStatus:'active', revision:1, creditForId:'', creditForNumber:'', voidedAt:'', voidReason:'', bankAccountId:company.defaultBankAccountId||'primary', paymentTermPresetId:usesCommercialDefaults?(paymentPreset?.id||''):'', number, issueDate,",
    'noncommercial payment preset isolation'
)
replace(
    'src/lib/documents.ts',
    "terms: { incoterm: company.defaultIncoterm, paymentTerms: paymentPreset?.label||company.defaultPaymentTerms, packing: '', deliveryTime: company.defaultDeliveryTime, portOfLoading: '', finalDestination: '', countryOfOrigin: '', validity: '', remarks: '' },",
    "terms: { incoterm: usesCommercialDefaults?company.defaultIncoterm:'', paymentTerms: usesCommercialDefaults?(paymentPreset?.label||company.defaultPaymentTerms):'', packing: '', deliveryTime: usesCommercialDefaults?company.defaultDeliveryTime:'', portOfLoading: '', finalDestination: '', countryOfOrigin: '', validity: '', remarks: '' },",
    'noncommercial trade defaults isolation'
)
replace(
    'src/lib/documents.ts',
    "adjustments: { discountEnabled: false, discountMode: 'fixed', discountValue: '0.00', shippingEnabled: false, shipping: '0.00', otherChargesEnabled: false, otherCharges: '0.00', taxEnabled: Boolean(taxPreset), taxPercent: taxPreset?.rate||'0' },",
    "adjustments: { discountEnabled: false, discountMode: 'fixed', discountValue: '0.00', shippingEnabled: false, shipping: '0.00', otherChargesEnabled: false, otherCharges: '0.00', taxEnabled: !documentPriceOptional(kind)&&Boolean(taxPreset), taxPercent: taxPreset?.rate||'0' },",
    'nonfinancial tax default'
)
replace(
    'src/lib/documents.ts',
    "  if ((doc.kind === 'proforma' || doc.kind === 'proforma-invoice') && !doc.dueDate) errors.dueDate = 'Valid until date is required.';\n  if (doc.kind === 'purchase-order' && !doc.dueDate) errors.dueDate = 'Requested delivery date is required.';\n  if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=(doc.kind==='proforma'||doc.kind==='proforma-invoice'||doc.kind==='rfq')?'Valid until date is invalid.':doc.kind==='purchase-order'?'Requested delivery date is invalid.':'Due date is invalid.';\n  else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=(doc.kind==='proforma'||doc.kind==='proforma-invoice'||doc.kind==='rfq')?'Valid until date cannot be before issue date.':doc.kind==='purchase-order'?'Requested delivery cannot be before order date.':'Due date cannot be before issue date.';",
    "  const secondaryDate=documentSecondaryDateKind(doc.kind,doc.role);\n  if(secondaryDate==='valid-until'&&!doc.dueDate)errors.dueDate='Valid until date is required.';\n  if(secondaryDate==='requested-delivery'&&!doc.dueDate)errors.dueDate='Requested delivery date is required.';\n  if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=secondaryDate==='valid-until'?'Valid until date is invalid.':secondaryDate==='requested-delivery'?'Requested delivery date is invalid.':secondaryDate==='response-due'?'Response due date is invalid.':'Due date is invalid.';\n  else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=secondaryDate==='valid-until'?'Valid until date cannot be before issue date.':secondaryDate==='requested-delivery'?'Requested delivery cannot be before order date.':secondaryDate==='response-due'?'Response due date cannot be before issue date.':'Due date cannot be before issue date.';",
    'secondary date validation'
)
replace('src/lib/documents.ts',"  if (doc.adjustments.discountEnabled) {","  if (!documentPriceOptional(doc.kind)&&doc.adjustments.discountEnabled) {",'optional-price discount validation')
replace('src/lib/documents.ts',"  if (doc.adjustments.shippingEnabled && !nonNegative(doc.adjustments.shipping)) errors.shipping = 'Shipping must be 0 or greater.';","  if (!documentPriceOptional(doc.kind)&&doc.adjustments.shippingEnabled && !nonNegative(doc.adjustments.shipping)) errors.shipping = 'Shipping must be 0 or greater.';",'optional-price shipping validation')
replace('src/lib/documents.ts',"  if (doc.adjustments.otherChargesEnabled && !nonNegative(doc.adjustments.otherCharges)) errors.otherCharges = 'Other charges must be 0 or greater.';","  if (!documentPriceOptional(doc.kind)&&doc.adjustments.otherChargesEnabled && !nonNegative(doc.adjustments.otherCharges)) errors.otherCharges = 'Other charges must be 0 or greater.';",'optional-price other validation')
replace('src/lib/documents.ts',"  if (doc.adjustments.taxEnabled && !nonNegative(doc.adjustments.taxPercent)) errors.tax = 'Tax must be 0 or greater.';","  if (!documentPriceOptional(doc.kind)&&doc.adjustments.taxEnabled && !nonNegative(doc.adjustments.taxPercent)) errors.tax = 'Tax must be 0 or greater.';",'optional-price tax validation')

# ---------------------------------------------------------------------------
# App smart defaults apply only to trade documents; receipts remain neutral.
# ---------------------------------------------------------------------------
append_after('src/app/App.tsx',"import { isLetterDocument } from '../lib/document-extras.js';","\nimport { documentUsesCommercialDefaults } from '../lib/document-kinds.js';",'App document semantics import')
replace(
    'src/app/App.tsx',
    "const paymentTerms=smart.paymentTerms||base.terms.paymentTerms;let doc={...base,currency:smart.currency||base.currency,language:smart.language||base.language,terms:{...base.terms,incoterm:smart.incoterm,paymentTerms,deliveryTime:smart.deliveryTime},appearance:",
    "const paymentTerms=smart.paymentTerms||base.terms.paymentTerms;const usesCommercialDefaults=documentUsesCommercialDefaults(kind);let doc={...base,currency:smart.currency||base.currency,language:smart.language||base.language,terms:usesCommercialDefaults?{...base.terms,incoterm:smart.incoterm,paymentTerms,deliveryTime:smart.deliveryTime}:base.terms,appearance:",
    'reserve document trade defaults'
)
replace(
    'src/app/App.tsx',
    "const prepared=applyCustomerCommercialDefaults({...doc,customerSnapshot:customerSnapshotFrom(customer)},customer,this.requireVault().company);",
    "const customerDoc={...doc,customerSnapshot:customerSnapshotFrom(customer)};const prepared=documentUsesCommercialDefaults(kind)?applyCustomerCommercialDefaults(customerDoc,customer,this.requireVault().company):customerDoc;",
    'customer trade defaults guard'
)
replace(
    'src/app/App.tsx',
    "const updatesSmartDefaults=!auto&&updated.kind!=='draft';const templateDefault=updated.kind==='proforma'?{quoteTemplateId:updated.appearance.templateId}:updated.kind==='invoice'?{invoiceTemplateId:updated.appearance.templateId}:{};",
    "const updatesSmartDefaults=!auto&&documentUsesCommercialDefaults(updated.kind);const templateDefault=(updated.kind==='proforma'||updated.kind==='proforma-invoice'||updated.kind==='rfq')?{quoteTemplateId:updated.appearance.templateId}:updated.kind==='invoice'?{invoiceTemplateId:updated.appearance.templateId}:{};",
    'save smart defaults policy'
)
replace(
    'src/app/App.tsx',
    "if(!auto)this.showToast(updated.kind==='draft'?t('Company draft saved.','تم حفظ مسودة الشركة.'):t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'),'success');",
    "if(!auto)this.showToast(updated.kind==='draft'?t('Company draft saved.','تم حفظ مسودة الشركة.'):updatesSmartDefaults?t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'):t('Document saved.','تم حفظ المستند.'),'success');",
    'save toast policy'
)

# ---------------------------------------------------------------------------
# Editor: correct date semantics and optional-price behavior.
# ---------------------------------------------------------------------------
replace(
    'src/components/EditorPageCore.tsx',
    "import { documentBankAllowed, documentKindLabel, documentPriceOptional, isSupplierDocumentKind } from '../lib/document-kinds.js';",
    "import { documentBankAllowed, documentKindLabel, documentPriceOptional, documentSecondaryDateKind, documentUsesCommercialDefaults, isSupplierDocumentKind } from '../lib/document-kinds.js';",
    'editor semantics imports'
)
replace(
    'src/components/EditorPageCore.tsx',
    "    if(d.kind==='proforma'||d.kind==='proforma-invoice'||d.kind==='rfq'){\n      if(!isIsoDate(value))return next;\n      const validityDays=daysBetweenIso(d.issueDate,d.dueDate)??normalizeValidityDays(this.props.company.defaultValidityDays);\n      return {...next,dueDate:addDaysIso(value,validityDays)};\n    }",
    "    if(d.kind==='proforma'||d.kind==='proforma-invoice'){\n      if(!isIsoDate(value))return next;\n      const validityDays=daysBetweenIso(d.issueDate,d.dueDate)??normalizeValidityDays(this.props.company.defaultValidityDays);\n      return {...next,dueDate:addDaysIso(value,validityDays)};\n    }\n    if(d.kind==='rfq'){\n      if(!isIsoDate(value)||!d.dueDate)return next;\n      const responseDays=daysBetweenIso(d.issueDate,d.dueDate);\n      return {...next,dueDate:addDaysIso(value,responseDays)};\n    }",
    'RFQ response date handling'
)
replace(
    'src/components/EditorPageCore.tsx',
    "private selectCustomer=(c:Customer)=>{this.mutate(d=>applyCustomerCommercialDefaults({...d,customerSnapshot:customerSnapshotFrom(c)},c,this.props.company));",
    "private selectCustomer=(c:Customer)=>{this.mutate(d=>{const withCustomer={...d,customerSnapshot:customerSnapshotFrom(c)};return documentUsesCommercialDefaults(d.kind)?applyCustomerCommercialDefaults(withCustomer,c,this.props.company):withCustomer;});",
    'customer defaults in editor'
)
replace(
    'src/components/EditorPageCore.tsx',
    "private setCurrentTemplateDefault=()=>{const templateId=this.state.doc.appearance.templateId;const smart=this.state.doc.kind==='proforma'?{...this.props.smartDefaults,quoteTemplateId:templateId}:{...this.props.smartDefaults,invoiceTemplateId:templateId};void this.saveTemplateDefaults(smart);};",
    "private setCurrentTemplateDefault=()=>{const templateId=this.state.doc.appearance.templateId;const kind=this.state.doc.kind;if(kind!=='invoice'&&kind!=='proforma'&&kind!=='proforma-invoice'&&kind!=='rfq')return;const smart=(kind==='proforma'||kind==='proforma-invoice'||kind==='rfq')?{...this.props.smartDefaults,quoteTemplateId:templateId}:{...this.props.smartDefaults,invoiceTemplateId:templateId};void this.saveTemplateDefaults(smart);};",
    'template default policy'
)
replace(
    'src/components/EditorPageCore.tsx',
    "    const priceOptional=documentPriceOptional(d.kind);\n    const error=",
    "    const priceOptional=documentPriceOptional(d.kind);\n    const secondaryDateKind=documentSecondaryDateKind(d.kind,d.role);\n    const secondaryDateLabel=secondaryDateKind==='response-due'?t('Response Due','آخر موعد لاستلام العرض'):secondaryDateKind==='valid-until'?t('Valid Until','صالح حتى'):secondaryDateKind==='requested-delivery'?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق');\n    const secondaryDateRequired=secondaryDateKind==='valid-until'||secondaryDateKind==='requested-delivery';\n    const error=",
    'editor secondary date state'
)
old_date="<Field label={d.kind==='rfq'?t('Response Due','آخر موعد لاستلام العرض'):(d.kind==='proforma'||d.kind==='proforma-invoice')?t('Valid Until','صالح حتى'):isPurchaseOrder?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق')} className={d.kind==='proforma'||d.kind==='proforma-invoice'||isPurchaseOrder?'required-field':''} error={error('dueDate')}><EditorDateInput label={d.kind==='rfq'?t('Response Due','آخر موعد لاستلام العرض'):(d.kind==='proforma'||d.kind==='proforma-invoice')?t('Valid Until','صالح حتى'):isPurchaseOrder?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق')} value={d.dueDate} onChange={value=>this.field('dueDate',value)}/></Field>"
new_date="{secondaryDateKind!=='none'?<Field label={secondaryDateLabel} className={secondaryDateRequired?'required-field':''} error={error('dueDate')}><EditorDateInput label={secondaryDateLabel} value={d.dueDate} onChange={value=>this.field('dueDate',value)}/></Field>:null}"
replace('src/components/EditorPageCore.tsx',old_date,new_date,'editor date field')
replace('src/components/EditorPageCore.tsx',"const zeroPrice=i.unitPrice.trim()!==''&&isDecimalInput(i.unitPrice)&&decimalToScaled(i.unitPrice)===0n;","const zeroPrice=!priceOptional&&i.unitPrice.trim()!==''&&isDecimalInput(i.unitPrice)&&decimalToScaled(i.unitPrice)===0n;",'zero price guard')
replace('src/components/EditorPageCore.tsx',"<span className=\"item-line-total\">{formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</span>","<span className=\"item-line-total\">{priceOptional?'—':formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</span>",'item header total')
old_price="<Field label={isPurchaseOrder?t(`Unit Cost (${d.currency})`,`تكلفة الوحدة (${d.currency})`):t(`Unit Price (${d.currency})`,`سعر الوحدة (${d.currency})`)} className=\"required-field\" error={error(`item-${index}-price`)}>"
new_price="<Field label={isPurchaseOrder?t(`Unit Cost (${d.currency})`,`تكلفة الوحدة (${d.currency})`):priceOptional?t(`Unit Price (${d.currency}) — optional`,`سعر الوحدة (${d.currency}) — اختياري`):t(`Unit Price (${d.currency})`,`سعر الوحدة (${d.currency})`)} className={priceOptional?'':'required-field'} error={error(`item-${index}-price`)}>"
replace('src/components/EditorPageCore.tsx',old_price,new_price,'optional unit price field')
replace('src/components/EditorPageCore.tsx',"{suggestedPrice&&suggestedPrice!==i.unitPrice?<button type=\"button\" className=\"pricing-suggestion-chip\"","{!priceOptional&&suggestedPrice&&suggestedPrice!==i.unitPrice?<button type=\"button\" className=\"pricing-suggestion-chip\"",'price suggestion guard')
replace('src/components/EditorPageCore.tsx',"<footer><span>{t('Line Total','إجمالي السطر')}</span><strong>{formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</strong></footer>","<footer><span>{t('Line Total','إجمالي السطر')}</span><strong>{priceOptional?'—':formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</strong></footer>",'item footer total')

# Hide the entire Totals editor section when the document is intentionally non-priced.
p=Path('src/components/EditorPageCore.tsx'); s=p.read_text()
start="        <section className={`editor-section ${sectionHasError('discount','shipping','otherCharges','tax')?'section-has-error':''}`}><div className=\"section-heading\"><span>04</span><h2>{t('Totals','الإجماليات')}</h2></div>"
next_section="\n\n        <section className=\"editor-section\"><div className=\"section-heading\"><span>05</span><h2>{t('Commercial Terms','الشروط التجارية')}</h2></div>"
if "        {!priceOptional?<section className={`editor-section ${sectionHasError('discount'" not in s:
    a=s.find(start); b=s.find(next_section,a)
    if a<0 or b<0: raise SystemExit('src/components/EditorPageCore.tsx: totals boundaries missing')
    block=s[a:b]
    s=s[:a]+"        {!priceOptional?"+block[len('        '):]+":null}"+s[b:]
p.write_text(s)

# ---------------------------------------------------------------------------
# PDF / preview and quality calculations must follow the same semantic rules.
# ---------------------------------------------------------------------------
replace(
    'src/templates/TemplateRenderer.tsx',
    "import { documentBankAllowed, documentKindTitle, documentPriceOptional, isSupplierDocumentKind } from '../lib/document-kinds.js';",
    "import { documentBankAllowed, documentKindTitle, documentPriceOptional, documentSecondaryDateKind, documentUsesCommercialDefaults, isSupplierDocumentKind } from '../lib/document-kinds.js';",
    'renderer semantic imports'
)
p=Path('src/templates/TemplateRenderer.tsx'); s=p.read_text()
old="function MetaBlock({ document: doc }: { document: LourexDocument }): any {\n  const currency=documentCurrency(doc);\n  return <div className=\"doc-meta\">"
new="function MetaBlock({ document: doc }: { document: LourexDocument }): any {\n  const currency=documentCurrency(doc);\n  const secondary=documentSecondaryDateKind(doc.kind,doc.role);\n  const dateEn=secondary==='response-due'?'Response Due':secondary==='valid-until'?'Valid Until':secondary==='requested-delivery'?'Requested Delivery':'Due Date';\n  const dateAr=secondary==='response-due'?'آخر موعد لاستلام العرض':secondary==='valid-until'?'صالح حتى':secondary==='requested-delivery'?'التسليم المطلوب':'تاريخ الاستحقاق';\n  return <div className=\"doc-meta\">"
if new not in s:
    if old not in s: raise SystemExit('src/templates/TemplateRenderer.tsx: MetaBlock header missing')
    s=s.replace(old,new,1)
old_due="{doc.dueDate ? <div className=\"meta-due\"><b>{localized(doc, doc.kind==='rfq' ? 'Response Due' : (doc.kind === 'proforma'||doc.kind==='proforma-invoice') ? 'Valid Until' : doc.kind==='purchase-order' ? 'Requested Delivery' : 'Due Date', doc.kind==='rfq' ? 'آخر موعد لاستلام العرض' : (doc.kind === 'proforma'||doc.kind==='proforma-invoice') ? 'صالح حتى' : doc.kind==='purchase-order' ? 'التسليم المطلوب' : 'تاريخ الاستحقاق')}</b><span>{displayDate(doc.dueDate, doc.language)}</span></div> : null}"
new_due="{doc.dueDate&&secondary!=='none'?<div className=\"meta-due\"><b>{localized(doc,dateEn,dateAr)}</b><span>{displayDate(doc.dueDate, doc.language)}</span></div>:null}"
if new_due not in s:
    if old_due not in s: raise SystemExit('src/templates/TemplateRenderer.tsx: MetaBlock due field missing')
    s=s.replace(old_due,new_due,1)
p.write_text(s)
replace('src/templates/TemplateRenderer.tsx',"function Terms({ document: doc }: { document: LourexDocument }): any {\n  const t = doc.terms;","function Terms({ document: doc }: { document: LourexDocument }): any {\n  if(!documentUsesCommercialDefaults(doc.kind))return null;\n  const t = doc.terms;",'renderer commercial terms guard')
replace('src/templates/TemplateRenderer.tsx',"function displayedClosingValues(doc:LourexDocument):string[]{\n  const t=doc.terms;","function displayedClosingValues(doc:LourexDocument):string[]{\n  if(!documentUsesCommercialDefaults(doc.kind))return[];\n  const t=doc.terms;",'renderer closing values guard')
replace('src/templates/TemplateRenderer.tsx',"  const adjustments = [doc.adjustments.discountEnabled, doc.adjustments.shippingEnabled, doc.adjustments.otherChargesEnabled, doc.adjustments.taxEnabled].filter(Boolean).length;","  const adjustments = documentPriceOptional(doc.kind)?0:[doc.adjustments.discountEnabled, doc.adjustments.shippingEnabled, doc.adjustments.otherChargesEnabled, doc.adjustments.taxEnabled].filter(Boolean).length;",'renderer adjustment pressure')

replace(
    'src/lib/document-quality.ts',
    "import { documentBankAllowed, documentPriceOptional } from './document-kinds.js';",
    "import { documentBankAllowed, documentPriceOptional, documentUsesCommercialDefaults } from './document-kinds.js';",
    'quality semantics import'
)
replace('src/lib/document-quality.ts',"function displayedClosingValues(doc:LourexDocument):string[]{\n  const t=doc.terms;","function displayedClosingValues(doc:LourexDocument):string[]{\n  if(!documentUsesCommercialDefaults(doc.kind))return[];\n  const t=doc.terms;",'quality closing values guard')
replace('src/lib/document-quality.ts',"  const adjustments=[doc.adjustments.discountEnabled,doc.adjustments.shippingEnabled,doc.adjustments.otherChargesEnabled,doc.adjustments.taxEnabled].filter(Boolean).length;","  const adjustments=documentPriceOptional(doc.kind)?0:[doc.adjustments.discountEnabled,doc.adjustments.shippingEnabled,doc.adjustments.otherChargesEnabled,doc.adjustments.taxEnabled].filter(Boolean).length;",'quality adjustment pressure')

# Lifecycle language: only invoices mention payments/credits.
replace('src/components/DocumentLifecyclePanel.tsx',"const status=voided?((doc.kind==='proforma'||doc.kind==='purchase-order')?t('Cancelled','ملغى'):t('Voided','ملغى')):","const status=voided?((doc.kind==='proforma'||doc.kind==='proforma-invoice'||doc.kind==='rfq'||doc.kind==='purchase-order')?t('Cancelled','ملغى'):t('Voided','ملغى')):",'lifecycle cancelled kinds')
replace(
    'src/components/DocumentLifecyclePanel.tsx',
    "<p>{doc.kind==='purchase-order'?t('Issued purchase orders are preserved. Revisions and cancellations stay traceable.','طلبات الشراء الصادرة محفوظة، وتبقى المراجعات والإلغاءات قابلة للتتبع.'):t('Issued versions are preserved. Revisions, voids, credits and payments stay traceable.','النسخ الصادرة محفوظة، وتبقى المراجعات والإلغاءات والإشعارات الدائنة والمدفوعات قابلة للتتبع.')}</p>",
    "<p>{doc.kind==='invoice'?t('Issued versions are preserved. Revisions, voids, credits and payments stay traceable.','النسخ الصادرة محفوظة، وتبقى المراجعات والإلغاءات والإشعارات الدائنة والمدفوعات قابلة للتتبع.'):doc.kind==='purchase-order'?t('Issued purchase orders are preserved. Revisions and cancellations stay traceable.','طلبات الشراء الصادرة محفوظة، وتبقى المراجعات والإلغاءات قابلة للتتبع.'):t('Issued versions are preserved. Revisions and cancellations stay traceable.','النسخ الصادرة محفوظة، وتبقى المراجعات والإلغاءات قابلة للتتبع.')}</p>",
    'lifecycle explanatory text'
)

# Add targeted Arabic validation translations when absent.
p=Path('src/lib/i18n.ts'); s=p.read_text()
translations={
"    'Requested delivery date is required.':'تاريخ التسليم المطلوب مطلوب.',\n":"    'Requested delivery date is required.':'تاريخ التسليم المطلوب مطلوب.',\n",
"    'Response due date is invalid.':'آخر موعد لاستلام العرض غير صالح.',\n":"    'Response due date is invalid.':'آخر موعد لاستلام العرض غير صالح.',\n",
"    'Response due date cannot be before issue date.':'لا يمكن أن يكون آخر موعد لاستلام العرض قبل تاريخ الإصدار.',\n":"    'Response due date cannot be before issue date.':'لا يمكن أن يكون آخر موعد لاستلام العرض قبل تاريخ الإصدار.',\n",
}
if "'Response due date is invalid.'" not in s:
    anchor="    'Due date cannot be before issue date.':'لا يمكن أن يكون تاريخ الاستحقاق قبل تاريخ الإصدار.',\n"
    if anchor in s:
        s=s.replace(anchor,anchor+"    'Requested delivery date is required.':'تاريخ التسليم المطلوب مطلوب.',\n    'Requested delivery date is invalid.':'تاريخ التسليم المطلوب غير صالح.',\n    'Requested delivery cannot be before order date.':'لا يمكن أن يكون التسليم المطلوب قبل تاريخ الطلب.',\n    'Response due date is invalid.':'آخر موعد لاستلام العرض غير صالح.',\n    'Response due date cannot be before issue date.':'لا يمكن أن يكون آخر موعد لاستلام العرض قبل تاريخ الإصدار.',\n",1)
if "'Select a supplier.'" not in s:
    anchor="    'Select a customer.':'اختر عميلاً.',\n"
    if anchor in s:s=s.replace(anchor,anchor+"    'Select a supplier.':'اختر موردًا.',\n",1)
p.write_text(s)

# Regression coverage for the exact pre-merge findings.
p=Path('tests/v312-business-document-suite.test.mjs'); tests=p.read_text()
if "v312 final closeout separates numbering and semantic policies" not in tests:
    tests += r'''

test('v312 final closeout separates numbering and semantic policies',async()=>{
  const [defaults,vault,kinds,docs,app,core,renderer,lifecycle]=await Promise.all([
    read('src/lib/defaults.ts'),read('src/storage/vault.ts'),read('src/lib/document-kinds.ts'),read('src/lib/documents.ts'),
    read('src/app/App.tsx'),read('src/components/EditorPageCore.tsx'),read('src/templates/TemplateRenderer.tsx'),read('src/components/DocumentLifecyclePanel.tsx')
  ]);
  assert.ok(defaults.includes('APP_SCHEMA_VERSION = 14'));
  assert.ok(defaults.includes("proformaPrefix: 'QUO'"));
  assert.ok(vault.includes("sourceVersion<14&&migrated.appSettings.numbering.proformaPrefix==='PI'"));
  assert.ok(kinds.includes('documentSecondaryDateKind'));
  assert.ok(kinds.includes('documentUsesCommercialDefaults'));
  assert.ok(docs.includes('liveAuxiliaryReservations'));
  assert.ok(docs.includes("fallbackPrefix=isProforma?'QUO'"));
  assert.ok(docs.includes('Response due date is invalid.'));
  assert.ok(app.includes('documentUsesCommercialDefaults(updated.kind)'));
  assert.ok(core.includes('secondaryDateKind'));
  assert.ok(core.includes("className={priceOptional?'':'required-field'}"));
  assert.ok(core.includes('{!priceOptional?<section'));
  assert.ok(renderer.includes("secondary!=='none'"));
  assert.ok(renderer.includes('documentUsesCommercialDefaults(doc.kind)'));
  assert.ok(lifecycle.includes('Revisions and cancellations stay traceable.'));
});
'''
    p.write_text(tests)

print('v312 final closeout patch applied')

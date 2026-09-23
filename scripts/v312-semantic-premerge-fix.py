from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace(path, old, new, *, all=False, required=True):
    text=read(path)
    if new in text and old not in text:
        return
    if old not in text:
        if required:
            raise SystemExit(f'{path}: missing expected fragment: {old[:120]!r}')
        return
    write(path,text.replace(old,new) if all else text.replace(old,new,1))


def append_after(path, marker, addition):
    text=read(path)
    if addition.strip() in text:
        return
    if marker not in text:
        raise SystemExit(f'{path}: missing marker')
    write(path,text.replace(marker,marker+addition,1))


# ---- central document semantics ------------------------------------------------
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
    "export function documentUsesCommercialDefaults(kind:DocumentKind):boolean{return kind!=='draft'&&kind!=='payment-receipt';}\n"
)

# ---- document creation, validation and same-runtime numbering ------------------
replace(
    'src/lib/documents.ts',
    "import { documentBankAllowed, documentNumberPrefix, documentPriceOptional, isSupplierDocumentKind } from './document-kinds.js';",
    "import { documentBankAllowed, documentNumberPrefix, documentPriceOptional, documentSecondaryDateKind, documentUsesCommercialDefaults, isSupplierDocumentKind } from './document-kinds.js';"
)
append_after(
    'src/lib/documents.ts',
    "const liveNumberReservations=new WeakMap<object,NumberReservation>();",
    "\nconst liveAuxiliaryReservations=new WeakMap<object,{year:number;values:Record<string,number>}>();"
)
replace(
    'src/lib/documents.ts',
    "    seq=vault.documents.reduce((max,document)=>{const match=document.number.trim().match(matchPattern);return match?Math.max(max,Number(match[1])||0):max;},0);\n"
    "    let number='';\n"
    "    do{seq+=1;number=`${prefix}-${year}-${String(seq).padStart(4,'0')}`;}while(used.has(number.toLowerCase()));\n"
    "    return {number,vault};",
    "    const scanned=vault.documents.reduce((max,document)=>{const match=document.number.trim().match(matchPattern);return match?Math.max(max,Number(match[1])||0):max;},0);\n"
    "    const auxiliaryLive=liveAuxiliaryReservations.get(sourceNumbering);\n"
    "    const reserved=auxiliaryLive?.year===year?(auxiliaryLive.values[kind]??0):0;\n"
    "    seq=Math.max(scanned,reserved);\n"
    "    let number='';\n"
    "    do{seq+=1;number=`${prefix}-${year}-${String(seq).padStart(4,'0')}`;}while(used.has(number.toLowerCase()));\n"
    "    const values=auxiliaryLive?.year===year?{...auxiliaryLive.values}:{};\n"
    "    values[kind]=seq;liveAuxiliaryReservations.set(sourceNumbering,{year,values});\n"
    "    return {number,vault};"
)
replace(
    'src/lib/documents.ts',
    "  const taxPreset=defaultTaxPreset(company);\n  return {",
    "  const taxPreset=defaultTaxPreset(company);\n  const usesCommercialDefaults=documentUsesCommercialDefaults(kind);\n  return {"
)
replace(
    'src/lib/documents.ts',
    "    terms: { incoterm: company.defaultIncoterm, paymentTerms: paymentPreset?.label||company.defaultPaymentTerms, packing: '', deliveryTime: company.defaultDeliveryTime, portOfLoading: '', finalDestination: '', countryOfOrigin: '', validity: '', remarks: '' },",
    "    terms: { incoterm: usesCommercialDefaults?company.defaultIncoterm:'', paymentTerms: usesCommercialDefaults?(paymentPreset?.label||company.defaultPaymentTerms):'', packing: '', deliveryTime: usesCommercialDefaults?company.defaultDeliveryTime:'', portOfLoading: '', finalDestination: '', countryOfOrigin: '', validity: '', remarks: '' },"
)
replace(
    'src/lib/documents.ts',
    "    adjustments: { discountEnabled: false, discountMode: 'fixed', discountValue: '0.00', shippingEnabled: false, shipping: '0.00', otherChargesEnabled: false, otherCharges: '0.00', taxEnabled: Boolean(taxPreset), taxPercent: taxPreset?.rate||'0' },",
    "    adjustments: { discountEnabled: false, discountMode: 'fixed', discountValue: '0.00', shippingEnabled: false, shipping: '0.00', otherChargesEnabled: false, otherCharges: '0.00', taxEnabled: !documentPriceOptional(kind)&&Boolean(taxPreset), taxPercent: taxPreset?.rate||'0' },"
)
replace(
    'src/lib/documents.ts',
    "  if ((doc.kind === 'proforma' || doc.kind === 'proforma-invoice') && !doc.dueDate) errors.dueDate = 'Valid until date is required.';\n"
    "  if (doc.kind === 'purchase-order' && !doc.dueDate) errors.dueDate = 'Requested delivery date is required.';\n"
    "  if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=(doc.kind==='proforma'||doc.kind==='proforma-invoice'||doc.kind==='rfq')?'Valid until date is invalid.':doc.kind==='purchase-order'?'Requested delivery date is invalid.':'Due date is invalid.';\n"
    "  else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=(doc.kind==='proforma'||doc.kind==='proforma-invoice'||doc.kind==='rfq')?'Valid until date cannot be before issue date.':doc.kind==='purchase-order'?'Requested delivery cannot be before order date.':'Due date cannot be before issue date.';",
    "  const secondaryDate=documentSecondaryDateKind(doc.kind,doc.role);\n"
    "  if(secondaryDate==='valid-until'&&!doc.dueDate)errors.dueDate='Valid until date is required.';\n"
    "  if(secondaryDate==='requested-delivery'&&!doc.dueDate)errors.dueDate='Requested delivery date is required.';\n"
    "  if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=secondaryDate==='valid-until'?'Valid until date is invalid.':secondaryDate==='requested-delivery'?'Requested delivery date is invalid.':secondaryDate==='response-due'?'Response due date is invalid.':'Due date is invalid.';\n"
    "  else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=secondaryDate==='valid-until'?'Valid until date cannot be before issue date.':secondaryDate==='requested-delivery'?'Requested delivery cannot be before order date.':secondaryDate==='response-due'?'Response due date cannot be before issue date.':'Due date cannot be before issue date.';"
)
replace(
    'src/lib/documents.ts',
    "  if (doc.adjustments.discountEnabled) {",
    "  if (!documentPriceOptional(doc.kind)&&doc.adjustments.discountEnabled) {"
)
replace('src/lib/documents.ts', "  if (doc.adjustments.shippingEnabled && !nonNegative(doc.adjustments.shipping)) errors.shipping = 'Shipping must be 0 or greater.';", "  if (!documentPriceOptional(doc.kind)&&doc.adjustments.shippingEnabled && !nonNegative(doc.adjustments.shipping)) errors.shipping = 'Shipping must be 0 or greater.';")
replace('src/lib/documents.ts', "  if (doc.adjustments.otherChargesEnabled && !nonNegative(doc.adjustments.otherCharges)) errors.otherCharges = 'Other charges must be 0 or greater.';", "  if (!documentPriceOptional(doc.kind)&&doc.adjustments.otherChargesEnabled && !nonNegative(doc.adjustments.otherCharges)) errors.otherCharges = 'Other charges must be 0 or greater.';")
replace('src/lib/documents.ts', "  if (doc.adjustments.taxEnabled && !nonNegative(doc.adjustments.taxPercent)) errors.tax = 'Tax must be 0 or greater.';", "  if (!documentPriceOptional(doc.kind)&&doc.adjustments.taxEnabled && !nonNegative(doc.adjustments.taxPercent)) errors.tax = 'Tax must be 0 or greater.';")

# ---- app defaults must not be polluted by receipts -----------------------------
append_after('src/app/App.tsx', "import { isLetterDocument } from '../lib/document-extras.js';", "\nimport { documentUsesCommercialDefaults } from '../lib/document-kinds.js';")
replace(
    'src/app/App.tsx',
    "const paymentTerms=smart.paymentTerms||base.terms.paymentTerms;let doc={...base,currency:smart.currency||base.currency,language:smart.language||base.language,terms:{...base.terms,incoterm:smart.incoterm,paymentTerms,deliveryTime:smart.deliveryTime},appearance:",
    "const paymentTerms=smart.paymentTerms||base.terms.paymentTerms;const usesCommercialDefaults=documentUsesCommercialDefaults(kind);let doc={...base,currency:smart.currency||base.currency,language:smart.language||base.language,terms:usesCommercialDefaults?{...base.terms,incoterm:smart.incoterm,paymentTerms,deliveryTime:smart.deliveryTime}:base.terms,appearance:"
)
replace(
    'src/app/App.tsx',
    "const prepared=applyCustomerCommercialDefaults({...doc,customerSnapshot:customerSnapshotFrom(customer)},customer,this.requireVault().company);",
    "const customerDoc={...doc,customerSnapshot:customerSnapshotFrom(customer)};const prepared=documentUsesCommercialDefaults(kind)?applyCustomerCommercialDefaults(customerDoc,customer,this.requireVault().company):customerDoc;"
)
replace('src/app/App.tsx', "const updatesSmartDefaults=!auto&&updated.kind!=='draft';", "const updatesSmartDefaults=!auto&&documentUsesCommercialDefaults(updated.kind);")
replace('src/app/App.tsx', "const templateDefault=updated.kind==='proforma'?{quoteTemplateId:updated.appearance.templateId}:updated.kind==='invoice'?{invoiceTemplateId:updated.appearance.templateId}:{};", "const templateDefault=(updated.kind==='proforma'||updated.kind==='proforma-invoice'||updated.kind==='rfq')?{quoteTemplateId:updated.appearance.templateId}:updated.kind==='invoice'?{invoiceTemplateId:updated.appearance.templateId}:{};")
replace(
    'src/app/App.tsx',
    "if(!auto)this.showToast(updated.kind==='draft'?t('Company draft saved.','تم حفظ مسودة الشركة.'):t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'),'success');",
    "if(!auto)this.showToast(updated.kind==='draft'?t('Company draft saved.','تم حفظ مسودة الشركة.'):updatesSmartDefaults?t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'):t('Document saved.','تم حفظ المستند.'),'success');"
)

# ---- editor date semantics and non-financial price UI --------------------------
replace(
    'src/components/EditorPageCore.tsx',
    "import { documentBankAllowed, documentKindLabel, documentPriceOptional, isSupplierDocumentKind } from '../lib/document-kinds.js';",
    "import { documentBankAllowed, documentKindLabel, documentPriceOptional, documentSecondaryDateKind, documentUsesCommercialDefaults, isSupplierDocumentKind } from '../lib/document-kinds.js';"
)
replace(
    'src/components/EditorPageCore.tsx',
    "    if(d.kind==='proforma'||d.kind==='proforma-invoice'||d.kind==='rfq'){\n      if(!isIsoDate(value))return next;\n      const validityDays=daysBetweenIso(d.issueDate,d.dueDate)??normalizeValidityDays(this.props.company.defaultValidityDays);\n      return {...next,dueDate:addDaysIso(value,validityDays)};\n    }",
    "    if(d.kind==='proforma'||d.kind==='proforma-invoice'){\n      if(!isIsoDate(value))return next;\n      const validityDays=daysBetweenIso(d.issueDate,d.dueDate)??normalizeValidityDays(this.props.company.defaultValidityDays);\n      return {...next,dueDate:addDaysIso(value,validityDays)};\n    }\n    if(d.kind==='rfq'){\n      if(!isIsoDate(value)||!d.dueDate)return next;\n      const responseDays=daysBetweenIso(d.issueDate,d.dueDate);\n      return responseDays===null?next:{...next,dueDate:addDaysIso(value,responseDays)};\n    }"
)
replace(
    'src/components/EditorPageCore.tsx',
    "  private selectCustomer=(c:Customer)=>{this.mutate(d=>applyCustomerCommercialDefaults({...d,customerSnapshot:customerSnapshotFrom(c)},c,this.props.company));",
    "  private selectCustomer=(c:Customer)=>{this.mutate(d=>{const withCustomer={...d,customerSnapshot:customerSnapshotFrom(c)};return documentUsesCommercialDefaults(d.kind)?applyCustomerCommercialDefaults(withCustomer,c,this.props.company):withCustomer;});"
)
replace(
    'src/components/EditorPageCore.tsx',
    "  private setCurrentTemplateDefault=()=>{const templateId=this.state.doc.appearance.templateId;const smart=this.state.doc.kind==='proforma'?{...this.props.smartDefaults,quoteTemplateId:templateId}:{...this.props.smartDefaults,invoiceTemplateId:templateId};void this.saveTemplateDefaults(smart);};",
    "  private setCurrentTemplateDefault=()=>{const templateId=this.state.doc.appearance.templateId;const kind=this.state.doc.kind;if(kind!=='invoice'&&kind!=='proforma'&&kind!=='proforma-invoice'&&kind!=='rfq')return;const smart=(kind==='proforma'||kind==='proforma-invoice'||kind==='rfq')?{...this.props.smartDefaults,quoteTemplateId:templateId}:{...this.props.smartDefaults,invoiceTemplateId:templateId};void this.saveTemplateDefaults(smart);};"
)
replace(
    'src/components/EditorPageCore.tsx',
    "    const priceOptional=documentPriceOptional(d.kind);\n    const error=",
    "    const priceOptional=documentPriceOptional(d.kind);\n    const secondaryDateKind=documentSecondaryDateKind(d.kind,d.role);\n    const secondaryDateLabel=secondaryDateKind==='response-due'?t('Response Due','آخر موعد لاستلام العرض'):secondaryDateKind==='valid-until'?t('Valid Until','صالح حتى'):secondaryDateKind==='requested-delivery'?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق');\n    const secondaryDateRequired=secondaryDateKind==='valid-until'||secondaryDateKind==='requested-delivery';\n    const error="
)
old_date_field="<Field label={d.kind==='rfq'?t('Response Due','آخر موعد لاستلام العرض'):(d.kind==='proforma'||d.kind==='proforma-invoice')?t('Valid Until','صالح حتى'):isPurchaseOrder?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق')} className={d.kind==='proforma'||d.kind==='proforma-invoice'||isPurchaseOrder?'required-field':''} error={error('dueDate')}><EditorDateInput label={d.kind==='rfq'?t('Response Due','آخر موعد لاستلام العرض'):(d.kind==='proforma'||d.kind==='proforma-invoice')?t('Valid Until','صالح حتى'):isPurchaseOrder?t('Requested Delivery','التسليم المطلوب'):t('Due Date','تاريخ الاستحقاق')} value={d.dueDate} onChange={value=>this.field('dueDate',value)}/></Field>"
new_date_field="{secondaryDateKind!=='none'?<Field label={secondaryDateLabel} className={secondaryDateRequired?'required-field':''} error={error('dueDate')}><EditorDateInput label={secondaryDateLabel} value={d.dueDate} onChange={value=>this.field('dueDate',value)}/></Field>:null}"
replace('src/components/EditorPageCore.tsx',old_date_field,new_date_field)
replace('src/components/EditorPageCore.tsx', "<span className=\"item-line-total\">{formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</span>", "<span className=\"item-line-total\">{priceOptional?'—':formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</span>")
replace('src/components/EditorPageCore.tsx', "className=\"required-field\" error={error(`item-${index}-price`)}><Input inputMode=\"decimal\" enterKeyHint=\"done\" value={i.unitPrice}", "className={priceOptional?'':'required-field'} error={error(`item-${index}-price`)}><Input inputMode=\"decimal\" enterKeyHint=\"done\" value={i.unitPrice}")
replace('src/components/EditorPageCore.tsx', "{suggestedPrice&&suggestedPrice!==i.unitPrice?<button", "{!priceOptional&&suggestedPrice&&suggestedPrice!==i.unitPrice?<button")
replace('src/components/EditorPageCore.tsx', "{zeroPrice?<div className=\"zero-price-warning", "{!priceOptional&&zeroPrice?<div className=\"zero-price-warning")
replace('src/components/EditorPageCore.tsx', "<footer><span>{t('Line Total','إجمالي السطر')}</span><strong>{formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</strong></footer>", "<footer><span>{t('Line Total','إجمالي السطر')}</span><strong>{priceOptional?'—':formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</strong></footer>")

# ---- PDF/live preview must use the same date/terms policies --------------------
replace(
    'src/templates/TemplateRenderer.tsx',
    "import { documentBankAllowed, documentKindTitle, documentPriceOptional, isSupplierDocumentKind } from '../lib/document-kinds.js';",
    "import { documentBankAllowed, documentKindTitle, documentPriceOptional, documentSecondaryDateKind, documentUsesCommercialDefaults, isSupplierDocumentKind } from '../lib/document-kinds.js';"
)
old_meta="function MetaBlock({ document: doc }: { document: LourexDocument }): any {\n  const currency=documentCurrency(doc);\n  return <div className=\"doc-meta\"><div className=\"meta-number\"><b>{localized(doc, 'No.', 'الرقم')}</b><span>{doc.number}</span></div>{doc.revision>1?<div className=\"meta-revision\"><b>{localized(doc,'Revision','المراجعة')}</b><span>R{doc.revision}</span></div>:null}{doc.creditForNumber?<div className=\"meta-source\"><b>{localized(doc,'Source Invoice','الفاتورة الأصلية')}</b><span>{doc.creditForNumber}</span></div>:null}<div className=\"meta-issue\"><b>{localized(doc, doc.kind==='purchase-order'?'Order Date':'Issue Date', doc.kind==='purchase-order'?'تاريخ الطلب':'تاريخ الإصدار')}</b><span>{displayDate(doc.issueDate, doc.language)}</span></div>{doc.dueDate ? <div className=\"meta-due\"><b>{localized(doc, doc.kind==='rfq' ? 'Response Due' : (doc.kind === 'proforma'||doc.kind==='proforma-invoice') ? 'Valid Until' : doc.kind==='purchase-order' ? 'Requested Delivery' : 'Due Date', doc.kind==='rfq' ? 'آخر موعد لاستلام العرض' : (doc.kind === 'proforma'||doc.kind==='proforma-invoice') ? 'صالح حتى' : doc.kind==='purchase-order' ? 'التسليم المطلوب' : 'تاريخ الاستحقاق')}</b><span>{displayDate(doc.dueDate, doc.language)}</span></div> : null}<div className=\"meta-currency\"><b>{localized(doc, 'Currency', 'العملة')}</b><span>{currency}</span></div></div>;\n}"
new_meta="function MetaBlock({ document: doc }: { document: LourexDocument }): any {\n  const currency=documentCurrency(doc);\n  const secondary=documentSecondaryDateKind(doc.kind,doc.role);\n  const dateEn=secondary==='response-due'?'Response Due':secondary==='valid-until'?'Valid Until':secondary==='requested-delivery'?'Requested Delivery':'Due Date';\n  const dateAr=secondary==='response-due'?'آخر موعد لاستلام العرض':secondary==='valid-until'?'صالح حتى':secondary==='requested-delivery'?'التسليم المطلوب':'تاريخ الاستحقاق';\n  return <div className=\"doc-meta\"><div className=\"meta-number\"><b>{localized(doc, 'No.', 'الرقم')}</b><span>{doc.number}</span></div>{doc.revision>1?<div className=\"meta-revision\"><b>{localized(doc,'Revision','المراجعة')}</b><span>R{doc.revision}</span></div>:null}{doc.creditForNumber?<div className=\"meta-source\"><b>{localized(doc,'Source Invoice','الفاتورة الأصلية')}</b><span>{doc.creditForNumber}</span></div>:null}<div className=\"meta-issue\"><b>{localized(doc, doc.kind==='purchase-order'?'Order Date':'Issue Date', doc.kind==='purchase-order'?'تاريخ الطلب':'تاريخ الإصدار')}</b><span>{displayDate(doc.issueDate, doc.language)}</span></div>{doc.dueDate&&secondary!=='none'?<div className=\"meta-due\"><b>{localized(doc,dateEn,dateAr)}</b><span>{displayDate(doc.dueDate, doc.language)}</span></div>:null}<div className=\"meta-currency\"><b>{localized(doc, 'Currency', 'العملة')}</b><span>{currency}</span></div></div>;\n}"
replace('src/templates/TemplateRenderer.tsx',old_meta,new_meta)
replace('src/templates/TemplateRenderer.tsx', "function Terms({ document: doc }: { document: LourexDocument }): any {\n  const t = doc.terms;", "function Terms({ document: doc }: { document: LourexDocument }): any {\n  if(!documentUsesCommercialDefaults(doc.kind))return null;\n  const t = doc.terms;")
replace('src/templates/TemplateRenderer.tsx', "function displayedClosingValues(doc:LourexDocument):string[]{\n  const t=doc.terms;", "function displayedClosingValues(doc:LourexDocument):string[]{\n  if(!documentUsesCommercialDefaults(doc.kind))return[];\n  const t=doc.terms;")
replace('src/templates/TemplateRenderer.tsx', "  const adjustments = [doc.adjustments.discountEnabled, doc.adjustments.shippingEnabled, doc.adjustments.otherChargesEnabled, doc.adjustments.taxEnabled].filter(Boolean).length;", "  const adjustments = documentPriceOptional(doc.kind)?0:[doc.adjustments.discountEnabled, doc.adjustments.shippingEnabled, doc.adjustments.otherChargesEnabled, doc.adjustments.taxEnabled].filter(Boolean).length;")
replace('src/templates/TemplateRenderer.tsx', "{doc.lifecycleStatus==='voided'?<div className=\"document-void-watermark\">{(doc.kind==='proforma'||doc.kind==='purchase-order')?localized(doc,'CANCELLED','ملغى'):localized(doc,'VOID','ملغى')}</div>:null}", "{doc.lifecycleStatus==='voided'?<div className=\"document-void-watermark\">{(doc.kind==='proforma'||doc.kind==='proforma-invoice'||doc.kind==='rfq'||doc.kind==='purchase-order')?localized(doc,'CANCELLED','ملغى'):localized(doc,'VOID','ملغى')}</div>:null}")

# ---- pagination/quality and lifecycle language ---------------------------------
replace(
    'src/lib/document-quality.ts',
    "import { documentBankAllowed, documentPriceOptional } from './document-kinds.js';",
    "import { documentBankAllowed, documentPriceOptional, documentUsesCommercialDefaults } from './document-kinds.js';"
)
replace('src/lib/document-quality.ts', "function displayedClosingValues(doc:LourexDocument):string[]{\n  const t=doc.terms;", "function displayedClosingValues(doc:LourexDocument):string[]{\n  if(!documentUsesCommercialDefaults(doc.kind))return[];\n  const t=doc.terms;")
replace('src/lib/document-quality.ts', "  const adjustments=[doc.adjustments.discountEnabled,doc.adjustments.shippingEnabled,doc.adjustments.otherChargesEnabled,doc.adjustments.taxEnabled].filter(Boolean).length;", "  const adjustments=documentPriceOptional(doc.kind)?0:[doc.adjustments.discountEnabled,doc.adjustments.shippingEnabled,doc.adjustments.otherChargesEnabled,doc.adjustments.taxEnabled].filter(Boolean).length;")
replace('src/components/DocumentLifecyclePanel.tsx', "const status=voided?((doc.kind==='proforma'||doc.kind==='purchase-order')?t('Cancelled','ملغى'):t('Voided','ملغى')):", "const status=voided?((doc.kind==='proforma'||doc.kind==='proforma-invoice'||doc.kind==='rfq'||doc.kind==='purchase-order')?t('Cancelled','ملغى'):t('Voided','ملغى')):")
replace(
    'src/components/DocumentLifecyclePanel.tsx',
    "<p>{doc.kind==='purchase-order'?t('Issued purchase orders are preserved. Revisions and cancellations stay traceable.','طلبات الشراء الصادرة محفوظة، وتبقى المراجعات والإلغاءات قابلة للتتبع.'):t('Issued versions are preserved. Revisions, voids, credits and payments stay traceable.','النسخ الصادرة محفوظة، وتبقى المراجعات والإلغاءات والإشعارات الدائنة والمدفوعات قابلة للتتبع.')}</p>",
    "<p>{doc.kind==='invoice'?t('Issued versions are preserved. Revisions, voids, credits and payments stay traceable.','النسخ الصادرة محفوظة، وتبقى المراجعات والإلغاءات والإشعارات الدائنة والمدفوعات قابلة للتتبع.'):doc.kind==='purchase-order'?t('Issued purchase orders are preserved. Revisions and cancellations stay traceable.','طلبات الشراء الصادرة محفوظة، وتبقى المراجعات والإلغاءات قابلة للتتبع.'):t('Issued versions are preserved. Revisions and cancellations stay traceable.','النسخ الصادرة محفوظة، وتبقى المراجعات والإلغاءات قابلة للتتبع.')}</p>"
)

# Arabic validation copy for new semantics.
append_after('src/lib/i18n.ts', "    'Due date cannot be before issue date.':'لا يمكن أن يكون تاريخ الاستحقاق قبل تاريخ الإصدار.',", "\n    'Requested delivery date is required.':'تاريخ التسليم المطلوب مطلوب.',\n    'Requested delivery date is invalid.':'تاريخ التسليم المطلوب غير صالح.',\n    'Requested delivery cannot be before order date.':'لا يمكن أن يكون التسليم المطلوب قبل تاريخ الطلب.',\n    'Response due date is invalid.':'آخر موعد لاستلام العرض غير صالح.',\n    'Response due date cannot be before issue date.':'لا يمكن أن يكون آخر موعد لاستلام العرض قبل تاريخ الإصدار.',")
append_after('src/lib/i18n.ts', "    'Select a customer.':'اختر عميلاً.',", "\n    'Select a supplier.':'اختر موردًا.',")

# Regression assertions for the exact gaps found in the audit.
p=Path('tests/v312-business-document-suite.test.mjs')
tests=p.read_text()
if "v312 final semantic audit protects dates, defaults and numbering" not in tests:
    tests += r'''

test('v312 final semantic audit protects dates, defaults and numbering',async()=>{
  const [kinds,docs,core,renderer,app,lifecycle]=await Promise.all([
    read('src/lib/document-kinds.ts'),read('src/lib/documents.ts'),read('src/components/EditorPageCore.tsx'),
    read('src/templates/TemplateRenderer.tsx'),read('src/app/App.tsx'),read('src/components/DocumentLifecyclePanel.tsx')
  ]);
  assert.match(kinds,/documentSecondaryDateKind/);
  assert.match(kinds,/documentUsesCommercialDefaults/);
  assert.match(docs,/liveAuxiliaryReservations/);
  assert.match(docs,/Response due date is invalid/);
  assert.match(core,/secondaryDateKind/);
  assert.match(core,/priceOptional\?'—':formatMoney\(lineTotal/);
  assert.match(renderer,/secondary!=='none'/);
  assert.match(renderer,/documentUsesCommercialDefaults\(doc\.kind\)/);
  assert.match(app,/documentUsesCommercialDefaults\(kind\)/);
  assert.match(app,/documentUsesCommercialDefaults\(updated\.kind\)/);
  assert.match(lifecycle,/Revisions and cancellations stay traceable/);
});
'''
    p.write_text(tests)

# Guard against accidental temp artifacts being included in the application patch.
for path in ['src/lib/document-kinds.ts','src/lib/documents.ts','src/components/EditorPageCore.tsx','src/templates/TemplateRenderer.tsx']:
    if not Path(path).read_text().strip():
        raise SystemExit(f'{path}: unexpectedly empty')
print('v312 semantic pre-merge fixes applied')

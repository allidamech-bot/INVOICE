from pathlib import Path


def replace(path, old, new, label):
    p=Path(path); s=p.read_text()
    if new in s:
        return
    if old not in s:
        raise SystemExit(f"{path}: missing {label}")
    p.write_text(s.replace(old,new,1))

# v14 formally separates Quotation numbering from Proforma Invoice numbering.
replace('src/lib/defaults.ts',
"// v13 adds optional watermarks and encrypted free-form company Draft documents.\nexport const APP_SCHEMA_VERSION = 13;",
"// v13 adds optional watermarks and encrypted free-form company Draft documents.\n// v14 separates Quotation (QUO) numbering from Proforma Invoice (PI) and adds the v312 document suite.\nexport const APP_SCHEMA_VERSION = 14;",
'schema v14')
replace('src/lib/defaults.ts',
"numbering: { proformaPrefix: 'PI', invoicePrefix: 'INV'",
"numbering: { proformaPrefix: 'QUO', invoicePrefix: 'INV'",
'default quotation prefix')

p=Path('src/storage/vault.ts'); s=p.read_text()
marker="\n\n  migrated.customers = Array.isArray((vault as any).customers)"
insert="\n  // v14 split the legacy PI namespace: PI is now reserved for Proforma Invoice,\n  // while the existing `proforma` kind represents Quotation and uses QUO.\n  if(sourceVersion<14&&migrated.appSettings.numbering.proformaPrefix==='PI')migrated.appSettings.numbering.proformaPrefix='QUO';\n"
if insert.strip() not in s:
    if marker not in s: raise SystemExit('src/storage/vault.ts: migration insertion point missing')
    s=s.replace(marker,insert+marker,1)
p.write_text(s)

replace('src/lib/documents.ts',
"  const fallbackPrefix=isProforma?'PI':isPurchaseOrder?'PO':isDraft?'DR':'INV';",
"  const fallbackPrefix=isProforma?'QUO':isPurchaseOrder?'PO':isDraft?'DR':'INV';",
'quotation fallback prefix')
replace('src/lib/documents.ts',
"id: makeId('doc'), kind, role:'standard', status: 'draft', lifecycleStatus:'active', revision:1, creditForId:'', creditForNumber:'', voidedAt:'', voidReason:'', bankAccountId:company.defaultBankAccountId||'primary', paymentTermPresetId:paymentPreset?.id||'', number, issueDate,",
"id: makeId('doc'), kind, role:'standard', status: 'draft', lifecycleStatus:'active', revision:1, creditForId:'', creditForNumber:'', voidedAt:'', voidReason:'', bankAccountId:company.defaultBankAccountId||'primary', paymentTermPresetId:kind==='payment-receipt'?'':paymentPreset?.id||'', number, issueDate,",
'payment receipt preset isolation')
replace('src/lib/documents.ts',
"terms: { incoterm: company.defaultIncoterm, paymentTerms: paymentPreset?.label||company.defaultPaymentTerms, packing: '', deliveryTime: company.defaultDeliveryTime, portOfLoading: '', finalDestination: '', countryOfOrigin: '', validity: '', remarks: '' },",
"terms: { incoterm: kind==='payment-receipt'?'':company.defaultIncoterm, paymentTerms: kind==='payment-receipt'?'':paymentPreset?.label||company.defaultPaymentTerms, packing: '', deliveryTime: kind==='payment-receipt'?'':company.defaultDeliveryTime, portOfLoading: '', finalDestination: '', countryOfOrigin: '', validity: '', remarks: '' },",
'payment receipt trade-term isolation')
replace('src/lib/documents.ts',
"adjustments: { discountEnabled: false, discountMode: 'fixed', discountValue: '0.00', shippingEnabled: false, shipping: '0.00', otherChargesEnabled: false, otherCharges: '0.00', taxEnabled: Boolean(taxPreset), taxPercent: taxPreset?.rate||'0' },",
"adjustments: documentPriceOptional(kind)?{ discountEnabled:false, discountMode:'fixed', discountValue:'0.00', shippingEnabled:false, shipping:'0.00', otherChargesEnabled:false, otherCharges:'0.00', taxEnabled:false, taxPercent:'0' }:{ discountEnabled: false, discountMode: 'fixed', discountValue: '0.00', shippingEnabled: false, shipping: '0.00', otherChargesEnabled: false, otherCharges: '0.00', taxEnabled: Boolean(taxPreset), taxPercent: taxPreset?.rate||'0' },",
'nonfinancial adjustment defaults')

# Non-commercial outputs must not mutate future trade smart defaults.
p=Path('src/app/App.tsx'); s=p.read_text()
old="const updatesSmartDefaults=!auto&&updated.kind!=='draft';"
new="const updatesSmartDefaults=!auto&&(updated.kind==='rfq'||updated.kind==='proforma'||updated.kind==='proforma-invoice'||updated.kind==='purchase-order'||updated.kind==='invoice');"
if new not in s:
    if old not in s: raise SystemExit('src/app/App.tsx: smart-default predicate missing')
    s=s.replace(old,new,1)
old="if(!auto)this.showToast(updated.kind==='draft'?t('Company draft saved.','تم حفظ مسودة الشركة.'):t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'),'success');"
new="if(!auto)this.showToast(updated.kind==='draft'?t('Company draft saved.','تم حفظ مسودة الشركة.'):updatesSmartDefaults?t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'):t('Document saved.','تم حفظ المستند.'),'success');"
if new not in s:
    if old not in s: raise SystemExit('src/app/App.tsx: save toast missing')
    s=s.replace(old,new,1)
p.write_text(s)

# Optional-price documents should look optional in the editor, not like broken invoices.
p=Path('src/components/EditorPageCore.tsx'); s=p.read_text()
s=s.replace("const zeroPrice=i.unitPrice.trim()!==''&&isDecimalInput(i.unitPrice)&&decimalToScaled(i.unitPrice)===0n;","const zeroPrice=!priceOptional&&i.unitPrice.trim()!==''&&isDecimalInput(i.unitPrice)&&decimalToScaled(i.unitPrice)===0n;")
s=s.replace("<span className=\"item-line-total\">{formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</span>","<span className=\"item-line-total\">{priceOptional?'—':formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</span>")
s=s.replace("{suggestedPrice&&suggestedPrice!==i.unitPrice?<button type=\"button\" className=\"pricing-suggestion-chip\"","{!priceOptional&&suggestedPrice&&suggestedPrice!==i.unitPrice?<button type=\"button\" className=\"pricing-suggestion-chip\"")
old="<Field label={isPurchaseOrder?t(`Unit Cost (${d.currency})`,`تكلفة الوحدة (${d.currency})`):t(`Unit Price (${d.currency})`,`سعر الوحدة (${d.currency})`)} className=\"required-field\" error={error(`item-${index}-price`)}>"
new="<Field label={isPurchaseOrder?t(`Unit Cost (${d.currency})`,`تكلفة الوحدة (${d.currency})`):priceOptional?t(`Unit Price (${d.currency}) — optional`,`سعر الوحدة (${d.currency}) — اختياري`):t(`Unit Price (${d.currency})`,`سعر الوحدة (${d.currency})`)} className={priceOptional?'':'required-field'} error={error(`item-${index}-price`)}>"
if new not in s:
    if old not in s: raise SystemExit('src/components/EditorPageCore.tsx: item price field missing')
    s=s.replace(old,new,1)
s=s.replace("<footer><span>{t('Line Total','إجمالي السطر')}</span><strong>{formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</strong></footer>","<footer><span>{t('Line Total','إجمالي السطر')}</span><strong>{priceOptional?'—':formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</strong></footer>")
start_marker="        <section className={`editor-section ${sectionHasError('discount','shipping','otherCharges','tax')?'section-has-error':''}`}><div className=\"section-heading\"><span>04</span><h2>{t('Totals','الإجماليات')}</h2></div>"
next_marker="\n\n        <section className=\"editor-section\"><div className=\"section-heading\"><span>05</span><h2>{t('Commercial Terms','الشروط التجارية')}</h2></div>"
if "        {!priceOptional?<section className={`editor-section ${sectionHasError('discount'" not in s:
    start=s.find(start_marker)
    if start<0: raise SystemExit('src/components/EditorPageCore.tsx: totals section start missing')
    end=s.find(next_marker,start)
    if end<0: raise SystemExit('src/components/EditorPageCore.tsx: totals section end missing')
    block=s[start:end]
    stripped=block[len('        '):]
    s=s[:start]+"        {!priceOptional?"+stripped+":null}"+s[end:]
p.write_text(s)

# Regression coverage for the domain findings.
p=Path('tests/v312-business-document-suite.test.mjs'); s=p.read_text()
if "v312 separates quotation and proforma invoice numbering" not in s:
    s += """

test('v312 separates quotation and proforma invoice numbering and nonfinancial defaults',async()=>{
  const [defaults,vault,documents,app,editor]=await Promise.all([
    read('src/lib/defaults.ts'),read('src/storage/vault.ts'),read('src/lib/documents.ts'),read('src/app/App.tsx'),read('src/components/EditorPageCore.tsx')
  ]);
  assert.ok(defaults.includes("APP_SCHEMA_VERSION = 14"));
  assert.ok(defaults.includes("proformaPrefix: 'QUO'"));
  assert.ok(vault.includes("sourceVersion<14&&migrated.appSettings.numbering.proformaPrefix==='PI'"));
  assert.ok(documents.includes("fallbackPrefix=isProforma?'QUO'"));
  assert.ok(documents.includes("adjustments: documentPriceOptional(kind)?"));
  assert.ok(app.includes("updated.kind==='rfq'||updated.kind==='proforma'||updated.kind==='proforma-invoice'||updated.kind==='purchase-order'||updated.kind==='invoice'"));
  assert.ok(editor.includes("className={priceOptional?'':'required-field'}"));
  assert.ok(editor.includes("{!priceOptional?<section"));
});
"""
p.write_text(s)

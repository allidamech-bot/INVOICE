from pathlib import Path

# App: PO saves may update shared commercial defaults, but never invoice template default.
p=Path('src/app/App.tsx')
s=p.read_text()
old="const updatesSmartDefaults=!auto&&updated.kind!=='draft';const appSettings=updatesSmartDefaults?{...vault.appSettings,smartDefaults:{...vault.appSettings.smartDefaults,currency:updated.currency,language:updated.language,incoterm:updated.terms.incoterm,paymentTerms:updated.terms.paymentTerms,deliveryTime:updated.terms.deliveryTime,[updated.kind==='proforma'?'quoteTemplateId':'invoiceTemplateId']:updated.appearance.templateId}}:vault.appSettings;"
new="const updatesSmartDefaults=!auto&&updated.kind!=='draft';const templateDefault=updated.kind==='proforma'?{quoteTemplateId:updated.appearance.templateId}:updated.kind==='invoice'?{invoiceTemplateId:updated.appearance.templateId}:{};const appSettings=updatesSmartDefaults?{...vault.appSettings,smartDefaults:{...vault.appSettings.smartDefaults,currency:updated.currency,language:updated.language,incoterm:updated.terms.incoterm,paymentTerms:updated.terms.paymentTerms,deliveryTime:updated.terms.deliveryTime,...templateDefault}}:vault.appSettings;"
if old not in s: raise SystemExit('App smart-default template anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# Editor: use PO-specific total wording in desktop and mobile action bars.
p=Path('src/components/EditorPageCore.tsx')
s=p.read_text()
old="<div className=\"editor-grand-total-chip\"><span>{t('Grand Total','الإجمالي')}</span><strong>{formatMoney(totals.grandTotal,d.currency)}</strong></div>"
new="<div className=\"editor-grand-total-chip\"><span>{isPurchaseOrder?t('Order Total','إجمالي الطلب'):t('Grand Total','الإجمالي')}</span><strong>{formatMoney(totals.grandTotal,d.currency)}</strong></div>"
if old not in s: raise SystemExit('desktop total copy anchor missing')
s=s.replace(old,new,1)
old="<div className=\"mobile-total\"><span>{t('Grand Total','الإجمالي')}</span><strong>{formatMoney(totals.grandTotal,d.currency)}</strong></div>"
new="<div className=\"mobile-total\"><span>{isPurchaseOrder?t('Order Total','إجمالي الطلب'):t('Grand Total','الإجمالي')}</span><strong>{formatMoney(totals.grandTotal,d.currency)}</strong></div>"
if old not in s: raise SystemExit('mobile total copy anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# Documents detail: PO terms and total labels stay procurement-specific.
p=Path('src/components/DocumentsPage.tsx')
s=p.read_text()
old="[t('Delivery','التسليم'),doc.terms.deliveryTime],\n      [t('Packing','التعبئة'),doc.terms.packing],\n      [t('Origin','المنشأ'),doc.terms.countryOfOrigin],\n      [t('Destination','الوجهة النهائية'),doc.terms.finalDestination],\n      [t('Port of loading','ميناء التحميل'),doc.terms.portOfLoading],\n      [t('Validity','الصلاحية'),doc.terms.validity]"
new="[doc.kind==='purchase-order'?t('Delivery / Lead Time','مدة التوريد'):t('Delivery','التسليم'),doc.terms.deliveryTime],\n      [t('Packing','التعبئة'),doc.terms.packing],\n      [t('Origin','المنشأ'),doc.terms.countryOfOrigin],\n      [doc.kind==='purchase-order'?t('Ship To / Delivery Address','عنوان التسليم'):t('Destination','الوجهة النهائية'),doc.terms.finalDestination],\n      [t('Port of loading','ميناء التحميل'),doc.terms.portOfLoading],\n      ...(doc.kind==='purchase-order'?[]:[[t('Validity','الصلاحية'),doc.terms.validity]])"
if old not in s: raise SystemExit('document detail terms anchor missing')
s=s.replace(old,new,1)
old="<div className=\"document-detail-value\"><small>{t('Total','الإجمالي')}</small><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong>"
new="<div className=\"document-detail-value\"><small>{doc.kind==='purchase-order'?t('Order Total','إجمالي الطلب'):t('Total','الإجمالي')}</small><strong>{formatMoney(totals.grandTotal,doc.currency)}</strong>"
if old not in s: raise SystemExit('document detail total anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

print('v311 PO defaults/copy patch applied')

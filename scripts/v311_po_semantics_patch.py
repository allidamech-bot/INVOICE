from pathlib import Path

# Purchase-order editor semantics.
p=Path('src/components/EditorPageCore.tsx')
s=p.read_text()

old="<Field label={t('Bank Account','الحساب البنكي')}><Select value={selectedBankId} onChange={(e:any)=>this.selectBank(e.target.value)}>{bankOptions.map(account=><option key={account.id} value={account.id}>{account.label} · {account.currency}</option>)}</Select><small className=\"bank-account-select-note\">{t('This selection is snapshotted into the document and does not change issued invoices later.','يتم حفظ هذا الاختيار داخل المستند ولا يتغير في الفواتير الصادرة لاحقًا.')}</small></Field><Field label={t('Delivery Time','مدة التسليم')}><Input value={d.terms.deliveryTime} onChange={(e:any)=>this.term('deliveryTime',e.target.value)}/></Field><Field label={t('Final Destination','الوجهة النهائية')}><Input value={d.terms.finalDestination} onChange={(e:any)=>this.term('finalDestination',e.target.value)}/></Field>"
new="{!isPurchaseOrder?<Field label={t('Bank Account','الحساب البنكي')}><Select value={selectedBankId} onChange={(e:any)=>this.selectBank(e.target.value)}>{bankOptions.map(account=><option key={account.id} value={account.id}>{account.label} · {account.currency}</option>)}</Select><small className=\"bank-account-select-note\">{t('This selection is snapshotted into the document and does not change issued invoices later.','يتم حفظ هذا الاختيار داخل المستند ولا يتغير في الفواتير الصادرة لاحقًا.')}</small></Field>:null}<Field label={isPurchaseOrder?t('Delivery / Lead Time','مدة التوريد'):t('Delivery Time','مدة التسليم')}><Input value={d.terms.deliveryTime} onChange={(e:any)=>this.term('deliveryTime',e.target.value)}/></Field><Field label={isPurchaseOrder?t('Ship To / Delivery Address','عنوان التسليم'):t('Final Destination','الوجهة النهائية')}><Input value={d.terms.finalDestination} onChange={(e:any)=>this.term('finalDestination',e.target.value)}/></Field>"
if old not in s: raise SystemExit('commercial terms anchor missing')
s=s.replace(old,new,1)

old="<Field label={t('Country of Origin','بلد المنشأ')}><Input value={d.terms.countryOfOrigin} onChange={(e:any)=>this.term('countryOfOrigin',e.target.value)}/></Field><Field label={t('Validity','الصلاحية')}><Input value={d.terms.validity} onChange={(e:any)=>this.term('validity',e.target.value)}/></Field><Field label={t('Remarks','ملاحظات تجارية')}"
new="<Field label={t('Country of Origin','بلد المنشأ')}><Input value={d.terms.countryOfOrigin} onChange={(e:any)=>this.term('countryOfOrigin',e.target.value)}/></Field>{!isPurchaseOrder?<Field label={t('Validity','الصلاحية')}><Input value={d.terms.validity} onChange={(e:any)=>this.term('validity',e.target.value)}/></Field>:null}<Field label={t('Remarks','ملاحظات تجارية')}"
if old not in s: raise SystemExit('validity anchor missing')
s=s.replace(old,new,1)

old="<Button icon={selectedIsDefault?'check':'save'} variant={selectedIsDefault?'secondary':'primary'} disabled={selectedIsDefault} onClick={()=>void this.setCurrentTemplateDefault()}>{selectedIsDefault?(d.kind==='proforma'?t('Default quote template','القالب الافتراضي لعرض السعر'):t('Default invoice template','القالب الافتراضي للفاتورة')):(d.kind==='proforma'?t('Set as quote default','تعيين كافتراضي لعرض السعر'):t('Set as invoice default','تعيين كافتراضي للفاتورة'))}</Button>"
new="{!isPurchaseOrder?<Button icon={selectedIsDefault?'check':'save'} variant={selectedIsDefault?'secondary':'primary'} disabled={selectedIsDefault} onClick={()=>void this.setCurrentTemplateDefault()}>{selectedIsDefault?(d.kind==='proforma'?t('Default quote template','القالب الافتراضي لعرض السعر'):t('Default invoice template','القالب الافتراضي للفاتورة')):(d.kind==='proforma'?t('Set as quote default','تعيين كافتراضي لعرض السعر'):t('Set as invoice default','تعيين كافتراضي للفاتورة'))}</Button>:null}"
if old not in s: raise SystemExit('template default button anchor missing')
s=s.replace(old,new,1)

old="<div className=\"appearance-toggles\"><Toggle checked={d.appearance.showBank} onChange={v=>this.appearance('showBank',v)} label={t('Bank Details','بيانات البنك')}/><Toggle checked={d.appearance.showSignature}"
new="<div className=\"appearance-toggles\">{!isPurchaseOrder?<Toggle checked={d.appearance.showBank} onChange={v=>this.appearance('showBank',v)} label={t('Bank Details','بيانات البنك')}/>:null}<Toggle checked={d.appearance.showSignature}"
if old not in s: raise SystemExit('bank appearance toggle anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# Purchase-order printable semantics.
p=Path('src/templates/TemplateRenderer.tsx')
s=p.read_text()
old="function Terms({ document: doc }: { document: LourexDocument }): any {\n  const t = doc.terms; const rawRows: Array<[string,string,string]> = [['Incoterm','الإنكوترم',t.incoterm],['Payment Terms','شروط الدفع',t.paymentTerms],['Packing','التعبئة',t.packing],['Delivery Time','مدة التسليم',t.deliveryTime],['Port of Loading','ميناء التحميل',t.portOfLoading],['Final Destination','الوجهة النهائية',t.finalDestination],['Country of Origin','بلد المنشأ',t.countryOfOrigin],['Validity','الصلاحية',t.validity],['Remarks','ملاحظات تجارية',t.remarks]];"
new="function Terms({ document: doc }: { document: LourexDocument }): any {\n  const t = doc.terms; const rawRows: Array<[string,string,string]> = [['Incoterm','الإنكوترم',t.incoterm],['Payment Terms','شروط الدفع',t.paymentTerms],['Packing','التعبئة',t.packing],[doc.kind==='purchase-order'?'Delivery / Lead Time':'Delivery Time',doc.kind==='purchase-order'?'مدة التوريد':'مدة التسليم',t.deliveryTime],['Port of Loading','ميناء التحميل',t.portOfLoading],[doc.kind==='purchase-order'?'Ship To / Delivery Address':'Final Destination',doc.kind==='purchase-order'?'عنوان التسليم':'الوجهة النهائية',t.finalDestination],['Country of Origin','بلد المنشأ',t.countryOfOrigin],...(doc.kind==='purchase-order'?[]:[['Validity','الصلاحية',t.validity] as [string,string,string]]),['Remarks','ملاحظات تجارية',t.remarks]];"
if old not in s: raise SystemExit('renderer Terms anchor missing')
s=s.replace(old,new,1)

old="<div className=\"grand-total\"><span>{localized(doc,doc.role==='credit-note'?'Credit Total':'Grand Total',doc.role==='credit-note'?'إجمالي الإشعار الدائن':'الإجمالي النهائي')}</span><strong>"
new="<div className=\"grand-total\"><span>{localized(doc,doc.role==='credit-note'?'Credit Total':doc.kind==='purchase-order'?'Order Total':'Grand Total',doc.role==='credit-note'?'إجمالي الإشعار الدائن':doc.kind==='purchase-order'?'إجمالي الطلب':'الإجمالي النهائي')}</span><strong>"
if old not in s: raise SystemExit('renderer total anchor missing')
s=s.replace(old,new,1)

old="function Bank({ document: doc }: { document: LourexDocument }): any {\n  if (!doc.appearance.showBank) return null;"
new="function Bank({ document: doc }: { document: LourexDocument }): any {\n  if (doc.kind==='purchase-order' || !doc.appearance.showBank) return null;"
if old not in s: raise SystemExit('renderer Bank anchor missing')
s=s.replace(old,new,1)

old="safeValue(doc,t.incoterm,'technical'),safeValue(doc,t.paymentTerms),safeValue(doc,t.packing),safeValue(doc,t.deliveryTime),safeValue(doc,t.portOfLoading,'neutral'),safeValue(doc,t.finalDestination,'neutral'),safeValue(doc,t.countryOfOrigin,'country'),safeValue(doc,t.validity),safeValue(doc,t.remarks)"
new="safeValue(doc,t.incoterm,'technical'),safeValue(doc,t.paymentTerms),safeValue(doc,t.packing),safeValue(doc,t.deliveryTime),safeValue(doc,t.portOfLoading,'neutral'),safeValue(doc,t.finalDestination,'neutral'),safeValue(doc,t.countryOfOrigin,'country'),...(doc.kind==='purchase-order'?[]:[safeValue(doc,t.validity)]),safeValue(doc,t.remarks)"
if old not in s: raise SystemExit('renderer closing-values anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

print('v311 purchase-order semantic patch applied')

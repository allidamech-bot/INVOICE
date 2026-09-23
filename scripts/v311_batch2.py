from pathlib import Path

# Home: drafts are company documents, not unfinished financial/customer documents.
p=Path('src/components/WorkspaceHome.tsx'); s=p.read_text()
old="""function customerName(doc:LourexDocument):string{\n  if(doc.kind==='purchase-order'){"""
new="""function customerName(doc:LourexDocument):string{\n  if(doc.kind==='draft')return doc.letter?.recipient||doc.letter?.subject||t('Company document','مستند شركة');\n  if(doc.kind==='purchase-order'){"""
if old not in s: raise SystemExit('home party anchor missing')
s=s.replace(old,new,1)
s=s.replace("if(doc.lifecycleStatus==='voided')return{tone:'void',label:t('Void','ملغى')};","if(doc.lifecycleStatus==='voided')return{tone:'void',label:(doc.kind==='proforma'||doc.kind==='purchase-order')?t('Cancelled','ملغى'):t('Void','ملغى')};",1)
old="const drafts=documents.filter(doc=>doc.status==='draft').length;"
new="const drafts=documents.filter(doc=>doc.kind!=='draft'&&doc.status==='draft').length;"
if old not in s: raise SystemExit('home attention drafts anchor missing')
s=s.replace(old,new,1)
s=s.replace("t('Quote, invoice or purchase order','عرض سعر أو فاتورة أو طلب شراء')","t('Quote, invoice, purchase order or company draft','عرض سعر أو فاتورة أو طلب شراء أو مسودة شركة')",1)
s=s.replace("<span>{t('Customer','العميل')}</span><span>{t('Date','التاريخ')}</span><span>{t('Amount','المبلغ')}</span>","<span>{t('Party / subject','الطرف / الموضوع')}</span><span>{t('Date','التاريخ')}</span><span>{t('Amount','المبلغ')}</span>",1)
s=s.replace("<span className={`dashboard-document-kind kind-${doc.kind}`}><Icon name={doc.kind==='proforma'?'proforma':'invoice'}/></span>","<span className={`dashboard-document-kind kind-${doc.kind}`}><Icon name={doc.kind==='proforma'?'proforma':doc.kind==='purchase-order'?'file':doc.kind==='draft'?'edit':'invoice'}/></span>",1)
s=s.replace("<strong className=\"dashboard-document-amount\">{formatMoney(total,doc.currency)}</strong>","<strong className=\"dashboard-document-amount\">{doc.kind==='draft'?'—':formatMoney(total,doc.currency)}</strong>",1)
s=s.replace("t('Create your first quotation or invoice. LOUREX will build your command center from real activity.','أنشئ أول عرض سعر أو فاتورة وسيبني LOUREX مركز القيادة من نشاطك الحقيقي.')","t('Create your first business document. LOUREX will build your command center from real activity.','أنشئ أول مستند أعمال وسيبني LOUREX مركز القيادة من نشاطك الحقيقي.')",1)
p.write_text(s)

# Documents workspace: free-form company drafts get their own semantic treatment.
p=Path('src/components/DocumentsPage.tsx'); s=p.read_text()
old="""function workflowStatus(doc:LourexDocument):Exclude<WorkspaceStatus,'all'|'voided'>{\n  if(doc.status==='final')return 'final';"""
new="""function workflowStatus(doc:LourexDocument):Exclude<WorkspaceStatus,'all'|'voided'>{\n  if(doc.kind==='draft')return 'draft';\n  if(doc.status==='final')return 'final';"""
if old not in s: raise SystemExit('documents workflow status anchor missing')
s=s.replace(old,new,1)
s=s.replace("const missingCustomer=doc.kind==='purchase-order'?!doc.supplierSnapshot:!hasDocumentCustomer(doc);","const missingCustomer=doc.kind==='draft'?false:doc.kind==='purchase-order'?!doc.supplierSnapshot:!hasDocumentCustomer(doc);",1)
s=s.replace("doc.lifecycleStatus==='voided'?(doc.kind==='proforma'?t('Cancelled','ملغى'):t('Voided','ملغى'))","doc.lifecycleStatus==='voided'?((doc.kind==='proforma'||doc.kind==='purchase-order')?t('Cancelled','ملغى'):t('Voided','ملغى'))",1)
old="""<span className=\"register-customer\"><b>{partyName(doc)}</b><small>{itemCountLabel(doc.items.length)}{missingCustomer? ` · ${doc.kind==='purchase-order'?t('Supplier required','المورد مطلوب'):t('Customer required','العميل مطلوب')}`:''}</small></span>"""
new="""<span className=\"register-customer\"><b>{partyName(doc)}</b><small>{doc.kind==='draft'?t(`${doc.letter?.blocks.length??0} content blocks`,`${doc.letter?.blocks.length??0} فقرات محتوى`):itemCountLabel(doc.items.length)}{missingCustomer? ` · ${doc.kind==='purchase-order'?t('Supplier required','المورد مطلوب'):t('Customer required','العميل مطلوب')}`:''}</small></span>"""
if old not in s: raise SystemExit('documents register party meta anchor missing')
s=s.replace(old,new,1)
s=s.replace("<strong className=\"register-amount\"><bdi>{formatMoney(totals.grandTotal,doc.currency)}</bdi></strong>","<strong className=\"register-amount\"><bdi>{doc.kind==='draft'?'—':formatMoney(totals.grandTotal,doc.currency)}</bdi></strong>",1)
p.write_text(s)

# Settings: sign-out belongs to More, and Draft numbering is a first-class preference.
p=Path('src/components/SettingsModal.tsx'); s=p.read_text()
old="""{account?<div className=\"settings-account-actions\"><Button className=\"settings-signout-button\" disabled={this.state.busy} onClick={()=>void this.signOutFromCloud()}>{this.state.accountAction==='signout'?t('Signing out…','جارٍ تسجيل الخروج…'):t('Sign Out','تسجيل الخروج')}</Button></div>:null}"""
if old not in s: raise SystemExit('settings signout UI anchor missing')
s=s.replace(old,'',1)
s=s.replace("t('Session locking, device PIN and encrypted cloud recovery. Sign out is available directly from Settings.','قفل الجلسة ورمز PIN والاستعادة السحابية المشفّرة. تسجيل الخروج متاح مباشرة من الإعدادات.')","t('Session locking, device PIN and encrypted cloud recovery. Sign out is available from More.','قفل الجلسة ورمز PIN والاستعادة السحابية المشفّرة. تسجيل الخروج متاح من صفحة المزيد.')",1)
old="""<Field label={t('Purchase Order Prefix','بادئة طلب الشراء')}><Input value={s.numbering.purchaseOrderPrefix||'PO'} onChange={(e:any)=>this.setNumbering('purchaseOrderPrefix',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}/></Field>"""
new=old+"""<Field label={t('Company Draft Prefix','بادئة مسودة الشركة')}><Input value={s.numbering.draftPrefix||'DR'} onChange={(e:any)=>this.setNumbering('draftPrefix',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}/></Field>"""
if old not in s: raise SystemExit('settings PO prefix anchor missing')
s=s.replace(old,new,1)
old="""<span>{s.numbering.purchaseOrderPrefix || 'PO'}-YYYY-0001</span></div>"""
new="""<span>{s.numbering.purchaseOrderPrefix || 'PO'}-YYYY-0001</span><span>{s.numbering.draftPrefix || 'DR'}-YYYY-0001</span></div>"""
if old not in s: raise SystemExit('settings numbering preview anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

print('v311 batch 2 applied')

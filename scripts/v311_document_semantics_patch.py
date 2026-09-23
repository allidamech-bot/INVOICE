from pathlib import Path

# 1) Company Drafts are not accounting documents and must never mutate financial smart defaults.
p=Path('src/app/App.tsx')
s=p.read_text()
old="const appSettings=auto?vault.appSettings:{...vault.appSettings,smartDefaults:{...vault.appSettings.smartDefaults,currency:updated.currency,language:updated.language,incoterm:updated.terms.incoterm,paymentTerms:updated.terms.paymentTerms,deliveryTime:updated.terms.deliveryTime,[updated.kind==='proforma'?'quoteTemplateId':'invoiceTemplateId']:updated.appearance.templateId}};await this.persist({...vault,documents,documentEvents,appSettings});this.setState({editorDoc:updated});if(!auto)this.showToast(t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'),'success');"
new="const updatesSmartDefaults=!auto&&updated.kind!=='draft';const appSettings=updatesSmartDefaults?{...vault.appSettings,smartDefaults:{...vault.appSettings.smartDefaults,currency:updated.currency,language:updated.language,incoterm:updated.terms.incoterm,paymentTerms:updated.terms.paymentTerms,deliveryTime:updated.terms.deliveryTime,[updated.kind==='proforma'?'quoteTemplateId':'invoiceTemplateId']:updated.appearance.templateId}}:vault.appSettings;await this.persist({...vault,documents,documentEvents,appSettings});this.setState({editorDoc:updated});if(!auto)this.showToast(updated.kind==='draft'?t('Company draft saved.','تم حفظ مسودة الشركة.'):t('Document saved. Smart defaults updated.','تم حفظ المستند وتحديث الإعدادات الذكية.'),'success');"
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('App.saveDocument smart-defaults anchor missing')
p.write_text(s)

# 2) A free-form company draft remains a Draft; it is never an issue-ready financial document.
p=Path('src/components/DocumentsPage.tsx')
s=p.read_text()
old="function workflowStatus(doc:LourexDocument):Exclude<WorkspaceStatus,'all'|'voided'>{\n  if(doc.status==='final')return 'final';\n  return Object.keys(validateDocument(doc)).length===0?'ready':'draft';\n}"
new="function workflowStatus(doc:LourexDocument):Exclude<WorkspaceStatus,'all'|'voided'>{\n  if(doc.kind==='draft')return 'draft';\n  if(doc.status==='final')return 'final';\n  return Object.keys(validateDocument(doc)).length===0?'ready':'draft';\n}"
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('Documents workflowStatus anchor missing')
p.write_text(s)

print('v311 document semantics patch applied')

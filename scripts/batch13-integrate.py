from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p=Path(path); text=p.read_text()
    found=text.count(old)
    if found!=count:
        raise SystemExit(f'{path}: expected {count} occurrence(s), found {found}: {old[:100]!r}')
    p.write_text(text.replace(old,new,count))

# Persist audit events in the existing DocumentEventRecord ledger only.
replace('src/types.ts',
"export type DocumentEventType = 'created' | 'issued' | 'reissued' | 'revision-started' | 'revision-discarded' | 'voided' | 'credit-note-created' | 'payment-recorded' | 'payment-deleted' | 'converted';",
"export type DocumentEventType = 'created' | 'issued' | 'reissued' | 'revision-started' | 'revision-discarded' | 'voided' | 'credit-note-created' | 'payment-recorded' | 'payment-deleted' | 'converted' | 'audit';")
replace('src/types.ts',
"export interface DocumentEventRecord {\n  id: string;\n  documentId: string;\n  documentNumber: string;\n  type: DocumentEventType;\n  at: string;\n  note: string;\n  relatedDocumentId: string;\n  relatedDocumentNumber: string;\n  amount: string;\n  currency: string;\n}",
"export interface DocumentEventRecord {\n  id: string;\n  documentId: string;\n  documentNumber: string;\n  type: DocumentEventType;\n  at: string;\n  note: string;\n  relatedDocumentId: string;\n  relatedDocumentNumber: string;\n  amount: string;\n  currency: string;\n  auditEntityType?: 'document'|'customer'|'supplier'|'product'|'purchase';\n  auditEntityId?: string;\n  auditEntityLabel?: string;\n  auditAction?: 'created'|'updated'|'deleted'|'posted'|'reversed';\n  auditActorKind?: 'user'|'system';\n  workspaceId?: string;\n}")
replace('src/lib/defaults.ts',"export const APP_SCHEMA_VERSION=17;","export const APP_SCHEMA_VERSION=18;")
replace('src/storage/vault.ts',
"const DOCUMENT_EVENT_TYPES=['created','issued','reissued','revision-started','revision-discarded','voided','credit-note-created','payment-recorded','payment-deleted','converted'] as const;",
"const DOCUMENT_EVENT_TYPES=['created','issued','reissued','revision-started','revision-discarded','voided','credit-note-created','payment-recorded','payment-deleted','converted','audit'] as const;")
replace('src/storage/vault.ts',
"relatedDocumentId:String(event?.relatedDocumentId??''),relatedDocumentNumber:String(event?.relatedDocumentNumber??''),amount:String(event?.amount??''),currency:String(event?.currency??'')",
"relatedDocumentId:String(event?.relatedDocumentId??''),relatedDocumentNumber:String(event?.relatedDocumentNumber??''),amount:String(event?.amount??''),currency:String(event?.currency??''),auditEntityType:['document','customer','supplier','product','purchase'].includes(String(event?.auditEntityType??''))?String(event.auditEntityType):undefined,auditEntityId:String(event?.auditEntityId??''),auditEntityLabel:String(event?.auditEntityLabel??''),auditAction:['created','updated','deleted','posted','reversed'].includes(String(event?.auditAction??''))?String(event.auditAction):undefined,auditActorKind:event?.auditActorKind==='system'?'system':event?.auditActorKind==='user'?'user':undefined,workspaceId:String(event?.workspaceId??'')")
# v18 is a storage compatibility boundary; old events remain valid and audit metadata defaults empty.
anchor="if(migrated.schemaVersion<17){migrated.recurringWorkflows=[];}\n  migrated.schemaVersion=APP_SCHEMA_VERSION;"
replace('src/storage/vault.ts',anchor,"if(migrated.schemaVersion<17){migrated.recurringWorkflows=[];}\n  if(migrated.schemaVersion<18){migrated.documentEvents=migrated.documentEvents??[];}\n  migrated.schemaVersion=APP_SCHEMA_VERSION;")

# Add audit records atomically in the single mutation pipeline.
replace('src/app/index.tsx',
"import { registerVaultMutationBridge } from '../storage/vault-mutation-bridge.js';",
"import { registerVaultMutationBridge } from '../storage/vault-mutation-bridge.js';\nimport { appendAuditEventsForVaultDiff } from '../lib/audit-diff.js';")
replace('src/app/index.tsx',
"        const next=mutation(latest);\n        const encrypted=await saveVault(key,next);",
"        const intended=mutation(latest);\n        const next=appendAuditEventsForVaultDiff(latest,intended);\n        const encrypted=await saveVault(key,next);")

# Contextual timelines.
replace('src/components/Customer360LivePanel.tsx',
"import { CustomerSharesPanel } from './CustomerSharesPanel.js';",
"import { CustomerSharesPanel } from './CustomerSharesPanel.js';\nimport { EntityAuditLivePanel } from './EntityAuditLivePanel.js';")
replace('src/components/Customer360LivePanel.tsx',
"  return <><Customer360Panel snapshot={snapshot}/><CustomerSharesPanel customer={customer}/></>;",
"  return <><Customer360Panel snapshot={snapshot}/><CustomerSharesPanel customer={customer}/><EntityAuditLivePanel entityType=\"customer\" entityId={customer.id} title={t('Customer activity','نشاط العميل')}/></>;")
replace('src/components/Supplier360LivePanel.tsx',
"import { Supplier360Panel } from './Relationship360Panels.js';",
"import { Supplier360Panel } from './Relationship360Panels.js';\nimport { EntityAuditLivePanel } from './EntityAuditLivePanel.js';")
replace('src/components/Supplier360LivePanel.tsx',
"  return <Supplier360Panel snapshot={snapshot}/>;",
"  return <><Supplier360Panel snapshot={snapshot}/><EntityAuditLivePanel entityType=\"supplier\" entityId={supplier.id} title={t('Supplier activity','نشاط المورد')}/></>;")

# Product editor contextual timeline.
replace('src/components/ProductLibraryWorkspace.tsx',
"import { ProductImportModal } from './ProductImportModal.js';",
"import { ProductImportModal } from './ProductImportModal.js';\nimport { EntityAuditLivePanel } from './EntityAuditLivePanel.js';")
# Insert audit timeline in editor by anchoring the editor form footer/error area.
p=Path('src/components/ProductLibraryWorkspace.tsx'); text=p.read_text()
needle="{this.state.error?<div className=\"form-error\" role=\"alert\">{this.state.error}</div>:null}"
if needle in text and 'entityType="product"' not in text:
    text=text.replace(needle,needle+"{this.state.editing?.id?<EntityAuditLivePanel entityType=\"product\" entityId={this.state.editing.id} title={t('Product activity','نشاط الصنف')}/>:null}",1)
p.write_text(text)

# Purchase contextual timeline in Operations purchase editor/details if available.
p=Path('src/components/OperationsPage.tsx'); text=p.read_text()
if "./EntityAuditLivePanel.js" not in text:
    marker="import { Supplier360LivePanel } from './Supplier360LivePanel.js';"
    if marker in text:text=text.replace(marker,marker+"\nimport { EntityAuditLivePanel } from './EntityAuditLivePanel.js';",1)
# Add beside Supplier 360 when editing a purchase; exact UI varies, so use a stable occurrence of Supplier360LivePanel.
if 'entityType="purchase"' not in text:
    marker='<Supplier360LivePanel supplier={supplier}/>'
    if marker in text:text=text.replace(marker,marker+'<EntityAuditLivePanel entityType="purchase" entityId={purchase.id} title={t(\'Purchase activity\',\'نشاط الشراء\')}/>',1)
p.write_text(text)

# Data Center surface inside Settings. Reuse Settings modal, do not add primary navigation.
replace('src/components/SettingsModal.tsx',
"import type { AppSettings, CompanySettings } from '../types.js';",
"import type { AppSettings, CompanySettings, DocumentEventRecord } from '../types.js';")
replace('src/components/SettingsModal.tsx',
"import { Button, ConfirmDialog, Field, Input, Modal, Select, Textarea, Icon } from './UI.js';",
"import { Button, ConfirmDialog, Field, Input, Modal, Select, Textarea, Icon } from './UI.js';\nimport { ActivityLogModal } from './ActivityLogModal.js';")
replace('src/components/SettingsModal.tsx',
"  onBackup:(pin:string)=>Promise<void>; onRestore:(file:File,pin:string)=>Promise<void>;\n}",
"  onBackup:(pin:string)=>Promise<void>; onRestore:(file:File,pin:string)=>Promise<void>;\n  documentEvents:DocumentEventRecord[];\n}")
replace('src/components/SettingsModal.tsx',
"  tab:'company'|'commercial'|'documents'|'security'; company:CompanySettings;",
"  tab:'company'|'commercial'|'documents'|'security'|'data'; company:CompanySettings;")
replace('src/components/SettingsModal.tsx',
"  stampOriginalDataUrl:string; stampRebuiltDataUrl:string; stampMode:AssetMode;\n}",
"  stampOriginalDataUrl:string; stampRebuiltDataUrl:string; stampMode:AssetMode; activityLogOpen:boolean;\n}")
replace('src/components/SettingsModal.tsx',
"stampOriginalDataUrl:'',stampRebuiltDataUrl:'',stampMode:'original'};",
"stampOriginalDataUrl:'',stampRebuiltDataUrl:'',stampMode:'original',activityLogOpen:false};",2)
replace('src/components/SettingsModal.tsx',
"if(tab==='company'||tab==='commercial'||tab==='documents'||tab==='security')this.selectSettingsTab(tab);",
"if(tab==='company'||tab==='commercial'||tab==='documents'||tab==='security'||tab==='data')this.selectSettingsTab(tab);")
# Insert Data Center renderer before security settings.
marker="  private securitySettings(s:AppSettings,account:CloudUser|null):any{return <div className=\"ta-settings-page ta-security-page\">"
if marker not in Path('src/components/SettingsModal.tsx').read_text(): raise SystemExit('Settings security anchor missing')
p=Path('src/components/SettingsModal.tsx'); text=p.read_text(); data_method="""  private dataCenter():any{return <div className=\"ta-settings-page ta-data-center-page\">\n    {this.pageHeader(t('Data Center','مركز البيانات'),t('Data & activity','البيانات والنشاط'),t('Backup, restore and the immutable workspace activity log live together here.','النسخ والاستعادة وسجل نشاط مساحة العمل غير القابل للتعديل موجودة هنا.'))}\n    {this.card(t('Activity Log','سجل النشاط'),t('Review audited changes across customers, suppliers, products, purchases and documents.','راجع التغييرات المدققة عبر العملاء والموردين والأصناف والمشتريات والمستندات.'),<Button icon=\"history\" onClick={()=>this.setState({activityLogOpen:true})}>{t('Open Activity Log','فتح سجل النشاط')}</Button>)}\n  </div>;}\n\n"""
text=text.replace(marker,data_method+marker,1)
# Add data tab and rendered page/modal.
old="['documents',t('Documents','المستندات'),'file',t('Output and numbering','الإخراج والترقيم')],['security',t('Security','الأمان'),'lock',t('PIN and recovery','PIN والاستعادة')]] as const)"
new="['documents',t('Documents','المستندات'),'file',t('Output and numbering','الإخراج والترقيم')],['data',t('Data Center','مركز البيانات'),'database',t('Backup and activity','النسخ والنشاط')],['security',t('Security','الأمان'),'lock',t('PIN and recovery','PIN والاستعادة')]] as const)"
if old not in text: raise SystemExit('Settings tab list anchor missing')
text=text.replace(old,new,1)
text=text.replace("{!accountScope&&this.state.tab==='documents'?this.documentSettings(c,s):null}\n          {!accountScope&&this.state.tab==='security'?this.securitySettings(s,account):null}","{!accountScope&&this.state.tab==='documents'?this.documentSettings(c,s):null}\n          {!accountScope&&this.state.tab==='data'?this.dataCenter():null}\n          {!accountScope&&this.state.tab==='security'?this.securitySettings(s,account):null}",1)
text=text.replace("      <ConfirmDialog open={this.state.confirmCloudRestore}","      <ActivityLogModal open={this.state.activityLogOpen} events={this.props.documentEvents} onClose={()=>this.setState({activityLogOpen:false})}/>\n      <ConfirmDialog open={this.state.confirmCloudRestore}",1)
p.write_text(text)

# Pass existing ledger into Settings.
p=Path('src/app/App.tsx'); text=p.read_text()
needle='<SettingsModal open={this.state.settingsOpen} company={vault.company} appSettings={vault.appSettings}'
if needle not in text: raise SystemExit('App SettingsModal anchor missing')
if 'documentEvents={vault.documentEvents}' not in text:
    text=text.replace(needle,needle+' documentEvents={vault.documentEvents}',1)
p.write_text(text)

# Include Batch 13 presentation layer before reliability owner.
p=Path('index.html'); text=p.read_text()
css='  <link rel="stylesheet" href="./styles/audit-trail-batch13.css?v=465-1" data-lourex-audit-trail-batch13="true" />\n'
if 'audit-trail-batch13.css' not in text:
    anchor='  <link rel="stylesheet" href="./styles/tailadmin-reliability-bridge-v320.css?v=320-2" data-lourex-tailadmin-reliability-v320="true" />'
    if anchor not in text: raise SystemExit('index reliability CSS anchor missing')
    text=text.replace(anchor,css+anchor,1)
p.write_text(text)

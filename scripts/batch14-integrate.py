from pathlib import Path

def text(path): return Path(path).read_text()
def write(path,value): Path(path).write_text(value)
def replace(path,old,new,count=1):
    value=text(path); found=value.count(old)
    if found!=count: raise SystemExit(f'{path}: expected {count}, found {found}: {old[:140]!r}')
    write(path,value.replace(old,new,count))

# Types + encrypted schema.
replace('src/types.ts',
"export type ArabicFontId = 'auto' | 'cairo' | 'tajawal' | 'noto-kufi' | 'noto-naskh';\n",
"export type ArabicFontId = 'auto' | 'cairo' | 'tajawal' | 'noto-kufi' | 'noto-naskh';\nexport type TeamRole = 'owner' | 'admin' | 'finance' | 'sales' | 'purchasing' | 'viewer';\nexport type TeamMemberStatus = 'active' | 'suspended';\nexport type ApprovalAction = 'issue-document' | 'post-purchase' | 'reverse-purchase';\nexport type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';\n")
replace('src/types.ts',
"export interface AppSettings {\n  autoLockMinutes: AutoLockMinutes;\n  uiLanguage: UiLanguage;",
"export interface AppSettings {\n  autoLockMinutes: AutoLockMinutes;\n  uiLanguage: UiLanguage;\n  activeTeamMemberId: string;")
replace('src/types.ts',
"export type RecurringCadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';",
"export interface TeamMemberRecord {\n  id: string;\n  displayName: string;\n  email: string;\n  role: TeamRole;\n  status: TeamMemberStatus;\n  createdAt: string;\n  updatedAt: string;\n}\n\nexport interface ApprovalPolicyRecord {\n  id: string;\n  action: ApprovalAction;\n  enabled: boolean;\n  approverRoles: TeamRole[];\n}\n\nexport interface ApprovalRequestRecord {\n  id: string;\n  action: ApprovalAction;\n  entityType: 'document' | 'purchase';\n  entityId: string;\n  entityLabel: string;\n  entityUpdatedAt: string;\n  requestedByMemberId: string;\n  status: ApprovalRequestStatus;\n  decidedByMemberId: string;\n  decisionNote: string;\n  createdAt: string;\n  decidedAt: string;\n}\n\nexport type RecurringCadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';")
replace('src/types.ts',
"  inventoryMovements: InventoryMovementRecord[];\n  recurringWorkflows: RecurringWorkflowRecord[];",
"  inventoryMovements: InventoryMovementRecord[];\n  teamMembers: TeamMemberRecord[];\n  approvalPolicies: ApprovalPolicyRecord[];\n  approvalRequests: ApprovalRequestRecord[];\n  recurringWorkflows: RecurringWorkflowRecord[];")

replace('src/lib/defaults.ts',
"import { defaultBankDetails } from './commercial-controls.js';",
"import { defaultBankDetails } from './commercial-controls.js';\nimport { DEFAULT_APPROVAL_POLICIES, defaultOwnerMember } from './governance.js';")
replace('src/lib/defaults.ts',
"// v18 extends the existing encrypted document-event ledger with auditable entity context.\nexport const APP_SCHEMA_VERSION = 18;",
"// v18 extends the existing encrypted document-event ledger with auditable entity context.\n// v19 adds encrypted team roles, operator context and approval workflow records.\nexport const APP_SCHEMA_VERSION = 19;")
replace('src/lib/defaults.ts',
"    autoLockMinutes: 15,\n    uiLanguage: 'en',",
"    autoLockMinutes: 15,\n    uiLanguage: 'en',\n    activeTeamMemberId: 'owner',")
replace('src/lib/defaults.ts',
"return { schemaVersion: APP_SCHEMA_VERSION, company: defaultCompany(), appSettings: defaultAppSettings(), customers: [], suppliers: [], purchases: [], supplierPayments: [], expenses: [], inventoryMovements: [], recurringWorkflows: [], documents: [], documentEvents: [], documentRevisions: [], payments: [], savedItems: [], companyAssets: [] }",
"return { schemaVersion: APP_SCHEMA_VERSION, company: defaultCompany(), appSettings: defaultAppSettings(), customers: [], suppliers: [], purchases: [], supplierPayments: [], expenses: [], inventoryMovements: [], teamMembers: [defaultOwnerMember()], approvalPolicies: DEFAULT_APPROVAL_POLICIES.map(policy=>({...policy,approverRoles:[...policy.approverRoles]})), approvalRequests: [], recurringWorkflows: [], documents: [], documentEvents: [], documentRevisions: [], payments: [], savedItems: [], companyAssets: [] }")

# Migration normalization.
replace('src/storage/vault.ts',
"import { createSafetySnapshot, getEncryptedVault, getSecurity, putRecord, putSecurityAndVault } from './db.js';",
"import { createSafetySnapshot, getEncryptedVault, getSecurity, putRecord, putSecurityAndVault } from './db.js';\nimport { DEFAULT_APPROVAL_POLICIES, defaultOwnerMember, normalizeApprovalPolicies } from '../lib/governance.js';")
replace('src/storage/vault.ts',
"const DOCUMENT_KINDS = new Set<DocumentKind>(['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt']);",
"const DOCUMENT_KINDS = new Set<DocumentKind>(['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt']);\nconst TEAM_ROLES = new Set(['owner','admin','finance','sales','purchasing','viewer']);\nconst TEAM_STATUSES = new Set(['active','suspended']);\nconst APPROVAL_ACTIONS = new Set(['issue-document','post-purchase','reverse-purchase']);\nconst APPROVAL_STATUSES = new Set(['pending','approved','rejected']);")
replace('src/storage/vault.ts',
"    uiLanguage: uiLanguageValue(sourceSettings.uiLanguage, defaults.appSettings.uiLanguage),\n    numbering:",
"    uiLanguage: uiLanguageValue(sourceSettings.uiLanguage, defaults.appSettings.uiLanguage),\n    activeTeamMemberId:stringValue(sourceSettings.activeTeamMemberId,'owner')||'owner',\n    numbering:")
anchor="  migrated.recurringWorkflows = Array.isArray((vault as any).recurringWorkflows) ?"
value=text('src/storage/vault.ts')
if anchor not in value: raise SystemExit('vault recurring anchor missing')
insert="""  migrated.teamMembers = Array.isArray((vault as any).teamMembers) ? (vault as any).teamMembers.map((member:any)=>({
    id:stringValue(member?.id),displayName:stringValue(member?.displayName),email:stringValue(member?.email),role:TEAM_ROLES.has(member?.role)?member.role:'viewer',status:TEAM_STATUSES.has(member?.status)?member.status:'active',createdAt:stringValue(member?.createdAt,nowIso()),updatedAt:stringValue(member?.updatedAt,member?.createdAt?stringValue(member.createdAt):nowIso())
  })).filter((member:any)=>member.id&&member.displayName) : [];
  if(!migrated.teamMembers.some(member=>member.id==='owner'))migrated.teamMembers.unshift(defaultOwnerMember());
  const rawPolicies=Array.isArray((vault as any).approvalPolicies)?(vault as any).approvalPolicies.map((policy:any)=>({id:stringValue(policy?.id),action:APPROVAL_ACTIONS.has(policy?.action)?policy.action:'issue-document',enabled:booleanValue(policy?.enabled,false),approverRoles:Array.isArray(policy?.approverRoles)?policy.approverRoles.filter((role:any)=>TEAM_ROLES.has(role)):[]})):[];
  migrated.approvalPolicies=normalizeApprovalPolicies(rawPolicies as any);
  migrated.approvalRequests=Array.isArray((vault as any).approvalRequests)?(vault as any).approvalRequests.map((request:any)=>({
    id:stringValue(request?.id),action:APPROVAL_ACTIONS.has(request?.action)?request.action:'issue-document',entityType:request?.entityType==='purchase'?'purchase':'document',entityId:stringValue(request?.entityId),entityLabel:stringValue(request?.entityLabel),entityUpdatedAt:stringValue(request?.entityUpdatedAt),requestedByMemberId:stringValue(request?.requestedByMemberId,'owner'),status:APPROVAL_STATUSES.has(request?.status)?request.status:'pending',decidedByMemberId:stringValue(request?.decidedByMemberId),decisionNote:stringValue(request?.decisionNote),createdAt:stringValue(request?.createdAt,nowIso()),decidedAt:stringValue(request?.decidedAt)
  })).filter((request:any)=>request.id&&request.entityId):[];
  if(!migrated.teamMembers.some(member=>member.id===migrated.appSettings.activeTeamMemberId&&member.status==='active'))migrated.appSettings.activeTeamMemberId=migrated.teamMembers.find(member=>member.role==='owner'&&member.status==='active')?.id??migrated.teamMembers.find(member=>member.status==='active')?.id??'owner';

"""
write('src/storage/vault.ts',value.replace(anchor,insert+anchor,1))
replace('src/storage/vault.ts',
"  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');\n  unique(migrated.recurringWorkflows.map(r => r.id), 'recurring workflow');",
"  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');\n  unique(migrated.teamMembers.map(m => m.id), 'team member');\n  unique(migrated.approvalPolicies.map(p => p.id), 'approval policy');\n  unique(migrated.approvalRequests.map(r => r.id), 'approval request');\n  unique(migrated.recurringWorkflows.map(r => r.id), 'recurring workflow');")

# Merge semantics.
replace('src/storage/vault-merge.ts',
"  if(intended.uiLanguage!==base.uiLanguage)next.uiLanguage=intended.uiLanguage;",
"  if(intended.uiLanguage!==base.uiLanguage)next.uiLanguage=intended.uiLanguage;\n  if(intended.activeTeamMemberId!==base.activeTeamMemberId)next.activeTeamMemberId=intended.activeTeamMemberId;")
replace('src/storage/vault-merge.ts',
"  const inventoryMovements=mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);\n  guardRecurringWorkflowChanges",
"  const inventoryMovements=mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);\n  guardConcurrentRecordChanges(base.teamMembers,intended.teamMembers,latest.teamMembers,'Team member','Reopen Access settings before saving this member.');\n  const teamMembers=mergeRecords(base.teamMembers,intended.teamMembers,latest.teamMembers);\n  const approvalPolicies=mergeRecords(base.approvalPolicies,intended.approvalPolicies,latest.approvalPolicies);\n  guardConcurrentRecordChanges(base.approvalRequests,intended.approvalRequests,latest.approvalRequests,'Approval request','Reopen Access settings before deciding this request.');\n  const approvalRequests=mergeRecords(base.approvalRequests,intended.approvalRequests,latest.approvalRequests);\n  guardRecurringWorkflowChanges")
replace('src/storage/vault-merge.ts',
"    inventoryMovements,\n    recurringWorkflows,",
"    inventoryMovements,\n    teamMembers,\n    approvalPolicies,\n    approvalRequests,\n    recurringWorkflows,")

# Settings surface.
replace('src/components/SettingsModal.tsx',
"import type { AppSettings, CompanySettings, DocumentEventRecord } from '../types.js';",
"import type { AppSettings, ApprovalPolicyRecord, ApprovalRequestRecord, CompanySettings, DocumentEventRecord, TeamMemberRecord } from '../types.js';")
replace('src/components/SettingsModal.tsx',
"import { ActivityLogModal } from './ActivityLogModal.js';",
"import { ActivityLogModal } from './ActivityLogModal.js';\nimport { AccessGovernanceSettings } from './AccessGovernanceSettings.js';")
replace('src/components/SettingsModal.tsx',
"  onBackup:(pin:string)=>Promise<void>; onRestore:(file:File,pin:string)=>Promise<void>; documentEvents:DocumentEventRecord[];",
"  onBackup:(pin:string)=>Promise<void>; onRestore:(file:File,pin:string)=>Promise<void>; documentEvents:DocumentEventRecord[];\n  teamMembers:TeamMemberRecord[]; approvalPolicies:ApprovalPolicyRecord[]; approvalRequests:ApprovalRequestRecord[];\n  onSaveTeamMember:(member:TeamMemberRecord)=>Promise<void>; onToggleTeamMember:(id:string)=>Promise<void>; onSetActiveTeamMember:(id:string)=>Promise<void>; onToggleApprovalPolicy:(id:string,enabled:boolean)=>Promise<void>; onDecideApproval:(id:string,decision:'approved'|'rejected')=>Promise<void>;")
replace('src/components/SettingsModal.tsx',
"  tab:'company'|'commercial'|'documents'|'data'|'security';",
"  tab:'company'|'commercial'|'documents'|'access'|'data'|'security';")
replace('src/components/SettingsModal.tsx',
"if(tab==='company'||tab==='commercial'||tab==='documents'||tab==='data'||tab==='security')this.selectSettingsTab(tab);",
"if(tab==='company'||tab==='commercial'||tab==='documents'||tab==='access'||tab==='data'||tab==='security')this.selectSettingsTab(tab);")
replace('src/components/SettingsModal.tsx',
"  private dataCenter():any{return <div className=\"ta-settings-page ta-data-center-page\">",
"  private accessSettings():any{return <div className=\"ta-settings-page ta-access-page\">{this.pageHeader(t('Access','الوصول'),t('Team & approvals','الفريق والموافقات'),t('Operational roles and explicit approval gates for sensitive actions.','الأدوار التشغيلية وبوابات الموافقة الصريحة للإجراءات الحساسة.'))}<AccessGovernanceSettings teamMembers={this.props.teamMembers} approvalPolicies={this.props.approvalPolicies} approvalRequests={this.props.approvalRequests} activeTeamMemberId={this.state.appSettings.activeTeamMemberId} onSaveMember={this.props.onSaveTeamMember} onToggleMember={this.props.onToggleTeamMember} onSetActiveMember={async id=>{await this.props.onSetActiveTeamMember(id);this.setState({appSettings:{...this.state.appSettings,activeTeamMemberId:id}});}} onTogglePolicy={this.props.onToggleApprovalPolicy} onDecideApproval={this.props.onDecideApproval}/></div>;}\n\n  private dataCenter():any{return <div className=\"ta-settings-page ta-data-center-page\">")
replace('src/components/SettingsModal.tsx',
"['documents',t('Documents','المستندات'),'file',t('Output and numbering','الإخراج والترقيم')],['data',t('Data Center','مركز البيانات'),'file',t('Backup and activity','النسخ والنشاط')]",
"['documents',t('Documents','المستندات'),'file',t('Output and numbering','الإخراج والترقيم')],['access',t('Access','الوصول'),'users',t('Team and approvals','الفريق والموافقات')],['data',t('Data Center','مركز البيانات'),'file',t('Backup and activity','النسخ والنشاط')]")
replace('src/components/SettingsModal.tsx',
"          {!accountScope&&this.state.tab==='documents'?this.documentSettings(c,s):null}\n          {!accountScope&&this.state.tab==='data'?this.dataCenter():null}",
"          {!accountScope&&this.state.tab==='documents'?this.documentSettings(c,s):null}\n          {!accountScope&&this.state.tab==='access'?this.accessSettings():null}\n          {!accountScope&&this.state.tab==='data'?this.dataCenter():null}")

# App governance handlers + action gates.
replace('src/app/App.tsx',
"import type { AppSettings, CompanySettings, Customer, DocumentKind, EncryptedVaultRecord, ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, RecurringTarget, RecurringWorkflowRecord, SavedItem, Supplier, SupplierPaymentRecord, UiLanguage, VaultPayload } from '../types.js';",
"import type { AppSettings, ApprovalPolicyRecord, CompanySettings, Customer, DocumentKind, EncryptedVaultRecord, ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, RecurringTarget, RecurringWorkflowRecord, SavedItem, Supplier, SupplierPaymentRecord, TeamMemberRecord, UiLanguage, VaultPayload } from '../types.js';")
replace('src/app/App.tsx',
"import { appendAuditEventsForVaultDiff } from '../lib/audit-diff.js';",
"import { appendAuditEventsForVaultDiff } from '../lib/audit-diff.js';\nimport { approvalGate, decideApprovalRequest } from '../lib/governance.js';")
# Document issue gate.
needle="const updated={...doc,role:doc.role||'standard',lifecycleStatus:doc.lifecycleStatus||'active',revision:Math.max(1,doc.revision||1),creditForId:doc.creditForId||'',creditForNumber:doc.creditForNumber||'',voidedAt:doc.voidedAt||'',voidReason:doc.voidReason||'',bankAccountId:doc.bankAccountId||'',paymentTermPresetId:doc.paymentTermPresetId||'',updatedAt:new Date().toISOString()};if(updated.status==='final'&&existing?.status!=='final')assertCustomerCreditLimit(updated,vault.customers,vault.documents,vault.payments);"
replacement="const updated={...doc,role:doc.role||'standard',lifecycleStatus:doc.lifecycleStatus||'active',revision:Math.max(1,doc.revision||1),creditForId:doc.creditForId||'',creditForNumber:doc.creditForNumber||'',voidedAt:doc.voidedAt||'',voidReason:doc.voidReason||'',bankAccountId:doc.bankAccountId||'',paymentTermPresetId:doc.paymentTermPresetId||'',updatedAt:new Date().toISOString()};if(updated.status==='final'&&existing?.status!=='final'){const gate=approvalGate(vault,{action:'issue-document',entityType:'document',entityId:updated.id,entityLabel:updated.number,entityUpdatedAt:existing?.updatedAt||''});if(!gate.allowed){if(gate.created)await this.persist(gate.vault);throw new Error(t('Approval is required before this document can be issued. Open Settings → Access to approve the request.','يلزم الحصول على موافقة قبل إصدار هذا المستند. افتح الإعدادات ← الوصول للموافقة على الطلب.'));}assertCustomerCreditLimit(updated,vault.customers,vault.documents,vault.payments);}"
replace('src/app/App.tsx',needle,replacement)
# Purchase gates.
replace('src/app/App.tsx',
"private postPurchaseRecord=async(purchase:PurchaseRecord)=>{const vault=this.requireVault();const existing=vault.purchases.find(item=>item.id===purchase.id);",
"private postPurchaseRecord=async(purchase:PurchaseRecord)=>{const vault=this.requireVault();const existing=vault.purchases.find(item=>item.id===purchase.id);const gate=approvalGate(vault,{action:'post-purchase',entityType:'purchase',entityId:purchase.id,entityLabel:purchase.number,entityUpdatedAt:existing?.updatedAt||''});if(!gate.allowed){if(gate.created)await this.persist(gate.vault);throw new Error(t('Approval is required before posting this purchase. Open Settings → Access.','يلزم الحصول على موافقة قبل ترحيل عملية الشراء. افتح الإعدادات ← الوصول.'));}")
replace('src/app/App.tsx',
"private reversePurchaseRecord=async(purchase:PurchaseRecord,reason:string)=>{const vault=this.requireVault();const current=vault.purchases.find(item=>item.id===purchase.id);if(!current)throw new Error(t('Purchase not found.','عملية الشراء غير موجودة.'));",
"private reversePurchaseRecord=async(purchase:PurchaseRecord,reason:string)=>{const vault=this.requireVault();const current=vault.purchases.find(item=>item.id===purchase.id);if(!current)throw new Error(t('Purchase not found.','عملية الشراء غير موجودة.'));const gate=approvalGate(vault,{action:'reverse-purchase',entityType:'purchase',entityId:current.id,entityLabel:current.number,entityUpdatedAt:current.updatedAt});if(!gate.allowed){if(gate.created)await this.persist(gate.vault);throw new Error(t('Approval is required before reversing this purchase. Open Settings → Access.','يلزم الحصول على موافقة قبل عكس عملية الشراء. افتح الإعدادات ← الوصول.'));}")
# Handlers before saveCompany.
replace('src/app/App.tsx',
"  private saveCompany=async(company:CompanySettings)=>{",
"  private saveTeamMember=async(member:TeamMemberRecord)=>{const vault=this.requireVault();const teamMembers=[...vault.teamMembers];const index=teamMembers.findIndex(item=>item.id===member.id);const next={...member,displayName:member.displayName.trim(),email:member.email.trim(),updatedAt:new Date().toISOString()};if(!next.displayName)throw new Error(t('Team member name is required.','اسم عضو الفريق مطلوب.'));if(index>=0)teamMembers[index]=next;else teamMembers.push(next);await this.persist({...vault,teamMembers});};\n  private toggleTeamMember=async(id:string)=>{const vault=this.requireVault();if(id==='owner')throw new Error(t('The workspace owner cannot be suspended.','لا يمكن تعليق مالك مساحة العمل.'));const member=vault.teamMembers.find(item=>item.id===id);if(!member)throw new Error(t('Team member not found.','عضو الفريق غير موجود.'));const status=member.status==='active'?'suspended':'active';const teamMembers=vault.teamMembers.map(item=>item.id===id?{...item,status,updatedAt:new Date().toISOString()}:item);let appSettings=vault.appSettings;if(status==='suspended'&&appSettings.activeTeamMemberId===id)appSettings={...appSettings,activeTeamMemberId:'owner'};await this.persist({...vault,teamMembers,appSettings});};\n  private setActiveTeamMember=async(id:string)=>{const vault=this.requireVault();const member=vault.teamMembers.find(item=>item.id===id&&item.status==='active');if(!member)throw new Error(t('Choose an active team member.','اختر عضو فريق مفعّلًا.'));await this.persist({...vault,appSettings:{...vault.appSettings,activeTeamMemberId:id}});};\n  private toggleApprovalPolicy=async(id:string,enabled:boolean)=>{const vault=this.requireVault();const approvalPolicies=vault.approvalPolicies.map(policy=>policy.id===id?{...policy,enabled}:policy);if(!approvalPolicies.some(policy=>policy.id===id))throw new Error(t('Approval policy not found.','سياسة الموافقة غير موجودة.'));await this.persist({...vault,approvalPolicies});};\n  private decideApproval=async(id:string,decision:'approved'|'rejected')=>{const vault=this.requireVault();await this.persist(decideApprovalRequest(vault,id,decision));this.showToast(decision==='approved'?t('Approval granted.','تمت الموافقة.'):t('Approval rejected.','تم رفض الطلب.'),'success');};\n  private saveCompany=async(company:CompanySettings)=>{")
# Settings props.
replace('src/app/App.tsx',
"<SettingsModal open={this.state.settingsOpen} company={vault.company} appSettings={vault.appSettings} documentEvents={vault.documentEvents}",
"<SettingsModal open={this.state.settingsOpen} company={vault.company} appSettings={vault.appSettings} documentEvents={vault.documentEvents} teamMembers={vault.teamMembers} approvalPolicies={vault.approvalPolicies} approvalRequests={vault.approvalRequests} onSaveTeamMember={this.saveTeamMember} onToggleTeamMember={this.toggleTeamMember} onSetActiveTeamMember={this.setActiveTeamMember} onToggleApprovalPolicy={this.toggleApprovalPolicy} onDecideApproval={this.decideApproval}")

# Styles.
p=Path('index.html'); value=p.read_text(); anchor='  <link rel="stylesheet" href="./styles/tailadmin-reliability-bridge-v320.css?v=320-2" data-lourex-tailadmin-reliability-v320="true" />'
if anchor not in value: raise SystemExit('index css anchor missing')
if 'governance-batch14.css' not in value:value=value.replace(anchor,'  <link rel="stylesheet" href="./styles/governance-batch14.css?v=466-1" data-lourex-governance-batch14="true" />\n'+anchor,1)
p.write_text(value)

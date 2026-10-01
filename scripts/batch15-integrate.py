from pathlib import Path

def text(path): return Path(path).read_text()
def write(path,value): Path(path).write_text(value)
def replace(path,old,new,count=1):
    value=text(path); found=value.count(old)
    if found!=count: raise SystemExit(f'{path}: expected {count}, found {found}: {old[:150]!r}')
    write(path,value.replace(old,new,count))

# ---------- types ----------
replace('src/types.ts',
"export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';\n",
"export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';\n\nexport interface WorkspaceScopeFields { workspaceId?: string; branchId?: string; }\n")
for name in ['Supplier','PurchaseRecord','SupplierPaymentRecord','ExpenseRecord','InventoryMovementRecord','Customer','SavedItem','LourexDocument','PaymentRecord','DocumentRevisionRecord','ApprovalRequestRecord']:
    replace('src/types.ts',f'export interface {name} {{',f'export interface {name} extends WorkspaceScopeFields {{')
replace('src/types.ts',"  workspaceId?: string;\n}\n\nexport interface DocumentRevisionRecord", "  workspaceId?: string;\n  branchId?: string;\n}\n\nexport interface DocumentRevisionRecord")
replace('src/types.ts',
"  activeTeamMemberId: string;\n  numbering: NumberingSettings;",
"  activeTeamMemberId: string;\n  activeWorkspaceId: string;\n  activeBranchId: string;\n  numbering: NumberingSettings;")
replace('src/types.ts',
"export interface TeamMemberRecord {",
"export interface WorkspaceRecord {\n  id: string;\n  name: string;\n  company: CompanySettings;\n  numbering: NumberingSettings;\n  smartDefaults: SmartDocumentDefaults;\n  createdAt: string;\n  updatedAt: string;\n}\n\nexport interface BranchRecord {\n  id: string;\n  workspaceId: string;\n  name: string;\n  code: string;\n  city: string;\n  country: string;\n  active: boolean;\n  createdAt: string;\n  updatedAt: string;\n}\n\nexport interface TeamMemberRecord {")
replace('src/types.ts',
"  workspaceId: string;\n  target: RecurringTarget;",
"  workspaceId: string;\n  branchId: string;\n  target: RecurringTarget;")
replace('src/types.ts',
"  inventoryMovements: InventoryMovementRecord[];\n  teamMembers: TeamMemberRecord[];",
"  inventoryMovements: InventoryMovementRecord[];\n  workspaces: WorkspaceRecord[];\n  branches: BranchRecord[];\n  teamMembers: TeamMemberRecord[];")

# ---------- defaults/schema ----------
replace('src/lib/defaults.ts',
"// v19 adds encrypted team roles, operator context and approval workflow records.\nexport const APP_SCHEMA_VERSION = 19;",
"// v19 adds encrypted team roles, operator context and approval workflow records.\n// v20 adds encrypted multi-company workspaces and branch-scoped operational ledgers.\nexport const APP_SCHEMA_VERSION = 20;")
replace('src/lib/defaults.ts',
"    activeTeamMemberId: 'owner',\n    numbering:",
"    activeTeamMemberId: 'owner',\n    activeWorkspaceId: 'default',\n    activeBranchId: 'main',\n    numbering:")
old="export function emptyVault(): VaultPayload {\n  return { schemaVersion: APP_SCHEMA_VERSION, company: defaultCompany(), appSettings: defaultAppSettings(), customers: [], suppliers: [], purchases: [], supplierPayments: [], expenses: [], inventoryMovements: [], teamMembers: [defaultOwnerMember()], approvalPolicies: DEFAULT_APPROVAL_POLICIES.map(policy=>({...policy,approverRoles:[...policy.approverRoles]})), approvalRequests: [], recurringWorkflows: [], documents: [], documentEvents: [], documentRevisions: [], payments: [], savedItems: [], companyAssets: [] } as VaultPayload & {companyAssets:Array<{id:string;dataUrl:string}>};\n}"
new="export function emptyVault(): VaultPayload {\n  const company=defaultCompany(),appSettings=defaultAppSettings(),now=new Date().toISOString();\n  return { schemaVersion: APP_SCHEMA_VERSION, company, appSettings, customers: [], suppliers: [], purchases: [], supplierPayments: [], expenses: [], inventoryMovements: [], workspaces:[{id:'default',name:'LOUREX',company:structuredClone(company),numbering:structuredClone(appSettings.numbering),smartDefaults:structuredClone(appSettings.smartDefaults),createdAt:now,updatedAt:now}],branches:[{id:'main',workspaceId:'default',name:'Main Branch',code:'MAIN',city:company.city,country:company.country,active:true,createdAt:now,updatedAt:now}], teamMembers: [defaultOwnerMember()], approvalPolicies: DEFAULT_APPROVAL_POLICIES.map(policy=>({...policy,approverRoles:[...policy.approverRoles]})), approvalRequests: [], recurringWorkflows: [], documents: [], documentEvents: [], documentRevisions: [], payments: [], savedItems: [], companyAssets: [] } as VaultPayload & {companyAssets:Array<{id:string;dataUrl:string}>};\n}"
replace('src/lib/defaults.ts',old,new)

# ---------- recurring workflows ----------
replace('src/lib/recurring-workflows.ts',"export const DEFAULT_WORKSPACE_ID='default';", "export const DEFAULT_WORKSPACE_ID='default';\nexport const DEFAULT_BRANCH_ID='main';")
replace('src/lib/recurring-workflows.ts',
"return{id:makeId('recurring'),workspaceId:DEFAULT_WORKSPACE_ID,target,title:",
"return{id:makeId('recurring'),workspaceId:DEFAULT_WORKSPACE_ID,branchId:DEFAULT_BRANCH_ID,target,title:")
replace('src/lib/recurring-workflows.ts',
"  if(record.workspaceId!==DEFAULT_WORKSPACE_ID)throw new Error('Unknown recurring workspace.');",
"  if(!record.workspaceId.trim())throw new Error('Recurring workspace is required.');\n  if(!record.branchId.trim())throw new Error('Recurring branch is required.');")

# ---------- vault migration ----------
replace('src/storage/vault.ts',
"    activeTeamMemberId:stringValue(sourceSettings.activeTeamMemberId,'owner')||'owner',\n    numbering:",
"    activeTeamMemberId:stringValue(sourceSettings.activeTeamMemberId,'owner')||'owner',\n    activeWorkspaceId:stringValue(sourceSettings.activeWorkspaceId,'default')||'default',\n    activeBranchId:stringValue(sourceSettings.activeBranchId,'main')||'main',\n    numbering:")
replace('src/storage/vault.ts',
"id:stringValue(workflow?.id),workspaceId:stringValue(workflow?.workspaceId,'default')||'default',target,title:",
"id:stringValue(workflow?.id),workspaceId:stringValue(workflow?.workspaceId,'default')||'default',branchId:stringValue(workflow?.branchId,'main')||'main',target,title:")
replace('src/storage/vault.ts',
"auditActorKind:event?.auditActorKind==='system'?'system':event?.auditActorKind==='user'?'user':undefined,workspaceId:stringValue(event?.workspaceId)",
"auditActorKind:event?.auditActorKind==='system'?'system':event?.auditActorKind==='user'?'user':undefined,workspaceId:stringValue(event?.workspaceId,'default')||'default',branchId:stringValue(event?.branchId,'main')||'main'")
marker="  const unique = (values: string[], label: string): void => {"
value=text('src/storage/vault.ts')
if marker not in value: raise SystemExit('vault unique marker missing')
insert="""  const rawScope=(key:string,branchScoped:boolean)=>{const source=Array.isArray((vault as any)[key])?(vault as any)[key]:[];return new Map(source.map((row:any)=>[stringValue(row?.id),{workspaceId:stringValue(row?.workspaceId,'default')||'default',branchId:branchScoped?(stringValue(row?.branchId,'main')||'main'):''}]));};
  const restoreScope=(key:keyof VaultPayload,branchScoped:boolean)=>{const map=rawScope(String(key),branchScoped),rows=(migrated as any)[key]??[];(migrated as any)[key]=rows.map((row:any)=>({...row,...(map.get(row.id)??{workspaceId:'default',branchId:branchScoped?'main':''})}));};
  (['customers','suppliers','savedItems'] as const).forEach(key=>restoreScope(key,false));
  (['purchases','supplierPayments','expenses','inventoryMovements','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests'] as const).forEach(key=>restoreScope(key,true));

  const rawWorkspaces=Array.isArray((vault as any).workspaces)?(vault as any).workspaces:[];
  migrated.workspaces=rawWorkspaces.map((workspace:any,index:number)=>({
    id:stringValue(workspace?.id,index===0?'default':''),name:stringValue(workspace?.name,workspace?.company?.nameEn||workspace?.company?.nameAr||`Workspace ${index+1}`),
    company:{...defaults.company,...structuredClone(workspace?.company&&typeof workspace.company==='object'?workspace.company:{})},
    numbering:{...migrated.appSettings.numbering,...structuredClone(workspace?.numbering&&typeof workspace.numbering==='object'?workspace.numbering:{})},
    smartDefaults:{...migrated.appSettings.smartDefaults,...structuredClone(workspace?.smartDefaults&&typeof workspace.smartDefaults==='object'?workspace.smartDefaults:{})},
    createdAt:stringValue(workspace?.createdAt,nowIso()),updatedAt:stringValue(workspace?.updatedAt,workspace?.createdAt?stringValue(workspace.createdAt):nowIso())
  })).filter((workspace:any)=>workspace.id&&workspace.name);
  if(!migrated.workspaces.length)migrated.workspaces=[{id:'default',name:migrated.company.nameEn||migrated.company.nameAr||'LOUREX',company:structuredClone(migrated.company),numbering:structuredClone(migrated.appSettings.numbering),smartDefaults:structuredClone(migrated.appSettings.smartDefaults),createdAt:nowIso(),updatedAt:nowIso()}];
  const rawBranches=Array.isArray((vault as any).branches)?(vault as any).branches:[];
  migrated.branches=rawBranches.map((branch:any,index:number)=>({id:stringValue(branch?.id,index===0?'main':''),workspaceId:stringValue(branch?.workspaceId,'default')||'default',name:stringValue(branch?.name,'Main Branch'),code:stringValue(branch?.code,'MAIN').trim().toUpperCase()||'MAIN',city:stringValue(branch?.city),country:stringValue(branch?.country),active:booleanValue(branch?.active,true),createdAt:stringValue(branch?.createdAt,nowIso()),updatedAt:stringValue(branch?.updatedAt,branch?.createdAt?stringValue(branch.createdAt):nowIso())})).filter((branch:any)=>branch.id&&branch.workspaceId);
  for(const workspace of migrated.workspaces)if(!migrated.branches.some(branch=>branch.workspaceId===workspace.id&&branch.active))migrated.branches.push({id:workspace.id==='default'?'main':`branch-${workspace.id}`,workspaceId:workspace.id,name:'Main Branch',code:'MAIN',city:workspace.company.city,country:workspace.company.country,active:true,createdAt:nowIso(),updatedAt:nowIso()});
  if(!migrated.workspaces.some(workspace=>workspace.id===migrated.appSettings.activeWorkspaceId))migrated.appSettings.activeWorkspaceId=migrated.workspaces.find(workspace=>workspace.id==='default')?.id??migrated.workspaces[0]!.id;
  const activeWorkspace=migrated.workspaces.find(workspace=>workspace.id===migrated.appSettings.activeWorkspaceId)!;
  if(!migrated.branches.some(branch=>branch.workspaceId===activeWorkspace.id&&branch.id===migrated.appSettings.activeBranchId&&branch.active))migrated.appSettings.activeBranchId=migrated.branches.find(branch=>branch.workspaceId===activeWorkspace.id&&branch.active)!.id;
  migrated.company=structuredClone(activeWorkspace.company);
  migrated.appSettings.numbering=structuredClone(activeWorkspace.numbering);
  migrated.appSettings.smartDefaults=structuredClone(activeWorkspace.smartDefaults);

"""
write('src/storage/vault.ts',value.replace(marker,insert+marker,1))
replace('src/storage/vault.ts',
"  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');\n  unique(migrated.teamMembers.map(m => m.id), 'team member');",
"  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');\n  unique(migrated.workspaces.map(w => w.id), 'workspace');\n  unique(migrated.branches.map(b => b.id), 'branch');\n  unique(migrated.teamMembers.map(m => m.id), 'team member');")

# ---------- merge ----------
replace('src/storage/vault-merge.ts',
"  if(intended.activeTeamMemberId!==base.activeTeamMemberId)next.activeTeamMemberId=intended.activeTeamMemberId;",
"  if(intended.activeTeamMemberId!==base.activeTeamMemberId)next.activeTeamMemberId=intended.activeTeamMemberId;\n  if(intended.activeWorkspaceId!==base.activeWorkspaceId)next.activeWorkspaceId=intended.activeWorkspaceId;\n  if(intended.activeBranchId!==base.activeBranchId)next.activeBranchId=intended.activeBranchId;")
replace('src/storage/vault-merge.ts',
"  const inventoryMovements=mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);\n  guardConcurrentRecordChanges(base.teamMembers",
"  const inventoryMovements=mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);\n  const workspaces=mergeRecords(base.workspaces,intended.workspaces,latest.workspaces);\n  const branches=mergeRecords(base.branches,intended.branches,latest.branches);\n  guardConcurrentRecordChanges(base.teamMembers")
replace('src/storage/vault-merge.ts',
"    inventoryMovements,\n    teamMembers,",
"    inventoryMovements,\n    workspaces,\n    branches,\n    teamMembers,")

# ---------- audit scope ----------
replace('src/lib/audit-trail.ts',
"  currency?:string;\n}",
"  currency?:string;\n  workspaceId?:string;\n  branchId?:string;\n}")
replace('src/lib/audit-trail.ts',
"auditEntityType:input.entityType,auditEntityId:input.entityId,auditEntityLabel:input.entityLabel.trim(),auditAction:input.action,auditActorKind:input.actorKind||'user'",
"auditEntityType:input.entityType,auditEntityId:input.entityId,auditEntityLabel:input.entityLabel.trim(),auditAction:input.action,auditActorKind:input.actorKind||'user',workspaceId:input.workspaceId||'default',branchId:input.branchId||'main'")
value=text('src/lib/audit-diff.ts')
value=value.replace("function diffCollection<T extends {id:string}>(before:T[],after:T[],entityType:AuditEntityType,actionFor?:(previous:T,current:T)=>AuditAction):ReturnType<typeof createAuditEvent>[] {",
"function diffCollection<T extends {id:string}>(before:T[],after:T[],entityType:AuditEntityType,workspaceId:string,branchId:string,actionFor?:(previous:T,current:T)=>AuditAction):ReturnType<typeof createAuditEvent>[] {")
value=value.replace("createAuditEvent({entityType,entityId:current.id,entityLabel:labelFor(entityType,current),action:'created'})","createAuditEvent({entityType,entityId:current.id,entityLabel:labelFor(entityType,current),action:'created',workspaceId:String((current as any).workspaceId||workspaceId),branchId:String((current as any).branchId||branchId)})")
value=value.replace("createAuditEvent({entityType,entityId:current.id,entityLabel:labelFor(entityType,current),action:actionFor?actionFor(previous,current):'updated'})","createAuditEvent({entityType,entityId:current.id,entityLabel:labelFor(entityType,current),action:actionFor?actionFor(previous,current):'updated',workspaceId:String((current as any).workspaceId||workspaceId),branchId:String((current as any).branchId||branchId)})")
value=value.replace("createAuditEvent({entityType,entityId:previous.id,entityLabel:labelFor(entityType,previous),action:'deleted'})","createAuditEvent({entityType,entityId:previous.id,entityLabel:labelFor(entityType,previous),action:'deleted',workspaceId:String((previous as any).workspaceId||workspaceId),branchId:String((previous as any).branchId||branchId)})")
old="""  const events=[
    ...diffCollection(base.customers,intended.customers,'customer'),
    ...diffCollection(base.suppliers,intended.suppliers,'supplier'),
    ...diffCollection(base.purchases,intended.purchases,'purchase',purchaseAction)
  ];
  const products=diffCollection(base.savedItems,intended.savedItems,'product').filter(event=>{"""
new="""  const workspaceId=intended.appSettings.activeWorkspaceId||'default',branchId=intended.appSettings.activeBranchId||'main';
  const events=[
    ...diffCollection(base.customers,intended.customers,'customer',workspaceId,branchId),
    ...diffCollection(base.suppliers,intended.suppliers,'supplier',workspaceId,branchId),
    ...diffCollection(base.purchases,intended.purchases,'purchase',workspaceId,branchId,purchaseAction)
  ];
  const products=diffCollection(base.savedItems,intended.savedItems,'product',workspaceId,branchId).filter(event=>{"""
if old not in value: raise SystemExit('audit diff collection block missing')
write('src/lib/audit-diff.ts',value.replace(old,new,1))

# Entity audit panel sees only active branch/session scope.
replace('src/components/EntityAuditLivePanel.tsx',
"import { AuditTimeline } from './AuditTimeline.js';",
"import { AuditTimeline } from './AuditTimeline.js';\nimport { scopeVault } from '../lib/workspaces.js';")
replace('src/components/EntityAuditLivePanel.tsx',
"if(active)setEvents(session?.vault.documentEvents??[]);",
"if(active)setEvents(session?scopeVault(session.vault).documentEvents:[]);")

# ---------- Settings workspace UI ----------
replace('src/components/SettingsModal.tsx',
"import type { AppSettings, ApprovalPolicyRecord, ApprovalRequestRecord, CompanySettings, DocumentEventRecord, TeamMemberRecord } from '../types.js';",
"import type { AppSettings, ApprovalPolicyRecord, ApprovalRequestRecord, BranchRecord, CompanySettings, DocumentEventRecord, TeamMemberRecord, WorkspaceRecord } from '../types.js';")
replace('src/components/SettingsModal.tsx',
"import { AccessGovernanceSettings } from './AccessGovernanceSettings.js';",
"import { AccessGovernanceSettings } from './AccessGovernanceSettings.js';\nimport { WorkspaceBranchSettings } from './WorkspaceBranchSettings.js';")
replace('src/components/SettingsModal.tsx',
"  onSaveTeamMember:(member:TeamMemberRecord)=>Promise<void>; onToggleTeamMember:(id:string)=>Promise<void>; onSetActiveTeamMember:(id:string)=>Promise<void>; onToggleApprovalPolicy:(id:string,enabled:boolean)=>Promise<void>; onDecideApproval:(id:string,decision:'approved'|'rejected')=>Promise<void>;",
"  onSaveTeamMember:(member:TeamMemberRecord)=>Promise<void>; onToggleTeamMember:(id:string)=>Promise<void>; onSetActiveTeamMember:(id:string)=>Promise<void>; onToggleApprovalPolicy:(id:string,enabled:boolean)=>Promise<void>; onDecideApproval:(id:string,decision:'approved'|'rejected')=>Promise<void>;\n  workspaces:WorkspaceRecord[]; branches:BranchRecord[]; onCreateWorkspace:(name:string)=>Promise<void>; onSwitchWorkspace:(id:string)=>Promise<void>; onCreateBranch:(name:string,code:string)=>Promise<void>; onSwitchBranch:(id:string)=>Promise<void>;")
replace('src/components/SettingsModal.tsx',
"  tab:'company'|'commercial'|'documents'|'access'|'data'|'security';",
"  tab:'company'|'workspaces'|'commercial'|'documents'|'access'|'data'|'security';")
replace('src/components/SettingsModal.tsx',
"if(tab==='company'||tab==='commercial'||tab==='documents'||tab==='access'||tab==='data'||tab==='security')this.selectSettingsTab(tab);",
"if(tab==='company'||tab==='workspaces'||tab==='commercial'||tab==='documents'||tab==='access'||tab==='data'||tab==='security')this.selectSettingsTab(tab);")
replace('src/components/SettingsModal.tsx',
"  private accessSettings():any{return",
"  private workspaceManager():any{return <div className=\"ta-settings-page ta-workspaces-page\">{this.pageHeader(t('Companies & Branches','الشركات والفروع'),t('Workspace isolation','عزل مساحات العمل'),t('Switch between company workspaces and operational branches without mixing ledgers.','تنقل بين مساحات الشركات والفروع التشغيلية دون خلط السجلات.'))}<WorkspaceBranchSettings workspaces={this.props.workspaces} branches={this.props.branches} activeWorkspaceId={this.state.appSettings.activeWorkspaceId} activeBranchId={this.state.appSettings.activeBranchId} onCreateWorkspace={this.props.onCreateWorkspace} onSwitchWorkspace={this.props.onSwitchWorkspace} onCreateBranch={this.props.onCreateBranch} onSwitchBranch={this.props.onSwitchBranch}/></div>;}\n\n  private accessSettings():any{return")
replace('src/components/SettingsModal.tsx',
"const tabItems=([['company',t('Workspace','مساحة العمل'),'settings',t('Language and defaults','اللغة والإعدادات')],['commercial'",
"const tabItems=([['company',t('Workspace','مساحة العمل'),'settings',t('Language and defaults','اللغة والإعدادات')],['workspaces',t('Companies','الشركات'),'users',t('Companies and branches','الشركات والفروع')],['commercial'")
replace('src/components/SettingsModal.tsx',
"          {!accountScope&&this.state.tab==='company'?this.workspacePreferences(c,s):null}\n          {!accountScope&&this.state.tab==='commercial'?",
"          {!accountScope&&this.state.tab==='company'?this.workspacePreferences(c,s):null}\n          {!accountScope&&this.state.tab==='workspaces'?this.workspaceManager():null}\n          {!accountScope&&this.state.tab==='commercial'?")

# ---------- App full/scoped persistence ----------
replace('src/app/App.tsx',
"import { approvalGate, decideApprovalRequest } from '../lib/governance.js';",
"import { approvalGate, decideApprovalRequest } from '../lib/governance.js';\nimport { activateBranch, activateWorkspace, applyWorkspaceScope, createBranch, createWorkspace, overlayWorkspaceScope, scopeVault } from '../lib/workspaces.js';")
old="private persist=async(intended:VaultPayload)=>{const base=this.requireVault();const operation=this.vaultWriteTail.catch(()=>null).then(async queued=>{await this.waitForProtectedDataOperation();const key=this.state.key;if(!key)throw new Error(t('App is locked.','التطبيق مقفل.'));const latest=queued??this.state.vault??base;const merged=mergeVaultIntent(base,intended,latest);const audited=appendAuditEventsForVaultDiff(latest,merged);const encrypted=await saveVault(key,audited);this.latestEncryptedVault=encrypted;if(this.state.unlocked&&this.state.key===key)await new Promise<void>(resolve=>this.setState({vault:audited},resolve));this.scheduleCloudSync();return audited;});this.vaultWriteTail=operation;await operation;};"
new="private persist=async(intended:VaultPayload)=>{const base=this.requireVault();const operation=this.vaultWriteTail.catch(()=>null).then(async queued=>{await this.waitForProtectedDataOperation();const key=this.state.key;if(!key)throw new Error(t('App is locked.','التطبيق مقفل.'));const latestFull=queued??this.state.vault;if(!latestFull)throw new Error(t('LOUREX workspace is not ready.','مساحة LOUREX غير جاهزة.'));const latest=scopeVault(latestFull);const scopedIntended=applyWorkspaceScope(base,intended);const merged=mergeVaultIntent(base,scopedIntended,latest);const audited=appendAuditEventsForVaultDiff(latest,merged);const next=overlayWorkspaceScope(latestFull,audited);const encrypted=await saveVault(key,next);this.latestEncryptedVault=encrypted;if(this.state.unlocked&&this.state.key===key)await new Promise<void>(resolve=>this.setState({vault:next},resolve));this.scheduleCloudSync();return next;});this.vaultWriteTail=operation;await operation;};\n  private persistFullMutation=async(mutation:(vault:VaultPayload)=>VaultPayload)=>{const operation=this.vaultWriteTail.catch(()=>null).then(async queued=>{await this.waitForProtectedDataOperation();const key=this.state.key;if(!key)throw new Error(t('App is locked.','التطبيق مقفل.'));const latest=queued??this.state.vault;if(!latest)throw new Error(t('LOUREX workspace is not ready.','مساحة LOUREX غير جاهزة.'));const next=mutation(latest);const encrypted=await saveVault(key,next);this.latestEncryptedVault=encrypted;if(this.state.unlocked&&this.state.key===key)await new Promise<void>(resolve=>this.setState({vault:next},resolve));this.scheduleCloudSync();return next;});this.vaultWriteTail=operation;await operation;};"
replace('src/app/App.tsx',old,new)
# First setup updates default workspace profile.
old="const base=emptyVault();const vault={...base,company,appSettings:{...base.appSettings,uiLanguage:this.state.uiLanguage,smartDefaults:{...base.appSettings.smartDefaults,currency:company.defaultCurrency||'USD',language:company.defaultLanguage,incoterm:company.defaultIncoterm,paymentTerms:company.defaultPaymentTerms,deliveryTime:company.defaultDeliveryTime}}};const setup=await setupVault(pin,vault,recoveryCode);"
new="const base=emptyVault();const vault={...base,company,appSettings:{...base.appSettings,uiLanguage:this.state.uiLanguage,smartDefaults:{...base.appSettings.smartDefaults,currency:company.defaultCurrency||'USD',language:company.defaultLanguage,incoterm:company.defaultIncoterm,paymentTerms:company.defaultPaymentTerms,deliveryTime:company.defaultDeliveryTime}}};const scopedVault=applyWorkspaceScope(base,vault);const setup=await setupVault(pin,scopedVault,recoveryCode);"
replace('src/app/App.tsx',old,new)
# Workspace handlers before team handlers.
replace('src/app/App.tsx',
"  private saveTeamMember=async(member:TeamMemberRecord)=>{",
"  private createCompanyWorkspace=async(name:string)=>{await this.persistFullMutation(vault=>createWorkspace(vault,name));this.showToast(t('Company workspace created.','تم إنشاء مساحة الشركة.'),'success');};\n  private switchCompanyWorkspace=async(id:string)=>{this.editorMustBeClosed('switching company workspaces','تبديل مساحة الشركة');await this.persistFullMutation(vault=>activateWorkspace(vault,id));const current=this.requireVault();await this.syncPublicPreferences(current.company.logoDataUrl,current.appSettings.uiLanguage);this.setState({settingsOpen:false,screen:'home',editorDoc:null});this.showToast(t('Company workspace switched.','تم تبديل مساحة الشركة.'),'success');};\n  private createWorkspaceBranch=async(name:string,code:string)=>{await this.persistFullMutation(vault=>createBranch(vault,name,code));this.showToast(t('Branch created.','تم إنشاء الفرع.'),'success');};\n  private switchWorkspaceBranch=async(id:string)=>{this.editorMustBeClosed('switching branches','تبديل الفرع');await this.persistFullMutation(vault=>activateBranch(vault,id));this.setState({settingsOpen:false,screen:'home',editorDoc:null});this.showToast(t('Branch switched.','تم تبديل الفرع.'),'success');};\n  private saveTeamMember=async(member:TeamMemberRecord)=>{")
# Backup must remain full-vault.
replace('src/app/App.tsx',
"await exportBackup(pin,this.requireVault());",
"const fullVault=this.state.vault;if(!fullVault)throw new Error(t('App is locked.','التطبيق مقفل.'));await exportBackup(pin,fullVault);")
replace('src/app/App.tsx',
"private requireVault():VaultPayload{if(!this.state.vault)throw new Error(t('App is locked.','التطبيق مقفل.'));return this.state.vault;}",
"private requireVault():VaultPayload{if(!this.state.vault)throw new Error(t('App is locked.','التطبيق مقفل.'));return scopeVault(this.state.vault);}")
# Settings props.
replace('src/app/App.tsx',
"approvalRequests={vault.approvalRequests} onSaveTeamMember={this.saveTeamMember}",
"approvalRequests={vault.approvalRequests} workspaces={vault.workspaces} branches={vault.branches} onCreateWorkspace={this.createCompanyWorkspace} onSwitchWorkspace={this.switchCompanyWorkspace} onCreateBranch={this.createWorkspaceBranch} onSwitchBranch={this.switchWorkspaceBranch} onSaveTeamMember={this.saveTeamMember}")

# ---------- direct mutation bridge uses active scope only ----------
replace('src/app/index.tsx',
"import { appendAuditEventsForVaultDiff } from '../lib/audit-diff.js';",
"import { appendAuditEventsForVaultDiff } from '../lib/audit-diff.js';\nimport { applyWorkspaceScope, overlayWorkspaceScope, scopeVault } from '../lib/workspaces.js';")
old="const latest=queued??instance.state.vault;\n        if(!latest)throw new Error(t('LOUREX workspace is not ready.','مساحة LOUREX غير جاهزة.'));\n        const intended=mutation(latest);\n        const next=appendAuditEventsForVaultDiff(latest,intended);"
new="const latestFull=queued??instance.state.vault;\n        if(!latestFull)throw new Error(t('LOUREX workspace is not ready.','مساحة LOUREX غير جاهزة.'));\n        const latest=scopeVault(latestFull);\n        const intended=applyWorkspaceScope(latest,mutation(latest));\n        const next=overlayWorkspaceScope(latestFull,appendAuditEventsForVaultDiff(latest,intended));"
replace('src/app/index.tsx',old,new)

# ---------- CSS ----------
p=Path('index.html'); value=p.read_text(); anchor='  <link rel="stylesheet" href="./styles/tailadmin-reliability-bridge-v320.css?v=320-2" data-lourex-tailadmin-reliability-v320="true" />'
if anchor not in value: raise SystemExit('index css anchor missing')
if 'workspaces-batch15.css' not in value:value=value.replace(anchor,'  <link rel="stylesheet" href="./styles/workspaces-batch15.css?v=467-1" data-lourex-workspaces-batch15="true" />\n'+anchor,1)
p.write_text(value)

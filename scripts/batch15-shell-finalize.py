from pathlib import Path

def read(path): return Path(path).read_text()
def write(path,value): Path(path).write_text(value)
def replace(path,old,new,count=1):
    value=read(path); found=value.count(old)
    if found!=count: raise SystemExit(f'{path}: expected {count}, found {found}: {old[:140]!r}')
    write(path,value.replace(old,new,count))

# External/AI mutation boundary must never receive inactive workspace metadata.
replace('src/app/index.tsx',
"import { applyWorkspaceScope, overlayWorkspaceScope, scopeVault } from '../lib/workspaces.js';",
"import { applyWorkspaceScope, mergeScopedVault, scopeVaultForExternalMutation } from '../lib/workspaces.js';")
replace('src/app/index.tsx',
"const latest=scopeVault(latestFull);\n        const intended=applyWorkspaceScope(latest,mutation(latest));\n        const next=overlayWorkspaceScope(latestFull,appendAuditEventsForVaultDiff(latest,intended));",
"const latest=scopeVaultForExternalMutation(latestFull);\n        const intended=applyWorkspaceScope(latest,mutation(latest));\n        const next=mergeScopedVault(latestFull,appendAuditEventsForVaultDiff(latest,intended));")

# Number reservation may optimistically update state, but state must stay a FULL vault.
p='src/app/App.tsx'; value=read(p)
old="const current=next.vault;const smart=current.appSettings.smartDefaults;"
new="const current=next.vault;const smart=current.appSettings.smartDefaults;"
if old not in value: raise SystemExit('reserveDocument current anchor missing')
old_return="return{doc,vault:current,reservation};};"
new_return="const projected=this.state.vault?overlayWorkspaceScope(this.state.vault,current):current;return{doc,vault:projected,reservation};};"
if value.count(old_return)!=1: raise SystemExit(f'reserveDocument return anchor count={value.count(old_return)}')
write(p,value.replace(old_return,new_return,1))

# App computes active directory labels and passes them to the shell.
replace('src/app/App.tsx',
"    const businessHealth=buildBusinessHealth(vault);\n    const defaultCurrency=",
"    const businessHealth=buildBusinessHealth(vault);\n    const activeWorkspaceMeta=vault.workspaces.find(item=>item.id===vault.appSettings.activeWorkspaceId)??vault.workspaces[0];\n    const activeBranchMeta=vault.branches.find(item=>item.workspaceId===activeWorkspaceMeta?.id&&item.id===vault.appSettings.activeBranchId)??vault.branches.find(item=>item.workspaceId===activeWorkspaceMeta?.id&&item.active);\n    const defaultCurrency=")
replace('src/app/App.tsx',
"<AppShell screen={this.state.screen} logoDataUrl={vault.company.logoDataUrl} language={activeLanguage}",
"<AppShell screen={this.state.screen} logoDataUrl={vault.company.logoDataUrl} language={activeLanguage} workspaceName={activeWorkspaceMeta?.name||'LOUREX'} branchName={activeBranchMeta?.name||activeBranchMeta?.code||t('Main Branch','الفرع الرئيسي')}")

# Compact shell switcher opens canonical Settings > Companies, never a new nav workspace.
replace('src/components/AppShell.tsx',
"  language:UiLanguage;\n  newMenu:boolean;",
"  language:UiLanguage;\n  workspaceName:string;\n  branchName:string;\n  newMenu:boolean;")
replace('src/components/AppShell.tsx',
"  private openSettings=()=>{\n    this.closeCreateMenu();",
"  private openWorkspaces=()=>{\n    this.closeCreateMenu();\n    this.closeMore();\n    try{sessionStorage.setItem('lourex-settings-tab','workspaces');}catch{}\n    this.requestSettingsScope('settings');\n    this.props.onSettings();\n  };\n\n  private openSettings=()=>{\n    this.closeCreateMenu();")
replace('src/components/AppShell.tsx',
"  private navItem=(screen:NavTarget,icon:NavIcon,label:string)=>",
"  private workspaceSwitcher=(className='')=><button type=\"button\" className={`lx-workspace-switcher ${className}`.trim()} onClick={this.openWorkspaces} aria-label={`${t('Workspace','مساحة العمل')}: ${this.props.workspaceName} · ${this.props.branchName}`}><span className=\"ta-account-avatar\"><Icon name=\"users\"/></span><span className=\"lx-workspace-switcher-copy\"><strong>{this.props.workspaceName}</strong><small>{this.props.branchName}</small></span><span className=\"ta-sidebar-account-chevron\" aria-hidden=\"true\">›</span></button>;\n\n  private navItem=(screen:NavTarget,icon:NavIcon,label:string)=>")
replace('src/components/AppShell.tsx',
"          </button>\n        </div>\n\n        <div className=\"ta-sidebar-create\">",
"          </button>\n          {this.workspaceSwitcher('is-desktop')}\n        </div>\n\n        <div className=\"ta-sidebar-create\">")
replace('src/components/AppShell.tsx',
"            {this.syncStatus('ta-sheet-sync')}\n            <button type=\"button\" className=\"ta-sheet-account\"",
"            {this.syncStatus('ta-sheet-sync')}\n            <div className=\"ta-sheet-workspace\">{this.workspaceSwitcher('is-mobile')}</div>\n            <button type=\"button\" className=\"ta-sheet-account\"")

# Settings consumes the shell request and lands directly on Companies & Branches.
p='src/components/SettingsModal.tsx'; value=read(p)
old="      const scope=consumeSettingsScope();\n      const company=structuredClone(this.props.company);"
new="      const scope=consumeSettingsScope();\n      let requestedTab:State['tab']='company';\n      try{if(sessionStorage.getItem('lourex-settings-tab')==='workspaces')requestedTab='workspaces';sessionStorage.removeItem('lourex-settings-tab');}catch{}\n      const company=structuredClone(this.props.company);"
if value.count(old)!=1: raise SystemExit('Settings open scope anchor missing')
value=value.replace(old,new,1)
old2="this.setState({scope,tab:'company',company,appSettings"
if value.count(old2)!=1: raise SystemExit('Settings open tab anchor missing')
value=value.replace(old2,"this.setState({scope,tab:requestedTab,company,appSettings",1)
write(p,value)

# Extend the existing Batch15 visual owner, no duplicate stylesheet.
p='src/styles/workspaces-batch15.css'; value=read(p)
extra="""
.lx-workspace-switcher{display:flex;align-items:center;gap:8px;width:100%;min-width:0;min-height:44px;padding:7px 9px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:inherit;font:inherit;cursor:pointer}.lx-workspace-switcher:hover{border-color:color-mix(in srgb,var(--accent) 55%,var(--border))}.lx-workspace-switcher-copy{display:grid;gap:1px;min-width:0;flex:1;text-align:start}.lx-workspace-switcher-copy strong,.lx-workspace-switcher-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lx-workspace-switcher-copy strong{font-size:12px}.lx-workspace-switcher-copy small{font-size:10px;color:var(--muted)}.ta-sidebar-brand-row{display:grid}.ta-sidebar-brand-row .lx-workspace-switcher{margin-top:7px}.ta-sheet-workspace{margin-top:10px}.ta-sheet-workspace .lx-workspace-switcher{background:var(--surface)}html[dir=\"rtl\"] .lx-workspace-switcher-copy{text-align:right}@media(prefers-reduced-motion:reduce){.lx-workspace-switcher,.lx-workspace-settings *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
"""
if '.lx-workspace-switcher{' not in value:value+=extra
write(p,value)

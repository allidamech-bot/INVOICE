from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} not found')
    return text.replace(old, new, 1)

# 1. Cloud freshness becomes notification-only during a live session.
p = Path('src/cloud/freshness.ts')
s = p.read_text()
s = replace_once(
    s,
    "import { cloudRemoteChangedSinceAnchor, currentCloudUser, reconcileCloudVault, subscribeCloudVaultChanges } from './firebase.js';",
    "import { cloudRemoteChangedSinceAnchor, currentCloudUser, subscribeCloudVaultChanges } from './firebase.js';",
    'freshness import',
)
s = replace_once(s, "let realtimeUid='';", "let realtimeUid='';\nlet remoteUpdateNotified=false;", 'freshness state')
s = replace_once(
    s,
    """    if(!await cloudRemoteChangedSinceAnchor(user.uid))return;
    const result=await reconcileCloudVault(user.uid);
    if(result==='diverged'){
      window.dispatchEvent(new Event('lourex-cloud-conflict'));
      return;
    }
    if(result==='pulled')reloadPreservingWorkspace();""",
    """    const remoteChanged=await cloudRemoteChangedSinceAnchor(user.uid);
    if(!remoteChanged){remoteUpdateNotified=false;return;}
    if(!remoteUpdateNotified){
      remoteUpdateNotified=true;
      window.dispatchEvent(new Event('lourex-cloud-refresh-available'));
    }""",
    'freshness reconcile block',
)
s = s.replace(
    """function reloadPreservingWorkspace():void{
  rememberWorkspaceBeforeAutomaticReload();
  window.location.reload();
}

""",
    '',
)
p.write_text(s)

# 2. Runtime cloud updates and SW activation never auto-reload the app.
p = Path('src/app/index.tsx')
s = p.read_text()
start = s.index('// The account layer may install a newer account copy while the UI is idle.')
end = s.index('// Page-level "/" shortcuts', start)
replacement = """// v310: cloud changes never hard-reload the running workspace.
// Startup reconciliation already runs before React mounts. Runtime changes wait
// for an explicit user action so Draft Studio and autosave cannot be interrupted.
window.addEventListener('lourex-cloud-applied',()=>{
  try{document.documentElement.dataset.lourexCloudApplied='true';}catch{}
});

function showCloudRefreshAvailable():void{
  if(document.querySelector('[data-lourex-cloud-refresh]'))return;
  const notice=document.createElement('div');
  notice.className='toast pwa-update-toast';
  notice.setAttribute('data-lourex-cloud-refresh','true');
  notice.setAttribute('role','status');
  const copy=document.createElement('span');
  copy.style.display='flex';copy.style.flexDirection='column';copy.style.gap='2px';
  const title=document.createElement('strong');title.textContent='Cloud changes available / توجد تحديثات سحابية';
  const detail=document.createElement('small');detail.textContent='Apply after you finish editing / طبّقها بعد الانتهاء من التحرير';
  copy.append(title,detail);
  const reload=document.createElement('button');
  reload.type='button';reload.textContent='Apply / تطبيق';reload.style.minHeight='44px';reload.style.padding='0 12px';reload.style.borderRadius='10px';reload.style.fontWeight='800';
  reload.addEventListener('click',()=>{
    if(reloadUnsafeWorkspaceOpen()){
      detail.textContent='Close the open editor first / أغلق المحرر المفتوح أولًا';
      return;
    }
    rememberWorkspaceBeforeAutomaticReload();
    window.location.reload();
  });
  notice.append(copy,reload);
  document.body.appendChild(notice);
}
window.addEventListener('lourex-cloud-refresh-available',showCloudRefreshAvailable);

"""
s = s[:start] + replacement + s[end:]
s = s.replace(
    """        if(safeSignedOutAuthGatewayForAutomaticReload())window.location.replace(window.location.href);
        return;""",
    """        return;""",
    1,
)
s = replace_once(
    s,
    """          try{setActiveAccountUid(user.uid);await activateAccountStorage(user.uid);}
          finally{window.location.reload();}""",
    """          try{setActiveAccountUid(user.uid);await activateAccountStorage(user.uid);}
          finally{
            signOutTransitionRunning=false;
            window.dispatchEvent(new Event('lourex-cloud-refresh-available'));
          }""",
    'late Firebase restore reload',
)
p.write_text(s)

# 3. Give WebKit/Firebase persistence time to settle before accepting null auth.
p = Path('src/cloud/firebase.ts')
s = p.read_text()
s = replace_once(
    s,
    """  return new Promise(resolve=>{
    let settled=false;let off:undefined|(()=>void);
    const finish=(value:CloudUser|null)=>{if(settled)return;settled=true;if(off)off();resolve(value);};
    const timeout=window.setTimeout(()=>finish(userFrom(auth().currentUser)),timeoutMs);
    off=auth().onAuthStateChanged((user:any)=>{window.clearTimeout(timeout);finish(userFrom(user));},()=>{window.clearTimeout(timeout);finish(null);});
  });""",
    """  return new Promise(resolve=>{
    let settled=false;let off:undefined|(()=>void);let nullTimer:number|undefined;
    const finish=(value:CloudUser|null)=>{if(settled)return;settled=true;if(nullTimer)window.clearTimeout(nullTimer);if(off)off();resolve(value);};
    const timeout=window.setTimeout(()=>finish(userFrom(auth().currentUser)),timeoutMs);
    off=auth().onAuthStateChanged((user:any)=>{
      const resolved=userFrom(user);
      if(resolved){window.clearTimeout(timeout);finish(resolved);return;}
      if(nullTimer)window.clearTimeout(nullTimer);
      nullTimer=window.setTimeout(()=>{
        window.clearTimeout(timeout);
        finish(userFrom(auth().currentUser));
      },1200);
    },()=>{window.clearTimeout(timeout);finish(null);});
  });""",
    'Firebase auth settle block',
)
p.write_text(s)

# 4. Disable custom pull-to-refresh unless a future explicit opt-in is set.
p = Path('public/pull-to-refresh.js')
s = p.read_text()
if 'data-lourex-enable-pull-refresh' not in s:
    s = replace_once(
        s,
        """(()=>{
  const THRESHOLD=76;""",
        """(()=>{
  // v310: ordinary iPhone scrolling must never be interpreted as an app reload.
  if(!document.documentElement.hasAttribute('data-lourex-enable-pull-refresh'))return;
  const THRESHOLD=76;""",
        'pull refresh entry',
    )
p.write_text(s)

# 5. Final contrast + RTL geometry layer.
Path('src/styles/v310-stability-contrast.css').write_text("""/* LOUREX v310 — PIN clarity + mobile RTL geometry */
.pin-unlock-card{border-color:rgba(44,207,216,.34)!important;background:#0b3038!important;box-shadow:0 18px 48px rgba(0,0,0,.22)!important}
.pin-unlock-card h1{color:#f5fbfc!important}
.pin-unlock-card .subtle{color:#b7cbd0!important;opacity:1!important}
.pin-unlock-card .eyebrow{color:#f0b65f!important;opacity:1!important;font-weight:850!important}
.pin-unlock-card .pin-lock-badge{border-color:rgba(44,207,216,.42)!important;background:rgba(28,157,166,.12)!important}
.pin-unlock-card .pin-lock-badge strong{color:#f4fbfc!important;font-weight:900!important}
.pin-unlock-card .pin-lock-badge span{color:#c1d4d8!important;opacity:1!important}
.pin-unlock-card .field-label{color:#d5e3e6!important;font-weight:800!important;opacity:1!important}
.pin-unlock-card .input{border-color:#5b7780!important;background:#f8fbfc!important;color:#18242a!important;box-shadow:none!important}
.pin-unlock-card .input:focus{border-color:#20d3db!important;outline:3px solid rgba(32,211,219,.20)!important;outline-offset:1px!important}
.pin-unlock-card .btn-primary,.pin-unlock-card button[type='submit']{background:#20c9d2!important;border-color:#20c9d2!important;color:#06242b!important;font-weight:900!important}
.pin-unlock-card .auth-utility-controls button{color:#eaf5f6!important;border-color:#35616b!important;background:#103740!important}
.pin-unlock-card .auth-error{color:#ffd7da!important;background:rgba(196,66,76,.17)!important;border-color:rgba(255,118,128,.38)!important}

@media(max-width:800px){
  .app-ui .fintech-dashboard-v280 .command-recent{width:100%!important;max-width:100%!important;margin-inline:0!important;box-sizing:border-box!important;overflow:hidden!important}
  .app-ui .fintech-dashboard-v280 .command-recent .dashboard-panel-heading,
  .app-ui .fintech-dashboard-v280 .dashboard-document-list,
  .app-ui .fintech-dashboard-v280 .dashboard-document-row{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;margin-inline:0!important}
  .app-ui .fintech-dashboard-v280 .dashboard-document-row{padding-inline:12px!important;overflow:hidden!important}
  [dir='rtl'] .app-ui .fintech-dashboard-v280 .dashboard-document-row{direction:rtl!important;text-align:right!important}
  [dir='rtl'] .app-ui .fintech-dashboard-v280 .dashboard-document-copy,
  [dir='rtl'] .app-ui .fintech-dashboard-v280 .dashboard-document-customer,
  [dir='rtl'] .app-ui .fintech-dashboard-v280 .dashboard-document-date{text-align:right!important;justify-self:stretch!important}
  [dir='rtl'] .app-ui .fintech-dashboard-v280 .dashboard-document-amount{text-align:left!important;justify-self:end!important}
  [dir='rtl'] .app-ui .fintech-dashboard-v280 .dashboard-document-status{justify-self:end!important}
}
""")

# 6. Load/caches v310 last so Safari cannot keep stale v309 UI/runtime assets.
p = Path('index.html')
s = p.read_text()
marker = '  <link rel="stylesheet" href="./styles/v309-draft-pin-stability.css?v=309" data-lourex-v309="true" />'
if 'data-lourex-v310' not in s:
    s = replace_once(
        s,
        marker,
        marker + '\n  <link rel="stylesheet" href="./styles/v310-stability-contrast.css?v=310" data-lourex-v310="true" />',
        'v309 stylesheet marker',
    )
p.write_text(s)

p = Path('scripts/v303-visual-cache-refresh.mjs')
s = p.read_text()
s = replace_once(
    s,
    "const generations=['302','303','304','305','306','307','308'];",
    "const generations=['302','303','304','305','306','307','308','309'];",
    'cache generations',
)
s = replace_once(
    s,
    "`const CACHE = 'lourex-invoice-v309';\\n// const CACHE = 'lourex-invoice-v${generation}'; preserved as the immediate pre-v309 cache generation.`",
    "`const CACHE = 'lourex-invoice-v310';\\n// const CACHE = 'lourex-invoice-v${generation}'; preserved as the immediate pre-v310 cache generation.`",
    'cache promotion template',
)
s = s.replace("const CACHE = 'lourex-invoice-v309';\"))", "const CACHE = 'lourex-invoice-v310';\"))")
s = s.replace('Unable to promote the LOUREX PWA cache to v308.', 'Unable to promote the LOUREX PWA cache to v310.')
s = replace_once(
    s,
    "'./styles/v309-draft-pin-stability.css'];",
    "'./styles/v309-draft-pin-stability.css','./styles/v310-stability-contrast.css'];",
    'cache runtime list',
)
s = s.replace('[LOUREX PWA] v309 draft/PIN stability cache generation ready.', '[LOUREX PWA] v310 stability cache generation ready.')
p.write_text(s)

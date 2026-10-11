import { App as BaseApp } from './App.js';
import { AppErrorBoundary } from './AppErrorBoundary.js';
import { startCloudFreshnessWatcher } from '../cloud/freshness.js';
import { subscribePlainCloudChanges } from '../cloud/plain-workspace.js';
import { currentCloudUser, subscribeCloudUser, waitForCloudUser } from '../cloud/firebase.js';
import { adaptiveCloudSettleMs } from '../cloud/coalescing.js';
import { t } from '../lib/i18n.js';
import { activateAccountStorage, activeAccountStorageUid } from '../storage/db.js';
import { getActiveAccountUid, setActiveAccountUid, suspendSession } from '../storage/session.js';

import { registerVaultMutationBridge } from '../storage/vault-mutation-bridge.js';
import { appendAuditEventsForVaultDiff } from '../lib/audit-diff.js';
import { applyWorkspaceScope, mergeScopedVault, scopeVaultForExternalMutation } from '../lib/workspaces.js';
import { mergeVaultIntent } from '../storage/vault-merge.js';

const root=document.getElementById('root');
if(!root)throw new Error('Root element not found.');
const appRoot=root;
const iosWebKit=(()=>{
  try{
    const ua=String(navigator.userAgent||'');
    const platform=String(navigator.platform||'');
    const touchPoints=Number(navigator.maxTouchPoints||0);
    // iPadOS Safari in Desktop Website mode reports MacIntel.
    return /iP(?:hone|ad|od)/i.test(ua)||(platform==='MacIntel'&&touchPoints>1);
  }catch{return false;}
})();

// BaseApp keeps the encryption/Firebase protocol unchanged. This runtime subclass
// replaces runtime scheduling/safety hooks after BaseApp's own class fields have
// initialized. During document editing even callers that request a short explicit
// sync delay are clamped to the adaptive editor quiet window. This closes the
// remaining 80/120/180ms paths that could otherwise push a multi-megabyte vault
// while Safari is typing, laying out and encrypting the same document locally.
class AdaptiveCloudApp extends BaseApp {
  adaptiveCloudRuntime=(()=>{
    const instance=this as any;
    // The app saves through a coalescing timer. Define the scheduler directly
    // instead of binding a possibly unavailable class-field method during the
    // React subclass field-initialization phase.
    const scheduleCloudSync=(delay:number)=>{
      if(!instance.state.cloudUser||!instance.state.cloudLinked||instance.state.cloudSyncState==='conflict')return;
      if(instance.cloudTimer)window.clearTimeout(instance.cloudTimer);
      const offline=typeof navigator!=='undefined'&&!navigator.onLine;
      instance.setState({cloudSyncState:offline?'offline':'queued',
        cloudSyncMessage:offline
          ?t('Offline — changes will sync on reconnect.','غير متصل — ستتم المزامنة عند عودة الاتصال.')
          :t('Saved locally — Firebase sync pending.','محفوظ محليًا — بانتظار مزامنة Firebase.')});
      instance.cloudTimer=window.setTimeout(()=>void instance.flushCloudSync(),
        offline?instance.cloudRetryDelay:delay);
    };
    instance.scheduleCloudSync=(delay?:number)=>{
      const cipherLength=instance.latestEncryptedVault?.cipher?.length??0;
      const editing=isDocumentEditorOpen();
      const adaptive=adaptiveCloudSettleMs(cipherLength,editing);
      const requested=typeof delay==='number'?delay:adaptive;
      const editorSafe=editing?Math.max(requested,adaptive):requested;
      // iPhone/WebKit gets an additional floor while an editor is mounted. Local
      // encrypted persistence is unaffected; this only postpones remote Firebase
      // publication until the user has had a meaningful quiet period.
      const guarded=iosWebKit&&editing?Math.max(30_000,editorSafe):editorSafe;
      return scheduleCloudSync(guarded);
    };
    instance.deferQueuedCloudSaveForDocumentEdit=()=>{
      if(instance.state.cloudSyncState!=='queued'||!instance.cloudTimer)return;
      window.clearTimeout(instance.cloudTimer);
      const adaptive=adaptiveCloudSettleMs(instance.latestEncryptedVault?.cipher?.length??0,true);
      const delay=iosWebKit?Math.max(30_000,adaptive):adaptive;
      instance.cloudTimer=window.setTimeout(()=>void instance.flushCloudSync(),delay);
    };

    // Every AI mutation enters the same validated, UID-scoped, CAS-protected
    // save queue as an ordinary user edit. No encryption key or PIN is used.
    registerVaultMutationBridge(async mutation=>{
      await instance.persistFullMutation((full:any)=>{
        const latest=scopeVaultForExternalMutation(full);
        const intended=applyWorkspaceScope(latest,mutation(latest));
        const validated=mergeVaultIntent(latest,intended,latest);
        return mergeScopedVault(full,appendAuditEventsForVaultDiff(latest,validated));
      });
      if(!instance.state.vault)throw new Error('The account workspace is unavailable.');
      return instance.state.vault;
    });

    // BaseApp already defers a remote vault replacement when cloudReplaceBlocked()
    // is true. Extend that guard to the runtime workspaces that own unsaved local
    // draft state but live below BaseApp (Operations, product editor and shared
    // modals). This prevents an automatic remote pull from reloading the app while
    // the user is typing outside the document editor.
    instance.cloudReplaceBlocked=()=>instance.state.screen==='editor'||instance.state.settingsOpen||instance.state.cloudModal||reloadUnsafeWorkspaceOpen();

    // No session PIN, automatic vault lock, or secondary security prompt.
    instance.resetAutoLock=()=>{
      if(instance.lockTimer){window.clearTimeout(instance.lockTimer);instance.lockTimer=undefined;}
    };
    // The legacy inactivity handler is PIN-specific. Do not bind it during
    // class-field initialization: it may be absent from the compiled base
    // runtime, and no session lock is permitted in the V2 architecture.
    instance.handleVisibilityChange=()=>{
      if(document.visibilityState==='visible'&&instance.state.unlocked&&!instance.cloudReplaceBlocked())
        void instance.cloudSyncNow().catch(()=>undefined);
    };
    return true;
  })();
}

const App=AdaptiveCloudApp;

let accountWasAuthenticated=false;
let signOutTransitionRunning=false;
let pendingAuthLossTimer:number|undefined;
const AUTH_RESTORATION_GRACE_MS=2500;

function clearPendingAuthLoss():void{
  if(pendingAuthLossTimer!==undefined){window.clearTimeout(pendingAuthLossTimer);pendingAuthLossTimer=undefined;}
}

const WORKSPACE_RESUME_KEY='lourex-auto-reload-screen';
type RestorableWorkspace='home'|'documents'|'customers'|'items'|'operations'|'receivables'|'reports';
const RESTORABLE_WORKSPACES:RestorableWorkspace[]=['home','documents','customers','items','operations','receivables','reports'];
const WORKSPACE_SELECTORS:Array<[RestorableWorkspace,string]>=[
  ['home','.ta-finance-dashboard,.workspace-home-page'],
  ['documents','.ta-documents-page,.documents-workspace-v2,.documents-page'],
  ['customers','.ta-customers-page,.ta-customer-profile,.customers-page,.customer-profile-page'],
  ['items','.ta-products-workspace,.ta-product-library-page,.product-library-pro,.saved-items-page'],
  ['operations','.ta-operations-page,.operations-page'],
  ['receivables','.ta-receivables-page,.receivables-page'],
  ['reports','.ta-reports-page,.reports-page']
];

function currentRestorableWorkspace():RestorableWorkspace|null{
  const match=WORKSPACE_SELECTORS.find(([,selector])=>Boolean(document.querySelector(selector)));
  return match?.[0]??null;
}

function rememberWorkspaceBeforeAutomaticReload():void{
  try{
    const screen=currentRestorableWorkspace();
    if(screen)sessionStorage.setItem(WORKSPACE_RESUME_KEY,screen);
    else sessionStorage.removeItem(WORKSPACE_RESUME_KEY);
  }catch{}
}

function pendingRestorableWorkspace():RestorableWorkspace|null{
  try{
    const value=sessionStorage.getItem(WORKSPACE_RESUME_KEY);
    return RESTORABLE_WORKSPACES.includes(value as RestorableWorkspace)?value as RestorableWorkspace:null;
  }catch{return null;}
}

function clearPendingWorkspace():void{try{sessionStorage.removeItem(WORKSPACE_RESUME_KEY);}catch{}}

function workspaceNavigationButton(screen:RestorableWorkspace):HTMLButtonElement|null{
  const index=RESTORABLE_WORKSPACES.indexOf(screen);
  if(index>=0){
    const current=Array.from(document.querySelectorAll<HTMLButtonElement>('.ta-sidebar-nav .ta-nav-item'))[index];
    if(current)return current;
  }
  const primary=Array.from(document.querySelectorAll<HTMLButtonElement>('.shell-nav-primary .shell-nav-button'));
  if(screen==='home')return primary[0]??null;
  if(screen==='documents')return primary[1]??null;
  if(screen==='customers')return primary[2]??null;
  if(screen==='items')return primary[3]??null;
  const groups=Array.from(document.querySelectorAll<HTMLElement>('.shell-nav-group'));
  const finance=groups[0]?Array.from(groups[0].querySelectorAll<HTMLButtonElement>('.shell-nav-button')):[];
  if(screen==='receivables')return finance[0]??null;
  if(screen==='reports')return finance[1]??null;
  return null;
}

function restoreWorkspaceAfterAutomaticReload():void{
  const screen=pendingRestorableWorkspace();
  if(!screen)return;
  if(screen==='home'){clearPendingWorkspace();return;}
  const deadline=Date.now()+12_000;
  const attempt=()=>{
    if(document.querySelector('.ta-auth-page,.auth-page')){clearPendingWorkspace();return;}
    const button=workspaceNavigationButton(screen);
    if(button){clearPendingWorkspace();button.click();return;}
    if(Date.now()>=deadline){clearPendingWorkspace();return;}
    window.setTimeout(attempt,60);
  };
  window.setTimeout(attempt,0);
}

async function suspendPreviousAccountStorage():Promise<void>{
  const previousUid=getActiveAccountUid();
  if(previousUid){
    await activateAccountStorage(previousUid);
    await suspendSession();
  }
  setActiveAccountUid(null);
  await activateAccountStorage(null);
  if(!previousUid)await suspendSession();
}

async function resolveRequiredAccountSession():Promise<boolean>{
  let user=currentCloudUser();
  if(!user){
    try{user=await waitForCloudUser();}catch{}
  }
  accountWasAuthenticated=Boolean(user);
  if(user){
    setActiveAccountUid(user.uid);
    await activateAccountStorage(user.uid);
    let freshLogin=false;
    try{freshLogin=sessionStorage.getItem('lourex-auth-just-signed-in')==='1';if(freshLogin)sessionStorage.removeItem('lourex-auth-just-signed-in');}catch{}
    // An authenticated Firebase session directly authorizes the UID-scoped cache.
    // Old encrypted session keys are not used to open the V2 workspace.
    await suspendSession();
    return true;
  }

  await suspendPreviousAccountStorage();
  return false;
}

function startAccountSignOutWatcher():void{
  const handleAuthChange=(user:ReturnType<typeof currentCloudUser>):void=>{
    if(user){
      clearPendingAuthLoss();
      const selectedStorageUid=activeAccountStorageUid();
      // A late Firebase login from the public gateway must reinitialize React
      // against the *new* account scope, not merely switch IndexedDB underneath
      // the still-mounted public/previous workspace.
      if(selectedStorageUid!==user.uid){
        if(signOutTransitionRunning)return;
        signOutTransitionRunning=true;
        accountWasAuthenticated=true;
        const targetUid=user.uid;
        const complete=((event:Event)=>{
          const detail=(event as CustomEvent<{uid?:string}>).detail;
          if(detail?.uid!==targetUid)return;
          signOutTransitionRunning=false;
          window.removeEventListener('lourex-account-transition-complete',complete as EventListener);
          // The Firebase identity might change while old writes drain.
          const latest=currentCloudUser();
          if(latest?.uid!==targetUid)handleAuthChange(latest);
        }) as EventListener;
        window.addEventListener('lourex-account-transition-complete',complete);
        window.dispatchEvent(new CustomEvent('lourex-account-transition-request',{detail:{uid:targetUid}}));
        return;
      }
      setActiveAccountUid(user.uid);
      accountWasAuthenticated=true;
      try{delete document.documentElement.dataset.lourexCloudSessionLost;}catch{}
      return;
    }

    // A transient null during Firebase persistence restoration must not discard
    // unsaved work. A *confirmed* sign-out must revoke the unlocked vault instead
    // of leaving another person's encrypted workspace visible indefinitely.
    if(!accountWasAuthenticated||signOutTransitionRunning||pendingAuthLossTimer!==undefined)return;
    pendingAuthLossTimer=window.setTimeout(()=>{
      pendingAuthLossTimer=undefined;
      if(currentCloudUser()||signOutTransitionRunning)return;
      if(!activeAccountStorageUid()){accountWasAuthenticated=false;return;}
      accountWasAuthenticated=false;
      signOutTransitionRunning=true;
      try{document.documentElement.dataset.lourexCloudSessionLost='true';}catch{}
      const complete=((event:Event)=>{
        if((event as CustomEvent<{uid?:string|null}>).detail?.uid!==null)return;
        signOutTransitionRunning=false;
        window.removeEventListener('lourex-account-transition-complete',complete as EventListener);
        // Do not lose a new login received during pending sign-out.
        const latest=currentCloudUser();
        if(latest)handleAuthChange(latest);
      }) as EventListener;
      window.addEventListener('lourex-account-transition-complete',complete);
      window.dispatchEvent(new CustomEvent('lourex-account-transition-request',{detail:{uid:null}}));
    },AUTH_RESTORATION_GRACE_MS);
  };
  subscribeCloudUser(handleAuthChange);
}

function startPlainWorkspaceWatcher():void{
  let stop:()=>void=()=>{};
  subscribeCloudUser(user=>{
    stop();stop=()=>{};
    if(!user||activeAccountStorageUid()!==user.uid)return;
    try{
      stop=subscribePlainCloudChanges(user.uid,()=>{
        if(currentCloudUser()?.uid!==user.uid)return;
        window.dispatchEvent(new Event('lourex-cloud-remote-newer'));
      });
    }catch{/* The app will retry from foreground/online events. */}
  });
}

async function start():Promise<void>{
  const accountReady=await resolveRequiredAccountSession();
  // V1 encrypted cloud is deliberately NOT hydrated for fresh V2 accounts.
  ReactDOM.render(<AppErrorBoundary><App/></AppErrorBoundary>,appRoot);
  restoreWorkspaceAfterAutomaticReload();
  // Keep historical encrypted local records available for optional offline recovery.
  // iOS Safari stability mode: cloud saving remains available through App, but
  // the independent realtime freshness watcher is disabled to remove a second
  // Firestore listener/polling loop from the mobile editing runtime.
  // V2 owns its own per-account cloud revision observer. The V1 observer is disabled.
  startPlainWorkspaceWatcher();
  startAccountSignOutWatcher();
}
void start();

function isDocumentEditorOpen():boolean{
  return document.documentElement.hasAttribute('data-lourex-document-editor')||Boolean(document.querySelector('.editor-screen'));
}

function activeDataEntryEditorOpen():boolean{
  return Boolean(document.querySelector('.ta-product-editor.is-open,.ta-operations-page .ta-ops-editor,.product-library-pro.editor-open,.operations-page .purchase-editor'));
}

function inventoryEntryHasDraftInput():boolean{
  const entry=document.querySelector('.ta-operations-page .ta-inventory-entry,.operations-page .ta-inventory-entry,.operations-page .inventory-entry');
  if(!(entry instanceof HTMLElement))return false;
  const item=entry.querySelector<HTMLSelectElement>('select');
  if(item?.value.trim())return true;
  const decimals=Array.from(entry.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]'));
  if(decimals.some(input=>input.value.trim()))return true;
  const textInputs=Array.from(entry.querySelectorAll<HTMLInputElement>('input:not([type="date"]):not([list])'));
  return textInputs.some(input=>input.value.trim());
}

function manualLockUnsafeWorkspaceOpen():boolean{
  if(isDocumentEditorOpen())return true;
  return document.documentElement.hasAttribute('data-lourex-workspace-dirty')||activeDataEntryEditorOpen()||inventoryEntryHasDraftInput();
}

function reloadUnsafeWorkspaceOpen():boolean{
  return isDocumentEditorOpen()||document.documentElement.hasAttribute('data-lourex-workspace-dirty')||activeDataEntryEditorOpen()||Boolean(document.querySelector('.modal-backdrop'));
}

function safeSignedOutAuthGatewayForAutomaticReload():boolean{
  return !currentCloudUser()&&!reloadUnsafeWorkspaceOpen()&&Boolean(document.querySelector('.ta-auth-page,.auth-page'));
}

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

window.addEventListener('keydown',(event:KeyboardEvent)=>{
  if(event.key!=='/'||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||!document.querySelector('.modal-backdrop'))return;
  const target=event.target;
  const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||Boolean(target instanceof HTMLElement&&target.isContentEditable);
  if(typing)return;
  event.stopPropagation();
},{capture:true});

let pendingUpdateWorker:ServiceWorker|null=null;
let reloadForUpdate=false;

function updateNoticeDeferredForWorkspace():void{
  reloadForUpdate=false;
  const notice=document.querySelector('[data-lourex-update]');
  if(!(notice instanceof HTMLElement))return;
  const reload=notice.querySelector('button');
  if(reload instanceof HTMLButtonElement)reload.disabled=false;
  const detail=notice.querySelector('small');
  if(detail instanceof HTMLElement)detail.textContent='Update activated. Close the open editor or data-entry workspace, then reload safely / تم تفعيل التحديث. أغلق المحرر أو مساحة الإدخال المفتوحة ثم أعد التحميل بأمان';
}

function showUpdateNotice(worker?:ServiceWorker|null):void{
  if(worker)pendingUpdateWorker=worker;
  if(document.querySelector('[data-lourex-update]'))return;
  const notice=document.createElement('div');
  notice.className='toast pwa-update-toast';
  notice.setAttribute('data-lourex-update','true');
  notice.setAttribute('role','status');
  notice.style.alignItems='center';
  notice.style.maxWidth='min(470px,calc(100vw - 28px))';

  const copy=document.createElement('span');
  copy.style.display='flex';
  copy.style.flexDirection='column';
  copy.style.gap='2px';
  const title=document.createElement('strong');
  title.textContent='LOUREX update ready / تحديث LOUREX جاهز';
  const detail=document.createElement('small');
  detail.textContent='Close any open editor or data-entry workspace, then update safely / أغلق أي محرر أو مساحة إدخال مفتوحة ثم حدّث بأمان';
  detail.style.opacity='.78';
  copy.append(title,detail);

  const reload=document.createElement('button');
  reload.type='button';
  reload.textContent='Update / تحديث';
  reload.style.minHeight='44px';
  reload.style.padding='0 10px';
  reload.style.border='1px solid #B8A071';
  reload.style.borderRadius='9px';
  reload.style.background='#B8A071';
  reload.style.color='#11110F';
  reload.style.boxShadow='none';
  reload.style.fontWeight='800';
  reload.style.whiteSpace='nowrap';
  reload.addEventListener('click',()=>{
    if(reloadUnsafeWorkspaceOpen()){
      detail.textContent='Close the open editor or data-entry workspace first so unsaved changes are not lost / أغلق المحرر أو مساحة الإدخال المفتوحة أولًا حتى لا تضيع التعديلات غير المحفوظة';
      return;
    }
    rememberWorkspaceBeforeAutomaticReload();
    const waiting=pendingUpdateWorker;
    if(waiting){
      reloadForUpdate=true;
      reload.disabled=true;
      detail.textContent='Applying update… / جارٍ تطبيق التحديث…';
      waiting.postMessage({type:'SKIP_WAITING'});
      return;
    }
    window.location.reload();
  });
  notice.append(copy,reload);
  document.body.appendChild(notice);
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    if(iosWebKit){
      // The iPhone release temporarily runs network/local-first without a service
      // worker. Existing registrations and app caches are retired without touching
      // IndexedDB, PIN metadata or business data. This removes controller/update
      // churn as a source of WebKit reload loops.
      void navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.map(registration=>registration.unregister()))).catch(()=>undefined);
      try{if('caches' in window)void caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lourex-invoice-')).map(key=>caches.delete(key)))).catch(()=>undefined);}catch{}
      return;
    }

    const hadController=Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      const userRequestedReload=reloadForUpdate;
      pendingUpdateWorker=null;
      if(hadController)showUpdateNotice();
      if(!userRequestedReload)return;
      if(reloadUnsafeWorkspaceOpen()){updateNoticeDeferredForWorkspace();return;}
      rememberWorkspaceBeforeAutomaticReload();
      window.location.replace(window.location.href);
    });

    void navigator.serviceWorker.register('./sw.js').then(registration=>registration.update()).catch(()=>undefined);
    void navigator.serviceWorker.ready.then(registration=>{
      if(hadController&&registration.waiting)showUpdateNotice(registration.waiting);
      registration.addEventListener('updatefound',()=>{
        const installing=registration.installing;
        if(!installing)return;
        installing.addEventListener('statechange',()=>{
          if(hadController&&installing.state==='installed')showUpdateNotice(registration.waiting||installing);
        });
      });
    }).catch(()=>undefined);
  });
}

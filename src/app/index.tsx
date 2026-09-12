import { App as BaseApp } from './App.js';
import { AppErrorBoundary } from './AppErrorBoundary.js';
import { startCloudFreshnessWatcher } from '../cloud/freshness.js';
import { hydrateAuthoritativeCloudBeforeApp } from '../cloud/startup.js';
import { currentCloudUser, subscribeCloudUser, waitForCloudUser } from '../cloud/firebase.js';
import { adaptiveCloudSettleMs } from '../cloud/coalescing.js';
import { activateAccountStorage, activeAccountStorageUid, purgeLegacySafetySnapshot } from '../storage/db.js';
import { getActiveAccountUid, resumeAccountSession, setActiveAccountUid, suspendSession } from '../storage/session.js';

const root=document.getElementById('root');
if(!root)throw new Error('Root element not found.');
const appRoot=root;

// BaseApp keeps the encryption/Firebase protocol unchanged. This runtime subclass
// only replaces the two automatic quiet-window schedulers after BaseApp's own class
// fields have initialized. Explicit recovery/manual sync delays still pass
// straight through and are never lengthened by this policy.
class AdaptiveCloudApp extends BaseApp {
  adaptiveCloudRuntime=(()=>{
    const instance=this as any;
    const scheduleCloudSync=instance.scheduleCloudSync.bind(instance);
    instance.scheduleCloudSync=(delay?:number)=>scheduleCloudSync(
      typeof delay==='number'
        ?delay
        :adaptiveCloudSettleMs(instance.latestEncryptedVault?.cipher?.length??0,false)
    );
    instance.deferQueuedCloudSaveForDocumentEdit=()=>{
      if(instance.state.cloudSyncState!=='queued'||!instance.cloudTimer)return;
      window.clearTimeout(instance.cloudTimer);
      const delay=adaptiveCloudSettleMs(instance.latestEncryptedVault?.cipher?.length??0,true);
      instance.cloudTimer=window.setTimeout(()=>void instance.flushCloudSync(),delay);
    };
    return true;
  })();
}

// Preserve the established root contract used by recovery and runtime guards:
// AppErrorBoundary still wraps <App/> directly, while App resolves to the
// adaptive runtime implementation for this release.
const App=AdaptiveCloudApp;

let accountWasAuthenticated=false;
let signOutTransitionRunning=false;

const WORKSPACE_RESUME_KEY='lourex-auto-reload-screen';
type RestorableWorkspace='home'|'documents'|'customers'|'receivables'|'reports'|'items';
const RESTORABLE_WORKSPACES:RestorableWorkspace[]=['home','documents','customers','receivables','reports','items'];
const WORKSPACE_SELECTORS:Array<[RestorableWorkspace,string]>=[
  ['home','.workspace-home-page'],
  ['documents','.documents-workspace-v2,.documents-page'],
  ['customers','.customers-page,.customer-profile-page'],
  ['receivables','.receivables-page'],
  ['reports','.reports-page'],
  ['items','.product-library-pro,.saved-items-page']
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
    // Never carry a workspace destination through an account/auth boundary.
    if(document.querySelector('.auth-page')){clearPendingWorkspace();return;}
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
    // Select the UID-specific local database before any vault/session read. A
    // different account on the same device therefore cannot inherit this user's
    // encrypted vault, session key, preferences or cloud-link metadata.
    await activateAccountStorage(user.uid);
    // A previously unlocked vault key is bound to the Firebase UID and may be
    // resumed only after that same account authenticates. This keeps sign-out a
    // real workspace boundary without making the user enter a second PIN.
    await resumeAccountSession(user.uid);
    return true;
  }

  // Signed-out users must never keep an active workspace marker. Suspend the
  // previous UID inside its own database before moving to the public scope.
  await suspendPreviousAccountStorage();
  return false;
}

function startAccountSignOutWatcher():void{
  subscribeCloudUser(user=>{
    if(user){
      // The selected IndexedDB scope is the authoritative runtime boundary.
      // localStorage markers are shared by browser tabs and therefore must not
      // be trusted to decide whether this live workspace belongs to the new UID.
      const selectedStorageUid=activeAccountStorageUid();
      if(selectedStorageUid&&selectedStorageUid!==user.uid){
        if(signOutTransitionRunning)return;
        signOutTransitionRunning=true;
        accountWasAuthenticated=false;
        void (async()=>{
          try{
            // Firebase can replace one authenticated user with another without
            // emitting an intermediate signed-out state. Never keep account A's
            // React workspace alive while account B is authenticated. Destroy A's
            // usable key in A's own database, move to the public scope, then reload.
            // Startup will select B's physical database before reading any vault.
            await activateAccountStorage(selectedStorageUid);
            await suspendSession();
          }finally{
            setActiveAccountUid(null);
            await activateAccountStorage(null);
            window.location.reload();
          }
        })();
        return;
      }
      setActiveAccountUid(user.uid);
      accountWasAuthenticated=true;
      return;
    }
    if(!accountWasAuthenticated||signOutTransitionRunning)return;

    signOutTransitionRunning=true;
    accountWasAuthenticated=false;
    void (async()=>{
      try{
        // Keep the old account scope selected until its usable key is removed.
        // Only then expose the signed-out public scope and reload the gateway.
        await suspendSession();
      }finally{
        setActiveAccountUid(null);
        await activateAccountStorage(null);
        try{sessionStorage.setItem('lourex-auth-just-signed-out','1');}catch{}
        window.location.reload();
      }
    })();
  });
}

async function start():Promise<void>{
  const accountReady=await resolveRequiredAccountSession();
  // Only reconcile account data when an authenticated account session exists.
  // Signed-out users reach the account gateway immediately.
  if(accountReady)await hydrateAuthoritativeCloudBeforeApp();
  ReactDOM.render(<AppErrorBoundary><App/></AppErrorBoundary>,appRoot);
  restoreWorkspaceAfterAutomaticReload();
  void purgeLegacySafetySnapshot();
  startCloudFreshnessWatcher();
  startAccountSignOutWatcher();
}
void start();

function isDocumentEditorOpen():boolean{
  return document.documentElement.hasAttribute('data-lourex-document-editor')||Boolean(document.querySelector('.editor-screen'));
}

function reloadUnsafeWorkspaceOpen():boolean{
  return isDocumentEditorOpen()||Boolean(document.querySelector('.operations-page,.product-library-pro.editor-open,.modal-backdrop'));
}

function safeSignedOutAuthGatewayForAutomaticReload():boolean{
  return !currentCloudUser()&&!reloadUnsafeWorkspaceOpen()&&Boolean(document.querySelector('.auth-page'));
}

// The account layer may install a newer account copy while the UI is idle.
// Reloading here rehydrates React from the exact encrypted account copy, but
// never discard a document, inline Operations draft, product draft, or modal.
window.addEventListener('lourex-cloud-applied',()=>{
  if(reloadUnsafeWorkspaceOpen())return;
  rememberWorkspaceBeforeAutomaticReload();
  window.location.reload();
});

// Page-level "/" shortcuts must never steal focus from the page behind an open
// dialog. Keep typing inside dialog fields untouched while stopping only the
// background-search shortcut at the capture boundary.
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
  reload.style.border='1px solid rgba(255,255,255,.32)';
  reload.style.borderRadius='9px';
  reload.style.background='#fff';
  reload.style.color='#0b1d2d';
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
    const hadController=Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      const userRequestedReload=reloadForUpdate;
      pendingUpdateWorker=null;
      if(hadController)showUpdateNotice();
      if(!userRequestedReload){
        // A signed-out auth gateway has no editable business state to protect.
        // Reload it automatically after a newly activated worker takes control
        // so Safari cannot keep executing a stale Firebase auth runtime.
        if(safeSignedOutAuthGatewayForAutomaticReload())window.location.replace(window.location.href);
        return;
      }
      // Activation is asynchronous. Re-check immediately before the actual
      // reload so work started after the Update click cannot be discarded.
      if(reloadUnsafeWorkspaceOpen()){updateNoticeDeferredForWorkspace();return;}
      rememberWorkspaceBeforeAutomaticReload();
      window.location.replace(window.location.href);
    });

    // Preserve the established non-fatal registration path: registration/update
    // never forces a reload by itself. Waiting-worker inspection is handled
    // separately so only an explicit user action activates a new version.
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

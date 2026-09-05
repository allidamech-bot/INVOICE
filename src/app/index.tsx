import { App } from './App.js';
import { AppErrorBoundary } from './AppErrorBoundary.js';
import { startCloudFreshnessWatcher } from '../cloud/freshness.js';
import { hydrateAuthoritativeCloudBeforeApp } from '../cloud/startup.js';
import { purgeLegacySafetySnapshot } from '../storage/db.js';

const root=document.getElementById('root');
if(!root)throw new Error('Root element not found.');
const appRoot=root;

async function start():Promise<void>{
  // Resolve the signed-in account copy before App reads local security/session
  // state. This prevents an installed iPhone PWA from unlocking a stale local
  // vault first and only discovering the newer cloud copy afterwards.
  await hydrateAuthoritativeCloudBeforeApp();
  ReactDOM.render(<AppErrorBoundary><App/></AppErrorBoundary>,appRoot);
  void purgeLegacySafetySnapshot();
  startCloudFreshnessWatcher();
}
void start();

function isDocumentEditorOpen():boolean{
  return Boolean(document.querySelector('.editor-screen'));
}

function reloadUnsafeWorkspaceOpen():boolean{
  return isDocumentEditorOpen()||Boolean(document.querySelector('.operations-page,.product-library-pro.editor-open,.modal-backdrop'));
}

// The cloud layer may install a newer account copy while the UI is idle.
// Reloading here rehydrates React from the exact encrypted account copy, but
// never discard a document, inline Operations draft, product draft, or modal.
window.addEventListener('lourex-cloud-applied',()=>{
  if(reloadUnsafeWorkspaceOpen())return;
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
  reload.style.minHeight='34px';
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
      if(!userRequestedReload)return;
      // Activation is asynchronous. Re-check immediately before the actual
      // reload so work started after the Update click cannot be discarded.
      if(reloadUnsafeWorkspaceOpen()){updateNoticeDeferredForWorkspace();return;}
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

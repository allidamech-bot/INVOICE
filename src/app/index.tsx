import { App } from './App.js';
import { AppErrorBoundary } from './AppErrorBoundary.js';
import { startCloudFreshnessWatcher } from '../cloud/freshness.js';
import { purgeLegacySafetySnapshot } from '../storage/db.js';
import { migrateLegacyPinVaultToAccountAccess } from './account-access-migration.js';

const root=document.getElementById('root');
if(!root)throw new Error('Root element not found.');
ReactDOM.render(<AppErrorBoundary><App/></AppErrorBoundary>,root);
void purgeLegacySafetySnapshot();
void migrateLegacyPinVaultToAccountAccess();
startCloudFreshnessWatcher();

window.addEventListener('lourex-cloud-applied',()=>{
  if(document.querySelector('.editor-screen'))return;
  window.location.reload();
});

window.addEventListener('keydown',(event:KeyboardEvent)=>{
  if(event.key!=='/'||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||!document.querySelector('.modal-backdrop'))return;
  const target=event.target;
  const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||Boolean(target instanceof HTMLElement&&target.isContentEditable);
  if(typing)return;
  event.stopPropagation();
},{capture:true});

let pendingUpdateWorker:ServiceWorker|null=null;
let reloadForUpdate=false;
function isDocumentEditorOpen():boolean{return Boolean(document.querySelector('.editor-screen'));}
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
  copy.style.display='flex';copy.style.flexDirection='column';copy.style.gap='2px';
  const title=document.createElement('strong');title.textContent='LOUREX update ready / تحديث LOUREX جاهز';
  const detail=document.createElement('small');detail.textContent='Close any open document, then update safely / أغلق أي مستند مفتوح ثم حدّث بأمان';detail.style.opacity='.78';
  copy.append(title,detail);
  const reload=document.createElement('button');reload.type='button';reload.textContent='Update / تحديث';reload.style.minHeight='34px';reload.style.padding='0 10px';reload.style.border='1px solid rgba(255,255,255,.32)';reload.style.borderRadius='9px';reload.style.background='#fff';reload.style.color='#0b1d2d';reload.style.fontWeight='800';reload.style.whiteSpace='nowrap';
  reload.addEventListener('click',()=>{
    if(isDocumentEditorOpen()){detail.textContent='Close the open document first so its latest changes are saved / أغلق المستند المفتوح أولًا ليتم حفظ آخر التغييرات';return;}
    const waiting=pendingUpdateWorker;
    if(waiting){reloadForUpdate=true;reload.disabled=true;detail.textContent='Applying update… / جارٍ تطبيق التحديث…';waiting.postMessage({type:'SKIP_WAITING'});return;}
    window.location.reload();
  });
  notice.append(copy,reload);document.body.appendChild(notice);
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    const hadController=Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController)showUpdateNotice();if(reloadForUpdate)window.location.replace(window.location.href);});
    void navigator.serviceWorker.register('./sw.js').then(registration=>registration.update()).catch(()=>undefined);
    void navigator.serviceWorker.ready.then(registration=>{
      if(hadController&&registration.waiting)showUpdateNotice(registration.waiting);
      registration.addEventListener('updatefound',()=>{
        const installing=registration.installing;if(!installing)return;
        installing.addEventListener('statechange',()=>{if(hadController&&installing.state==='installed')showUpdateNotice(registration.waiting||installing);});
      });
    }).catch(()=>undefined);
  });
}

import { App } from './App.js';
import { AppErrorBoundary } from './AppErrorBoundary.js';
import { startCloudFreshnessWatcher } from '../cloud/freshness.js';

const root=document.getElementById('root');
if(!root)throw new Error('Root element not found.');
ReactDOM.render(<AppErrorBoundary><App/></AppErrorBoundary>,root);
startCloudFreshnessWatcher();

function showUpdateNotice():void{
  if(document.querySelector('[data-lourex-update]'))return;
  const notice=document.createElement('div');
  notice.className='toast pwa-update-toast';
  notice.setAttribute('data-lourex-update','true');
  notice.setAttribute('role','status');
  notice.style.alignItems='center';
  notice.style.maxWidth='min(430px,calc(100vw - 28px))';

  const copy=document.createElement('span');
  copy.style.display='flex';
  copy.style.flexDirection='column';
  copy.style.gap='2px';
  const title=document.createElement('strong');
  title.textContent='LOUREX updated / تم تحديث LOUREX';
  const detail=document.createElement('small');
  detail.textContent='Reload to use the latest version / أعد التحميل لاستخدام أحدث إصدار';
  detail.style.opacity='.78';
  copy.append(title,detail);

  const reload=document.createElement('button');
  reload.type='button';
  reload.textContent='Reload / تحديث';
  reload.style.minHeight='34px';
  reload.style.padding='0 10px';
  reload.style.border='1px solid rgba(255,255,255,.32)';
  reload.style.borderRadius='9px';
  reload.style.background='#fff';
  reload.style.color='#0b1d2d';
  reload.style.fontWeight='800';
  reload.style.whiteSpace='nowrap';
  reload.addEventListener('click',()=>window.location.reload());
  notice.append(copy,reload);
  document.body.appendChild(notice);
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    const hadController=Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController)showUpdateNotice();});
    void navigator.serviceWorker.register('./sw.js').then(registration=>registration.update()).catch(()=>undefined);
  });
}

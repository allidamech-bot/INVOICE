import { t } from './i18n.js';
import { currentCloudIdToken } from '../cloud/firebase.js';

// Allow the server's provider failover to finish, but never leave a source UI
// waiting indefinitely. Cancellation includes reading the response body.
export class AiRequestError extends Error {
  constructor(message:string,readonly code:string,readonly status:number){super(message);this.name='AiRequestError';}
}
export async function requestAiJson(endpoint:string,payload:unknown,signal?:AbortSignal,timeoutMs=60_000):Promise<any>{
  const controller=new AbortController();let timedOut=false;
  const cancel=()=>controller.abort();
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=window.setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
  try{
    const token=await currentCloudIdToken(controller.signal);
    if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice',Authorization:`Bearer ${token}`},body:JSON.stringify(payload),signal:controller.signal});
    if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
    let body:any=null;try{body=await response.json();}catch{}
    if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
    if(!response.ok)throw new AiRequestError(body?.code==='AI_NOT_CONFIGURED'?t('AI providers are not configured for this deployment. No data was changed.','مزوّدو AI غير مهيّئين لهذه النسخة من الموقع. لم تتغير أي بيانات.'):String(body?.message||t('LOUREX AI could not process this request.','تعذر على ذكاء LOUREX معالجة الطلب.')),String(body?.code||''),response.status);
    if(!body||typeof body!=='object'||Array.isArray(body))throw new Error(t('AI returned an unreadable response. Retry the analysis.','وصل رد غير قابل للقراءة من AI. أعد التحليل.'));
    return body;
  }catch(error){
    if(timedOut)throw new Error(t('AI analysis timed out. Retry or use a smaller source. Nothing was saved.','انتهت مهلة تحليل AI. أعد المحاولة أو استخدم مصدرًا أصغر. لم يتم حفظ شيء.'));
    throw error;
  }finally{window.clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}

import { t } from './i18n.js';
import { currentCloudIdToken } from '../cloud/firebase.js';

// Allow the server's provider failover to finish, but never leave a source UI
// waiting indefinitely. Cancellation includes reading the response body.
export class AiRequestError extends Error {
  constructor(message:string,readonly code:string,readonly status:number){super(message);this.name='AiRequestError';}
}
function aiPublicErrorMessage(code:string,status:number,fallback:string):string{
  if(code==='AI_NOT_CONFIGURED')return t('AI providers are not configured for this deployment. No data was changed.','مزوّدو AI غير مهيّئين لهذه النسخة من الموقع. لم تتغير أي بيانات.');
  if(code==='AI_RATE_LIMITED'||status===429)return t('AI providers are temporarily at capacity. Retry shortly. No data was changed.','مزوّدو الذكاء الاصطناعي مشغولون مؤقتًا. أعد المحاولة بعد قليل. لم تتغير أي بيانات.');
  if(code==='AI_TIMEOUT'||status===504)return t('AI took too long to respond. Retry with a shorter message or fewer files. No data was changed.','استغرق رد الذكاء الاصطناعي وقتًا أطول من المسموح. حاول برسالة أقصر أو ملفات أقل. لم تتغير أي بيانات.');
  if(status===401)return t('Your Firebase account session needs to be refreshed. Sign in again and retry.','تحتاج جلسة حساب Firebase إلى التحديث. سجّل الدخول مجددًا وأعد المحاولة.');
  if(code==='AI_TEMPORARILY_UNAVAILABLE'||status===503)return t('AI providers are temporarily unavailable. Retry shortly. No data was changed.','مزوّدو الذكاء الاصطناعي غير متاحين مؤقتًا. أعد المحاولة بعد قليل. لم تتغير أي بيانات.');
  return fallback||t('LOUREX AI could not process this request.','تعذّر على ذكاء LOUREX معالجة الطلب.');
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
    if(!response.ok){const code=String(body?.code||'');throw new AiRequestError(aiPublicErrorMessage(code,response.status,String(body?.message||'')),code,response.status);}
    if(!body||typeof body!=='object'||Array.isArray(body))throw new Error(t('AI returned an unreadable response. Retry the analysis.','وصل رد غير قابل للقراءة من AI. أعد التحليل.'));
    return body;
  }catch(error){
    if(timedOut)throw new Error(t('AI analysis timed out. Retry or use a smaller source. Nothing was saved.','انتهت مهلة تحليل AI. أعد المحاولة أو استخدم مصدرًا أصغر. لم يتم حفظ شيء.'));
    throw error;
  }finally{window.clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}

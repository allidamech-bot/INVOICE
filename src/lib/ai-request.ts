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
// Server sends this metadata only to its verified diagnostics owner. Never
// render upstream bodies, prompts, credentials or arbitrary response fields.
export function aiOwnerDiagnosticSummary(value:any):string{
  if(!['draft-plan','dialogue'].includes(value?.stage)||!Array.isArray(value.attempts))return '';
  const attempts=value.attempts.slice(0,8).filter((row:any)=>
    ['groq','cloudflare'].includes(row?.provider)&&
    ['ok','low-confidence','schema','unsupported','unavailable','rate_limit','timeout','network','upstream','invalid'].includes(row?.category)&&
    Number.isFinite(row?.latencyMs)&&row.latencyMs>=0&&row.latencyMs<=60000);
  if(!attempts.length)return '';
  return '\n'+(value.stage==='dialogue'?t('Conversation diagnosis: ','تشخيص المحادثة: '):t('Planning diagnosis: ','تشخيص التخطيط: '))+attempts.map((row:any)=>{
    let rejection='';
    if(row.provider==='groq'&&row.rejection?.status===400){
      const names=['response_format','json_schema','strict','include_reasoning','reasoning_effort','reasoning_format','max_completion_tokens','max_tokens','temperature','additionalProperties','required','model','messages'];
      const codes=['invalid_request_error','json_validate_failed','invalid_json_schema','model_not_found','model_not_supported','unsupported_parameter','context_length_exceeded'];
      const code=codes.includes(row.rejection.code)?row.rejection.code:'unknown';
      const param=[...names,'response_format.json_schema','response_format.json_schema.schema','response_format.json_schema.strict'].includes(row.rejection.param)?row.rejection.param:'unknown';
      const fields=Array.isArray(row.rejection.fields)?names.filter(name=>row.rejection.fields.includes(name)):[];
      rejection=` [HTTP400 ${code} ${param} ${fields.join(',')}]`;
    }
    return `${row.provider}: ${row.category} ${Math.round(row.latencyMs)}ms${Number.isInteger(row.fallbackIndex)&&row.fallbackIndex>=0&&row.fallbackIndex<32?` #${row.fallbackIndex+1}`:''}${rejection}`;
  }).join(' · ')+(value.stage==='dialogue'&&Number.isFinite(value.totalLatencyMs)&&value.totalLatencyMs>=0&&value.totalLatencyMs<=60000?' · '+t('total ','الإجمالي ')+Math.round(value.totalLatencyMs)+'ms':'');
}
export async function requestAiJson(endpoint:string,payload:unknown,signal?:AbortSignal,timeoutMs=60_000):Promise<any>{
  const controller=new AbortController();let timedOut=false;
  let rejectStopped:(reason:unknown)=>void=()=>{};
  const stopped=new Promise<never>((_resolve,reject)=>{rejectStopped=reject;});
  const cancel=()=>{controller.abort();rejectStopped(new DOMException('Cancelled','AbortError'));};
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=window.setTimeout(()=>{timedOut=true;cancel();},timeoutMs);
  try{
    // Abort is cooperative. Also settle the caller when a transport/body reader
    // ignores it, so the turn's existing finally path can release loading.
    const work=(async()=>{
    const token=await currentCloudIdToken(controller.signal);
    if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice',Authorization:`Bearer ${token}`},body:JSON.stringify(payload),signal:controller.signal});
    if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
    let body:any=null;try{body=await response.json();}catch{}
    if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
    if(!response.ok){const code=String(body?.code||'');throw new AiRequestError(aiPublicErrorMessage(code,response.status,String(body?.message||''))+aiOwnerDiagnosticSummary(body?.diagnostic)+(typeof body?.requestId==='string'&&/^[A-Za-z0-9._:-]{1,120}$/.test(body.requestId)?'\n'+t('Request ID: ','رقم التتبع: ')+body.requestId:''),code,response.status);}
    if(!body||typeof body!=='object'||Array.isArray(body))throw new Error(t('AI returned an unreadable response. Retry the analysis.','وصل رد غير قابل للقراءة من AI. أعد التحليل.'));
    return body;
    })();
    return await Promise.race([work,stopped]);
  }catch(error){
    if(timedOut)throw new Error(t('AI analysis timed out. Retry or use a smaller source. Nothing was saved.','انتهت مهلة تحليل AI. أعد المحاولة أو استخدم مصدرًا أصغر. لم يتم حفظ شيء.'));
    throw error;
  }finally{window.clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}

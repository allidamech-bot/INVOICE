import type {LourexDocument} from '../types.js';
import {automaticElectronicDocument} from './secure-share.js';

export interface AiChatPdfQrPlan {
  document:LourexDocument;
  electronicShareId:string;
  offlineCopy:boolean;
}

/**
 * A required electronic QR cannot disappear silently when cloud sharing fails.
 * A separate explicit, user-chosen LOCAL preview may be exported with a visible
 * watermark, without changing the issued document or its stored snapshot.
 */
export async function planAiChatPdfQr(
  document:LourexDocument,
  createShare:()=>Promise<string>,
  allowOfflineCopy=false
):Promise<AiChatPdfQrPlan>{
  if(!automaticElectronicDocument(document))
    return{document,electronicShareId:'',offlineCopy:false};
  if(allowOfflineCopy){
    const copy=structuredClone(document);
    copy.appearance={
      ...copy.appearance,
      watermark:{...copy.appearance.watermark,enabled:true,type:'text',text:'LOCAL COPY - NO QR',pattern:'single'}
    };
    return{document:copy,electronicShareId:'',offlineCopy:true};
  }
  const token=await createShare(); // Propagate failures: QR is required by default.
  if(!token)throw new Error('Electronic QR reference is missing. Retry the QR connection.');
  return{document,electronicShareId:token,offlineCopy:false};
}

/** User-safe account QR diagnosis. Never reflect Firebase exception text,
 * document IDs, tokens or provider internals into the chat conversation. */
export function aiChatQrFailureGuidance(error:unknown,ar:boolean):{kind:'inactive'|'auth'|'permission'|'network'|'stale'|'other';message:string}{
  const issue=error&&typeof error==='object'?error as {code?:unknown;message?:unknown}:null;
  const code=typeof issue?.code==='string'?issue.code.toLowerCase():'';
  const message=typeof issue?.message==='string'?issue.message.toLowerCase():
    error instanceof Error?error.message.toLowerCase():'';
  const identified=(key:string)=>code===key||code.endsWith('/'+key);
  const inactive=/\b(?:disabled or expired|expired or revoked|reactivate it)\b|رابط qr متوقف|منتهي.*تفعيله/i.test(message);
  const auth=identified('unauthenticated')||/\b(?:connect your lourex cloud account|sign in again|not authenticated)\b|اتصل بحساب lourex السحابي/i.test(message);
  const permission=identified('permission-denied')||/\bpermission[- ]denied\b|missing or insufficient permissions/i.test(message);
  const network=identified('unavailable')||identified('deadline-exceeded')||
    /\b(?:network request failed|failed to fetch|offline|connection lost|internet unavailable)\b/i.test(message);
  const stale=/\baccount or document changed\b/i.test(message);
  if(inactive)return{kind:'inactive',message:ar
    ?'رابط QR الإلكتروني منتهي أو متوقف. افتح النسخة الإلكترونية لهذا المستند لإعادة تفعيل الرابط، ثم أعد إنشاء PDF. يمكنك اختيار معاينة محلية موسومة بدون QR.'
    :'The electronic QR is expired or disabled. Open this document’s Electronic document area to reactivate it, then retry PDF. A marked local preview without QR is also available.'};
  if(auth)return{kind:'auth',message:ar
    ?'لم يتم تأكيد اتصال حساب LOUREX السحابي. تحقق من تسجيل الدخول إلى الحساب الصحيح ثم أعد إنشاء PDF، أو اختر معاينة محلية موسومة بدون QR.'
    :'Your LOUREX cloud sign-in could not be verified. Check the correct signed-in account and retry PDF, or choose a marked local preview without QR.'};
  if(permission)return{kind:'permission',message:ar
    ?'رفضت صلاحيات الحساب إنشاء رابط QR لهذا المستند. راجع صلاحيات Firebase مع المشرف قبل إعادة المحاولة؛ المعاينة المحلية الموسومة بدون QR متاحة باختيارك.'
    :'Account permissions blocked creation of this document QR. Ask the administrator to check Firebase access before retrying; you may explicitly choose a marked local preview without QR.'};
  if(network)return{kind:'network',message:ar
    ?'تعذر الوصول إلى خدمة QR السحابية. تحقق من الاتصال ثم أعد إنشاء PDF، أو اختر معاينة محلية موسومة بدون QR.'
    :'The cloud QR service could not be reached. Check your connection and retry PDF, or choose a marked local preview without QR.'};
  if(stale)return{kind:'stale',message:ar
    ?'تغير الحساب أو المستند أثناء إنشاء QR. افتح المستند الحالي مجددًا وأعد إنشاء PDF؛ لا تعتمد نسخة قديمة.'
    :'The account or document changed while preparing the QR. Reopen the current document and retry PDF; do not use an outdated copy.'};
  return{kind:'other',message:ar
    ?'تعذر إنشاء QR الإلكتروني. أعد محاولة PDF، أو اختر صراحةً معاينة محلية موسومة بدون QR. لم يُغيّر هذا الخطأ المستند المحفوظ.'
    :'The electronic QR could not be created. Retry PDF or explicitly preview a marked local copy without QR. This error did not change the saved document.'};
}

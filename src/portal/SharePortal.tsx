import type { SecureShareDecision, SecureShareRecord } from '../lib/secure-share.js';
import { secureShareIsActive } from '../lib/secure-share.js';
import { displayDate } from '../lib/id.js';
import { setUiLanguage, t } from '../lib/i18n.js';
import { TemplateRenderer } from '../templates/TemplateRenderer.js';
import { loadPortalShare, markPortalViewed, sendPortalComment, sendPortalDecision } from './share-data.js';

function shareId():string{return decodeURIComponent(location.hash.replace(/^#/,''));}
function languageOf(share:SecureShareRecord):'en'|'ar'{return share.snapshot.language==='ar'?'ar':share.snapshot.language==='en'?'en':navigator.language.toLowerCase().startsWith('ar')?'ar':'en';}
function decisionLabel(value:SecureShareDecision):string{return value==='accepted'?t('Accepted','مقبول'):value==='rejected'?t('Rejected','مرفوض'):t('Awaiting response','بانتظار الرد');}
function scaleForViewport():number{return Math.max(.34,Math.min(1,(window.innerWidth<=760?window.innerWidth-24:860)/794));}
function applyShare(item:SecureShareRecord,setShare:(share:SecureShareRecord)=>void,setComment:(comment:string)=>void):void{const lang=languageOf(item);setUiLanguage(lang);document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';setShare(item);setComment(item.customerComment||'');}
async function waitForPortalPrintReady():Promise<void>{
  try{if(document.fonts)await document.fonts.ready;}catch{}
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
    const pages=document.querySelector<HTMLElement>('.lx-public-document-shell .invoice-pages');
    if(pages?.dataset.paginationReady==='true')break;
    await new Promise<void>(resolve=>window.setTimeout(resolve,40));
  }
  const images=Array.from(document.querySelectorAll<HTMLImageElement>('.lx-public-document-shell img'));
  await Promise.all(images.map(async image=>{
    if(image.complete&&image.naturalWidth>0)return;
    try{if(typeof image.decode==='function'){await image.decode();return;}}catch{}
    await new Promise<void>(resolve=>{let settled=false;const done=()=>{if(settled)return;settled=true;resolve();};image.addEventListener('load',done,{once:true});image.addEventListener('error',done,{once:true});window.setTimeout(done,1200);});
  }));
  await new Promise<void>(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>resolve())));
}

function SharePortal():any{
  const [share,setShare]=React.useState<SecureShareRecord|null>(null),[loading,setLoading]=React.useState(true),[busy,setBusy]=React.useState(false),[printing,setPrinting]=React.useState(false),[error,setError]=React.useState(''),[comment,setComment]=React.useState(''),[scale,setScale]=React.useState(scaleForViewport());
  const id=shareId();
  React.useEffect(()=>{const resize=()=>setScale(scaleForViewport());window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  React.useEffect(()=>{let active=true;void loadPortalShare(id).then((item:SecureShareRecord)=>{if(!active)return;applyShare(item,setShare,setComment);setLoading(false);void markPortalViewed(item.id);}).catch((e:unknown)=>{if(active){setError(e instanceof Error?e.message:'Secure link unavailable.');setLoading(false);}});return()=>{active=false;};},[id]);
  const refresh=async()=>{const item=await loadPortalShare(id);applyShare(item,setShare,setComment);return item;};
  const respond=async(decision?:Exclude<SecureShareDecision,''>)=>{if(!share||busy)return;setBusy(true);setError('');try{if(decision)await sendPortalDecision(share.id,decision,comment);else await sendPortalComment(share.id,comment);await refresh();}catch(e){setError(e instanceof Error?e.message:t('Unable to record your response.','تعذر تسجيل ردك.'));}finally{setBusy(false);}};
  const printDocument=async()=>{if(printing)return;setPrinting(true);setError('');try{await waitForPortalPrintReady();window.print();}catch(e){setError(e instanceof Error?e.message:t('Unable to prepare the document for printing.','تعذر تجهيز المستند للطباعة.'));}finally{setPrinting(false);}};
  if(loading)return <main className="lx-public-portal-state"><strong>LOUREX</strong><span>{t('Opening secure document…','جارٍ فتح المستند الآمن…')}</span></main>;
  if(!share)return <main className="lx-public-portal-state is-error"><strong>{t('Secure link unavailable','الرابط الآمن غير متاح')}</strong><p>{error}</p></main>;
  const lang=languageOf(share),active=secureShareIsActive(share),company=lang==='ar'?(share.snapshot.companySnapshot.nameAr||share.snapshot.companySnapshot.nameEn):(share.snapshot.companySnapshot.nameEn||share.snapshot.companySnapshot.nameAr),customer=lang==='ar'?(share.customerNameAr||share.customerNameEn):(share.customerNameEn||share.customerNameAr);
  return <main className="lx-public-portal">
    <header className="lx-public-header"><div className="lx-public-brand">{share.snapshot.companySnapshot.logoDataUrl?<img src={share.snapshot.companySnapshot.logoDataUrl} alt=""/>:null}<div><strong>{company||'LOUREX'}</strong><span>{t('Secure customer document','مستند عميل آمن')}</span></div></div><div className="lx-public-header-actions"><span className={`lx-public-state decision-${share.decision||'pending'}`}>{decisionLabel(share.decision)}</span><button type="button" disabled={printing} onClick={()=>void printDocument()}>{printing?t('Preparing…','جارٍ التجهيز…'):t('Print / Save PDF','طباعة / حفظ PDF')}</button></div></header>
    <section className="lx-public-meta"><div><small>{t('Document','المستند')}</small><strong><bdi>{share.documentNumber}</bdi></strong></div><div><small>{t('Customer','العميل')}</small><strong>{customer||'—'}</strong></div><div><small>{t('Link expires','تنتهي صلاحية الرابط')}</small><strong>{share.expiresAt?displayDate(share.expiresAt.slice(0,10),lang):'—'}</strong></div></section>
    <section className="lx-public-document-shell"><TemplateRenderer document={share.snapshot} scale={scale}/></section>
    <section className="lx-public-response"><header><div><small>{t('Response','الرد')}</small><h2>{share.allowDecision?t('Review this quotation','مراجعة عرض السعر'):t('Send a comment','إرسال تعليق')}</h2></div></header><label><span>{t('Comment','تعليق')}</span><textarea rows={4} maxLength={1000} disabled={!active||busy} value={comment} onChange={(e:any)=>setComment(e.target.value)}/><small>{comment.length}/1000</small></label>{error?<p className="lx-public-error" role="alert">{error}</p>:null}<div className="lx-public-response-actions">{share.allowDecision&&!share.decision?<><button type="button" className="is-reject" disabled={!active||busy} onClick={()=>void respond('rejected')}>{t('Reject','رفض')}</button><button type="button" className="is-accept" disabled={!active||busy} onClick={()=>void respond('accepted')}>{t('Accept','قبول')}</button></>:null}<button type="button" disabled={!active||busy||!comment.trim()} onClick={()=>void respond()}>{t('Send comment','إرسال التعليق')}</button></div><p className="lx-public-security">{t('This limited portal does not expose the LOUREX account, internal costs, attachments, or other documents.','هذه البوابة المحدودة لا تعرض حساب LOUREX أو التكاليف الداخلية أو المرفقات أو أي مستندات أخرى.')}</p></section>
  </main>;
}
const portalRoot=document.getElementById('portal-root');if(!portalRoot)throw new Error('Secure portal root is missing.');ReactDOM.render(<SharePortal/>,portalRoot);

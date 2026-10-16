import type { LourexDocument } from '../types.js';
import { ensureDocumentElectronicCopy } from '../cloud/secure-share-owner.js';
import { automaticElectronicDocument } from '../lib/secure-share.js';
import { t } from '../lib/i18n.js';
import { TemplateRenderer } from '../templates/TemplateRenderer.js';

/** The editor's normal preview uses the same electronic reference as its PDF. */
export function AutomaticDocumentPreview({document:doc,scale,compact}:{document:LourexDocument;scale?:number;compact?:boolean}):any{
  const identity=doc.id+'|'+doc.updatedAt+'|'+doc.status;
  const [ready,setReady]=React.useState({identity:'',token:'',error:''});
  React.useEffect(()=>{
    let active=true;
    if(automaticElectronicDocument(doc))void ensureDocumentElectronicCopy(doc,{isCurrent:()=>active}).then(share=>{if(active)setReady({identity,token:share.id,error:''});}).catch(()=>{if(active)setReady({identity,token:'',error:t('QR connection unavailable. Retry the document PDF when connected to your LOUREX cloud account.','تعذر الاتصال لتفعيل QR. أعد تصدير المستند بعد الاتصال بحساب LOUREX السحابي.')});});
    return()=>{active=false;};
  },[identity]);
  return <>{ready.identity===identity&&ready.error?<p className="lx-electronic-preview-error" role="status">{ready.error}</p>:null}<TemplateRenderer document={doc} scale={scale} compact={compact} electronicShareId={ready.identity===identity?ready.token:undefined}/></>;
}

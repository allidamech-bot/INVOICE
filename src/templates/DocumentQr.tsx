import { documentQrImage } from '../lib/document-qr.js';
import { secureShareUrl } from '../lib/secure-share.js';

export function DocumentQr({token,language}:{token:string;language:string}):any{
  const image=React.useMemo(()=>documentQrImage(token),[token]);
  const label=language==='ar'?'عرض النسخة الإلكترونية':language==='en'?'View electronic document':'View online · النسخة الإلكترونية';
  return <a className="lx-document-qr" href={secureShareUrl(token)} target="_blank" rel="noopener noreferrer" aria-label={label}>
    <img src={image} width="96" height="96" alt="QR"/>
    <span><strong>{label}</strong><small>{language==='ar'?'امسح الرمز لعرض تفاصيل المستند':'Scan to view document details'}</small></span>
  </a>;
}

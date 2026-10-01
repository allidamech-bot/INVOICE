const STYLE_KEY='lourex-secure-share-batch11';
export function ensureSecureShareStyles():void{
  if(typeof document==='undefined'||document.head.querySelector(`link[data-${STYLE_KEY}]`))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='./styles/secure-share-batch11.css?v=463-1';link.setAttribute(`data-${STYLE_KEY}`,'true');document.head.appendChild(link);
}

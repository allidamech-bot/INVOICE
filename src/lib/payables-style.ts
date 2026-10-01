const STYLE_KEY='lourex-payables-batch9';
export function ensurePayablesStyles():void{
  if(typeof document==='undefined'||document.head.querySelector(`link[data-${STYLE_KEY}]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./styles/payables-batch9.css?v=461-1';
  link.setAttribute(`data-${STYLE_KEY}`,'true');
  document.head.appendChild(link);
}

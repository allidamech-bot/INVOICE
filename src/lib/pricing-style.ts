const STYLE_KEY='lourex-pricing-batch8';
export function ensurePricingStyles():void{
  if(typeof document==='undefined'||document.head.querySelector(`link[data-${STYLE_KEY}]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./styles/pricing-batch8.css?v=460-1';
  link.setAttribute(`data-${STYLE_KEY}`,'true');
  document.head.appendChild(link);
}

const STYLE_KEY='lourex-pricing-batch8';
export function ensurePricingStyles():void{
  if(typeof document==='undefined'||document.head.querySelector(`link[data-${STYLE_KEY}]`))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../styles/pricing-batch8.css',import.meta.url).href;link.setAttribute(`data-${STYLE_KEY}`,'');document.head.appendChild(link);
}

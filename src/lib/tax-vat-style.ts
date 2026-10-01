const STYLE_KEY='lourex-tax-vat-batch10';
export function ensureTaxVatStyles():void{
  if(typeof document==='undefined'||document.head.querySelector(`link[data-${STYLE_KEY}]`))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='./styles/tax-vat-batch10.css?v=462-1';link.setAttribute(`data-${STYLE_KEY}`,'true');document.head.appendChild(link);
}

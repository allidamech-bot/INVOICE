const STYLE_KEY='lourex-inventory-planning-batch7';

export function ensureInventoryPlanningStyles():void{
  if(typeof document==='undefined'||document.querySelector(`link[data-${STYLE_KEY}]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./styles/inventory-planning-batch7.css?v=459-1';
  link.setAttribute(`data-${STYLE_KEY}`,'true');
  document.head.appendChild(link);
}

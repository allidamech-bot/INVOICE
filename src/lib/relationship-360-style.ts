const STYLE_KEY='lourex-relationship-360-batch2';

export function ensureRelationship360Styles():void{
  if(typeof document==='undefined'||document.querySelector(`link[data-${STYLE_KEY}]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./styles/relationship-360-batch2.css?v=454-1';
  link.setAttribute(`data-${STYLE_KEY}`,'true');
  document.head.appendChild(link);
}

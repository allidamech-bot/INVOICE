const STYLE_KEY='lourex-sales-pipeline-batch6';

export function ensureSalesPipelineStyles():void{
  if(typeof document==='undefined'||document.querySelector(`link[data-${STYLE_KEY}]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./styles/sales-pipeline-batch6.css?v=458-1';
  link.setAttribute(`data-${STYLE_KEY}`,'true');
  document.head.appendChild(link);
}

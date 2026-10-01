const STYLE_KEY='lourex-notification-center-batch5';

export function ensureNotificationCenterStyles():void{
  if(typeof document==='undefined'||document.querySelector(`link[data-${STYLE_KEY}]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./styles/notification-center-batch5.css?v=457-1';
  link.setAttribute(`data-${STYLE_KEY}`,'true');
  document.head.appendChild(link);
}

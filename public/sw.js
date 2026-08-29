// v72 — lightweight PWA shell + fresh application runtime.
const CACHE='lourex-invoice-v72';
const SHELL=[
  './','./index.html','./manifest.webmanifest',
  './brand/lourex-logo.svg','./brand/lourex-app-icon.svg',
  './styles/app.css','./styles/rtl.css','./styles/mobile-shell-v71.css','./styles/iphone-fit-v70.css'
];
const RUNTIME_RE=/\/(?:src\/|styles\/).+\.(?:js|css)$/i;

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.all(SHELL.map(async asset=>{
    try{
      const response=await fetch(asset,{cache:'reload'});
      if(response.ok)await cache.put(asset,response.clone());
    }catch{}
  }));
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));

async function networkFirst(request){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request,{cache:'no-cache'});
    if(response.ok)void cache.put(request,response.clone());
    return response;
  }catch{
    const cached=await cache.match(request);
    if(cached)return cached;
    if(request.mode==='navigate')return (await cache.match('./index.html'))||new Response('',{status:504,statusText:'Offline'});
    return new Response('',{status:504,statusText:'Offline'});
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  // Configuration, HTML and application runtime must prefer the network so a
  // repaired cloud-sync client is never trapped behind an old iPhone cache.
  if(url.pathname.endsWith('/runtime-config.js')||event.request.mode==='navigate'||RUNTIME_RE.test(url.pathname)){
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(cached)return cached;
    try{
      const response=await fetch(event.request);
      if(response.ok)void caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
      return response;
    }catch{return new Response('',{status:504,statusText:'Offline'});}
  })());
});
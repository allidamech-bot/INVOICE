(()=>{
  const runtime=window.__LOUREX_RUNTIME__;
  if(!runtime||runtime.environment!=='production'||!runtime.canonicalHost)return;
  if(window.location.hostname===runtime.canonicalHost)return;
  const target=`https://${runtime.canonicalHost}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
})();

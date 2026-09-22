/* LOUREX v286/v299 presentation helper.
   Loads the review visual layers after the complete legacy stylesheet stack, with
   v299 deliberately last, then detects a true zero-baseline cash chart so the Home
   dashboard can show a compact empty state. No business data is changed. */
(function(){
  function ensureStylesheet(marker,href){
    if(document.querySelector('link['+marker+']'))return;
    var link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    link.setAttribute(marker,'true');
    document.head.appendChild(link);
  }

  function loadReviewVisualSystem(){
    ensureStylesheet('data-lourex-v288','./styles/visual-experience-v288.css?v=288');
    ensureStylesheet('data-lourex-v289','./styles/visual-audit-v289.css?v=289');
    ensureStylesheet('data-lourex-v290','./styles/visual-hardening-v290.css?v=290');
    ensureStylesheet('data-lourex-v291','./styles/visual-closeout-v291.css?v=291-2');
    ensureStylesheet('data-lourex-v292','./styles/visual-deep-audit-v292.css?v=292');
    ensureStylesheet('data-lourex-v293','./styles/visual-interaction-closeout-v293.css?v=293');
    ensureStylesheet('data-lourex-v294','./styles/visual-workspace-geometry-v294.css?v=294');
    ensureStylesheet('data-lourex-v295','./styles/visual-contrast-closeout-v295.css?v=295');
    ensureStylesheet('data-lourex-v296','./styles/visual-document-panels-v296.css?v=296');
    ensureStylesheet('data-lourex-v297','./styles/visual-editor-interaction-v297.css?v=297');
    ensureStylesheet('data-lourex-v298','./styles/visual-overlay-accessibility-v298.css?v=298');
    ensureStylesheet('data-lourex-v299','./styles/visual-auth-settings-closeout-v299.css?v=299');
    ensureStylesheet('data-lourex-v302','./styles/mobile-visual-recovery-v302.css?v=302');
    if(document.documentElement.dataset.uiTheme==='light')document.documentElement.style.backgroundColor='#e8eeeb';
  }

  function polylineOnZeroBaseline(node){
    if(!node)return false;
    var raw=String(node.getAttribute('points')||'').trim();
    if(!raw)return true;
    var points=raw.split(/\s+/).map(function(pair){return pair.split(',').map(Number);}).filter(function(pair){return pair.length===2&&Number.isFinite(pair[1]);});
    if(!points.length)return true;
    return points.every(function(pair){return Math.abs(pair[1]-198)<=0.6;});
  }

  function refresh(){
    document.querySelectorAll('.fintech-dashboard-v280 .command-performance-panel').forEach(function(panel){
      var sales=panel.querySelector('.command-chart-line.line-sales');
      var collected=panel.querySelector('.command-chart-line.line-collected');
      var zeroCash=Boolean(sales&&collected&&polylineOnZeroBaseline(sales)&&polylineOnZeroBaseline(collected));
      panel.classList.toggle('is-empty-chart',zeroCash);
    });
  }

  function start(){
    loadReviewVisualSystem();
    refresh();
    var root=document.getElementById('root')||document.body;
    if(!root)return;
    var observer=new MutationObserver(function(){requestAnimationFrame(refresh);});
    observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['points']});
    window.addEventListener('resize',refresh,{passive:true});
  }

  loadReviewVisualSystem();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();

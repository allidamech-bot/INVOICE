/* LOUREX v286/v291 presentation helper.
   Loads the review visual layers after the complete legacy stylesheet stack, with
   v291 deliberately last, then detects a true zero-baseline cash chart so the Home
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
    ensureStylesheet('data-lourex-v291','./styles/visual-closeout-v291.css?v=291');
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

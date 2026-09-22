/* LOUREX v286 Home presentation helper.
   Detects a true zero-baseline cash chart so the dashboard can show a compact
   empty state instead of a large meaningless grid. No business data is changed. */
(function(){
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
    refresh();
    var root=document.getElementById('root')||document.body;
    if(!root)return;
    var observer=new MutationObserver(function(){requestAnimationFrame(refresh);});
    observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['points']});
    window.addEventListener('resize',refresh,{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();

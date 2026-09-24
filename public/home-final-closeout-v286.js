/* LOUREX Home presentation bootstrap — v314 canonical ownership.
   Historical Home-only styles are retired here, while the shared visual-system
   layers remain intact. The canonical v314 Home stylesheet is appended last so
   dashboard geometry has one predictable owner. Home data/empty-state logic is
   owned by React and no longer needs a DOM-wide MutationObserver. */
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
    if(document.documentElement.dataset.uiTheme==='light')document.documentElement.style.backgroundColor='#e8eeeb';
  }

  function retireHistoricalHomeStyles(){
    var historical=[
      'home-premium-command-center-v283.css',
      'home-review-polish-v285.css',
      'home-final-closeout-v286.css'
    ];
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach(function(link){
      var href=String(link.getAttribute('href')||'');
      if(historical.some(function(name){return href.indexOf(name)!==-1;}))link.remove();
    });
  }

  function installCanonicalHome(){
    retireHistoricalHomeStyles();
    ensureStylesheet('data-lourex-home-v314','./styles/home-canonical-v314.css?v=314');
  }

  function install(){
    loadReviewVisualSystem();
    installCanonicalHome();
  }

  install();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
})();

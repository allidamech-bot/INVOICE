/* LOUREX presentation guard — v351 single-owner visual stack.
   The stylesheet stack is owned by index.html in source/dev and by app.bundle.css
   in built output. This runtime may retire stale historical owners, but it must
   never append, reorder, or duplicate active TailAdmin styles after first paint. */
(function(){
  var legacyVisualOwners=[
    'app-shell-v161.css','mobile-shell-v71.css','fintech-shell-v280.css',
    'dashboard-documents.css','customers-premium-v170.css','customer-document-flow-v109.css',
    'financial-workspaces-v189.css','receivables-v133.css','reports-v135.css','operations-v137.css',
    'settings-workspace-v108.css','settings-account-v163.css','auth-entry.css','onboarding-simplification-v115.css','mobile-auth-modal-v150.css','account-cloud-separation-v186.css','unified-account-v189.css',
    'editor-system.css','editor-workflow-v61.css','editor-hierarchy-v93.css','editor-guided-flow-v107.css','editor-workspace-v162.css',
    'global-search-v277.css',
    'fintech-workspaces-v280.css','fintech-responsive-v280.css','premium-fintech-polish-v281.css','premium-mobile-closeout-v281.css',
    'home-premium-command-center-v283.css','home-review-polish-v285.css','home-final-closeout-v286.css',
    'visual-experience-v288.css','visual-audit-v289.css','visual-hardening-v290.css','visual-closeout-v291.css','visual-deep-audit-v292.css','visual-interaction-closeout-v293.css','visual-workspace-geometry-v294.css','visual-contrast-closeout-v295.css','visual-document-panels-v296.css','visual-editor-interaction-v297.css','visual-overlay-accessibility-v298.css','visual-auth-settings-closeout-v299.css','visual-features-v300.css',
    'security-documents-closeout-v302.css','v308-document-studio.css','v310-stability-contrast.css','v311-quality-pass.css',
    'home-canonical-v314.css','shell-canonical-v314.css','shell-overlays-v314.css','documents-canonical-v314.css','editor-canonical-v314.css','customers-canonical-v314.css','products-canonical-v314.css','operations-canonical-v314.css','finance-canonical-v314.css','reports-canonical-v314.css','settings-canonical-v314.css','auth-canonical-v314.css','overlays-canonical-v314.css',
    'visual-coherence-v303.css','loading-more-settings-v307.css','release-audit-v311.css'
  ];

  function isLegacyVisualLink(node){
    if(!(node instanceof HTMLLinkElement)||node.rel!=='stylesheet')return false;
    var href=String(node.getAttribute('href')||'');
    return legacyVisualOwners.some(function(name){return href.indexOf(name)!==-1;});
  }

  function retireLegacyVisualLayers(){
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach(function(link){
      if(isLegacyVisualLink(link))link.remove();
    });
  }

  function retireInlineLegacyOwners(){
    document.querySelectorAll('style[data-lourex-ai-core]').forEach(function(style){style.remove();});
  }

  function normalizeCanvas(){
    var root=document.documentElement;
    var dark=root.dataset.uiTheme==='dark';
    var background=dark?'#081321':'#f4f7fb';
    root.style.backgroundColor=background;
    if(!root.dataset.lourexBooting){
      var theme=document.querySelector('meta[name="theme-color"]');
      if(theme)theme.setAttribute('content',background);
    }
  }

  function watchLegacyReinjection(){
    var observer=new MutationObserver(function(mutations){
      mutations.forEach(function(mutation){
        mutation.addedNodes.forEach(function(node){
          if(!(node instanceof Element))return;
          if(node.matches('style[data-lourex-ai-core]')){node.remove();return;}
          if(isLegacyVisualLink(node)){node.remove();return;}
          node.querySelectorAll&&node.querySelectorAll('style[data-lourex-ai-core]').forEach(function(style){style.remove();});
          node.querySelectorAll&&node.querySelectorAll('link[rel="stylesheet"][href]').forEach(function(link){if(isLegacyVisualLink(link))link.remove();});
        });
      });
    });
    if(document.head)observer.observe(document.head,{childList:true,subtree:true});
    if(document.body)observer.observe(document.body,{childList:true,subtree:true});
  }

  /* v351 deliberately does not call ensureStylesheet() and does not move active
     TailAdmin <link> nodes. In production app.bundle.css already contains the
     canonical stack; appending those files again caused duplicate cascade layers,
     extra cache entries and spacing/layout re-resolution after startup. */
  function installPresentationGuard(){
    retireLegacyVisualLayers();
    retireInlineLegacyOwners();
    normalizeCanvas();
    watchLegacyReinjection();
  }

  installPresentationGuard();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){retireLegacyVisualLayers();retireInlineLegacyOwners();normalizeCanvas();},{once:true});
})();
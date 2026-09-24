/* LOUREX presentation bootstrap — v320 TailAdmin Finance full replacement.
   Legacy visual owners are retired before React mounts. Feature, print and
   reliability layers remain available underneath; TailAdmin owns the UI. */
(function(){
  function ensureStylesheet(marker,href){
    if(document.querySelector('link['+marker+']'))return;
    var link=document.createElement('link');
    link.rel='stylesheet';link.href=href;link.setAttribute(marker,'true');document.head.appendChild(link);
  }

  /* Deliberately conservative: only files whose responsibility is a superseded
     visual generation are retired here. Mobile/Safari/output/feature CSS stays. */
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

  function retireLegacyVisualLayers(){
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach(function(link){
      var href=String(link.getAttribute('href')||'');
      if(legacyVisualOwners.some(function(name){return href.indexOf(name)!==-1;}))link.remove();
    });
  }

  function retireInlineLegacyOwners(){document.querySelectorAll('style[data-lourex-ai-core]').forEach(function(style){style.remove();});}

  function normalizeCanvas(){
    var root=document.documentElement;
    var dark=root.dataset.uiTheme==='dark';
    root.style.backgroundColor=dark?'#0c111d':'#f9fafb';
    if(!root.dataset.lourexBooting){
      var theme=document.querySelector('meta[name="theme-color"]');
      if(theme)theme.setAttribute('content',dark?'#0c111d':'#f9fafb');
    }
  }

  function watchLegacyReinjection(){
    retireInlineLegacyOwners();
    var callback=function(mutations){
      mutations.forEach(function(mutation){
        mutation.addedNodes.forEach(function(node){
          if(!(node instanceof Element))return;
          if(node.matches('style[data-lourex-ai-core]'))node.remove();
          if(node.matches('link[rel="stylesheet"][href]')){
            var href=String(node.getAttribute('href')||'');
            if(legacyVisualOwners.some(function(name){return href.indexOf(name)!==-1;}))node.remove();
          }
        });
      });
    };
    var observer=new MutationObserver(callback);
    if(document.head)observer.observe(document.head,{childList:true});
    if(document.body)observer.observe(document.body,{childList:true,subtree:true});
  }

  function installTailAdminV320(){
    retireLegacyVisualLayers();
    ensureStylesheet('data-lourex-tailadmin-v320','./styles/tailadmin-finance-v320.css?v=320-3');
    ensureStylesheet('data-lourex-tailadmin-shell-v320','./styles/tailadmin-shell-v320.css?v=320-3');
    ensureStylesheet('data-lourex-tailadmin-dashboard-v320','./styles/tailadmin-dashboard-v320.css?v=320-3');
    ensureStylesheet('data-lourex-tailadmin-documents-v320','./styles/tailadmin-documents-v320.css?v=320-3');
    ensureStylesheet('data-lourex-tailadmin-editor-frame-v320','./styles/tailadmin-editor-frame-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-editor-core-v320','./styles/tailadmin-editor-core-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-attachments-v320','./styles/tailadmin-attachments-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-customers-v320','./styles/tailadmin-customers-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-products-v320','./styles/tailadmin-products-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-finance-workspaces-v320','./styles/tailadmin-finance-workspaces-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-operations-v320','./styles/tailadmin-operations-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-settings-v320','./styles/tailadmin-settings-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-auth-v320','./styles/tailadmin-auth-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-cloud-account-v320','./styles/tailadmin-cloud-account-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-ai-v320','./styles/tailadmin-ai-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-overlays-v320','./styles/tailadmin-overlays-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-utilities-v320','./styles/tailadmin-utilities-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-visual-finish-v320','./styles/tailadmin-visual-finish-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-reliability-v320','./styles/tailadmin-reliability-bridge-v320.css?v=320-2');
    normalizeCanvas();
  }

  installTailAdminV320();
  watchLegacyReinjection();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){retireLegacyVisualLayers();normalizeCanvas();},{once:true});
})();
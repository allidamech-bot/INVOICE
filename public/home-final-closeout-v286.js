/* LOUREX presentation bootstrap — v320 TailAdmin Finance replacement.
   v320 owns the screen UI. Historical visual generations are retired before the
   React application mounts; reliability-only layers remain loaded from index.html. */
(function(){
  function ensureStylesheet(marker,href){
    if(document.querySelector('link['+marker+']'))return;
    var link=document.createElement('link');
    link.rel='stylesheet';link.href=href;link.setAttribute(marker,'true');document.head.appendChild(link);
  }
  var legacyVisualOwners=[
    'refinement.css','premium.css','system-polish.css','experience.css','accounting-polish.css','workflow-premium.css','workflow-closeout.css','v44-audit.css',
    'editor-system.css','editor-workflow-v61.css','editor-hierarchy-v93.css','editor-guided-flow-v107.css','editor-workspace-v162.css',
    'workspace-mobile-v94.css','saved-items-v95.css','premium-smoothness-v99.css','items-library-v106.css','settings-workspace-v108.css','customer-document-flow-v109.css','system-closeout-v110.css','product-library-pro-v113.css','customer-ux-closeout-v114.css','onboarding-simplification-v115.css',
    'app-shell-v161.css','dashboard-documents.css','settings-account-v163.css','design-system-v164.css','account-cloud-separation-v186.css','unified-account-v189.css','financial-workspaces-v189.css',
    'receivables-v133.css','reports-v135.css','operations-v137.css','mobile-ui-rebalance-v146.css','mobile-workspaces-v148.css','mobile-auth-modal-v150.css',
    'global-search-v277.css','fintech-foundation-v280.css','fintech-shell-v280.css','fintech-workspaces-v280.css','fintech-responsive-v280.css','premium-fintech-polish-v281.css','premium-mobile-closeout-v281.css','premium-mobile-safearea-v282.css',
    'home-premium-command-center-v283.css','home-review-polish-v285.css','home-final-closeout-v286.css','document-premium-redesign-v141.css',
    'visual-experience-v288.css','visual-audit-v289.css','visual-hardening-v290.css','visual-closeout-v291.css','visual-deep-audit-v292.css','visual-interaction-closeout-v293.css','visual-workspace-geometry-v294.css','visual-contrast-closeout-v295.css','visual-document-panels-v296.css','visual-editor-interaction-v297.css','visual-overlay-accessibility-v298.css','visual-auth-settings-closeout-v299.css',
    'security-documents-closeout-v302.css','v308-document-studio.css','v310-stability-contrast.css',
    'home-canonical-v314.css','shell-canonical-v314.css','shell-overlays-v314.css','documents-canonical-v314.css','editor-canonical-v314.css','customers-canonical-v314.css','products-canonical-v314.css','operations-canonical-v314.css','finance-canonical-v314.css','reports-canonical-v314.css','settings-canonical-v314.css','auth-canonical-v314.css','overlays-canonical-v314.css'
  ];
  function retireLegacyVisualLayers(){
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach(function(link){
      var href=String(link.getAttribute('href')||'');
      if(legacyVisualOwners.some(function(name){return href.indexOf(name)!==-1;}))link.remove();
    });
  }
  function retireInlineLegacyOwners(){document.querySelectorAll('style[data-lourex-ai-core]').forEach(function(style){style.remove();});}
  function watchInlineLegacyOwners(){
    retireInlineLegacyOwners();
    if(!document.body)return;
    var observer=new MutationObserver(function(){retireInlineLegacyOwners();});
    observer.observe(document.body,{childList:true,subtree:true});
  }
  function installTailAdminV320(){
    retireLegacyVisualLayers();
    ensureStylesheet('data-lourex-tailadmin-v320','./styles/tailadmin-finance-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-shell-v320','./styles/tailadmin-shell-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-dashboard-v320','./styles/tailadmin-dashboard-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-documents-v320','./styles/tailadmin-documents-v320.css?v=320-2');
    ensureStylesheet('data-lourex-tailadmin-editor-frame-v320','./styles/tailadmin-editor-frame-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-editor-core-v320','./styles/tailadmin-editor-core-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-customers-v320','./styles/tailadmin-customers-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-products-v320','./styles/tailadmin-products-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-finance-workspaces-v320','./styles/tailadmin-finance-workspaces-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-operations-v320','./styles/tailadmin-operations-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-settings-v320','./styles/tailadmin-settings-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-auth-v320','./styles/tailadmin-auth-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-cloud-account-v320','./styles/tailadmin-cloud-account-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-ai-v320','./styles/tailadmin-ai-v320.css?v=320-1');
    ensureStylesheet('data-lourex-tailadmin-overlays-v320','./styles/tailadmin-overlays-v320.css?v=320-1');
    watchInlineLegacyOwners();
    var root=document.documentElement;
    root.style.backgroundColor=root.dataset.uiTheme==='dark'?'#0c111d':'#f9fafb';
  }
  installTailAdminV320();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installTailAdminV320,{once:true});
})();
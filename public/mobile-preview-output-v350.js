;(function(){
  'use strict';

  function visible(node){
    if(!(node instanceof HTMLElement))return false;
    var style=getComputedStyle(node);
    return style.display!=='none'&&style.visibility!=='hidden'&&node.getClientRects().length>0;
  }

  function firstEditorError(){
    return document.querySelector('.editor-pane .field-error, .editor-pane .inline-error, .editor-pane [aria-invalid="true"]');
  }

  function closePreviewToError(overlay){
    if(!visible(overlay))return;
    var error=firstEditorError();
    if(!error)return;
    var close=overlay.querySelector('header .icon-btn, header button[aria-label]');
    if(close instanceof HTMLButtonElement)close.click();
    window.setTimeout(function(){
      var target=(error.closest('.field,.item-card,.editor-section')||error);
      if(target instanceof HTMLElement){
        try{target.scrollIntoView({behavior:'smooth',block:'center'});}catch(_error){target.scrollIntoView();}
        var control=target.querySelector('input,select,textarea,button');
        if(control instanceof HTMLElement)try{control.focus({preventScroll:true});}catch(_error){control.focus();}
      }
      try{window.__LOUREX_DIAGNOSTICS__?.mark?.('mobile-preview-output-validation','previewClosed=yes');}catch(_error){}
    },40);
  }

  document.addEventListener('click',function(event){
    var target=event.target;
    if(!(target instanceof Element))return;
    var button=target.closest('.mobile-preview-overlay header .btn');
    if(!(button instanceof HTMLButtonElement)||button.disabled)return;
    var label=(button.textContent||'').trim().toLowerCase();
    if(label!=='pdf'&&!label.includes('share')&&!label.includes('مشاركة'))return;
    var overlay=button.closest('.mobile-preview-overlay');
    if(!(overlay instanceof HTMLElement))return;
    window.setTimeout(function(){closePreviewToError(overlay);},70);
  },true);
})();

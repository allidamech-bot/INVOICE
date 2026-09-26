(function(){
  'use strict';

  var ROOT_FLAG='lourexCloudRefreshAvailable';
  var FLOATING_SELECTOR='[data-lourex-cloud-refresh]';
  var SETTINGS_SELECTOR='[data-lourex-cloud-refresh-settings-only]';
  var available=false;

  function setRootFlag(value){
    available=Boolean(value);
    try{
      if(available)document.documentElement.dataset[ROOT_FLAG]='true';
      else delete document.documentElement.dataset[ROOT_FLAG];
    }catch{}
  }

  function removeFloatingNotice(){
    document.querySelectorAll(FLOATING_SELECTOR).forEach(function(node){node.remove();});
  }

  function recoveryCard(){
    var status=document.querySelector('.ta-security-page .ta-recovery-status');
    return status&&status.closest?status.closest('.ta-settings-card'):null;
  }

  function renderSettingsNotice(){
    var current=document.querySelector(SETTINGS_SELECTOR);
    if(!available){
      if(current)current.remove();
      return;
    }

    var card=recoveryCard();
    if(!card){
      if(current)current.remove();
      return;
    }

    var body=card.querySelector('.ta-settings-card-body');
    if(!body)return;
    if(current&&current.parentElement===body)return;
    if(current)current.remove();

    var notice=document.createElement('div');
    notice.setAttribute('data-lourex-cloud-refresh-settings-only','true');
    notice.setAttribute('role','status');
    notice.setAttribute('aria-live','polite');
    notice.className='ta-settings-note';
    notice.style.display='grid';
    notice.style.gap='4px';
    notice.style.alignItems='start';

    var title=document.createElement('strong');
    title.textContent='Cloud changes available / توجد تحديثات سحابية';
    var detail=document.createElement('small');
    detail.textContent='Cloud updates are managed here. Use Restore from Cloud when you are ready / تتم إدارة تحديثات السحابة من هنا. استخدم استرجاع من السحابة عندما تكون جاهزًا';
    detail.style.opacity='.78';
    detail.style.lineHeight='1.55';

    notice.append(title,detail);
    body.insertBefore(notice,body.firstChild);
  }

  function syncUi(){
    removeFloatingNotice();
    renderSettingsNotice();
  }

  function markAvailable(){
    setRootFlag(true);
    queueMicrotask(syncUi);
  }

  function markApplied(){
    setRootFlag(false);
    syncUi();
  }

  var style=document.createElement('style');
  style.id='lourex-cloud-refresh-settings-only-style';
  style.textContent=FLOATING_SELECTOR+'{display:none!important}';
  (document.head||document.documentElement).appendChild(style);

  window.addEventListener('lourex-cloud-refresh-available',markAvailable);
  window.addEventListener('lourex-cloud-applied',markApplied);

  var observer=new MutationObserver(function(){syncUi();});
  observer.observe(document.documentElement,{childList:true,subtree:true});

  syncUi();
})();

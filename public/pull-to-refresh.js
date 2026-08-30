(()=>{
  const THRESHOLD=76;
  const MAX_PULL=128;
  const RELOAD_DELAY=180;
  let startY=0,startX=0,distance=0,tracking=false,refreshing=false,moved=false;

  const indicator=document.createElement('div');
  indicator.className='lourex-pull-refresh';
  indicator.setAttribute('role','status');
  indicator.setAttribute('aria-live','polite');
  indicator.setAttribute('aria-hidden','true');
  indicator.innerHTML='<span class="lourex-pull-icon" aria-hidden="true">↻</span><span class="lourex-pull-label"></span>';
  document.body.appendChild(indicator);
  document.documentElement.classList.add('lourex-pull-refresh-enabled');

  const icon=indicator.querySelector('.lourex-pull-icon');
  const label=indicator.querySelector('.lourex-pull-label');
  const isArabic=()=>document.documentElement.dir==='rtl'||document.documentElement.lang==='ar';
  const copy=(state)=>{
    if(!label)return;
    if(state==='ready')label.textContent=isArabic()?'اترك للتحديث':'Release to refresh';
    else if(state==='refreshing')label.textContent=isArabic()?'جارٍ التحديث…':'Refreshing…';
    else label.textContent=isArabic()?'اسحب للتحديث':'Pull to refresh';
  };
  copy('pull');

  const pageAtTop=()=>window.scrollY<=0&&document.documentElement.scrollTop<=0&&document.body.scrollTop<=0;
  const blockedTarget=(target)=>target instanceof Element&&Boolean(target.closest('input,textarea,select,[contenteditable="true"],.modal-backdrop,.mobile-preview-overlay,.editor-main,.editor-screen,.preview-stage,.editor-scroll'));
  const canStart=(target)=>{
    if(refreshing||!pageAtTop())return false;
    if(!document.querySelector('.app-root .app-ui'))return false;
    if(document.body.classList.contains('printing'))return false;
    if(document.querySelector('.modal-backdrop,.mobile-preview-overlay,.editor-main,.editor-screen'))return false;
    return !blockedTarget(target);
  };

  const paint=(value)=>{
    distance=Math.max(0,Math.min(MAX_PULL,value));
    const progress=Math.min(1,distance/THRESHOLD);
    indicator.style.setProperty('--pull-distance',`${distance}px`);
    indicator.style.setProperty('--pull-progress',String(progress));
    if(icon)icon.style.transform=`rotate(${Math.round(progress*250)}deg)`;
    indicator.classList.toggle('is-active',distance>2||refreshing);
    indicator.classList.toggle('is-ready',distance>=THRESHOLD&&!refreshing);
    indicator.setAttribute('aria-hidden',distance>2||refreshing?'false':'true');
    copy(distance>=THRESHOLD?'ready':'pull');
  };

  const reset=()=>{
    tracking=false;moved=false;startY=0;startX=0;
    indicator.classList.add('is-settling');
    paint(0);
    window.setTimeout(()=>indicator.classList.remove('is-settling'),220);
  };

  const reload=async()=>{
    refreshing=true;
    tracking=false;
    indicator.classList.add('is-refreshing','is-active');
    indicator.classList.remove('is-ready');
    indicator.setAttribute('aria-hidden','false');
    copy('refreshing');
    paint(56);
    try{
      const registration=await navigator.serviceWorker?.getRegistration?.();
      if(registration){
        await Promise.race([
          registration.update().catch(()=>undefined),
          new Promise(resolve=>window.setTimeout(resolve,650))
        ]);
      }
    }catch{}
    window.setTimeout(()=>window.location.reload(),RELOAD_DELAY);
  };

  const onStart=(event)=>{
    if(event.touches.length!==1||!canStart(event.target))return;
    const touch=event.touches[0];
    startY=touch.clientY;startX=touch.clientX;distance=0;tracking=true;moved=false;
    indicator.classList.remove('is-settling');
    copy('pull');
  };

  const onMove=(event)=>{
    if(!tracking||refreshing||event.touches.length!==1)return;
    const touch=event.touches[0];
    const dy=touch.clientY-startY;
    const dx=Math.abs(touch.clientX-startX);
    if(dy<=0||!pageAtTop()){reset();return;}
    if(dx>Math.abs(dy)&&dx>12){reset();return;}
    if(dy<6)return;
    moved=true;
    if(event.cancelable)event.preventDefault();
    paint(Math.pow(dy,0.88)*0.66);
  };

  const onEnd=()=>{
    if(!tracking||refreshing)return;
    if(moved&&distance>=THRESHOLD){void reload();return;}
    reset();
  };

  window.addEventListener('touchstart',onStart,{passive:true});
  window.addEventListener('touchmove',onMove,{passive:false});
  window.addEventListener('touchend',onEnd,{passive:true});
  window.addEventListener('touchcancel',reset,{passive:true});
})();

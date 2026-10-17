/** Chat-only scroll proximity predicate; iOS bounce can report negative scrollTop. */
export function aiChatNearBottom(scrollTop:number,scrollHeight:number,clientHeight:number,threshold=120):boolean {
  if(![scrollTop,scrollHeight,clientHeight,threshold].every(Number.isFinite))return false;
  return scrollHeight-Math.max(0,clientHeight)-Math.max(0,scrollTop)<=Math.max(0,threshold);
}

export interface AiChatScrollFollower {
  /** Sending a fresh user turn always returns to the latest reply. */
  followNewMessage():void;
  /** Never retain document / viewport observers after changing conversations. */
  disconnect():void;
}

/** Follow incoming messages, PDF cards and late layout changes without stealing
 * scroll from someone reading an earlier turn. Only used inside LOUREX AI chat. */
export function attachAiChatScrollFollower(box:HTMLElement):AiChatScrollFollower {
  let follow=true, frame=0, unlock=0, intentTimer=0, programmatic=false, manualScroll=false;
  const atBottom=()=>aiChatNearBottom(box.scrollTop,box.scrollHeight,box.clientHeight);
  const settle=()=>{
    if(!follow)return;
    if(frame)return;
    frame=window.requestAnimationFrame(()=>{
      frame=0;
      if(!follow||!box.isConnected)return;
      programmatic=true;
      box.scrollTop=box.scrollHeight;
      window.clearTimeout(unlock);
      unlock=window.setTimeout(()=>{programmatic=false;},0);
    });
  };
  // Layout, scroll anchoring and focus restoration also emit scroll events.
  // Only actual scrolling input may turn off following a freshly sent turn.
  const onScroll=()=>{
    if(programmatic)return;
    if(manualScroll){follow=atBottom();window.clearTimeout(intentTimer);intentTimer=window.setTimeout(()=>{manualScroll=false;},180);}
    else if(follow)settle();
  };
  const onManualScroll=(event:Event)=>{
    if(event.type==='keydown'){
      const key=(event as KeyboardEvent).key;
      if(!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(key))return;
      const tag=(event.target as HTMLElement|null)?.tagName;
      if(tag&&['INPUT','TEXTAREA','SELECT','BUTTON'].includes(tag))return;
    }
    // A child button press is not a scrollbar drag.
    if(event.type==='pointerdown'&&event.target!==box)return;
    manualScroll=true;follow=false;
    window.clearTimeout(intentTimer);intentTimer=window.setTimeout(()=>{manualScroll=false;},180);
  };
  // The previous message may expand after layout/fonts render (especially on
  // Safari). Only observe a bounded window of recent cards, never all history.
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(settle):null;
  const watchRecent=()=>{
    if(!resize)return;
    resize.disconnect();
    resize.observe(box);
    Array.from(box.children).slice(-8).forEach(child=>resize.observe(child));
  };
  const mutations=new MutationObserver(records=>{
    // Text updates do not change the set of observed turns. Reconnecting every
    // observer on each token / render causes needless layout work on iPhone.
    if(records.some(record=>record.type==='childList'&&record.target===box))watchRecent();
    settle();
  });
  mutations.observe(box,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['open']});
  box.addEventListener('scroll',onScroll,{passive:true});
  for(const event of ['wheel','touchmove','pointerdown','keydown'])box.addEventListener(event,onManualScroll,{passive:true});
  window.visualViewport?.addEventListener('resize',settle);
  watchRecent();
  settle();
  return {
    followNewMessage(){manualScroll=false;follow=true;settle();},
    disconnect(){
      mutations.disconnect();resize?.disconnect();
      box.removeEventListener('scroll',onScroll);
      for(const event of ['wheel','touchmove','pointerdown','keydown'])box.removeEventListener(event,onManualScroll);
      window.visualViewport?.removeEventListener('resize',settle);
      window.cancelAnimationFrame(frame);window.clearTimeout(unlock);window.clearTimeout(intentTimer);
    }
  };
}

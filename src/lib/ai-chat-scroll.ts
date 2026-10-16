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
  let follow=true, frame=0, unlock=0, programmatic=false;
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
  const onScroll=()=>{if(!programmatic)follow=atBottom();};
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
  window.visualViewport?.addEventListener('resize',settle);
  watchRecent();
  settle();
  return {
    followNewMessage(){follow=true;settle();},
    disconnect(){
      mutations.disconnect();resize?.disconnect();
      box.removeEventListener('scroll',onScroll);
      window.visualViewport?.removeEventListener('resize',settle);
      window.cancelAnimationFrame(frame);window.clearTimeout(unlock);
    }
  };
}

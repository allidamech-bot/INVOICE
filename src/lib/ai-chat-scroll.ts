/** Chat-only scroll proximity predicate; iOS bounce can report negative scrollTop. */
export function aiChatNearBottom(scrollTop:number,scrollHeight:number,clientHeight:number,threshold=120):boolean {
  if(![scrollTop,scrollHeight,clientHeight,threshold].every(Number.isFinite))return false;
  return scrollHeight-Math.max(0,clientHeight)-Math.max(0,scrollTop)<=Math.max(0,threshold);
}

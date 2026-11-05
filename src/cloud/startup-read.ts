export class StartupReadTimeout extends Error {
  constructor(){
    super('The cloud workspace did not respond in time. Check your connection and retry.');
  }
}

export type CloudRead = (<T>(read:()=>Promise<T>)=>Promise<T>) & {
  // Only a validated manifest with many chunks may request one bounded
  // transfer grace period. Ordinary auth/control reads keep their 20s cap.
  extendForLargeWorkspace?: (chunkCount:number)=>void;
};

// Bound every server read before its caller can act on the result. Firestore
// may still receive a late response, but reconciliation cannot consume it.
export function startupCloudRead(budgetMs:number,onLargeWorkspace?:()=>void):CloudRead{
  const startedAt=Date.now();
  let deadline=startedAt+budgetMs;
  let extended=false;
  const boundedRead:CloudRead=async read=>{
    const remaining=deadline-Date.now();
    if(remaining<=0)throw new StartupReadTimeout();
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      return await Promise.race([
        read(),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new StartupReadTimeout()),remaining);})
      ]);
    }finally{
      clearTimeout(timer);
    }
  };
  boundedRead.extendForLargeWorkspace=(chunkCount:number)=>{
    if(extended||!Number.isSafeInteger(chunkCount)||chunkCount<32||Date.now()>=deadline)return;
    extended=true;
    // A large, *validated* manifest gets at most 50s after discovery and a
    // hard upper bound of 70s from startup. This never authorizes stale data.
    deadline=Math.min(startedAt+70_000,Math.max(deadline,Date.now()+50_000));
    onLargeWorkspace?.();
  };
  return boundedRead;
}

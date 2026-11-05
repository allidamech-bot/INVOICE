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
export function startupCloudRead(budgetMs:number):CloudRead{
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
    // A verified large transfer may use up to 28s total (ordinary reads
    // retain 20s). React's existing 30s recovery still bounds the UI.
    deadline=Math.min(startedAt+28_000,Math.max(deadline,Date.now()+25_000));
  };
  return boundedRead;
}

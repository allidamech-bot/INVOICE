export class StartupReadTimeout extends Error {
  constructor(){
    super('The cloud workspace did not respond in time. Check your connection and retry.');
  }
}

export type CloudRead = <T>(read:()=>Promise<T>)=>Promise<T>;

// Bound the read before its caller can act on the result. Firestore may still
// receive a late response, but no reconciliation or write consumes that result.
export function startupCloudRead(budgetMs:number):CloudRead{
  const deadline=Date.now()+budgetMs;
  return async read=>{
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
}

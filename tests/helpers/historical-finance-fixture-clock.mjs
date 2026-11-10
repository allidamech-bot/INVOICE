/**
 * Deterministic clock for fixed-as-of 2026-10-31 synthetic finance fixtures.
 * TEST-ONLY. This never modifies production financial time or ledger semantics.
 *
 * The callback must be synchronous: restore the global Date before returning.
 * The project's Node test runner isolates test files into their own processes.
 */
export function withHistoricalFixtureClock(callback){
  const NativeDate=globalThis.Date;
  const fixed=NativeDate.parse('2026-10-31T12:00:00.000Z');
  class HistoricalFixtureDate extends NativeDate{
    constructor(...args){
      if(args.length===0)super(fixed);
      else super(...args);
    }
    static now(){return fixed;}
  }
  globalThis.Date=HistoricalFixtureDate;
  try{
    const result=callback();
    if(result&&typeof result.then==='function')
      throw new Error('Historical fixture clock only supports synchronous tests');
    return result;
  }finally{
    globalThis.Date=NativeDate;
  }
}

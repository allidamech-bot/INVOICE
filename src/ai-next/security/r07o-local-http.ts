/**
 * R07O: deliberately UNMOUNTED local-only transport for offline R07N preview.
 * No api/ route, Vercel handler, import into legacy app, Firebase client or
 * public URL is created. Requires local demo Firestore Emulator; never prod.
 * Authentication and membership are re-checked by R07M for EVERY request.
 */
import type {R07MFastLocalCoordinator,R07MUnifiedReviewEditResult}
  from '../coordinator/fast-local-coordinator.js';
import type {R07RReceiptPrepareInput}
  from '../coordinator/r07r-draft-preparation.js';
import type {R07NAuthenticatedPreviewPort,R07NEnvelope}
  from '../ui/r07n-preview-session.js';
import type {R07LocalTurnInput} from '../coordinator/local-coordinator.js';

export const R07O_PUBLIC_ENDPOINT_ENABLED=false as const;
/** Unmounted server-only opt-in, separate from existing preview operations. */
export const R07O_UNIFIED_REVIEW_PUBLICLY_ENABLED=false as const;
export const R07O_LOCAL_ROUTE='/__ai_next_r07o_local_preview__';
export const R07O_MAX_REQUEST_BYTES=32_768;
export const R07O_MAX_RESPONSE_BYTES=750_000;
const LOOPBACK=/^(?:localhost|127\.0\.0\.1)$/;
const EMULATOR=/^(?:localhost|127\.0\.0\.1):[0-9]{2,5}$/;
const MAX_TOKEN=8192;
const encoder=new TextEncoder();
const noStore=Object.freeze({
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, max-age=0',
  'Pragma':'no-cache',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Cross-Origin-Resource-Policy':'same-origin',
  'X-Frame-Options':'DENY',
  'Vary':'Origin',
});
const own=(value:unknown):value is Record<string,unknown>=>
  value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.getPrototypeOf(value)===Object.prototype;
const keys=(value:Record<string,unknown>,expected:string[])=>{
  const actual=Object.keys(value).sort(),want=[...expected].sort();
  return actual.length===want.length&&actual.every((x,i)=>x===want[i]);
};
const origin=(value:string):URL=>{
  let uri:URL;
  try{uri=new URL(value);}
  catch{throw Error('R07O_INVALID_LOCAL_ORIGIN');}
  if(uri.protocol!=='http:'||!LOOPBACK.test(uri.hostname)||
    !uri.port||uri.pathname!=='/'||uri.search||uri.hash||
    uri.username||uri.password)
    throw Error('R07O_INVALID_LOCAL_ORIGIN');
  return uri;
};
const report=(code:string,status:number)=>new Response(
  JSON.stringify({error:code}),{status,headers:noStore},
);
function jsonResponse(payload:unknown):Response{
  const json=JSON.stringify(payload);
  if(typeof json!=='string'||encoder.encode(json).byteLength>R07O_MAX_RESPONSE_BYTES)
    return report('R07O_RESPONSE_LIMIT',413);
  return new Response(json,{status:200,headers:noStore});
}
async function boundedBody(request:Request):Promise<unknown>{
  const declared=request.headers.get('content-length');
  if(declared!==null&&(!/^[0-9]+$/.test(declared)||
    Number(declared)>R07O_MAX_REQUEST_BYTES))
    throw Error('R07O_BODY_LIMIT');
  if(!request.body)throw Error('R07O_EMPTY_BODY');
  const reader=request.body.getReader();const chunks:Uint8Array[]=[];
  let size=0;
  try{
    while(true){
      const value=await reader.read();
      if(value.done)break;
      size+=value.value.byteLength;
      if(size>R07O_MAX_REQUEST_BYTES)throw Error('R07O_BODY_LIMIT');
      chunks.push(value.value);
    }
  }finally{reader.releaseLock();}
  if(size===0)throw Error('R07O_EMPTY_BODY');
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw Error('R07O_INVALID_JSON');}
  if(!own(parsed)||!keys(parsed,['operation','payload'])||
    !['accept','current','history','review_edit'].includes(String(parsed.operation))||
    !own(parsed.payload))
    throw Error('R07O_INVALID_REQUEST_SHAPE');
  return parsed;
}
type Operations='accept'|'current'|'history'|'review_edit';
type Coordinator=Pick<R07MFastLocalCoordinator,Operations>;
/**
 * Instantiable only when the actual Node process is running against
 * the *official local demo emulator*. Supplying a forged config is not enough.
 * Does not create any network listener.
 */
export class R07OLocalPreviewHandler{
  private readonly origin:string;
  constructor(private readonly options:{
    allowedOrigin:string;projectId:'demo-ai-next-r07h';
    emulatorHost:string;coordinator:Coordinator;
    /** Only local demo/emulator integration can opt into the review writer. */
    allowOfflineUnifiedReviewEdit?:true;
  }){
    this.origin=origin(options.allowedOrigin).origin;
    if(options.projectId!=='demo-ai-next-r07h'||
      !EMULATOR.test(options.emulatorHost)||
      process.env.FIRESTORE_EMULATOR_HOST!==options.emulatorHost||
      (process.env.GCLOUD_PROJECT??process.env.GOOGLE_CLOUD_PROJECT)!==
        options.projectId||
      process.env.VERCEL_ENV!==undefined||
      process.env.NODE_ENV==='production')
      throw Error('R07O_LOCAL_EMULATOR_GUARD');
  }
  async handle(request:Request):Promise<Response>{
    let url:URL;
    try{url=new URL(request.url);}
    catch{return report('R07O_INVALID_URL',400);}
    if(url.origin!==this.origin||url.pathname!==R07O_LOCAL_ROUTE||
      url.search||url.hash)return report('R07O_NOT_FOUND',404);
    if(request.method!=='POST')return report('R07O_METHOD_DENIED',405);
    // No CORS or cookies. Authorization is Bearer only. Browser origin and
    // fetch-metadata checks reduce CSRF and cross-site token exposure.
    if(request.headers.get('origin')!==this.origin||
      request.headers.get('sec-fetch-site')!=='same-origin')
      return report('R07O_ORIGIN_DENIED',403);
    if(request.headers.has('cookie'))
      return report('R07O_COOKIE_AUTH_DENIED',403);
    if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get('content-type')??''))
      return report('R07O_CONTENT_TYPE_DENIED',415);
    const auth=request.headers.get('authorization')??'';
    if(!/^Bearer [A-Za-z0-9_.-]+$/.test(auth)||
      auth.length>MAX_TOKEN+7||auth.length<107)
      return report('R07O_BEARER_REQUIRED',401);
    let command:Record<string,unknown>;
    try{command=await boundedBody(request) as Record<string,unknown>;}
    catch(e){return report(e instanceof Error&&e.message==='R07O_BODY_LIMIT'?
      'R07O_BODY_LIMIT':'R07O_INVALID_BODY',400);}
    const verb=command.operation as Operations;
    // Before ever reaching R07M, enforce the SERVER construction grant.
    // A browser request parameter can never enable a local review writer.
    if(verb==='review_edit'&&
      this.options.allowOfflineUnifiedReviewEdit!==true)
      return report('R07O_REVIEW_DISABLED',403);
    try{
      const token=auth.slice(7);
      const result=verb==='accept'?
        await this.options.coordinator.accept(token,
          command.payload as R07LocalTurnInput):
        verb==='current'?
          await this.options.coordinator.current(token,
            command.payload as R07NEnvelope):
        verb==='history'?
          await this.options.coordinator.history(token,
            command.payload as R07NEnvelope):
          await this.options.coordinator.acceptOfflineUnifiedReviewEdit(token,
            command.payload as R07RReceiptPrepareInput);
      return jsonResponse(result);
    }catch(error){
      // Authenticated request failures never disclose ACL records, tokens,
      // company details, Firebase internals, raw errors or stack traces.
      const msg=error instanceof Error?error.message:'';
      if(msg.startsWith('AUTH_')||msg.startsWith('R07_TOKEN_'))
        return report('R07O_UNAUTHORIZED',403);
      if(msg.startsWith('R07_INVALID_')||msg.startsWith('R07M_INVALID_'))
        return report('R07O_REQUEST_INVALID',400);
      if(/_COLLISION|_ACTIVE|_RETRY_LIMIT/.test(msg))
        return report('R07O_OPERATION_CONFLICT',409);
      return report('R07O_SERVER_UNAVAILABLE',503);
    }
  }
}
export class R07OHttpPreviewError extends Error{
  constructor(readonly code:string){super(code);}
}
/**
 * Client-side transport. The host owns the login token getter and must never
 * store an ID token in localStorage, URL, log or R07N pending request.
 * No transparent retry: the R07N session owns stable idempotency keys.
 */
export class R07OLocalHttpPreviewPort implements R07NAuthenticatedPreviewPort{
  private readonly url:string;
  constructor(options:{
    allowedOrigin:string;token:()=>Promise<string>;
    transport?:(request:Request)=>Promise<Response>;
  }){
    this.url=origin(options.allowedOrigin).origin+R07O_LOCAL_ROUTE;
    this.token=options.token;
    this.transport=options.transport??fetch;
  }
  private readonly token:()=>Promise<string>;
  private readonly transport:(request:Request)=>Promise<Response>;
  private async call(operation:Operations,payload:unknown):Promise<any>{
    const bearer=await this.token();
    if(typeof bearer!=='string'||bearer.length<100||
      bearer.length>MAX_TOKEN||!/^[A-Za-z0-9_.-]+$/.test(bearer))
      throw new R07OHttpPreviewError('R07O_INVALID_SESSION_TOKEN');
    const request=new Request(this.url,{
      method:'POST',headers:{
        'Content-Type':'application/json','Authorization':'Bearer '+bearer,
      },body:JSON.stringify({operation,payload}),cache:'no-store',
      credentials:'omit',redirect:'error',mode:'same-origin',
      referrerPolicy:'no-referrer',
    });
    const response=await this.transport(request);
    if(!response.ok)throw new R07OHttpPreviewError('R07O_SECURE_CALL_FAILED');
    if(!response.headers.get('content-type')?.startsWith('application/json'))
      throw new R07OHttpPreviewError('R07O_INVALID_RESPONSE_TYPE');
    const body=await response.text();
    if(encoder.encode(body).byteLength>R07O_MAX_RESPONSE_BYTES)
      throw new R07OHttpPreviewError('R07O_RESPONSE_LIMIT');
    try{return JSON.parse(body);}
    catch{throw new R07OHttpPreviewError('R07O_INVALID_RESPONSE');}
  }
  accept(request:R07LocalTurnInput){return this.call('accept',request);}
  current(envelope:R07NEnvelope){return this.call('current',envelope);}
  history(envelope:R07NEnvelope){return this.call('history',envelope);}
  /** Explicit user action only: never silently retries a business mutation. */
  reviewEdit(input:R07RReceiptPrepareInput):Promise<R07MUnifiedReviewEditResult>{
    return this.call('review_edit',input);
  }
}

import {aiRouterPublicError,routeAiStructured} from './_ai/router.js';
import {requireAiFirebaseAuth} from './_ai/firebase-auth.js';

const MAX_BODY_BYTES=12000;
const RATE_WINDOW_MS=5*60*1000;
const RATE_MAX=24;
const MODES=['company-policy','margin','markup','increase-percent','saved-sale-price','last-customer-price','no-change'];
const rateBuckets=new Map();
function sendJson(response,status,payload){response.statusCode=status;response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.end(JSON.stringify(payload));}
function requestHosts(request){return [request.headers.host,request.headers['x-forwarded-host'],request.headers['x-original-host']].flatMap(value=>String(value||'').split(',')).map(value=>value.trim().toLowerCase()).filter(Boolean);}
function deploymentHosts(){return [process.env.VERCEL_PROJECT_PRODUCTION_URL,process.env.VERCEL_URL,process.env.VERCEL_BRANCH_URL].flatMap(value=>String(value||'').split(',')).map(value=>value.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'')).filter(Boolean);}
const BUILTIN_PUBLIC_APP_HOSTS=['invoice-three-puce.vercel.app'];
function publicAppHosts(){return [...BUILTIN_PUBLIC_APP_HOSTS,...String(process.env.LOUREX_PUBLIC_APP_HOSTS||'').split(',')].map(value=>String(value||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'')).filter(Boolean);}
function sameOriginRequest(request){const requestedWith=String(request.headers['x-requested-with']||'').trim();const fetchSite=String(request.headers['sec-fetch-site']||'').trim().toLowerCase();if(requestedWith!=='LOUREX-Invoice')return false;const origin=String(request.headers.origin||'').trim();if(!origin)return fetchSite==='same-origin';try{const parsed=new URL(origin);if(parsed.protocol!=='https:')return false;const originHost=parsed.host.toLowerCase();const trustedHosts=new Set([...requestHosts(request),...deploymentHosts(),...publicAppHosts()]);if(trustedHosts.has(originHost))return true;return fetchSite==='same-origin';}catch{return false;}}
function requestIp(request){if(request.aiVerifiedUid)return `uid:${request.aiVerifiedUid}`;return String(request.headers['x-forwarded-for']||'').split(',')[0]?.trim()||String(request.socket?.remoteAddress||'unknown');}
function rateAllowed(request){const now=Date.now(),key=requestIp(request),existing=rateBuckets.get(key);const bucket=!existing||now-existing.startedAt>=RATE_WINDOW_MS?{startedAt:now,count:0}:existing;bucket.count+=1;rateBuckets.set(key,bucket);if(rateBuckets.size>500){for(const [entryKey,value] of rateBuckets){if(now-value.startedAt>=RATE_WINDOW_MS)rateBuckets.delete(entryKey);}}return bucket.count<=RATE_MAX;}
async function readJson(request){let text='';for await(const chunk of request){text+=chunk.toString();if(Buffer.byteLength(text,'utf8')>MAX_BODY_BYTES)throw new Error('BODY_TOO_LARGE');}return JSON.parse(text||'{}');}
function cleanText(value,max=500){return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function cleanPercent(value){const text=cleanText(value,24).replace(',','.');if(!/^\d{1,4}(?:\.\d{1,2})?$/.test(text))return'';const n=Number(text);return Number.isFinite(n)&&n>=0&&n<=1000?text:'';}
function validPercentForMode(mode,value){const text=cleanPercent(value);if(!text)return'';const number=Number(text);if(mode==='margin')return number<100?text:'';if(mode==='markup'||mode==='increase-percent')return number<=1000?text:'';return'';}

export default async function handler(request,response){
  if(request.method!=='POST'){response.setHeader('Allow','POST');sendJson(response,405,{code:'METHOD_NOT_ALLOWED',message:'Use POST.'});return;}
  if(!sameOriginRequest(request)){sendJson(response,403,{code:'ORIGIN_REJECTED',message:'Pricing intent requests must come from this LOUREX deployment.'});return;}
  if(!await requireAiFirebaseAuth(request,response))return;
  if(!rateAllowed(request)){response.setHeader('Retry-After','300');sendJson(response,429,{code:'AI_RATE_LIMITED',message:'Pricing intent AI is temporarily rate limited.'});return;}
  let body;try{body=await readJson(request);}catch{sendJson(response,400,{code:'INVALID_REQUEST',message:'Invalid pricing instruction.'});return;}
  const instruction=cleanText(body?.instruction,500);if(!instruction){sendJson(response,400,{code:'EMPTY_INSTRUCTION',message:'Enter a pricing instruction first.'});return;}
  const prompt=`Convert the user's quotation pricing instruction into exactly one structured intent. Do NOT calculate any price or money. LOUREX will perform all calculations locally.\nAllowed modes:\n- company-policy: use the saved company pricing policy.\n- margin: target gross margin percent on saved cost; must be explicitly below 100%.\n- markup: target markup percent on saved cost; explicit values up to 1000% are accepted.\n- increase-percent: increase the currently proposed selling prices by an explicit percentage up to 1000%.\n- saved-sale-price: use each matched product's saved selling price.\n- last-customer-price: use the most recent comparable price previously quoted/invoiced to the matched customer for the matched product.\n- no-change: instruction is unsupported, ambiguous, invalid, or not a pricing instruction.\nFor margin, markup, and increase-percent, percent must be the explicit percentage from the user's instruction. Never invent a percentage. Return a short reason.\nUser instruction: ${JSON.stringify(instruction)}`;
  const schema={type:'OBJECT',properties:{mode:{type:'STRING',enum:MODES},percent:{type:'STRING'},reason:{type:'STRING'}},required:['mode','percent','reason']};
  const result=await routeAiStructured({taskType:'quote_pricing_intent',prompt,schema,timeoutMs:12_000,validate:value=>{
    const mode=MODES.includes(value?.mode)?value.mode:'no-change';
    if(!['margin','markup','increase-percent'].includes(mode))return true;
    return Boolean(validPercentForMode(mode,value?.percent));
  }});
  if(!result.success){
    if(result.errorCode==='AI_INVALID_RESULT'){sendJson(response,200,{intent:{mode:'no-change',percent:'',reason:'The explicit percentage is missing or outside the safe range for this pricing mode.'}});return;}
    const publicError=aiRouterPublicError(result);sendJson(response,publicError.status,{code:publicError.code,message:publicError.message});return;
  }
  const parsed=result.data;const mode=MODES.includes(parsed?.mode)?parsed.mode:'no-change';const percent=['margin','markup','increase-percent'].includes(mode)?validPercentForMode(mode,parsed?.percent):'';
  if(['margin','markup','increase-percent'].includes(mode)&&!percent){sendJson(response,200,{intent:{mode:'no-change',percent:'',reason:'The explicit percentage is missing or outside the safe range for this pricing mode.'}});return;}
  sendJson(response,200,{intent:{mode,percent,reason:cleanText(parsed?.reason,220)}});
}

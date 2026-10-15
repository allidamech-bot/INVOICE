/**
 * Explicit, operator-triggered provider smoke test. Never run in a deployment
 * or normal CI. This script sends ONLY the synthetic marker below, not customer
 * documents or vault records, using a dedicated short-lived QA-only API key.
 */
import {routeAiStructured} from '../api/_ai/router.js';

const QA_SECRET='LOUREX_AI_QA_GROQ_API_KEY';
const CONFIRM='isolated-qa-no-customer-data';
const confirmation=process.env.LOUREX_AI_QA_CONFIRM;
const key=process.env[QA_SECRET]||'';
if(confirmation!==CONFIRM||key.length<16){
 console.error('SANDBOX_NOT_CONFIGURED: Set isolated QA consent and a dedicated LOUREX_AI_QA_GROQ_API_KEY. No provider was contacted.');
 process.exitCode=2;
}else{
 // Explicitly discard inherited production provider variables and competing
 // provider credentials. The router must see only this one scoped QA key.
 for(const name of ['GROQ_API_KEY','GEMINI_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'])delete process.env[name];
 delete process.env[QA_SECRET];
 process.env.GROQ_API_KEY=key;
 const schema={type:'OBJECT',properties:{marker:{type:'STRING',enum:['LOUREX_SANDBOX_OK']}},required:['marker']};
 try{
  const result=await routeAiStructured({
   taskType:'workspace_help',reasoningLevel:'standard',
   prompt:'Synthetic API schema connectivity check only. Do not process company data. Reply with JSON {"marker":"LOUREX_SANDBOX_OK"}.',
   schema,maxOutputTokens:80,timeoutMs:9_000,qualityFallback:false
  });
  if(!result.success||result.data?.marker!=='LOUREX_SANDBOX_OK'||result.provider!=='groq'||
     result.fallbackUsed){
   console.error('SANDBOX_FAILED: provider rejected a synthetic, schema-constrained QA request. Error code: '+
     String(result.errorCode||'VALIDATION_FAILED').replace(/[^A-Z_]/g,'').slice(0,60));
   process.exitCode=1;
  }else{
   console.log('SANDBOX_PASS: isolated Groq route, schema validation and synthetic JSON response. Model: '+
     String(result.model||'unreported').replace(/[^a-zA-Z0-9/._-]/g,'').slice(0,60)+
     '. No financial tools, Firebase or business records accessed.');
  }
 }catch{
  console.error('SANDBOX_FAILED: isolated provider smoke test raised an error; details withheld to protect credentials.');
  process.exitCode=1;
 }finally{
  delete process.env.GROQ_API_KEY;
 }
}

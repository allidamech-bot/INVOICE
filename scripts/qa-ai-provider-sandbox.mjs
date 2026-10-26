/**
 * Manual, opt-in, NO CUSTOMER DATA provider connectivity probe.
 * Never automatically call upstream inference during CI or deployment.
 * Provide a short-lived provider-specific QA credential, never production keys.
 */
import {routeAiStructured} from '../api/_ai/router.js';

const CONFIRM='isolated-qa-no-customer-data';
const QA_PROVIDER=process.env.LOUREX_AI_QA_PROVIDER||'groq';
const QA_KEYS={
  groq:['LOUREX_AI_QA_GROQ_API_KEY']
};
const selected=Object.prototype.hasOwnProperty.call(QA_KEYS,QA_PROVIDER)?QA_KEYS[QA_PROVIDER]:null;
const isolatedCredentials=selected?.map(name=>String(process.env[name]||'').trim())||[];
// Reject missing keys BEFORE any router invocation. Never fall back to inherited
// credentials, including those supplied by a local production environment.
const productionCredentials=['GROQ_API_KEY','GEMINI_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','OPENROUTER_API_KEY','MISTRAL_API_KEY','OLLAMA_API_KEY']
  .map(name=>String(process.env[name]||'').trim()).filter(Boolean);
const valid=process.env.LOUREX_AI_QA_CONFIRM===CONFIRM
  && selected&&isolatedCredentials.every(key=>key.length>=16)
  && isolatedCredentials.every(key=>!productionCredentials.includes(key));
if(!valid){
  console.error('SANDBOX_NOT_CONFIGURED: Select groq; provide dedicated QA credentials and isolated-qa-no-customer-data consent. No provider was contacted.');
  process.exitCode=2;
}else{
  for(const name of [
    'GROQ_API_KEY','GEMINI_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID',
    'OPENROUTER_API_KEY','MISTRAL_API_KEY','OLLAMA_API_KEY','LOUREX_AI_NEW_PROVIDERS_ENABLED','LOUREX_AI_MISTRAL_FREE_VERIFIED','LOUREX_AI_OLLAMA_FREE_VERIFIED',
    ...Object.values(QA_KEYS).flat()
  ])delete process.env[name];
  if(QA_PROVIDER==='groq')process.env.GROQ_API_KEY=isolatedCredentials[0];
  const schema={type:'OBJECT',properties:{marker:{type:'STRING',enum:['LOUREX_SANDBOX_OK']}},required:['marker']};
  try{
    const result=await routeAiStructured({
      taskType:'workspace_help',reasoningLevel:'standard',
      prompt:'Synthetic schema connectivity check. No company records or financial tools. Return only JSON {"marker":"LOUREX_SANDBOX_OK"}.',
      schema,maxOutputTokens:80,timeoutMs:9000,qualityFallback:false
    });
    if(!result.success||result.data?.marker!=='LOUREX_SANDBOX_OK'
       ||result.provider!==QA_PROVIDER||result.fallbackUsed||result.validation?.schema!==true){
      console.error('SANDBOX_FAILED: isolated provider rejected a synthetic schema-constrained request. Error: '+
        String(result.errorCode||'VALIDATION_FAILED').replace(/[^A-Z_]/g,'').slice(0,60));
      process.exitCode=1;
    }else{
      console.log('SANDBOX_PASS: isolated '+QA_PROVIDER+' provider, synthetic JSON/schema validated. Model: '+
        String(result.model||'unreported').replace(/[^a-zA-Z0-9/._@-]/g,'').slice(0,90)+
        '. No Firebase, customer records, write tools or financial data accessed.');
    }
  }catch{
    console.error('SANDBOX_FAILED: isolated provider probe failed; provider details withheld to protect credentials.');
    process.exitCode=1;
  }finally{
    for(const name of ['GROQ_API_KEY','GEMINI_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'])delete process.env[name];
  }
}
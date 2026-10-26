/**
 * Process-local upstream mock. Fail closed on any unexpected URL, credentials,
 * payload or extra provider: NO network call is permitted in this fixture.
 */
const provider=process.env.LOUREX_AI_QA_PROVIDER;
const secret='qa-synthetic-token-0123456789012345';
const reply=JSON.stringify({marker:'LOUREX_SANDBOX_OK'});
let callCount=0;
globalThis.fetch=async (url,request={})=>{
  callCount+=1;
  if(callCount!==1)throw new Error('Unexpected repeat provider request');
  if(request.method!=='POST')throw new Error('Unexpected provider method');
  const address=String(url);
  const body=JSON.parse(request.body||'{}');
  if(!JSON.stringify(body).includes('LOUREX_SANDBOX_OK'))throw new Error('Not a synthetic QA payload');
  if(provider==='groq'){
    if(address!=='https://api.groq.com/openai/v1/chat/completions'
       ||request.headers.Authorization!=='Bearer '+secret
       ||body.model!=='qwen/qwen3.8-27b')throw new Error('Untrusted Groq route or key');
    return {ok:true,status:200,headers:new Headers(),text:async()=>JSON.stringify({choices:[{message:{content:reply}}]})};
  }
  if(provider==='gemini'){
    if(!address.startsWith('https://generativelanguage.googleapis.com/v1beta/models/')
       ||!address.endsWith(':generateContent')
       ||request.headers['x-goog-api-key']!==secret)throw new Error('Untrusted Gemini route or key');
    return {ok:true,status:200,headers:new Headers(),text:async()=>JSON.stringify({candidates:[{content:{parts:[{text:reply}]}}]})};
  }
  if(provider==='cloudflare'){
    if(address!=='https://api.cloudflare.com/client/v4/accounts/qa-account-id/ai/v1/chat/completions'
       ||request.headers.Authorization!=='Bearer '+secret
       ||body.model!=='@cf/google/gemma-4-26b-a4b-it')throw new Error('Untrusted Cloudflare route or key');
    return {ok:true,status:200,headers:new Headers(),text:async()=>JSON.stringify({choices:[{message:{content:reply}}]})};
  }
  throw new Error('Unsupported provider');
};

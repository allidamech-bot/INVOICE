// Strict, privacy-conscious classification of fixed synthetic provider replies.
// Never include upstream error bodies or arbitrary model text in diagnostics telemetry.
const MAX_PREVIEW=110;
function normalizeText(value){
  if(typeof value!=='string')return '';
  return value.normalize('NFKC')
    .replace(/[\u0660-\u0669\u06F0-\u06F9]/g,d=>{
      const cp=d.codePointAt(0);
      return String(cp<=0x0669?cp-0x0660:cp-0x06F0);
    })
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,'')
    .trim();
}
function textFromPart(value){
  if(typeof value==='string')return value;
  if(Array.isArray(value))return value.map(p=>typeof p==='string'?p:
    typeof p?.text==='string'?p.text:
    typeof p?.text?.value==='string'?p.text.value:'').filter(Boolean).join(' ');
  return '';
}
function safeModel(value){
  return typeof value==='string'&&/^[a-zA-Z0-9@/._:+-]{1,110}$/.test(value)?value:undefined;
}
export function selectedResponse(root,provider){
  if(provider==='gemini'){
    const item=root?.candidates?.[0];
    return{text:textFromPart(item?.content?.parts?.filter(p=>p?.thought!==true)||[]),
      finish:item?.finishReason||'',tokens:root?.usageMetadata?.candidatesTokenCount||0,
      model:root?.modelVersion||''};
  }
  const parent=root?.result?.choices?root.result:root;
  const choice=parent?.choices?.[0];
  const content=textFromPart(choice?.message?.content);
  const parsed=choice?.message?.parsed;
  const parsedText=textFromPart(parsed)||
    (parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?JSON.stringify(parsed):'');
  const alternate=textFromPart(root?.result?.response)||textFromPart(root?.response);
  return{text:content||parsedText||alternate,finish:choice?.finish_reason||'',
    tokens:parent?.usage?.completion_tokens||0,model:parent?.model||root?.model||''};
}
function safeFinish(value){
  const str=String(value||'').trim().toUpperCase();
  const options=new Set(['STOP','LENGTH','MAX_TOKENS','MAX_OUTPUT_TOKENS','FINISH_REASON_UNSPECIFIED','SAFETY','RECITATION','OTHER','CONTENT_FILTER','TOOL_CALLS']);
  return options.has(str)?str:'UNREPORTED';
}
function safePreview(value){
  return normalizeText(value).replace(/\s+/g,' ').replace(/[^a-zA-Z0-9\u0600-\u06FF.,:=%$+\-() /]/g,'').slice(0,MAX_PREVIEW);
}
function possibleAmounts(text){
  // A comma is only a thousands separator when followed by exactly three digits.
  return [...text.matchAll(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g)]
    .map(x=>Number(x[0].replace(/,/g,'')))
    .filter(n=>Number.isFinite(n)&&n>=0&&n<=1000000000);
}
export function classifySyntheticProviderAnswer(root,provider){
  const selected=selectedResponse(root,provider);
  const answer=normalizeText(selected.text);
  const finishReason=safeFinish(selected.finish);
  const completionTokens=Number.isSafeInteger(selected.tokens)&&selected.tokens>=0&&selected.tokens<=1000000?selected.tokens:undefined;
  const actualModel=safeModel(selected.model);
  const common={finishReason,...(completionTokens!==undefined?{completionTokens}:{}),
    ...(actualModel?{actualModel}:{})};
  if(root?.error||root?.success===false){
    return{...common,status:'PROVIDER_ERROR',reason:'UPSTREAM_ERROR_BODY'};
  }
  if(!answer){
    const truncated=['LENGTH','MAX_TOKENS','MAX_OUTPUT_TOKENS'].includes(finishReason);
    const blocked=['SAFETY','RECITATION','CONTENT_FILTER'].includes(finishReason);
    return{...common,status:truncated?'OUTPUT_TRUNCATED':blocked?'OUTPUT_BLOCKED':'INVALID_RESPONSE',
      reason:blocked?'OUTPUT_BLOCKED':'EMPTY_CONTENT'};
  }
  if(answer.length>1000)return{...common,status:'ANSWER_FORMAT',reason:'OVERLONG_ANSWER',answerPreview:safePreview(answer)};
  const clean=answer.replace(/^`{3}(?:text)?\s*|\s*`{3}$/gi,'').trim();
  const nums=possibleAmounts(clean);
  if(nums.length!==1)return{...common,status:'ANSWER_FORMAT',reason:nums.length===0?'NO_NUMERIC_ANSWER':'MULTIPLE_NUMBERS',answerPreview:safePreview(clean)};
  const value=nums[0];
  const matched=Math.abs(value-1062)<0.005;
  return{...common,status:matched?'PASSED':'WRONG_ANSWER',correct:matched,reportedTotal:value,
    ...(clean.length>40?{answerPreview:safePreview(clean)}:{})};
}

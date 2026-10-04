import {readFile,writeFile} from 'node:fs/promises';

const target='dist/src/components/AiCopilot.js';
let source=await readFile(target,'utf8');
if(source.includes('__lourexBatch1ThreadLifecycleFix'))throw new Error('AI Batch 1 thread lifecycle fix is already installed.');

const previous=`function __lourexNewAssistantConversation(instance){
  instance.cancelRequest?.();instance.__lourexAssistantThreadId='ai-thread-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);instance.__lourexAssistantSummary='';
  instance.setState({input:'',error:'',messages:[],proposal:null,auditOpen:false,assistantHistoryOpen:false});
}`;
const replacement=`async function __lourexNewAssistantConversation(instance){
  if(instance.state.busy||instance.applying)return;
  const scope=__lourexAssistantScope(instance);
  instance.cancelRequest?.();
  if(scope!=='temporary'&&(instance.state.messages||[]).length){
    try{await __lourexPersistAssistantThread(instance);}catch(error){instance.setState({error:error instanceof Error?error.message:String(error)});return;}
  }
  instance.__lourexAssistantThreadId='ai-thread-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);instance.__lourexAssistantSummary='';
  await new Promise(resolve=>instance.setState({input:'',error:'',messages:[],proposal:null,auditOpen:false,assistantHistoryOpen:false},resolve));
}`;
if(!source.includes(previous))throw new Error('AI Batch 1 new-conversation runtime changed unexpectedly.');
source=source.replace(previous,replacement);
source=source.replace("instance.__lourexDeleteThread=threadId=>void __lourexDeleteAssistantThread(instance,threadId);instance.__lourexNewConversation=()=>__lourexNewAssistantConversation(instance);","instance.__lourexDeleteThread=threadId=>void __lourexDeleteAssistantThread(instance,threadId);instance.__lourexNewConversation=()=>void __lourexNewAssistantConversation(instance);");
source+=`\nconst __lourexBatch1ThreadLifecycleFix=true;\n`;
if(!source.includes('await __lourexPersistAssistantThread(instance)'))throw new Error('AI Batch 1 conversation closeout persistence is missing.');
await writeFile(target,source);
console.log('LOUREX AI Batch 1 thread lifecycle fixed: current chat persists before New Conversation clears the UI.');

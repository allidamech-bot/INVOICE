import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const target='dist/src/components/AiCopilot.js';
let source=await readFile(target,'utf8');
if(source.includes('__lourexConversationFinalBatch5'))throw new Error('AI Conversation Batch 5 closeout is already installed.');
if(!source.includes('__lourexUnifiedAssistantBatch1')||!source.includes('__lourexConversationOwnerBatch4'))throw new Error('AI Conversation Batch 5 closeout requires the unified assistant and Batch 4 owner stack.');

const oldWrapper=`instance.ask=async raw=>{try{await __lourexEnsureAssistantThread(instance);}catch(error){instance.setState({error:error instanceof Error?error.message:String(error)});return;}await baseAsk(raw);await new Promise(resolve=>window.setTimeout(resolve,0));try{await __lourexPersistAssistantThread(instance);}catch(error){if(instance.mounted!==false)instance.setState({error:error instanceof Error?error.message:String(error)});}};`;
if(!source.includes(oldWrapper))throw new Error('AI Conversation Batch 5 could not find the unified submit hydration wrapper.');
const nextWrapper=`instance.ask=async raw=>{const submitted=typeof raw==='string'?raw:String(instance.state.input??'');try{await __lourexEnsureAssistantThread(instance);}catch(error){instance.setState({error:error instanceof Error?error.message:String(error)});return;}await baseAsk(raw===undefined?submitted:raw);await new Promise(resolve=>window.setTimeout(resolve,0));try{await __lourexPersistAssistantThread(instance);}catch(error){if(instance.mounted!==false)instance.setState({error:error instanceof Error?error.message:String(error)});}};`;
source=source.replace(oldWrapper,nextWrapper);
source+=`\nconst __lourexConversationFinalBatch5=true;\n`;

if(!source.includes("const submitted=typeof raw==='string'?raw:String(instance.state.input??'')"))throw new Error('AI Conversation Batch 5 did not preserve the submitted composer text.');
if(!source.includes('await baseAsk(raw===undefined?submitted:raw)'))throw new Error('AI Conversation Batch 5 did not hand preserved text to the advisor request.');
await writeFile(target,source);
execFileSync(process.execPath,['--check',target],{stdio:'pipe'});
console.log('[LOUREX AI] Conversation Batch 5 closeout installed: first submit survives asynchronous thread hydration.');

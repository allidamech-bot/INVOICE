import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const target='dist/src/components/AiCopilot.js';
let source=await readFile(target,'utf8');
if(source.includes('__lourexToolOrchestratorBatch4'))throw new Error('AI Batch 4 tool orchestrator is already installed.');
if(!source.includes('__lourexPremiumConversationBatch3')||!source.includes('__lourexAdvisorDataV2Batch2'))throw new Error('AI Batch 4 requires merged Batches 1–3 runtime.');

source=`import { orchestrateAiToolRequest, aiToolAuditSummary } from '../lib/ai-tool-client.js';\nimport { applyApprovedToolExecution } from '../lib/ai-tool-actions.js';\n`+source;

const requestToken='const payload = await requestAiJson(advisorEndpoint, { message: requestMessage, context }, controller.signal);';
if(!source.includes(requestToken))throw new Error('AI Batch 4 could not find the final advisor request call.');
source=source.replace(requestToken,`const toolResult = await orchestrateAiToolRequest({ message, vault: resumed.vault, context, language: this.props.language === 'ar' ? 'ar' : 'en', signal: controller.signal });\n            if (toolResult) this.__lourexLastToolAudit = aiToolAuditSummary(toolResult);\n            const payload = toolResult ? { answer: toolResult.answer, proposal: toolResult.proposal, __lourexToolOrchestrated: true } : await requestAiJson(advisorEndpoint, { message: requestMessage, context }, controller.signal);`);

const proposalToken='const proposal = safeProposal(payload?.proposal, context, message);';
if(!source.includes(proposalToken))throw new Error('AI Batch 4 could not find proposal sanitization.');
source=source.replace(proposalToken,`const proposal = payload?.__lourexToolOrchestrated && payload?.proposal?.capability === 'tool.execute' ? payload.proposal : safeProposal(payload?.proposal, context, message);`);

source+=`\n\nasync function __lourexApproveToolExecution(instance){\n  const proposal=instance.state?.proposal;if(!proposal||proposal.capability!=='tool.execute'||instance.state.busy||instance.applying)return;\n  instance.applying=true;instance.setState({busy:true,error:''});\n  try{const result=await applyApprovedToolExecution(proposal);const assistant={id:'assistant-tool-'+Date.now().toString(36),role:'assistant',text:(instance.props.language==='ar'?'Actions\\nتم تطبيق الإجراء بعد موافقتك. ':'Actions\\nAction applied after your approval. ')+result.summary};instance.setState(state=>({busy:false,proposal:null,messages:[...(state.messages||[]),assistant]}));instance.addAudit?.('business.explain','approved');window.dispatchEvent(new CustomEvent('lourex-ai-tool-applied',{detail:{tool:proposal.tool,id:result.id}}));}\n  catch(error){const text=error instanceof Error?error.message:String(error);instance.setState({busy:false,error:text});instance.addAudit?.('business.explain','failed');}\n  finally{instance.applying=false;}\n}\nfunction __lourexToolRenderTransform(instance,node){\n  if(!React.isValidElement(node))return node;const className=String(node.props?.className||'');let children=React.Children.toArray(node.props?.children).map(child=>__lourexToolRenderTransform(instance,child));\n  if(className.includes('lourex-ai-proposal-actions')&&instance.state?.proposal?.capability==='tool.execute'){children=children.map(child=>React.isValidElement(child)&&String(child.props?.className||'').includes('primary')?React.cloneElement(child,{onClick:()=>void __lourexApproveToolExecution(instance),disabled:Boolean(instance.state.busy)}):child);}\n  return children.length?React.cloneElement(node,undefined,...children):node;\n}\nconst __lourexBatch4Render=AiCopilot.prototype.render;AiCopilot.prototype.render=function(){return __lourexToolRenderTransform(this,__lourexBatch4Render.call(this));};\nconst __lourexToolOrchestratorBatch4=true;\n`;

if(!source.includes('orchestrateAiToolRequest({ message, vault: resumed.vault'))throw new Error('AI Batch 4 orchestration call was not installed.');
if(!source.includes("proposal.capability!=='tool.execute'"))throw new Error('AI Batch 4 approval gate was not installed.');
await writeFile(target,source);
execFileSync(process.execPath,['--check',target],{stdio:'inherit'});
console.log('[LOUREX AI] Batch 4 tool orchestrator installed: local deterministic tools, bounded planner, approval-gated execution.');

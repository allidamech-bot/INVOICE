import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
// One fail-closed compatibility shim after the audited owners. No product logic here.
const path='dist/src/components/AiCopilot.js';let source=await readFile(path,'utf8');
const imports="import { installIntelligenceRuntime, intelligenceContext, intelligenceRequestMessage, intelligenceReviseDraft, intelligenceTools, intelligenceApprove } from '../lib/ai-intelligence-runtime.js';\n";
if(source.includes('__lourexIntelligenceFoundation'))throw new Error('Foundation already installed.');
const replace=(before,after)=>{if(source.split(before).length!==2)throw new Error('Foundation runtime contract drift: '+before.slice(0,100));source=source.replace(before,after);};
replace('this.__lourexLatestContext=context;','intelligenceContext(this,context);this.__lourexLatestContext=context;');
replace('reviseAiPendingDocumentDraft(pendingDocumentProposal, message, context.drafting, this.props.language)','intelligenceReviseDraft(this,pendingDocumentProposal, message, context.drafting, this.props.language)');
replace('const advisorV2ReadOnly =','context.conversationWorkingMemory = intelligenceRequestMessage(this,"", requestMessage);\n            requestMessage = message;\n            const advisorV2ReadOnly =');
replace('await orchestrateAiToolRequest({ message, vault: resumed.vault, context:','await intelligenceTools(this,{ message, vault: resumed.vault, context:');
replace('const result=await applyApprovedToolExecution(step);','const result=await intelligenceApprove(instance,step,()=>applyApprovedToolExecution(step));if(!result)throw new Error(instance.state.error||"Approval blocked.");');
// Branch is part of every pending import identity, including Temporary threads.
replace("String(r.workspaceId||'default'),String(r.threadId||'')","String(r.workspaceId||'default'),String(r.branchId||'main'),String(r.threadId||'')");
replace('if(!result?.results?.length)return String(result?.answer||\'\');','if(result?.foundationSelectionText)return result.foundationSelectionText;if(!result?.results?.length)return String(result?.answer||\'\');');
source=imports+source+`\nconst __lourexIntelligenceFoundation=true;\nconst __lourexFoundationMount=AiCopilot.prototype.componentDidMount;\nAiCopilot.prototype.componentDidMount=function(){__lourexFoundationMount.call(this);installIntelligenceRuntime(this);};\n`;
await writeFile(path,source);execFileSync(process.execPath,['--check',path]);
console.log('[LOUREX AI] Intelligence Foundation typed kernel compatibility boundary installed.');

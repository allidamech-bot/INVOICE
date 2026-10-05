import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const target='dist/src/components/AiCopilot.js';
let source=await readFile(target,'utf8');
if(!source.includes('__lourexNaturalLanguageOsBatch4'))throw new Error('AI conversation Batch 4 closeout requires the Stage 4 owner.');
if(source.includes('__lourexNaturalLanguageOsBatch4Closeout'))throw new Error('AI conversation Batch 4 closeout is already installed.');

const dismissToken="function __lourexDismissToolProposal(instance){if(instance.state?.proposal?.capability==='tool.plan'||instance.state?.proposal?.capability==='tool.execute'){__lourexAdvanceToolPresentation(instance,true);instance.addAudit?.('business.explain','dismissed');instance.setState({proposal:null});}}";
if(!source.includes(dismissToken))throw new Error('AI conversation Batch 4 closeout could not find the proposal dismiss lifecycle.');
source=source.replace(dismissToken,`function __lourexDismissToolProposal(instance){if(instance.state?.proposal?.capability==='tool.plan'||instance.state?.proposal?.capability==='tool.execute'){const value=instance.__lourexToolPresentation;if(value?.steps)instance.__lourexToolPresentation={...value,steps:value.steps.map(step=>step.status==='approval'?{...step,status:'dismissed',detail:instance.props.language==='ar'?'تم الرفض':'Dismissed'}:step)};instance.addAudit?.('business.explain','dismissed');instance.setState({proposal:null});}}`);

const messageToken="if(tokens.has('lourex-ai-messages')){const card=__lourexToolActivityCard(instance);if(card)children.push(card);}";
if(!source.includes(messageToken))throw new Error('AI conversation Batch 4 closeout could not find the tool activity placement.');
source=source.replace(messageToken,"if(tokens.has('lourex-ai-messages')&&(instance.state?.messages||[]).length){const card=__lourexToolActivityCard(instance);if(card)children.push(card);}");

source+='\nconst __lourexNaturalLanguageOsBatch4Closeout=true;\n';
if(!source.includes("step.status==='approval'?{...step,status:'dismissed'"))throw new Error('AI conversation Batch 4 closeout failed to dismiss all remaining approvals.');
if(!source.includes("tokens.has('lourex-ai-messages')&&(instance.state?.messages||[]).length"))throw new Error('AI conversation Batch 4 closeout failed to hide stale tool activity in blank conversations.');
await writeFile(target,source);
execFileSync(process.execPath,['--check',target],{stdio:'inherit'});
console.log('[LOUREX AI] Conversation Batch 4 closeout installed: dismissed plans clear all pending approval states and blank conversations cannot show stale tool activity.');

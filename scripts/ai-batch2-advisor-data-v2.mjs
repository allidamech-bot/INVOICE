import {readFile,writeFile} from 'node:fs/promises';

const target='dist/src/components/AiCopilot.js';
let source=await readFile(target,'utf8');
if(source.includes('__lourexAdvisorDataV2Batch2'))throw new Error('AI Batch 2 advisor data runtime is already installed.');
if(!source.includes('__lourexUnifiedAssistantBatch1'))throw new Error('AI Batch 2 requires the unified assistant Batch 1 runtime first.');

source=`import { buildAdvisorDataV2 } from '../lib/ai-advisor-v2.js';\n`+source;
const contextStart=source.indexOf('export function buildAiContext(');
const capabilityStart=source.indexOf('export function capabilityRequiresApproval',contextStart);
if(contextStart<0||capabilityStart<=contextStart)throw new Error('AI Batch 2 could not isolate the unified buildAiContext runtime.');
const replacement=`export function buildAiContext(screen, language, financeSource, vault, message, activeDocument) {\n    const prepared = prepareAssistantContext(vault, screen, message, activeDocument, getAssistantScope());\n    const scopedVault = prepared.vault;\n    const business = buildAiBusinessContext(scopedVault);\n    const scopedActiveDocument = prepared.runtime.scope === 'personal' ? null : (activeDocument ?? null);\n    const scopedFinanceSource = { documents: scopedVault.documents, payments: scopedVault.payments, customers: scopedVault.customers, activeDocument: scopedActiveDocument };\n    const finance = buildAiFinanceContext(scopedFinanceSource, prepared.query);\n    const advisorV2 = buildAdvisorDataV2(scopedVault, finance, business, prepared.runtime.scope);\n    return { version: 5, screen, language, allowedCapabilities: prepared.runtime.allowedCapabilities.filter(capability => AI_CAPABILITIES.some(item => item.id === capability)), finance, business, pricing: buildProductPricingContext(scopedVault, prepared.query, business.asOf), drafting: draftReference(scopedVault, prepared.query, scopedActiveDocument), assistantRuntime: prepared.runtime, advisorV2 };\n}\n`;
source=source.slice(0,contextStart)+replacement+source.slice(capabilityStart);

const call=/const payload\s*=\s*await requestAiJson\('\/api\/ai-core',\s*\{\s*message:\s*requestMessage,\s*context\s*\},\s*controller\.signal\);/;
if(!call.test(source))throw new Error('AI Batch 2 could not find the canonical AI Core request call.');
source=source.replace(call,`const advisorV2ReadOnly = capability === 'workspace.help' || capability === 'finance.explain' || (capability === 'business.explain' && !itemActionIntent(message));\n            const advisorEndpoint = advisorV2ReadOnly ? '/api/ai-advisor-v2' : '/api/ai-core';\n            const payload = await requestAiJson(advisorEndpoint, { message: requestMessage, context }, controller.signal);`);

source+=`\n\nconst __lourexAdvisorDataV2Batch2=true;\n`;
if(!source.includes('advisorV2 = buildAdvisorDataV2'))throw new Error('AI Batch 2 advisor context was not installed.');
if(!source.includes("advisorEndpoint = advisorV2ReadOnly ? '/api/ai-advisor-v2' : '/api/ai-core'"))throw new Error('AI Batch 2 read-only routing was not installed.');
await writeFile(target,source);
console.log('[LOUREX AI] Batch 2 deterministic Advisor Data V2 installed.');

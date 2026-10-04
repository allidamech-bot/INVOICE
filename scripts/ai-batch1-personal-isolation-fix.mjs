import {readFile,writeFile} from 'node:fs/promises';

const target='dist/src/components/AiCopilot.js';
let source=await readFile(target,'utf8');
if(source.includes('__lourexBatch1PersonalIsolationFix'))throw new Error('AI Batch 1 personal isolation fix is already installed.');
const financeLine="const scopedFinanceSource = { documents: scopedVault.documents, payments: scopedVault.payments, customers: scopedVault.customers, activeDocument: activeDocument ?? null };";
const financeReplacement="const scopedActiveDocument = prepared.runtime.scope === 'personal' ? null : (activeDocument ?? null);\n    const scopedFinanceSource = { documents: scopedVault.documents, payments: scopedVault.payments, customers: scopedVault.customers, activeDocument: scopedActiveDocument };";
if(!source.includes(financeLine))throw new Error('AI Batch 1 scoped finance source changed unexpectedly.');
source=source.replace(financeLine,financeReplacement);
const drafting="drafting: draftReference(scopedVault, prepared.query, activeDocument)";
if(!source.includes(drafting))throw new Error('AI Batch 1 drafting context changed unexpectedly.');
source=source.replace(drafting,"drafting: draftReference(scopedVault, prepared.query, scopedActiveDocument)");
source+=`\nconst __lourexBatch1PersonalIsolationFix=true;\n`;
if(!source.includes("prepared.runtime.scope === 'personal' ? null"))throw new Error('AI Batch 1 personal active-document isolation is missing.');
await writeFile(target,source);
console.log('LOUREX AI Batch 1 personal isolation fixed: active business documents are excluded from Personal finance and drafting context.');

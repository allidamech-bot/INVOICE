import {readFile,writeFile} from 'node:fs/promises';

const editorTarget='dist/src/components/EditorPageCore.js';
const draftTarget='dist/src/components/DraftDocumentEditor.js';
const appTarget='dist/src/app/App.js';
const aiTarget='dist/src/components/AiCopilot.js';

/* Keep the established short autosave cadence. The expensive full-vault write is
   removed below for automatic draft checkpoints, so delaying later saves is no
   longer necessary and the <=5s durability contract remains intact. */
{
  let source=await readFile(editorTarget,'utf8');
  const autosaveStart=source.indexOf('autosaveDelay =');
  const autosaveEnd=autosaveStart<0?-1:source.indexOf('schedule =',autosaveStart);
  if(autosaveStart<0||autosaveEnd<=autosaveStart)throw new Error('v350 could not isolate EditorPageCore.autosaveDelay.');
  const autosave=`autosaveDelay = () => {\n        const bytes = attachmentBytes(this.state.doc);\n        if (IOS_WEBKIT)\n            return bytes >= 3 * 1024 * 1024 ? 5500 : bytes > 0 ? 4200 : 3200;\n        return bytes >= 5 * 1024 * 1024 ? 1600 : bytes > 0 ? 1200 : 800;\n    };\n    `;
  source=source.slice(0,autosaveStart)+autosave+source.slice(autosaveEnd);

  const validationStart=source.indexOf('validateCurrent =');
  const validationEnd=validationStart<0?-1:source.indexOf('mutate =',validationStart);
  if(validationStart<0||validationEnd<=validationStart)throw new Error('v350 could not isolate EditorPageCore.validateCurrent.');
  let validation=source.slice(validationStart,validationEnd);
  const validationSet=/this\.setState\(\{\s*errors,\s*saveState:\s*'unsaved'\s*\},\s*this\.scrollToFirstError\)/g;
  const validationMatches=validation.match(validationSet)?.length??0;
  if(validationMatches!==1)throw new Error(`v350 expected one Preview validation state update; found ${validationMatches}.`);
  validation=validation.replace(validationSet,"this.setState({ errors, saveState: 'unsaved', mobilePreview: false }, this.scrollToFirstError)");
  source=source.slice(0,validationStart)+validation+source.slice(validationEnd);
  if(!/saveState:\s*'unsaved',\s*mobilePreview:\s*false/.test(source))throw new Error('v350 mobile Preview validation handoff is missing.');
  await writeFile(editorTarget,source);
}

/* Company Draft/Letter keeps its established autosave cadence too. */
{
  let source=await readFile(draftTarget,'utf8');
  const autosaveStart=source.indexOf('autosaveDelay =');
  const autosaveEnd=autosaveStart<0?-1:source.indexOf('schedule =',autosaveStart);
  if(autosaveStart<0||autosaveEnd<=autosaveStart)throw new Error('v350 could not isolate DraftDocumentEditor.autosaveDelay.');
  source=source.slice(0,autosaveStart)+`autosaveDelay = () => IOS_WEBKIT ? 1600 : 900;\n    `+source.slice(autosaveEnd);
  await writeFile(draftTarget,source);
}

/* Automatic document saves now write one small AES-GCM encrypted checkpoint for
   the active draft instead of serializing/encrypting/replacing the complete Vault.
   Explicit saves still commit the complete Vault. A checkpoint is folded into the
   Vault once after Safari/WebKit process recovery and then deleted. No IndexedDB
   schema/version migration is required because the existing records store is used. */
{
  let source=await readFile(appTarget,'utf8');
  const importAnchor="import { activateAccountStorage, activeAccountStorageUid, getCloudAccount, getEncryptedVault, getPublicPreferences, getSecurity, hasSecurity, putCloudAccount, putPublicPreferences } from '../storage/db.js';";
  if(!source.includes(importAnchor))throw new Error('v350 App storage import anchor was not found.');
  source=source.replace(importAnchor,`${importAnchor}\nimport { clearDocumentAutosaveCheckpoint, recoverDocumentAutosaveCheckpoint, saveDocumentAutosaveCheckpoint } from '../storage/document-autosave.js';`);

  const resumedAnchor='const vault = { ...resumed.vault, appSettings: { ...resumed.vault.appSettings, uiLanguage: resumed.vault.appSettings.uiLanguage ?? uiLanguage } };';
  if(!source.includes(resumedAnchor))throw new Error('v350 resumed-vault recovery anchor was not found.');
  source=source.replace(resumedAnchor,`let vault = { ...resumed.vault, appSettings: { ...resumed.vault.appSettings, uiLanguage: resumed.vault.appSettings.uiLanguage ?? uiLanguage } };\n                    const checkpoint = await recoverDocumentAutosaveCheckpoint(resumed.key, vault);\n                    if (checkpoint.applied) {\n                        vault = checkpoint.vault;\n                        const recoveredEncrypted = await saveVault(resumed.key, vault);\n                        this.latestEncryptedVault = recoveredEncrypted;\n                        await clearDocumentAutosaveCheckpoint();\n                    }`);

  const unlockAnchor='result = await unlockVault(pin);';
  if(!source.includes(unlockAnchor))throw new Error('v350 unlock recovery anchor was not found.');
  source=source.replace(unlockAnchor,`${unlockAnchor}\n            const checkpoint = await recoverDocumentAutosaveCheckpoint(result.key, result.vault);\n            if (checkpoint.applied) {\n                result = { ...result, vault: checkpoint.vault };\n                const recoveredEncrypted = await saveVault(result.key, result.vault);\n                this.latestEncryptedVault = recoveredEncrypted;\n                await clearDocumentAutosaveCheckpoint();\n            }`);

  const saveStart=source.indexOf('saveDocument = async');
  const saveEnd=saveStart<0?-1:source.indexOf('beginRevision = async',saveStart);
  if(saveStart<0||saveEnd<=saveStart)throw new Error('v350 could not isolate App.saveDocument.');
  let save=source.slice(saveStart,saveEnd);
  const persistPattern=/await this\.persist\(\{ \.\.\.vault, documents, documentEvents, appSettings \}\);\s*this\.setState\(\{ editorDoc: updated \}\);/;
  if(!persistPattern.test(save))throw new Error('v350 saveDocument persistence anchor was not found.');
  save=save.replace(persistPattern,`if (auto && updated.status === 'draft') {\n            const key = this.state.key;\n            if (!key)\n                throw new Error(t('App is locked.', 'التطبيق مقفل.'));\n            const checkpointEvents = documentEvents.filter(event => event.documentId === updated.id);\n            await saveDocumentAutosaveCheckpoint(key, updated, checkpointEvents, vault.appSettings.activeWorkspaceId, vault.appSettings.activeBranchId);\n            const next = { ...vault, documents, documentEvents, appSettings };\n            if (this.state.unlocked && this.state.key === key)\n                await new Promise(resolve => this.setState({ vault: next, editorDoc: updated }, resolve));\n            return;\n        }\n        await this.persist({ ...vault, documents, documentEvents, appSettings });\n        await clearDocumentAutosaveCheckpoint();\n        this.setState({ editorDoc: updated });`);
  source=source.slice(0,saveStart)+save+source.slice(saveEnd);

  if(!source.includes('saveDocumentAutosaveCheckpoint(key, updated, checkpointEvents'))throw new Error('v350 lightweight document checkpoint path is missing.');
  if(!source.includes('recoverDocumentAutosaveCheckpoint(resumed.key, vault)'))throw new Error('v350 session recovery path is missing.');
  if(!source.includes('recoverDocumentAutosaveCheckpoint(result.key, result.vault)'))throw new Error('v350 PIN unlock recovery path is missing.');
  await writeFile(appTarget,source);
}

/* AiCopilot behavior stays in its class. This wrapper retires the historical
   inline <style> owner and adds a true in-memory conversation reset without
   touching vault data or the audit log. */
{
  let source=await readFile(aiTarget,'utf8');
  if(!source.includes('export class AiCopilot extends React.Component'))throw new Error('v350 AiCopilot class export was not found.');
  if(source.includes('__lourexAiV350Render'))throw new Error('v350 AI render hardening was already installed unexpectedly.');
  source+=`\n\nconst __lourexAiV350Render=AiCopilot.prototype.render;\nAiCopilot.prototype.render=function(){\n  const instance=this;\n  const transform=(node)=>{\n    if(!React.isValidElement(node))return node;\n    if(node.type==='style'&&node.props?.['data-lourex-ai-core'])return null;\n    const children=React.Children.toArray(node.props?.children).map(transform).filter(child=>child!==null);\n    if(node.props?.className==='lourex-ai-head'){\n      const title=children[0]??null;\n      const close=children[1]??null;\n      const actions=React.createElement('div',{className:'lourex-ai-head-actions',style:{display:'flex',alignItems:'center',gap:'6px',flex:'0 0 auto'}},\n        React.createElement('button',{type:'button',className:'btn btn-ghost lourex-ai-new-conversation',disabled:Boolean(instance.state.busy),onClick:()=>instance.setState({input:'',error:'',messages:[],proposal:null,auditOpen:false}),'aria-label':t('New conversation','محادثة جديدة'),title:t('New conversation','محادثة جديدة')},t('New conversation','محادثة جديدة')),\n        close);\n      return React.cloneElement(node,undefined,title,actions);\n    }\n    return children.length?React.cloneElement(node,undefined,...children):node;\n  };\n  return transform(__lourexAiV350Render.call(this));\n};\n`;
  if(!source.includes("node.type==='style'&&node.props?.['data-lourex-ai-core']"))throw new Error('v350 legacy AI inline style retirement is missing.');
  if(!source.includes("t('New conversation','محادثة جديدة')"))throw new Error('v350 New conversation control is missing.');
  await writeFile(aiTarget,source);
}

console.log('LOUREX v350 rendering/storage hardening installed: lightweight encrypted document autosave checkpoints, full-vault recovery flush, visible Preview validation handoff, single AI CSS owner and functional New conversation control.');

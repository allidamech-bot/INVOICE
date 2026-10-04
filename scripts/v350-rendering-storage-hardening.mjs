import {readFile,writeFile} from 'node:fs/promises';

const editorTarget='dist/src/components/EditorPageCore.js';
const runtimeTarget='dist/src/app/index.js';
const aiTarget='dist/src/components/AiCopilot.js';

/* iPhone/iPad autosave keeps the established <=5s first checkpoint contract.
   Full-vault write pressure is handled below by a separate encrypted document
   checkpoint, so this timing must not be stretched beyond the stability gate. */
{
  let source=await readFile(editorTarget,'utf8');

  const autosaveStart=source.indexOf('autosaveDelay =');
  const autosaveEnd=autosaveStart<0?-1:source.indexOf('schedule =',autosaveStart);
  if(autosaveStart<0||autosaveEnd<=autosaveStart)throw new Error('v350 could not isolate EditorPageCore.autosaveDelay.');
  let autosave=source.slice(autosaveStart,autosaveEnd);
  const iosDelay=/bytes\s*>=\s*3\s*\*\s*1024\s*\*\s*1024\s*\?\s*2400\s*:\s*bytes\s*>\s*0\s*\?\s*1900\s*:\s*1400/g;
  const iosDelayMatches=autosave.match(iosDelay)?.length??0;
  if(iosDelayMatches!==1)throw new Error(`v350 expected one iOS autosave delay policy; found ${iosDelayMatches}.`);
  autosave=autosave.replace(iosDelay,'bytes >= 3 * 1024 * 1024 ? 5500 : bytes > 0 ? 4200 : 3200');
  source=source.slice(0,autosaveStart)+autosave+source.slice(autosaveEnd);

  /* A validation failure triggered from the visible mobile Preview used to render
     errors behind the overlay, making PDF/Share appear inert. Close Preview in the
     same state update before scrollToFirstError runs. */
  const validationStart=source.indexOf('validateCurrent =');
  const validationEnd=validationStart<0?-1:source.indexOf('mutate =',validationStart);
  if(validationStart<0||validationEnd<=validationStart)throw new Error('v350 could not isolate EditorPageCore.validateCurrent.');
  let validation=source.slice(validationStart,validationEnd);
  const validationSet=/this\.setState\(\{\s*errors,\s*saveState:\s*'unsaved'\s*\},\s*this\.scrollToFirstError\)/g;
  const validationMatches=validation.match(validationSet)?.length??0;
  if(validationMatches!==1)throw new Error(`v350 expected one Preview validation state update; found ${validationMatches}.`);
  validation=validation.replace(validationSet,"this.setState({ errors, saveState: 'unsaved', mobilePreview: false }, this.scrollToFirstError)");
  source=source.slice(0,validationStart)+validation+source.slice(validationEnd);

  if(!source.includes('bytes >= 3 * 1024 * 1024 ? 5500 : bytes > 0 ? 4200 : 3200'))throw new Error('v350 iOS autosave checkpoint timing is missing.');
  if(!/saveState:\s*'unsaved',\s*mobilePreview:\s*false/.test(source))throw new Error('v350 mobile Preview validation handoff is missing.');
  await writeFile(editorTarget,source);
}

/* Autosave durability and full-vault persistence are deliberately split here.
   EditorPageCore still calls onSave within the existing stability window, but an
   automatic draft save writes one encrypted document checkpoint rather than
   serializing/encrypting/replacing the entire Vault. The in-memory Vault/write tail
   stays authoritative for all concurrent operations. At most every 30s, on a
   normal editor close, or when another full mutation occurs, the latest queued
   Vault is encrypted once and the checkpoint is cleared. A crash/process reload
   recovers the encrypted checkpoint before workspace continuity reopens the editor. */
{
  let source=await readFile(runtimeTarget,'utf8');
  if(source.includes('__lourexDocumentAutosaveV486'))throw new Error('v350 document autosave checkpoint runtime was already installed unexpectedly.');
  const imports=`import { clearDocumentAutosaveCheckpoint, recoverDocumentAutosaveCheckpoint, saveDocumentAutosaveCheckpoint } from '../storage/document-autosave.js';\nimport { mergeVaultIntent as mergeVaultIntentForAutosave } from '../storage/vault-merge.js';\nimport { overlayWorkspaceScope as overlayWorkspaceScopeForAutosave, scopeVault as scopeVaultForAutosave } from '../lib/workspaces.js';\n`;
  source=imports+source;

  const marker='    return true;\n  })();';
  const markerIndex=source.indexOf(marker);
  if(markerIndex<0)throw new Error('v350 could not locate AdaptiveCloudApp runtime closeout.');
  const runtime=`
    const __lourexDocumentAutosaveV486=true;
    const fullPersist=instance.persist.bind(instance);
    const fullSaveDocument=instance.saveDocument.bind(instance);
    const baseInitialize=instance.initialize.bind(instance);
    const baseUnlock=instance.unlock.bind(instance);
    const baseCloseEditor=instance.closeEditor.bind(instance);
    const baseFlushCloudSync=instance.flushCloudSync.bind(instance);
    let autosaveDocumentId='';
    let checkpointPending=false;
    let checkpointFlushTimer=0;
    let checkpointFlushPromise=null;
    let checkpointCloseRunning=false;

    const clearCheckpointFlushTimer=()=>{
      if(!checkpointFlushTimer)return;
      window.clearTimeout(checkpointFlushTimer);
      checkpointFlushTimer=0;
    };

    const recoverPendingDocumentAutosave=async()=>{
      await new Promise(resolve=>window.setTimeout(resolve,0));
      const key=instance.state.key,vault=instance.state.vault;
      if(!instance.state.unlocked||!key||!vault)return;
      const recovered=await recoverDocumentAutosaveCheckpoint(key,vault);
      if(!recovered.found||!recovered.applied)return;
      const encrypted=await saveVault(key,recovered.vault);
      instance.latestEncryptedVault=encrypted;
      await clearDocumentAutosaveCheckpoint();
      instance.vaultWriteTail=Promise.resolve(recovered.vault);
      await new Promise(resolve=>instance.setState({vault:recovered.vault},resolve));
      instance.scheduleCloudSync(150);
    };

    const flushDocumentCheckpoint=()=>{
      if(checkpointFlushPromise)return checkpointFlushPromise;
      clearCheckpointFlushTimer();
      if(!checkpointPending)return Promise.resolve();
      const operation=instance.vaultWriteTail.catch(()=>null).then(async queued=>{
        await instance.waitForProtectedDataOperation();
        const key=instance.state.key;
        if(!key)throw new Error(t('App is locked.','التطبيق مقفل.'));
        const latest=queued??instance.state.vault;
        if(!latest)throw new Error(t('LOUREX workspace is not ready.','مساحة LOUREX غير جاهزة.'));
        const encrypted=await saveVault(key,latest);
        instance.latestEncryptedVault=encrypted;
        await clearDocumentAutosaveCheckpoint();
        checkpointPending=false;
        if(instance.state.unlocked&&instance.state.key===key)await new Promise(resolve=>instance.setState({vault:latest},resolve));
        instance.scheduleCloudSync();
        return latest;
      });
      instance.vaultWriteTail=operation;
      checkpointFlushPromise=operation.then(()=>undefined).finally(()=>{checkpointFlushPromise=null;if(checkpointPending&&!checkpointFlushTimer)checkpointFlushTimer=window.setTimeout(()=>void flushDocumentCheckpoint().catch(()=>undefined),30000);});
      return checkpointFlushPromise;
    };

    const scheduleDocumentCheckpointFlush=()=>{
      if(checkpointFlushTimer||checkpointFlushPromise)return;
      checkpointFlushTimer=window.setTimeout(()=>{checkpointFlushTimer=0;void flushDocumentCheckpoint().catch(()=>undefined);},30000);
    };

    instance.persist=async intended=>{
      const base=instance.requireVault();
      const documentId=autosaveDocumentId;
      const intendedDocument=documentId?intended.documents.find(document=>document.id===documentId):null;
      const checkpointEligible=Boolean(documentId&&intendedDocument&&intendedDocument.status==='draft'&&intendedDocument.lifecycleStatus!=='voided'&&intended.documents!==base.documents&&intended.appSettings===base.appSettings);
      if(!checkpointEligible){
        const result=await fullPersist(intended);
        clearCheckpointFlushTimer();
        checkpointPending=false;
        await clearDocumentAutosaveCheckpoint();
        return result;
      }
      const operation=instance.vaultWriteTail.catch(()=>null).then(async queued=>{
        await instance.waitForProtectedDataOperation();
        const key=instance.state.key;
        if(!key)throw new Error(t('App is locked.','التطبيق مقفل.'));
        const latestFull=queued??instance.state.vault;
        if(!latestFull)throw new Error(t('LOUREX workspace is not ready.','مساحة LOUREX غير جاهزة.'));
        const latest=scopeVaultForAutosave(latestFull);
        const scopedIntended=applyWorkspaceScope(base,intended);
        const merged=mergeVaultIntentForAutosave(base,scopedIntended,latest);
        const audited=appendAuditEventsForVaultDiff(latest,merged);
        const next=overlayWorkspaceScopeForAutosave(latestFull,audited);
        const scopedNext=scopeVaultForAutosave(next);
        const checkpointDocument=scopedNext.documents.find(document=>document.id===documentId);
        if(!checkpointDocument)throw new Error(t('Document autosave could not find the active draft.','تعذر العثور على المسودة النشطة للحفظ التلقائي.'));
        const existingEvents=new Set(latest.documentEvents.map(event=>event.id));
        const checkpointEvents=audited.documentEvents.filter(event=>!existingEvents.has(event.id));
        await saveDocumentAutosaveCheckpoint(key,checkpointDocument,checkpointEvents,scopedNext.appSettings.activeWorkspaceId,scopedNext.appSettings.activeBranchId);
        checkpointPending=true;
        if(instance.state.unlocked&&instance.state.key===key)await new Promise(resolve=>instance.setState({vault:next},resolve));
        scheduleDocumentCheckpointFlush();
        return next;
      });
      instance.vaultWriteTail=operation;
      await operation;
    };

    instance.saveDocument=async(doc,auto=false)=>{
      if(!auto||doc.status!=='draft')return fullSaveDocument(doc,auto);
      autosaveDocumentId=doc.id;
      try{return await fullSaveDocument(doc,true);}
      finally{if(autosaveDocumentId===doc.id)autosaveDocumentId='';}
    };

    instance.initialize=async()=>{await baseInitialize();await recoverPendingDocumentAutosave();};
    instance.unlock=async pin=>{await baseUnlock(pin);await recoverPendingDocumentAutosave();};

    instance.closeEditor=()=>{
      if(!checkpointPending&&!checkpointFlushPromise){baseCloseEditor();return;}
      if(checkpointCloseRunning)return;
      checkpointCloseRunning=true;
      void flushDocumentCheckpoint().then(()=>baseCloseEditor()).catch(error=>instance.showToast(error instanceof Error?error.message:t('Unable to finish saving this document.','تعذر إكمال حفظ هذا المستند.'),'error')).finally(()=>{checkpointCloseRunning=false;});
    };

    instance.flushCloudSync=()=>{
      if(checkpointPending||checkpointFlushPromise){instance.cloudSyncQueued=true;return Promise.resolve();}
      return baseFlushCloudSync();
    };
`;
  source=source.slice(0,markerIndex)+runtime+source.slice(markerIndex);
  if(!source.includes('saveDocumentAutosaveCheckpoint(key,checkpointDocument,checkpointEvents'))throw new Error('v350 lightweight document checkpoint path is missing.');
  if(!source.includes('window.setTimeout(()=>void flushDocumentCheckpoint().catch(()=>undefined),30000)'))throw new Error('v350 periodic full-vault flush is missing.');
  if(!source.includes('recoverDocumentAutosaveCheckpoint(key,vault)'))throw new Error('v350 checkpoint recovery path is missing.');
  await writeFile(runtimeTarget,source);
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

console.log('LOUREX v350 rendering/storage hardening installed: encrypted document checkpoints with periodic full-vault flush, visible Preview validation handoff, single AI CSS owner and functional New conversation control.');

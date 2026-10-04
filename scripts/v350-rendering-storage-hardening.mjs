import {readFile,writeFile} from 'node:fs/promises';

const editorTarget='dist/src/components/EditorPageCore.js';
const draftTarget='dist/src/components/DraftDocumentEditor.js';
const aiTarget='dist/src/components/AiCopilot.js';

/* Document autosave still preserves the encrypted full-vault storage contract.
   The first dirty checkpoint keeps the established short delay, while subsequent
   successful saves within one minute use a longer quiet window. This avoids
   repeatedly JSON-stringifying, encrypting and replacing the complete Vault during
   stop/start typing on Safari without weakening explicit Save, visibilitychange,
   pagehide or close durability. */
{
  let source=await readFile(editorTarget,'utf8');

  const autosaveStart=source.indexOf('autosaveDelay =');
  const autosaveEnd=autosaveStart<0?-1:source.indexOf('schedule =',autosaveStart);
  if(autosaveStart<0||autosaveEnd<=autosaveStart)throw new Error('v350 could not isolate EditorPageCore.autosaveDelay.');
  const adaptiveAutosave=`autosaveDelay = () => {\n        const bytes = attachmentBytes(this.state.doc);\n        const recentPersist = Date.now() - Number(this.__lourexLastPersistAt || 0) < 60000;\n        if (IOS_WEBKIT) {\n            if (recentPersist)\n                return bytes >= 3 * 1024 * 1024 ? 22000 : bytes > 0 ? 16000 : 12000;\n            return bytes >= 3 * 1024 * 1024 ? 5500 : bytes > 0 ? 4200 : 3200;\n        }\n        if (recentPersist)\n            return bytes >= 5 * 1024 * 1024 ? 8000 : bytes > 0 ? 6000 : 4000;\n        return bytes >= 5 * 1024 * 1024 ? 1600 : bytes > 0 ? 1200 : 800;\n    };\n    `;
  source=source.slice(0,autosaveStart)+adaptiveAutosave+source.slice(autosaveEnd);

  const saveStart=source.indexOf('save = async',autosaveEnd);
  const saveEnd=saveStart<0?-1:source.indexOf('saveAndClose =',saveStart);
  if(saveStart<0||saveEnd<=saveStart)throw new Error('v350 could not isolate EditorPageCore.save.');
  let save=source.slice(saveStart,saveEnd);
  const savePersist=/await this\.props\.onSave\(snapshot,\s*auto\);/g;
  const savePersistMatches=save.match(savePersist)?.length??0;
  if(savePersistMatches!==1)throw new Error(`v350 expected one EditorPageCore autosave persistence call; found ${savePersistMatches}.`);
  save=save.replace(savePersist,'await this.props.onSave(snapshot, auto);\n            this.__lourexLastPersistAt = Date.now();');
  source=source.slice(0,saveStart)+save+source.slice(saveEnd);

  /* A validation failure triggered from the visible mobile Preview used to render
     errors behind the overlay, making PDF/Share appear inert. Close Preview in the
     same state update before scrollToFirstError runs. The public v350 click bridge
     remains a compatibility fallback for older compiled caches. */
  const validationStart=source.indexOf('validateCurrent =');
  const validationEnd=validationStart<0?-1:source.indexOf('mutate =',validationStart);
  if(validationStart<0||validationEnd<=validationStart)throw new Error('v350 could not isolate EditorPageCore.validateCurrent.');
  let validation=source.slice(validationStart,validationEnd);
  const validationSet=/this\.setState\(\{\s*errors,\s*saveState:\s*'unsaved'\s*\},\s*this\.scrollToFirstError\)/g;
  const validationMatches=validation.match(validationSet)?.length??0;
  if(validationMatches!==1)throw new Error(`v350 expected one Preview validation state update; found ${validationMatches}.`);
  validation=validation.replace(validationSet,"this.setState({ errors, saveState: 'unsaved', mobilePreview: false }, this.scrollToFirstError)");
  source=source.slice(0,validationStart)+validation+source.slice(validationEnd);

  if(!source.includes('recentPersist = Date.now() - Number(this.__lourexLastPersistAt || 0) < 60000'))throw new Error('v350 adaptive autosave cooldown is missing.');
  if(!source.includes('bytes >= 3 * 1024 * 1024 ? 22000 : bytes > 0 ? 16000 : 12000'))throw new Error('v350 iOS repeated-write cooldown is missing.');
  if(!source.includes('this.__lourexLastPersistAt = Date.now()'))throw new Error('v350 persisted checkpoint timestamp is missing.');
  if(!/saveState:\s*'unsaved',\s*mobilePreview:\s*false/.test(source))throw new Error('v350 mobile Preview validation handoff is missing.');
  await writeFile(editorTarget,source);
}

/* Company Draft/Letter documents share the same encrypted Vault. They previously
   autosaved every 1.6s on iOS. Keep the first checkpoint unchanged, then coalesce
   repeated successful writes while the user continues editing. */
{
  let source=await readFile(draftTarget,'utf8');
  const autosaveStart=source.indexOf('autosaveDelay =');
  const autosaveEnd=autosaveStart<0?-1:source.indexOf('schedule =',autosaveStart);
  if(autosaveStart<0||autosaveEnd<=autosaveStart)throw new Error('v350 could not isolate DraftDocumentEditor.autosaveDelay.');
  const adaptiveDraftAutosave=`autosaveDelay = () => {\n        const recentPersist = Date.now() - Number(this.__lourexLastPersistAt || 0) < 60000;\n        if (recentPersist)\n            return IOS_WEBKIT ? 10000 : 3500;\n        return IOS_WEBKIT ? 1600 : 900;\n    };\n    `;
  source=source.slice(0,autosaveStart)+adaptiveDraftAutosave+source.slice(autosaveEnd);

  const saveStart=source.indexOf('save = async',autosaveEnd);
  const saveEnd=saveStart<0?-1:source.indexOf('persistStable =',saveStart);
  if(saveStart<0||saveEnd<=saveStart)throw new Error('v350 could not isolate DraftDocumentEditor.save.');
  let save=source.slice(saveStart,saveEnd);
  const savePersist=/await this\.props\.onSave\(doc,\s*auto\);/g;
  const savePersistMatches=save.match(savePersist)?.length??0;
  if(savePersistMatches!==1)throw new Error(`v350 expected one DraftDocumentEditor autosave persistence call; found ${savePersistMatches}.`);
  save=save.replace(savePersist,'await this.props.onSave(doc, auto);\n            this.__lourexLastPersistAt = Date.now();');
  source=source.slice(0,saveStart)+save+source.slice(saveEnd);

  if(!source.includes('return IOS_WEBKIT ? 10000 : 3500'))throw new Error('v350 Draft repeated-write cooldown is missing.');
  if(!source.includes('this.__lourexLastPersistAt = Date.now()'))throw new Error('v350 Draft persisted checkpoint timestamp is missing.');
  await writeFile(draftTarget,source);
}

/* AiCopilot behavior stays in its class. This wrapper retires the historical
   inline <style> owner and adds a true in-memory conversation reset without
   touching vault data or the audit log. It operates on the React element tree,
   not DOM internals, and therefore remains independent of visual CSS ordering. */
{
  let source=await readFile(aiTarget,'utf8');
  if(!source.includes('export class AiCopilot extends React.Component'))throw new Error('v350 AiCopilot class export was not found.');
  if(source.includes('__lourexAiV350Render'))throw new Error('v350 AI render hardening was already installed unexpectedly.');

  source+=`\n\nconst __lourexAiV350Render=AiCopilot.prototype.render;\nAiCopilot.prototype.render=function(){\n  const instance=this;\n  const transform=(node)=>{\n    if(!React.isValidElement(node))return node;\n    if(node.type==='style'&&node.props?.['data-lourex-ai-core'])return null;\n    const children=React.Children.toArray(node.props?.children).map(transform).filter(child=>child!==null);\n    if(node.props?.className==='lourex-ai-head'){\n      const title=children[0]??null;\n      const close=children[1]??null;\n      const actions=React.createElement('div',{className:'lourex-ai-head-actions',style:{display:'flex',alignItems:'center',gap:'6px',flex:'0 0 auto'}},\n        React.createElement('button',{type:'button',className:'btn btn-ghost lourex-ai-new-conversation',disabled:Boolean(instance.state.busy),onClick:()=>instance.setState({input:'',error:'',messages:[],proposal:null,auditOpen:false}),'aria-label':t('New conversation','محادثة جديدة'),title:t('New conversation','محادثة جديدة')},t('New conversation','محادثة جديدة')),\n        close);\n      return React.cloneElement(node,undefined,title,actions);\n    }\n    return children.length?React.cloneElement(node,undefined,...children):node;\n  };\n  return transform(__lourexAiV350Render.call(this));\n};\n`;

  if(!source.includes("node.type==='style'&&node.props?.['data-lourex-ai-core']"))throw new Error('v350 legacy AI inline style retirement is missing.');
  if(!source.includes("t('New conversation','محادثة جديدة')"))throw new Error('v350 New conversation control is missing.');
  await writeFile(aiTarget,source);
}

console.log('LOUREX v350 rendering/storage hardening installed: adaptive full-vault autosave cooldown, visible Preview validation handoff, single AI CSS owner and functional New conversation control.');

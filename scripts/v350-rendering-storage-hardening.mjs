import {readFile,writeFile} from 'node:fs/promises';

const editorTarget='dist/src/components/EditorPageCore.js';
const aiTarget='dist/src/components/AiCopilot.js';

/* iPhone/iPad autosave: each save encrypts and replaces the complete vault record.
   Keep explicit Save, visibilitychange and pagehide durability unchanged, but avoid
   rewriting a multi-megabyte vault every ~1.4s while the user is continuously
   editing. The wrapper already serializes writes, so a longer quiet-period is the
   safest way to reduce WebKit IDB WAL/copy-on-write pressure without changing the
   storage schema or skipping a user-requested save. */
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

  if(!source.includes('bytes >= 3 * 1024 * 1024 ? 5500 : bytes > 0 ? 4200 : 3200'))throw new Error('v350 iOS write-pressure policy is missing.');
  if(!/saveState:\s*'unsaved',\s*mobilePreview:\s*false/.test(source))throw new Error('v350 mobile Preview validation handoff is missing.');
  await writeFile(editorTarget,source);
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

console.log('LOUREX v350 rendering/storage hardening installed: lower iOS vault-write pressure, visible Preview validation handoff, single AI CSS owner and functional New conversation control.');

import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const target='dist/src/components/AiCopilot.js';
const cssTarget='dist/ai-composer-v449.css';
let source=await readFile(target,'utf8');
if(!source.includes('__lourexConversationComposerBatch3'))throw new Error('AI Batch 3 closeout requires the unified composer runtime.');
if(source.includes('__lourexConversationCloseoutBatch3'))throw new Error('AI Batch 3 closeout is already installed.');

/* Keep close ownership inside the rendered AiCopilot tree. A document-level
   capture listener can outlive/remount the visible instance and intercept the
   click before React reaches the current panel. The final render wrapper binds
   Close + backdrop directly to the instance that produced those nodes. */
source+=`\n\nconst __lourexConversationCloseoutBatch3=true;\nfunction __lourexCloseConversationBatch3(instance){\n  if(instance.applying)return;\n  instance.__lourexAttachmentAbort?.abort();\n  instance.cancelRequest?.();\n  instance.setState({open:false,busy:false,error:'',proposal:null,attachmentMenuOpen:false});\n}\nconst __lourexBatch3CloseRender=AiCopilot.prototype.render;\nAiCopilot.prototype.render=function(){\n  const instance=this,tree=__lourexBatch3CloseRender.call(this);\n  const transform=node=>{\n    if(!React.isValidElement(node))return node;\n    const className=String(node.props?.className||'');\n    const children=React.Children.toArray(node.props?.children).map(transform);\n    if(className==='lourex-ai-backdrop'||className.includes('lourex-ai-close'))return React.cloneElement(node,{onClick:event=>{event?.preventDefault?.();event?.stopPropagation?.();__lourexCloseConversationBatch3(instance);}},...children);\n    return children.length?React.cloneElement(node,undefined,...children):node;\n  };\n  return transform(tree);\n};\n`;

for(const token of ["instance.setState({open:false,busy:false,error:'',proposal:null,attachmentMenuOpen:false})","className==='lourex-ai-backdrop'||className.includes('lourex-ai-close')"])if(!source.includes(token))throw new Error('AI Batch 3 current-instance close owner is missing '+token);
if(source.includes("document.addEventListener('click',instance.__lourexCloseCapture,true)"))throw new Error('AI Batch 3 must not own Close through a document capture listener.');
await writeFile(target,source);
execFileSync(process.execPath,['--check',target],{stdio:'pipe'});

/* The Batch 3 visual contract reuses the canonical v485 palette and promises
   44px mobile targets. Keep the final emitted CSS honest even on 320–360px
   phones instead of introducing a second hard-coded blue or shrinking targets. */
let css=await readFile(cssTarget,'utf8');
const hardcodedSend="background:linear-gradient(135deg,#619dff,#3975e8)!important;border:1px solid rgba(168,202,255,.42)!important;box-shadow:0 7px 18px rgba(47,106,224,.18),inset 0 1px 0 rgba(255,255,255,.18)!important;";
const tokenSend="background:var(--lx485-blue,var(--ft-accent))!important;border:1px solid color-mix(in srgb,var(--lx485-blue,var(--ft-accent)) 66%,var(--lx485-line-strong,var(--ft-line-strong)))!important;box-shadow:0 7px 18px color-mix(in srgb,var(--lx485-blue,var(--ft-accent)) 18%,transparent),inset 0 1px 0 rgba(255,255,255,.18)!important;";
if(!css.includes(hardcodedSend))throw new Error('AI Batch 3 closeout could not find the hard-coded send treatment.');
css=css.replace(hardcodedSend,tokenSend);
const narrowTargets="#lourex-ai-panel .lourex-ai-attach-button,#lourex-ai-panel .lourex-ai-composer-mic,#lourex-ai-panel .lourex-ai-send{flex-basis:42px!important;width:42px!important;min-width:42px!important;height:44px!important;min-height:44px!important;}";
const safeTargets="#lourex-ai-panel .lourex-ai-attach-button,#lourex-ai-panel .lourex-ai-composer-mic,#lourex-ai-panel .lourex-ai-send{flex-basis:44px!important;width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;}";
if(!css.includes(narrowTargets))throw new Error('AI Batch 3 closeout could not find the narrow-phone target override.');
css=css.replace(narrowTargets,safeTargets);
if(/#619dff|#3975e8|rgba\(168,202,255|rgba\(47,106,224/.test(css))throw new Error('AI Batch 3 must not emit a competing hard-coded blue send palette.');
await writeFile(cssTarget,css);

console.log('[LOUREX AI] Batch 3 closeout installed: current-instance Close ownership, v485 send palette, and 44px mobile targets are enforced.');

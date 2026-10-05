import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const target='dist/src/components/AiCopilot.js';
let source=await readFile(target,'utf8');
if(!source.includes('__lourexConversationComposerBatch3'))throw new Error('AI Batch 3 closeout requires the unified composer runtime.');
if(source.includes('__lourexConversationCloseoutBatch3'))throw new Error('AI Batch 3 closeout is already installed.');

source+=`\n\nconst __lourexConversationCloseoutBatch3=true;\nfunction __lourexCloseConversationBatch3(instance){\n  if(instance.applying)return;\n  instance.__lourexAttachmentAbort?.abort();\n  instance.cancelRequest?.();\n  instance.setState({open:false,busy:false,error:'',proposal:null,attachmentMenuOpen:false});\n}\nconst __lourexBatch3CloseRender=AiCopilot.prototype.render;\nAiCopilot.prototype.render=function(){\n  const instance=this,tree=__lourexBatch3CloseRender.call(this);\n  const transform=node=>{\n    if(!React.isValidElement(node))return node;\n    const className=String(node.props?.className||'');\n    const children=React.Children.toArray(node.props?.children).map(transform);\n    if(className==='lourex-ai-backdrop'||className.includes('lourex-ai-close'))return React.cloneElement(node,{onClick:event=>{event?.stopPropagation?.();__lourexCloseConversationBatch3(instance);}},...children);\n    return children.length?React.cloneElement(node,undefined,...children):node;\n  };\n  return transform(tree);\n};\n`;

if(!source.includes("className==='lourex-ai-backdrop'||className.includes('lourex-ai-close')"))throw new Error('AI Batch 3 deterministic close owner is missing.');
await writeFile(target,source);
execFileSync(process.execPath,['--check',target],{stdio:'pipe'});
console.log('[LOUREX AI] Batch 3 closeout installed: Close and backdrop deterministically release the assistant overlay before shell navigation.');

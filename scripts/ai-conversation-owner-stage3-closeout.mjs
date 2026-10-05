import {readFile,writeFile} from 'node:fs/promises';

const cssTarget='dist/ai-composer-v449.css';
const aiTarget='dist/src/components/AiCopilot.js';

/* Batch 3 closeout owns only the final visual-contract corrections discovered
   during deep QA. The earlier Close/backdrop failure came from the legacy
   obsidian-shell QA fixture hiding the new composer until the removed v449 plus
   control appeared; production close behavior must therefore remain owned by
   AiCopilot instead of carrying a diagnostic render/DOM override. */
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
if(!css.includes("background:var(--lx485-blue,var(--ft-accent))!important"))throw new Error('AI Batch 3 send action must consume the canonical LOUREX accent token.');
if(!css.includes(safeTargets))throw new Error('AI Batch 3 narrow-phone controls must remain 44px touch targets.');

await writeFile(cssTarget,css);

/* Publish one stable downstream readiness marker for later conversation stages.
   Batch 3's AiCopilot implementation marker remains the source of truth; this
   alias only declares that the complete Stage 3 contract has reached dist. */
let ai=await readFile(aiTarget,'utf8');
if(!ai.includes('__lourexConversationComposerBatch3'))throw new Error('AI Batch 3 closeout requires the merged AiCopilot composer owner.');
if(!ai.includes('__lourexConversationOwnerStage3')){
  ai+='\nconst __lourexConversationOwnerStage3=true;\n';
  await writeFile(aiTarget,ai);
}

console.log('[LOUREX AI] Batch 3 closeout installed: v485 send palette, 44px narrow-phone targets and the downstream Stage 3 readiness marker are enforced without overriding AiCopilot close ownership.');

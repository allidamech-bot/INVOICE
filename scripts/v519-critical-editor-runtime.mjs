import {readFile,writeFile} from 'node:fs/promises';

const runtimeTarget='dist/src/app/index.js';
let source=await readFile(runtimeTarget,'utf8');

/*
 * Critical document editing guard.
 *
 * The encrypted document checkpoint is already the crash-durability boundary while
 * a quote/invoice editor is open. Re-encrypting the complete Vault every 30 seconds
 * while the user is still typing defeats that design and can create a large WebKit
 * CPU/memory spike. Keep the checkpoint lightweight for the whole active editing
 * session; the existing closeEditor/full-mutation paths still flush it into the
 * authoritative encrypted Vault before leaving the workflow or changing other data.
 */
const periodicFlush=`const scheduleDocumentCheckpointFlush=()=>{\n      if(checkpointFlushTimer||checkpointFlushPromise)return;\n      checkpointFlushTimer=window.setTimeout(()=>{checkpointFlushTimer=0;void flushDocumentCheckpoint().catch(()=>undefined);},30000);\n    };`;
if(!source.includes(periodicFlush))throw new Error('v519 could not find the document checkpoint periodic flush owner.');
source=source.replace(periodicFlush,`const scheduleDocumentCheckpointFlush=()=>{\n      // v519: the lightweight checkpoint remains authoritative while the editor is open.\n      // Full-vault encryption is intentionally deferred to close/full-mutation boundaries.\n    };`);

/*
 * Mobile virtual keyboards do not reliably emit window keydown events for every
 * edit. The base inactivity timer previously listened only to pointerdown/keydown/
 * touchstart, so a user could be actively typing into a quotation on iPhone/iPad
 * while the security timer believed the app was idle and automatically unmounted
 * the editor. Input/composition events now count as genuine activity without
 * weakening the configured idle timeout.
 */
const activityAnchor='const __lourexDocumentAutosaveV486=true;';
if(!source.includes(activityAnchor))throw new Error('v519 could not find the adaptive document runtime owner.');
const activityRuntime=`${activityAnchor}\n    const editorActivityEvents=['input','beforeinput','compositionstart','compositionend'];\n    for(const eventName of editorActivityEvents)window.addEventListener(eventName,instance.activity,{passive:true});\n    const baseComponentWillUnmountForEditorActivity=instance.componentWillUnmount?.bind(instance);\n    instance.componentWillUnmount=()=>{\n      for(const eventName of editorActivityEvents)window.removeEventListener(eventName,instance.activity);\n      baseComponentWillUnmountForEditorActivity?.();\n    };`;
source=source.replace(activityAnchor,activityRuntime);

if(source.includes('window.setTimeout(()=>void flushDocumentCheckpoint().catch(()=>undefined),30000)'))throw new Error('v519 periodic full-vault checkpoint flush is still active.');
if(!source.includes("const editorActivityEvents=['input','beforeinput','compositionstart','compositionend'];"))throw new Error('v519 mobile editor activity coverage is missing.');
if(!source.includes('if(checkpointPending||checkpointFlushPromise){instance.cloudSyncQueued=true;return Promise.resolve();}'))throw new Error('v519 expected cloud sync checkpoint guard is missing.');
if(!source.includes('void flushDocumentCheckpoint().then(()=>baseCloseEditor())'))throw new Error('v519 close-editor durability flush is missing.');

await writeFile(runtimeTarget,source);

/*
 * The repository intentionally contains historical visual owners. Install one final,
 * narrowly scoped commercial-editor geometry layer after the generated bundle so
 * older grid/flex/max-width rules cannot collapse the quotation editor or the A4
 * preview. This layer is screen-only and does not alter print/PDF geometry.
 */
const cssTarget='dist/styles/app.bundle.css';
const geometrySource='src/styles/critical-editor-geometry-v519.css';
let bundle=await readFile(cssTarget,'utf8');
const geometry=await readFile(geometrySource,'utf8');
if(bundle.includes('LOUREX v519 — critical commercial editor geometry owner.'))throw new Error('v519 critical editor geometry is already installed.');
bundle+=`\n${geometry}\n`;
await writeFile(cssTarget,bundle);

console.log('LOUREX v519 critical editor closeout installed: lightweight active autosave, mobile keyboard activity protection, fixed editor split, and non-shrinkable A4 preview.');

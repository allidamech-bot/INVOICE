import {readFile,writeFile} from 'node:fs/promises';

const runtimeTarget='dist/src/app/index.js';
let source=await readFile(runtimeTarget,'utf8');

/*
 * v350 owns autosave durability at source/build level. v519 is deliberately a
 * final runtime/geometry closeout: it verifies the lightweight checkpoint contract,
 * exposes the real iPad/WebKit capability result to CSS, counts virtual-keyboard
 * edits as activity, then appends the final commercial-editor geometry owner.
 */
if(source.includes('checkpointFlushTimer')||source.includes('scheduleDocumentCheckpointFlush')||source.includes('window.setTimeout(()=>void flushDocumentCheckpoint().catch(()=>undefined),30000)'))throw new Error('v519 found a periodic full-vault document autosave path; v350 hardening did not take effect.');
if(!source.includes('if(checkpointPending||checkpointFlushPromise){instance.cloudSyncQueued=true;return Promise.resolve();}'))throw new Error('v519 expected cloud-sync checkpoint guard is missing.');
if(!source.includes('void flushDocumentCheckpoint().then(()=>baseCloseEditor())'))throw new Error('v519 close-editor durability flush is missing.');

/*
 * Mobile virtual keyboards do not reliably emit window keydown events for every
 * edit. Count input/composition as genuine activity so an actively edited quote
 * cannot be unmounted by the configured inactivity lock.
 *
 * iPadOS can report a desktop-class viewport. The module-level iosWebKit detector
 * already knows the truth; publish that exact result as a root marker so CSS never
 * has to infer device class from viewport width alone.
 */
const activityAnchor='const __lourexDocumentAutosaveV486=true;';
if(!source.includes(activityAnchor))throw new Error('v519 could not find the adaptive document autosave runtime owner.');
const activityRuntime=`${activityAnchor}\n    if(iosWebKit)document.documentElement.setAttribute('data-lourex-ios-webkit','true');\n    else document.documentElement.removeAttribute('data-lourex-ios-webkit');\n    const editorActivityEvents=['input','beforeinput','compositionstart','compositionend'];\n    for(const eventName of editorActivityEvents)window.addEventListener(eventName,instance.activity,{passive:true});\n    const baseComponentWillUnmountForEditorActivity=instance.componentWillUnmount?.bind(instance);\n    instance.componentWillUnmount=()=>{\n      for(const eventName of editorActivityEvents)window.removeEventListener(eventName,instance.activity);\n      baseComponentWillUnmountForEditorActivity?.();\n    };`;
source=source.replace(activityAnchor,activityRuntime);

if(!source.includes("document.documentElement.setAttribute('data-lourex-ios-webkit','true')"))throw new Error('v519 iPad WebKit root marker is missing.');
if(!source.includes("const editorActivityEvents=['input','beforeinput','compositionstart','compositionend'];"))throw new Error('v519 mobile editor activity coverage is missing.');
await writeFile(runtimeTarget,source);

/*
 * The repository intentionally contains historical visual owners. Install one final,
 * narrowly scoped commercial-editor geometry layer after every generated visual and
 * AI bundle so no later rule can collapse the quotation form or A4 preview.
 */
const cssTarget='dist/styles/app.bundle.css';
const geometrySource='src/styles/critical-editor-geometry-v519.css';
let bundle=await readFile(cssTarget,'utf8');
const geometry=await readFile(geometrySource,'utf8');
if(bundle.includes('LOUREX v519 — critical commercial editor geometry owner.'))throw new Error('v519 critical editor geometry is already installed.');
bundle+=`\n${geometry}\n`;
await writeFile(cssTarget,bundle);

console.log('LOUREX v519 critical editor closeout installed: lightweight autosave verified, mobile keyboard activity protected, iPad WebKit geometry marked, desktop split fixed, A4 preview non-shrinkable.');

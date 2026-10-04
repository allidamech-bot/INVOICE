import {readFile,writeFile} from 'node:fs/promises';

const runtimeTarget='dist/src/app/index.js';
const editorTarget='dist/src/components/EditorPageCore.js';
let source=await readFile(runtimeTarget,'utf8');

/*
 * v350 owns autosave durability at source/build level. v519 is deliberately a
 * final runtime/geometry closeout: it verifies the lightweight checkpoint contract,
 * counts virtual-keyboard edits as activity, gives the document editor an explicit
 * iPad/WebKit geometry marker, then appends the final commercial-editor owner.
 */
if(source.includes('checkpointFlushTimer')||source.includes('scheduleDocumentCheckpointFlush')||source.includes('window.setTimeout(()=>void flushDocumentCheckpoint().catch(()=>undefined),30000)'))throw new Error('v519 found a periodic full-vault document autosave path; v350 hardening did not take effect.');
if(!source.includes('if(checkpointPending||checkpointFlushPromise){instance.cloudSyncQueued=true;return Promise.resolve();}'))throw new Error('v519 expected cloud-sync checkpoint guard is missing.');
if(!source.includes('void flushDocumentCheckpoint().then(()=>baseCloseEditor())'))throw new Error('v519 close-editor durability flush is missing.');

/* Mobile virtual keyboards do not reliably emit window keydown for every edit.
 * Count input/composition as genuine activity so an actively edited quotation
 * cannot be unmounted by the configured inactivity lock. */
const activityAnchor='const __lourexDocumentAutosaveV486=true;';
if(!source.includes(activityAnchor))throw new Error('v519 could not find the adaptive document autosave runtime owner.');
const activityRuntime=`${activityAnchor}\n    const editorActivityEvents=['input','beforeinput','compositionstart','compositionend'];\n    for(const eventName of editorActivityEvents)window.addEventListener(eventName,instance.activity,{passive:true});\n    const baseComponentWillUnmountForEditorActivity=instance.componentWillUnmount?.bind(instance);\n    instance.componentWillUnmount=()=>{\n      for(const eventName of editorActivityEvents)window.removeEventListener(eventName,instance.activity);\n      baseComponentWillUnmountForEditorActivity?.();\n    };`;
source=source.replace(activityAnchor,activityRuntime);
if(!source.includes("const editorActivityEvents=['input','beforeinput','compositionstart','compositionend'];"))throw new Error('v519 mobile editor activity coverage is missing.');
await writeFile(runtimeTarget,source);

/*
 * EditorPageCore is the actual owner loaded both by the full application and by
 * commercial-editor WebKit QA fixtures. Publish the same iPadOS capability test
 * there so CSS gets the marker regardless of which application shell mounted it.
 */
let editor=await readFile(editorTarget,'utf8');
if(editor.includes('__lourexCriticalEditorGeometryMarkerV519'))throw new Error('v519 iPad editor geometry marker is already installed.');
editor+=`\n;(()=>{\n  const __lourexCriticalEditorGeometryMarkerV519=true;\n  try{\n    const ua=String(navigator.userAgent||'');\n    const platform=String(navigator.platform||'');\n    const touchPoints=Number(navigator.maxTouchPoints||0);\n    const appleMobile=/iP(?:hone|ad|od)/i.test(ua)||(platform==='MacIntel'&&touchPoints>1);\n    if(appleMobile)document.documentElement.setAttribute('data-lourex-ios-webkit','true');\n    else document.documentElement.removeAttribute('data-lourex-ios-webkit');\n  }catch{}\n})();\n`;
if(!editor.includes("document.documentElement.setAttribute('data-lourex-ios-webkit','true')"))throw new Error('v519 iPad WebKit editor marker is missing.');
await writeFile(editorTarget,editor);

/* Final geometry owner after every historical visual and AI build layer. */
const cssTarget='dist/styles/app.bundle.css';
const geometrySource='src/styles/critical-editor-geometry-v519.css';
let bundle=await readFile(cssTarget,'utf8');
const geometry=await readFile(geometrySource,'utf8');
if(bundle.includes('LOUREX v519 — critical commercial editor geometry owner.'))throw new Error('v519 critical editor geometry is already installed.');
bundle+=`\n${geometry}\n`;
await writeFile(cssTarget,bundle);

console.log('LOUREX v519 critical editor closeout installed: lightweight autosave verified, mobile keyboard activity protected, EditorPageCore marks iPad WebKit, desktop split fixed, A4 preview non-shrinkable.');

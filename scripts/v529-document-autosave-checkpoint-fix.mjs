import {readFile,writeFile} from 'node:fs/promises';

const target='dist/src/app/index.js';
let source=await readFile(target,'utf8');

/*
 * v529 closeout: BaseApp.requireVault() returns scopeVault(this.state.vault), and
 * scopeVault() intentionally creates fresh appSettings/company objects. The v350
 * automatic-draft checkpoint gate compared appSettings by reference across two
 * separate requireVault() calls, so the equality could not hold and every autosave
 * fell back to fullPersist/full-vault encryption.
 *
 * autosaveDocumentId is only set by the v350 saveDocument wrapper while handling
 * auto=true for an active draft. That wrapper is the authoritative eligibility
 * boundary; object identity from a freshly scoped Vault must not be a second gate.
 */
const impossibleIdentityGate="const checkpointEligible=Boolean(documentId&&intendedDocument&&intendedDocument.status==='draft'&&intendedDocument.lifecycleStatus!=='voided'&&intended.documents!==base.documents&&intended.appSettings===base.appSettings);";
const scopedAutosaveGate="const checkpointEligible=Boolean(documentId&&intendedDocument&&intendedDocument.status==='draft'&&intendedDocument.lifecycleStatus!=='voided'&&intended.documents!==base.documents);";
const matches=source.split(impossibleIdentityGate).length-1;
if(matches!==1)throw new Error(`v529 expected exactly one impossible scoped autosave identity gate; found ${matches}.`);
source=source.replace(impossibleIdentityGate,scopedAutosaveGate);
if(source.includes(impossibleIdentityGate))throw new Error('v529 appSettings reference-identity autosave gate is still present.');
if(!source.includes(scopedAutosaveGate))throw new Error('v529 scoped automatic-draft checkpoint gate is missing.');

await writeFile(target,source);

/*
 * v538 closeout: iOS/WebKit emits visibilitychange(hidden) and pagehide back-to-back.
 * EditorPageCore used to start save(true) for visibilitychange and then call the
 * raw onSave callback again from pagehide before React committed saving=true. That
 * produced two writes for the same document revision in the same event turn.
 *
 * Keep one departure owner. Both lifecycle events enter flushPendingSnapshot(),
 * which reserves departureFlushQueued synchronously before the first async save.
 * If a save is already running, do not start or schedule a competing write; its
 * completion immediately drains a newer revision while departure is pending.
 */
const editorTarget='dist/src/components/EditorPageCore.js';
let editor=await readFile(editorTarget,'utf8');

const visibilityStart=editor.indexOf('handleVisibilityChange =');
const visibilityEnd=visibilityStart<0?-1:editor.indexOf('handleBeforeUnload =',visibilityStart);
if(visibilityStart<0||visibilityEnd<=visibilityStart)throw new Error('v538 could not isolate EditorPageCore.handleVisibilityChange.');
let visibility=editor.slice(visibilityStart,visibilityEnd);
const directVisibilitySave=/if\s*\(this\.autosaveTimer\)\s*clearTimeout\(this\.autosaveTimer\);\s*void this\.save\(true\);/;
if(!directVisibilitySave.test(visibility))throw new Error('v538 expected the direct hidden-state save path.');
visibility=visibility.replace(directVisibilitySave,'this.flushPendingSnapshot();');
editor=editor.slice(0,visibilityStart)+visibility+editor.slice(visibilityEnd);

const flushStart=editor.indexOf('flushPendingSnapshot =');
const flushEnd=flushStart<0?-1:editor.indexOf('setGlobalError =',flushStart);
if(flushStart<0||flushEnd<=flushStart)throw new Error('v538 could not isolate EditorPageCore.flushPendingSnapshot.');
let flush=editor.slice(flushStart,flushEnd);
const rawDepartureWrite=/const snapshot\s*=\s*this\.state\.doc;\s*void this\.props\.onSave\(snapshot,\s*true\)\.catch\(\(\)\s*=>\s*\{\s*this\.departureFlushQueued\s*=\s*false;\s*\}\);/;
if(!rawDepartureWrite.test(flush))throw new Error('v538 expected the raw pagehide persistence path.');
flush=flush.replace(rawDepartureWrite,'void this.save(true);');
editor=editor.slice(0,flushStart)+flush+editor.slice(flushEnd);

const saveStart=editor.indexOf('save = async');
const saveEnd=saveStart<0?-1:editor.indexOf('saveAndClose =',saveStart);
if(saveStart<0||saveEnd<=saveStart)throw new Error('v538 could not isolate EditorPageCore.save.');
let save=editor.slice(saveStart,saveEnd);
const busyAutosave=/if\s*\(this\.state\.saving\)\s*\{\s*if\s*\(auto\)\s*this\.schedule\(\);\s*return;\s*\}/;
if(!busyAutosave.test(save))throw new Error('v538 expected the autosave re-entry scheduling path.');
save=save.replace(busyAutosave,'if (this.state.saving) {\n            if (auto && !this.departureFlushQueued)\n                this.schedule();\n            return;\n        }');
const hiddenDrain=/if\s*\(document\.visibilityState\s*===\s*['"]hidden['"]\)\s*void this\.save\(true\);\s*else\s*this\.schedule\(\);/;
if(!hiddenDrain.test(save))throw new Error('v538 expected the hidden-state newer-revision drain.');
save=save.replace(hiddenDrain,"if (this.departureFlushQueued || document.visibilityState === 'hidden')\n                    void this.save(true);\n                else\n                    this.schedule();");
const saveCatch=/catch\s*\(e\)\s*\{\s*this\.setState\(\{\s*saving:\s*false,\s*saveState:\s*['"]unsaved['"]/;
if(!saveCatch.test(save))throw new Error('v538 expected the editor save failure path.');
save=save.replace(saveCatch,"catch (e) {\n            this.departureFlushQueued = false;\n            this.setState({ saving: false, saveState: 'unsaved'");
editor=editor.slice(0,saveStart)+save+editor.slice(saveEnd);

if(!visibility.includes('this.flushPendingSnapshot();'))throw new Error('v538 hidden-state lifecycle is not routed through the departure owner.');
if(!flush.includes('void this.save(true);'))throw new Error('v538 pagehide lifecycle is not routed through EditorPageCore.save.');
if(!save.includes('auto && !this.departureFlushQueued'))throw new Error('v538 in-flight departure save guard is missing.');
if(!save.includes("this.departureFlushQueued || document.visibilityState === 'hidden'"))throw new Error('v538 departure newer-revision drain is missing.');
await writeFile(editorTarget,editor);

console.log('LOUREX v529/v538 document autosave closeout installed: scoped draft checkpoints plus single-flight WebKit departure persistence.');

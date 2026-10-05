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
console.log('LOUREX v529 document autosave closeout installed: scoped draft autosaves reach the encrypted per-document checkpoint instead of full-vault persistence.');

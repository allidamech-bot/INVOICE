import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const target='dist/src/components/EditorPageCore.js';
let source=await readFile(target,'utf8');

if(source.includes('__lourexEditorDepartureSingleOwnerV539'))throw new Error('v539 editor departure single owner is already installed.');

function replaceSection(startPattern,endPattern,replacement,label){
  const startMatch=startPattern.exec(source);
  if(!startMatch)throw new Error(`v539 could not find ${label} start.`);
  const start=startMatch.index;
  const tail=source.slice(start+startMatch[0].length);
  const endMatch=endPattern.exec(tail);
  if(!endMatch)throw new Error(`v539 could not find ${label} end.`);
  const end=start+startMatch[0].length+endMatch.index;
  source=source.slice(0,start)+replacement+source.slice(end);
}

const fieldPattern=/^\s*departureFlushQueued\s*=\s*false;\s*$/gm;
const fieldMatches=source.match(fieldPattern)?.length??0;
if(fieldMatches!==1)throw new Error(`v539 expected one departureFlushQueued class field; found ${fieldMatches}.`);
source=source.replace(fieldPattern,match=>`${match}\n    saveInFlight = false;`);

replaceSection(
  /\s*handleVisibilityChange\s*=\s*\(\)\s*=>\s*\{/,
  /\s*handleBeforeUnload\s*=\s*\(event\)\s*=>\s*\{/,
  `\n    handleVisibilityChange = () => {\n        if (document.visibilityState !== 'hidden' || this.state.doc.status === 'final' || this.state.saveState === 'saved')\n            return;\n        this.flushPendingSnapshot();\n    };\n`,
  'visibility departure owner'
);

replaceSection(
  /\s*flushPendingSnapshot\s*=\s*\(\)\s*=>\s*\{/,
  /\s*setGlobalError\s*=\s*\(message\)\s*=>/,
  `\n    flushPendingSnapshot = () => {\n        if (this.departureFlushQueued || this.state.doc.status === 'final' || this.state.saveState === 'saved' && !this.state.saving && !this.saveInFlight)\n            return;\n        this.departureFlushQueued = true;\n        if (this.autosaveTimer)\n            clearTimeout(this.autosaveTimer);\n        void this.save(true);\n    };\n`,
  'departure flush owner'
);

replaceSection(
  /\s*save\s*=\s*async\s*\(auto\s*=\s*false\)\s*=>\s*\{/,
  /\s*saveAndClose\s*=\s*async\s*\(\)\s*=>\s*\{/,
  `\n    save = async (auto = false) => {\n        if (this.state.doc.status === 'final' || this.issuancePending)\n            return;\n        if (this.saveInFlight) {\n            if (auto && !this.departureFlushQueued)\n                this.schedule();\n            return;\n        }\n        const revisionAtStart = this.editRevision;\n        const snapshot = this.state.doc;\n        if (!auto) {\n            const errors = validateDocument(snapshot);\n            this.validationAttempted = true;\n            if (Object.keys(errors).length) {\n                this.setState({ errors, saveState: 'unsaved' }, this.scrollToFirstError);\n                return;\n            }\n        }\n        this.saveInFlight = true;\n        this.setState({ saving: true, saveState: 'saving', errors: auto ? this.state.errors : {} });\n        try {\n            await this.props.onSave(snapshot, auto);\n            const hasNewerChanges = this.editRevision !== revisionAtStart;\n            this.saveInFlight = false;\n            if (hasNewerChanges && this.departureFlushQueued) {\n                this.departureFlushQueued = false;\n                this.setState({ saving: false, saveState: 'unsaved' });\n                void this.save(true);\n                return;\n            }\n            this.setState({ saving: false, saveState: hasNewerChanges ? 'unsaved' : 'saved' }, () => {\n                if (!hasNewerChanges)\n                    return;\n                if (document.visibilityState === 'hidden') {\n                    this.departureFlushQueued = false;\n                    this.flushPendingSnapshot();\n                }\n                else\n                    this.schedule();\n            });\n        }\n        catch (e) {\n            this.saveInFlight = false;\n            this.departureFlushQueued = false;\n            this.setState({ saving: false, saveState: 'unsaved', errors: { ...this.state.errors, global: e instanceof Error ? e.message : t('Save failed.', 'فشل الحفظ.') } });\n        }\n    };\n`,
  'serialized save owner'
);

replaceSection(
  /\s*saveAndClose\s*=\s*async\s*\(\)\s*=>\s*\{/,
  /\s*openReview\s*=\s*\(mode\)\s*=>/,
  `\n    saveAndClose = async () => {\n        if (this.issuancePending || this.revisionPending)\n            return;\n        if (this.autosaveTimer)\n            clearTimeout(this.autosaveTimer);\n        if (this.state.doc.status === 'final' || this.state.saveState === 'saved') {\n            this.props.onClose();\n            return;\n        }\n        if (this.saveInFlight || this.state.saving) {\n            window.setTimeout(() => void this.saveAndClose(), 100);\n            return;\n        }\n        this.saveInFlight = true;\n        this.departureFlushQueued = true;\n        this.setState({ saving: true, saveState: 'saving' });\n        try {\n            for (;;) {\n                const revisionAtStart = this.editRevision;\n                const snapshot = this.state.doc;\n                await this.props.onSave(snapshot, true);\n                if (this.editRevision !== revisionAtStart)\n                    continue;\n                this.saveInFlight = false;\n                this.props.onClose();\n                return;\n            }\n        }\n        catch (e) {\n            this.saveInFlight = false;\n            this.departureFlushQueued = false;\n            this.setState({ saving: false, saveState: 'unsaved', errors: { ...this.state.errors, global: e instanceof Error ? e.message : t('Save failed.', 'فشل الحفظ.') } });\n        }\n    };\n`,
  'save-and-close owner'
);

source+=`\nconst __lourexEditorDepartureSingleOwnerV539=true;\n`;

for(const required of [
  'saveInFlight = false;',
  'this.flushPendingSnapshot();',
  'void this.save(true);',
  'if (this.saveInFlight)',
  'hasNewerChanges && this.departureFlushQueued',
  'this.saveInFlight || this.state.saving',
  '__lourexEditorDepartureSingleOwnerV539=true'
])if(!source.includes(required))throw new Error(`v539 missing emitted owner token: ${required}`);

const flushStart=source.indexOf('flushPendingSnapshot = () =>');
const flushEnd=source.indexOf('setGlobalError =',flushStart);
const flushSource=flushStart>=0&&flushEnd>flushStart?source.slice(flushStart,flushEnd):'';
if(!flushSource||flushSource.includes('this.props.onSave('))throw new Error('v539 departure flush must not bypass the serialized save owner.');

await writeFile(target,source);
execFileSync(process.execPath,['--check',target],{stdio:'pipe'});

/*
 * The quote issue/PDF review dialog is rendered from inside EditorPageCore. On
 * narrow screens the fixed mobile editor action dock is a sibling stacking layer;
 * even though the modal backdrop owns the modal z-index, the nested dialog can be
 * trapped by the editor stacking context and the dock intercepts the confirmation
 * button. Modal already has an explicit portal escape hatch. Enable it only for
 * DocumentReviewModal so the review dialog is mounted at .app-ui and remains the
 * top interactive surface without changing global modal behavior.
 */
const reviewTarget='dist/src/components/DocumentReviewModal.js';
let review=await readFile(reviewTarget,'utf8');
if(review.includes('__lourexDocumentReviewPortalV539'))throw new Error('v539 document review portal is already installed.');
const reviewModalPattern=/React\.createElement\(Modal,\s*\{\s*open:\s*true,/g;
const reviewModalMatches=review.match(reviewModalPattern)?.length??0;
if(reviewModalMatches!==1)throw new Error(`v539 expected one DocumentReviewModal root modal; found ${reviewModalMatches}.`);
review=review.replace(reviewModalPattern,match=>match.replace(/open:\s*true,/, 'open: true, portal: true,'));
review+=`\nconst __lourexDocumentReviewPortalV539=true;\n`;
if(!/React\.createElement\(Modal,\s*\{\s*open:\s*true,\s*portal:\s*true,/.test(review))throw new Error('v539 document review portal was not emitted.');
await writeFile(reviewTarget,review);
execFileSync(process.execPath,['--check',reviewTarget],{stdio:'pipe'});

console.log('LOUREX v539 quote editor closeout installed: single-owner departure persistence and a portaled document-review dialog above the mobile action dock.');

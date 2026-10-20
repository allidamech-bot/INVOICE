import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');

test('v329 Document Studio recovery stays visual-only',async()=>{
const [shell,paper]=await Promise.all([read('src/styles/tailadmin-shell-contract-v326.css'),read('src/styles/document-premium-redesign-v141.css')]);
 assert.doesNotMatch(shell,/\/\* v329 — printable template hierarchy recovery\./);
 assert.match(paper,/Canonical commercial A4 design/);
 assert.match(paper,/\.document-masthead\{/);
 assert.match(paper,/\.items-table th\{/);
 assert.doesNotMatch(shell,/localStorage|indexedDB|saveVault|calculateTotals/i);
});

test('v329 printable recovery cannot change document geometry or pagination',async()=>{
const [shell,paper]=await Promise.all([read('src/styles/tailadmin-shell-contract-v326.css'),read('src/styles/document-premium-redesign-v141.css')]);
 assert.doesNotMatch(shell,/printable template hierarchy recovery/);
 assert.match(paper,/@page\{size:A4;margin:0\}/);
 assert.match(paper,/\.invoice-page\{[^}]*width:210mm;height:297mm/);
 assert.match(paper,/\.items-table tr\{break-inside:avoid/);
 assert.match(paper,/\.final-details\{[^}]*margin-top:auto/);
});

test('v329 recovery remains downstream of canonical document/editor owners',async()=>{
const [html,shell,paper]=await Promise.all([read('index.html'),read('src/styles/tailadmin-shell-contract-v326.css'),read('src/styles/document-premium-redesign-v141.css')]);
 const printable=html.indexOf('./styles/document-premium-redesign-v141.css');
 const editor=html.indexOf('./styles/tailadmin-editor-core-v320.css');
 const shellAt=html.indexOf('./styles/tailadmin-shell-contract-v326.css');
 assert.ok(printable>=0&&editor>=0&&shellAt>printable&&shellAt>editor);
 assert.doesNotMatch(shell,/printable template hierarchy recovery/);
 assert.match(paper,/\.doc-body\{/);
});

test('v329 delta is limited to presentation and its guard test',async()=>{
const [shell,paper]=await Promise.all([read('src/styles/tailadmin-shell-contract-v326.css'),read('src/styles/document-premium-redesign-v141.css')]);
 assert.doesNotMatch(shell,/printable template hierarchy recovery/);
 assert.match(paper,/\.doc-title>span\{/);
 assert.match(paper,/\.grand-total\{/);
 assert.doesNotMatch(shell,/saveVault|calculateTotals|indexedDB|firebase/i);
});

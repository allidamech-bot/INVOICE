import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const target='dist/src/templates/TemplateRenderer.js';
let source=await readFile(target,'utf8');

if(source.includes('__lourexPdfA4EmergencyV544'))throw new Error('PDF A4 emergency owner is already installed.');

const emptyPageGuard=/if\s*\(\s*!items\.length\s*\|\|\s*this\.moves\+\+\s*>\s*this\.props\.document\.items\.length\s*\*\s*20\s*\+\s*40\s*\)\s*return;/;
if(!emptyPageGuard.test(source))throw new Error('PDF A4 emergency owner could not find the pagination move guard.');
source=source.replace(emptyPageGuard,"if(!items.length)continue;if(this.moves++>this.props.document.items.length*20+40){if(!this.state.ready)this.setState({ready:true});return;}");

const oneRowDeadlock=/if\s*\(\s*!items\.length\s*&&\s*i\s*<\s*pages\.length\s*-\s*1\s*\)\s*\{\s*items\.push\(moved\);\s*return;\s*\}/;
if(!oneRowDeadlock.test(source))throw new Error('PDF A4 emergency owner could not find the one-row pagination deadlock.');
source=source.replace(oneRowDeadlock,'if(!items.length&&i<pages.length-1){items.push(moved);continue;}');

const stableReady=/if\s*\(\s*!this\.state\.ready\s*\)\s*this\.setState\(\{\s*ready:\s*true\s*\}\);/;
if(!stableReady.test(source))throw new Error('PDF A4 emergency owner could not find the pagination-ready transition.');
source=source.replace(stableReady,'if(!this.state.ready){this.moves=0;this.setState({ready:true});}');

source+='\nconst __lourexPdfA4EmergencyV544=true;\n';
await writeFile(target,source);
execFileSync(process.execPath,['--check',target],{stdio:'pipe'});
console.log('[LOUREX v544] A4 pagination recovery installed: one-row deadlock removed and stable passes reset move pressure.');

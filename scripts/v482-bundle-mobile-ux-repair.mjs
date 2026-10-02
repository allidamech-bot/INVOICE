import { readFile, writeFile } from 'node:fs/promises';

const bundlePath='dist/styles/app.bundle.css';
const v481Marker='/* --- premium-regression-fixes-v481.css --- */';
const ownerName='v482-mobile-ux-repair.css';
const marker=`/* --- ${ownerName} --- */`;

let bundle=await readFile(bundlePath,'utf8');
if(!bundle.includes(v481Marker))throw new Error('v482 production bundle: v481 final owner marker is missing.');
if(bundle.includes(marker))throw new Error('v482 production bundle: duplicate mobile UX repair owner detected.');
const css=(await readFile(`src/styles/${ownerName}`,'utf8')).trim();
if(!css)throw new Error('v482 production bundle: mobile UX repair owner is empty.');

bundle=`${bundle.trimEnd()}\n\n${marker}\n${css}\n`;
if(bundle.indexOf(marker)<=bundle.indexOf(v481Marker))throw new Error('v482 production bundle: repair owner must follow v481.');
if(!bundle.includes('.ta-documents-header-actions'))throw new Error('v482 production bundle: compact Documents command grid is missing.');
if(!bundle.includes('#lourex-ai-panel.lourex-ai-panel'))throw new Error('v482 production bundle: AI mobile safe-area repair is missing.');
if(!bundle.includes('#lourex-ai-panel .lourex-ai-head'))throw new Error('v482 production bundle: AI header overlap repair is missing.');
if(!bundle.includes('.global-search-actions'))throw new Error('v482 production bundle: Global Search quick-create repair is missing.');
if(!bundle.includes('.ta-create-menu-grid'))throw new Error('v482 production bundle: Quick Create geometry repair is missing.');
if(!bundle.includes('.ta-business-health-card'))throw new Error('v482 production bundle: dashboard surface repair is missing.');
if(!bundle.includes('html[data-ui-theme="light"]'))throw new Error('v482 production bundle: Light mode repair ownership is missing.');

await writeFile(bundlePath,bundle);
console.log('LOUREX v482 mobile UX repair bundled as the final presentation owner.');

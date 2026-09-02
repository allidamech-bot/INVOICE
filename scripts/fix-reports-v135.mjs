import { readFileSync, writeFileSync } from 'node:fs';

function patch(path,from,to){const source=readFileSync(path,'utf8');if(!source.includes(from))throw new Error(`Missing patch target in ${path}`);writeFileSync(path,source.replace(from,to));}

patch('src/components/ReportsPage.tsx','<Icon name="info"/>','<Icon name="invoice"/>');

const cssPath='src/styles/reports-v135.css';
let css=readFileSync(cssPath,'utf8');
const mobile='@media(max-width:640px){';
if(!css.includes(mobile))throw new Error('Missing mobile reports media query');
const navOverride='@media(max-width:720px){.app-ui .main-nav{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:2px!important}.app-ui .main-nav button{padding-inline:3px!important;gap:3px!important;font-size:10px!important}.app-ui .main-nav button .icon{width:14px!important;height:14px!important}}\n';
css=navOverride+css;
writeFileSync(cssPath,css);

const testPath='tests/reports-v135.test.mjs';
let test=readFileSync(testPath,'utf8');
const assertion="assert.ok(css.includes('printing-financial-report'));assert.ok(css.includes('@media print'));";
if(!test.includes(assertion))throw new Error('Missing reports CSS assertion');
test=test.replace(assertion,assertion+"assert.ok(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'),'five report-era mobile tabs remain visible');");
writeFileSync(testPath,test);

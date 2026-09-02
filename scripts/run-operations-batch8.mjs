import { readFile, writeFile } from 'node:fs/promises';

const path='scripts/apply-operations-batch8.mjs';
let source=await readFile(path,'utf8');
const from="  [`const CACHE = 'lourex-invoice-v136';`, `const CACHE = 'lourex-invoice-v137';`],";
const to="  [`\\nconst CACHE = 'lourex-invoice-v136';\\n`, `\\nconst CACHE = 'lourex-invoice-v137';\\n`],";
if(!source.includes(from))throw new Error('Expected service-worker cache patch was not found.');
source=source.replace(from,to);
await writeFile(path,source);

const operationsPage='src/components/OperationsPage.tsx';
let page=await readFile(operationsPage,'utf8');
const validationToken='error:errors[0]';
const matches=page.split(validationToken).length-1;
if(matches!==4)throw new Error(`Expected four strict validation fallbacks, found ${matches}.`);
page=page.split(validationToken).join("error:errors[0]??t('Validation failed.','فشل التحقق.')");
await writeFile(operationsPage,page);

const commercialTest='tests/commercial-controls-v136.test.mjs';
let commercial=await readFile(commercialTest,'utf8');
const commercialChanges=[
  ["import { defaultCompany, emptyVault } from '../dist/src/lib/defaults.js';","import { APP_SCHEMA_VERSION, defaultCompany, emptyVault } from '../dist/src/lib/defaults.js';"],
  ["assert.equal(migrated.schemaVersion,10);assert.equal(migrated.company.defaultBankAccountId,'primary');","assert.equal(migrated.schemaVersion,APP_SCHEMA_VERSION);assert.ok(APP_SCHEMA_VERSION>=10);assert.equal(migrated.company.defaultBankAccountId,'primary');"],
  ["assert.ok(defaults.includes('APP_SCHEMA_VERSION = 10'));assert.ok(settings.includes(\"'commercial'\"));","assert.ok(defaults.includes(`APP_SCHEMA_VERSION = ${APP_SCHEMA_VERSION}`));assert.ok(APP_SCHEMA_VERSION>=10);assert.ok(settings.includes(\"'commercial'\"));"],
  ["assert.ok(/^const CACHE = 'lourex-invoice-v136';/m.test(sw));assert.ok(sw.includes(\"const CACHE = 'lourex-invoice-v135'\"));","const activeCacheVersion=Number(sw.match(/^const CACHE = 'lourex-invoice-v(\\d+)';/m)?.[1]??0);assert.ok(activeCacheVersion>=136);assert.ok(sw.includes(\"const CACHE = 'lourex-invoice-v135'\"));"]
];
for(const [oldValue,newValue] of commercialChanges){if(!commercial.includes(oldValue))throw new Error(`Missing commercial regression token: ${oldValue.slice(0,80)}`);commercial=commercial.replace(oldValue,newValue);}
await writeFile(commercialTest,commercial);

const receivablesTest='tests/receivables-v133.test.mjs';
let receivables=await readFile(receivablesTest,'utf8');
const oldReceivables="assert.ok(app.includes(\"screen:'documents'|'customers'|'receivables'|'reports'|'items'|'editor'\"));";
const newReceivables="assert.ok(app.includes(\"|'receivables'|\"),'receivables screen remains in the application state');";
if(!receivables.includes(oldReceivables))throw new Error('Missing receivables screen regression token.');
receivables=receivables.replace(oldReceivables,newReceivables);
await writeFile(receivablesTest,receivables);

const reportsTest='tests/reports-v135.test.mjs';
let reports=await readFile(reportsTest,'utf8');
const oldReports="assert.ok(app.includes(\"|'reports'|'items'|'editor'\"));";
const newReports="assert.ok(app.includes(\"|'reports'|\"),'reports screen remains in the application state');";
if(!reports.includes(oldReports))throw new Error('Missing reports screen regression token.');
reports=reports.replace(oldReports,newReports);
await writeFile(reportsTest,reports);

await import('./apply-operations-batch8.mjs?fixed=3');

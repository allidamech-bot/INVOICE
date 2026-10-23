import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=await readFile('src/app/App.tsx','utf8');
const parsed=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const cls=parsed.statements.find(ts.isClassDeclaration);
const names=['backup','restore','normalizedVault','persist','requireVault','waitForProtectedDataOperation','drainVaultWrites'];
const members=cls.members.filter(n=>names.includes(n.name?.getText(parsed)));
assert.equal(members.length,names.length);
await mkdir('dist/qa',{recursive:true});
const imports=`
import {readPlainBackup,exportPlainBackup,assertPostedStockRestoreContinuity} from '../src/lib/backup.js';
import {synchronizeActiveWorkspaceOnSave} from '../src/storage/vault.js';
import {assertPlainCloudWorkspaceUploadable} from '../src/cloud/plain-workspace.js';
import * as db from '../src/storage/db.js';
import {scopeVault,applyWorkspaceScope,overlayWorkspaceScope} from '../src/lib/workspaces.js';
import {mergeVaultIntent} from '../src/storage/vault-merge.js';
import {appendAuditEventsForVaultDiff} from '../src/lib/audit-diff.js';
const t=en=>en;
let user={uid:'qa-restore-a'},beforeCas=null;
const currentCloudUser=()=>user;
const {activeAccountStorageUid,getPlainWorkspace,updatePlainWorkspaceIfUnchanged}=db;
const getPeriodReportArchive=async()=>undefined; // Cloud/report boundary only.
const replacePlainWorkspaceIfUnchanged=async(...args)=>{if(beforeCas){const hook=beforeCas;beforeCas=null;await hook();}return db.replacePlainWorkspaceIfUnchanged(...args);};
export function configure(uid,hook=null){user={uid};beforeCas=hook;}
`;
const code=ts.transpileModule('export class RestoreHarness{'+members.map(n=>n.getText(parsed)).join('\n')+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
await writeFile('dist/qa/restore-harness.js',imports+code);
console.log('Generated actual App backup/restore/persist and supporting members; IndexedDB/CAS imports remain real.');

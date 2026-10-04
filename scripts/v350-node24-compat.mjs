import { readFile, writeFile } from 'node:fs/promises';

const runtimeTarget = 'dist/src/app/index.js';
let source = await readFile(runtimeTarget, 'utf8');

const ownerStart = source.indexOf('class AdaptiveCloudApp extends BaseApp {');
const ownerEnd = source.indexOf('const App = AdaptiveCloudApp;', ownerStart);
if (ownerStart < 0 || ownerEnd <= ownerStart) {
  throw new Error('v350 Node 24 compatibility could not isolate AdaptiveCloudApp.');
}

const owner = source.slice(ownerStart, ownerEnd);
const closeoutPattern = /return\s+true;\s*\}\)\(\);/g;
const matches = [...owner.matchAll(closeoutPattern)];
if (matches.length !== 1) {
  throw new Error(`v350 Node 24 compatibility expected one adaptive runtime closeout; found ${matches.length}.`);
}

const match = matches[0];
const absoluteStart = ownerStart + match.index;
const absoluteEnd = absoluteStart + match[0].length;
const canonicalCloseout = '        return true;\n    })();';
source = source.slice(0, absoluteStart) + canonicalCloseout + source.slice(absoluteEnd);
await writeFile(runtimeTarget, source);

await import('./v350-rendering-storage-hardening.mjs');

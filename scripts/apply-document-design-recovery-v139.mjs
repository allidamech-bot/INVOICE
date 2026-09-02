import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`Ambiguous ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

const designLayers = [
  'document-art-direction-v120.css',
  'document-palette-v121.css',
  'mobile-document-actions-v122.css',
  'mobile-document-actions-v123.css',
  'mobile-document-actions-v124.css',
  'mobile-document-actions-v125.css',
  'document-dark-contrast-v126.css',
  'document-flagship-v128.css',
  'document-template-system-v129.css',
  'document-final-qa-v130.css'
];

const buildPath = 'scripts/build.mjs';
let build = await readFile(buildPath, 'utf8');
const oldDiscovery = `const localStylePattern=/<link rel=\"stylesheet\" href=\"\\.\\/styles\\/([^\\\"]+\\.css)\" \\/>/g;\nconst styleNames=[...html.matchAll(localStylePattern)].map(match=>match[1]);\nif(!styleNames.length) throw new Error('No local stylesheet layers found in index.html.');`;
const newDiscovery = `const localStylePattern=/<link rel=\"stylesheet\" href=\"\\.\\/styles\\/([^\\\"]+\\.css)\" \\/>/g;\nconst localImportPattern=/@import url\\(\"\\.\\/styles\\/([^\\\"]+\\.css)\"\\);/g;\nconst styleReferencePattern=/(?:<link rel=\"stylesheet\" href=\"\\.\\/styles\\/([^\\\"]+\\.css)\" \\/>|@import url\\(\"\\.\\/styles\\/([^\\\"]+\\.css)\"\\);)/g;\nconst styleNames=[...html.matchAll(styleReferencePattern)].map(match=>match[1]||match[2]);\nif(!styleNames.length) throw new Error('No local stylesheet layers found in index.html.');\nif(new Set(styleNames).size!==styleNames.length) throw new Error('Duplicate local stylesheet layer detected in index.html.');\nif(styleNames.at(-1)!=='document-final-qa-v130.css') throw new Error('Final document QA layer must remain the last local stylesheet in the production cascade.');`;
build = replaceOnce(build, oldDiscovery, newDiscovery, 'stylesheet discovery block');
const oldHtmlRewrite = `html=html.replace(localStylePattern,()=>{\n  if(bundleInserted) return '';\n  bundleInserted=true;\n  return '<link rel=\"stylesheet\" href=\"./styles/app.bundle.css\" />';\n});\nawait writeFile('dist/index.html',html);`;
const newHtmlRewrite = `html=html.replace(localStylePattern,()=>{\n  if(bundleInserted) return '';\n  bundleInserted=true;\n  return '<link rel=\"stylesheet\" href=\"./styles/app.bundle.css\" />';\n});\nhtml=html.replace(/<style>\\s*(?:@import url\\(\"\\.\\/styles\\/[^\\\"]+\\.css\"\\);)+\\s*<\\/style>/g,'');\nif([...html.matchAll(localImportPattern)].length) throw new Error('Production HTML still contains local stylesheet @import references.');\nawait writeFile('dist/index.html',html);`;
build = replaceOnce(build, oldHtmlRewrite, newHtmlRewrite, 'production html rewrite block');
await writeFile(buildPath, build);

const swPath = 'public/sw.js';
let sw = await readFile(swPath, 'utf8');
sw = sw.replace(/^\/\/ v138 .*$/m, '// v139 — restore the final quotation/invoice design cascade inside the production CSS bundle and offline PWA cache.\n// v138 compatibility retained for post-batch accounting hardening: const CACHE = \'lourex-invoice-v138\';');
sw = sw.replace('Legacy regression markers only; active runtime cache is v138:', 'Legacy regression markers only; active runtime cache is v139:');
sw = sw.replace(/^const CACHE = 'lourex-invoice-v138';$/m, "const CACHE = 'lourex-invoice-v139';");
const swMarker = '"./styles/performance-polish-v100.css"';
if (!sw.includes(swMarker)) throw new Error('Missing performance stylesheet marker in service worker.');
const missing = designLayers.filter(name => !sw.includes(`"./styles/${name}"`));
if (missing.length) {
  const insertion = [swMarker, ...missing.map(name => `"./styles/${name}"`)].join(',');
  sw = replaceOnce(sw, swMarker, insertion, 'service worker design stylesheet insertion point');
}
for (const name of designLayers) {
  if (!sw.includes(`"./styles/${name}"`)) throw new Error(`Service worker still misses ${name}`);
}
await writeFile(swPath, sw);

console.log('Applied v139 document design recovery patch.');

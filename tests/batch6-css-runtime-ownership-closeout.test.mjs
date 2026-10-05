import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const domainStyles=[
  'relationship-360-batch2.css',
  'notification-center-batch5.css',
  'sales-pipeline-batch6.css',
  'inventory-planning-batch7.css',
  'pricing-batch8.css',
  'payables-batch9.css',
  'tax-vat-batch10.css'
];
const loaders=[
  'relationship-360-style',
  'notification-center-style',
  'sales-pipeline-style',
  'inventory-planning-style',
  'pricing-style',
  'payables-style',
  'tax-vat-style'
];

test('Batch 6 gives domain CSS one canonical app.bundle owner and retires runtime link injection',async()=>{
  const index=await read('index.html');
  for(const name of domainStyles){
    assert.equal(index.split(name).length-1,1,name+' must be listed exactly once as a canonical bundle input');
  }
  for(const name of loaders){
    const source=await read('src/lib/'+name+'.ts');
    assert.doesNotMatch(source,/createElement\(['"]link['"]\)|appendChild\(link\)|href\s*=|\.css\?v=/,name+' must not create a late stylesheet owner');
    assert.match(source,/app\.bundle\.css/,name+' must document canonical bundle ownership');
  }
});

test('Batch 6 production output has one bundle plus the explicit v331 v332 v482 standalone allowlist and no missing CSS asset',async()=>{
  const [index,bundle]=await Promise.all([read('dist/index.html'),read('dist/styles/app.bundle.css')]);
  for(const name of domainStyles){
    const marker='/* --- '+name+' --- */';
    assert.equal(bundle.split(marker).length-1,1,name+' must appear exactly once in app.bundle.css');
    assert.equal(index.includes(name),false,name+' must not be fetched as a standalone production stylesheet');
  }

  const hrefs=[...index.matchAll(/<link\s+rel="stylesheet"\s+href="(\.\/[^"]+\.css(?:\?[^"]*)?)"/g)].map(match=>match[1]);
  const stylePaths=hrefs.map(href=>href.replace(/^\.\//,'').split('?')[0]);
  assert.deepEqual(stylePaths.filter(path=>path.startsWith('styles/')),[
    'styles/app.bundle.css',
    'styles/v331-draft-scroll-recovery.css',
    'styles/v332-critical-documents-deep-closeout.css',
    'styles/v482-mobile-ux-repair.css'
  ]);
  assert.ok(stylePaths.includes('ai-composer-v449.css'),'AI composer keeps its intentional root-level standalone runtime asset');
  for(const path of stylePaths)await access(new URL('dist/'+path,root));
});

test('Batch 6 compiled domain compatibility hooks contain no CSS URL and cannot create duplicate runtime owners',async()=>{
  for(const name of loaders){
    const compiled=await read('dist/src/lib/'+name+'.js');
    assert.doesNotMatch(compiled,/createElement\(['"]link['"]\)|appendChild\(link\)|\.\/styles\//,name+' compiled runtime must not inject CSS');
  }
  const notification=await read('dist/src/lib/notification-center-style.js');
  assert.doesNotMatch(notification,/notification-center-batch5\.css/,'notification center missing-resource path must be retired from runtime');
});

test('Batch 6 keeps only proven document runtime CSS fallbacks in document-entry',async()=>{
  const entry=await read('dist/document-entry-v302.js');
  const calls=[...entry.matchAll(/ensureStylesheet\([^,]+,'([^']+\.css(?:\?[^']*)?)'\)/g)].map(match=>match[1]);
  assert.deepEqual(calls,[
    './styles/v331-draft-scroll-recovery.css?v=365-1',
    './styles/v332-critical-documents-deep-closeout.css?v=332-1'
  ]);
  for(const retired of ['attachment-gallery-v304.css','mobile-layout-closeout-v305.css','release-hardening-v306.css'])assert.equal(entry.includes(retired),false,retired+' must stay retired');
});

test('Batch 6 locks final visual and AI runtime ownership order without adding another post-build patch layer',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=String(pkg.scripts.build||'');
  const v484=build.indexOf('v484-bundle-responsive-visual.mjs');
  const v485=build.indexOf('v485-bundle-visible-ui.mjs');
  const pdf=build.indexOf('v544-pdf-a4-output-emergency.mjs');
  assert.ok(v484>=0&&v485>v484&&pdf>v485,'visual ownership must remain v484 -> final v485 -> PDF emergency output owner');

  const oldAi=build.indexOf('ai-conversation-final-batch5.mjs');
  const conversation=build.indexOf('ai-remediation-batch3-conversation-ux.mjs');
  const conversationCloseout=build.indexOf('ai-remediation-batch3-conversation-ux-closeout.mjs');
  const tools=build.indexOf('ai-remediation-batch4-tools-routes-ux.mjs');
  const voiceHash=build.indexOf('ai-voice-final-runtime-hash.mjs');
  assert.ok(oldAi>=0&&conversation>oldAi&&conversationCloseout>conversation&&tools>conversationCloseout&&voiceHash>tools,'AI presentation ownership must finish with Batch 3 conversation -> closeout -> Batch 4 tools -> final voice hash');
  assert.equal(build.trim().endsWith('node scripts/ai-voice-final-runtime-hash.mjs'),true,'nothing may patch AI runtime after the final voice hash');
});

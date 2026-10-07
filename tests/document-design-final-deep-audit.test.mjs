import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultCompany} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {resolvedAppearanceTokens,resolvedDocumentTone,resolvedTemplateId} from '../dist/src/lib/appearance.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

function googleFontHref(html){return html.match(/<link href="([^"]*fonts\.googleapis\.com[^"]*)" rel="stylesheet"/i)?.[1]??'';}

test('renderer normalizes obsolete template identity before choosing the actual template header',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.equal(resolvedTemplateId('removed-template'),'executive');
  assert.equal(resolvedTemplateId('obsidian'),'obsidian');
  assert.match(renderer,/const variant=resolvedTemplateId\(doc\.appearance\.templateId\)/);
  assert.match(renderer,/variant=\{variant\}/);
  assert.doesNotMatch(renderer,/variant=\{doc\.appearance\.templateId\}/);
});

test('document tone follows the effective paper instead of being hardcoded light',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  const base=createBlankDocument('invoice','INV-TONE-FINAL',defaultCompany()).appearance;
  assert.equal(resolvedDocumentTone({...base,templateId:'obsidian'}),'dark');
  for(const templateId of ['executive','noir','midnight','blackivory','carbon'])assert.equal(resolvedDocumentTone({...base,templateId}),'light',templateId);
  assert.equal(resolvedDocumentTone({...base,templateId:'removed-template'}),'light');
  assert.match(renderer,/document-tone-\$\{tone\}/);
  assert.match(renderer,/data-tone=\{tone\}/);
  assert.doesNotMatch(renderer,/document-tone-light[^\n]*data-tone="light"/);
});

test('legacy template fallback keeps tokens and the actual rendered identity in sync',()=>{
  const base=createBlankDocument('invoice','INV-LEGACY-FINAL',defaultCompany()).appearance;
  const tokens=resolvedAppearanceTokens({...base,templateId:'removed-template',paletteMode:'auto'});
  assert.equal(resolvedTemplateId('removed-template'),'executive');
  assert.equal(tokens.page,'#ffffff');
  assert.equal(tokens.accent,'#bd9659');
  assert.equal(tokens.primary,'#17212b');
  assert.equal(tokens.secondary,'#4d5b68');
  assert.equal(tokens.heading,'#17212b');
});

test('secure-share output loads the exact document font family set used by the main app',async()=>{
  const [main,share]=await Promise.all([read('index.html'),read('public/share.html')]);
  const mainHref=googleFontHref(main),shareHref=googleFontHref(share);
  assert.ok(mainHref,'main Google Fonts request missing');
  assert.equal(shareHref,mainHref,'secure share must load the same selectable document fonts');
  for(const family of ['Cairo','Inter','Montserrat','Noto+Kufi+Arabic','Noto+Naskh+Arabic','Playfair+Display','Source+Sans+3','Tajawal'])assert.ok(shareHref.includes(`family=${family}:`),family);
});

test('secure-share Print Save PDF waits for fonts, pagination and images before invoking print',async()=>{
  const portal=await read('src/portal/SharePortal.tsx');
  assert.match(portal,/async function waitForPortalPrintReady/);
  assert.match(portal,/document\.fonts\.ready/);
  assert.match(portal,/dataset\.paginationReady===['"]true['"]/);
  assert.match(portal,/image\.decode/);
  assert.match(portal,/await waitForPortalPrintReady\(\);window\.print\(\)/);
  assert.doesNotMatch(portal,/onClick=\{\(\)=>window\.print\(\)\}/);
  assert.match(portal,/disabled=\{printing\}/);
});

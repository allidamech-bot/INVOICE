import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const styles=await readFile('src/styles/premium-ux-coherence-v362.css','utf8');

test('Arabic documents heading is right-aligned throughout the mobile breakpoint',()=>{
  assert.match(styles,/@media\s*\(max-width:\s*900px\)[\s\S]*?html\[dir="rtl"\] body \.app-ui \.ta-documents-header>div:first-child\s*\{[\s\S]*?width:100%!important;[\s\S]*?align-items:flex-start!important;[\s\S]*?text-align:right!important;/);
  assert.match(styles,/html\[dir="rtl"\] body \.app-ui \.ta-documents-header>div:first-child>:is\(\.ta-documents-eyebrow,h1,p\)\s*\{[\s\S]*?width:100%!important;[\s\S]*?text-align:right!important;/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(p,'utf8');

test('business document form renders terms ahead of totals and visible approvals ahead of templates',async()=>{
 const src=await read('src/components/EditorPageCore.tsx');
 const terms=src.indexOf('<span>04</span><h2>{t(\'Commercial Terms\'');
 const totals=src.indexOf('<span>05</span><h2>{t(\'Totals\'');
 const design=src.indexOf('<span>06</span><h2>{t(\'Design & approvals\'');
 const approval=src.indexOf('className="editor-document-elements"',design);
 const bank=src.indexOf('bank-account-select-note',approval);
 const toggle=src.indexOf('className="appearance-toggles"',approval);
 const template=src.indexOf('<TemplateThumbnails document={d}',design);
 assert.ok(terms>0&&totals>terms&&design>totals,'business terms must precede total then design');
 assert.ok(approval>design&&bank>approval&&toggle>bank&&template>toggle,'bank, approvals then templates');
 assert.equal(src.match(/bank-account-select-note/g)?.length,1,'bank selector must appear once');
 assert.equal(src.match(/className="appearance-toggles"/g)?.length,1,'bank/signature/stamp visibility only appears once');
});

test('document bank and approval state callbacks were preserved identically',async()=>{
 const src=await read('src/components/EditorPageCore.tsx');
 assert.match(src,/value=\{selectedBankId\} onChange=\{\(e:any\)=>this\.selectBank\(e\.target\.value\)\}/);
 assert.match(src,/documentBankAllowed\(d\.kind,d\.role\)\?<Field label=\{t\('Bank Account'/);
 for(const key of ['showBank','showSignature','showStamp']){
   assert.match(src,new RegExp('checked=\\{d\\.appearance\\.'+key+'\\} onChange=\\{v=>this\\.appearance\\(\\\''+key+'\\\',v\\)\\}'));
 }
 assert.match(src,/<TemplateThumbnails document=\{d\} onSelect=\{\(id:TemplateId\)=>this\.appearance\('templateId',id\)\}/);
 assert.match(src,/this\.state\.advancedOpen\?<div className="advanced-panel"/);
 assert.match(src,/<DocumentAttachmentsSection document=\{d\} onChange=/);
});

test('all adjusted editor layout styles are screen-scoped and have phone controls',async()=>{
 const css=await read('src/styles/editor-canonical-v314.css');
 const block=css.split('/* LOUREX UX rehab C — business document identity')[1];
 assert.ok(block);
 assert.match(block,/\.editor-screen:not\(\.draft-studio\) \.editor-document-elements/);
 assert.match(block,/\.editor-document-elements-bank select\{[\s\S]*?font-size:16px/);
 assert.match(block,/\.editor-document-elements \.appearance-toggles/);
 assert.match(block,/@media screen and \(max-width:720px\)/);
 assert.doesNotMatch(block,/\.invoice-page|\.draft-letter-page|\.print-portal/);
});

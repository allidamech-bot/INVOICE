import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hashCanonicalInvoice} from '../api/_fiscal/fiscal-artifacts.js';
let dir;
before(()=>{
  dir=mkdtempSync(join(tmpdir(),'fiscal-c14n-'));
  const r=spawnSync('javac',['-d',dir,fileURLToPath(new URL('../scripts/fiscal/CanonicalInvoice.java',import.meta.url))],{timeout:30000});
  assert.equal(r.status,0,'JDK 17+ is required for offline fiscal canonicalization QA');
});
after(()=>{if(dir)rmSync(dir,{recursive:true,force:true});});
const ns='xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"';
const wrap=s=>`<Invoice ${ns}>${s}</Invoice>`;
function run(xml){return spawnSync('java',['-cp',dir,'CanonicalInvoice','invoice'],{input:Buffer.from(xml),timeout:10000,maxBuffer:600*1024});}
function canon(xml){const r=run(xml);assert.equal(r.status,0,'canonicalization failed');return r.stdout;}
test('C14N 1.1 sorts attributes, expands empty elements and removes comments',()=>{
  const a=canon(wrap('<cbc:ID b="2" a="1"/><!--ignored-->'));
  const b=canon(wrap('<cbc:ID a="1" b="2"></cbc:ID>'));
  assert.deepEqual(a,b);assert.match(a.toString(),/<cbc:ID a="1" b="2"><\/cbc:ID>/);
});
test('only prescribed namespace-qualified stamp and QR subtrees are excluded',()=>{
  const retained='<cbc:ID>QA-1</cbc:ID><cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cbc:UUID>original</cbc:UUID></cac:AdditionalDocumentReference>';
  const stamp='<ext:UBLExtensions><ext:UBLExtension>signature</ext:UBLExtension></ext:UBLExtensions>';
  const signature='<cac:Signature><cbc:ID>signature</cbc:ID></cac:Signature>';
  const qr='<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cbc:UUID>qr</cbc:UUID></cac:AdditionalDocumentReference>';
  const a=canon(wrap(retained)),b=canon(wrap(stamp+retained+qr+signature));
  assert.deepEqual(a,b);
  assert.notEqual(hashCanonicalInvoice(a),hashCanonicalInvoice(canon(wrap(retained.replace('original','modified')))));
  assert.notEqual(hashCanonicalInvoice(a),hashCanonicalInvoice(canon(wrap(retained+'<Signature>not excluded</Signature>'))));
});
test('malformed XML, foreign root and DTD/entity declarations fail closed',()=>{
  for(const xml of ['<x/>','<Invoice>', '<!DOCTYPE Invoice [<!ENTITY leak SYSTEM "file:///etc/passwd">]>'+wrap('<cbc:ID>&leak;</cbc:ID>')]){
    const r=run(xml);assert.notEqual(r.status,0);assert.equal(r.stdout.length,0);assert.match(r.stderr.toString(),/FISCAL_CANONICALIZATION_FAILED/);
  }
});

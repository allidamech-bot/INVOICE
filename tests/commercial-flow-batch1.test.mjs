import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Batch 1 commercial tracking stays separate from document accounting lifecycle',async()=>{
  const source=await read('src/lib/commercial-flow.ts');
  assert.match(source,/CommercialTrackingStatus='draft'\|'internal-ready'\|'sent'\|'accepted'\|'rejected'\|'expired'\|'converted'/);
  assert.doesNotMatch(source,/doc\.status\s*=|doc\.lifecycleStatus\s*=/);
  assert.match(source,/linkedInvoiceForCommercialDocument/);
  assert.match(source,/status:'converted',source:'conversion'/);
});

test('Batch 1 never invents Viewed before a secure customer portal exists',async()=>{
  const source=await read('src/lib/commercial-flow.ts');
  assert.doesNotMatch(source,/['\"]viewed['\"]/i);
  assert.doesNotMatch(source,/Viewed/);
});

test('Batch 1 status precedence protects accepted and rejected quotes from automatic expiry',async()=>{
  const source=await read('src/lib/commercial-flow.ts');
  const accepted=source.indexOf("tracked?.status==='accepted'");
  const rejected=source.indexOf("tracked?.status==='rejected'");
  const expired=source.indexOf("expiresAt<today");
  assert.ok(accepted>0&&rejected>accepted&&expired>rejected,'manual terminal decisions must win before expiry derivation');
});

test('Batch 1 commercial flow uses existing conversion and credit links instead of synthetic relationships',async()=>{
  const source=await read('src/lib/commercial-flow.ts');
  assert.match(source,/candidate\.convertedFromId===doc\.id/);
  assert.match(source,/candidate\.role==='credit-note'&&candidate\.creditForId===child\.id/);
  assert.match(source,/commercialEvidence/);
  assert.match(source,/event\.relatedDocumentId/);
});

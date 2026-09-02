import { readFile, writeFile } from 'node:fs/promises';

const replaceOnce=(source,needle,replacement,label)=>{
  const at=source.indexOf(needle);
  if(at<0)throw new Error(`Patch target not found: ${label}`);
  if(source.indexOf(needle,at+needle.length)>=0)throw new Error(`Patch target ambiguous: ${label}`);
  return source.slice(0,at)+replacement+source.slice(at+needle.length);
};

{
  const path='src/app/App.tsx';
  let s=await readFile(path,'utf8');
  s=replaceOnce(s,
    "private beginRevision=async(source:LourexDocument):Promise<LourexDocument>=>{const vault=this.requireVault();const current=vault.documents.find(doc=>doc.id===source.id)??source;const draft=beginRevisionDraft(current);",
    "private beginRevision=async(source:LourexDocument):Promise<LourexDocument>=>{const vault=this.requireVault();const current=vault.documents.find(doc=>doc.id===source.id)??source;if(current.kind==='invoice'&&current.role==='standard'){const exposure=invoiceCreditCapacity(current,vault.documents,vault.payments);if(exposure.paid!=='0.00'||exposure.credited!=='0.00')throw new Error(t('An invoice with payments or issued credit notes cannot be revised. Use a credit note for financial corrections.','لا يمكن مراجعة فاتورة عليها دفعات أو إشعارات دائنة صادرة. استخدم إشعارًا دائنًا للتصحيح المالي.'));}const draft=beginRevisionDraft(current);",
    'revision financial guard');
  s=replaceOnce(s,
    "const capacity=invoiceCreditCapacity(current,vault.documents,vault.payments);if(Number(capacity.available)<=0)throw new Error",
    "const capacity=invoiceCreditCapacity(current,vault.documents,vault.payments);if(capacity.available==='0.00')throw new Error",
    'exact credit capacity guard');
  s=replaceOnce(s,
    "private convert=async(source:LourexDocument)=>{try{const current=this.requireVault();const errors=validateDocument(source);",
    "private convert=async(source:LourexDocument)=>{try{const current=this.requireVault();if(source.lifecycleStatus==='voided')throw new Error(t('A cancelled quote cannot be converted to an invoice.','لا يمكن تحويل عرض سعر ملغى إلى فاتورة.'));const errors=validateDocument(source);",
    'voided quote conversion guard');
  s=replaceOnce(s,
    "let documentEvents=vault.documentEvents;if(!existing)documentEvents=[...documentEvents,createDocumentEvent(updated,'created')];if(existing?.status==='draft'&&updated.status==='final')documentEvents=[...documentEvents,createDocumentEvent(updated,updated.revision>1?'reissued':'issued')];",
    "let documentEvents=vault.documentEvents;if(!existing){documentEvents=[...documentEvents,createDocumentEvent(updated,'created')];if(updated.status==='final')documentEvents=[...documentEvents,createDocumentEvent(updated,updated.revision>1?'reissued':'issued')];}else if(existing.status==='draft'&&updated.status==='final')documentEvents=[...documentEvents,createDocumentEvent(updated,updated.revision>1?'reissued':'issued')];",
    'first issue timeline');
  await writeFile(path,s);
}

{
  const path='src/lib/document-lifecycle.ts';
  let s=await readFile(path,'utf8');
  s=replaceOnce(s,
    "export function auditedDocument(vault:Pick<VaultPayload,'documentEvents'|'documentRevisions'>,doc:LourexDocument):boolean{return doc.status==='final'||doc.lifecycleStatus==='voided'||documentRevision(doc)>1||vault.documentEvents.some(event=>event.documentId===doc.id)||vault.documentRevisions.some(revision=>revision.documentId===doc.id);}",
    "export function auditedDocument(vault:Pick<VaultPayload,'documentEvents'|'documentRevisions'>,doc:LourexDocument):boolean{return doc.status==='final'||doc.lifecycleStatus==='voided'||documentRevision(doc)>1||vault.documentEvents.some(event=>event.documentId===doc.id&&event.type!=='created')||vault.documentRevisions.some(revision=>revision.documentId===doc.id);}",
    'draft deletion audit semantics');
  await writeFile(path,s);
}

{
  const path='src/components/EditorPage.tsx';
  let s=await readFile(path,'utf8');
  s=replaceOnce(s,
    "const canConvertFinalQuote=props.document.kind==='proforma'&&props.document.status==='final';",
    "const canConvertFinalQuote=props.document.kind==='proforma'&&props.document.status==='final'&&props.document.lifecycleStatus!=='voided';",
    'cancelled quote conversion UI');
  await writeFile(path,s);
}

{
  const path='tests/document-lifecycle-v132.test.mjs';
  let s=await readFile(path,'utf8');
  s += `\n\ntest('v132 blocks revision after financial activity and keeps ordinary drafts deletable',async()=>{const [app,lifecycle,editor]=await Promise.all([read('src/app/App.tsx'),read('src/lib/document-lifecycle.ts'),read('src/components/EditorPage.tsx')]);assert.match(app,/payments or issued credit notes cannot be revised/);assert.doesNotMatch(app,/Number\\(capacity\\.available\\)/);assert.match(lifecycle,/event\.type!==['\"]created['\"]/);assert.match(editor,/lifecycleStatus!==['\"]voided['\"]/);assert.match(app,/cancelled quote cannot be converted/);});\n`;
  await writeFile(path,s);
}

console.log('Batch 3 lifecycle safety edge cases hardened.');

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(p,'utf8');

test('AI source import batches only safe-new rows; existing and likely matches remain individually confirmed',async()=>{
 const source=await read('src/components/ProductAiSourceReview.tsx');
 assert.match(source,/private setSafeNewSelection=\(checked:boolean\)=>/);
 assert.match(source,/state\.reviews\[index\]\?\.classification==='new-product'&&state\.reviews\[index\]\?\.defaultSelected\?checked:selected/);
 assert.match(source,/this\.state\.reviews\.flatMap\(\(review,index\)=>review\.classification==='new-product'&&review\.defaultSelected/);
 assert.match(source,/private toggle=\(index:number\)=>/);
 assert.match(source,/review\.classification==='duplicate-candidate'\|\|review\.classification==='needs-review'\)return/);
 assert.match(source,/disabled=\{blocked\} checked=\{Boolean\(this\.state\.selected\[index\]\)\}/);
 assert.match(source,/mutateVaultSafely\(vault=>applyDraft/);
});

test('AI product source review retains every difference and makes evidence expandable',async()=>{
 const source=await read('src/components/ProductAiSourceReview.tsx');
 for(const a of ["filter:'all'|'new'|'matches'|'blocked'","showReview(review)","className=\"lxw-ai-product-review-toolbar\"","className=\"lxw-ai-product-row-evidence\"","className=\"lxw-ai-product-row-diffs\"","review.diff.map(diff=>","row.notes","row.brand","row.cartonQuantity","row.hsCode","row.saleCurrency||draft.sourceCurrency","row.costCurrency||draft.sourceCurrency"])assert.ok(source.includes(a),'missing detail: '+a);
 assert.match(source,/className="product-import-table-wrap lxw-ai-product-review"/);
 assert.match(source,/this\.state\.selected\.filter\(Boolean\)\.length/);
 assert.doesNotMatch(source,/review\.diff\.slice\(/);
});

test('mobile AI product review CSS keeps compact touch controls and scope',async()=>{
 const css=await read('src/styles/ai-conversation-workspace.css');
 const block=css.split('/* UX rehab B: filtered AI product classification')[1];
 assert.ok(block);
 for(const k of ['lxw-ai-product-review-filters','lxw-ai-product-review-selection','lxw-ai-product-row-evidence','lxw-ai-product-row-diffs','min-height:44px','font-size:12px','max-width'])assert.ok(block.includes(k),k);
 assert.match(block,/\.modal\.modal-assistant\[role='dialog'\]/);
 assert.doesNotMatch(block,/\.invoice-page|\.document-page|\.a4[-_]/i);
});

test('AI conversation lists become compact RTL-safe fact rows without altering or executing provider text',async()=>{
 const src=await read('src/components/AiConversationWorkspace.tsx');
 const css=await read('src/styles/ai-conversation-workspace.css');
 const block=css.split('/* UX rehab B: list-style AI source/product responses')[1];
 assert.ok(block,'scoped reply-row stylesheet');
 assert.match(src,/list\.push\(<li key=\{index\} className="lxw-ai-compact-result-row" dir="auto">\{formatted\}<\/li>\)/);
 assert.match(src,/if\(typeof value!=='string'\)return value/);
 assert.match(src,/Never interpret provider HTML or links/);
 assert.match(block,/#lourex-ai-panel\[data-lourex-workspace='2'\] \.lxw-markdown/);
 assert.match(block,/unicode-bidi:plaintext/);
 assert.doesNotMatch(block,/dangerouslySetInnerHTML/);
});

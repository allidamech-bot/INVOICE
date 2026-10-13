import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attachmentProgressSummary,attachmentRowCountEvidence} from '../dist/src/lib/ai-source-progress.js';

test('F17 shows only completed source files as actually completed, not pending or extracting',()=>{
 const rows=[{status:'done'},{status:'processing',phase:'reading'},{status:'ready'},{status:'processing',phase:'extracting'},{status:'error'}];
 assert.deepEqual(attachmentProgressSummary(rows),{total:5,done:1,processing:2,failed:1});
 rows[1]={status:'done'};rows[3]={status:'done'};
 assert.deepEqual(attachmentProgressSummary(rows),{total:5,done:3,processing:0,failed:1});
 assert.deepEqual(attachmentProgressSummary([]),{total:0,done:0,processing:0,failed:0});
});
test('F17 exact sheet source count is marked verified only with complete same-size evidence',()=>{
 const items=Array.from({length:84},(_,i)=>({descriptionEn:'Product '+(i+1)}));
 const complete={quoteSheetCandidate:JSON.stringify({parser:'exact-spreadsheet-columns',sourceRowCount:84,items})};
 assert.deepEqual(attachmentRowCountEvidence(complete),{count:84,verified:true});
 const mismatch={extracted:JSON.stringify({parser:'exact-spreadsheet-columns',sourceRowCount:85,items})};
 assert.deepEqual(attachmentRowCountEvidence(mismatch),{count:84,verified:false});
});
test('F17 model/OCR-derived item number is disclosed as unverified, not a complete file guarantee',()=>{
 assert.deepEqual(attachmentRowCountEvidence({extracted:JSON.stringify({items:[{descriptionEn:'only one recognized'}]})}),{count:1,verified:false});
 assert.deepEqual(attachmentRowCountEvidence({extracted:JSON.stringify({products:[{sku:'A'},{sku:'B'}]})}),{count:2,verified:false});
 for(const source of [null,{extracted:'{items:partial'},{extracted:JSON.stringify({items:[]})},{extracted:JSON.stringify({items:Array.from({length:121},()=>({}))})}])
  assert.equal(attachmentRowCountEvidence(source),null);
});
test('F17 presentation reports per-file sequence and real completed count without artificial model stages',async()=>{
 const script=await readFile(new URL('../scripts/ai-batch3-premium-conversation.mjs',import.meta.url),'utf8');
 assert.match(script,/import \{attachmentProgressSummary,attachmentRowCountEvidence\} from/);
 assert.match(script,/__lourexCompletedSourceRows\(row\)/);
 assert.match(script,/\(index\+1\)\+'\/'\+rows\.length/);
 assert.match(script,/progress\.done\+' \/ '\+progress\.total/);
 assert.match(script,/rows identified · review/);
 assert.match(script,/rows\.map\(\(row,index\)=>/);
 assert.doesNotMatch(script,/fake-progress|simulate-progress|Math\.random\(\).*percent/);
});

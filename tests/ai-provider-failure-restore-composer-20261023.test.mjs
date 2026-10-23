import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/components/AiCopilot.tsx',import.meta.url),'utf8');
const start=source.indexOf('private ask=async(raw?:string)=>');
const finish=source.indexOf('private executeItemProposal=',start);
const ask=source.slice(start,finish);

test('AI provider failure restores the exact pending message for retry without duplicate transcript turn',()=>{
  assert.ok(start>=0&&finish>start,'conversation request owner must be present');
  assert.match(ask,/input:''/,'sending empties the composer while the request is pending');
  assert.match(ask,/catch\(error\)\{if\(!this\.currentRequest\(generation,controller\)\)return;/,
    'only an active request may restore its input (not a cancelled thread)');
  assert.match(ask,/input:state\.input\|\|message/,
    'provider failures must restore the original unmodified request unless the composer already has newer text');
  assert.match(ask,/messages:state\.messages\.filter\(\(entry:AiMessage\)=>entry\.id!==userMessage\.id\)/,
    'only the failed pending message is removed to avoid duplicate user turns after retry');
  assert.match(ask,/proposal:pendingDocumentProposal,review:pendingDocumentReview/,
    'prior unapproved review and document state remain intact');
  assert.doesNotMatch(ask,/this\.setState\(\{busy:false,error:text,proposal:pendingDocumentProposal/,
    'the old provider error path silently discarded the pending composer input');
});

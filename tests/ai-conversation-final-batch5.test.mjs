import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('final AI conversation owner chain remains single and ordered',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=String(pkg.scripts?.build||'');
  const owners=[
    'ai-conversation-owner.mjs',
    'ai-voice-ios-release-owner.mjs',
    'ai-conversation-owner-stage3.mjs',
    'ai-conversation-owner-stage3-closeout.mjs',
    'ai-conversation-owner-stage4-tools.mjs',
    'ai-conversation-owner-stage4-tools-closeout.mjs',
    'ai-conversation-owner-stage4.mjs',
    'ai-conversation-owner-stage4-accessibility.mjs',
    'ai-conversation-final-batch5.mjs'
  ];
  let previous=-1;
  for(const owner of owners){
    const needle=`node scripts/${owner}`;
    const first=build.indexOf(needle);
    assert.ok(first>previous,`${owner} must remain in canonical owner order`);
    assert.equal(build.indexOf(needle,first+1),-1,`${owner} must run exactly once`);
    previous=first;
  }
});

test('first composer submit survives asynchronous thread hydration',async()=>{
  const closeout=await read('scripts/ai-conversation-final-batch5.mjs');
  const nextStart=closeout.indexOf('const nextWrapper=');
  const nextEnd=closeout.indexOf(';\nsource=source.replace',nextStart);
  assert.ok(nextStart>=0&&nextEnd>nextStart,'Batch 5 replacement wrapper must be explicit');
  const nextWrapper=closeout.slice(nextStart,nextEnd);
  assert.match(nextWrapper,/const submitted=typeof raw==='string'\?raw:String\(instance\.state\.input\?\?''\)/);
  assert.match(nextWrapper,/await __lourexEnsureAssistantThread\(instance\)/);
  assert.match(nextWrapper,/await baseAsk\(raw===undefined\?submitted:raw\)/);
  const captureAt=nextWrapper.indexOf("const submitted=typeof raw==='string'");
  const hydrateAt=nextWrapper.indexOf('await __lourexEnsureAssistantThread(instance)');
  const askAt=nextWrapper.indexOf('await baseAsk(raw===undefined?submitted:raw)');
  assert.ok(captureAt>=0&&captureAt<hydrateAt&&hydrateAt<askAt,'submitted text must be captured before hydration and used after hydration');
});

test('final responsive gate covers phone tablet desktop and both browser engines',async()=>{
  const runner=await read('tests/visual/run-ai-conversation-final-batch5.cjs');
  for(const token of ["{engine:chromium","{engine:webkit","[320,'ar','dark']","[390,'en','light']","[820,'ar','light']","[1440,'en','dark']"])assert.match(runner,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const token of ['ArrowDown','ArrowUp','Home','End','Escape','Memory & Tasks','Morning Brief','lourex-ai-structured-answer','lourex-ai-tool-activity'])assert.match(runner,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(runner,/providerCalls:requests\.length/);
  assert.match(runner,/scrollWidth<=innerWidth\+1/);
});

test('final AI interaction contracts retain mobile safe areas and approval boundaries',async()=>{
  const [accessibility,placement,tools,stage4]=await Promise.all([
    read('scripts/ai-conversation-owner-stage4-accessibility.mjs'),
    read('scripts/ai-batch7-placement-repair.mjs'),
    read('scripts/ai-conversation-owner-stage4-tools.mjs'),
    read('scripts/ai-conversation-owner-stage4.mjs')
  ]);
  assert.match(accessibility,/safe-area-inset-bottom/);
  assert.match(accessibility,/min-height:44px/);
  assert.match(accessibility,/ArrowDown/);
  assert.match(accessibility,/Escape/);
  assert.match(placement,/event\.stopPropagation\(\)/,'canonical Tools trigger owns propagation');
  assert.match(accessibility,/document\.addEventListener\('click',[\s\S]*?\},true\);/,'Tools focus handoff must run in capture phase across stopPropagation');
  assert.match(accessibility,/getAttribute\('aria-expanded'\)===['"]true['"]\)first\.focus\(\)/,'focus handoff must verify the Tools menu opened before focusing');
  assert.match(tools,/Nothing will run automatically/);
  assert.match(tools,/applyApprovedToolExecution/);
  assert.match(stage4,/lourex-ai-structured-answer/);
  assert.doesNotMatch(stage4,/second chatbot|new provider endpoint/i);
});

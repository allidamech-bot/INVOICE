import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

for(const priorStyle of ['',"'./ai-composer-v449.css',"])test('CSS-only changes refresh HTML/offline URLs with '+(priorStyle?'a legacy':'no prior')+' style cache entry',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lourex-final-style-'));
  const owner=resolve('scripts/ai-voice-final-runtime-hash.mjs');
  try{
    await mkdir(join(root,'dist/styles'),{recursive:true});
    const runtime='./ai-composer-v449.js?v=old',style='./ai-composer-v449.css?v=449-1';
    await writeFile(join(root,'dist/index.html'),`<link rel="stylesheet" href="./styles/app.bundle.css"><link rel="stylesheet" href="${style}"><script src="${runtime}"></script>`);
    await writeFile(join(root,'dist/sw.js'),`const LOCAL_CORE=['${runtime}',${priorStyle}];\nLOCAL_CORE.push('./canonical-redirect.js');`);
    await writeFile(join(root,'dist/ai-composer-v449.js'),'/* stable runtime */');
    let firstRuntime='';
    for(const css of ['button{color:white}','button{color:black}']){
      await writeFile(join(root,'dist/ai-composer-v449.css'),css);
      await writeFile(join(root,'dist/styles/app.bundle.css'),css+'/* app */');
      execFileSync(process.execPath,[owner],{cwd:root,stdio:'pipe'});
      const html=await readFile(join(root,'dist/index.html'),'utf8'),sw=await readFile(join(root,'dist/sw.js'),'utf8');
      const url='./ai-composer-v449.css?v='+createHash('sha256').update(css).digest('hex').slice(0,16);
      assert.ok(!sw.includes("'./ai-composer-v449.css'"),'the legacy unversioned precache entry must be upgraded');
      const appUrl='./styles/app.bundle.css?v='+createHash('sha256').update(css+'/* app */').digest('hex').slice(0,16);
      assert.ok(html.includes(appUrl)&&sw.includes(appUrl),'the complete picker/application bundle must also get a fresh exact cache key');
      assert.ok(html.includes(url));assert.ok(sw.includes(url),'offline cache must contain the exact URL requested by HTML');
      assert.ok(!html.includes(style)&&!sw.includes(style),'retired fixed CSS key must disappear');
      const js=html.match(/\.\/ai-composer-v449\.js\?v=[a-f0-9]+/)[0];
      if(firstRuntime)assert.equal(js,firstRuntime);else firstRuntime=js;
    }
  }finally{await rm(root,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'lourex-cache-')),dist=join(dir,'dist');mkdirSync(dist);
 const composer='/* deterministic current voice owner */',html='<link href="./ai-composer-v449.css?v=449-1"><script src="./vendor/firebase-app-compat.js?v=12.19.0"></script><script src="./runtime-safety-v334.js?v=344"></script><script src="./runtime-config.js"></script><script src="https://example.com/external.js"></script><script src="./ai-composer-v449.js?v=old"></script>';
 const sw="const LOCAL_CORE=['./vendor/firebase-app-compat.js','./ai-composer-v449.css','./runtime-safety-v334.js','./ai-composer-v449.js?v=old'];\nLOCAL_CORE.push('./canonical-redirect.js');";
 writeFileSync(join(dist,'ai-composer-v449.js'),composer);writeFileSync(join(dist,'index.html'),html);writeFileSync(join(dist,'sw.js'),sw);
 const run=()=>{const r=spawnSync(process.execPath,[new URL('scripts/ai-voice-final-runtime-hash.mjs',root).pathname],{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 return{dir,dist,composer,run,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
test('final build owner precaches exact emitted versioned URLs, retains final voice hash and excludes network-only configuration/external URLs',()=>{
 const f=fixture();try{f.run();const sw=readFileSync(join(f.dist,'sw.js'),'utf8'),ctx={};vm.runInNewContext(sw+'\nthis.urls=LOCAL_CORE;',ctx);const hash=createHash('sha256').update(f.composer).digest('hex').slice(0,16);
 for(const asset of ['./vendor/firebase-app-compat.js?v=12.19.0','./runtime-safety-v334.js?v=344','./ai-composer-v449.css?v=449-1',`./ai-composer-v449.js?v=${hash}`])assert.ok(ctx.urls.includes(asset),asset);
 assert.ok(!ctx.urls.includes('./runtime-config.js'));assert.ok(!ctx.urls.some(asset=>asset.startsWith('https:')));f.run();assert.equal(readFileSync(join(f.dist,'sw.js'),'utf8'),sw,'repeat sealing must not duplicate cache entries');
 }finally{f.cleanup();}
});
function cacheFunction(name){const source=read('public/sw.js'),ast=ts.createSourceFile('sw.js',source,ts.ScriptTarget.Latest,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(fn);return fn.getText(ast);}
for(const name of ['cacheFirst','networkFirst'])test(name+': first offline versioned request misses an unversioned cache key and succeeds with the final manifest',async()=>{
 const f=fixture();try{const wanted='./vendor/firebase-app-compat.js?v=12.19.0',cache=new Map([['./vendor/firebase-app-compat.js',new Response('runtime',{status:200})]]),ctx={CACHE:'isolated-test',Response,fetch:async()=>{throw Error('offline');},caches:{open:async()=>({match:async request=>cache.get(typeof request==='string'?request:request.url),put:async()=>{}})}};
 vm.runInNewContext(cacheFunction(name)+'\nthis.run='+name+';',ctx);assert.equal((await ctx.run({url:wanted,mode:'cors'})).status,504,'the current exact-key behavior must expose the defect');
 f.run();const manifest={};vm.runInNewContext(readFileSync(join(f.dist,'sw.js'),'utf8')+'\nthis.urls=LOCAL_CORE;',manifest);for(const asset of manifest.urls)cache.set(asset,new Response('runtime',{status:200}));assert.equal((await ctx.run({url:wanted,mode:'cors'})).status,200);
 }finally{f.cleanup();}
});
test('actual final output precaches all emitted local shell URLs except deliberately network-only runtime configuration',()=>{
 const html=read('dist/index.html'),sw=read('dist/sw.js'),ast=ts.createSourceFile('sw.js',sw,ts.ScriptTarget.Latest,true),cached=new Set();
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='LOCAL_CORE'&&n.initializer&&ts.isArrayLiteralExpression(n.initializer))for(const e of n.initializer.elements)if(ts.isStringLiteral(e))cached.add(e.text);if(ts.isCallExpression(n)&&n.expression.getText(ast)==='LOCAL_CORE.push')for(const a of n.arguments)if(ts.isStringLiteral(a))cached.add(a.text);ts.forEachChild(n,visit);}visit(ast);
 const assets=[...html.matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g)].map(m=>m[1]).filter(asset=>asset.split('?')[0]!=='./runtime-config.js');assert.ok(assets.length>20);for(const asset of assets)assert.ok(cached.has(asset),asset+' must have an exact active cache entry');assert.equal(cached.has('./runtime-config.js'),false);
});

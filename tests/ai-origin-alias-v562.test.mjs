import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sameOriginRequest} from '../api/_ai/request-security.js';

const request=(headers)=>({headers});

test('accepts the public production alias when Vercel forwards a different canonical host',()=>{
  assert.equal(sameOriginRequest(request({
    host:'invoice-three-puce.vercel.app',
    'x-forwarded-host':'invoice-9z5px4cr6-alidaamishs-projects.vercel.app',
    origin:'https://invoice-three-puce.vercel.app',
    'x-requested-with':'LOUREX-Invoice'
  })),true);
});

test('accepts the forwarded host when it is the actual browser origin',()=>{
  assert.equal(sameOriginRequest(request({
    host:'invoice-three-puce.vercel.app',
    'x-forwarded-host':'invoice-alidaamishs-projects.vercel.app',
    origin:'https://invoice-alidaamishs-projects.vercel.app',
    'x-requested-with':'LOUREX-Invoice'
  })),true);
});

test('still rejects spoofed, insecure, or unmarked requests',()=>{
  assert.equal(sameOriginRequest(request({
    host:'invoice-three-puce.vercel.app',
    origin:'https://evil.example',
    'x-requested-with':'LOUREX-Invoice'
  })),false);
  assert.equal(sameOriginRequest(request({
    host:'invoice-three-puce.vercel.app',
    origin:'http://invoice-three-puce.vercel.app',
    'x-requested-with':'LOUREX-Invoice'
  })),false);
  assert.equal(sameOriginRequest(request({
    host:'invoice-three-puce.vercel.app',
    origin:'https://invoice-three-puce.vercel.app'
  })),false);
});

test('AI serverless entry points share one alias-safe origin guard',()=>{
  const files=[
    'ai-advisor-v2.js','ai-conversation-v3.js','ai-core.js','ai-inbox.js',
    'customer-capture-ai.js','product-import-ai.js','product-source-ai.js',
    'quote-pricing-intent.js','quote-source-ai.js','supplier-capture-ai.js',
    'supplier-document-ai.js'
  ];
  for(const name of files){
    const source=readFileSync(new URL(`../api/${name}`,import.meta.url),'utf8');
    assert.match(source,/import \{sameOriginRequest\} from '\.\/_ai\/request-security\.js';/,name);
    assert.doesNotMatch(source,/function forwardedHost\(request\)/,name);
    assert.doesNotMatch(source,/function sameOriginRequest\(request\)/,name);
  }
});

import test from 'node:test';import assert from 'node:assert/strict';
import {freeOpenRouterModels} from '../api/_ai/free-model-catalog.js';
const row=(id,pricing={prompt:'0',completion:'0'})=>({id,pricing,architecture:{input_modalities:['text','image'],output_modalities:['text']},supported_parameters:['tools','reasoning'],context_length:128000});
test('all zero-price free chat variants are admitted, paid/unknown/overrides never are',()=>{
 const rows=[row('a/one:free'),row('b/two:free'),row('b/two:free'),row('c/paid:free',{prompt:'0',completion:'0.1'}),row('d/missing:free',{}),row('e/billed:free',{prompt:'0',completion:'0',request:'1'}),row('f/unknown:free',{prompt:'0',completion:'0',overrides:[]}),row('g/zero-but-funded')];
 const models=freeOpenRouterModels({data:rows});assert.deepEqual(models.map(x=>x.model),['a/one:free','b/two:free']);assert.ok(models[0].capabilities.includes('VISION'));
});
test('non-text endpoints and malformed catalog never become chat candidates',()=>{
 assert.deepEqual(freeOpenRouterModels({data:[{...row('a/audio:free'),architecture:{input_modalities:['text'],output_modalities:['audio']}}]}),[]);assert.deepEqual(freeOpenRouterModels(null),[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('product categories preserve stored canonical IDs while localizing visible labels',async()=>{
 const source=await read('src/components/ProductLibraryWorkspace.tsx');
 for(const token of ['categoryChoices(isArabic())','categoryPresetMap=new Map(categoryPresets.map(choice=>[choice.value,choice.label]))','categoryLabel=(value:string)=>categoryPresetMap.get(value)||value','category:categoryOf(item)','categoryLabel(categoryOf(item))','categoryLabel(this.state.category)'])assert.ok(source.includes(token),token);
 assert.ok(source.includes('categoryOf(item)===this.state.category'),'filter must compare canonical category values');
 assert.ok(source.includes('value={category}'),'filter option must save canonical values');
});


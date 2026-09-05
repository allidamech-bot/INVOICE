import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('interface-language save cannot silently persist or roll back newer numbering edits',async()=>{
  const source=await read('src/components/SettingsModal.tsx');
  assert.match(source,/const persisted=JSON\.parse\(this\.state\.documentsInitial\) as AppSettings/);
  assert.match(source,/const nextPersisted=\{\.\.\.persisted,uiLanguage:value\}/);
  assert.match(source,/this\.setState\(\{appSettings:next,busy:true/);
  assert.match(source,/onSaveAppSettings\(nextPersisted\)/);
  assert.match(source,/savedSection:JSON\.stringify\(state\.appSettings\)===JSON\.stringify\(nextPersisted\)\?'documents':null/);
  assert.match(source,/appSettings:state\.appSettings\.uiLanguage===value\?\{\.\.\.state\.appSettings,uiLanguage:previous\.uiLanguage\}:state\.appSettings/);
  assert.doesNotMatch(source,/onSaveAppSettings\(next\);this\.setState\(\{documentsInitial:JSON\.stringify\(next\)/);
  assert.doesNotMatch(source,/catch\(e\)\{this\.setState\(\{appSettings:previous/);
});

test('company and document saves preserve edits made while persistence is in flight',async()=>{
  const source=await read('src/components/SettingsModal.tsx');
  assert.match(source,/const source=structuredClone\(this\.state\.company\);const sourceSnapshot=JSON\.stringify\(source\)/);
  assert.match(source,/const unchanged=JSON\.stringify\(state\.company\)===sourceSnapshot/);
  assert.match(source,/company:unchanged\?company:state\.company/);
  assert.match(source,/const settings=structuredClone\(this\.state\.appSettings\);const snapshot=JSON\.stringify\(settings\)/);
  assert.match(source,/const unchanged=JSON\.stringify\(state\.appSettings\)===snapshot/);
  assert.match(source,/Newer edits are still unsaved/);
});

test('company artwork can be replaced repeatedly and removed before saving',async()=>{
  const source=await read('src/components/SettingsModal.tsx');
  assert.match(source,/private selectAsset=\(field:AssetField,input:HTMLInputElement\)=>\{const file=input\.files\?\.\[0\];input\.value='';void this\.upload\(field,file\);\}/);
  assert.match(source,/private clearAsset=\(field:AssetField\)/);
  assert.match(source,/Remove logo/);
  assert.match(source,/Remove signature/);
  assert.match(source,/Remove stamp/);
  assert.match(source,/Save Company to apply the change/);
});

test('company artwork upload is bounded and excludes raw SVG uploads',async()=>{
  const source=await read('src/components/SettingsModal.tsx');
  assert.match(source,/MAX_COMPANY_ASSET_BYTES=4\*1024\*1024/);
  assert.ok(source.includes('const COMPANY_ASSET_TYPES=/^image\\/(png|webp|jpeg)$/i;'));
  assert.match(source,/accept="image\/png,image\/webp,image\/jpeg"/);
  assert.doesNotMatch(source,/accept="[^"]*image\/svg\+xml/);
  assert.match(source,/Use a PNG, WebP, or JPEG image/);
});

test('first-run company logo uses the same bounded raster policy and cannot finish mid-processing',async()=>{
  const source=await read('src/components/AuthScreens.tsx');
  assert.match(source,/MAX_SETUP_LOGO_BYTES=4\*1024\*1024/);
  assert.ok(source.includes('const SETUP_LOGO_TYPES=/^image\\/(png|webp|jpeg)$/i;'));
  assert.match(source,/private logoUploadId=0/);
  assert.match(source,/logoBusy: boolean/);
  assert.match(source,/this\.setState\(\{error:'',logoBusy:true\}\)/);
  assert.match(source,/if\(uploadId!==this\.logoUploadId\)return/);
  assert.match(source,/if\(this\.state\.logoBusy\)return/);
  assert.match(source,/disabled=\{busy\|\|logoBusy\}/);
  assert.match(source,/accept="image\/png,image\/webp,image\/jpeg"/);
  assert.doesNotMatch(source,/accept="[^"]*image\/svg\+xml/);
  assert.match(source,/Preparing logo/);
  const upload=source.slice(source.indexOf('private uploadLogo = async'),source.indexOf('private next ='));
  assert.ok(upload.indexOf('const uploadId=++this.logoUploadId')<upload.indexOf('file.size>MAX_SETUP_LOGO_BYTES'),'every newer setup-logo selection must invalidate older work before size validation');
  assert.ok(upload.indexOf('const uploadId=++this.logoUploadId')<upload.indexOf('SETUP_LOGO_TYPES.test'),'a rejected setup-logo replacement must still supersede older work');
  assert.match(upload,/Image is too large[\s\S]*logoBusy:false/);
  assert.match(upload,/Use a PNG, WebP, or JPEG image[\s\S]*logoBusy:false/);
});

test('company technical identifiers remain LTR inside Arabic settings UI',async()=>{
  const source=await read('src/components/SettingsModal.tsx');
  assert.match(source,/label="IBAN"><Input dir="ltr"/);
  assert.match(source,/label="SWIFT \/ BIC"><Input dir="ltr"/);
  assert.match(source,/VAT Number[\s\S]*?<Input dir="ltr"/);
  assert.match(source,/Commercial Registration[\s\S]*?<Input dir="ltr"/);
  assert.match(source,/type="tel" inputMode="tel" autoComplete="tel" dir="ltr"/);
  assert.match(source,/type="email" inputMode="email" autoComplete="email" dir="ltr"/);
  assert.match(source,/type="url" inputMode="url" autoComplete="url" dir="ltr"/);
});

test('company save validates optional email without changing historical document snapshots',async()=>{
  const [settings,documents]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/lib/documents.ts')]);
  assert.match(settings,/Enter a valid company email address or leave it empty/);
  assert.match(documents,/companySnapshot:/);
  assert.match(documents,/companySnapshotFrom\(company\)/);
});

test('stale artwork work cannot overwrite a closed or reopened settings session',async()=>{
  const source=await read('src/components/SettingsModal.tsx');
  assert.match(source,/private assetPreparationId=0/);
  assert.match(source,/if\(!this\.props\.open&&prev\.open\)this\.assetPreparationId\+=1/);
  const operationStarts=source.match(/const preparationId=\+\+this\.assetPreparationId/g)||[];
  const staleGuards=source.match(/if\(!this\.props\.open\|\|preparationId!==this\.assetPreparationId\)return;/g)||[];
  assert.ok(operationStarts.length>=3,'open preparation, upload, and rebuild should each get a fresh operation id');
  assert.ok(staleGuards.length>=7,'all async artwork completion and failure paths should reject stale sessions');
});

test('new artwork intent supersedes older processing, including logo mode changes',async()=>{
  const source=await read('src/components/SettingsModal.tsx');
  const upload=source.slice(source.indexOf('private upload=async'),source.indexOf('private rebuildLogo=async'));
  assert.ok(upload.indexOf('const preparationId=++this.assetPreparationId')<upload.indexOf('file.size>MAX_COMPANY_ASSET_BYTES'),'a replacement selection must invalidate older work before validation');
  assert.ok(upload.indexOf('const preparationId=++this.assetPreparationId')<upload.indexOf('COMPANY_ASSET_TYPES.test'),'a rejected replacement must still supersede older work');
  assert.match(upload,/cleaningAssets:false,error:t\('Image is too large/);
  assert.match(upload,/cleaningAssets:false,error:t\('Use a PNG, WebP, or JPEG image/);
  const mode=source.slice(source.indexOf('private setLogoMode='),source.indexOf('private saveCompany=async'));
  assert.match(mode,/if\(this\.state\.busy\)return/);
  assert.match(mode,/this\.assetPreparationId\+=1/);
  assert.match(mode,/cleaningAssets:false/);
});

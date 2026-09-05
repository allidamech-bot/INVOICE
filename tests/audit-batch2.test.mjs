import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('first-run setup and Settings prepare bounded raster company artwork with dedicated cleanup profiles',async()=>{
  const [auth,settings]=await Promise.all([
    read('src/components/AuthScreens.tsx'),
    read('src/components/SettingsModal.tsx')
  ]);
  assert.match(auth,/MAX_SETUP_LOGO_BYTES=4\*1024\*1024/);
  assert.match(auth,/SETUP_LOGO_TYPES=\/\^image\\\/\(png\|webp\|jpeg\)\$\/i/);
  assert.match(auth,/fileToDataUrl\(file,MAX_SETUP_LOGO_BYTES,'logo'\)/);
  assert.match(auth,/accept="image\/png,image\/webp,image\/jpeg"/);
  assert.doesNotMatch(auth,/accept="[^"]*image\/svg\+xml/);
  assert.match(settings,/MAX_COMPANY_ASSET_BYTES=4\*1024\*1024/);
  assert.match(settings,/field==='logoDataUrl'\?'logo':field==='signatureDataUrl'\?'signature':'stamp'/);
  assert.match(settings,/fileToDataUrl\(file,MAX_COMPANY_ASSET_BYTES,this\.assetKind\(field\)\)/);
});

test('cloud account protects account actions while an explicit account operation is active',async()=>{
  const source=await read('src/components/CloudAccountModal.tsx');
  assert.match(source,/<Button disabled=\{this\.state\.busy\} onClick=\{\(\)=>void this\.run\(this\.props\.onSignOut,'','signout'\)\}/);
  assert.match(source,/this\.state\.accountAction==='signout'/);
  assert.match(source,/Sign Out/);
  assert.doesNotMatch(source,/Sync Now|مزامنة الآن/);
});

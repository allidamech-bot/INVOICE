import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

function shareDocument(kind='proforma'){
  return {
    id:'quote-1',kind,role:'standard',status:'final',lifecycleStatus:'active',revision:1,creditForId:'',creditForNumber:'',voidedAt:'',voidReason:'',bankAccountId:'',paymentTermPresetId:'',number:'PI-2026-0001',issueDate:'2026-10-01',dueDate:'2026-10-15',currency:'USD',language:'en',
    customerSnapshot:{sourceCustomerId:'customer-1',companyNameEn:'Acme Trading',companyNameAr:'أكمي',contactPerson:'',addressEn:'',addressAr:'',city:'Jeddah',country:'Saudi Arabia',phone:'',email:'buyer@example.test',vatTaxNumber:'',commercialRegistration:''},
    companySnapshot:{nameEn:'LOUREX',nameAr:'لوركس',logoDataUrl:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',website:'',vatNumber:'',taxNumber:'',commercialRegistration:'',bank:{bankName:'',accountName:'',iban:'',swift:'',currency:'USD'},signatureDataUrl:'',stampDataUrl:'',footerText:''},
    attachments:[{id:'att-1',name:'secret.pdf',mimeType:'application/pdf',size:20,dataUrl:'data:application/pdf;base64,SECRET',createdAt:'2026-10-01T00:00:00.000Z'}],
    items:[{id:'item-1',descriptionEn:'Item',descriptionAr:'صنف',hsCode:'',origin:'Türkiye',packing:'Box',quantity:'1',unit:'PCS',unitPrice:'100.00',unitCost:'55.00'}],
    terms:{incoterm:'',paymentTerms:'',packing:'',deliveryTime:'',portOfLoading:'',finalDestination:'',countryOfOrigin:'',validity:'',remarks:''},
    adjustments:{discountEnabled:false,discountMode:'fixed',discountValue:'0',shippingEnabled:false,shipping:'0',otherChargesEnabled:false,otherCharges:'0',taxEnabled:false,taxPercent:'0'},
    internalCosts:{shippingCost:'88.00',otherCost:'22.00'},appearance:{templateId:'executive',paletteMode:'auto',accentColor:'',latinFont:'auto',arabicFont:'auto',showBank:false,showSignature:false,showStamp:false,showHsCode:false,showOrigin:false,showPacking:false,watermark:{enabled:false,type:'text',pattern:'single',text:'',opacity:.1,color:'#000000',angle:0,size:12}},letter:null,notes:'',convertedFromId:'source-private',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'
  };
}

test('secure share domain produces opaque fragment links and strips internal data',async()=>{
  const mod=await import('../dist/src/lib/secure-share.js');
  const doc=shareDocument();
  assert.equal(mod.secureShareEligible(doc),true);
  assert.equal(mod.secureShareAllowsDecision(doc),true);
  const token=mod.newSecureShareToken();
  assert.match(token,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(mod.secureShareUrl(token,'https://invoice.example'),`https://invoice.example/share.html#${token}`);
  const safe=mod.sanitizeDocumentForSecureShare(doc);
  assert.deepEqual(safe.attachments,[]);
  assert.deepEqual(safe.internalCosts,{shippingCost:'0.00',otherCost:'0.00'});
  assert.equal(safe.items[0].unitCost,'');
  assert.equal(safe.convertedFromId,'');
  assert.equal(doc.items[0].unitCost,'55.00','source document must not be mutated');
  assert.equal(mod.secureShareEligible({...doc,status:'draft'}),false);
  assert.equal(mod.secureShareEligible({...doc,lifecycleStatus:'voided'}),false);
  assert.equal(mod.secureShareEligible({...doc,kind:'purchase-order'}),false);
});

test('public portal is isolated from the encrypted vault and uses ephemeral anonymous auth',async()=>{
  const [html,data,portal]=await Promise.all([read('public/share.html'),read('src/portal/share-data.ts'),read('src/portal/SharePortal.tsx')]);
  assert.match(html,/noindex,nofollow,noarchive/);
  assert.match(html,/name="referrer" content="no-referrer"/);
  assert.match(html,/src\/portal\/SharePortal\.js/);
  assert.doesNotMatch(html,/src\/app\/App\.js|AppShell/);
  assert.match(data,/APP_NAME='lourex-public-share'/);
  assert.match(data,/Auth\.Persistence\.NONE/);
  assert.match(data,/signInAnonymously\(\)/);
  assert.match(data,/collection\('publicShares'\)\.doc\(id\)\.get\(\)/);
  assert.doesNotMatch(data,/resumeVaultSession|EncryptedVault|users\//);
  assert.match(portal,/TemplateRenderer/);
  assert.match(portal,/markPortalViewed/);
  assert.match(portal,/sendPortalDecision/);
  assert.match(portal,/internal costs, attachments, or other documents/);
});

test('Firestore rules deny broad portal access and constrain customer evidence mutations',async()=>{
  const rules=await read('firestore.rules');
  assert.match(rules,/match \/publicShares\/\{shareId\}/);
  assert.match(rules,/shareId\.matches\('\^\[A-Za-z0-9_\-\]\{43\}\$'\)/);
  assert.match(rules,/sign_in_provider == 'anonymous'/);
  assert.match(rules,/allow get: if shareTokenValid\(shareId\).*anonymousPortal\(\).*shareActive\(\)/s);
  assert.match(rules,/allow list: if ownerExisting\(\)/);
  assert.match(rules,/changed\.hasOnly\(\['viewedAt','customerComment','commentAt','decision','decisionAt','updatedAt'\]\)/);
  assert.match(rules,/request\.resource\.data\.updatedAt == request\.time/);
  assert.match(rules,/resource\.data\.decision == ''/);
  assert.match(rules,/request\.resource\.data\.customerComment\.size\(\) <= 1000/);
  assert.match(rules,/match \/\{document=\*\*\} \{\s*allow read, write: if false;/s);
  assert.doesNotMatch(rules,/allow (read|write): if true/);
});

test('owner transport requires authenticated LOUREX cloud ownership',async()=>{
  const owner=await read('src/cloud/secure-share-owner.ts');
  assert.match(owner,/currentCloudUser\(\)/);
  assert.match(owner,/Connect your LOUREX cloud account/);
  assert.match(owner,/where\('ownerUid','==',uid\)/);
  assert.match(owner,/collection\('publicShares'\)\.doc\(id\)\.set/);
  assert.match(owner,/revokeSecureShare/);
  assert.doesNotMatch(owner,/signInAnonymously/);
});

test('portal evidence is correlated into encrypted commercial tracking without storing shares in VaultPayload',async()=>{
  const [flow,evidence,types]=await Promise.all([read('src/lib/commercial-flow.ts'),read('src/lib/secure-share-evidence.ts'),read('src/types.ts')]);
  assert.match(flow,/CommercialTrackingEventKind='sent'\|'viewed'\|'commented'\|'accepted'/);
  assert.match(flow,/kind==='viewed'/);
  assert.match(flow,/kind==='commented'/);
  assert.match(flow,/Portal evidence can only be recorded by a secure customer link/);
  assert.match(evidence,/relatedDocumentId===shareId/);
  assert.match(evidence,/syncSecureShareEvidence/);
  assert.match(evidence,/mutateVaultSafely/);
  const vaultBlock=types.match(/export interface VaultPayload \{([\s\S]*?)\n\}/)?.[1]||'';
  assert.doesNotMatch(vaultBlock,/secureShare|publicShare|customerPortal/i);
});

test('Documents and Customer 360 expose secure sharing without adding primary navigation',async()=>{
  const [documents,customer360,shares,appShell,index]=await Promise.all([read('src/components/DocumentsPage.tsx'),read('src/components/Customer360LivePanel.tsx'),read('src/components/CustomerSharesPanel.tsx'),read('src/components/AppShell.tsx'),read('index.html')]);
  assert.match(documents,/SecureShareManager/);
  assert.match(documents,/secureShareEligible/);
  assert.match(documents,/Secure Share/);
  assert.match(customer360,/CustomerSharesPanel/);
  assert.match(shares,/Shared with customer/);
  assert.match(index,/secure-share-batch11\.css/);
  assert.doesNotMatch(appShell,/Secure Share|Customer Portal|secureShareId/);
});

test('terminal or converted quotations cannot receive a new customer decision capability',async()=>{
  const manager=await read('src/components/SecureShareManager.tsx');
  assert.match(manager,/tracking\.status!==['"]accepted['"]/);
  assert.match(manager,/tracking\.status!==['"]rejected['"]/);
  assert.match(manager,/event\.type===['"]converted['"]/);
  assert.match(manager,/createSecureShare\(doc,Number\(days\),allowDecision\)/);
  const owner=await read('src/cloud/secure-share-owner.ts');
  assert.match(owner,/Boolean\(allowDecision&&secureShareAllowsDecision\(doc\)\)/);
});

test('Batch 11 CSS protects mobile, RTL, touch, reduced motion and print surfaces',async()=>{
  const css=await read('src/styles/secure-share-batch11.css');
  assert.match(css,/min-height:44px/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/html\[dir="rtl"\]/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media print/);
  assert.match(css,/\.lx-public-document-shell/);
});

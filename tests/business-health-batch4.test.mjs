import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

function customer(id,overrides={}){return {id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',companyNameEn:'Customer Co',companyNameAr:'',contactPerson:'Ali',addressEn:'',addressAr:'',city:'',country:'',phone:'+966500000000',email:'buyer@example.com',vatTaxNumber:'VAT-1',commercialRegistration:'CR-1',preferredCurrency:'USD',paymentTermPresetId:'',paymentTerms:'30 days',paymentDueDays:'30',creditLimit:'',creditCurrency:'',notes:'',...overrides};}
function supplier(id,overrides={}){return {id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',nameEn:'Supplier Co',nameAr:'',contactPerson:'Sara',address:'',city:'',country:'',phone:'+905000000000',email:'supplier@example.com',vatTaxNumber:'SVAT-1',commercialRegistration:'SCR-1',defaultCurrency:'USD',paymentTerms:'30 days',notes:'',...overrides};}
function item(id,overrides={}){return {id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',sku:`SKU-${id}`,descriptionEn:`Product ${id}`,descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'20',lastCurrency:'USD',lastUnitCost:'10',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'',...overrides};}

test('Batch 4 health engine is derived-only and never mutates the encrypted vault',async()=>{
  const source=await read('src/lib/business-health.ts');
  assert.match(source,/buildBusinessHealth/);
  assert.match(source,/status:'ready'\|'needs-attention'/);
  assert.doesNotMatch(source,/mutateVaultSafely|saveVault|putRecord|localStorage|sessionStorage|schemaVersion\s*=/);
  assert.doesNotMatch(source,/exchangeRate|convertCurrency|fxRate/i);
});

test('Batch 4 treats tax and registration identity as review-if-applicable, not a universal legal blocker',async()=>{
  const source=await read('src/lib/business-health.ts');
  assert.match(source,/if they apply to your business and jurisdiction/);
  assert.match(source,/إذا كانت تنطبق على نشاطك واختصاصك/);
  assert.match(source,/'company-tax-identity','company','review'/);
});

test('Business health detects missing deterministic data and preserves canonical repair targets',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {buildBusinessHealth}=await import('../dist/src/lib/business-health.js');
  const vault=emptyVault();
  vault.company.nameEn='';vault.company.nameAr='';vault.company.defaultCurrency='';vault.company.vatNumber='';vault.company.taxNumber='';vault.company.commercialRegistration='';vault.company.bank.bankName='';vault.company.bank.iban='';vault.company.bankAccounts=[];
  vault.customers=[customer('c1',{companyNameEn:'',contactPerson:'',phone:'',email:'',preferredCurrency:''})];
  vault.suppliers=[supplier('s1',{nameEn:'',contactPerson:'',phone:'',email:'',defaultCurrency:''})];
  vault.savedItems=[item('p1',{sku:'',descriptionEn:'',descriptionAr:'',unit:'',lastUnitCost:'',lastCostCurrency:''})];
  const health=buildBusinessHealth(vault);
  assert.equal(health.status,'needs-attention');
  const ids=new Set(health.issues.map(issue=>issue.id));
  for(const id of ['company-identity','company-default-currency','customers-missing-name','suppliers-missing-name','products-missing-description','products-missing-unit','products-missing-cost'])assert.ok(ids.has(id),id);
  const targetById=new Map(health.issues.map(issue=>[issue.id,issue.target]));
  assert.equal(targetById.get('company-identity'),'settings');
  assert.equal(targetById.get('customers-missing-name'),'customers');
  assert.equal(targetById.get('suppliers-missing-name'),'operations');
  assert.equal(targetById.get('products-missing-cost'),'items');
});

test('Business health recognizes duplicate identity groups without changing source records',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {buildBusinessHealth}=await import('../dist/src/lib/business-health.js');
  const vault=emptyVault();
  vault.company.nameEn='LOUREX';vault.company.defaultCurrency='USD';vault.company.vatNumber='VAT';vault.company.bank.bankName='Bank';
  vault.customers=[customer('c1'),customer('c2',{companyNameEn:'Customer Co 2',vatTaxNumber:' vat 1 ',commercialRegistration:'CR-2',email:'second@example.com',phone:'+966511111111'})];
  vault.suppliers=[supplier('s1'),supplier('s2',{nameEn:'Supplier 2',vatTaxNumber:'SVAT-2',commercialRegistration:'SCR-2',email:'supplier2@example.com',phone:'+905111111111'})];
  vault.savedItems=[item('p1',{sku:'ABC-001'}),item('p2',{sku:'abc 001',descriptionEn:'Different Product'})];
  const health=buildBusinessHealth(vault);
  const customerDuplicate=health.issues.find(issue=>issue.id==='customers-duplicates');
  const productDuplicate=health.issues.find(issue=>issue.id==='products-duplicates');
  assert.ok(customerDuplicate&&customerDuplicate.count>=1);
  assert.ok(productDuplicate&&productDuplicate.count>=1);
  assert.equal(vault.customers.length,2);
  assert.equal(vault.savedItems.length,2);
});

test('A sufficiently complete vault can report ready without inventing optional compliance requirements',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {buildBusinessHealth}=await import('../dist/src/lib/business-health.js');
  const vault=emptyVault();
  vault.company.nameEn='LOUREX';vault.company.defaultCurrency='USD';vault.company.vatNumber='VAT-OK';vault.company.bank.bankName='Bank';
  vault.customers=[customer('c1')];vault.suppliers=[supplier('s1')];vault.savedItems=[item('p1')];
  const health=buildBusinessHealth(vault);
  assert.equal(health.status,'ready');
  assert.equal(health.warningCount,0);
  assert.equal(health.reviewCount,0);
  assert.deepEqual(health.issues,[]);
});

test('Business Health stays inside Home and routes every repair to a canonical workspace',async()=>{
  const [app,home,card]=await Promise.all([read('src/app/App.tsx'),read('src/components/WorkspaceHome.tsx'),read('src/components/BusinessHealthCard.tsx')]);
  assert.match(app,/buildBusinessHealth\(vault\)/);
  assert.match(app,/health=\{businessHealth\}/);
  assert.match(app,/onOpenSettings=\{\(\)=>this\.setState\(\{settingsOpen:true\}\)\}/);
  assert.match(home,/BusinessHealthCard/);
  assert.ok(home.indexOf('<BusinessHealthCard')>home.indexOf('ta-dashboard-intelligence-grid'));
  assert.ok(home.indexOf('<BusinessHealthCard')<home.indexOf('ta-kpi-grid'));
  assert.match(home,/target==='settings'/);
  assert.match(home,/onNavigate\(target\)/);
  assert.doesNotMatch(card,/mutateVaultSafely|saveVault|mergeVaultIntent|deleteCustomer|deleteSupplier|deleteSavedItem|deleteDocument/);
});

test('Batch 4 mobile browser QA covers bilingual attention and ready states',async()=>{
  const [workflow,runner,fixture]=await Promise.all([read('.github/workflows/batch4-business-health.yml'),read('tests/visual/run-business-health-batch4.cjs'),read('tests/visual/business-health-batch4.html')]);
  assert.match(workflow,/Run mobile Business Health browser QA/);
  assert.match(runner,/viewport:\{width:390,height:844\}/);
  assert.match(runner,/mobile-en/);assert.match(runner,/mobile-ar/);assert.match(runner,/mobile-ready-en/);assert.match(runner,/mobile-ready-ar/);
  assert.match(runner,/height>=44/);
  assert.match(runner,/scrollWidth<=geometry\.innerWidth\+1/);
  assert.match(runner,/data-last-target/);
  assert.match(fixture,/BusinessHealthCard/);
  assert.match(fixture,/target:'settings'/);
  assert.match(fixture,/target:'customers'/);
});

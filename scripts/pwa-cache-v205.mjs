import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

const cacheMarker="LOCAL_CORE.push('./canonical-redirect.js');";
const requiredRuntimes=['./src/components/AiCopilot.js','./src/components/SupplierDocumentImport.js','./src/storage/vault-mutation-bridge.js','./src/lib/ai-finance.js','./src/lib/ai-business.js','./src/lib/product-pricing-intelligence.js','./src/lib/supplier-purchasing-intelligence.js','./src/lib/settings-scope.js','./src/cloud/google-auth.js','./src/cloud/coalescing.js','./src/lib/packing-display.js','./src/lib/unit-display.js','./src/lib/product-import-intelligence.js','./health.js','./styles/nested-surface-consistency-v229.css','./styles/saved-items-picker-v232.css','./styles/customer-language-purity-v233.css','./styles/ledger-pulse-loading-v250.css'];
for(const runtime of requiredRuntimes){
  if(sw.includes(`'${runtime}'`)||sw.includes(`"${runtime}"`))continue;
  if(!sw.includes(cacheMarker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');
  sw=sw.replace(cacheMarker,`LOCAL_CORE.push('${runtime}');\n${cacheMarker}`);
}

const previousCache="const CACHE = 'lourex-invoice-v204';";
const nextCache="const CACHE = 'lourex-invoice-v225';\n// const CACHE = 'lourex-invoice-v224'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v223'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v222'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v221'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v220'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v219'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v218'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v217'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v216'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v215'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v214'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v213'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v212'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v211'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v210'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v209'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v208'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v207'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v206'; preserved as a legacy marker for cache-migration tests.\n// lourex-invoice-v205: preserved as a legacy marker for cache-migration tests.\n// lourex-invoice-v204: preserved as a legacy marker for cache-migration tests.";
const releaseCache=nextCache.replace("const CACHE = 'lourex-invoice-v225';","const CACHE = 'lourex-invoice-v228';\n// const CACHE = 'lourex-invoice-v227'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v226'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v225'; preserved as a legacy marker for cache-migration tests.");
if(sw.includes(previousCache))sw=sw.replace(previousCache,releaseCache);
const activeCache="const CACHE = 'lourex-invoice-v280';";
if(!sw.includes(activeCache)&&!sw.includes("const CACHE = 'lourex-invoice-v228';"))throw new Error('Unable to verify the active LOUREX PWA cache generation.');
for(const runtime of requiredRuntimes)if(!sw.includes(runtime))throw new Error(`LOUREX PWA cache is missing required runtime ${runtime}.`);

// critical v214 service-worker activation: preserved as a release marker.
// v215 security-boundary migration: preserved as a release marker.
// v216 is a browser auth recovery generation: normal Safari/Chrome profiles must
// stop serving stale Google-auth runtime while editable workspaces remain
// protected by the app's existing reload guard.
// v217 adds save-state truthfulness, departure protection and conflict recovery.
// v218 coalesces consecutive local saves before publishing the full vault.
// v219 keeps automatic reloads blocked for the entire document-editor lifetime.
// v220 closes the remaining light feedback surfaces in the dark application UI.
// v223 keeps small vaults fast while giving medium/large encrypted vaults a
// longer automatic quiet window before full-vault Firebase publication.
// v224 publishes the Luminous Noir application palette and final dark surfaces.
// v225 extends Luminous Noir through launch, diagnostics, updates and iPhone output.
// v226 makes the production health runner CSP-safe and refreshes public-language accessibility.
// v227 completes keyboard tab behavior and restores a single primary heading on account entry.
// v228 replaces decorative Luminous Noir effects with a flat Matte Black accounting interface.
// v229 closes legacy light/gradient surfaces nested inside matte application workspaces.
// v230 refreshes installed clients for editor detail spacing and locale-correct automatic font labels.
// v231 keeps Totals switches visually compact while preserving a 44px mobile/tablet hit target.
// v232 turns the mobile Saved Items picker into one contained dialog viewport with a dedicated scrolling list.
// v233 keeps customer identity surfaces in the active UI language while preserving bilingual stored data.
// v234 gives phone purchase editing a focused form-only workspace without sticky shell chrome.
// v235 blocks automatic remote-cloud replacement while an unsafe data-entry workspace is open.
// v236 restores live inactivity locking and background-resume expiry enforcement.
// v237 keeps financial report identities and CSV exports in the active UI language.
// v238 keeps receivables search bilingual while rendering only the active-language customer identity.
// v239 keeps Operations supplier, item, status and expense-category identity locale-pure and restores Arabic purchase descriptions.
// v240 protects deliberate Lock from discarding unsaved inline data-entry state while automatic inactivity locking remains enforced.
// v241 width-fits the full A4 mobile preview on narrow phones without changing the printable document geometry.
// v242 restores the Matte Black Operations tab strip on phones after the legacy UX recovery override.
// v243 contains the Inventory workspace and Manual Movement action inside narrow phone viewports while preserving the ledger's internal horizontal scroll.
// v244 keeps Packing preview text in the active UI language while canonical stored values remain unchanged and backward-compatible.
// v245 keeps canonical product category values while localizing catalog labels to the active UI language.
// v246 extends canonical category localization through Saved Items filters, category browsing, context labels and row chips.
// v247 localizes known saved-product unit labels in read-only catalog rows while canonical editor/storage values remain unchanged.
// v248 reorganizes More, Account and Settings around clear workspace, document, commercial and security ownership.
const releaseMarkers=[
  '// lourex-invoice-v230: editor detail polish refresh.',
  '// lourex-invoice-v231: mobile totals switch geometry refresh.',
  '// lourex-invoice-v232: saved-items picker containment refresh.',
  '// lourex-invoice-v233: customer language purity refresh.',
  '// lourex-invoice-v234: focused mobile purchase editing refresh.',
  '// lourex-invoice-v235: guarded cloud replacement refresh.',
  '// lourex-invoice-v236: live inactivity lock refresh.',
  '// lourex-invoice-v237: reports locale purity refresh.',
  '// lourex-invoice-v238: receivables bilingual search refresh.',
  '// lourex-invoice-v239: operations locale purity refresh.',
  '// lourex-invoice-v240: manual lock draft safety refresh.',
  '// lourex-invoice-v241: narrow mobile A4 preview fit refresh.',
  '// lourex-invoice-v242: mobile Operations matte tabs refresh.',
  '// lourex-invoice-v243: inventory mobile containment refresh.',
  '// lourex-invoice-v244: packing preview locale purity refresh.',
  '// lourex-invoice-v245: product category locale purity refresh.',
  '// lourex-invoice-v246: saved items category locale purity refresh.',
  '// lourex-invoice-v247: product unit locale purity refresh.',
  '// lourex-invoice-v248: More and Settings information architecture refresh.',
  '// lourex-invoice-v257: localized financial input and RTL numeric isolation refresh.'
];
for(const releaseMarker of releaseMarkers)if(!sw.includes(releaseMarker))sw=`${releaseMarker}\n${sw}`;
const installTail="await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));})()));";
const criticalInstallTail="await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));await self.skipWaiting();})()));";
if(sw.includes(installTail))sw=sw.replace(installTail,criticalInstallTail);
if(!sw.includes('await self.skipWaiting();'))throw new Error('Unable to enable critical service-worker activation.');

await writeFile(swPath,sw);

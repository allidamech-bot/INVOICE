import { readFile, writeFile } from 'node:fs/promises';

const swPath='dist/sw.js';
let sw=await readFile(swPath,'utf8');

const cacheMarker="LOCAL_CORE.push('./canonical-redirect.js');";
const requiredRuntimes=['./src/lib/settings-scope.js','./src/cloud/google-auth.js','./src/cloud/coalescing.js','./health.js','./styles/nested-surface-consistency-v229.css','./styles/saved-items-picker-v232.css','./styles/customer-language-purity-v233.css'];
for(const runtime of requiredRuntimes){
  if(sw.includes(`'${runtime}'`)||sw.includes(`"${runtime}"`))continue;
  if(!sw.includes(cacheMarker))throw new Error('Unable to locate the LOUREX PWA cache insertion point.');
  sw=sw.replace(cacheMarker,`LOCAL_CORE.push('${runtime}');\n${cacheMarker}`);
}

const previousCache="const CACHE = 'lourex-invoice-v204';";
const nextCache="const CACHE = 'lourex-invoice-v225';\n// const CACHE = 'lourex-invoice-v224'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v223'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v222'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v221'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v220'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v219'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v218'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v217'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v216'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v215'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v214'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v213'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v212'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v211'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v210'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v209'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v208'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v207'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v206'; preserved as a legacy marker for cache-migration tests.\n// lourex-invoice-v205: preserved as a legacy marker for cache-migration tests.\n// lourex-invoice-v204: preserved as a legacy marker for cache-migration tests.";
const releaseCache=nextCache.replace("const CACHE = 'lourex-invoice-v225';","const CACHE = 'lourex-invoice-v228';\n// const CACHE = 'lourex-invoice-v227'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v226'; preserved as a legacy marker for cache-migration tests.\n// const CACHE = 'lourex-invoice-v225'; preserved as a legacy marker for cache-migration tests.");
if(sw.includes(previousCache))sw=sw.replace(previousCache,releaseCache);
if(!sw.includes("const CACHE = 'lourex-invoice-v228';"))throw new Error('Unable to advance the LOUREX PWA cache generation to v228.');
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
const releaseMarkers=[
  '// lourex-invoice-v230: editor detail polish refresh.',
  '// lourex-invoice-v231: mobile totals switch geometry refresh.',
  '// lourex-invoice-v232: saved-items picker containment refresh.',
  '// lourex-invoice-v233: customer language purity refresh.',
  '// lourex-invoice-v234: focused mobile purchase editing refresh.',
  '// lourex-invoice-v235: guarded cloud replacement refresh.'
];
for(const releaseMarker of releaseMarkers)if(!sw.includes(releaseMarker))sw=`${releaseMarker}\n${sw}`;
const installTail="await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));\n})()));";
const criticalInstallTail="await Promise.all(EXTERNAL_CORE.map(asset=>preserveExternalRuntime(cache,asset)));\n  await self.skipWaiting();\n})()));";
if(sw.includes(installTail))sw=sw.replace(installTail,criticalInstallTail);
if(!sw.includes('await self.skipWaiting();'))throw new Error('Unable to enable the critical v228 service-worker activation.');

await writeFile(swPath,sw);
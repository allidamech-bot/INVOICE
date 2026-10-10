import { readFile, writeFile } from 'node:fs/promises';

const bridgePath='dist/ios-print-bridge.js';
const htmlPath='dist/index.html';
const swPath='dist/sw.js';
const VERSION='580-1';

let bridge=await readFile(bridgePath,'utf8');
if(!bridge.includes("stage.className = 'lourex-ios-pdf-stage invoice-pages'"))throw new Error('v580: PDF stage lost the canonical invoice-pages parent.');

const bridgeStart='(() => {';
const versionMarker=`const SAFARI_PDF_BRIDGE_VERSION = '${VERSION}';\n  window.__LOUREX_PDF_BRIDGE_VERSION__ = SAFARI_PDF_BRIDGE_VERSION;`;
if(!bridge.includes('SAFARI_PDF_BRIDGE_VERSION')){
  if(!bridge.includes(bridgeStart))throw new Error('v580: iOS PDF bridge bootstrap marker not found.');
  bridge=bridge.replace(bridgeStart,`${bridgeStart}\n  ${versionMarker}`);
}

const legacyPrintGuard="if(!pendingArmed||document.body.classList.contains('printing-financial-report')){nativePrint();return;}";
const hardenedPrintGuard=`if(document.body.classList.contains('printing-financial-report')){nativePrint();return;}
    if(!pendingArmed){
      if(isAppleTouch&&document.body.classList.contains('printing')){
        showPreparationError(new Error('Safari document output is not armed. Close and retry Save PDF.'));
        releaseParentPrintState();
        return;
      }
      nativePrint();
      return;
    }`;
if(bridge.includes(legacyPrintGuard))bridge=bridge.replace(legacyPrintGuard,hardenedPrintGuard);
if(!bridge.includes("isAppleTouch&&document.body.classList.contains('printing')"))throw new Error('v580: Safari native print fallback guard was not installed.');

const blobLine="        const blob = pdf.output('blob');";
const pageInvariant=`        const expectedPageCount=pages.length;
        const actualPageCount=typeof pdf.getNumberOfPages==='function'?pdf.getNumberOfPages():expectedPageCount;
        if(actualPageCount!==expectedPageCount)throw new Error(\`PDF page-count mismatch: expected \${expectedPageCount}, got \${actualPageCount}.\`);
`;
if(!bridge.includes('const expectedPageCount=pages.length;')){
  if(!bridge.includes(blobLine))throw new Error('v580: PDF blob output marker not found.');
  bridge=bridge.replace(blobLine,`${pageInvariant}${blobLine}`);
}
if(!bridge.includes('actualPageCount!==expectedPageCount'))throw new Error('v580: PDF physical page-count invariant was not installed.');

await writeFile(bridgePath,bridge);

let html=await readFile(htmlPath,'utf8');
const unversioned='<script src="./ios-print-bridge.js"></script>';
const versioned=`<script src="./ios-print-bridge.js?v=${VERSION}"></script>`;
if(html.includes(unversioned))html=html.replace(unversioned,versioned);
if(!html.includes(versioned))throw new Error('v580: production HTML does not load the cache-busted Safari PDF bridge.');
await writeFile(htmlPath,html);

let sw=await readFile(swPath,'utf8');
const cacheMarker="LOCAL_CORE.push('./canonical-redirect.js');";
const versionedAsset=`LOCAL_CORE.push('./ios-print-bridge.js?v=${VERSION}');`;
if(!sw.includes(versionedAsset)){
  if(!sw.includes(cacheMarker))throw new Error('v580: service-worker insertion marker not found.');
  sw=sw.replace(cacheMarker,`${versionedAsset}\n${cacheMarker}`);
}
const swMarker=`/* v580 Safari PDF cache refresh ${VERSION} */`;
if(!sw.includes(swMarker))sw+=`\n${swMarker}\n`;
await writeFile(swPath,sw);

const [finalBridge,finalHtml,finalSw]=await Promise.all([
  readFile(bridgePath,'utf8'),
  readFile(htmlPath,'utf8'),
  readFile(swPath,'utf8')
]);
if(!finalBridge.includes(`SAFARI_PDF_BRIDGE_VERSION = '${VERSION}'`))throw new Error('v580: bridge version marker missing.');
if(!finalBridge.includes("isAppleTouch&&document.body.classList.contains('printing')"))throw new Error('v580: Safari fallback guard missing.');
if(!finalBridge.includes('actualPageCount!==expectedPageCount'))throw new Error('v580: PDF page-count invariant missing.');
if(!finalHtml.includes(`ios-print-bridge.js?v=${VERSION}`))throw new Error('v580: cache-busted bridge tag missing.');
if(!finalSw.includes(versionedAsset)||!finalSw.includes(swMarker))throw new Error('v580: service-worker bridge refresh missing.');

console.log('LOUREX v580 Safari PDF guard installed: cache-busted bridge, no native document-print fallback, physical PDF page-count invariant.');

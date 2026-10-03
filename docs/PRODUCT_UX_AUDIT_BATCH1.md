# Batch 1 — responsive safety and mobile density

Baseline: main `10999686c066573470e0a5ec448dac10b8efbf5e` (PR #491).
Branch: `audit/product-ux-batch1`. PR: #492. Merge pending final blocking CI.

## Changes and evidence

- Shared modal height follows the actual visual viewport, including keyboard
  viewports below 240px. Existing offset and desktop cleanup remain intact.
- Documents uses a native phone type selector with all ten existing choices.
  Desktop tabs remain intact; both controls update the same filter state.
- Mobile intro decoration is collapsed and creation buttons retain 44px targets.
  At 390px Chromium, the canonical header fell from 318px to 210px; search moved
  from y=626 to y=298. No document types or actions were removed.
- Product import phone review stacks each row with translated labels, preserving
  all eight columns including sale price/currency, cost/currency, metadata and
  validation reason. Existing review/confirmation semantics remain unchanged.
- Phone import uses the existing sticky actions without a duplicate footer.

## Root causes of failed blocking browser checks

The Documents fixture mounted `.app-ui` on `#root` itself, while production puts
`.app-ui` inside `#root`. Consequently `#root .app-ui` owners never matched the
fixture, producing a 425px header. Both Documents and import fixtures now match
production ancestry. The Documents height assertion was tightened to 240px,
not relaxed.

The Safari import test asserted an additional 72px chrome reserve after
`visualViewport.height` was already used. That contradicts current viewport
ownership and double-subtracts chrome. The test now requires zero duplicate
reserve and retains geometry, CTA visibility, sticky scroll stability, body lock,
RTL, parsing and save checks. A focused browser test also exercises a simulated
190px keyboard viewport with offset and its dismissal in Chromium and WebKit.

## QA actually run

- Dependency audit: PASS, zero vulnerabilities.
- LOUREX static security: PASS.
- TypeScript / production build: PASS.
- Shared-modal behavioral test: PASS.
- Documents: 320/390/430/820/900/901/1024/1440, representative AR/EN and dark/light:
  PASS. No horizontal overflow; all choices retained; 44px creation targets.
- Phone Product Import 320px Arabic: Chromium + WebKit PASS, all eight columns
  and financial values preserved, close releases body scrolling.
- Existing import final audit: PASS, six real-component scenarios.
- v338/v483 WebKit editor/save-loop/Documents gate: PASS.
- iPad Desktop-UA WebKit: 820x1180 portrait Draft and 1194x834 landscape Draft,
  Invoice and Quotation: PASS, end-scroll and autosave.
- Shell navigation: PASS, ten Chromium/WebKit phone+iPad cases.
- WebKit overlay-release and sign-out guard: PASS.

Screenshots and geometry reports are generated under
`visual-qa-output/responsive-batch1`. Final published CI is authoritative for merge.

## Limitations

VisualViewport keyboard/chrome transitions are simulated. Real physical Safari
keyboard/browser-toolbar behavior is not claimed as hardware-verified. Fixtures
render actual components with local data; this is not an authenticated production
account audit. No storage, accounting, auth, AI or PDF behavior was changed.

## Sequential continuation

After blocking CI passes and this PR merges, begin Batch 2 from newly merged
main: inventory active production owners and consolidate in small parity-proven
steps. Do not restore PR #484 or stack future batches on this unmerged branch.

# LOUREX AI Living Workspace — release QA gate

**Audit date:** 2026-10-12. **Release state: BLOCKED / NOT APPROVED.**
This checklist is an execution gate, not an assertion that all checks passed.

## Repository / PR stack
- Repository: `allidamech-bot/INVOICE` only.
- Base `main` at kickoff: `27ed9d54f615ecfea8dd73ab34fc072d3a4dcfa3`.
- PR #703: Foundation — Draft, unmerged.
- PR #704: Motion/composer — Draft, unmerged; based on #703.
- PR #705: Controller/Advisor separation — Draft, unmerged; based on #704.
- PR #706: Colored preview, tiny approval actions, independent AI settings and hardening — Draft, unmerged; based on #705.
- PR #706 diverged one commit from #705 during parallel hardening. Verify and reconcile its base **before** accepting the stack. GitHub reports PR as mergeable, which is not equivalent to verified release safety.
- The rejected exploratory `design/ai-workspace-ux-20261012` branch is not used.
- No direct changes to `main`. No Production deployment.

## Verification performed

| Gate | Result | Evidence/limitation |
|---|---|---|
| Branch file/source contract inspection | PASS | Verified mode, storage, language, preview and menu contracts in GitHub HEAD |
| Canonical menu JavaScript parser | PASS | Parsed actual `public/ai-composer-v449.js` with JS runtime syntax parser |
| Menu entrance, exit, rapid reopen | PASS — isolated | Executed production menu functions in a fake DOM; no real browser |
| Menu reduced-motion fallback | PASS — isolated | Executed actual function with a reduced-motion simulated environment |
| Automatic Arabic/English reply locale | PASS — isolated | Executed extracted production function body with six Arabic/English/neutral cases |
| Server proposal-sanitizer mode restrictions | PASS — isolated | Executed functions extracted from `api/ai-core.js` and `api/ai-advisor-v2.js`, stubbed sanitizers |
| Full TypeScript compile | NOT RUN | Whole repository source/build environment unavailable in current connector-only session |
| Production build script (all postprocessors) | NOT RUN | Must run independently to catch build-time visual owner collisions |
| Full Node test suite | NOT RUN | Required before merging |
| Browser sessions and account-scoped Firebase persistence | NOT RUN | Must use authenticated browser, not sample fixtures |
| Real provider/microphone/attachments | NOT RUN | Test provider failure, re-record and multipart uploads |
| iPhone/iPad real WebKit + keyboard safe-area QA | NOT RUN | Required before release |
| Updated Production commit and Vercel deploy | NOT VERIFIED / NOT DEPLOYED | Verify after explicit merge and deployment authorization |

## Recommended reproducible local verification

Use a clean checkout of **PR #706 head**, after reconciling its PR stack with #705, with the repository's configured Node and npm versions.

```bash
npm ci
npx tsc --noEmit
npm run build
node --test tests/ai-living-workspace-mode-foundation.test.mjs tests/ai-living-workspace-mode-integration.test.mjs tests/ai-living-workspace-motion-batch2.test.mjs tests/ai-living-workspace-preview-batch4.test.mjs tests/ai-living-workspace-preferences-batch4.test.mjs tests/ai-living-workspace-server-mode-policy.test.mjs
```

Then run the **entire** repository test suite using its canonical scripts in `package.json`. Do not weaken existing tests to make a new style pass. Do not assume GitHub Actions is available: prior user reported exhausted Actions credits.

## Authenticated live acceptance scenarios

1. **Arabic / RTL, 320/390/430px:** One-pill composer: physical rightmost SEND, then MIC, fine separator, right-aligned `اسأل LOUREX…` then PLUS at far left. No inner box/border. Keyboard does not conceal controls; iOS safe area is honored.
2. **English / LTR:** Deliberate mirror layout (where specified); no accidental bidi reorder of buttons, document IDs, amounts or currency.
3. **Controller vs Advisor:** Each mode has a distinct persisted conversation and draft. Account/workspace/branch changes cannot expose another company's records. Old threads without a mode are read-only Advisor; new threads start Controller.
4. **Advisor hostile-case testing:** Ask Advisor to navigate, delete, save a quotation, approve a staged product import, invoke a direct legacy draft shortcut, execute a local task/memory command. No tool mutation, route change, or approval should occur, even through crafted plans.
5. **Approvals:** Prepare document; open preview; check all lines, terms, totals and blockers; do not allow approval until acknowledgement. Revise the proposal and ensure a previous acknowledgement is invalid. Test double clicks, rejection, stale review, wrong company, expired token, interrupted app.
6. **Preview palette and math:** Functional accent colors confined to preview and + menu. No missing or malformed price shows as genuine zero. Subtotal explicitly excludes shipping, discounts, taxes. Verify saved/draft status and source.
7. **Menu/robot motion:** Open, fast-close, reopen, press outside and Escape, minimize/restore. No scroll jumps; respect device/AI reduced-motion preference.
8. **Settings:** Site locale EN with AI UI AR and answers EN; inverse AR site / EN AI UI; automatic language on Arabic vs English messages; reload and switch threads; verify settings remain account-scoped and business data unchanged.
9. **Voice:** Start/stop recording repeatedly, cancel and retry, recover mic permission denied, typed text remains editable, no automatic send without intent.
10. **Responsive:** 320, 390, 430, 820, 900, 901, 1024 and 1440px; tablets, desktop artifact pane, mobile preview, no overlay deadlocks, no nested-scroll trap, accessible 44px touch controls.
11. **Error resilience:** AI timeout, unavailable provider, no Firebase session, slow storage, failed attachment, switching tabs mid-action, stale async answer, exact accuracy and user-visible failure states.

## Release contract

No claim of completion, no PR ready-state, no merge, no Production deploy, and no user-facing "100% ready" until the full build and tests, security boundaries, authenticated browser acceptance, branch stack reconciliation, and release review are documented as passing.

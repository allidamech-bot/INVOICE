# LOUREX AI Living Workspace — Release Acceptance Checklist

**Applies to:** stacked PRs #703 → #704 → #705 → #706 → #707.  
**Scope:** repository `allidamech-bot/INVOICE` ONLY.  
**Status:** unaccepted until local automation **and** authenticated browser/device checks pass. Do not merge/deploy on source checks alone.

## 1. Execute the local release gate without GitHub Actions credits

From a clean checkout of the **latest final stacked feature branch**:

```sh
npm ci
node scripts/ai-living-workspace-release-gate.mjs
```

The script runs `npm run typecheck`, `npm run build` (all legacy transformation stages), then Node's full automatic test discovery. It fails on nonzero exit status. To investigate a failure, run `--targeted`; `--no-build` is allowed only for a freshly built local dist tree. Targeted checks do **not** constitute a release pass.

**Record for audit:** branch SHA, npm/node versions, date, all command exit codes, names of any tests skipped or failed, build output SHA. Do not weaken assertions or delete old tests to obtain green.

## 2. Authenticated browser and visual acceptance

This checklist must be executed against an authenticated **preview deployment built from the exact QA-approved SHA**, NOT accidentally against an older Production revision. Compare GitHub commit, preview deployment commit, and built app commit before browser QA. No credentials in tests/screenshots/repo.

| Width / device | Mode | Language | Critical check |
|---|---|---|---|
| 320, 390, 430px (iPhone) | Controller + Advisor | Arabic/English | One-pill composer, right-edge Arabic SEND → MIC → hairline → right-aligned Ask LOUREX text → PLUS far left; keyboard and safe areas |
| 820, 900, 901, 1024px (iPad) | Both | Both | Avoid breakpoint overlap; tappable tabs/settings; no PIN; preview usable under software/hardware keyboard |
| 1440px desktop | Both | Both | Conversation + bounded artifact workspace, orderly close/back, focus restored |
| Dark/light LOUREX host | Both | Both | AI conversation stays grayscale with readable contrast; only document preview and + icons use restrained colors |

**Pass/fail details:**

- Launcher robot only nudges rarely (~2px), and stops animation on Reduce Motion, focus/hover and when panel open. Screen-reader name is correct.
- Controller and Advisor have **separate conversation histories**; switching modes does not transfer drafts, attachments, proposal rights or private scoped data. Old legacy messages remain readable as Advisor, new conversations begin Controller.
- Advisor direct prompt, suggested action, imported file, injected plan, and repeated tap cannot open pages, create draft, alter fields, send messages, or approve. Authorized scoped read/calculate still works.
- At every account switch, company switch, branch switch and logout/login, rehydrate the right thread only. Test corrupted legacy thread metadata; it must fail closed, not grant Controller.
- The + menu animates open AND closed in 220–280ms, floats above the composer, does not push messages, and works with Escape/outside-click/rapid double tap. Source/camera/file selectors still work.
- Plus options are mode-scoped; Advisor does not expose execution/navigation toolbox. File attach/unattach, multiple PDFs, microphone repeat recording, voice permission denial, timed-out provider and retry leave UI operable.
- **Review before approval:** draft proposal shows small preview affordance and immediate Decline. Preview shows all customer/items, quantities/prices, currency, terms, actual difference and blockers, no missing values disguised as zero. An approval only becomes available *after explicit review* and never for blocked documents. Verify double-click, stale approval envelope and edit-after-review.
- **Color hierarchy:** black/white/gray chat, navy/blue data header, green validated amounts, restrained gold item subtotal, clear red blockers; no random vibrant colors across messages.
- Financial arithmetic is deterministic (e.g. 12 × $25 = $300; 4 × $45 = $180; subtotal $480), but subtotal must **not** be called a grand total if taxes/shipping/discounts are unknown. No hallucinated currency conversions.
- Non-document suggestions (navigation, product/customer changes) appear as compact inline controls, no half-screen blocking card. Decline has subtle fade exit; under reduced motion it fires immediately with no duplicate callbacks.
- Settings gear opens independent LOUREX AI settings without covering keyboard CTA; separate AI UI language (inherit/ar/en), reply language (auto/ar/en), detail (brief/balanced/detailed), motion (system/reduced), voice text pre-send review. Settings persist across reload and thread changes *in the same account*, and never leak across accounts or modify site locale.
- **RTL/LTR:** Arabic text on the right, proper diacritics and non-reversed monetary IDs; English text on the left. Bilingual generated *documents* use their own document locale, independent of chat/site.
- Keyboard, tab order, touch targets ≥44px, voice/speech permissions, accessibility labels and focus management; Reduce Motion in both system and AI settings.
- PWA idle/reload/offline resumption, eventual server sync, no previous PIN prompt, no loss of business or encrypted legacy records.

## 3. Regressions and no-patch rule

- Inventory all existing AI CSS owners and built `dist` postprocessors; confirm the final applied styles match the **approved** composer/tab/preview design, rather than an older late-stage patch overriding them.
- Preserve original tool permission checks, actor/workspace/branch guard, transaction receipts, mobile file input and voice-bridge owner; avoid new CSS appended to `dist` or extra package dependencies.
- Confirm preview PDF and original documents remain correct and are not replaced by illustrative mock data; verify actual production account and selected customer.
- Check errors with provider unavailable, rate limited, slow/stale promises, invalid partial JSON, empty result, and request cancellation. Show retryable status without “success” if no action executed.

## 4. Release-blocking evidence

The release remains **BLOCKED** if **any** of these are missing: full clean build + typecheck + full tests, screenshot evidence for representative iPhone/iPad/desktop at AR/EN, authenticated tenant-isolation tests, no invalid Advisor writes, real provider request test, and verified preview deployment on the exact SHA.

Once all checks pass, update this file with SHA, timestamp, test run IDs, browser QA evidence and defects resolved. Only then promote stacked PRs in dependency order after explicit acceptance; verify Vercel is deploying the correct merged `main` revision. This checklist is a plan, **not proof** that acceptance has already happened.

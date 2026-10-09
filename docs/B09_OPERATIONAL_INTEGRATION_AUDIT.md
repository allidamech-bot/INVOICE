# Batch 9 — Operational integration release evidence

This is a record of tested code paths, not physical iOS-device coverage or production publication.

## Delivered parts

- Part 9.1 — [PR #647](https://github.com/allidamech-bot/INVOICE/pull/647), merged. Tested partial sales delivery → stock issue → invoice → customer collection; RFQ → partial GRN → supplier invoice matched posting → payable → supplier payment. Blocks duplicate catalog SKU mapping and posting. Full Render Chromium/WebKit release gate: B09-QA-ALL-PASS at ed07e308b8f74b84b0d680ec6c0d026dbcdda222.
- Part 9.2 — [PR #648](https://github.com/allidamech-bot/INVOICE/pull/648), merged. AI customer/supplier approval checks exact workspace, old/new preview, record revision and duplicate identity inside atomic vault mutation. Full Chromium/WebKit release gate: B09P2-QA-ALL-PASS at a95546dc4bee8815bff6d9e5e461842ac410facf.
- Part 9.3 — [PR #649](https://github.com/allidamech-bot/INVOICE/pull/649), merged. Historical inventory snapshots honor requested as-of date for stock, policy events and supplier purchases. Full Chromium/WebKit release gate: B09P3-QA-ALL-PASS at d28b4ac40493784092effb95e3fa1a87034a61da.

## Final closeout scope

- Ignore valid-looking backdated stock movements created after the requested report cutoff when computing both stock balances and issue velocity, avoiding changes to historical stock suggestions from later records.
- Guarantee AI customer/supplier updatedAt revisions advance strictly even for same-millisecond saves or future-dated source revisions; replaying approvals is rejected.
- Add targeted deterministic regression coverage without redesign, new runtime packages or high-impact automatic financial postings.

## Final QA and merge criteria

1. All Git-tracked source files in the isolated Render build context match the repository checkout at the tested HEAD.
2. Run original unmodified full Node 24 release command: node scripts/verify-local.mjs, including security, typecheck, build, contract tests, Chromium and WebKit.
3. The exact final PR head must be associated with explicit B09-FINAL-QA-PASS and B09-FINAL-QA-ALL-PASS markers, with zero failures.
4. Merge only through a mergeable GitHub PR with expected head SHA and unchanged reviewed baseline; never direct-push main.

## Out of scope and caveats

Automated Chromium and WebKit do not constitute physical iPhone/iPad testing. This work does not test production integration providers or publish LOUREX to Vercel. AI remains unable to post payments, stock adjustments and journal entries without protected human actions. Historical records with genuinely missing costs must be reported as incomplete, not estimated. No GitHub Actions, paid runner or new package is required.

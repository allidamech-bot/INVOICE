# LOUREX AI — Batch 7: PIN-free Firebase account history (candidate)

**Date:** 2026-10-12  
**Base:** Batch 6 branch / PR #715; dependency chain #711 → #713 → #714 → #715.  
**Independent blockers:** Voice #709 and Advisor isolation #710 still need integration into a combined release candidate.

## User-facing behavior in this change

- Logged-in users' **text conversation history** is queued for synchronization under `users/{uid}/assistantHistory/{threadId}` in Firestore, separate from financial workspace documents.
- The existing Firestore security rules guard the entire `users/{uid}/...` subtree by `request.auth.uid == userId`. There is no new anonymous read permission or shared URL.
- A cloud refresh can import history on a second device, with an explicit local/syncing/synchronized/pending status visible in the conversation-history pane. A browser `online` event also schedules account-checked reconciliation; there is no continuously active Firestore realtime listener.
- Per-thread transactional writes merge messages by unique ID. Outgoing chat saves publish **only the changed thread document**, avoiding a full collection read on every turn. Full server reads are reserved for workspace refresh and reconnect. Existing message timestamps remain stable across local re-saves; attempting to reuse a deleted thread ID fails visibly.
- Conversation deletion first commits a durable **local tombstone**, then schedules a cloud tombstone. An offline deletion remains locally protected from a subsequent cloud pull; future sync retries the tombstone.
- The modern history pane offers a compact two-step delete confirmation. The old lifecycle now searches the entire scoped local list to open older synced conversations, not merely the ten shown in its legacy menu.

## Explicit security and data boundaries

- The per-device IndexedDB AES-GCM history cache remains local. **Its CryptoKey/ciphertext is not uploaded.**
- Firestore stores account-protected **plaintext** messages and metadata (thread ID, scope, company, branch, mode, title, summary, timestamps). This is not end-to-end encryption; confidentiality relies on Firebase Auth, Firestore UID rules, TLS, platform security and account controls.
- A matching message ID with conflicting message text is treated as a synchronization conflict, not resolved by silently accepting one device's text. The UI also distinguishes a successful **upload** from a complete two-way history refresh.
- Cloud documents **never contain** `kernel`, executable proposals, working draft artifacts, approval receipts, mission state, financial vaults or the PIN-era encrypted cache.
- Downloaded threads receive a minimal safe kernel without pending actions. A conflicting Controller/Advisor mode is downgraded to Advisor. When remote messages differ from the current local copy, old local executable drafts/approvals are also discarded even if the modes agree.
- Malformed UID, mismatched account, changed workspace/branch, corrupt document, invalid Firestore format or unknown network state cause failure rather than a silent overwrite.
- Local writes always happen before outgoing cloud publication. During a pull, local kernel saves are serialized so cloud does not overwrite in-flight local state. After a remote transaction commits, the authoritative version is re-fetched before installing local changes.
- A local failure leaves cloud data intact; a cloud failure leaves local ciphertext intact. The UI must not claim synchronized history until the network path succeeds.

## Existing limitations deliberately retained (not called complete)

- Local cache still limits history to **30 threads** and **60 messages per thread**. The cloud transport rejects a 31st distinct incoming thread, a 61st distinct merged message, or an overlong imported message with a visible error rather than silently dropping records. A 200-document query limit remains; paging beyond 200 documents is not implemented. Do **not** claim unlimited history or full synchronization while a retention-limit error is present.
- Attachments, voice media, exact business proposals, generated files, draft line-edit state and AI context execution receipts are **not** portable conversation history. Only text and safe metadata can be recovered.
- Rename, structured server-side search, history archival and bulk deletion are not part of this patch.
- The code does not deploy or change Firestore security rules; verify that the existing deployed rules match the reviewed UID rule and that collection creation is permitted on Production.
- Multi-device concurrent edits with deletions require real Firestore emulator testing before release.

## Tests authored

`tests/ai-batch7-cloud-history.test.mjs` covers:
1. two-device message union;
2. deletion tombstones preventing resurrection;
3. cloud-only thread restore with no executable artifacts;
4. mode-conflict downgrade;
5. wrong account and wrong company rejection;
6. zero approvals/ciphertext in the cloud schema, UID checks and transactions;
7. limits on cloud query/document sizes.

**Actually executed:** 16/16 cross-batch source/formatter checks for Batches 3–6 passed, and 6/6 isolated behavior checks executed directly against a JavaScript-adapted extract of the current cloud merge code. These are not full compiled Node tests. The 14 authored cloud-history Node tests still need execution after build.  
**Not executed here:** TypeScript compiler, production build, full Node tests, Firebase emulator with two real browsers, iPhone Safari, or authenticated cloud traffic. The container cannot resolve github.com; GitHub shows no workflow runs on preceding PRs.

## Required acceptance matrix before merge

1. Clean checkout: `npm ci`, `npm run typecheck`, `npm run build`, full Node suite, and `node --test tests/ai-batch7-cloud-history.test.mjs`.
2. Firebase emulator using two independent browser profiles for the **same UID**: create on A, open on B, append separate replies, reconcile, verify both preserved.
3. Different UID: user B cannot read or list user A's `assistantHistory`; account switch during Firestore get/transaction must abort without showing or publishing old messages.
4. Separate company/branch: change scope, create thread, switch, verify no cross-company leakage even for similar thread names.
5. Offline: save and delete locally; resume network; cloud status stays pending until acknowledged and deletion does not resurrect.
6. Change Controller/Advisor and switch threads while sync is in flight; no stale approval or executable mission is reactivated.
7. Concurrent timestamps, 60+ messages, 30+ threads, corrupt Firestore docs, document near size cap, 200+ remote docs: safe visible error/no silent losses. Expand bounded retention only after a separate product decision.
8. iPhone Safari PWA plus desktop: verify search, open, delete, keyboard, background/foreground reconnect, cross-device updates and microhone independent state.
9. Review privacy disclosures before production release: Firestore history is account-private but not end-to-end encrypted; obtain product approval of retention and data export behavior.

**Release decision: DRAFT / NO-GO until end-to-end verification. No merge, production deploy or paid GitHub Actions.**

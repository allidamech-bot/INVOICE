# R07N — Offline UI Preview, Interruption Recovery and Access-Security Evidence

Reference date: 2026-10-31. Starting main: `e58d939a7a111d1c9e1be0ac74d3e94ce85c13bc`.

## Execution authority and scope

The experiment deliberately remains **UNMOUNTED**: R06 UI, R07M Controller, R07N preview session and R07N workspace wrapper all remain false/disabled. This PR adds **no** public HTTP route, production UI import, client Firebase Admin code, provider calls, paid API requests, Cloud Firestore rule changes or financial writes. It does not activate production or copy real customer data.

`R07NPreviewSession` adapts a strictly typed **authenticated server port** (`accept`, `current`, `history`) to the existing R06 conversation view without importing a browser Firebase client, server token or secret. The host must implement this port server-side using the previously verified R07M JWT + exact membership boundary; an arbitrary caller-controlled port is not authorization evidence.

The ordinary UI send is confirmed **only** after `accept` returns a complete local turn and a separate re-authorized `current` lookup agrees on turn ID/task ID, completed status, assistant reply, revision and zero financial writes/provider calls. A user text with source attachments is rejected rather than silently implying parsed/verified sources. R07N maps only the current known user/assistant messages from R07L, never fabricates earlier conversation history; full R03-audited history loads only on an explicit older-history request. `R07NOfflinePreviewWorkspace` statically wires `onSend` and `onLoadOlder` to the session. All unsupported file, editor, task cancellation/retry and review/approval callbacks fail rather than simulate successful operations. R06 remains separately disabled.

A network disconnect **after** the server commits but **before** receiving acknowledgement retains the identical immutable request payload/ids, not a new idempotency key. No automatic retries, hidden provider attempts, retry-after-abort claim, or automatic persistence of bearer tokens. An explicit `unresolvedForManualRecovery()` export and `restoreUnresolved()` import can recover an uncertain in-memory UI session; it is not durable local-storage recovery unless a future approved host safely persists the exact record. Changing input while unresolved is rejected; user text is never discarded on uncertain send. Abort is not proof that a committed transaction was cancelled.

## Recovery and security tests

- Synthetic exact-scope R06 mapping rejects forged server-view scope, malformed completion and false financial authority.
- Authenticated port revocation prevents replay/current/history and cannot be bypassed with a browser-supplied role.
- A committed operation with a lost network acknowledgement is resumed with the original idempotency key, without a second turn, draft or provider.
- Two independent *local* official Firebase Firestore Emulator processes seed a task that failed in draft storage after durable event progress, export state, stop, restart with import, and recover using the R07N adapter over R07M + R07D. Full R03 event audit confirms one turn, and immutable request index corruption is rejected. This is a local emulator test, **not cloud disaster recovery**.

## Explicitly OPEN

Real Firebase production IAM/security rules and provisioning, decrypted exports/backup retention, malicious privileged writer protection (SHA-256 is not an HMAC), authorized production API, front-end mount, Safari physical-device two-device UX, provider routing, Arabic natural-language semantic coverage, uploads, financial approvals, cost/latency measurement and full T01–T24 completion gates. No public exposure or production deployment is authorized. Green CI proves only the specified isolated behavior.

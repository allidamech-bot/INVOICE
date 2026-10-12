# LOUREX AI — Batch 1: Voice ownership and restart reliability

Scope: AI conversation and AI workflow quick-microphone only. No site-wide visual changes, Firebase changes, financial mutations, or deployment.

## Findings and change

- The conversation composer had a Safari-native release grace and bounded start retry; the workflow quick-mic had a separate lifecycle that could abort immediately and try to reclaim the same native speech engine.
- The two entry points now use synchronous request/handoff events:
  - `lourex-ai-workflow-voice-request`: the composer relinquishes ownership and advertises the native release deadline.
  - `lourex-ai-composer-voice-request`: the workflow relinquishes ownership, including any pending retry or post-completion release lease.
- The workflow now preserves a 1600ms release lease, cancels pending retry timers on stop/unmount, rejects stale callbacks by generation, retries recognized transient start failures at most six times, and reports permission, capture, and unsupported-browser failures explicitly.
- Composer handoff also clears the mic's stale pressed/listening state. A built-output behavioral regression simulates both owner transitions and native lease expiry; it is designed to run after a full build.
- A distinct localized "Starting…" state indicates a queued native microphone release. Transcribed text remains editable; microphone capture never automatically submits a message.
- The production composer runtime identity advances to `ios-release-v3-cross-owner`; the existing final-runtime hash stage should keep the service-worker and HTML URL aligned.

## Verification performed (source-level only)

- Parsed the modified iOS build postprocessor, the existing browser fixture, and the generated handoff JavaScript in a read/write-in-memory simulation of the existing conversation owner followed by the iOS patch.
- Six source-contract assertions passed in an isolated JS runner (three new cross-owner checks and three existing iOS owner checks).
- These checks are **not** an npm build, a TypeScript typecheck, or actual native Safari microphone verification.
- The updated Playwright synthetic recognizer fixture now exercises a workflow-initiated abort and subsequent successful composer restart. **The fixture has not been executed here.**

## Required gate before merge / live publication

1. On a clean checkout: `npm ci`, `npm run typecheck`, `npm run build`, the repository's complete Node test suite, then `node tests/visual/run-ai-voice-reliability-batch5.cjs` against the preview server.
2. On **physical iPhone Safari** and iPad Safari: at least 15 consecutive successful voice attempts; include first/second recordings, quick stop/start, natural speech finish, no speech, permission denied/retry, tab/modal close and reopen.
3. Transition between both AI voice entry points in both directions; ensure no overlapping native sessions, missing transcript, stale "Starting…" indicator, or automatic send.
4. Confirm a distinct error state and reliable retry when Safari or its native speech service is unavailable.
5. Confirm compiled JS and TypeScript output, PWA cache version, and authenticated Preview before any production acceptance.
6. If successful native repeated speech cannot be demonstrated, keep release **NO-GO** and investigate Safari service behavior or an explicitly approved recording/transcription fallback. Do not claim success from mocks.

Result: implementation proposed on an isolated branch; **production unchanged**.

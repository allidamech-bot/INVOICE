# LOUREX AI — Batch 3: Conversation history visibility and scoped restoration

Scope: AI conversation shell and AI-only styling/tests. No company accounting data, Firebase auth, business backup, or document changes.

## Verified code defect
The new AI workspace filters the legacy `lourex-ai-context` subtree from its visible panel, while the old conversation-history list was rendered in that subtree. The legacy overflow "Conversations" action could change its internal state without producing a visible history panel.

## Changes in this branch
- New visible `AiConversationHistory` view inside the AI workspace; dedicated history icon in the header and re-routing the old overflow "Conversations" command.
- Search by conversation title; compact, accessible touch-targeted list with Controller/Advisor labels and active-thread indication.
- Open a known current-company/thread ID via the existing authenticated, scoped thread loader. Check the requested thread ID actually loaded before closing the panel.
- Create a new thread using the existing owner and preserve Advisor mode when starting from Advisor; confirm a new ID before declaring success.
- Make history, settings, artifact pane and lifecycle changes mutually exclusive. Scope/thread changes clear history UI state.
- History list is built exclusively from `host.__businessThreads` already filtered during encrypted state hydration by active account, workspace and branch. No cross-company records or store mutations were added.
- CSS confined to the AI panel, with scrollable rows, keyboard focus, sensible minimum touch targets and 16px search font.

## Deliberate limitations / next acceptance gates
- **This does not solve cloud sync:** Assistant history is still stored in the local encrypted `assistant-state` IndexedDB cache, not demonstrated to sync between devices. The current storage contracts retain a bounded 30 threads and 60 messages per thread, with a 4000-character message cap.
- Search currently matches locally displayed thread titles only. Rename, archive/delete UX and durable cross-device history remain to be planned and implemented safely; never claim they are complete.
- **No interactive browser run:** independent source-level assertions 4/4 passed; TypeScript compilation, full build, browser and Safari/keyboard testing still required. Production unchanged.
- Before merging: run `npm ci && npm run typecheck && npm run build`, all Node tests, and authenticated UI on Safari/Chromium. Confirm header button and overflow menu both open the history, search and open work after account changes, and the Advisor/new-conversation transition cannot leak proposals or mode.
- Maintain **Draft / NO-GO** until integrated QA and cross-device storage policy are confirmed.

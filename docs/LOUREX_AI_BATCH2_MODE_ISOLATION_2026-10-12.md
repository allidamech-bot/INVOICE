# LOUREX AI — Batch 2: Controller / Advisor isolation and conversational recovery

Scope: AI conversation orchestration, tool authorization, and AI API mode sanitation only. Existing LOUREX accounting and other site UI remain unchanged.

## User-facing contract
- **Controller (المتحكم)** may propose and, after separate account/role/scope validation and visible approval, perform a bounded business operation. This patch does not grant any additional permissions.
- **Advisor (المستشار)** discusses business decisions, evaluates hypothetical actions, compares supplier options, and explains evidence and missing data. Advisor never prepares or executes a mutation, navigates, schedules a task, or creates an approval proposal. It should not answer a hypothetical with the technical failure copy from Controller's execution planner.
- Advisor retains read and calculation tools, including deterministic financial summaries and exact scoped supplier/product facts when already supported by the corresponding tools.

## Root cause and changes
1. The local deterministic planner could classify Advisor imperatives as navigation or write commands. The read-only executor blocked them, but a tool failure/no-op often replaced a useful conversational answer. Advisor now routes attempted mutation or navigation back to the ordinary conversational answer path rather than building a proposal or showing a controller-specific planning failure.
2. Explicit action language without a deterministic read/calculation plan now bypasses the tool-plan endpoint **only in Advisor**. Controller retains fail-visible planning errors instead of falsely claiming an operation succeeded.
3. Legacy memory/task shortcuts with action proposals return to Advisor conversation; proposals cannot leak into Advisor.
4. Client capability checks normalize malformed/obsolete modes to Advisor. Tool runtimes still explicitly default to Controller only when the mode field is entirely absent for legacy internal callers; any supplied invalid value becomes Advisor. Direct tool execution also normalizes its mode.
5. The AI Core and Advisor V2 API sanitizers now accept Controller **only** when `conversationMode === 'controller'`; missing/invalid values are read-only Advisor. Core strips executable and navigation capabilities from its Advisor context.
6. Server instructions encourage detailed discussion of a proposed business decision while prohibiting claims of execution.

## Verification reality
- Source-level checks performed against branch code: 18 business-mode/server sanitization cases plus 2 client/source guards passed, after correcting an isolated checker that did not parse multiline test imports. Existing test files were extended to verify malformed-mode fallback and Advisor conversational routing.
- Complete repo TypeScript typecheck, build, Node suite, integrated browsers, authenticated AI providers, and Safari device tests **not executed** in the current environment (GitHub clone DNS resolution unavailable and Vercel access denied).

## Acceptance before merge
- Run `npm ci && npm run typecheck && npm run build` in a clean checkout, then the repository's full Node test suite.
- Logged-in mobile/desktop: Controller prepares a supplier and a quotation with explicit preview/approval only; Advisor asks to add/change/open the same items and instead gets clear, useful advice with no proposal, navigation or data mutation.
- Attempt crafted model output `document.createDraft`, `tool.execute`, `navigation.open`, mixed read/write plans, malformed mode values, stale threads and rapid mode switching. Verify denial and account/branch/thread isolation.
- Verify Advisor can still read financial data and calculate only from permitted evidence and does not invent missing prices or mix currencies.
- Keep PR Draft / NO-GO until these steps are evidenced. No deployment or release change has been performed.

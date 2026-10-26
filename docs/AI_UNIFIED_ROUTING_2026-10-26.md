# LOUREX AI — unified routing roadmap, 2026-10-26

Owner direction: retain Groq, restore free provider options, use one eligible pool instead of vendor jobs. No assistant live probes; owner performs live acceptance. Production was verified READY at7536bec before this work. The owner reproduced provider-unavailable with Groq alone; root cause of that production failure remains unidentified.

## This change

- Restore pre-removal adapters, owner-only diagnostics, free/privacy gates and file capability handling from1e885c7. Mistral remains absent. Kilo remains synthetic diagnostics only, not a runtime vendor; its pinned model was unavailable in both previous trials.
- Replace hardcoded task routes with a capability-filtered pool and existing private-data approval boundaries. Groq is retained. Private business text/vision remain limited to previously approved Groq/Cloudflare model sets. Gemini, OpenRouter and Ollama are not silently promoted to private company data. All eligible models may serve either conversation mode; images/documents still require matching capabilities and complete image counts.
- Rank by recent actual validated outcomes and latency, with at least three observations before learned ranking takes effect. Low-confidence/invalid output does not earn success priority. This validates contracts/grounding callbacks, not all factual or financial reasoning.
- Try a different vendor before another model from the same account; advance to available alternate immediately after transient errors, without duplicate same-provider retry first. Existing total route budgets, upstream abort race and whole-turn shared budget remain authoritative.
- Keep temporary quarantine and quota cooldown, no permanent deletion from a single failure.
- Record zero-candidate failures with total timing and eligible/available counts, without prompts, outputs or credentials.
- Adaptive state is per warm function instance and expires after five minutes. It is not a global durable leaderboard. No new database, package or general sync changes.

## Next acceptance gates

1. CI with mocked network only; preserve source completeness, missing prices, unit and approval guards. No assistant live calls or file extraction.
2. Owner publishes and tests real Controller messages; record exact owner-visible request/attempt metadata before attributing failure to a vendor.
3. Improve owner diagnostics to show exact eligibility exclusion reasons (credential, free verification, privacy, modality, cooldown) and failed-turn stages if current counts are insufficient.
4. Expand private-provider approval only from evidence of Controller/schema/file correctness and explicit data policy, never from a successful button test or a present key. Earlier financial QA: Gemini2/5, Cloudflare one4/5, OpenRouter one timeout; restoration does not erase those failures.
5. Consider durable cross-instance ranking only if real request traces establish need; not part of this limited change.

No financial writes or accounting, inventory, auth, Vault, general sync, print/PDF engine modifications. A provider restoration is not production acceptance or proof that hanging is fixed.

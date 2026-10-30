# R07P/R07Q — Routed Semantic Inference Seam (offline, disabled)

Reference: October 31, 2026. Supplemental integration for the existing R07P and R07Q packages. No production configuration or financial changes.

## Engineering work

- R07P now accepts a separately injected server-only routed interpreter behind an OFF-by-default opt-in. Existing deterministic local commands remain zero-provider calls. The synthetic benchmark path remains available **only for explicit test injection**. Enabling both interpreters simultaneously fails closed.
- R07QTrustedSemanticGateway reuses the existing R05 approved-free registry and bounded routing, including current quota, required structured-output capability, explicit zero-cost per-model proof and privacy approval. There is no provider SDK or HTTP route in this addition.
- A separate server-owned business-data consent check is required before even loading candidate metadata. No consent means zero discovery and zero inference calls.
- Reference IDs are converted into short per-request opaque handles before preparing the semantic provider payload. Unknown, mismatched or hallucinated handles never resolve to canonical company/document/line/customer IDs.
- Every provider result is parsed against the R07P strict candidate contract, and only the server can resolve its references. R05 bounded invalid-output fallback may attempt another verified free, privacy-eligible model within the shared deadline.
- A routed result remains an untrusted **nonexecutable proposal**, with no financial writer, approval receipt, draft write, or persisted task journal. R07R bridge remains intentionally synthetic-only.

## Test limitations

- Tests use offline mocked R05 transports and seeded synthetic models. No live Gemini/Groq/OpenRouter/Cloudflare/Ollama inference, current quota check, provider latency benchmark or real language accuracy measured.
- Passing tests means proper privacy, reference and output shape guard behavior, **not** verified conversation intelligence or production reliability.
- Must inspect final SHA GitHub Actions on the PR: typecheck, gateway security tests, R05/R07P/R07R regressions and production bundle isolation.

## Release blockers

No production mounting or server IAM verification. Real account-specific zero-cost and private data authorization remains external; real multi-turn R07M task-event orchestration, trusted historical context reader, live secure source readers, provider performance, physical iPhone Safari and T22/T23/T24 remain OPEN. No claim of deployed or accepted AI Next system.

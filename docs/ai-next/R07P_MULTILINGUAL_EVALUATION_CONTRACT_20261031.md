# R07P Multilingual Evaluation Contract — Offline Candidate

Date: 2026-10-31
Program: Conversation Rebuild Plan / LOUREX AI Next
Scope: AI Next only, not finance or production activation.

## Purpose

A reproducible evaluation interface and 43 manually labelled prompts were added
as a foundation for future Arabic, Levantine, English and mixed-language
model quality checks. Examples include correction, negation, Arabic numeral
normalization, incomplete requests, inferred references, currency, quantities,
unit price, source reading, approval and financial execution. The corpus is
synthetic and contains no customer/business records.

The independent scorer accepts separately collected *structured model
predictions*. It verifies the existing R07P structured candidate contract and
compares action, reference, explicit subject, facts, missing fields and source
IDs. It tracks raw coverage and schema validity as well as exact-match
accuracy. Its denominators include missing predictions, preventing a
one-success-result sample from claiming 100% overall accuracy.

A special safety metric counts unexpected `execute_approved` predictions
on inputs where the independent gold label did NOT request financial execution.
Unverified model self-confidence claims and extra keys fail the strict
structured-candidate parser.

## Important evidence limitation

These tests validate the scoring code and the presence/format of manually
labelled prompts. They are **not** model accuracy tests. The test runner
intentionally includes some manually constructed predictions to assert
measurement properties and deliberately wrong ones to verify failure
detection. Such synthetic fixtures must NOT be reported as observed natural
language understanding quality.

The evaluator uses no provider tokens, no live inference, no customer
data, no Firebase services and no financial writers.

Before declaring any language model acceptable, arrange a separately
approved, private, verified-zero-cost (or explicitly budget-approved)
evaluation run that produces actual candidate outputs without deriving
predictions from the gold labels, scores this complete corpus, and reports
confusion/failure cases and latency. Do not enable paid models or send
real private business data.

## Status

IMPLEMENTED as inactive evaluation infrastructure, TESTED only if exact
PR-head CI completes successfully. QA ACCEPTED, actual semantic accuracy,
production routed inference and production release are all OPEN.

T22, T23, T24, physical iPhone Safari and live Firebase IAM/rules remain OPEN.
No finance code, production flags, credentials or deployed settings changed.

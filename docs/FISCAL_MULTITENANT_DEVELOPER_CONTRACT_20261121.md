# LOUREX multi-tenant ZATCA developer test contract (2026-11-21)

LOUREX is a **software service provider**, not the taxable seller. Each customer
company is the taxpayer and must eventually onboard its own EGS unit and
credential(s); no LOUREX shared taxpayer certificate is allowed.

## What this isolated code gate actually proves

- Two independent **synthetic** customer workspaces and EGS scopes complete the
  mock transport sequence: Compliance CSID → six ordered compliance response
  checks → operational CSID → standard clearance and simplified reporting.
- The protocol client keeps the two compliance and operational credentials
  distinct; cross-company/EGS credential use fails before any HTTP request.
- Simulation transport rejects an explicitly production-scoped EGS.
- The existing developer-portal CSR CLI is exercised with **--csr-only**;
  OpenSSL checks the ephemeral secp256k1 CSR, with no network request or
  protected taxpayer material.
- The test's fake authority responses do **not** represent a real response by
  ZATCA and their XML bodies are deliberately **not official SDK-validated**.
  The previous separate synthetic SoftHSM + SDK4 component tests remain
  evidence of cryptographic component behavior, not authority acceptance.

## Environment boundaries

| Environment | Identity | Purpose | Status |
| --- | --- | --- | --- |
| Local mock transport | synthetic tenants only | contract and isolation regression | automated offline tests |
| Developer Portal | synthetic developer CSR and fixed developer OTP | optional live non-taxpayer transport diagnostic | available via explicit `--live-developer-sandbox` on a suitably configured operator host; CI **never runs it** |
| ZATCA Simulation | taxpayer-issued simulation OTP and properly authorized EGS | authentic authority onboarding/clearance/reporting acceptance | **NOT VERIFIED** |
| Production | taxpayer-issued production OTP and separately trusted signing service | live customer fiscal issuance | **DISABLED** |

Official Developer Portal materials say the Integration Sandbox supports software
developers; it is separate from taxpayer Simulation and Production.
See https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/DEVELOPER-PORTAL-MANUAL.pdf .

## AWS status / remaining prerequisites

On the existing EC2 the owner confirmed the main-pinned code-only release
installed, both fiscal units inactive, and readiness audit HOLD:
`qaOnlyScopes: BLOCKED` and `pinnedSimulationProfile: BLOCKED`.
Both `/etc/lourex-staging/worker.json` and
`/etc/lourex-staging/trusted-runtime-profile.json` were confirmed MISSING.
Do **not** invent a Saudi seller, an official ZATCA root CA/CRL, an approved
taxpayer OTP or a verification receipt to make these gates pass.

The next operational gate is to independently provision and review official
Simulation trust and an authorized synthetic-only QA EGS, then verify
complete remote authority acceptance. The existing AWS/Google QA data-plane
read and production denial already passed; do not repeat them needlessly.

No network calls, infrastructure changes, real issuance, taxpayer onboarding
or secret material are introduced by these tests.

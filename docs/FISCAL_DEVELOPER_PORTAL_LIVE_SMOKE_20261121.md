# LOUREX Developer Portal synthetic live smoke evidence

This PR adds a **single narrow GitHub PR smoke** for the *Developer Portal Integration Sandbox*, using the pre-existing `scripts/fiscal/developer-sandbox.mjs` script.

**Allowed behavior:** ephemeral synthetic CSR + local UBL, test Compliance CSID and test Operational CSID, test standard clearance. Each request is restricted to `https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/` and explicitly uses the developer-sandbox fixed test OTP `123345`. Status logs contain response codes/states only; no CSID, certificate, secrets, CSR or full invoice are logged. The runner receives no AWS or production application credentials. No customer workspace, ZATCA Simulation taxpayer identity, live invoice or production deploy is used.

**Not proved:** real official ZATCA Simulation enrollment, Saudi taxpayer authorization, true Production CSID, SDK4 certificate validation, simplified reporting, signing, EC2 worker readiness, or customer fiscal issuance. The existing mock transport and UBL tests cover separate concerns; a positive developer sandbox test must not be mislabeled as any of these.

The workflow is triggered by changing its own file on this PR; do not enable it on general push, deployment or customer events. After evidence is recorded, review whether to retain it as a manual-only operator workflow.

## Verified remote result — 21 November 2026

Source: GitHub Actions **LOUREX ZATCA Developer Portal Synthetic Smoke (One-shot)** run
[44928164013](https://github.com/allidamech-bot/INVOICE/actions/runs/44928164013),
job `136918727481`, tested branch SHA `36f229b0903021bca12783c8b703b788c3f4c344`.
The test **completed successfully** and returned the following sanitized evidence:

- Local OpenSSL ephemeral synthetic CSR: `CSR: PASS`.
- LOUREX-generated synthetic standard UBL XML and canonical invoice digest: created, **NOT** official SDK proof.
- Developer Portal `/compliance`: HTTP **200**, `dispositionMessage=ISSUED`, no error codes returned.
- Developer Portal `/production/csids`: HTTP **200**, `dispositionMessage=ISSUED`, no error codes returned. This is a **test operational CSID**, not a taxpayer Production CSID.
- Developer Portal `/invoices/clearance/single`: HTTP **202**, `clearanceStatus=CLEARED`, validation `WARNING`, `warningCount=1`, no error codes returned.
- `DEVELOPER SANDBOX TRANSPORT POSITIVE — test response only.`

The warning's specific code was not logged; it **must not be treated as absent or harmless**. The existing developer smoke does not verify a returned cleared XML against the issued signed invoice, and does not validate any signed QR or simplified reporting. Those remain separate acceptance gates.

This exercise proves direct transport to the developer sandbox; it does not prove production issuance, the taxpayer Simulation portal, trusted KMS/HSM, SDK4 signing or multi-tenant live CSID onboarding. The AWS readiness audit still shows `worker.json` and `trusted-runtime-profile.json` missing.

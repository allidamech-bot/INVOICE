# LOUREX Developer Portal synthetic live smoke evidence

This PR adds a **single narrow GitHub PR smoke** for the *Developer Portal Integration Sandbox*, using the pre-existing `scripts/fiscal/developer-sandbox.mjs` script.

**Allowed behavior:** ephemeral synthetic CSR + local UBL, test Compliance CSID and test Operational CSID, test standard clearance. Each request is restricted to `https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/` and explicitly uses the developer-sandbox fixed test OTP `123345`. Status logs contain response codes/states only; no CSID, certificate, secrets, CSR or full invoice are logged. The runner receives no AWS or production application credentials. No customer workspace, ZATCA Simulation taxpayer identity, live invoice or production deploy is used.

**Not proved:** real official ZATCA Simulation enrollment, Saudi taxpayer authorization, true Production CSID, SDK4 certificate validation, simplified reporting, signing, EC2 worker readiness, or customer fiscal issuance. The existing mock transport and UBL tests cover separate concerns; a positive developer sandbox test must not be mislabeled as any of these.

The workflow is triggered by changing its own file on this PR; do not enable it on general push, deployment or customer events. After evidence is recorded, review whether to retain it as a manual-only operator workflow.

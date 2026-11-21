# LOUREX — Developer Portal returned cleared XML strict comparison (21 Nov 2026)

## Real remote observation

Direct GitHub Actions synthetic-only test [44929217728](https://github.com/allidamech-bot/INVOICE/actions/runs/44929217728) on candidate commit `156e415129963a6a9e8a1d501f6d7c9ad4355928`:

- Synthetic CSR generated and verified by local OpenSSL.
- Developer Portal test Compliance CSID: HTTP 200, ISSUED.
- Developer Portal test operational CSID: HTTP 200, ISSUED.
- Developer Portal standard invoice clearance: HTTP 202, CLEARED, validation WARNING; code `BR-KSA-F-13` (invalid other seller/buyer ID; synthetic CRN data used). No error codes returned.
- `verify-cleared-artifact`: `DEVELOPER_CLEARED_ONLY_EXCLUDED_ROOT_NS_DIFFERS`. The original and returned ZATCA-C14N11 node sets have identical business content once **exactly one** additional root declaration `xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"` is excluded. No broad XML normalization occurs.

Earlier live diagnostics on 44929047947 show:
`sentLength=4228`, `returnedLength=4313`, a difference of exactly **85 bytes** (the extension root declaration); `sentElementCount=178`, `returnedElementCount=178`, element-name sequences equal, and first byte difference inside the root element's namespace declarations.

## Security claim and limitations

- The verifier requires that the **SHA-256 of the original canonical invoice matches the request `invoiceHash`**.
- The returned invoice must either match that canonical byte stream and digest *exactly*, or differ **only by the literal additional excluded `xmlns:ext` declaration on the root `Invoice` element**. Malformed XML, a changed seller/tax/quantity/UUID, an additional namespace, incorrect root URI, noncanonical Base64, bad status, or nonempty ZATCA error list fails closed.
- The fallback is explicitly restricted to the **Developer Portal test runner**. It is not a replacement for the official SDK4 transform, signed XML validation, PKIX, or real issuer authorization. The separately implemented production invoice/clearance verifier is unchanged.
- Warning `BR-KSA-F-13` is **not resolved** for the deliberately synthetic commercial registration values, and the response is accepted with a warning, not proof of full compliance.
- The test does NOT cover simplified reporting, offline HSM recovery, actual ZATCA Simulation or Production CSID, taxpayer credentials, multi-tenant live enrollment, audit receipts or live Saudi issuance.

AWS fiscal systemd units remain inactive and tenant QA worker/trust files still missing on EC2. No real taxpayer, data, AWS IAM, billing, platform deploy, OTP or ZATCA production path were touched.

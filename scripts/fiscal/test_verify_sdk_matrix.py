import unittest
from verify_sdk_matrix import TYPES, invoice_identity, parse_sdk_result

VERSION = "3.4.3"
def log(kind):
    stages = ["XSD", "EN", "KSA", "PIH"]
    if kind.startswith("simplified-"):
        stages += ["QR", "SIGNATURE"]
    return ("Welcome to ZATCA E-Invoice Java SDK " + VERSION + "\n" +
            "\n".join(f"[INFO] ValidationProcessorImpl - [{s}] validation result : PASSED" for s in stages) +
            "\n[INFO] InvoiceValidationService - *** GLOBAL VALIDATION RESULT = PASSED\n").encode()

class MatrixTest(unittest.TestCase):
    def test_all_six_types_and_required_stage_sets(self):
        for kind,(prefix,code) in TYPES.items():
            xml = (f'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:UUID>11111111-1111-4111-8111-111111111111</cbc:UUID><cbc:InvoiceTypeCode name="{prefix}00000">{code}</cbc:InvoiceTypeCode></Invoice>').encode()
            self.assertEqual(invoice_identity(xml, kind), "11111111-1111-4111-8111-111111111111")
            self.assertIn("KSA", parse_sdk_result(log(kind), b"", 0, VERSION, kind))
            for other in TYPES:
                if other != kind:
                    with self.assertRaises(ValueError): invoice_identity(xml, other)
    def test_reject_partial_global_pass_or_conflicting_output(self):
        kind = "simplified-credit"
        good = log(kind)
        for bad in [
            good.replace(b"[QR] validation result : PASSED", b""),
            good.replace(b"[SIGNATURE] validation result : PASSED", b""),
            good.replace(b"[PIH] validation result : PASSED", b"[PIH] validation result : FAILED"),
            good + b"GLOBAL VALIDATION RESULT = FAILED",
            good + b"[ERROR] signature error",
            good + b"[WARN] ambiguous result",
            good + b"[XSD] validation result : PASSED",
            good.replace(b"3.4.3", b"3.3.6"),
            b"GLOBAL VALIDATION RESULT = PASSED",
        ]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                parse_sdk_result(bad,b"",0,VERSION,kind)
        with self.assertRaises(ValueError): parse_sdk_result(good,b"",1,VERSION,kind)

if __name__ == "__main__":
    unittest.main()

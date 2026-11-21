"""Offline statutory PDF/A-3 packaging; never marks a document issued.

The PDF must already be rendered from the verified XML by a trusted renderer.
This tool preserves that render and attaches exact original XML bytes. PAdES
B-B and actual authority acceptance are separate release requirements.
"""
import hashlib
import io
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from contextlib import closing
from pathlib import Path

import cv2
import pypdfium2 as pdfium
import numpy as np
from defusedxml import ElementTree
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, ByteStringObject, NameObject, NumberObject, TextStringObject

MAX_PDF = 32 * 1024 * 1024
MAX_XML = 512 * 1024
MAX_PAGES = 20
UBL = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\Z")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def one(node, ns, name):
    entries = node.findall(f"{{{ns}}}{name}")
    if len(entries) != 1:
        raise ValueError("AMBIGUOUS_XML_FIELD")
    return entries[0]


def invoice_identity(xml):
    if not isinstance(xml, bytes) or not 1 <= len(xml) <= MAX_XML:
        raise ValueError("INVALID_XML_SIZE")
    root = ElementTree.fromstring(xml, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    if root.tag != f"{{{UBL}}}Invoice":
        raise ValueError("INVALID_XML_ROOT")
    uuid = one(root, CBC, "UUID").text
    code = one(root, CBC, "InvoiceTypeCode")
    subtype = code.attrib.get("name", "")
    if not isinstance(uuid, str) or not UUID.fullmatch(uuid) or code.text not in {"388", "381", "383", "386"} or not re.fullmatch(r"0[12][01]{5}", subtype):
        raise ValueError("INVALID_XML_IDENTITY")
    refs = [r for r in root.findall(f"{{{CAC}}}AdditionalDocumentReference") if any(e.text == "QR" for e in r.findall(f"{{{CBC}}}ID"))]
    if len(refs) != 1 or one(refs[0], CBC, "ID").text != "QR":
        raise ValueError("MISSING_OR_DUPLICATE_QR")
    qr = one(one(refs[0], CAC, "Attachment"), CBC, "EmbeddedDocumentBinaryObject").text
    if not isinstance(qr, str) or not 1 <= len(qr) <= 700 or not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", qr):
        raise ValueError("INVALID_XML_QR")
    return uuid, "standard" if subtype.startswith("01") else "simplified", qr


def checked_reader(pdf):
    if not isinstance(pdf, bytes) or not 1 <= len(pdf) <= MAX_PDF:
        raise ValueError("INVALID_PDF_SIZE")
    reader = PdfReader(io.BytesIO(pdf), strict=True)
    if reader.is_encrypted or not 1 <= len(reader.pages) <= MAX_PAGES:
        raise ValueError("UNSUPPORTED_PDF")
    root = reader.trailer["/Root"]
    if any(k in root for k in ("/AcroForm", "/OpenAction", "/AA", "/Collection")):
        raise ValueError("INTERACTIVE_OR_SIGNED_PDF")
    for page in reader.pages:
        if "/AA" in page or "/Annots" in page:
            raise ValueError("INTERACTIVE_OR_SIGNED_PDF")
    return reader


def embed_invoice(pdf, xml, uuid, at):
    """Structural operation only; callers must use package_candidate for gates."""
    reader = checked_reader(pdf)
    root = reader.trailer["/Root"]
    if "/AF" in root or ("/Names" in root and "/EmbeddedFiles" in root["/Names"]):
        raise ValueError("EXISTING_ATTACHMENT")
    if invoice_identity(xml)[0] != uuid:
        raise ValueError("XML_UUID_MISMATCH")
    if at.tzinfo is None or at.utcoffset() != timezone.utc.utcoffset(at):
        raise ValueError("UTC_TIMESTAMP_REQUIRED")
    writer = PdfWriter(clone_from=reader)
    name = uuid + ".xml"
    attachment = writer.add_attachment(name, xml)
    attachment.description = TextStringObject("Original statutory invoice XML")
    attachment.subtype = NameObject("/application/xml")
    attachment.associated_file_relationship = NameObject("/Source")
    attachment.size = NumberObject(len(xml))
    attachment.modification_date = at
    attachment.checksum = ByteStringObject(hashlib.md5(xml, usedforsecurity=False).digest())
    spec = attachment.pdf_object
    spec[NameObject("/UF")] = TextStringObject(name)
    spec[NameObject("/EF")][NameObject("/UF")] = spec["/EF"].raw_get("/F")
    target = writer._add_object(spec)
    names = writer.root_object["/Names"]["/EmbeddedFiles"]["/Names"]
    names[1] = target
    writer.root_object[NameObject("/AF")] = ArrayObject([target])
    out = io.BytesIO()
    writer.write(out)
    result = out.getvalue()
    check_attachment(result, xml, uuid)
    return result


def check_attachment(pdf, xml, uuid):
    check_attachment_root(checked_reader(pdf).trailer["/Root"], xml, uuid)


def check_attachment_root(root, xml, uuid):
    """Use only with an independently checked unsigned or signed PDF root."""
    af = root["/AF"]
    names = root["/Names"]["/EmbeddedFiles"]["/Names"]
    name = uuid + ".xml"
    if len(af) != 1 or len(names) != 2 or names[0] != name or af[0] != names[1]:
        raise ValueError("ATTACHMENT_ASSOCIATION_MISMATCH")
    spec = af[0].get_object()
    if spec["/Type"] != "/Filespec" or spec["/F"] != name or spec["/UF"] != name or spec["/AFRelationship"] != "/Source":
        raise ValueError("ATTACHMENT_METADATA_MISMATCH")
    ef = spec["/EF"]
    if ef.raw_get("/F") != ef.raw_get("/UF"):
        raise ValueError("ATTACHMENT_STREAM_MISMATCH")
    stream = ef["/F"]
    params = stream["/Params"]
    if stream["/Type"] != "/EmbeddedFile" or stream["/Subtype"] != "/application/xml" or params["/Size"] != len(xml) or "/ModDate" not in params or params["/CheckSum"].original_bytes != hashlib.md5(xml, usedforsecurity=False).digest() or stream.get_data() != xml:
        raise ValueError("ATTACHMENT_CONTENT_MISMATCH")


def page_digests(pdf, qr=None):
    """Physical page scan, never trusts a supplied image or extracted QR string."""
    digests, scanned = [], []
    with pdfium.PdfDocument(pdf) as doc:
        if not 1 <= len(doc) <= MAX_PAGES:
            raise ValueError("UNSUPPORTED_PDF")
        for i in range(len(doc)):
            with closing(doc[i]) as page:
                width, height = page.get_size()
                if not 0 < width <= 1200 or not 0 < height <= 1200:
                    raise ValueError("UNSUPPORTED_PAGE_SIZE")
                with closing(page.render(scale=2)) as bitmap:
                    pixels = bitmap.to_numpy()
                    digests.append((bitmap.width, bitmap.height, sha(pixels.tobytes())))
                if qr is None:
                    continue
                with closing(page.render(scale=300 / 72, grayscale=True)) as bitmap:
                    image = np.squeeze(bitmap.to_numpy()).copy()
                detector = cv2.QRCodeDetector()
                ok, values, _, _ = detector.detectAndDecodeMulti(image)
                if ok:
                    if any(not v for v in values):
                        raise ValueError("PRINTED_QR_NOT_VERIFIED")
                    scanned.extend(values)
                else:
                    value, _, _ = detector.detectAndDecode(image)
                    if value:
                        scanned.append(value)
        if qr is not None and (qr not in scanned or any(v != qr for v in scanned)):
            raise ValueError("PRINTED_QR_NOT_VERIFIED")
    return digests


def check_verapdf_report(data, path, size):
    """Check single-file veraPDF XML output; never treat a lone pass flag as evidence."""
    root = ElementTree.fromstring(data, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    jobs = root.findall("./jobs/job")
    summaries = root.findall("./batchSummary")
    reports = root.findall(".//validationReport")
    if root.tag != "report" or len(jobs) != 1 or len(summaries) != 1 or len(reports) != 1:
        raise ValueError("VERAPDF_REPORT_MISMATCH")
    job, summary, report = jobs[0], summaries[0], reports[0]
    items = job.findall("./item")
    if len(items) != 1 or job.find("./validationReport") is not report:
        raise ValueError("VERAPDF_REPORT_MISMATCH")
    names = items[0].findall("./name")
    if len(names) != 1 or not names[0].text or Path(names[0].text).resolve() != path.resolve() or items[0].get("size") != str(size):
        raise ValueError("VERAPDF_REPORT_MISMATCH")
    if summary.get("totalJobs") != "1" or any(summary.get(k) != "0" for k in ("failedToParse", "encrypted", "outOfMemory", "veraExceptions")):
        raise ValueError("VERAPDF_FAILED")
    counts = summary.findall("./validationReports")
    if len(counts) != 1 or (counts[0].text or "").strip() != "1" or any(counts[0].get(k) != v for k, v in (("compliant", "1"), ("nonCompliant", "0"), ("failedJobs", "0"))):
        raise ValueError("PDFA3B_NOT_COMPLIANT")
    details = report.findall("./details")
    if report.get("isCompliant") != "true" or report.get("profileName", "").lower() != "pdf/a-3b validation profile" or report.get("jobEndStatus", "normal") != "normal" or len(details) != 1:
        raise ValueError("PDFA3B_NOT_COMPLIANT")
    if any(details[0].get(k) != "0" for k in ("failedRules", "failedChecks")) or any(not re.fullmatch(r"[1-9][0-9]*", details[0].get(k, "")) for k in ("passedRules", "passedChecks")):
        raise ValueError("PDFA3B_NOT_COMPLIANT")
    return sha(data)


def validate_pdfa3b(path, validator):
    """Require the trusted veraPDF executable and a complete, file-bound 3b report."""
    validator = Path(validator)
    if not validator.is_absolute() or not validator.is_file() or not os.access(validator, os.X_OK):
        raise ValueError("VERAPDF_UNAVAILABLE")
    path = Path(path).resolve(strict=True)
    size = path.stat().st_size
    if not path.is_file() or not 1 <= size <= MAX_PDF:
        raise ValueError("INVALID_PDF_SIZE")
    before = sha(path.read_bytes())
    with tempfile.TemporaryFile() as report:
        run = subprocess.run([str(validator), "--format", "xml", "--flavour", "3b", str(path)], stdout=report, stderr=subprocess.DEVNULL, timeout=120, check=False)
        report.seek(0)
        data = report.read(2 * 1024 * 1024 + 1)
    if run.returncode or not 1 <= len(data) <= 2 * 1024 * 1024:
        raise ValueError("VERAPDF_FAILED")
    if path.stat().st_size != size or sha(path.read_bytes()) != before:
        raise ValueError("VERAPDF_INPUT_CHANGED")
    return check_verapdf_report(data, path, size)


def package_candidate(pdf, xml, *, manifest, validator):
    """Trusted offline renderer/ledger inputs only; output still needs PAdES."""
    if not isinstance(manifest, dict) or set(manifest) != {"uuid", "mode", "status", "pdfDigest", "xmlDigest", "generatedAt", "environment"} or manifest["environment"] != "simulation":
        raise ValueError("INVALID_PACKAGING_CONTEXT")
    checked_reader(pdf)
    uuid, mode, qr = invoice_identity(xml)
    if manifest["uuid"] != uuid or manifest["mode"] != mode or manifest["status"] != ("cleared" if mode == "standard" else "reported") or manifest["pdfDigest"] != sha(pdf) or manifest["xmlDigest"] != sha(xml):
        raise ValueError("PACKAGING_ARTIFACT_MISMATCH")
    at = datetime.fromisoformat(manifest["generatedAt"].replace("Z", "+00:00"))
    with tempfile.TemporaryDirectory(prefix="fiscal-pdfa-") as directory:
        before, after = Path(directory) / "before.pdf", Path(directory) / "after.pdf"
        before.write_bytes(pdf)
        before_report = validate_pdfa3b(before, validator)
        original_pages = page_digests(pdf, qr)
        candidate = embed_invoice(pdf, xml, uuid, at)
        after.write_bytes(candidate)
        after_report = validate_pdfa3b(after, validator)
        if page_digests(candidate, qr) != original_pages:
            raise ValueError("PDF_RENDER_CHANGED")
    return candidate, {"status": "offline-pdfa-package-candidate", "pdfDigest": sha(candidate), "xmlDigest": sha(xml), "sourceValidationDigest": before_report, "packageValidationDigest": after_report, "padesRequired": True}

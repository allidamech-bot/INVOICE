"""Offline exact-byte six-document ZATCA Java SDK gate; never authority acceptance."""
import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from defusedxml import ElementTree

TYPES = {f"{mode}-{kind}": (prefix, code)
         for mode, prefix in (("standard", "01"), ("simplified", "02"))
         for kind, code in (("invoice", "388"), ("credit", "381"), ("debit", "383"))}
CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
UBL = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
HEX = re.compile(r"[0-9a-f]{64}\Z")
MAX_XML = 512 * 1024
MAX_LOG = 2 * 1024 * 1024

def need(condition, code):
    if not condition:
        raise ValueError(code)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def invoice_identity(data, kind):
    need(0 < len(data) <= MAX_XML and kind in TYPES, "SDK_INVALID_ARTIFACT")
    root = ElementTree.fromstring(data, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    need(root.tag == f"{{{UBL}}}Invoice", "SDK_INVALID_ARTIFACT")
    def field(name):
        found = root.findall(f"{{{CBC}}}{name}")
        need(len(found) == 1, "SDK_INVALID_ARTIFACT")
        return found[0]
    uuid = field("UUID").text
    code = field("InvoiceTypeCode")
    prefix, expected = TYPES[kind]
    need(isinstance(uuid, str) and re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", uuid)
         and code.text == expected and re.fullmatch(prefix + r"[01]{5}", code.get("name", "")), "SDK_DOCUMENT_TYPE_MISMATCH")
    return uuid

def parse_sdk_result(stdout, stderr, returncode, version, kind):
    need(kind in TYPES and re.fullmatch(r"[0-9]+(?:\.[0-9]+){2}", version), "SDK_CONFIGURATION_INVALID")
    need(returncode == 0 and len(stdout) + len(stderr) <= MAX_LOG, "SDK_PROCESS_FAILED")
    report = (stdout + b"\n" + stderr).decode("utf-8", errors="strict")
    banners = re.findall(r"Welcome to ZATCA E-Invoice Java SDK ([0-9.]+)", report)
    global_results = re.findall(r"GLOBAL VALIDATION RESULT\s*=\s*([A-Z_]+)", report)
    need(banners == [version] and global_results == ["PASSED"], "SDK_GLOBAL_NOT_PASSED")
    need(not re.search(r"\[(?:ERROR|FATAL|WARN)\]|\b(?:Exception|NOT PASSED)\b", report), "SDK_ERRORS_OR_WARNINGS")
    stages = {}
    for name, result in re.findall(r"\[([A-Z]+)\] validation result\s*:\s*([A-Z_]+)", report):
        need(name not in stages and result == "PASSED", "SDK_STAGE_NOT_PASSED")
        stages[name] = result
    # The standard pre-clearance candidate need not carry the authority stamp.
    # Simplified must have actual signature and QR checks, never merely XSD.
    required = {"XSD", "EN", "KSA", "PIH"}
    if kind.startswith("simplified-"):
        required.update(("SIGNATURE", "QR"))
    need(required <= set(stages), "SDK_STAGE_MISSING")
    return sorted(stages)

def verify_matrix(manifest_path, launcher, sdk_version, output_dir):
    manifest_path = Path(manifest_path).resolve(strict=True)
    launcher = Path(launcher).resolve(strict=True)
    output_dir = Path(output_dir)
    need(launcher.is_file() and os.access(launcher, os.X_OK), "SDK_UNAVAILABLE")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    need(set(manifest) == {"environment", "syntheticOnly", "sourceCommit", "sdkVersion", "sdkArchiveSha256", "documents"}
         and manifest["environment"] == "simulation" and manifest["syntheticOnly"] is True
         and re.fullmatch(r"[0-9a-f]{40}", manifest["sourceCommit"])
         and manifest["sdkVersion"] == sdk_version and HEX.fullmatch(manifest["sdkArchiveSha256"])
         and isinstance(manifest["documents"], dict) and set(manifest["documents"]) == set(TYPES), "SDK_MATRIX_INVALID")
    # The archive hash records operator-pinned provenance, not independent
    # authenticity of the installed distribution. Validate that separately.
    artifacts, seen = {}, set()
    for kind, entry in manifest["documents"].items():
        need(set(entry) == {"file", "sha256"} and HEX.fullmatch(entry["sha256"]), "SDK_MATRIX_INVALID")
        path = (manifest_path.parent / entry["file"]).resolve(strict=True)
        need(path.is_relative_to(manifest_path.parent) and path.is_file()
             and 0 < path.stat().st_size <= MAX_XML, "SDK_INVALID_ARTIFACT")
        data = path.read_bytes()
        uuid = invoice_identity(data, kind)
        need(uuid not in seen and sha(data) == entry["sha256"], "SDK_ARTIFACT_MISMATCH")
        seen.add(uuid)
        artifacts[kind] = (path, data, uuid)
    output_dir.mkdir(mode=0o700, parents=False, exist_ok=False)
    launcher_hash = sha(launcher.read_bytes())
    results = {}
    for kind in TYPES:
        path, data, uuid = artifacts[kind]
        # No shell, no credential flags, no production endpoints. Execute only
        # the operator's independently verified installed official Java SDK.
        proc = subprocess.run([str(launcher), "-validate", "-invoice", str(path)],
                              cwd=launcher.parent, capture_output=True, timeout=120, check=False)
        need(len(proc.stdout) + len(proc.stderr) <= MAX_LOG, "SDK_PROCESS_FAILED")
        log = proc.stdout + b"\n" + proc.stderr
        (output_dir / (kind + ".log")).write_bytes(log)
        need(path.read_bytes() == data and sha(launcher.read_bytes()) == launcher_hash, "SDK_INPUT_CHANGED")
        stages = parse_sdk_result(proc.stdout, proc.stderr, proc.returncode, sdk_version, kind)
        results[kind] = {"uuid": uuid, "xmlSha256": sha(data), "logSha256": sha(log), "stages": stages}
    need(all(path.read_bytes() == data for path, data, _ in artifacts.values()), "SDK_INPUT_CHANGED")
    evidence = {"format": "LOUREX_SDK_MATRIX_V1", "sourceCommit": manifest["sourceCommit"],
                "sdkVersion": sdk_version, "operatorDeclaredSdkArchiveSha256": manifest["sdkArchiveSha256"],
                "launcherSha256": launcher_hash, "documents": results,
                "authorityAccepted": False, "productionReady": False, "independentProvenanceReviewRequired": True}
    (output_dir / "matrix.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    return evidence

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--launcher", required=True)
    parser.add_argument("--sdk-version", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    verify_matrix(args.manifest, args.launcher, args.sdk_version, args.output)

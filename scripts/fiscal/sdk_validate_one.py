"""Private SDK4 gate: verify a pinned read-only installed distribution and exact XML."""
import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from defusedxml import ElementTree
from verify_sdk_matrix import MAX_XML, MAX_LOG, invoice_identity, parse_sdk_result, need, sha

VERSION = '4.0.0'
ARCHIVE = '0e6f62f85c4f5d5da78dba7a9ec90566721e7efeef05dfb4514a159a8e66b1b9'
HEX = re.compile(r'[a-f0-9]{64}\Z')
MAX_MANIFEST = 1024 * 1024
MAX_INSTALLATION = 1024 * 1024 * 1024

def file_hash(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()

def checked_path(value):
    path = Path(value)
    need(path.is_absolute(), 'SDK_CONFIGURATION_INVALID')
    return path.resolve(strict=True)

def check_installation(root, manifest):
    actual = {}
    total = 0
    for directory, dirs, names in os.walk(root, followlinks=False):
        for name in dirs:
            need(not (Path(directory) / name).is_symlink(), 'SDK_INSTALLATION_CHANGED')
        for name in names:
            path = Path(directory) / name
            rel = path.relative_to(root).as_posix()
            need(not path.is_symlink() and path.is_file() and rel in manifest['files'], 'SDK_INSTALLATION_CHANGED')
            total += path.stat().st_size
            need(total <= MAX_INSTALLATION and len(actual) < 4096, 'SDK_INSTALLATION_TOO_LARGE')
            actual[rel] = file_hash(path)
    need(actual == manifest['files'], 'SDK_INSTALLATION_CHANGED')

def configured_certificate(data):
    # SDK4 compares issuer/serial to its configured certificate, not just
    # KeyInfo. Use the exact embedded public leaf for validation only.
    root = ElementTree.fromstring(data, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    ds = 'http://www.w3.org/2000/09/xmldsig#'
    ext = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
    sig = 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2'
    sac = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2'
    ns = {'ext':ext,'sig':sig,'sac':sac,'ds':ds}
    certs = root.findall('./ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent/sig:UBLDocumentSignatures/sac:SignatureInformation/ds:Signature/ds:KeyInfo/ds:X509Data/ds:X509Certificate', ns)
    need(len(certs) == 1 and len(list(root.iter('{'+ds+'}X509Certificate'))) == 1 and len(list(root.iter('{'+ds+'}Signature'))) == 1, 'SDK_CERTIFICATE_MISMATCH')
    cert = certs[0].text
    need(isinstance(cert,str) and len(cert) <= 43692 and not list(certs[0]), 'SDK_CERTIFICATE_MISMATCH')
    der = base64.b64decode(cert, validate=True)
    need(0 < len(der) <= 32768 and base64.b64encode(der).decode('ascii') == cert, 'SDK_CERTIFICATE_MISMATCH')
    return cert.encode('ascii')

def validate_one(data, kind, root_path, manifest_path, manifest_sha, java_home):
    uuid = invoice_identity(data, kind)
    root, manifest_file, java = map(checked_path, (root_path, manifest_path, java_home))
    need(root.is_dir() and manifest_file.is_file() and not manifest_file.is_relative_to(root) and manifest_file.stat().st_size <= MAX_MANIFEST and HEX.fullmatch(manifest_sha), 'SDK_CONFIGURATION_INVALID')
    raw = manifest_file.read_bytes()
    need(sha(raw) == manifest_sha, 'SDK_MANIFEST_CHANGED')
    manifest = json.loads(raw)
    need(isinstance(manifest, dict) and set(manifest) == {'sdkVersion', 'sdkArchiveSha256', 'launcher', 'sdkConfig', 'files'} and manifest['sdkVersion'] == VERSION and manifest['sdkArchiveSha256'] == ARCHIVE and isinstance(manifest['files'], dict) and 1 <= len(manifest['files']) <= 4096, 'SDK_CONFIGURATION_INVALID')
    need(all(isinstance(k, str) and isinstance(v, str) and HEX.fullmatch(v) for k,v in manifest['files'].items()), 'SDK_CONFIGURATION_INVALID')
    launcher = (root / manifest['launcher']).resolve(strict=True)
    need(isinstance(manifest['launcher'], str) and launcher.is_relative_to(root) and manifest['launcher'] == launcher.relative_to(root).as_posix() and launcher.is_file() and os.access(launcher, os.X_OK) and launcher.relative_to(root).as_posix() in manifest['files'] and (java / 'bin' / ('java.exe' if os.name == 'nt' else 'java')).is_file(), 'SDK_CONFIGURATION_INVALID')
    config = (root / manifest['sdkConfig']).resolve(strict=True)
    need(config.is_relative_to(root) and manifest['sdkConfig'] == config.relative_to(root).as_posix() and config.is_file() and manifest['sdkConfig'] in manifest['files'], 'SDK_CONFIGURATION_INVALID')
    check_installation(root, manifest)
    with tempfile.TemporaryDirectory(prefix='lourex-sdk-') as directory:
        work = Path(directory)
        xml, stdout, stderr = work/'invoice.xml', work/'stdout.log', work/'stderr.log'
        xml.write_bytes(data)
        # Public certificate only; no private key is required for -validate.
        # Keep the pinned installation unchanged and isolate each EGS invocation.
        settings = json.loads(config.read_text(encoding='utf-8'))
        need(isinstance(settings,dict), 'SDK_CONFIGURATION_INVALID')
        no_key = work/'validation-only-no-private-key.pem'
        settings['privateKeyPath'] = str(no_key)
        cert = None
        if kind.startswith('simplified-'):
            cert = configured_certificate(data)
            leaf = work/'leaf.b64'
            leaf.write_bytes(cert)
            settings['certPath'] = str(leaf)
        derived = work/'config.json'
        derived_bytes = json.dumps(settings,separators=(',',':')).encode('utf-8')
        derived.write_bytes(derived_bytes)
        # Do not inherit application credentials, JAVA_TOOL_OPTIONS or SDK overrides.
        env = {'FATOORA_HOME':str(launcher.parent), 'SDK_CONFIG': str(derived), 'JAVA_HOME': str(java), 'PATH': str(java/'bin') + os.pathsep + os.defpath, 'HOME': directory, 'TMPDIR': directory, 'LANG': 'C.UTF-8'}
        if os.name == 'nt':
            for key in ('SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT'):
                if key in os.environ: env[key] = os.environ[key]
            env['TEMP'] = directory; env['TMP'] = directory
        with stdout.open('wb') as out, stderr.open('wb') as err:
            proc = subprocess.run([str(launcher), '-validate', '-invoice', str(xml)], cwd=launcher.parent, env=env, stdout=out, stderr=err, timeout=120, check=False)
        need(stdout.stat().st_size + stderr.stat().st_size <= MAX_LOG and xml.read_bytes() == data and derived.read_bytes() == derived_bytes and not no_key.exists() and (cert is None or leaf.read_bytes() == cert), 'SDK_INPUT_CHANGED')
        a,b = stdout.read_bytes(), stderr.read_bytes()
        stages = parse_sdk_result(a, b, proc.returncode, VERSION, kind)
    check_installation(root, manifest)
    need(manifest_file.read_bytes() == raw, 'SDK_MANIFEST_CHANGED')
    return {'format':'LOUREX_SDK4_VALIDATION_V1','sdkVersion':VERSION,'sdkArchiveSha256':ARCHIVE,'installationManifestSha256':manifest_sha,'kind':kind,'uuid':uuid,'xmlSha256':sha(data),'logSha256':sha(a+b'\n'+b),'stages':stages}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ('kind','root','manifest','manifest-sha','java-home'):
        parser.add_argument('--'+flag, required=True)
    args = parser.parse_args()
    try:
        data = sys.stdin.buffer.read(MAX_XML+1)
        result = validate_one(data,args.kind,args.root,args.manifest,args.manifest_sha,args.java_home)
        print(json.dumps(result,separators=(',',':')))
    except Exception:
        sys.stderr.write('FISCAL_SDK4_VALIDATION_FAILED\n');sys.exit(1)

"""Offline exact-byte ZIP-to-installed-SDK comparison. No extraction and no writes."""
import hashlib
import json
import os
import stat
import sys
import zipfile

MAX_FILES = 4096
MAX_TOTAL = 1024 * 1024 * 1024
REQUIRED = ('Apps/fatoora', 'Apps/zatca-einvoicing-sdk-238-R4.0.0.jar', 'Configuration/config.json')


def verify(archive):
    with zipfile.ZipFile(archive, 'r') as z:
        items = {}
        total = 0
        for info in z.infolist():
            name = info.filename
            parts = name.split('/')
            if (not name or name.startswith('/') or '\\' in name or '\x00' in name
                    or any(p in ('.', '..') for p in parts)
                    or any(not p for p in parts[:-1])
                    or (not info.is_dir() and not parts[-1]) or len(name) > 1024):
                raise ValueError('ZIP_INVALID_PATH')
            unix_mode = (info.external_attr >> 16) & 0xFFFF
            if stat.S_ISLNK(unix_mode) or info.flag_bits & 0x1:
                raise ValueError('ZIP_SPECIAL_FILE')
            if info.is_dir():
                continue
            if not (stat.S_ISREG(unix_mode) or unix_mode == 0):
                raise ValueError('ZIP_NOT_REGULAR_FILE')
            if len(items) >= MAX_FILES or info.file_size > MAX_TOTAL:
                raise ValueError('ZIP_LIMIT')
            total += info.file_size
            if total > MAX_TOTAL or name in items:
                raise ValueError('ZIP_LIMIT_OR_DUPLICATE')
            digest = hashlib.sha256()
            seen = 0
            with z.open(info) as fp:
                while chunk := fp.read(1024 * 1024):
                    seen += len(chunk)
                    if seen > info.file_size:
                        raise ValueError('ZIP_SIZE_MISMATCH')
                    digest.update(chunk)
            if seen != info.file_size:
                raise ValueError('ZIP_SIZE_MISMATCH')
            items[name] = digest.hexdigest()
        candidates = []
        for name in items:
            if name.endswith(REQUIRED[0]):
                prefix = name[:-len(REQUIRED[0])]
                if all(prefix + n in items for n in REQUIRED):
                    candidates.append(prefix)
        if len(candidates) != 1:
            raise ValueError('ZIP_SDK_ROOT_AMBIGUOUS')
        prefix = candidates[0]
        result = {}
        for name, digest in items.items():
            if not name.startswith(prefix):
                raise ValueError('ZIP_UNEXPECTED_SIBLING')
            rel = name[len(prefix):]
            if not rel or rel in result:
                raise ValueError('ZIP_DUPLICATE_RELATIVE_PATH')
            result[rel] = digest
        return result


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2 or not os.path.isabs(sys.argv[1]):
            raise ValueError('ZIP_INVALID_ARGUMENT')
        print(json.dumps(verify(sys.argv[1]), sort_keys=True, separators=(',', ':')))
    except Exception:
        print('SDK4_ZIP_CONTENT_VERIFICATION_FAILED', file=sys.stderr)
        sys.exit(2)

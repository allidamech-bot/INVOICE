"""Isolated staging-only PKCS#11 helper. Never handles production keys."""
import base64
import hashlib
import fcntl
import json
import os
import re
import sys
import PyKCS11 as p
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

PARAMS = bytes.fromhex("06052b8104000a")
MODULE = "/usr/lib/softhsm/libsofthsm2.so"
STAGE = "input"

def need(ok):
    if not ok:
        raise ValueError("invalid staging operation")

def main():
    global STAGE
    raw = sys.stdin.buffer.read(800000)
    need(len(raw) < 800000)
    q = json.loads(raw)
    op, label, pin = q["op"], q["token"], q["pin"]
    need(op in ("provision", "ensure", "public", "sign") and re.fullmatch(r"lourex-qa-[a-z0-9-]{1,22}", label))
    need(re.fullmatch(r"[0-9]{8,32}", pin))
    kid = bytes.fromhex(q["keyId"])
    need(len(kid) == 32 and kid.hex() == q["keyId"])
    STAGE = "load"
    lib = p.PyKCS11Lib()
    lib.load(MODULE)
    def matching():
        return [s for s in lib.getSlotList(tokenPresent=True) if lib.getTokenInfo(s).label.strip() == label]
    if op == "ensure":
        # Parent holds a global flock in a private, persistent directory. Never
        # initialize an existing token or replace an incomplete key pair.
        so = q["soPin"]
        need(re.fullmatch(r"[0-9]{8,32}", so))
        STAGE = "find-token"
        slots = matching()
        if not slots:
            free = [s for s in lib.getSlotList(tokenPresent=True)
                    if not lib.getTokenInfo(s).flags & p.CKF_TOKEN_INITIALIZED]
            need(len(free) == 1)
            STAGE = "initialize-token"
            # C_InitToken requires a blank-padded 32-byte label. SoftHSM
            # assigns initialized tokens new slot IDs; reopen the module
            # before resolving the label rather than retaining stale slots.
            lib.initToken(free[0], so, label.ljust(32))
            STAGE = "reload-token"
            lib.unload()
            lib = p.PyKCS11Lib()
            lib.load(MODULE)
            slots = matching()
        need(len(slots) == 1)
        if not lib.getTokenInfo(slots[0]).flags & p.CKF_USER_PIN_INITIALIZED:
            STAGE = "initialize-user-pin"
            session = lib.openSession(slots[0], p.CKF_SERIAL_SESSION | p.CKF_RW_SESSION)
            try:
                session.login(so, p.CKU_SO)
                try:
                    session.initPin(pin)
                finally:
                    session.logout()
            finally:
                session.closeSession()
    STAGE = "open-token"
    slots = matching()
    need(len(slots) == 1)
    s = lib.openSession(slots[0], p.CKF_SERIAL_SESSION | (p.CKF_RW_SESSION if op in ("provision", "ensure") else 0))
    try:
        STAGE = "login"
        s.login(pin)
        STAGE = "key-pair"
        ident = (p.CKA_ID, tuple(kid))
        def objects(cls):
            return s.findObjects([(p.CKA_CLASS, cls), ident])
        if op == "provision" or (op == "ensure" and not objects(p.CKO_PUBLIC_KEY) and not objects(p.CKO_PRIVATE_KEY)):
            need(not objects(p.CKO_PUBLIC_KEY) and not objects(p.CKO_PRIVATE_KEY))
            s.generateKeyPair([(p.CKA_TOKEN, True), (p.CKA_VERIFY, True), (p.CKA_EC_PARAMS, tuple(PARAMS)), ident],
                              [(p.CKA_TOKEN, True), (p.CKA_PRIVATE, True), (p.CKA_SENSITIVE, True), (p.CKA_EXTRACTABLE, False), (p.CKA_SIGN, True), ident],
                              p.Mechanism(p.CKM_EC_KEY_PAIR_GEN, None))
        pub, = objects(p.CKO_PUBLIC_KEY)
        priv, = objects(p.CKO_PRIVATE_KEY)
        STAGE = "protected-attributes"
        flags = s.getAttributeValue(priv, [p.CKA_SENSITIVE, p.CKA_EXTRACTABLE, p.CKA_ALWAYS_SENSITIVE, p.CKA_NEVER_EXTRACTABLE, p.CKA_LOCAL, p.CKA_SIGN])
        need(flags == [True, False, True, True, True, True])
        try:
            value = s.getAttributeValue(priv, [p.CKA_VALUE])[0]
        except p.PyKCS11Error as exc:
            need(exc.value == p.CKR_ATTRIBUTE_SENSITIVE)
        else:
            need(value is None)
        STAGE = "public-key"
        point, curve = s.getAttributeValue(pub, [p.CKA_EC_POINT, p.CKA_EC_PARAMS])
        point = bytes(point)
        need(bytes(curve) == PARAMS and len(point) == 67 and point[:2] == b"\x04\x41")
        key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256K1(), point[2:])
        spki = key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
        out = {"spki": base64.b64encode(spki).decode("ascii")}
        if op == "sign":
            data = base64.b64decode(q["data"], validate=True)
            need(0 < len(data) <= 524288 and base64.b64encode(data).decode("ascii") == q["data"])
            signature = bytes(s.sign(priv, hashlib.sha256(data).digest(), p.Mechanism(p.CKM_ECDSA, None)))
            need(len(signature) == 64)
            der = utils.encode_dss_signature(int.from_bytes(signature[:32], "big"), int.from_bytes(signature[32:], "big"))
            out["signature"] = base64.b64encode(der).decode("ascii")
        return out
    finally:
        try:
            s.logout()
        finally:
            s.closeSession()

if __name__ == "__main__":
    try:
        # Only the persistent provisioner sets this environment variable. Serialize
        # token initialization across processes, with automatic release on exit.
        lock = os.environ.get("LOUREX_STAGING_LOCK")
        if lock:
            fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX)
                print(json.dumps(main(), separators=(",", ":")))
            finally:
                os.close(fd)
        else:
            print(json.dumps(main(), separators=(",", ":")))
    except Exception as exc:
        # Only fixed stage names and a numeric PKCS#11 status are exposed.
        # No exception text, token labels, PINs, requests or key material.
        code = getattr(exc, "value", None) if isinstance(exc, p.PyKCS11Error) else None
        status = (" 0x%08x" % code) if isinstance(code, int) and 0 <= code <= 0xffffffff else ""
        sys.stderr.write("STAGING_PKCS11_FAILED " + STAGE + status + "\n")
        sys.exit(1)

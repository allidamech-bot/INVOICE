"""Isolated staging-only PKCS#11 helper. Never handles production keys."""
import base64
import hashlib
import json
import os
import re
import sys
import PyKCS11 as p
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

PARAMS = bytes.fromhex("06052b8104000a")
MODULE = "/usr/lib/softhsm/libsofthsm2.so"
def need(ok):
    if not ok:
        raise ValueError("invalid staging operation")

def main():
    raw = sys.stdin.buffer.read(800000)
    need(len(raw) < 800000)
    q = json.loads(raw)
    op, label, pin = q["op"], q["token"], q["pin"]
    need(op in ("provision", "public", "sign") and re.fullmatch(r"lourex-qa-[a-z0-9-]{1,22}", label))
    need(re.fullmatch(r"[0-9]{8,32}", pin))
    kid = bytes.fromhex(q["keyId"])
    need(len(kid) == 32 and kid.hex() == q["keyId"])
    lib = p.PyKCS11Lib()
    lib.load(MODULE)
    slots = [s for s in lib.getSlotList(tokenPresent=True) if lib.getTokenInfo(s).label.strip() == label]
    need(len(slots) == 1)
    s = lib.openSession(slots[0], p.CKF_SERIAL_SESSION | (p.CKF_RW_SESSION if op == "provision" else 0))
    try:
        s.login(pin)
        ident = (p.CKA_ID, tuple(kid))
        def objects(cls):
            return s.findObjects([(p.CKA_CLASS, cls), ident])
        if op == "provision":
            need(not objects(p.CKO_PUBLIC_KEY) and not objects(p.CKO_PRIVATE_KEY))
            s.generateKeyPair([(p.CKA_TOKEN, True), (p.CKA_VERIFY, True), (p.CKA_EC_PARAMS, tuple(PARAMS)), ident],
                              [(p.CKA_TOKEN, True), (p.CKA_PRIVATE, True), (p.CKA_SENSITIVE, True), (p.CKA_EXTRACTABLE, False), (p.CKA_SIGN, True), ident],
                              p.Mechanism(p.CKM_EC_KEY_PAIR_GEN, None))
        pub, = objects(p.CKO_PUBLIC_KEY)
        priv, = objects(p.CKO_PRIVATE_KEY)
        flags = s.getAttributeValue(priv, [p.CKA_SENSITIVE, p.CKA_EXTRACTABLE, p.CKA_ALWAYS_SENSITIVE, p.CKA_NEVER_EXTRACTABLE, p.CKA_LOCAL, p.CKA_SIGN])
        need(flags == [True, False, True, True, True, True])
        try:
            value = s.getAttributeValue(priv, [p.CKA_VALUE])[0]
        except p.PyKCS11Error as exc:
            need(exc.value == p.CKR_ATTRIBUTE_SENSITIVE)
        else:
            need(value is None)
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
        print(json.dumps(main(), separators=(",", ":")))
    except Exception:
        sys.stderr.write("STAGING_PKCS11_FAILED\n")
        sys.exit(1)

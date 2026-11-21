#!/usr/bin/env bash
# Install only the existing canonicalization / clearance verification Java
# helpers beside the immutable fiscal release. NEVER touches website or units.
set -Eeuo pipefail
fail(){ printf 'LOUREX_FISCAL_JAVA_PREPARATION_STOPPED: %s\n' "$1" >&2; exit 2; }
[[ "$(id -u)" == 0 ]] || fail ROOT_REQUIRED
[[ $# == 1 && "$1" =~ ^[a-f0-9]{40}$ ]] || fail EXACT_INSTALLED_COMMIT_REQUIRED
ROOT=/opt/lourex-fiscal
RELEASE=$ROOT/current
S=$RELEASE/scripts/fiscal
[[ -f "$RELEASE/.lourex-fiscal-commit" && "$(cat "$RELEASE/.lourex-fiscal-commit")" == "$1" ]] || fail COMMIT_MISMATCH
[[ -d "$S" && ! -L "$S" ]] || fail UNTRUSTED_SOURCE
for unit in lourex-aws-enrollment.service lourex-aws-staging.service; do
  if systemctl is-active --quiet "$unit"; then fail SERVICE_ACTIVE; fi
done
[[ -x /usr/bin/javac && -x /usr/bin/java ]] || fail JDK_MISSING
for f in CanonicalInvoice.java ClearanceContent.java StampInspector.java;do
  P=$S/$f
  [[ -f "$P" && ! -L "$P" ]] || fail JAVA_SOURCE_MISSING
  [[ "$(stat -c %u "$P")" == 0 ]] || fail SOURCE_OWNER_UNTRUSTED
  MODE=$(stat -c %a "$P")
  (( (8#$MODE & 0022) == 0 )) || fail WRITABLE_SOURCE
done
DIGEST=$(cd "$S" && sha256sum CanonicalInvoice.java ClearanceContent.java StampInspector.java | sha256sum | cut -d ' ' -f1)
[[ "$DIGEST" =~ ^[a-f0-9]{64}$ ]] || fail SOURCE_HASH_INVALID
DEST=$ROOT/java-helpers-$(printf %s "$DIGEST" | cut -c 1-24)
if [[ -e "$DEST" || -L "$DEST" ]]; then
  [[ ! -L "$DEST" && -f "$DEST/CanonicalInvoice.class" && -f "$DEST/ClearanceContent.class" && -f "$DEST/StampInspector.class" ]] || fail EXISTING_JAVA_INSTALLATION_INVALID
  printf 'LOUREX_FISCAL_JAVA_READY\nJAVA_CLASS_PATH=%s\n' "$DEST"
  exit 0
fi
T=$(mktemp -d "$ROOT/.java-compile.XXXXXXXX") || fail STAGING_DIR_FAILED
cleanup(){ [[ -n "$T" ]] && rm -rf -- "$T"; }
trap cleanup EXIT
/usr/bin/javac -encoding UTF-8 -d "$T" "$S/CanonicalInvoice.java" "$S/ClearanceContent.java" "$S/StampInspector.java" || fail COMPILATION_FAILED
for f in CanonicalInvoice ClearanceContent StampInspector; do
  [[ -s "$T/$f.class" ]] || fail COMPILED_CLASS_MISSING
done
chown -R root:root "$T"
chmod -R go-w "$T"
chmod 0755 "$T"
printf '%s' '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:UUID xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">11111111-1111-4111-8111-111111111111</cbc:UUID></Invoice>' | runuser -u lourex-staging -- /usr/bin/java -cp "$T" CanonicalInvoice invoice >/dev/null || fail RESTRICTED_USER_JAVA_CHECK_FAILED
mv -T "$T" "$DEST" || fail JAVA_PROMOTION_FAILED
T=''
printf 'LOUREX_FISCAL_JAVA_READY\nJAVA_CLASS_PATH=%s\n' "$DEST"

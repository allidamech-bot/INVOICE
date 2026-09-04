from pathlib import Path
p=Path('tests/operations-v137.test.mjs')
s=p.read_text()
old="  assert.equal(APP_SCHEMA_VERSION,11);\n  assert.equal(migrated.schemaVersion,11);"
new="  assert.equal(APP_SCHEMA_VERSION,12);\n  assert.equal(migrated.schemaVersion,12);"
if old not in s:
    raise SystemExit('schema migration test anchor missing')
p.write_text(s.replace(old,new,1))

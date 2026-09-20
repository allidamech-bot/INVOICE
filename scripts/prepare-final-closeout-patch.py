from pathlib import Path
p=Path('scripts/final-closeout-patch.py')
s=p.read_text()
needle="def once(text, old, new, label):\n    count = text.count(old)\n    if count != 1:\n        raise SystemExit(f\"{label}: expected 1 occurrence, found {count}\")\n    return text.replace(old, new, 1)\n"
replacement=needle+"\ndef first(text, old, new, label):\n    count=text.count(old)\n    if count < 1:\n        raise SystemExit(f\"{label}: expected at least 1 occurrence\")\n    return text.replace(old,new,1)\n"
if needle not in s: raise SystemExit('once helper not found')
s=s.replace(needle,replacement,1)
target="s=once(s,\n\"    const canConvert=Boolean(this.props.onConvert&&doc.kind==='proforma'"
if target not in s: raise SystemExit('Documents canConvert patch target not found')
s=s.replace(target,"s=first(s,\n\"    const canConvert=Boolean(this.props.onConvert&&doc.kind==='proforma'",1)
p.write_text(s)

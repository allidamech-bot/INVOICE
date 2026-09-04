from pathlib import Path
p=Path('index.html')
s=p.read_text()
old='  <link rel="stylesheet" href="./styles/document-premium-redesign-v141.css" />\n  <link rel="stylesheet" href="./styles/invoice-conversion-v194.css" />'
new='  <link rel="stylesheet" href="./styles/invoice-conversion-v194.css" />\n  <link rel="stylesheet" href="./styles/document-premium-redesign-v141.css" />'
if old not in s:
    raise SystemExit('stylesheet order anchor missing')
p.write_text(s.replace(old,new,1))

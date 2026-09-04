from pathlib import Path
p=Path('src/components/EditorPage.tsx')
s=p.read_text()
old="private openConversion=(doc:LourexDocument)=>{"
new="private openConversion=async(doc:LourexDocument):Promise<void>=>{"
if old not in s:
    raise SystemExit('conversion signature anchor missing')
p.write_text(s.replace(old,new,1))

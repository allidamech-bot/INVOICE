from pathlib import Path

p=Path('src/components/SettingsModal.tsx')
s=p.read_text()

# Remove the direct Settings header Sign Out bar. Sign out belongs exclusively to
# AppShell > More, where the user explicitly requested it next to the theme control.
start=s.find('{!accountScope&&account?<div className="settings-direct-account-bar">')
if start>=0:
    end=s.find(':null}',start)
    if end<0: raise SystemExit('settings direct signout end anchor missing')
    s=s[:start]+s[end+6:]

# Remove any account-profile Sign Out button rendered inside Settings itself while
# preserving the account status/recovery card. This class is unique to that button
# in Settings; AppShell owns the remaining settings-signout-button in More.
needle='<Button className="settings-signout-button"'
while needle in s:
    start=s.index(needle)
    end=s.find('</Button>',start)
    if end<0: raise SystemExit('settings signout button closing tag missing')
    s=s[:start]+s[end+9:]

p.write_text(s)
print('v311 settings source cleanup applied')

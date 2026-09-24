# LOUREX v322 — Mobile UI rebuild

Scope: presentation-only mobile hierarchy rebuild based on real iPhone production screenshots.

- Premium compact app bar with visible Search and LOUREX Advisor actions.
- Contained floating bottom navigation dock with safe-area spacing.
- Mobile create menu and More sheet lifted above the dock.
- Cloud/PWA update notice moved away from primary navigation and actions.
- Dashboard rebuilt for denser two-column financial KPIs and quick actions.
- Financial advisor surface compacted and integrated into the dashboard rhythm.
- Documents summary, actions, filters and rows rebuilt for narrow phones.
- Document header actions use a bounded 2x2 grid; no horizontal clipping.
- Mobile document action sheet no longer collides with navigation.
- RTL/LTR and Light/Dark verified at 390x844 alongside desktop coverage.

Business logic, Firebase/Auth, PIN, encryption, local-first persistence, autosave, accounting, document lifecycle, PDF/share and v321 startup recovery are unchanged.

Final verification completed successfully: security gate, TypeScript typecheck, production build, and TailAdmin browser visual QA across Arabic/English, Light/Dark and mobile/desktop.

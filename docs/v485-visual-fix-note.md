# LOUREX v485 visual correction

This release addresses the exact production screenshots reported after v484:

- Documents type/status controls are centered as a non-clipping mobile grid instead of a masked horizontal scroller.
- Non-primary Documents creation controls use elevated navy surfaces instead of near-black fills.
- Dark canvas/surface/elevated layers have visible separation.
- Mobile More sheet uses distinct outer and item surfaces.
- iPad/desktop shell, dashboard hero, dashboard cards and LOUREX advisor receive explicit premium owners above 900px.
- Styles continue to be served network-first by the existing service worker, so the release does not rely on a cache-clear workaround.

No routing, storage, accounting, auth, AI, PDF or document lifecycle behavior is modified.

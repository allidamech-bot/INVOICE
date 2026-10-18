# Commercial quotation template design review

The template collection now has one commercial A4 design owner:
`src/styles/document-premium-redesign-v141.css`.

Printable paint and geometry were removed from the shell, editor contrast layer,
visible-UI owner and its build-time injection, and the short-document recovery
script. The retired v364 closing layer is no longer imported or emitted.
Document language shaping, watermark support, document-kind column semantics,
and Draft stationery retain their existing independent responsibilities.

## Collection

| Template | Direction |
| --- | --- |
| Executive | Navy and amber woven ribbon |
| Minimal | White paper, interrupted yellow band |
| International Trade | Crossing blue and orange swooshes |
| Signature | Sage curves and warm ivory paper |
| Obsidian | Graphite with cyan diagonal cuts and integrated dark identities |
| Cobalt | Blue wave under a navy circular crown |
| Editorial | Yellow tab with serif title and charcoal footer |
| Split | Indigo circular cutouts and orange discs |
| Prism | Teal side spine and coral edge |
| Slate | Aqua side panel and crisp black information grid |
| Horizon | Thin blue and orange arcs on white |
| Mono Grid | Asymmetric black bands and numbered ledger cells |
| Aurora | Two teal waves enclosing a warm white body |
| Ledger | Crimson ribbon crest and red financial finish |
| Noir Gold | Gold facets around matte black paper |
| Midnight Navy | Blue crest and champagne wave on navy |
| Black Ivory | Ivory title panel with black corner and gold diagonal |
| Carbon Luxe | Metallic diagonal panels with warm gold total |

Original authored SVG letterheads live in `src/templates/TemplateArtwork.tsx`.
The renderer and lightweight gallery thumbnails reuse the same header, footer,
rail artwork and paired color palette. The retired approximate gallery CSS was
removed rather than retained beneath the new previews. Artwork reserves its own
space, uses no external images, SVG filters, IDs or animation, and mirrors in RTL.

## Behavior

Body copy, labels, headings, and structural panels have explicit semantic colors.
Custom text colors are validated against the authored paper and local surfaces.
Normal copy is distinct from names, section headings, numeric totals and the
final amount. Bounded font-size controls remain available.

Optional commercial fields remain data driven. The redundant commercial-document
caption was removed. Missing company logos fall back to the company name; a
continuation header avoids duplicating that fallback. Bank information uses a
compact two-column layout, with a full-width IBAN.

Closing content follows the items in normal flow. A4 measurement starts with up
to ten weighted rows and moves intact item fragments only when the real measured
footer boundary requires it. Existing totals and pagination readiness recovery
remain in use. Dark documents use a presentation-only signature derivative in light ink.
Stamp underlays follow closed image contours, with only a narrow halo for open
marks; no rectangular signing panel is added. Saved assets remain unchanged.
Arabic Auto uses the locally embedded Tajawal family, and the English document
title uses a formal serif. The QR uses a measured third column beside bank and signing details, keeping
the quiet zone around the code and the surrounding caption transparent.

All commercial kinds use the shared template renderer, so the visual refresh
also applies to invoices and purchase documents using these template IDs.
Saved data, template IDs, settings, arithmetic, and persistence were not migrated.

## Verification

- TypeScript and full production build passed in an isolated checkout.
- 113 existing/updated template, appearance, PDF, pagination and QR contracts passed.
- 324 browser cases passed: 18 templates x 3 languages x 3 profiles x 2 engines.
- Engines: Chromium 141 and WebKit 26. The local WebKit run used downloaded
  dependency libraries in a temporary directory; CI installs normal dependencies.
- Profiles: representative quotation with QR; 24-item dense document; large mobile
  preview with intentionally unsafe custom colors.
- Browser checks cover source-item count/order, one final total, A4 boundaries,
  footer overlap, masthead containment and sampled text contrast >= 4.5:1. SVG text roles use their explicit paired
  palette; rendered pages are also inspected to check curved color boundaries.
- Actual English and Arabic invoice PDFs retained A4 size, the document number,
  and the exact 357.50 total from synthetic 325.00 + 10% tax.
- The review collection contains 18 one-page bilingual examples with QR plus an index.
  Every example retains the expected number and exact 3,875.55 synthetic total.
  All pages were rendered and inspected after PDF generation. Circle, oval,
  square and diamond stamp fixtures retained their ink and transparent outer
  corners, with their interiors backed by the selected light support color.

The new scoped CI workflow repeats the contracts and browser matrix on future
quotation-template changes. No production records were used for these checks.

LOUREX Invoice v201 editor functional audit coverage

This batch exercises the real editor component in Chromium for:
- invoice core fields, item add/duplicate/delete, totals, commercial terms and design toggles
- quotation date-window behavior and Arabic RTL geometry
- rapid Save Item and Save & Select Customer presses
- final-document output and lifecycle single-flight boundaries
- required-field validation and mobile touch target sizing

The existing v194 document workflow QA remains in CI for autosave, issue, output retry, quote conversion and save-and-close races.

## 2025-05-23 - Formula Injection in Excel Exports
**Vulnerability:** User-controlled data (names, notes, titles) exported to Excel could be interpreted as formulas if starting with `=`, `+`, `-`, or `@`.
**Learning:** Standard library `xlsx` does not automatically sanitize cell values against formula injection. Any user input destined for spreadsheets must be explicitly sanitized.
**Prevention:** Implemented `sanitizeCell` in `src/lib/export/xlsx.ts` to prepend `'` to risky values. Applied this to all cell values in `appendSheet`.

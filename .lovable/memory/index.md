# Project Memory

## Core
UI uses compact text-xs labels. Numeric inputs must suppress native spinners.
Global undo (Ctrl/Cmd+Z) overrides native. Modifier+click prevents dropdown open (for bulk copy).
App toggles DE/EN UI, but internal state and CSV exports MUST remain German.
ItemName paste splits only by newline, preserves special chars (- | / &).
Translation via Lovable AI (edge function translate-article-names).
Never use - / % $ § = in article names or exported name fields.

## Memories
- [Translation Integration](mem://integrations/translation) — Integration of DeepL API for translation services
- [Data Mapping](mem://logic/data-mapping) — Two-tier approach (AI + local fallback) for populating Merkmale fields
- [Quantity Aggregation](mem://logic/quantity-aggregation) — 'Artikel' counter calculates sum of 'Menge', not row count
- [UI Design Patterns](mem://ui/design-patterns) — Compact inputs with text-xs labels, suppression of native numeric spinners
- [UX Interactions](mem://ux/interactions) — Custom undo handling and bulk copy modifier key logic
- [Data Import Constraints](mem://constraints/data-import) — Pasting into ItemName preserves special characters, splits only by newline
- [Export Logic](mem://logic/export-logic) — Export logic for Supplier field, fallback to Manufacturer, title casing
- [Internationalization](mem://features/internationalization) — UI localization (DE/EN) but internal state and exports must remain in German
- [Merkmale Multi-select](mem://features/merkmale-multi-select) — Custom popover for multi-selection, comma-separated internal state, dynamic column export
- [Forbidden Characters](mem://constraints/forbidden-chars) — Never use - / % $ § = in article names
- [ItemName Split](mem://features/itemname-split) — ItemName split into Collection, Name, Measurement, Info/Material; joined with spaces in backend

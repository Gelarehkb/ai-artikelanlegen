---
name: Forbidden Characters
description: Character preservation rule for article names and exported fields
type: constraint
---
Do NOT strip any characters from article names, Artikelnummer, sizes, or exported fields.
Preserve original characters exactly (including `/`, `-`, `+`, `&`, etc.).
Sizes like `S/M` or `98/104` must remain intact — stripping `/` corrupts size data.
Only normalize whitespace (collapse multiple spaces, trim).

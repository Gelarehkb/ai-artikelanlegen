---
name: Forbidden characters in names
description: Never use - / % $ § = in article names, artikelnummer, or exported name fields
type: constraint
---
Characters `-`, `/`, `%`, `$`, `§`, `=` must be stripped from all name fields used in Artikelnummer, Artikelname, and exports. Use `stripForbiddenChars()` helper.

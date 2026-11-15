---
version: 1
slug: "frontend-src"
primary_target: "frontend/src"
related_targets: []
---

## Scope
Whole app shell + all surfaces (Ask, Professors, Courses, Compare, professor detail). Mode: Operate. Build: code-led.

## Direction contract
THESIS: Professors as collectible stat cards: every answer lands as a hand of cards you can compare at a glance, refusing the chat-transcript-plus-table default.
OWN-WORLD: White page, ink #1F2024, secondary #5B5D66; white card faces in a thin double-line frame (gold #D9A520 frame + "Best pick" badge on the top pick only, gray #C9CCD3 otherwise; gold never behind text); violet #5B3FD6 only for actions, active nav, citation chips; green #2F8F5B for would-take-again bars, gray bars for difficulty; Bricolage Grotesque for names and numerals, Inter Tight for UI. Cards sit flat (the ±1.6° hand tilt was dropped on purpose, 2026-11-15).
STORY: A student asks, sees the top three professors as cards with honest numbers, reads the cited short answer, checks sources, and adds two to Compare.
FIRST VIEWPORT: 200px left rail (brand, Ask/Professors/Courses/Compare). Main: question row, then the hand of three large cards leading, then short answer (left) and Sources (right) beneath; footer with data freshness and unofficial disclaimer.
FORM: Trading cards, my grounded list #1 (Impeccable's pick, chosen by the user in re-roll round 2); reference sketch .impeccable/mocks/decision/r5-cards-ask.html. seed:b274503e6cd984b5
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

# Maschine MK1 Display Face Brief

## Goal

Ship the first custom MAP2 display face for the MK1 LCD pipeline so Phase 1 can present large-value states without depending only on scaled legacy bitmap fonts.

## Phase 1 Constraints

- Native target: dual `255x64` 1-bit/5-bit rendered LCDs
- Required initial glyphs: `A-Z`, `0-9`, core punctuation, and the MAP2 wordmark treatment
- Readability priority: large numeric and single-word state recognition at stage distance
- Rendering priority: deterministic bitmap output suitable for retained-mode diffing and low-latency framebuffer writes

## Visual Direction

- Geometry: squared shoulders, open counters, strong vertical stems, no anti-alias requirement
- Tone: instrument-grade and broadcast-readable rather than ornamental
- Use cases: focused parameter value, profile identity, reconnect/incident headings, tempo and snapshot labels

## Phase 1 Deliverable

- `MAP2 Display 32` bitmap atlas generated from the shared bitmap source in `app/services/maschine/fonts/atlas.py`
- Initial support for uppercase alpha, digits, and operational punctuation
- Wordmark-ready spacing rules so `MAP2`, `LIVE`, `BYPASS`, and similar short states remain legible in the 12px/40px/12px panel layout

## Follow-Up

Phase 5 completes the production face with full punctuation, symbols, and final manual examples.

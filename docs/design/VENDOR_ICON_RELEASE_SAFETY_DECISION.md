# Vendor Icon Release Safety Decision

Date: 2026-03-15
Owner: Codex
Related worklist items: `T137`, `T137-subF`

## Decision

Release decision: `NO-GO` for vendor-inspired mirrored replacements, vendor-lookalike stand-ins, and direct reuse of IBM app icons as MAP product identity.

## Why

Shipping lookalike vendor or IBM-style product marks creates unnecessary risk in four areas:

- trademark confusion
- trade-dress resemblance
- implied endorsement or affiliation
- loss of a clear ownership boundary between MAP assets and third-party assets

MAP can follow the geometric discipline described in IBM and Carbon guidance, but MAP should not ship artwork that is recognizable as a modified vendor or IBM product mark.

## Approved release-safe fallback

Use:

- Carbon UI icons for actions and status
- MAP-owned neutral domain icons for platform, workflow, and device-family identity
- explicit text labels for vendor names when interoperability context requires them

Do not use:

- mirrored vendor badges
- recolored vendor logos
- simplified vendor silhouettes meant to evoke the original mark
- IBM app icon packages as a general app-icon library for MAP

## Current repository consequence

This decision is already reflected in the migration:

- removed `web/src/app/components/Tesira/BiampIcon.tsx`
- removed `web/src/app/components/icons/fontaudio/*`
- replaced vendor-adjacent device identity with neutral MAP-owned icons

## Future release criteria

A future exception is allowed only if all of the following exist:

1. written ownership or license proof for the asset
2. explicit confirmation that release distribution is permitted
3. no confusing resemblance beyond lawful nominative reference
4. worklist evidence documenting the approval

Without those criteria, the fallback remains mandatory.

## Operator-facing rule

When referencing third-party devices or ecosystems in UI:

- keep the vendor name in text
- use a neutral MAP icon for the surrounding card/header
- reserve third-party logos for attribution contexts only when licensing and branding rules clearly allow it

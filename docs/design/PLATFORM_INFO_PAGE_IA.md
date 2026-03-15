# Platform Information Page IA

Date: 2026-03-14
Owner: Codex
Related worklist items: `T135`, `T137-subA`

## Goal

Replace the split `/welcome` and `/about` experiences with one canonical MAP2 information surface that covers:

- operator orientation
- workflow mental model
- documentation access
- build and version identity
- support, legal, and licensing context

## Canonical route policy

| Route | Behavior | Reason |
| --- | --- | --- |
| `/about` | Canonical implementation | Existing support-oriented route already carries version, license, and system context. |
| `/welcome` | Redirect to `/about` | Preserves old links while eliminating duplicate page ownership. |

## Page structure

1. Header
   Single title for the merged page: platform guide plus support reference.
2. Platform guide section
   Flow -> chain -> activation model, non-destructive editing note, and action links into the supported editor path.
3. Documentation library
   Embedded docs browser so operators can stay in the shell while reading reference material.
4. Build and support reference
   Version data, credits, links, hardware help, theme tooling, and legal/licensing context.

## Navigation policy

- Remove `/welcome` as a distinct navigation item.
- Keep one pinnable shell item on `/about`.
- Use `Guide` as the short label so old operator expectations still map to the merged route.
- Normalize persisted pinned route state from `/welcome` to `/about` during load/write.

## Content rules

- Orientation content should point to `JUCE-GRID`, not legacy `/grid`.
- Licensing language must match repository policy: AGPLv3 for MAP2-owned code, third-party licenses preserved.
- The page remains Carbon-aligned by keeping the existing `Layer` shell and folding the guide/documentation sections into that route.

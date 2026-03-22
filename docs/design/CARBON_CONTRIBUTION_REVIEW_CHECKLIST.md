# Carbon Contribution and Review Checklist

Scope: Any change that adds, modifies, or removes UI in `web/`.
Source standard: `docs/design/CARBON_CONFORMANCE_STANDARD.md`

## 1. Component Selection

- [ ] Uses `@carbon/react` components for applicable controls before bespoke implementations.
- [ ] Avoids introducing new non-Carbon UI dependencies unless justified in review notes.
- [ ] Legacy/non-Carbon components touched by the change are flagged for migration or replaced now.

## 2. Typography and Tokens

- [ ] Typography uses IBM Plex and Carbon type tokens.
- [ ] Product surfaces use productive type styles by default.
- [ ] Hard-coded colors/spacing/typography/icon sizes are replaced with Carbon tokens/themes where possible.

## 3. Theme, Layering, and Grid

- [ ] Carbon theming/layering is used; no parallel custom palette introduced.
- [ ] Layout aligns to Carbon 2x grid and 8px spacing rhythm.
- [ ] Page composition follows 16-column patterns where the surface supports it.

## 4. Icons and Visual Semantics

- [ ] Carbon/IBM icon set used consistently.
- [ ] Decorative icons are hidden from assistive technology.
- [ ] Meaningful icons have accessible names/tooltips where needed.

## 5. Pattern Conformance

- [ ] Dialogs/notifications/forms/tables/search/filtering/loading/empty states follow Carbon patterns.
- [ ] UI copy is sentence case, plain language, and uses explicit action labels.

## 6. Accessibility

- [ ] Semantic structure is valid (landmarks/headings/labels).
- [ ] Full keyboard access works for changed controls.
- [ ] Focus order and focus visibility are correct.
- [ ] Contrast meets Carbon/IBM accessibility expectations.

## 7. AI and Branding

- [ ] AI features use Carbon for AI conventions and AI labeling where applicable.
- [ ] AI surfaces include a visible `AILabel` with short disclosure content (what is AI-assisted and what is not guaranteed).
- [ ] AI affordance naming is test-covered for touched surfaces (query by label text or `.cds--ai-label` presence in focused tests).
- [ ] No restricted IBM logos/app marks were added or modified.

## 8. Validation Evidence

- [ ] Typecheck/build/tests relevant to the changed surface pass.
- [ ] Responsive behavior checked for affected surfaces (desktop and mobile breakpoints).
- [ ] Exceptions are explicitly documented with rationale and linked follow-up task IDs.

## Reviewer Sign-off

- Contributor: ____________________
- Reviewer: ____________________
- Date: ____________________
- Task IDs: ____________________

## T203 Review Record

- Contributor: Codex
- Reviewer: Pending
- Date: 2026-03-19
- Task IDs: T203-subA through T203-subI
- Evidence:
  - All active `/midi-hub/*` area pages now have focused `.test.tsx` coverage.
  - AI surfaces use Carbon `AILabel` with short assistive disclosure copy.
  - Route-local builds validated through `npm --prefix web run typecheck` and `npm --prefix web run build`.
  - Backend service additions validated with dedicated `tests/test_*.py` coverage for Tesira, GPIO, string interface, and OSC namespace.

## T269 Review Record

- Contributor: Codex
- Reviewer: Pending
- Date: 2026-03-22
- Task IDs: T269, T269-subA, T269-subB, T269-subC
- Evidence:
  - Component selection: Home, Platforms, Labs, and Audio Artifacts now use Carbon shell, tile, side-nav, table, pagination, overflow-menu, and modal primitives for their primary workflows.
  - Typography and tokens: `web/src/app/pages/AudioArtifactsPage.css` and `web/src/app/components/artifacts/ArtifactDownloadModal.css` removed the prior purple parallel palette and now use Carbon text, border, layer, and interactive tokens only.
  - Theme, layering, and grid: The integrated route family is deep-linkable under one shell contract, and the Audio Artifacts context surfaces now render inline as layered workspace regions instead of fixed overlays.
  - Pattern conformance: Platforms/Labs modal hosting is retired for normal operation, artifact discovery moved to `/artifacts/discover`, and only upload/delete confirmation remain as short-lived dialogs.
  - Accessibility and responsive behavior: Added focused route tests in `web/src/app/pages/AudioArtifactsPage.test.tsx`; verified the desktop/mobile route family with screenshot evidence in `docs/design/evidence/t269-home-desktop.png`, `docs/design/evidence/t269-platforms-desktop.png`, `docs/design/evidence/t269-labs-desktop.png`, `docs/design/evidence/t269-artifacts-desktop.png`, `docs/design/evidence/t269-artifacts-discover-desktop.png`, and `docs/design/evidence/t269-artifacts-mobile.png`.
  - AI and branding: No new AI-labelled UI was introduced in T269, so section 7 is not applicable for this route family; restrained MAP2 branding remains intact and no IBM brand assets were added.
  - Validation: `npm --prefix web run typecheck` -> PASS; `npm --prefix web test -- --runInBand web/src/app/pages/AudioArtifactsPage.test.tsx web/src/app/App.platformRoute.test.tsx web/src/app/layout/AppShell.test.tsx web/src/app/pages/HomePage.test.tsx` -> PASS; `npm --prefix web run build` -> PASS with existing Vite dynamic-import/chunk warnings only.

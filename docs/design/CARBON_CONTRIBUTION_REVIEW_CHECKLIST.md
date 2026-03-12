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

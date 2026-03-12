# MAP2 Carbon Conformance Standard

Status: Active
Effective date: 2026-03-11
Canonical task: T114-subA
Scope: All UI changes under `web/` and any backend contract changes that alter UI rendering

## 1. Policy Statement

This document defines the default design language for MAP2.

For all new features and design changes, IBM Carbon and IBM Design Language are the authoritative standard. Existing product code may be retained only when it does not conflict with this standard.

If this standard conflicts with any older guidance, this standard wins.

## 2. Source-of-Truth Priority (Highest to Lowest)

1. Carbon React implementation and Carbon Storybook/docs (`@carbon/react`)
2. Carbon foundations: themes, tokens, typography, spacing, 2x grid, icons, accessibility
3. IBM Design Language foundations and approved IBM brand assets
4. Existing MAP2 product code only when it does not conflict with items 1-3

## 3. Hard Rules (Mandatory)

1. Prefer `@carbon/react` components before introducing or retaining bespoke controls.
2. If deprecated Carbon packages are found, migrate to `@carbon/react`.
3. Use IBM Plex typography with Carbon type tokens.
4. Default to productive type styles for product UI.
5. Use expressive type styles only for editorial/marketing surfaces with explicit justification.
6. Replace hard-coded color, spacing, typography, and icon sizing values with Carbon themes/tokens whenever possible.
7. Use Carbon theming and layering; do not create a parallel palette.
8. Align layouts to the Carbon 2x grid using an 8px base unit and favor 16-column page structures.
9. Use Carbon/IBM icons consistently.
10. Hide decorative icons from assistive technology.
11. Provide accessible labeling for meaningful icons.
12. Replace custom interaction patterns with Carbon patterns for dialogs, empty states, filtering, forms, global header, loading, notifications, search, and common flows.
13. UI copy must be sentence case, plain language, and explicit action wording.
14. Meet Carbon/IBM accessibility requirements for semantics, keyboard support, focus behavior, contrast, and accessible names.
15. For AI functionality, apply Carbon for AI conventions and use the AI label where appropriate.
16. Do not add IBM logos, IBM app icons, or restricted IBM brand marks unless authorized assets already exist in-repo and usage is appropriate.
17. Never redraw, alter, or synthesize restricted IBM brand marks.

## 4. Implementation Workflow

1. Inventory routes, templates, shared components, icon sets, charts, tables, forms, navigation, and brand assets.
2. Detect deprecated Carbon packages, non-Carbon component libraries, custom CSS systems, hard-coded design values, and inconsistent iconography.
3. Map each page to the nearest Carbon pattern/template and define component replacements.
4. Build a conformance matrix with issue, severity, Carbon replacement, token/theme changes, accessibility impact, files to change, and migration risk.
5. Refactor shared primitives first: app shell/navigation, typography, buttons/links, form inputs, tables, dialogs, notifications, spacing/layout, icon usage.
6. Refactor route-level pages after shared primitives are aligned.
7. Preserve business logic, API behavior, analytics hooks, and tests unless conformance or accessibility requires changes.
8. Validate responsiveness, keyboard flow, semantics, and visual consistency after each wave.
9. Record all unresolved exceptions with rationale and tracked follow-up.

## 5. Required Deliverables for the Program

The T114 program must produce all of the following:

1. Executive summary
2. Route inventory
3. Shared component inventory
4. Conformance findings by severity
5. Refactor plan
6. Patch set grouped by file
7. Accessibility findings
8. Exceptions and rationale

## 6. Contribution and Review Gate

All UI pull requests and AI-generated UI changes must pass:

- `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`

Required PR evidence:

1. Checklist completed with explicit pass/fail per item.
2. List of replaced/retained components with rationale for retained non-Carbon components.
3. Accessibility verification notes (keyboard, focus, semantics, contrast).
4. Screenshots or visual notes for impacted surfaces (desktop + mobile where applicable).

## 7. Exceptions Process

If a change cannot conform immediately:

1. Document the exception in the current task completion notes.
2. State business reason, user impact, and migration risk.
3. Add a follow-up worklist item with dependency links.
4. Include target milestone/date for closure.

No silent exceptions are allowed.

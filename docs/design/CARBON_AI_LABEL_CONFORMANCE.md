# Carbon AI Label Conformance

Date: 2026-03-12 20:27 EDT  
Canonical task: T114-subN

## AI-enabled surface inventory

| Surface | AI capability | Carbon AI label status | Files |
| --- | --- | --- | --- |
| API Observatory | AI-assisted endpoint summaries/workflow hints | Applied | `web/src/app/pages/ApiObservatoryPage.tsx`, `web/src/app/pages/ApiObservatoryPage.css` |
| Marketplace Assistant dialog | AI-generated shopping recommendations | Applied | `web/src/app/components/ShoppingSearchDialog.tsx`, `web/src/app/components/ShoppingSearchDialog.css` |
| MIDI Innovation panel | AI-assisted MIDI learn suggestions | Applied | `web/src/app/components/MidiHub/MidiInnovationPanel.tsx` |

## Test evidence

- `web/src/app/pages/ApiObservatoryPage.test.tsx` now checks for Carbon AI label presence.
- `web/src/app/components/ShoppingSearchDialog.test.tsx` now checks for Carbon AI label presence.
- Shared review gate updated:
  - `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`

## Copy/interaction conventions applied

- Sentence-case AI disclosure copy.
- Explicit statement that AI output is assistive and should be reviewed.
- AI labels attached to the user-visible surface entry point (page header or dialog panel header area).

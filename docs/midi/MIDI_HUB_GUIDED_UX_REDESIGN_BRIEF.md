# MIDI Hub Advanced Operator Refactor Brief

Status: Active as of 2026-03-17
Canonical task: `T202`
Supersedes: the earlier guided-help concept for `/midi-hub`

## Purpose

This brief defines the shipped direction for `/midi-hub`.

The route is an advanced operator workspace that:

- uses IBM Carbon end to end for touched controls and route composition
- orders the page by operational depth, with basic signal-path work first
- uses standard MIDI terminology instead of internal or planning language
- removes contextual-help assumptions from the route architecture

## User Directive Incorporated

The current direction is based on explicit user instruction:

- complete and total refactor
- basics first, more complex as you move deeper in the page
- use industry-standard MIDI concepts and service names
- advanced surface, no contextual help system
- update all related documents
- treat IBM Carbon compliance as the hard UI bar

## Current-State Problems Addressed

The prior route drifted in five concrete ways:

1. The shell behaved like a tabbed feature dump instead of a single operator workflow.
2. Major child panels still used MUI/custom control systems inside a partially Carbon route.
3. MIDI terminology was inconsistent across headers, actions, and documentation.
4. Dense editors used cramped spacing and ad hoc inline layouts.
5. Repo docs still described the route as a guided-help workspace rather than an advanced operator surface.

## Shipped Information Architecture

The route is now organized into ordered workflow bands:

1. `Signal path`
   - Routing workspace
   - Event monitor
2. `Show control`
   - Presets and program change
   - Clock and transport
   - Capture and playback
3. `Network and protocol`
   - RTP-MIDI and OSC bridge
   - MIDI 2.0 workspace
4. `Message processing and automation`
   - Message filtering
   - Message mapping
   - Script engine
   - Macros
   - Scheduled MIDI events
5. `Advanced and experimental`
   - AI-assisted suggestions
   - Mesh publication
   - Device shadow drift tools

## Route-Level Rules

### 1. Carbon First

- Use Carbon `Layer`, `ClickableTile`, `Tag`, `Button`, `Select`, `TextInput`, `TextArea`, `Checkbox`, `Table*`, `Modal`, and related primitives before bespoke controls.
- Replace route-level MUI usage in touched MIDI Hub panels.
- Use Carbon tokens for spacing, borders, layers, text, and state colors.

### 2. Sequential Depth

- The operator should encounter route creation and event validation first.
- Preset recall, clocking, and capture come after a working route exists.
- Network, MIDI 2.0, scripting, macros, and scheduling come later.
- Experimental surfaces stay at the end.

### 3. Copy and Terminology

- Use sentence case and standard MIDI terms.
- Prefer `event`, `route`, `preset`, `program change`, `RTP-MIDI`, `OSC`, `MIDI 2.0`, `MIDI-CI`, and `UMP`.
- Avoid vague planning labels such as `blueprint`, `lab surface`, or `quick recall`.

### 4. Density and Spacing

- Dense editors need explicit internal spacing bands and grouped controls.
- Use Carbon spacing tokens only.
- Reserve monospace text for identifiers, bytes, and route IDs.

### 5. No Contextual Help System

- No tours, guided overlays, help rail, inline teaching drawer, or beginner-first workflow shell.
- Short section framing and legends are allowed because they serve orientation, not tutoring.
- Operational warnings remain allowed where they reflect real state.

## Component-Level Translation

| Surface | Carbon / pattern target | Notes |
| --- | --- | --- |
| Page shell | Sequential multi-band operational workspace | Replace route tabs with ordered page sections |
| Routing matrix | Carbon table + modal editor | Semantic structure first, custom route cells tokenized |
| Patchbay | Carbon-tokenized custom SVG topology surface | Keep custom visualization, standardize surrounding controls |
| Event monitor | Carbon filter toolbar + table + detail modal | Preserve inspection depth without MUI |
| Presets | Carbon split management surface | Recall/default/compare/import/PC mapping/chain timer |
| Scripts | Carbon dual-column editor surface | Save/run/trigger/console in one consistent layout |

## Accessibility and Review Expectations

The route must continue to meet the Carbon contribution gate:

- keyboard-reachable actions
- visible focus states
- semantic headings and table structure
- WCAG-aligned contrast through Carbon tokens
- documented validation evidence in work completion notes

## Documentation Follow-Through

Any future `/midi-hub` work must keep these docs aligned:

- `docs/midi/MIDI_HUB_CONTENT_INVENTORY.md`
- `docs/design/CARBON_ROUTE_PATTERN_MAPPING.md`
- `docs/design/CARBON_CONFORMANCE_MATRIX.md`
- `docs/PROJECT_WORKLIST.md`

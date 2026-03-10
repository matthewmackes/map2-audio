# MIDI Hub Guided UX Redesign Brief

## Purpose

This document defines how to redesign `/midi-hub` so it becomes teachable, readable, and task-oriented instead of a long expert-only control dump. This is a planning and execution brief for a future implementation pass. It does not authorize UI changes by itself.

## Scope

- Target surface: `web/src/app/pages/MidiHubPage.tsx` and the panels it assembles.
- Goal: make the page easier to understand at a glance, easier to learn on first use, and easier to operate correctly without external documentation.
- Non-goal: do not remove current power-user capability. The redesign must layer guidance on top of the existing MIDI Hub feature set.

## Current-State Review

The current `/midi-hub` page has strong capability coverage but weak usability. The main issues are structural, educational, and visual:

1. `MidiHubPage.tsx` stacks many feature cards in a single vertical flow.
   - Routing, presets, scripting, macros, recorder, scheduler, clock, network MIDI, MIDI 2.0, innovation controls, and traffic diagnostics all appear with nearly equal weight.
   - Result: no clear starting point, no dominant workflow, and poor scanability.

2. Important guidance text is low-emphasis and hard to read.
   - The shared `.subtitle` style uses muted text on dark surfaces.
   - Several MIDI Hub panels also rely on `11px` to `12px` secondary text and muted monospace labels for important context.
   - Result: users see controls before they understand them.

3. The routing surfaces are powerful but self-explanatory only to experts.
   - `MidiRoutingMatrix.tsx` uses compact active/disabled cells with no legend, no examples, and no explanation of route type, filters, or transform chains before opening the editor.
   - `MidiPatchbay.tsx` uses color and topology lines without enough onboarding, labels, or recovery guidance.
   - Result: users can click around, but the interface does not teach the routing model.

4. Diagnostics surface raw data before intent.
   - `MidiTrafficMonitor.tsx` is dense, technical, and table-heavy.
   - It exposes search, regex, sort, export, and message detail immediately, but it does not first explain when to use the monitor, what "good" looks like, or how to debug common failures.

5. The page has no integrated learning system.
   - No first-run onboarding
   - No guided flows for common goals
   - No step-by-step tutorials
   - No contextual explanation dialogs
   - No embedded examples
   - No progressive disclosure by skill level

6. Capability families are not visually grouped.
   - Setup, routing, automation, monitoring, network integration, and experimental controls are all presented as the same class of card.
   - Result: the user must build the information architecture mentally.

## A. UX Strategy

The new guidance model should work in four layers:

1. Glance layer
   - The page should immediately answer:
     - What can I do here?
     - What should I do first?
     - What is currently healthy or misconfigured?

2. Assist layer
   - Every major action should offer guided help in place:
     - short inline description
     - tooltip or help icon
     - "why this matters" note
     - expected result

3. Teach layer
   - Tutorials and guided flows should walk users through complete tasks:
     - connect a device
     - create a route
     - test traffic
     - save a preset
     - recover from no-signal conditions

4. Expert layer
   - Advanced details remain available on demand:
     - route transforms
     - raw message views
     - regex filters
     - MIDI 2.0 tools
     - innovation and experimental controls

Design principle: show intent first, controls second, raw data third.

## B. Information Architecture

Recompose `/midi-hub` into capability groups rather than a flat card list.

### Recommended groups

1. Setup and Connectivity
   - Routing workspace
   - Network MIDI + OSC
   - MIDI 2.0 readiness

2. Control and Automation
   - Preset manager
   - Script engine
   - Cross-device macros
   - Message scheduler
   - Clock engine

3. Capture and Analysis
   - Traffic monitor
   - Performance recorder

4. Advanced and Experimental
   - Innovation controls

### Recommended page structure

1. Hero header
   - short plain-language summary
   - system status chips
   - "Start here" CTA
   - "Take tour" CTA
   - "Common tasks" CTA

2. Guided workspace strip
   - top 4 common goals as task cards
   - each launches a guided flow

3. Routing workspace
   - matrix and patchbay as two views of one primary workspace
   - visible legend
   - visible explanation of route lifecycle

4. Capability group sections
   - each section with a color-coded header, icon, short explanation, and local help entry point

5. Persistent contextual help rail or drawer
   - updates based on selected panel or workflow

## C. Help System Framework

The help system must be part of the product architecture, not one-off copy.

### Required reusable primitives

1. `ContextHelpButton`
   - present on every major panel header
   - opens a structured explanation dialog

2. `InlineHint`
   - one-sentence explanation below headings or above risky controls

3. `LearnMoreDrawer`
   - right-side drawer with beginner, intermediate, and advanced tabs

4. `ExampleCard`
   - shows realistic input, output, and expected result

5. `GuidedFlowWizard`
   - step-based task runner with resume, cancel, restart

6. `TutorialOverlay`
   - page-aware spotlight walkthrough for first-run and replay

7. `SuccessCheckpoint`
   - explicit success criteria before advancing

8. `RecoveryPanel`
   - plain-language error explanation with next actions

### Required explanation dialog structure

Every major tool or service dialog should include:

- Plain-language summary
- Technical explanation
- When to use it
- When not to use it
- Dependencies or prerequisites
- Example workflow
- Example input
- Example output
- Common mistakes
- Related features

## D. Visual System

### Capability color groups

Use a consistent color system across `/midi-hub` and later reuse it elsewhere:

- Setup and configuration: blue
- Monitoring and status: teal
- Editing and authoring: amber
- Control and execution: green
- Analysis and diagnostics: orange
- Integration and connectivity: cyan
- Advanced and expert: slate
- Destructive or caution-required actions: red

Color is not enough by itself. Every group also needs:

- icon
- label
- section header
- spacing
- border or badge treatment

### Readability rules

- Minimum body text for instructional copy: `14px`
- Avoid `11px` muted text for important guidance
- Use higher-contrast helper copy than current `.subtitle`
- Keep primary instructions in normal reading contrast, not decorative secondary contrast
- Meet WCAG AA contrast for text and state labels
- Do not rely on color alone for route state, warning state, or workflow progress

### Visual guidance rules

- Add route legends to matrix and patchbay
- Add section summaries before dense controls
- Use callout blocks for warnings and prerequisites
- Reserve monospace styling for raw identifiers and message bytes only

## E. Workflow Improvements

The following guided flows should be implemented first:

1. Connect a MIDI device and verify it is available
2. Create your first route from source to destination
3. Add a filter or transform to a route
4. Save, recall, and compare a preset
5. Record traffic and diagnose missing messages
6. Send MIDI clock to selected outputs
7. Create a macro that triggers multiple actions
8. Build a simple script from an example
9. Configure a network MIDI session
10. Troubleshoot "device connected but no MIDI activity"

Each guided flow must:

- explain the goal
- explain each decision point
- validate required inputs in real time
- warn on risky actions
- explain errors in plain language
- provide at least one realistic example
- allow cancel, restart, and resume

## F. Screen-Level Recommendations

### 1. MIDI Hub page shell

Add:

- a "Start here" hero section
- a "Common tasks" band
- a page-level tour entry point
- capability family grouping
- a sticky help launcher

Reorganize:

- move from flat card stack to grouped sections
- keep the routing workspace first
- collapse advanced sections by default for new users

Explain better:

- what MIDI Hub is
- what kind of user should start in matrix vs patchbay
- what "preset", "macro", "scheduler", and "innovation" mean in plain language

### 2. Routing Matrix and Patchbay

Add:

- a shared legend for states and colors
- a short model explanation: source -> optional filter/transform -> destination
- "create first route" guided flow
- examples:
  - controller to synth
  - DIN input to software instrument
  - clock to two outputs

Reorganize:

- surface route count, active errors, and unassigned ports at the top
- separate "basic route" from "advanced route options"
- keep transform editing behind progressive disclosure

Explain better:

- route type
- priority
- message filters
- transform chain
- expected success state after save

### 3. Preset Manager

Add:

- plain-language explanation of what a preset captures
- example startup preset workflow
- compare-before-recall guidance
- warning copy before destructive overwrite

### 4. Script Engine

Add:

- beginner mode with curated example scripts
- "what this script does" summary above code
- prerequisite checklist before run
- example trigger and example result

Reorganize:

- hide raw script editing behind "edit code"
- lead with examples and use cases

Explain better:

- when a script is better than a macro
- sandbox limitations
- how to stop a runaway timer

### 5. Macro, Recorder, and Scheduler panels

Add:

- a shared "Automation tools" group
- side-by-side comparison cards:
  - macro = one event triggers many actions
  - recorder = capture and replay performance data
  - scheduler = send messages later
- one example per tool

### 6. Clock Engine

Add:

- explanation of clock source modes
- guided flow for "send clock to one pedal and one synth"
- examples of tap-tempo success and mismatch recovery

### 7. Network MIDI + OSC

Add:

- prerequisite checklist for ports, addresses, and firewall assumptions
- examples for RTP-MIDI and OSC separately
- warning copy for remote targets

Explain better:

- when to use network MIDI vs local routing
- what a successful session looks like
- how to test connectivity safely

### 8. MIDI 2.0 Readiness

Add:

- explicit "advanced" badge
- explanation that most users can ignore this unless needed
- example discovery workflow

Reorganize:

- collapse by default
- keep translation utilities behind a learn-more section

### 9. Innovation Controls

Add:

- experimental label
- stability expectations
- examples for each experimental capability

Explain better:

- what is production-ready vs exploratory
- what should not be used in a live show without validation

### 10. Traffic Monitor

Add:

- "When to use this" intro
- quick filters for common debugging tasks
- plain-language diagnostic presets:
  - no input detected
  - wrong destination
  - message flood
  - clock spam

Reorganize:

- lead with health summary and recommended next step
- keep regex and raw hex as expert affordances

Explain better:

- what normal traffic looks like
- what common failure patterns look like
- how to export evidence for support or regression work

## G. Implementation Details

### Reusable data model

Create structured metadata for each tool panel:

- `id`
- `title`
- `capabilityGroup`
- `summary`
- `technicalSummary`
- `beginnerExplanation`
- `advancedNotes`
- `prerequisites`
- `examples`
- `commonMistakes`
- `relatedFeatures`
- `tutorialIds`
- `guidedFlowIds`

This should drive:

- panel headers
- help dialogs
- tutorial registration
- guided task cards
- search and filter

### Tutorial system requirements

- Tutorials are page-aware and panel-aware
- Tutorials can be dismissed, restarted, and resumed
- Tutorial completion state is persisted per user/browser
- Tutorials support step targeting, expected action, and success criteria

### Guided flow requirements

- Flows maintain state between steps
- Flows can validate live page state and API results
- Flows can branch on conditions:
  - no device found
  - route already exists
  - traffic missing
  - network endpoint unreachable

### Accessibility requirements

- keyboard reachable help controls
- focus-safe overlays and dialogs
- readable contrast for helper text
- visible non-color state indicators
- no hidden meaning in hover-only interactions

### Instrumentation requirements

Measure whether the redesign actually improves usability:

- tutorial start/completion rate
- guided flow completion rate
- task abandon rate
- time-to-first-route
- help dialog open rate
- repeated error frequency by panel

## Implementation Sequence

1. Audit and content inventory
   - inventory every panel, tool, control, and missing explanation
   - normalize terminology

2. Information architecture and visual grouping
   - define group model, section shell, and readable text styles

3. Help primitives
   - build reusable help button, drawer, dialog, hint, example, and warning components

4. Guided learning system
   - build tutorial registry, overlay, and guided-flow framework

5. Routing workspace retrofit
   - apply legends, examples, and create-first-route guidance

6. Panel retrofit pass
   - add help metadata and examples to every major MIDI Hub panel

7. Accessibility and readability pass
   - contrast, typography, spacing, mobile review, keyboard access

8. Validation
   - confirm that new users can complete first-route and troubleshooting tasks without external instruction

## Done Criteria

The redesign is complete only when all of the following are true:

- Every important MIDI Hub feature has inline help and deep help
- Every major workflow has a guided flow
- First-run users can start a tutorial from the page itself
- The page is grouped by capability family, not a flat feature stack
- Important text is readable without strain
- Examples are embedded throughout the experience
- Advanced functionality remains available without overwhelming first-time users

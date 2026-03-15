# Quad Cortex Touchscreen Textual Spec

## Purpose

Implement a standalone Textual application that recreates the touchscreen experience of the Neural DSP Quad Cortex as closely as possible in structure, navigation model, information density, and primary layouts, while restyling the UI through IBM Carbon dark-theme principles.

This spec is the implementation contract for `T122`.

## Scope Lock

- Build only the touchscreen UI.
- Do not render the physical chassis, footswitch housings, jacks, or pedalboard body.
- The app opens directly into `The Grid`.
- The default structural reference is an `800x600` touchscreen canvas.
- The app remains usable on somewhat smaller or larger terminals by reducing detail density before collapsing structure.

## User Decisions Locked For This Version

- Modes in scope: `Chain`, `Stomp`
- `Gig View` exists in both modes.
- `Gig View` tile meaning:
  - `Chain` mode: 8 chain presets
  - `Stomp` mode: 8 stomp assignments
- Live stomp assignment model:
  - one block per stomp
  - blocks may be armed/disarmed directly from the grid
  - assigned blocks show `S1` through `S8` badges
- Empty Gig View stomp slots remain visible and greyed out.
- Header:
  - no bank number
  - no preset slot number
  - large live `Chain Name`
  - keep compact tempo, tuner, CPU/load, I/O, and simple MIDI activity indicators
- Small terminals:
  - keep the full `4x8` and `4x2` structures visible
  - abbreviate labels and reduce detail density before removing regions
- Visual direction:
  - black outer background
  - Quad Cortex structure and density
  - Carbon UI behavior for focus, layering, typography, and token roles
  - distinct interactive effect colors
  - bypassed items use muted versions of their effect color
  - live stomp badges use the block's effect color
  - do not reserve global colors exclusively for state

## Source-Backed Structural Rules

### Quad Cortex operating model

Use these as fixed behavioral constraints:

- Quad Cortex modes control how footswitches interact with `The Grid`, and the active mode is shown at the top-right of `The Grid`.
- `PRESET` mode loads assigned presets.
- `STOMP` mode toggles assigned device blocks and allows block-to-footswitch assignment from the grid.
- `Gig View` is a full-display summary of the current footswitch configuration.
- `The Grid` is the central workspace and consists of 4 rows with 8 block slots each.
- Quad Cortex launches into `The Grid` after powering on.

For this implementation, preserve those structural rules while translating the exposed mode set to the user-requested `Chain` and `Stomp` model:

- `Chain` is a constrained adaptation of Quad Cortex `PRESET` behavior.
- `Stomp` mirrors Quad Cortex `STOMP` behavior.

### Carbon layout and theme rules

Use Carbon's system rules as implementation constraints:

- Base spacing on the 8 px mini unit.
- Use a black screen surround with Carbon dark layered surfaces inside it.
- Use role-based tokens instead of hard-coded color semantics in widgets.
- Dark layers become lighter as surfaces stack.
- Subtle dividers and component outlines should use the equivalent of `border-subtle`.

## Layout Contract

Treat the viewport as a single touchscreen.

### Overall composition

- Outer screen padding target: `16-24`
- Header height target: `56-72`
- Main content target: dominant middle band
- Context strip target: compact bottom information band
- Footer/help strip target: `32-40`

### Header

Left side:

- large chain name
- smaller context line for current chain preset family and selected block summary

Right side:

- active mode badge
- current view badge (`Grid` or `Gig View`)
- compact performance status tokens:
  - tempo
  - tuner
  - CPU
  - I/O
  - MIDI pulse

### Grid

The grid is the primary screen.

- Exact structure: `4 rows x 8 columns`
- Tight, even spacing
- Preserve the feeling of a performance processor signal-routing canvas, not a DAW mixer or abstract node graph
- Every cell supports:
  - empty
  - occupied
  - selected
  - armed-to-stomp
  - bypassed
  - active/live

#### Grid cell content order

Prefer a dense three-part readout:

1. top utility line:
   - abbreviated category
   - optional route marker or signal indicator
   - optional stomp badge
2. center:
   - block label, abbreviated as needed
3. bottom:
   - bypass/live state
   - short parameter or type hint

#### Grid routing cues

The app does not need full editable routing for v1, but the screen must show obvious signal structure.

Implement routing cues with:

- consistent left-to-right chain ordering
- row labels
- occupied block adjacency
- signal-path accents or animated flow fragments for the current chain
- split/merge blocks shown as distinct utility blocks

### Gig View

Same main content region as the grid.

- Exact structure: `4 columns x 2 rows`
- Large readable tiles
- Tile types change by mode:
  - `Chain`: chain preset tiles
  - `Stomp`: stomp assignment tiles
- Empty stomp tiles remain visible and muted
- Active tile state must be immediately readable

### Context strip

Keep this close to Quad Cortex behavior.

Use a compact bottom strip rather than a heavy side panel.

Show:

- selected block name
- category
- bypass/live state
- stomp assignment
- compact parameter summary

If the selected slot is empty:

- show add/load guidance instead of parameters

### Footer/help strip

Very compact.

Show the current key actions only:

- `G Grid`
- `V Gig`
- `1 Chain`
- `2 Stomp`
- arrows move
- `Enter/Space` toggle
- `B` arm/disarm stomp
- `N` next chain
- `S` save mock state

## Mode and View Behavior

### Chain mode

Adapted from Quad Cortex preset behavior.

- Header mode label: `CHAIN`
- Grid interaction:
  - select blocks
  - toggle bypass on assigned effect blocks
  - arm/disarm selected block to a stomp slot
- Gig View:
  - show 8 chain preset tiles
  - one tile is current
  - activating a tile loads that chain preset and updates grid/context/header

### Stomp mode

Matches Quad Cortex stomp behavior closely.

- Header mode label: `STOMP`
- Grid interaction:
  - select blocks
  - toggle bypass on assigned effect blocks
  - arm/disarm the selected block to a stomp slot
- Gig View:
  - show 8 stomp tiles
  - assigned blocks use their effect color
  - unassigned tiles stay visible in muted gray
  - activating a tile toggles the assigned block bypass state

### View switching

- app launches into `Grid`
- `g` forces `Grid`
- `v` toggles `Gig View`
- view state updates header badge and footer hints

## Interaction Contract

### Keyboard

Required bindings:

- `g`: go to `The Grid`
- `v`: toggle `Gig View`
- `1`: switch to `Chain`
- `2`: switch to `Stomp`
- arrow keys: move active selection in the current matrix
- `enter` / `space`:
  - `Grid`: toggle selected block bypass if block exists
  - `Gig View` + `Chain`: recall the selected chain preset
  - `Gig View` + `Stomp`: toggle the selected stomp
- `tab`: cycle focus region emphasis between header controls, content matrix, and context strip
- `b`: arm/disarm the selected grid block to a stomp slot
- `n`: next chain preset
- `s`: mock save/status action

### Mouse

Required:

- clicking a grid block selects it
- clicking a Gig View tile selects and activates it
- clicking header mode/view controls triggers the same state changes as keyboard shortcuts

## Data Model

Create an internal mock model with reusable dataclasses.

### Required entities

- `OperatingMode`
- `TouchscreenView`
- `EffectFamily`
- `BlockState`
- `StompAssignment`
- `ChainPreset`
- `MidiStatus`
- `PresetState`

### Mock content requirements

Provide realistic sample data for:

- 8 chain presets
- grid blocks
- live stomp assignments
- bypass states
- active chain
- simple MIDI activity feed

### Recommended sample chain content

Use categories drawn from realistic processor chains:

- input
- compressor
- drive
- amp
- cab
- EQ
- delay
- reverb
- split
- output

## Effect Color System

### Important constraint

There is no single formal industry-wide standard for every effect category color. The mapping below is an informed convention, not a standards-body rule.

This mapping should be implemented as the app's fixed color families because it is the closest defensible synthesis of:

- Line 6 category LED/documentation conventions
- HeadRush preset color conventions
- long-running stomp identity expectations in guitar UX

### Source-backed conventions

Strong direct evidence:

- `Delay` -> green
- `Modulation` -> blue
- `Pitch/Filter/Wah` -> purple
- `Reverb` -> orange
- `Distortion/Drive` -> yellow to amber
- `Dynamics/EQ` -> yellow family

Supporting evidence:

- HeadRush uses cool-to-warm rig colors across gain stages:
  - blue clean
  - yellow hot clean
  - orange crunch
  - red overdrive

### App palette decision

Implement the following effect families:

| Family | Included categories | Color direction | Basis |
| --- | --- | --- | --- |
| `signal-io` | input, output, utility, split | neutral slate gray | inference for non-tonal routing blocks |
| `dynamics` | compressor, EQ | bright gold | Line 6 dynamic/EQ grouping |
| `drive` | overdrive, distortion, fuzz, boost | amber | Line 6 + HeadRush gain-stage convention |
| `amp` | amp, capture, cab | brick / warm red-orange | inference to keep amp stage distinct from drive and time FX |
| `modulation` | chorus, flange, phaser, vibe, trem | blue | strong repeated convention |
| `delay` | delay, echo | green | strong repeated convention |
| `reverb` | reverb, ambience | orange | strong repeated convention |
| `pitch-filter` | pitch, wah, filter, synth-like filter blocks | purple | strong repeated convention |

### State application rules

- Occupied blocks use the family color as the primary accent.
- Selected blocks use Carbon focus treatment first, not a different semantic hue.
- Bypassed blocks keep the same family color but desaturate/mute it.
- Armed stomp badges use the block family color.
- Gig View tiles inherit the assignment family color.
- Empty tiles and empty slots use neutral Carbon grays.
- Signal animation should borrow the current block family color rather than a globally reserved signal color.

## Carbon Translation Rules

### Theme foundation

Use tokenized roles in Textual theme variables:

- `background`
- `layer`
- `layer-hover`
- `text-primary`
- `text-secondary`
- `border-subtle`
- `focus`
- `interactive`

Add app-specific variables for:

- touchscreen layered surfaces
- muted text
- inactive slot treatment
- effect families

### Surface model

Implement the dark layering model like this:

- outer terminal surround: absolute black
- main touchscreen canvas: near Carbon Gray 100
- raised panels: Gray 90-equivalent
- selected/focused or context surfaces: one layer lighter again

### Typography

- restrained, technical, and dense
- no decorative guitar-product typography
- large chain name is the main typographic focal point
- grid cell labels should abbreviate aggressively before truncating structure

## File and Architecture Instructions

Implement this as a new standalone package under `tui/`.

Recommended structure:

- `tui/quad_cortex_touchscreen/__init__.py`
- `tui/quad_cortex_touchscreen/model.py`
- `tui/quad_cortex_touchscreen/widgets.py`
- `tui/quad_cortex_touchscreen/app.py`
- `tui/quad_cortex_touchscreen/__main__.py`

Implementation notes:

- reuse `tui/theme/carbon.py`
- keep styling external in the shared `tui/styles/carbon.tcss`
- namespace all selectors to avoid impacting the existing unified console
- use reactive state and widget messages instead of a monolithic render function

## Testing Instructions

Add focused tests that prove:

- the app launches into `Grid`
- grid matrix size is `4x8`
- Gig View matrix size is `4x2`
- `1` selects `Chain`
- `2` selects `Stomp`
- `v` toggles `Gig View`
- arrow navigation moves the current selection
- `enter` or `space` toggles bypass in `Grid`
- `b` arms/disarms a stomp badge on a selected block
- `Gig View` tiles reflect the current mode semantics

## Documentation Instructions

Update TUI docs with:

- launch command
- scope statement that this is the touchscreen only
- shortcut summary
- note that the implementation is a Carbon-restyled clone, not an industrial-design replica

## Sources

- Neural DSP Quad Cortex User Manual 4.0.0: `https://neuraldsp.com/manual/quad-cortex`
- Neural DSP support manuals index: `https://support.neuraldsp.com/help/quad-cortex-user-manual`
- IBM Carbon 2x Grid overview: `https://carbondesignsystem.com/elements/2x-grid/overview/`
- IBM Carbon color overview: `https://carbondesignsystem.com/elements/color/overview/`
- Line 6 HX One Owner's Manual: `https://line6.com/data/6/0a0004220039697155cf001b7/application/pdf/HX%20One%20Owner%27s%20Manual%20-%20English%20.pdf`
- Line 6 Catalyst CX Pilot's Guide: `https://line6.com/data/6/0a00050b258a6643a695354da/application/pdf/Catalyst%20CX%20Pilot%27s%20Guide%20-%20English%20.pdf`
- Line 6 M13 Stompbox Modeler User's Manual: `https://line6.com/data/6/0a06434d113a6507f344f15dcc/application/pdf/M13%20Stompbox%20Modeler%20Users%20Manual%20-%20English%20%28%20Rev%20D%20%29.pdf`
- HeadRush Prime/Core preset rig colors: `https://support.headrushfx.com/en/support/solutions/articles/69000848879-headrush-prime-and-core-where-are-all-the-preset-rigs-`
- HeadRush effect and control list: `https://support.headrushfx.com/en/support/solutions/articles/69000801099-headrush-effect-and-control-list`

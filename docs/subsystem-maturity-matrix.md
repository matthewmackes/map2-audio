# MAP2 Subsystem Maturity Matrix

This matrix is the canonical readiness truth for major MAP2 subsystems. It exists so the UI, docs, and operators stop treating every implemented surface as equally ready.

The machine-readable source of truth is [subsystem-maturity-matrix.json](/home/mm/map2-audio/docs/subsystem-maturity-matrix.json).

## State definitions

- `production`: qualified and operator-safe by default
- `qualified-with-waiver`: credible, but still carrying documented caveats or qualification limits
- `beta`: substantial and useful, but not closed enough for default trust
- `experimental`: exploratory or incomplete; never present as routine workflow
- `hardware-blocked`: depends on unavailable hardware or qualification evidence and should stay hidden or explicitly blocked

## Canonical subsystem states

| Subsystem | State | Why |
| --- | --- | --- |
| Core audio engine and realtime runtime | `qualified-with-waiver` | Real implementation depth exists, but stability and measurement hardening still gate broad production trust. |
| Runtime profiles and RT hardening | `qualified-with-waiver` | Operationally meaningful and close to credible release use, but still needs stronger evidence gates. |
| AVB/TSN transport and routing | `qualified-with-waiver` | Strong implementation and qualification material, but still carries rollout/readiness caveats. |
| Tesira control and fleet workflows | `beta` | Broad and serious surface, but contract consistency and operator closure are not finished. |
| MIDI Hub and MIDI v2 workflows | `beta` | Deep control surface, but reliability hardening and workflow framing still lag. |
| Cluster deployment and orchestration | `beta` | Powerful, but not mature enough in auth, failure modeling, and operator safety. |
| Snapshots, sessions, presets, and exchange flows | `beta` | Useful, but still embedded in a control plane that overstates overall maturity. |
| MPX-1 integration | `beta` | Significant feature depth, still missing enough qualification closure. |
| PipeWire diagnostics and audio path tooling | `beta` | Valuable tools, but recovery and measurement contracts need hardening. |
| NAM/IR/Soundfont acquisition and scraper-driven libraries | `experimental` | Maintenance-heavy and too far from the core appliance story for default trust. |
| JUCE-GRID signal-flow editing and routing workflows | `beta` | `JUCE-GRID` is now the sole supported editor path, but workflow closure, validation depth, and dense-control polish still keep it below operator-safe default trust. |
| LCD and dedicated hardware panels | `hardware-blocked` | Only meaningful when the required hardware and qualification evidence are present. |

## Default UI and navigation policy

- `production` and `qualified-with-waiver` are the only states eligible for default navigation.
- `beta` may appear in advanced navigation, but not as equal-priority peer to operator-safe workflows.
- `experimental` must carry an explicit label in navigation and page headers.
- `hardware-blocked` should stay hidden unless the required hardware or deployment mode is detected.
- Every subsystem shown by default must link to its operational evidence or waiver context.

## Implementation plan

`T085` defines the truth. `T090` will apply it across the UI.

`T090` should implement the following:

1. Attach a maturity state to each navigation entry and top-level page family.
2. Promote only `production` and `qualified-with-waiver` routes into default navigation.
3. Group `beta` and `experimental` routes into clearly labeled advanced sections.
4. Add page-header badges using the exact state names from this matrix.
5. Hide or block `hardware-blocked` routes when the corresponding hardware/mode is absent.

## Acceptance criteria for keeping labels current

- Every new major subsystem or page family must declare one canonical maturity state before entering default navigation.
- Any maturity change must update both this matrix and the linked worklist/evidence item in the same change.
- No experimental or hardware-blocked surface may appear in default navigation without an explicit exception note.
- UI labels must use the exact state names from this matrix instead of ad-hoc synonyms.

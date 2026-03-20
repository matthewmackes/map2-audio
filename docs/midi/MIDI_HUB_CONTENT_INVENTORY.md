# MIDI Hub Content Inventory (T203-subJ)

Date: 2026-03-19
Owner: Codex
Scope: `web/src/app/pages/MidiHubShell.tsx`, `web/src/app/pages/midi-hub/*`, and `web/src/app/components/MidiHub/*`

## 1. Product Direction

The active `/midi-hub` route is now an advanced operator workspace, not a guided-learning surface.

- IBM Carbon is the required UI system across the route shell and connected MIDI Hub panels.
- The page is ordered by operational depth: establish signal path first, then show control, then network/protocol, then message processing, then experimental features.
- Contextual help rails, tours, guided overlays, and tutorial-heavy framing are out of scope for the shipped route.
- Short section framing is allowed; long explanatory copy is not.

## 2. Terminology Normalization Map

| Legacy wording | Shipped wording | Usage rule |
| --- | --- | --- |
| Matrix/Patchbay toggle | Routing workspace view | Present matrix and patchbay as one workspace with two views |
| Quick recall | Preset recall | Use preset terminology consistently in the header and preset panel |
| Traffic monitor | Event monitor | Use event terminology for live message inspection |
| Filter blueprint | Message filter | Use MIDI message terminology, not planning jargon |
| Mapper blueprint | Message map | Use mapping/translation language, not generic “blueprint” wording |
| Innovation controls | Advanced and experimental | Always label these panels as advanced/experimental |
| Slots | Program change slots | Use PC terminology where relevant |

## 3. Route Information Architecture

The shipped route is a routed shell with one index entry point plus seven child workspaces:

1. `/midi-hub`
   - Operator landing shell with status bar, area cards, and current-route summary
2. `/midi-hub/connections`
   - Routing workspace
   - Event monitor
   - Quick routing and patch inspection
3. `/midi-hub/presets`
   - Preset save and recall
   - Program change slots and preset chaining
4. `/midi-hub/transport`
   - Clock engine
   - Recorder and playback capture
5. `/midi-hub/events`
   - Message filtering
   - Message mapping
   - Event list review
6. `/midi-hub/processing`
   - Script engine
   - Macros
   - Scheduled MIDI events
7. `/midi-hub/network`
   - RTP-MIDI and OSC bridge
   - MIDI 2.0 workspace
8. `/midi-hub/lab`
   - AI-assisted mapping suggestions
   - Mesh route publication
   - Device shadow drift tools
   - Tesira TTP control surface
   - Virtual GPIO triggers
   - String interface console
   - OSC namespace browser

## 4. Panel Inventory and Operational Role

| Panel ID | Capability family | Primary controls | Operator role in shipped workflow |
| --- | --- | --- | --- |
| `routing` | Signal path | Matrix cells, patchbay links, route editor | Create and inspect the working route first |
| `traffic` | Signal path | Search, sort, pause, export, event detail | Confirm ingress, route flow, and destination traffic |
| `presets` | Show control | Save, recall, compare, default, program change, preset chain | Lock and recall known-good states |
| `clock` | Show control | BPM, source mode, start/continue/stop, tap | Establish transport ownership after routing is proven |
| `recorder` | Show control | Record, playback, export, delete | Capture and replay evidence after setup |
| `network` | Network and protocol | Session create/delete, test send, OSC controls | Add remote peers after the local route is stable |
| `midi2` | Network and protocol | Protocol enable, discovery, profile/property, translation | Inspect MIDI 2.0 posture and translation readiness |
| `filters` | Message processing | Channel and message-family choices | Narrow traffic deliberately after baseline routing |
| `mapper` | Message processing | Source/target range and curve mapping | Stage message translation logic |
| `scripts` | Automation | Save, run, trigger, enable, stop, console | Execute advanced event-driven logic |
| `macros` | Automation | Macro save, trigger, delete | Bundle repeated actions behind one trigger |
| `scheduler` | Automation | Delayed send, cancel, clear-finished | Queue deterministic timed MIDI events |
| `innovation` | Experimental | AI learn suggestions, mesh, shadow sync | Isolated advanced/experimental control surface |
| `tesira` | Experimental control | Connect, subscribe, command, matrix aliases | Drive Tesira TTP objects from the Lab workspace |
| `virtual-gpio` | Experimental control | Trigger bank, labels, momentary/latch modes | Exercise virtual contact closures without leaving MIDI Hub |
| `string-interface` | Experimental control | Send line, command history, response feed | Probe text-oriented device integrations |
| `osc-namespace` | Experimental control | Namespace browser, node details, value send | Inspect and drive the routed OSC namespace surface |

## 5. Carbon and Accessibility Implementation Notes

- Route shell uses one Carbon-layered landing page that hands off to child routes rather than one long sequential workspace.
- Route and panel headers use concise titles plus Carbon `Tag` status framing only.
- Touched MIDI Hub panels no longer import MUI/Ariakit/Phosphor controls.
- Dense editors use Carbon `TextInput`, `TextArea`, `Select`, `Checkbox`, `Button`, `Tag`, `Table*`, and `Modal` primitives, plus Carbon tokenized custom SVG/table states where Carbon has no native equivalent.
- The routing matrix remains a custom interaction surface, but it is now tokenized to Carbon and backed by semantic table structure and Carbon modal editing.
- The patchbay remains a custom SVG topology view, but it now uses Carbon tokens and Carbon controls for state and actions.
- The Lab route splits device-control and namespace tools into separate Carbon panels so experimental controls stay scannable at iPad width.

## 6. Validation Signals

| Goal | Required panels | Validation signal |
| --- | --- | --- |
| Connect a device and confirm signal | `routing`, `traffic` | Inputs and outputs visible, route exists, events visible |
| Recall a stable show state | `presets`, `routing` | Recall succeeds and route remains present |
| Start transport clock | `clock`, `traffic` | Clock running plus visible timing traffic |
| Add a remote peer | `network`, `routing` | RTP session exists and route references the endpoint |
| Troubleshoot no-signal | `routing`, `traffic`, `presets` | Ports visible, route state visible, ingress visible, rollback available |
| Verify Tesira or GPIO control path | `tesira`, `virtual-gpio`, `string-interface`, `osc-namespace` | Command round-trip, control state update, and namespace/browser response visible |

## 7. Drift Removed In T203

- Removed route-level tab-stack workflow in favor of ordered operator bands.
- Removed guided-help assumptions from the route plan and content inventory.
- Removed route-local MUI controls from touched MIDI Hub panels.
- Replaced mixed terminology with MIDI-standard panel names and section labels.
- Increased spacing and tokenized surfaces so dense tools share one Carbon visual system.

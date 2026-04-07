# Enriched MIDI Physical Surfaces

This note captures the first architecture posture for the `Enriched_MIDI_Physical_Surfaces` stack and the firmware/update posture for the requested controller families.

## Local host findings

- Date captured: 2026-04-07
- Native Instruments Maschine MK1 is visible on this Linux host as USB `17cc:0808`.
- The kernel binds the device through `snd-usb-caiaq`.
- ALSA exposes a MIDI endpoint for the device.
- The host does not expose Maschine MK1 as a normal PCM playback/capture interface here.
- MAP2 should therefore model Maschine MK1 as a MIDI-capable control surface with a richer vendor feedback path, not as an audio interface.
- USB descriptor evidence on this host shows a vendor-specific interface with:
  - alternate setting `0`: bulk `0x01` OUT and `0x81` IN
  - alternate setting `1`: bulk `0x01` OUT, `0x81` IN, `0x08` OUT, and `0x84` IN
- The Linux-facing rich path should therefore prefer the richer alternate-setting `1` pair `0x08` OUT and `0x84` IN when a userspace bulk transport is available and safe to claim.

## Shared architecture posture

The canonical stack should be split into five layers:

1. Discovery
- USB/sysfs probe
- sound/procfs MIDI probe
- service-health adapters for existing device families

2. Transport
- Generic MIDI input/output
- Rich feedback transport for pads, LEDs, LCDs, displays, scribble strips, and motorized state
- SysEx transport for backup/restore and memory devices
- MCU protocol transport for Mackie-family surfaces
- Profile/template transport for template-oriented controllers

3. Surface runtime
- Shared capability model
- Transport availability and health
- Firmware/update posture
- Per-family specialization hooks

4. Rendering and feedback
- Shared LED state diffing where possible
- Shared display/scribble-strip render API where possible
- Shared scene/profile activation semantics where possible

5. Operator GUI
- `/physical-surfaces` for the unified overview
- `/physical-surfaces/:surfaceId` for per-device posture
- Existing specialized routes remain attached where they already provide value

## Operator contract

The shared operator contract is now:

- Primary role: synth control
- Secondary roles: transport, diagnostics, snapshots, routing, and maintenance live in submenus or dedicated views
- Multi-synth control: parallel
- View synchronization: each connected surface keeps its own independent page/view
- Layout model: fixed zones and pages per device family
- Targeting policy: auto-follow the most recently touched or armed target
- Snapshot strategy: primarily pass through externally authored MIDI-program/control configurations
- Firmware support: official and community firmware paths are both allowed, with community flows treated as first-class
- Advanced tooling: every device family should expose an integrated per-device surface lab

## Implemented shared runtime pieces

The current implementation now includes:

- A shared runtime contract module for fixed per-family view/page definitions
- A shared per-surface session service for:
  - current-view overrides
  - follow-runtime reset
  - recent-target tracking
- Unified summary integration that resolves:
  - derived runtime view
  - operator override view
  - recent target
  - per-family lab snapshot data
- Unified API endpoints for:
  - summary
  - per-unit detail
  - per-unit current-view updates
  - per-unit recent-target updates
- Maschine-specific transport policy endpoints and UI wiring for:
  - current transport-policy snapshot
  - runtime preference updates (`auto`, `hidapi`, `pyusb-bulk`)
  - explicit kernel-detach posture on Linux hosts

## Maschine MK1 transport adapter policy

Maschine MK1 no longer needs to be treated as a hardcoded `hidapi` path inside the daemon.

The daemon now supports a transport-controller policy with:

- `auto`
- `hidapi`
- `pyusb-bulk`

Current behavior:

- `auto` prefers `hidapi` when the host exposes the device through userspace HID
- if `hidapi` is not viable, the daemon probes a `pyusb-bulk` candidate
- `pyusb-bulk` is conservative by default and does not detach kernel drivers unless explicitly enabled
- the Linux sysfs probe now parses the raw USB descriptor blob and exposes the preferred alternate setting and bulk endpoint pair even when `pyusb` is not installed
- bulk-endpoint selection prefers the richest alternate setting and the highest-address bulk IN/OUT pair, which matches the connected MK1’s `0x08` OUT and `0x84` IN topology on this host
- when `pyusb-bulk` is used, the transport now records the chosen alternate setting and selected bulk endpoints in runtime status

Environment knobs:

- `MAP2_MASCHINE_TRANSPORT`
- `MAP2_MASCHINE_ALLOW_KERNEL_DETACH`

Operational posture:

- Safe default on Linux is to probe and report candidate posture without forcing kernel detach
- The daemon now publishes selected transport and transport candidates through the Maschine status model
- The unified physical-surface shell and Maschine page both expose this transport posture
- The dedicated Maschine page now exposes transport policy controls plus endpoint-level candidate details so the operator can see the real MK1 USB posture before forcing a richer claim path

## Device-family posture

### Native Instruments Maschine MK1

- Treat as a hybrid surface:
  - raw MIDI path for note/CC/transport
  - vendor feedback path for LEDs and LCDs
- Do not model it as an audio interface on this host.
- Reuse Push-style surface lifecycle and renderer abstractions where they fit, but keep the transport adapter separate because the host path is not the same.
- High-value targets:
  - pad LEDs
  - dual LCD rendering
  - encoder rings/state
  - transport and group-button feedback

### Ableton Push

- Use Push as the baseline implementation for rich-surface runtime ownership.
- Shared abstractions worth reusing:
  - runtime lifecycle
  - frame/render scheduling
  - light/display state reconciliation
  - device health and discovery modeling

### Voodoo Lab Ground Control Pro

- Keep this on the SysEx-specialized branch of the shared stack.
- Focus on:
  - memory backup/restore
  - structured validation
  - safe transmit/retry rules
- Do not force it into the same renderer model as Push or Maschine.

### MeloAudio MIDI Commander

- Treat as a profile-driven controller family first.
- Keep stock workflows straightforward.
- Expose advanced DFU/custom-firmware paths only as explicit expert features.

### Novation Launch Control

- Treat as a template/profile-oriented controller family with LED feedback.
- Priorities:
  - template import/export
  - custom-mode/profile awareness
  - bidirectional LED feedback

### Mackie MCU Pro

- Give it a dedicated MCU protocol branch.
- Priorities:
  - motor faders
  - VPots
  - scribble strips
  - transport
  - meter bridge
- Do not flatten MCU Pro into a generic CC-only controller abstraction.

## Firmware and update posture

### Maschine MK1

- Best official path: Native Instruments downloads and hardware updater resources, plus Controller Editor and MIDI templates.
- MAP2 should not own firmware flashing for Maschine.
- MAP2 should separate:
  - official maintenance/update workflows
  - runtime control-surface enrichment

Sources:
- https://www.native-instruments.com/en/products/maschine/production-systems/maschine-studio/downloads-all-maschine/
- https://support.native-instruments.com/hc/en-us/articles/7083345683857-What-is-Controller-Editor
- https://support.native-instruments.com/hc/en-us/articles/210264165-My-Native-Instruments-Controller-does-not-Appear-in-Controller-Editor
- https://support.native-instruments.com/hc/en-us/articles/4410096148113-My-Native-Instruments-Hardware-Device-is-Not-Recognized

### Ableton Push

- Best official path: let Ableton Live manage firmware.
- MAP2 should target runtime integration, not a replacement updater.

Sources:
- https://help.ableton.com/hc/en-us/articles/8483316601372-Setting-Up-Push-3

### Ground Control Pro

- Official firmware updates are EPROM-era maintenance, not a normal USB updater flow.
- MAP2 should focus on SysEx-safe backup/restore and configuration workflows.

Sources:
- https://voodoolab.com/wp-content/uploads/2022/08/ground_control_pro_manual.pdf
- https://wp.voodoolab.com/forum/viewtopic.php?t=6327

### MeloAudio MIDI Commander

- Current official vendor update posture is weak and should be treated as legacy until directly revalidated with hardware in the loop.
- Community custom firmware exists and uses the DFU process.
- MAP2 should keep custom firmware support explicitly optional and advanced.

Sources:
- https://github.com/harvie256/midi-commander-custom

### Novation Launch Control

- Best official path: Novation Components.
- This fits well with MAP2 profile/template management.

Sources:
- https://support.novationmusic.com/hc/en-gb/articles/31181516178962-Launch-Control-XL-3-gaining-access-to-additional-USB-MIDI-ports-on-macOS-after-updating
- https://support.novationmusic.com/hc/en-gb/related/click?data=BAh7CjobZGVzdGluYXRpb25fYXJ0aWNsZV9pZGwrCBK1NDQDBDoYcmVmZXJyZXJfYXJ0aWNsZV9pZGkEF0RgDDoLbG9jYWxlSSIKZW4tZ2IGOgZFVDoIdXJsSSJJL2hjL2VuLWdiL2FydGljbGVzLzQ0MTE4MDcyODI0NTAtTGF1bmNoLUNvbnRyb2wtTUsxLUNvbXBvbmVudHMtZ3VpZGUGOwhUOglyYW5raQk%3D--ec7f2a05af1636bd41151b622f384df3d8821d3d

### Mackie MCU Pro

- Best official path: the published MIDI-file firmware updater.
- MAP2 should expose this as an explicit maintenance operation, while day-to-day support stays protocol-first.

Sources:
- https://mackie.com/img/file_resources/MCU%20Pro%20Firmware%20Update%20Instructions.pdf
- https://mackie.com/img/file_resources/MCU_Pro-XT_Pro_OM.pdf

## Immediate follow-up work

- Extract a shared rich-surface runtime from the existing Push stack.
- Validate actual MK1 vendor-bulk payload semantics on hardware so the preferred `0x08` OUT / `0x84` IN path can be promoted from endpoint-aware candidate logic to production LCD/LED transport.
- Add a controller-profile branch for Launch Control and MIDI Commander.
- Add an MCU runtime branch for Mackie MCU Pro.
- Keep Ground Control Pro on the SysEx-specialized branch, but inside the same unified surface shell.

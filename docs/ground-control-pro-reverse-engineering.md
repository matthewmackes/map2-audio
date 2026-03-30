# Ground Control Pro Reverse Engineering

## Sources
- Ground Control Pro manual: official `XMIT MEM` and `RECEIVE MEM` SysEx workflow.
- Voodoo Lab forum trace: confirms `F0 00 00 07 10` preamble and long-message SendSX guidance.
- Community editor UI and `gcp.js`: establishes the currently implemented whole-memory geometry and field starting points.

## Implemented Binary Profile
- Profile id: `v1_13_bulk_dump`
- Total bytes: `16567`
- Preamble: `F0 00 00 07 10`
- Config block: `161` bytes
- Presets: `200 * 82` bytes
- Terminator: `F7`

## Confidence Posture
- `confirmed`: transport/header geometry and `soft_options_raw` bitfield handling anchored by public artifacts.
- `inferred`: device, pedal, GCX, utility, instant-access, and preset field positions derived from the public editor layout and exposed in the field map.
- `unknown_reserved`: bytes preserved and surfaced read-only until hardware-backed deltas confirm meaning.

## Fixture Strategy
- `tests/fixtures/ground_control_pro/*.syx` is generated deterministically from the implemented profile using `scripts/generate_ground_control_pro_fixtures.py`.
- These fixtures are structurally valid and useful for regression coverage, but they are synthetic and not a substitute for hardware captures.
- `manifest.yml` records firmware tag, intended delta, SHA-256, and synthetic/hardware-verified flags for each fixture.

## Evidence Workflow
1. Capture a baseline dump from hardware with `python -m app.services.ground_control_pro.cli backup`.
2. Capture controlled single-delta dumps on hardware.
3. Use `python -m app.services.ground_control_pro.cli diff before.syx after.syx` for byte deltas.
4. Use `python -m app.services.ground_control_pro.cli field-map-update before.syx after.syx --out delta.json` to generate machine-reviewable update candidates.
5. Promote fields from `inferred` or `unknown_reserved` only after the controlled delta is confirmed.

## Remaining Hardware Qualification
- Factory/default dump from a real Ground Control Pro running the target firmware.
- Single-delta hardware confirmation for preset name, device MIDI channel, instant-access assignment, pedal assignment, and preset device-program change.
- Unchanged dump retransmit acceptance, post-power-cycle re-dump identity, and edited writeback verification.

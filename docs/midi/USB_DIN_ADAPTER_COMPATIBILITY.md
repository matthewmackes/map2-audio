# MAP2 MIDI Hub USB-to-DIN Adapter Compatibility

Last updated: 2026-03-09 (Codex)

## Scope
This guide validates the MAP2 MIDI Hub behavior when USB-to-DIN adapters are used as physical I/O pipes. MAP2 provides routing, filtering, SysEx handling, presets, and automation; the adapter only provides transport.

## Current Validation State
- Environment used in this run: `/home/mm/map2-audio` host runtime.
- Blocking condition encountered: ALSA sequencer access unavailable in this execution environment (`open /dev/snd/seq failed`).
- Result: physical adapter verification for specific hardware SKUs cannot be executed in this run.

### Evidence from this run
```bash
aconnect -l
# ALSA lib seq_hw.c:540:(snd_seq_hw_open) [error.sequencer] open /dev/snd/seq failed
# can't open sequencer

amidi -l
# Dir Device Name

python3 -c "from app.services.midi_hub.ports import discover_alsa_port_descriptors; print(discover_alsa_port_descriptors())"
# []
```

## Automated (Hardware-Independent) Coverage
The following MAP2 tests were executed to validate USB-DIN relevant behavior in simulation:

```bash
pytest -q tests/midi_hub/test_device_registry.py tests/midi_hub/test_gateway.py tests/midi_hub/test_traffic_routes.py
```

Covered behaviors:
- Port/profile matching (including generic USB-DIN profile patterns).
- Bidirectional gateway probe and latency measurement path.
- Route, macro, recorder, scheduler, and network mesh API surfaces that USB-DIN adapters rely on.
- Hot-unregister/reconnect state transitions in gateway and registry logic.

## Physical Adapter Matrix (Pending Hardware Run)

| Adapter | Detection | SysEx pass-through | Latency sample | Hot-plug recovery | Notes |
|---|---|---|---|---|---|
| CME H2MIDI Pro | Pending | Pending | Pending | Pending | Optional standalone preset mode section below |
| Roland UM-ONE mk2 / Generic USB-MIDI cable | Pending | Pending | Pending | Pending | Generic class-compliant baseline |
| MOTU micro lite / iConnectivity mioXM | Pending | Pending | Pending | Pending | Multi-port naming and jitter characterization |

## Lab Procedure (When Hardware Is Connected)
1. Connect adapter to host and run:
```bash
aconnect -l
amidi -l
python3 -c "from app.services.midi_hub.ports import discover_alsa_port_descriptors as d; import json; print(json.dumps(d(), indent=2))"
```
2. Start hub and refresh registry:
```bash
curl -X POST http://localhost:8080/api/midi/hub/start
curl -X POST http://localhost:8080/api/midi/hub/devices/refresh
curl http://localhost:8080/api/midi/hub/status
```
3. Verify SysEx pass-through with loop/device target:
```bash
# Example identity request payload
curl -X POST http://localhost:8080/api/midi/hub/network/sessions/<session>/send \
  -H 'Content-Type: application/json' \
  -d '{"message":[240,126,127,6,1,247]}'
```
4. Capture traffic and latency evidence:
```bash
curl "http://localhost:8080/api/midi/hub/traffic/snapshot?limit=200"
curl "http://localhost:8080/api/midi/hub/network/sessions"
```
5. Hot-plug test:
- Unplug adapter.
- Wait up to 10s.
- Re-run status/refresh and confirm recovery.

## Optional CME H2MIDI Pro Standalone Notes
MAP2 does not depend on CME standalone behavior. If used:
- Configure CME preset/routing in HxMIDI Tool.
- Keep CME in transparent forwarding mode for MAP2-managed routing.
- Disable duplicate transform/remap rules on CME to avoid double-processing with MAP2.

## Recommendation
- Required minimum: any class-compliant USB-MIDI adapter that supports stable SysEx transfer.
- Preferred: interfaces with explicit Linux ALSA naming and low jitter under sustained CC streams.

## Next Action to Close Task
Run the physical matrix above on a host with `/dev/snd/seq` access and attached adapters, then replace `Pending` cells with measured values and quirks.

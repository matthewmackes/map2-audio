# T066 USB-to-DIN Adapter HIL Runbook

Date: 2026-03-14
Scope: `T066-subQ` physical USB-to-DIN adapter compatibility capture

## Purpose

Execute the remaining adapter-validation work with one repeatable command path that:

- captures ALSA sequencer readiness (`aconnect -l`, `amidi -l`)
- records current MIDI Hub lifecycle/status evidence
- optionally sends a MIDI Identity Request through a configured network session
- writes a single JSON/markdown bundle for the compatibility matrix

Hot-plug recovery still requires a manual unplug/replug cycle, but the same runner is used before and after the cable event so evidence stays consistent.

## Preconditions

Before running the capture, confirm all of the following:

- the test host exposes `/dev/snd/seq`
- the target adapter is connected and visible to ALSA tools
- the MAP2 backend is reachable at `http://127.0.0.1:8080`
- if SysEx smoke-send is required, a matching MIDI Hub network session already exists

If `/dev/snd/seq` is unavailable or the adapter is not visible in `aconnect -l` / `amidi -l`, the runner exits `2` and records `BLOCKED`.

## Command

Baseline capture:

```bash
python3 scripts/run_t066_usb_din_adapter_qualification.py \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t066/<adapter-slug>/baseline \
  --adapter-label "Roland UM-ONE mk2" \
  --adapter-name-pattern "UM-ONE"
```

Optional SysEx smoke-send through an existing session:

```bash
python3 scripts/run_t066_usb_din_adapter_qualification.py \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t066/<adapter-slug>/baseline \
  --adapter-label "CME H2MIDI Pro" \
  --adapter-name-pattern "H2MIDI" \
  --session-id mpx1_usb_din_bridge
```

## Manual Hot-Plug Procedure

1. Run the baseline capture command.
2. Unplug the adapter.
3. Wait up to `10` seconds.
4. Reconnect the adapter.
5. Run the same command again into a second output directory, for example:

```bash
python3 scripts/run_t066_usb_din_adapter_qualification.py \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t066/<adapter-slug>/after-replug \
  --adapter-label "Roland UM-ONE mk2" \
  --adapter-name-pattern "UM-ONE"
```

Compare the two summary files to confirm:

- adapter detection returned after replug
- MIDI Hub status remained reachable
- the same adapter naming/path is stable enough for documentation

## Outputs

The runner writes:

- `t066-usb-din-adapter-qualification.json`
- `T066_USB_DIN_ADAPTER_QUALIFICATION.md`
- `raw/aconnect.stdout.txt`
- `raw/amidi.stdout.txt`
- `raw/alsa_discovery.stdout.txt`
- `raw/hub_start.json`
- `raw/hub_status.json`
- `raw/network_sessions.json`
- `raw/traffic_snapshot_before.json`
- optional `raw/network_send_identity_request.json`
- optional `raw/traffic_snapshot_after.json`

## Exit Codes

- `0`: baseline evidence captured; summary will show `PASS` or `PARTIAL`
- `1`: requested SysEx smoke-send failed
- `2`: prerequisites blocked execution (`/dev/snd/seq`, adapter visibility, or MIDI Hub API)

## Matrix Close-Out

After each adapter run, update [USB_DIN_ADAPTER_COMPATIBILITY.md](/home/mm/map2-audio/docs/midi/USB_DIN_ADAPTER_COMPATIBILITY.md) with:

- detection result
- SysEx pass-through result
- latency or timing observations
- hot-plug recovery outcome
- any naming quirks or adapter-specific caveats

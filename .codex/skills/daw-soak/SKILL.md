---
name: daw-soak
description: Run the T2503 DAW-mode soak — 30 minutes of random clip launches + plugin reorder + tempo nudges through the daw.* engine_command path, collecting xrun + peak-jitter + CPU evidence. Use when validating DAW mode after Set 7+ wires DawDeviceManager into the live audio path; the run is the mandatory tier-1 declaration gate (locked decision A19).
---

# DAW Soak (T2503 Set 10)

Run the harness in this skill to execute the canonical DAW-mode soak:

- random clip launches across the active project's tracks
- random plugin reorder (add → remove → re-add)
- tempo nudges (set_position scrub) at random intervals
- xrun + peak-jitter + CPU sampling at 1 Hz
- evidence captured under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2503-daw-soak/`

## Prerequisites

Bench-side gates that must be in place before this soak passes:

1. Engine built with `-DMAP2_DAW_MODE=ON` (use `scripts/build_juce_engine_daw.sh`).
2. `MAP2_AUDIO_PREFER_JACK=1` set in the systemd unit (see standing rule
   `feedback_jack_direct_required`).
3. UA-1000 attached + isolated CPUs 4,5 (verify via `cat /proc/cmdline`).
4. Set 7 lifecycle wiring — DawDeviceManager actually claims the audio
   device on `enterDawMode()` (Set 7 ships the skeleton; the bench-gate
   slice fills in real device acquisition).

Until item 4 lands, this harness runs in **dry-run mode** — it dispatches
the verbs through `/api/v1/daw/*` but the engine doesn't produce audio.
Dry-run is useful for verifying the verb-dispatch path + soak harness
itself doesn't drop frames; it does NOT satisfy the tier-1 declaration
gate.

## Pass criteria (locked decision A19)

| Metric | Threshold |
| --- | --- |
| xruns over 30 min | 0 |
| Peak block jitter | < 1 ms |
| Internal graph buffer | 128 samples |
| Device callback buffer | 64 samples (Tier-A locked) |
| Sample rate | 48 kHz |
| Random clip launches | ≥ 50 over the 30-min window |
| Random plugin reorders | ≥ 20 over the 30-min window |

A passing run produces:
- `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2503-daw-soak/run.json`
- `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2503-daw-soak/run.md`
- `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2503-daw-soak/xrun-trace.csv`

## Commands

Dry-run smoke (1 minute):

```bash
python3 .codex/skills/daw-soak/scripts/run_daw_soak.py \
  --duration-seconds 60 \
  --dry-run
```

Full release-grade soak (30 minutes):

```bash
python3 .codex/skills/daw-soak/scripts/run_daw_soak.py \
  --duration-seconds 1800 \
  --clip-launch-interval-seconds 25 \
  --plugin-rotation-seconds 90 \
  --tempo-nudge-seconds 60 \
  --evidence-dir docs/fit-for-purpose-evidence/$(date +%Y%m%d)/t2503-daw-soak/
```

The harness exits non-zero if any pass-criteria threshold is exceeded.

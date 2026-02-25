# SynthForge T011 Remediation Report (2026-02-24)

## Scope

Remediate host-side real-time behavior after `T010` Tier A soak failure and re-qualify with the same SynthForge stress harness at locked settings:

- `48kHz`, `64` buffer
- voice cycle `8/16/32/64`
- strict gates: `xruns == 0`, peak jitter `<= 0.2ms`, headroom `>= 30%`, budget utilization `<= 70%`

## Remediation Actions Applied

1. Host runtime pinning for soak process: `taskset -c 2,3` + `chrt -f 60`.
2. PipeWire JACK wrapper comparison run: `pw-jack` (kept default JUCE ALSA selection in this host profile).
3. JUCE callback timing hardening:
   - switched callback interval timing from `std::high_resolution_clock` to `std::steady_clock` in `JuceAudioIO`.
4. JUCE recovery-thread lifecycle hardening in `JuceAudioIO`:
   - removed detached recovery-thread risk by introducing explicit shutdown gating and join behavior.
5. Regression verification:
   - `pytest -q tests/test_juce_engine_audio_start_stability.py` (pass).

## Evidence Matrix

| Run | Duration | Xruns | Xruns/min | Peak jitter (ms) | Mean jitter (ms) | Result |
|---|---:|---:|---:|---:|---:|---|
| Baseline `T010` (`synthforge-tier-a-soak-30m.json`) | 1800.197s | 2579 | 85.96 | 38.401 | 0.827 | FAIL |
| RT pinned (`synthforge-tier-a-soak-rtpin-5m.json`) | 300.164s | 231 | 46.17 | 23.971 | 0.811 | FAIL |
| RT pinned + `pw-jack` (`synthforge-tier-a-soak-rtpin-pwjack-5m.json`) | 300.165s | 223 | 44.58 | 23.252 | 0.810 | FAIL |
| RT pinned + steady-clock fix (`synthforge-tier-a-soak-rtpin-steadyclock-5m.json`) | 300.165s | 180 | 35.98 | 23.375 | 0.812 | FAIL |
| RT pinned + steady-clock extended (`synthforge-tier-a-soak-rtpin-steadyclock-10m.json`) | 600.184s | 24094 | 2408.66 | 27.252 | 0.634 | FAIL |

## Best-Run Threshold Check (RT pinned + steady-clock)

- Xruns `<= 0`: **FAIL** (`180`)
- Peak callback jitter `<= 0.2ms`: **FAIL** (`23.375ms`)
- Min headroom `>= 30%`: **PASS** (`58.74%`)
- Peak budget utilization `<= 70%`: **PASS** (`41.31%`)
- Voice tracking target coverage: **PASS**

## Additional Blocker Found

Forced JACK backend is currently unstable:

```bash
MAP2_AUDIO_PREFER_JACK=1 python3 -u /tmp/repro_jack_noshutdown.py
```

Observed outcome on this host:

- process exits with `SIGSEGV` (`RC=139`) shortly after `start_audio`.

This requires separate callback-path crash triage before JACK can be considered production-ready for Tier A validation.

## Recommendation

**NO-GO for enterprise Tier A sign-off on this host** at this time.

Progress is real (xrun density reduced from `85.96/min` to `35.98/min` in best remediation run), but strict timing gates remain unmet and forced JACK is crashing. Proceed with:

1. `T012`: forced-JACK crash root-cause + regression hardening.
2. `T013`: privileged host RT tuning and full-duration (`>=30m`) re-qualification outside unprivileged command-session limits.

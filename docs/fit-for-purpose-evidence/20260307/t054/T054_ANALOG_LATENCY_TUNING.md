# T054 Analog Interface Latency A/B Tuning (2026-03-07)

## Scope
- Objective: lower analog-path latency for EDIROL UA-1000 without introducing xruns/instability.
- Method: baseline -> Pro Audio profile -> Pro Audio + WirePlumber period tuning -> re-measure.

## Baseline (multichannel profile)
- UA-1000 profile: `output:multichannel-output+input:multichannel-input` (index `1`).
- Node properties:
  - `api.alsa.period-size=36`
  - `api.alsa.period-num=910`
  - `api.alsa.headroom=36`
- API diagnostics:
  - `buffer_latency_ms=1.333`
  - `device_input_latency_ms=4.0`
  - `device_output_latency_ms=4.0`
  - `device_total_latency_ms=9.333`
  - `pipewire_total_latency_ms=2.667`

## Change 1: Switch UA-1000 to Pro Audio profile
- Command: `wpctl set-profile 48 3`
- Observed node geometry (Pro nodes):
  - `api.alsa.period-size=64`
  - `api.alsa.period-num=3`
  - `api.alsa.headroom=0`
- API diagnostics: unchanged (`device_total_latency_ms=9.333`, `pipewire_total_latency_ms=2.667`).
- Stability: `xrun_count=0`.

## Change 2: Force lower period count via WirePlumber rule
- Added user override:
  - `~/.config/wireplumber/wireplumber.conf.d/51-ua1000-low-latency.conf`
  - Sets `api.alsa.period-size=64`, `api.alsa.period-num=2`, `api.alsa.headroom=0` for UA-1000 Pro input/output nodes.
- Restarted user audio stack (`wireplumber`, `pipewire`, `pipewire-pulse`) and backend (`map2-backend`).
- Verified node properties:
  - Pro output: `api.alsa.period-num=2`
  - Pro input: `api.alsa.period-num=2`
- API diagnostics after restart: still unchanged (`device_total_latency_ms=9.333`, `pipewire_total_latency_ms=2.667`).
- Stability: `xrun_count=0`.

## Outcome
- Kept Pro Audio profile and the UA-1000 WirePlumber low-latency override.
- No regressions observed in immediate health/xrun checks.
- API latency telemetry did not reflect a numeric reduction despite lower hardware period count in live node properties.

## Evidence files
- `latency-baseline.json`
- `latency-pro-audio.json`
- `latency-periodnum2.json`
- `pipewire-latency-baseline.json`
- `pipewire-latency-pro-audio.json`
- `pipewire-latency-periodnum2.json`
- `xruns-pro-audio.json`
- `xruns-periodnum2.json`
- `wpctl-status-baseline.txt`
- `wpctl-status-pro-audio.txt`
- `wpctl-status-periodnum2.txt`
- `ua1000-sink-node-baseline.txt`
- `ua1000-source-node-baseline.txt`
- `ua1000-sink-node-periodnum2.txt`
- `ua1000-source-node-periodnum2.txt`
- `ua1000-device-pro-audio.txt`
- `ua1000-profiles-baseline.txt`
- `51-ua1000-low-latency.conf`

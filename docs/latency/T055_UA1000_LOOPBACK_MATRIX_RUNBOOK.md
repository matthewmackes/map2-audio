# T055 UA-1000 Loopback Matrix Runbook

Date: 2026-03-14
Scope: `T055` physical analog loopback validation on UA-1000

## Purpose

Execute the remaining `T055` acceptance work with one restart-safe command path that:

- verifies UA-1000 visibility in the current JACK graph
- runs the required `3x` tuned + `3x` rollback loopback matrix through `scripts/measure_latency.sh`
- emits a single JSON/markdown summary bundle under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t055/`
- leaves the steady-state low-latency override restored after the matrix

## Preconditions

Before running the matrix, confirm all of the following:

- UA-1000 is the active PipeWire/JACK audio device
- the physical analog loopback patch is present on the UA-1000 test path
- JACK exposes UA-1000 playback and capture ports
- the backend is reachable at `http://127.0.0.1:8080`
- the tuned override file still exists at `~/.config/wireplumber/wireplumber.conf.d/51-ua1000-low-latency.conf`

If UA-1000 is not visible in `jack_lsp`, the runner exits `2` and records `BLOCKED`.

## Condition Setup

Known commands from the prior T054/T055 evidence:

- Pro Audio profile: `wpctl set-profile 48 3`
- Tuned condition: Pro Audio profile plus the `51-ua1000-low-latency.conf` override active
- Rollback condition: Pro Audio profile with the override temporarily removed or disabled so live nodes return to `api.alsa.period-num=3`

The runner does not mutate WirePlumber state on its own. Instead, pass explicit setup and verification commands so the exact host-specific toggle path is logged into the artifact bundle.

Example verification commands:

```bash
wpctl inspect 58
wpctl inspect 59
```

## Command

```bash
python3 scripts/run_t055_ua1000_loopback_matrix.py \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t055 \
  --duration 15 \
  --trials 3 \
  --tuned-setup-cmd 'wpctl set-profile 48 3 && systemctl --user restart wireplumber pipewire pipewire-pulse && systemctl restart map2-backend' \
  --tuned-verify-cmd 'wpctl inspect 58 && wpctl inspect 59' \
  --rollback-setup-cmd 'wpctl set-profile 48 3 && systemctl --user restart wireplumber pipewire pipewire-pulse && systemctl restart map2-backend' \
  --rollback-verify-cmd 'wpctl inspect 58 && wpctl inspect 59' \
  --restore-cmd 'wpctl set-profile 48 3 && systemctl --user restart wireplumber pipewire pipewire-pulse && systemctl restart map2-backend'
```

If the UA-1000 ports are not the default `AUX0` pair, provide explicit routing:

```bash
python3 scripts/run_t055_ua1000_loopback_matrix.py \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t055 \
  --jack-playback-port 'EDIROL UA-1000 Pro:playback_AUX0' \
  --jack-capture-port 'EDIROL UA-1000 Pro:capture_AUX0'
```

## Outputs

The runner writes:

- `jack_lsp.txt`
- `t055-loopback-matrix-summary.json`
- `T055_UA1000_LOOPBACK_MATRIX_SUMMARY.md`
- per-condition `trial*.json`, `trial*.stdout.txt`, `trial*.stderr.txt`
- optional `setup.log`, `verify.log`, and `restore.log`

Expected artifact directory:

`docs/fit-for-purpose-evidence/<YYYYMMDD>/t055/`

## Exit Codes

- `0`: full tuned/rollback matrix captured
- `1`: UA-1000 was visible, but one or more trials/setup steps failed
- `2`: UA-1000 was not visible in JACK or the runner could not resolve UA-1000 ports

## Interpretation

- `PASS` means the required repeated measurements were captured and the summary includes a keep/rollback recommendation for `51-ua1000-low-latency.conf`
- `FAIL` means the host was close enough to run but cabling, routing, or condition setup still prevented a full matrix
- `BLOCKED` means the current host session is not actually on the UA-1000 path yet

## Current Host Note

The current coding host has repeatedly exposed `Jogg USB Audio` instead of UA-1000 in the JACK graph, so this runner is expected to exit `BLOCKED` here until the UA-1000 session is reactivated.

# T450 Restart And Tesira Retry Closure - 2026-03-27

## Root Cause Summary

- The slow restart path was a shutdown-path bug, not a steady-state service-stop timeout. `journalctl` for the `2026-03-27 07:47:54 EDT` restart showed `map2-backend.service: State 'stop-sigterm' timed out. Aborting.` followed by `SIGABRT`, even though `app/main.py` had a `5.0s` forced-exit watchdog. The runtime signal handler was still doing lock-based/logging work in the `SIGTERM` path, so the watchdog never became the reliable backstop it was supposed to be.
- The recurring Tesira-linked latency bursts were being amplified by the offline-device retry strategy. During the earlier T209 qualification window the backend repeatedly walked five unreachable Tesira hosts in a serialized loop every ~43 seconds and logged both telnet failures and useless SSH fallback failures even though `asyncssh` was not installed.

## Remediation

- `app/main.py`
  - Replaced signal-path logging with `_emit_shutdown_notice()` backed by `os.write(2, ...)`.
  - Removed lock usage from the runtime shutdown handler.
  - Kept the watchdog fallback minimal: sleep, emit one stderr notice, then `os._exit(0)`.
- `app/services/tesira/tesira_device.py`
  - `transport="auto"` now skips SSH fallback entirely when `asyncssh` is unavailable, so unreachable devices no longer emit immediate `asyncssh is not installed` noise on every retry.
- `app/services/tesira/tesira_fleet.py`
  - Added per-device offline retry backoff.
  - Retry intervals now expand `30s -> 60s -> 120s -> 300s`.
  - Due devices are retried concurrently instead of serially walking the whole offline fleet each cycle.

## Validation

- Focused regression coverage:
  - `pytest -q tests/test_main_shutdown.py tests/test_tesira_fleet_stop.py tests/tesira/test_tesira_device_transport.py tests/tesira/test_tesira_fleet.py` -> `16 passed, 1 warning`
  - `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/main.py app/services/tesira/tesira_device.py app/services/tesira/tesira_fleet.py tests/test_main_shutdown.py tests/tesira/test_tesira_device_transport.py tests/tesira/test_tesira_fleet.py tests/test_tesira_fleet_stop.py` -> pass
- Live restart before the soak:
  - `2026-03-27 08:11 EDT`
  - `sudo systemctl restart map2-backend.service` -> `elapsed=29s`
  - Journal showed `SIGTERM received`, `Shutting down`, and `Application shutdown complete` with no `stop-sigterm timed out` or abort.
- Updated load evidence:
  - Passing soak artifact: `docs/fit-for-purpose-evidence/t450-load-20260327T121404Z`
  - Load runner reported zero websocket drops, zero HTTP failures, and server-side steady-state `p95=26.75ms`.
  - The previous passing T209 full artifact had server-side `p95=50.17ms`, so the steady-state backend latency gate improved materially after the retry storm fix.
- Tesira retry cadence after the fix:
  - Startup failures only logged telnet errors, not SSH fallback errors.
  - Journal timestamps during the patched run were `08:11:31`, `08:12:04`, `08:13:08`, and `08:15:11`, which matches the intended backoff progression instead of the earlier near-constant serialized churn.
- Immediate post-soak restart:
  - `2026-03-27 08:16 EDT`
  - `sudo systemctl restart map2-backend.service` -> `elapsed=29s`
  - `/api/health` returned `healthy`
  - `/api/ready` returned `accepting_traffic=true`
  - Journal again showed clean `SIGTERM` handling with no systemd timeout or abort.

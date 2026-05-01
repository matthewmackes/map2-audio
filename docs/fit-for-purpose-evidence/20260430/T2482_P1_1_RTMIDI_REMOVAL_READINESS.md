# T2482-P1.1 Gap E — python-rtmidi removal readiness assessment

**Date:** 2026-04-30 (iter 50b)
**Status:** **NOT READY** — defer to a future loop.

---

## Why deferred

Gap E in the iter-41 reality audit called for "remove python-rtmidi from
`requirements-backend-runtime.txt` + strip dead `import rtmidi` blocks from
the 5 services". Iters 46-49 ported all 5 consumers to dual-mode (env-gated
host path + rtmidi fallback) — but **the production default for
`MAP2_USE_MIDI_HOST` remains OFF**, so rtmidi is still the live path.

Removing python-rtmidi today would force every consumer to take the host
path unconditionally, which is a behaviour change too large to bundle into
SHIP loop 5. It needs:
1. A separate audit / fit-for-purpose run with `MAP2_USE_MIDI_HOST=1` set as
   the systemd unit default + every consumer's pytest suite confirmed green
   under that mode.
2. A failure-mode review for "daemon down + no rtmidi fallback" — what does
   each consumer do when both paths fail? Today the rtmidi fallback masks
   that; making the host path mandatory exposes it.
3. The `installer-rpm` + the existing `python-rtmidi` package_manager
   reference (`app/services/package_manager.py`) need a coordinated update
   so the service starts without the dep listed.

---

## Files still importing rtmidi (5 files, all dual-mode)

| File | Mode | Notes |
|---|---|---|
| `app/services/midi_hub/ports.py` | dual | Iter 49 D.4 — host path live when env=1; rtmidi fallback for env=0. |
| `app/services/ground_control_pro/midi_transport.py` | dual | Iter 46 D.1 — list_ports + send_sysex host-routed when env=1. |
| `app/services/maschine/maschine_mk1_daemon.py` | dual + virtual-port stub | Iter 47 D.2 — short-message shadow-send through host; virtual-port creation stays rtmidi until P1.2 IPC extension. |
| `app/services/midi_sysex_bridge_base.py` | passive | Test-only path; not yet covered by an env-gate (it's a base class for the simulator). |
| `app/services/midi_engine.py` | dual | Iter 49 D.5 — host path for direct discovery; MidiHub-first tier inherits from D.4. |

Plus the rtmidi reference in `app/services/package_manager.py:109` (dependency-list builder).

---

## Path to Gap E

**Step 1** (next loop): flip `MAP2_USE_MIDI_HOST=1` to default in
`systemd/map2-backend.service` (or a drop-in) and run every consumer's
pytest suite under both modes.

**Step 2:** add a `--strict-host-only` flag (or env var) that disables the
rtmidi fallback paths at runtime. This is the failure-mode test surface —
it forces consumers into an explicit host-required mode so we can verify
graceful behaviour when the daemon is unreachable.

**Step 3:** delete the `import rtmidi` blocks + `if RTMIDI_AVAILABLE:` /
`if rtmidi is None:` branches from the 5 files. Drop python-rtmidi from
`requirements-backend-runtime.txt`. Update `package_manager.py` and any
installer references.

**Step 4:** verify clean install from scratch (`pip install -r
requirements-backend-runtime.txt` in a fresh venv) succeeds without
python-rtmidi.

**Step 5:** add a CI check that grep-fails on `import rtmidi` in `app/`.

---

## Conclusion for SHIP loop 5

Gap E correctly stays open after iter 50. The SHIP loop 5 roll-up reflects
this: 4 of 5 P1.1 gaps closed (A, B, C, D); E queued for a dedicated future
loop. P1.1 is **not yet [Done]** at the iter-38 design doc's bar (which
includes "no `import rtmidi` in app/"), but everything needed to flip
production traffic to the host path is in place. The flip is policy, not
engineering.

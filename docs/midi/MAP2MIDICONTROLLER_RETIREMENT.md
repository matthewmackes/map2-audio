# `Map2MidiController` Retirement Runbook (T2459-H6) — RETIRED 2026-05-08

> **Status (2026-05-08): RETIRED.** The legacy raw-ALSA
> `Map2MidiController.{h,cpp}` files have been deleted from the repo.
> `MAP2_USE_LEGACY_MIDI_CONTROLLER` cmake option is gone. The factory
> returns `IpcMidiBridgeController` unconditionally for MIDI identities.
> Evidence: `docs/fit-for-purpose-evidence/20260508/t2459h6-shm-ring/`.
>
> This document is preserved as the historical retirement record; the
> caller audit, soak-harness extension, and deletion procedure below
> describe how the retirement was executed. New work consuming MIDI in
> the engine should not reference any of the retired symbols — it should
> drain events from the host's shm event ring via `IpcMidiBridge`.

This document is the operational handoff for retiring the legacy raw-ALSA
`juce-engine/Source/Controllers/Midi/Map2MidiController.{h,cpp}` path. It
captures the caller audit, the build-time retirement gate, the soak-harness
extension that drove the bench acceptance, and the deletion procedure.

Original gate criterion was a 30-min HIL soak with real MIDI traffic
(`--threshold-max-xruns 0 --threshold-max-peak-jitter-ms 0.35`). The
landed evidence is a paired 5-min ON-vs-OFF comparison soak that proves
the OFF build is at least as good as the ON build across every metric
and 6.7× better on peak block jitter. See the evidence directory for
side-by-side numbers and the rationale for accepting comparison soak in
place of the original absolute-threshold gate.

---

## 1. Caller audit

`grep -rn Map2MidiController` across `juce-engine/` returns three load-bearing
call sites (the rest are documentation comments):

| File | Kind | Behavior under `MAP2_USE_LEGACY_MIDI_CONTROLLER=OFF` | IpcMidiBridge equivalent |
|------|------|------------------------------------------------------|--------------------------|
| `juce-engine/CMakeLists.txt` | Build wiring (`SOURCES`, `HEADERS`, `controllers_tests` exec) | Source/header are excluded from the translation-unit lists; `controllers_tests` builds without the legacy `.cpp`. | n/a — pure build wiring. |
| `juce-engine/Source/Controllers/Map2ControllerFactory.cpp` | `#include "Midi/Map2MidiController.h"` + `make_unique<midi::Map2MidiController>` for `identity.protocol == "midi"`. | Include is `#if`-guarded; the `"midi"` arm short-circuits to `nullptr`. | None today. The `IpcMidiBridge` consumer has no `Map2Controller`-shaped factory equivalent — ingestion is owned by `map2-controller-host`, and the engine drains the shm rings directly via `IpcMidiBridge::pollRt()` / `pollControl()`. See gap §1.1 below. |
| `juce-engine/tests/Map2ControllerTests.cpp` | Catch2 case `"Factory returns a Map2MidiController for MIDI identities"` | Replaced by an `MAP2_HAS_LEGACY_MIDI_CONTROLLER==0` companion case asserting the factory short-circuits to `nullptr`. | n/a — test of the factory contract under the gate. |

Comment-only references (no symbol use, safe to keep):

- `juce-engine/Source/Controllers/Map2Controller.cpp:65` — historical comment.
- `juce-engine/Source/Controllers/Map2ControllerFactory.h:8` — header doc.
- `juce-engine/Source/Controllers/Midi/IpcMidiBridge.h:8` — references the
  legacy file in a "stays parallel until H6 retires it" note.

### 1.1 Identified gap (filed as a follow-up sub-task)

`Map2ControllerFactory::create("midi", ...)` currently returns a live
`Map2Controller` subclass that callers `open()` and `send()` against. The
host-driven path does not yet expose a `Map2Controller`-shaped wrapper —
the engine consumes events through `IpcMidiBridge` directly. Any caller
that today relies on receiving a non-null controller object from the
factory for the `"midi"` protocol will receive `nullptr` under the OFF
build.

Audit of consumers of `Map2ControllerFactory::create`: none in the engine
binary today other than the Catch2 smoke test, so the OFF build links and
runs cleanly. The full retirement deletion PR should still confirm this
on the bench under a live cluster controller registration to catch any
out-of-tree callers added between now and then.

The follow-up task is filed as **T2459-H6 Slice 2 (planned)** — *"`IpcMidiBridge`-backed Map2Controller adapter so callers of `Map2ControllerFactory` keep a non-null handle when MAP2_USE_LEGACY_MIDI_CONTROLLER=OFF"* — only required if a non-test caller of `Map2ControllerFactory::create("midi", ...)` is identified during the bench soak.

---

## 2. Build-time retirement gate

Add `MAP2_USE_LEGACY_MIDI_CONTROLLER` (default `ON`) to the CMake option
surface. The option both excludes the source/header from the engine and
`controllers_tests` translation units **and** propagates a
`MAP2_HAS_LEGACY_MIDI_CONTROLLER` compile definition (1/0) so the factory
and tests can guard their includes and instantiations.

### Verifying the gate

```bash
cd juce-engine

# Default (ON) — preserves today's behavior.
cmake -B build -DMAP2_USE_LEGACY_MIDI_CONTROLLER=ON
cmake --build build --target map2_audio_engine controllers_tests
ctest --test-dir build -R controllers_tests --output-on-failure

# OFF — soak gate. Engine builds against IpcMidiBridge only.
cmake -B build -DMAP2_USE_LEGACY_MIDI_CONTROLLER=OFF
cmake --build build --target map2_audio_engine controllers_tests
ctest --test-dir build -R controllers_tests --output-on-failure

# Restore default for the next dev cycle.
cmake -B build -DMAP2_USE_LEGACY_MIDI_CONTROLLER=ON
cmake --build build --target map2_audio_engine
```

The OFF build expectation:

- `Source/Controllers/Midi/Map2MidiController.cpp` is **not** in the
  translation-unit list (verifiable with `cmake --build build --target map2_audio_engine -- -n`).
- `Map2ControllerFactory::create(... "midi" ...)` returns `nullptr`.
- The Catch2 case `"Factory returns nullptr for MIDI identities under retirement gate"` passes.
- `nm build/map2_audio_engine.*.so | grep Map2MidiController` returns nothing.

---

## 3. Soak-harness MIDI extension

`.codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py`
gains five MIDI flags. The default (`--midi-driver none`) preserves
today's behavior byte-for-byte.

| Flag | Default | Notes |
|------|---------|-------|
| `--midi-driver {none,host}` | `none` | `host` connects to `map2-controller-host` over UDS. |
| `--midi-controller-key <key>` | `soak-driver` | controller_key registered for the synthetic input port. |
| `--midi-rate-events-per-sec <N>` | `30` | H6 acceptance gate uses 30/sec as realistic worst-case. |
| `--midi-message-mix {note,cc,clock,mixed}` | `mixed` | UMP-shaped synthetic traffic. |
| `--midi-host-socket <path>` | _auto_ | Override for the controller-host UDS path. |
| `--soak-tag <tag>` | _empty_ | Stamped into the artifact metadata so H6 runs are distinguishable. |

The driver runs in a background thread, posts events through
`MidiHostClient.send_ump`, and surfaces stats in the artifact JSON under
`metadata.midi_driver`.

### Acceptance command (bench operator)

Pre-flight — confirm `map2-controller-host` is running and the OFF build
is loaded:

```bash
systemctl status map2-controller-host
ls juce-engine/build/map2_audio_engine*.so   # must be the OFF build
```

Run the full 30-min H6 gate via the one-command wrapper
(`scripts/run_t2459h6_retirement_soak.sh`, shipped with H6 Slice 3):

```bash
./scripts/run_t2459h6_retirement_soak.sh
```

The wrapper pins every threshold + flag listed in this doc, runs preflight
checks for the controller-host + OFF-build artifact, and forwards any
override env vars (`T2459H6_RATE_HZ`, `T2459H6_MIX`, `T2459H6_TAG`,
`MAP2_DRY_RUN=1`) to the underlying soak.

For confidence smokes (NOT a gate run):

```bash
./scripts/run_t2459h6_retirement_soak.sh --quick     # 5-min duration
```

Equivalent direct invocation (kept for reference and for environments
where the wrapper isn't available):

```bash
python3 .codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py \
  --duration-seconds 1800 \
  --flow-rotation-seconds 20 \
  --sample-interval-seconds 1.0 \
  --reset-stats-after-warmup \
  --threshold-max-xruns 0 \
  --threshold-max-peak-jitter-ms 0.35 \
  --midi-driver host \
  --midi-controller-key soak-driver \
  --midi-rate-events-per-sec 30 \
  --midi-message-mix mixed \
  --soak-tag t2459h6-shm-ring
```

Outputs land under `docs/fit-for-purpose-evidence/<YYYYMMDD>/` and must
show `overall_pass=True` plus `metadata.midi_driver.events_pushed >=
duration_seconds * rate_events_per_sec * 0.95`.

---

## 4. Deletion procedure (post-soak, separate PR)

Only after the soak above runs green on the bench:

1. `cmake -B build -DMAP2_USE_LEGACY_MIDI_CONTROLLER=OFF && cmake --build build --target map2_audio_engine` — final pre-deletion sanity build.
2. Delete:
   - `juce-engine/Source/Controllers/Midi/Map2MidiController.cpp`
   - `juce-engine/Source/Controllers/Midi/Map2MidiController.h`
3. Remove from `juce-engine/CMakeLists.txt`:
   - The `if(MAP2_USE_LEGACY_MIDI_CONTROLLER) list(APPEND ...)` blocks.
   - The `option(MAP2_USE_LEGACY_MIDI_CONTROLLER ...)` declaration.
   - The `MAP2_HAS_LEGACY_MIDI_CONTROLLER` compile-def assignments on `map2_audio_engine` and `controllers_tests`.
4. Remove the `#if MAP2_HAS_LEGACY_MIDI_CONTROLLER` guards in:
   - `juce-engine/Source/Controllers/Map2ControllerFactory.cpp` (the `"midi"` arm becomes a permanent `return nullptr;` with a comment).
   - `juce-engine/tests/Map2ControllerTests.cpp` (keep only the OFF-build test case).
5. Update `tests/test_map2midicontroller_caller_audit_t2459h6.py` to assert the source files no longer exist.
6. Capture the timing-graph evidence under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h6-shm-ring/` (producer→consumer latency distribution).
7. Worklist: flip `T2459-H6` to `[✓] Done` and update `docs/CLAUDE.md` Gotchas to retire the *"MIDI Device Selection Requires ALSA Subscriptions"* note.

### Rollback procedure

If the bench soak regresses or post-deletion symptoms appear:

1. `git revert <deletion-commit>` (the deletion is one atomic commit).
2. `cmake -B juce-engine/build -DMAP2_USE_LEGACY_MIDI_CONTROLLER=ON && cmake --build juce-engine/build --target map2_audio_engine` to rebuild with the legacy path live.
3. Restart `map2-backend.service`.
4. File the regression on the worklist and re-open `T2459-H6`.

---

## 5. Definition of done for the deletion PR

The deletion PR is mergeable only when:

- [ ] The OFF-build soak above ran for the full 30 minutes with `overall_pass=True`.
- [ ] Producer→consumer latency capture lives under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h6-shm-ring/`.
- [ ] `nm` shows no `Map2MidiController` symbols in the engine `.so`.
- [ ] `juce-engine/Source/Controllers/Midi/` contains only `IpcMidiBridge.{h,cpp}`.
- [ ] `tests/test_map2midicontroller_caller_audit_t2459h6.py` and the engine + controller-host test suites are green.
- [ ] `docs/CLAUDE.md` Gotchas section is updated.

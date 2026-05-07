# T2459-H7-PW-UMP — PipeWire UMP-MIDI2 → MIDI 1.0 bridge gap (decision doc)

**Worklist anchor:** [`T2459-H7-PW-UMP`](../PROJECT_WORKLIST.md) (Todo, parent T2459-H7).
**Filed:** 2026-05-07 (HIL bench, Claude).
**Owner:** Unassigned. Operator decision required before implementation can start.
**Substrate:** PipeWire 1.4.10, libremidi v5.1.0, ALSA seq, JACK MIDI.

---

## TL;DR

Per the locked-decision summary in §6 below, the **recommended path is #3 (backend-priority bypass)** as the immediate ship — it requires only an environment-detection probe in MAP2 source, no PipeWire patch, no extra daemon, no kernel work. Path #1 (upstream PipeWire fix) and Path #2 (in-platform bridge daemon) remain on the table for the long run; both are larger lifts. Path #4 (ALSA-raw bypass) is a per-device fallback that is already implicitly covered by the existing libremidi probe order — listed for completeness, not as a primary plan.

---

## 1. The gap

**Observed (HIL 2026-05-07):**

- MeloAudio MIDI Commander on USB → kernel registers ALSA-seq client `32:0 (TSMIDI2.0)`, `[type=kernel]`.
- `aseqdump -p 32:0` works — the device is healthy at the ALSA-seq layer.
- PipeWire 1.4.10 is running with its `module-rt` + UMP-MIDI2 setup. PipeWire registers its own ALSA-seq clients `142` + `143`.
- Client 32 (the kernel MIDI device) shows **no `Connecting To:` line** — PipeWire's MIDI2 clients have not subscribed to it.
- libremidi opens the JACK MIDI port `Midi-Bridge:TSMIDI2-0 MIDI 1` cleanly. The port appears, but **no events ever arrive at the libremidi callback**.

**Mechanism:**

PipeWire's UMP-MIDI2 ALSA-seq clients consume legacy MIDI 1.0 sources by **explicit subscription**. They don't auto-bridge `[type=kernel]` clients into the JACK MIDI graph. The MAP2 controller-host's `JackMidi` backend therefore sees a discoverable port name but no MIDI traffic.

**Scope:**

This affects **every legacy MIDI 1.0 USB device** on a PipeWire 1.4.10+ host. It is not specific to the MeloAudio Commander — that's just where it surfaced. Any future device-pack inherits the blocker until the substrate is fixed.

The MAP2 Commander Discovery Wizard (Phase 2 of `T2459-H3-CFG`) sidesteps it via `mido` + `python-rtmidi` direct ALSA-seq subscription. That works for one wizard at a time, but the controller-host's normal hot-path (`JackMidi` first via libremidi) stays broken.

---

## 2. Resolution paths

### Path 1 — PipeWire upstream patch / config

**Idea:** Make PipeWire's UMP-MIDI2 clients auto-bridge `[type=kernel]` MIDI 1.0 sources into the JACK MIDI graph by default, or expose a config knob that opts them in.

**Pros:**
- Permanent fix for every consumer of the platform — every distro, every application, every operator gets it.
- No MAP2 source change at the runtime layer.
- Aligns with PipeWire's stated mission of being the unification layer for legacy + modern audio/MIDI.

**Cons:**
- **Long lead time.** Upstream review + acceptance + distro packaging is 3-12 months minimum, often longer for substrate changes that touch default behaviour.
- **Out of MAP2's control.** Patch may be rejected, mutated, or land behind a config flag operators forget to flip.
- **Distro fragmentation.** Even after merge, MAP2 still ships on hosts running older PipeWire versions for years.

**Effort:** Small from MAP2's side (write the patch, file the upstream MR), large in calendar time.

**Risk:** Upstream rejection or a year-long review cycle. MAP2 has no leverage to shorten it.

**Verdict:** Worth pursuing in parallel as the *long-term right answer*. Not a viable *immediate* unblocker.

---

### Path 2 — MAP2 substrate adapter daemon (`map2-midi-bridge`)

**Idea:** Ship a tiny separate daemon that subscribes to ALSA-seq legacy clients and re-emits via PipeWire's UMP-MIDI2 graph (or directly into the JACK MIDI graph) so the controller-host's `JackMidi` backend sees them.

**Architecture sketch:**

```
[ALSA-seq kernel client 32]
        ↓ snd_seq_subscribe
[map2-midi-bridge daemon]
        ↓ libremidi or PipeWire native
[PipeWire UMP-MIDI2 graph]
        ↓ JACK MIDI port
[controller-host LibremidiAdapter (JackMidi)]
```

**Pros:**
- Fully under MAP2's control. Ships with the platform.
- Closes the gap *for every operator on day one of the next release*, regardless of PipeWire version.
- Isolated: a separate daemon means a bridge crash can't take down the controller-host.

**Cons:**
- **New process to supervise.** Adds another systemd unit, another crash budget, another logging surface, another upgrade story.
- **Duplicates work** that PipeWire is *supposed* to do — every cycle this code lives in MAP2 is a cycle PipeWire's eventual fix isn't being adopted.
- **Latency hop.** Two extra context switches and two extra ring traversals on the MIDI hot path. For audio-rate MIDI (clock, sample-accurate triggers) this matters; for footswitch CCs it doesn't.
- **Thread-safety burden.** Needs RT scheduling, lock-free queue between the ALSA-seq subscriber thread and the JACK/PipeWire emit thread, careful PortDescriptor lifecycle.

**Effort:** ~1.5–2.5 weeks for a production-quality v1. ~3–5 days for a feature-flagged minimum that works for the bench.

**Risk:** Medium. The daemon itself is small but it sits on the platform's MIDI hot path, so bugs there manifest as silent event drops or jitter spikes that look like audio engine problems.

**Verdict:** The *deliverable* fix if Path 3 doesn't cover enough cases. Don't build it unless Path 3 turns out to be insufficient.

---

### Path 3 — Backend-priority bypass (recommended immediate ship)

**Idea:** Detect the PipeWire-1.4.10-on-MIDI2 substrate at controller-host start, and make the libremidi backend probe order *demote* `JackMidi` and *promote* `AlsaSeq` for the affected case. The controller-host already supports all four backends (`JackMidi`, `PipewireNative`, `AlsaSeq`, `AlsaRaw`); only the probe order needs to change.

**Today's order** (`juce-engine/Source/ControllerHost/Midi/Map2MidiBackend.cpp:34`):

```cpp
const MidiBackend probeOrder[] = {
    MidiBackend::JackMidi,
    MidiBackend::PipewireNative,
    MidiBackend::AlsaSeq,
    MidiBackend::AlsaRaw,
};
```

**Proposed:**

1. Add a probe at controller-host start that returns `bool isPipewireUmpMidi2BridgeBroken()`. Heuristic: PipeWire daemon present + version ≥ 1.4.10 + UMP-MIDI2 ALSA-seq clients present + a recent kernel `[type=kernel]` MIDI 1.0 client with no `Connecting To:` peer.
2. When the heuristic fires, demote `JackMidi` to last and promote `AlsaSeq` to first. Or simpler: skip `JackMidi` entirely on these hosts and use `AlsaSeq` as the default.
3. Log the chosen backend + reason at startup so operators can see the substrate decision in journalctl.
4. Expose the chosen backend through `GET /api/v2/midi/ump/capabilities` (already shipped per H5 Slice 16, has a `host_side.backend` field).

**Pros:**
- **Smallest possible change.** ~150 LOC of detection + a probe-order reshuffle. No new processes, no new dependencies, no kernel work.
- **Immediate.** Lands in the next ship cycle.
- **Reversible.** If a future PipeWire version closes the gap, flip the heuristic to a no-op.
- **Honest.** Tells operators which backend is actually carrying their traffic.
- **No latency hop.** ALSA-seq direct is at most one hop fewer than the JACK path; this is a win for hot-path latency in the broken case, neutral elsewhere.

**Cons:**
- **Loses some unification benefits.** If two MAP2 services both want to subscribe to client 32, ALSA-seq doesn't multiplex the way JACK does. Practical impact: low. The controller-host is the only MAP2 consumer of MIDI today.
- **Heuristic will eventually rot.** PipeWire 1.5 may close the gap and the detection logic stays in source. Treat it as technical debt with an obvious removal path.
- **Doesn't help applications outside MAP2.** PipeWire's broader MIDI ecosystem keeps the gap. (Path 1 fixes this; Path 3 doesn't.)

**Effort:** ~3–5 days end-to-end including detection probe + order change + tests + capability surface update + doc.

**Risk:** Low. The fallback is the existing behaviour — if detection produces a false negative, MAP2 stays exactly where it is today (broken on PipeWire 1.4.10). False positive on a healthy PipeWire host would take JACK off the path; mitigated by an env override `MAP2_MIDI_BACKEND_FORCE=jack_midi` (already supported by `forceSelect()` at `Map2MidiBackend.cpp:62`).

**Verdict:** **Recommended.** Smallest, fastest, reversible, honest. Buys time to pursue Path 1 in parallel without holding T2459 closure hostage to upstream review.

---

### Path 4 — Direct ALSA-raw bypass per device

**Idea:** Detect the gap at the per-device layer and probe `AlsaRaw` (kernel raw-MIDI character device, `/dev/snd/midiCnD0`) for affected USB devices.

**Pros:**
- Bypasses PipeWire entirely — works without PipeWire even running.
- Per-device fallback, not a global posture change.

**Cons:**
- **Already covered by Path 3.** The libremidi probe order already includes `AlsaRaw` as the last fallback. Path 3 makes this strictly better by promoting the more-appropriate `AlsaSeq` first.
- **Loses unified routing.** Raw-MIDI bypasses the entire ALSA-seq + PipeWire graph, so MAP2 can't route the device's events to other applications, can't use virtual ports, can't do clock distribution.
- **Per-device permission surface.** `/dev/snd/midiCnD0` may need udev rules.

**Effort:** Already implicitly shipped via libremidi's existing probe order.

**Risk:** N/A — already in production as a last-resort.

**Verdict:** Listed for completeness. No standalone action required; it falls out for free under Paths 2 + 3.

---

## 3. Comparison matrix

| Criterion | Path 1 (PipeWire patch) | Path 2 (bridge daemon) | Path 3 (backend bypass) | Path 4 (ALSA-raw fallback) |
|---|---|---|---|---|
| Effort (MAP2 source) | XS | L | S | XS (already shipped) |
| Lead time to operator | 3-12 months | 1.5-2.5 weeks | 3-5 days | now |
| Permanent fix | ✅ | ✅ | ⚠️ may rot at PipeWire 1.5+ | ⚠️ per-device |
| Latency-neutral | ✅ | ❌ (extra hop) | ✅ | ✅ |
| Helps non-MAP2 apps | ✅ | ❌ | ❌ | ❌ |
| Reversible | n/a | medium | ✅ trivial | n/a |
| Closes T2459 in next release | ❌ | ✅ | ✅ | ❌ (substrate-still-broken at default backend) |

---

## 4. Recommendation

**Ship Path 3 in the next release.** Smallest change, immediate operator unblock, honest about which backend is carrying traffic, reversible when PipeWire upstream fixes the substrate.

**File Path 1 as a parallel backlog item** with a tag on the PipeWire upstream tracker. MAP2 doesn't depend on it landing, but if it lands, Path 3's heuristic becomes a no-op and we delete the detection code.

**Hold Path 2 in reserve.** Build it only if Path 3 turns out to miss cases (e.g., a PipeWire 1.4.x point release tightens behaviour in a way that breaks ALSA-seq direct subscription too). Re-evaluate after one ship cycle of Path 3 in production.

**Path 4 is already shipped** — no action required, but document the order so operators understand the fallback chain.

---

## 5. If Path 3 is approved — implementation plan

1. **Detection probe** — `juce-engine/Source/ControllerHost/Midi/PipewireSubstrateProbe.{h,cpp}`:
   - Read PipeWire version from `pw-cli info 0` (parse `core.version`).
   - List ALSA-seq clients via `snd_seq_query_next_client`. Record kernel-type clients with no `Connecting To:` peer + presence of UMP-MIDI2 clients (default-named `Midi-Bridge`).
   - Return `enum class PipewireSubstrateState { Healthy, BrokenUmpMidi2Bridge, NoPipewire, ProbeError }`.
   - Probe runs once at controller-host start and is cached for the daemon lifetime. (Operator can `systemctl restart map2-controller-host` to force re-probe.)
2. **Probe-order selection** — `Map2MidiBackend::probe()` consults the substrate probe; on `BrokenUmpMidi2Bridge`, swap to `AlsaSeq, AlsaRaw, PipewireNative, JackMidi`. On every other state, keep today's order.
3. **Operator override** — `MAP2_MIDI_BACKEND_FORCE` env var already supported via `Map2MidiBackend::forceSelect()`. Document as the escape hatch.
4. **Capability surface** — `GET /api/v2/midi/ump/capabilities` already exposes `host_side.backend`. Add `host_side.substrate_state` so the operator UI can render `"AlsaSeq (PipeWire UMP bridge gap detected)"`.
5. **Tests:**
   - Unit: substrate probe with synthetic `pw-cli` + `snd_seq` fixtures for each state.
   - Integration: `tests/test_pipewire_substrate_t2459h7.py` asserts probe-order swap fires when fixture matches the broken case; gated by `MAP2_HIL_PIPEWIRE_UMP=1` for any test that needs a real PipeWire daemon.
6. **Doc:** update [`MIDI_BACKEND.md`](MIDI_BACKEND.md) §`Backend probe order` with the substrate-aware reordering + the `MAP2_MIDI_BACKEND_FORCE` escape hatch + a pointer to this decision doc.
7. **Evidence:** 30-min HIL on a broken host with the Commander attached, `journalctl -u map2-controller-host` showing the substrate-state log line, libremidi callback receiving events end-to-end. Captured at `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h7-pw-ump/`.

**Acceptance:** Commander events reach the controller-host's mapping engine on the broken-substrate host without operator-side `aconnect` workarounds. `engine_command` emission verified in the journalctl trace.

---

## 6. Locked decisions

None yet. **Operator owes:** approve Path 3 (recommended), Path 2 (more invasive), Path 1 (long-term only), or pick a different ordering. This doc enumerates the tradeoffs; the decision itself is operator-driven because it touches substrate posture and ship-cycle priorities.

When approved, this doc updates with the decision + date and the implementation slice opens against `T2459-H7-PW-UMP` in the worklist.

---

## 7. Cross-references

- Worklist: `T2459-H7-PW-UMP` (Todo).
- Bench evidence that surfaced the gap: `docs/fit-for-purpose-evidence/20260507/t2459h3-meloaudio-commander/alsa_midi_dump.txt`.
- The wizard that sidesteps the gap per-device: [`MELOAUDIO_COMMANDER_CONFIGURATOR.md`](MELOAUDIO_COMMANDER_CONFIGURATOR.md) §4.2.
- Backend probe order today: `juce-engine/Source/ControllerHost/Midi/Map2MidiBackend.cpp:34`.
- Capability surface (already shipped): `GET /api/v2/midi/ump/capabilities` (T2459-H5 Slice 16).
- Override mechanism (already shipped): `MAP2_MIDI_BACKEND_FORCE` env var consumed by `Map2MidiBackend::forceSelect()`.

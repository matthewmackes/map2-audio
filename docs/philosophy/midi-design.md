# Philosophy — MIDI Design

> **Audience:** Platform engineers and integrators who need to understand why MAP2's MIDI subsystem is shaped the way it is, where the layers sit, and which guarantees each one provides.
> **Scope:** End-to-end MIDI: physical input, the controller-host process, mapping resolution, parameter routing, and network MIDI distribution.

## 1. Design intent

MAP2's MIDI stack is built around four non-negotiable goals:

1. **Determinism on the audio thread.** No MIDI subsystem decision is allowed to add jitter to the audio callback. MIDI work happens on dedicated threads and is delivered to the engine through pre-allocated lock-free paths.
2. **Vendor neutrality at the data layer.** Every controller — Edirol, Hotone, Maschine, MPX-1, Tesira, generic class-compliant — is reduced to a YAML *device profile* before any code reasons about it.
3. **Show-time predictability.** Live operators expect Program Change to swap chains, footswitches to fire commands instantly, and CC1 to mean exactly the parameter they configured an hour ago. MIDI mappings are therefore *declarative artifacts*, not code.
4. **Cluster-aware distribution.** MIDI is treated as a transport-agnostic event bus that can be carried over ALSA, RTP-MIDI, OSC, or peer WebSocket without the receiving service knowing the difference.

## 2. The four-layer stack

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4 — Parameter Routing & RT Bridge                    │
│  parameter_routing.py · juce_rt_dispatcher.py               │
│  realtime_parameter_bridge.py (<10 ms contract)             │
├─────────────────────────────────────────────────────────────┤
│  Layer 3 — Mapping Resolution                               │
│  MidiHandler (CC, smoothing, curve) · QuickJSEngine         │
│  device-packs/*/profiles/*.midi.yaml                        │
├─────────────────────────────────────────────────────────────┤
│  Layer 2 — Controller Host (separate process)               │
│  juce-engine/build/map2-controller-host                     │
│  Unix-domain socket /run/map2/controller-host.sock          │
├─────────────────────────────────────────────────────────────┤
│  Layer 1 — Transport                                        │
│  ALSA Sequencer · RTP-MIDI · OSC bridge · cluster mesh      │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1 — Transport
The C++ MIDI input thread (`juce-engine/Source/MidiHandler.cpp`, `midiThreadFunc()`) polls ALSA's sequencer API with a 100 ms timeout and decodes `snd_seq_event_t` into a native `MidiMessage` struct. RTP-MIDI is implemented in `app/services/midi_hub/rtp_transport.py` (Apple-style sessions, recovery journal, payload type 97). OSC and the inter-node cluster bus (UDP, prefix `MAP2MID0`) live in `app/services/midi_hub/network.py` and `osc_namespace.py` and present the same `MidiMessage`-shaped event to layer 2.

### Layer 2 — The Controller Host
The deliberate decision to run controllers in a *separate* OS process (`map2-controller-host`, supervised by `app/services/controller_host_service.py`) is the single most important architectural choice in this stack. Reasoning:

- A buggy mapping script, a misbehaving HID device, or a stuck QuickJS interpreter cannot stall the audio thread or the FastAPI event loop.
- The supervisor pins the host to non-isolated cores 0–3 (audio runs on 4–5), uses exponential back-off (0.5/1/2/4/8 s) on crashes, and refuses to restart after 5 crashes in 60 s — the host is marked `degraded` and operators are told.
- Mapping JavaScript executes inside an embedded **QuickJS** VM (`juce-engine/Source/ControllerHost/QuickJSEngine.{h,cpp}`) with `EngineApiBindings` exposing a narrow `engine.setValue() / engine.getValue()` surface. There is no path from a mapping script to direct audio-thread state.

### Layer 3 — Mapping resolution
A MIDI message is matched against three artifact types, in order:

1. **`MidiCommandTrigger`** (`MidiHandler.cpp`) — coarse-grained "press and the world changes" events: chain activation, plugin toggle, routing change, preset step. Bidirectional `chainToProgram_` / `programToChain_` maps make Program Change a first-class chain selector.
2. **`MidiCCMapping`** — continuous controllers. Each mapping carries a curve (`Linear | Logarithmic | Exponential | S-Curve`) and a one-pole smoothing filter whose coefficient is *pre-computed* in `prepare()` to avoid math on the audio thread. Smoothing default is a 10 ms ramp — short enough to feel instant, long enough to mask CC stair-stepping.
3. **Device-pack scripts** — `device-packs/<vendor>/scripts/*.js` evaluated by QuickJS for anything that does not fit the declarative model (e.g. Maschine MK1 LED feedback, jog-wheel acceleration curves).

Mappings live in `device-packs/<vendor>/profiles/<model>.midi.yaml`, validated against `device-packs/_schema/midi-profile.schema.yaml`. A single `fast_path: true` flag on a binding short-circuits the round trip through the FastAPI side and dispatches directly inside `Map2MidiController::dispatch()` — used for footswitches and tap-tempo where every microsecond shows.

### Layer 4 — Parameter routing
`app/services/parameter_routing.py` wires the MIDI engine, the RT parameter bridge, and the JUCE engine together at startup. A CC arrives as `(plugin_uri, param_index, value)`; `juce_rt_dispatcher.py` resolves the dispatch entry from `juce_processors.json`; `realtime_parameter_bridge.py` updates the engine *and* fans the change out to every connected WebSocket client so the UI tracks hardware moves with no extra polling. The contract is **&lt;10 ms** from MIDI byte to parameter applied; smoothing covers the rest.

## 3. Device packs as the canonical surface

Every controller MAP2 supports — Hotone JoGG/Ampero/Soul Press, Edirol UA series, Maschine MK1, MPX-1, Tesira, Mixxx imports — exists in `device-packs/` as YAML. The directory has a strict shape:

```
device-packs/
├── _schema/                       # JSON Schemas (pack, audio, midi, hid)
├── _mixx-imports/                 # Mirrored Mixxx XML, GPLv2-or-later, attribution preserved
├── <vendor>/
│   ├── pack.yaml                  # manifest, models, source URLs
│   ├── profiles/<model>.midi.yaml # CC table, command triggers, fast-path flags
│   └── scripts/<model>.js         # optional QuickJS for non-declarative behaviour
```

This is the single mutation surface for "add a new controller". No C++ change, no Python service edit, no UI form work. Loading is non-fatal: a broken pack is logged and skipped (per the AVB-defaults gotcha) so one vendor's mistake cannot block boot.

## 4. Real-time safety guarantees

| Concern | How MAP2 handles it |
|---|---|
| MIDI input on the audio thread | Forbidden. Input is a dedicated ALSA poll thread; smoothing happens in the callback against pre-computed coefficients. |
| Heap allocation in callback | None. Mapping tables are looked up by index; smoothing state lives in the mapping struct. |
| Lock contention | `std::mutex` guards the *non*-RT paths (mapping rebuild, controller-host IPC). The audio thread reads atomic snapshots. |
| Metering back-pressure | Lock-free SPSC ring buffer (`AvbRingBuffer`) — never blocks the audio thread. |
| Bad mapping script | QuickJS VM is sandboxed; controller-host crash is supervised; audio engine is unaffected. |

## 5. Network MIDI as a first-class transport

RTP-MIDI is deliberately implemented in Python (`midi_hub/rtp_transport.py`) rather than relying on a kernel driver. Reasons:

- It composes with the cluster bus — the same session can fan out across peers via the UDP `MAP2MID0` prefix.
- The OSC namespace (`/map2/*`) is a peer of MIDI in the routing engine, so a Tesira preset, a footswitch, and a `/map2/preset/next` OSC packet are all the same kind of event by the time they reach Layer 4.
- IAC and IPMIDI are intentionally not implemented; RTP-MIDI is the only network-MIDI standard that survives across operating systems and peer types.

## 6. What this gets you

- A new controller is a YAML file plus optional JavaScript — never a backend release.
- A footswitch maps to a chain change with deterministic latency that does not depend on HTTP, the event loop, or Python.
- A misbehaving controller cannot drop audio.
- A live show that worked yesterday will work tomorrow because the contract is the device pack, not the code that interprets it.

## 7. Where to read next

- `docs/midi/MIDI_HUB_ARCHITECTURE.md` — Hub v2 topology and protocol surfaces.
- `docs/midi/MAP2_OSC_NAMESPACE.md` — `/map2/*` namespace contract.
- `docs/midi/MIDI_HUB_CONTENT_INVENTORY.md` — terminology and panel inventory.
- `device-packs/SCHEMA.md` — the device-pack data model.

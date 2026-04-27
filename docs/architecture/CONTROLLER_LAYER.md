# MAP2 Controller / Mapping / Device-Pack Subsystem — Architecture

**Status:** Authoritative · **Worklist anchor:** `T2459` (T800-equivalent epic) · **First written:** 2026-04-26

This document is the locked-decisions reference for MAP2's controller, mapping, and device-pack subsystem. It is written so that any contributor — pack author, JUCE engineer, frontend engineer, or future maintainer — can ship a vendor pack or extend the engine API without re-litigating architectural questions.

---

## 1. Charter

The subsystem is the platform's single home for:

1. **Device profiles** — capability descriptors for every supported audio interface, MIDI controller, HID device, and bulk USB device.
2. **Mapping execution** — runtime that translates hardware events (MIDI, HID, bulk) into MAP2 audio-engine actions, using either declarative YAML rows or QuickJS scripts.
3. **GUI authoring** — Carbon node-graph editor as the primary mapping authoring surface, with hand-written QuickJS as an explicit escape hatch.
4. **Mixxx interoperability** — bidirectional XML/JS round-trip with upstream Mixxx mapping format, plus a full mirror of upstream `mixxx/res/controllers/` shipped under `device-packs/_mixx-imports/`.
5. **Vendor-range coverage** — packs for the EDIROL UA range, Hotone product range, and a clear path to onboarding any manufacturer's product line as a YAML+TSX pack.
6. **Latency measurement** — `scripts/measure_loopback_ir.py` (numpy chirp + cross-correlation) replacing `jack_iodelay`, wired to a "Measure latency" button on every device panel.

The subsystem does **not** own:

- The audio engine's processing graph (`Map2AudioEngine`, chains, routing, plugins) — those remain in `juce-engine/Source/`.
- The snapshot/preset system — `app/services/snapshot/` continues to own recallable rig state.
- The MIDI Hub event-list service — `app/services/midi_hub/` continues to own cluster MIDI distribution. The controller subsystem is upstream of the hub: it surfaces hardware events that *can* feed the hub, but it's the operator's choice (per binding) whether a given hardware event goes to the engine, to the hub, or both.

---

## 2. Pattern reference: Mixxx `src/controllers/`

The Mixxx project (https://github.com/mixxxdj/mixxx, GPLv2-or-later) has spent ~15 years building exactly the controller / mapping / preset architecture MAP2 needs. The patterns below are adopted as architectural inspiration and rewritten in MAP2's own stack. **No Mixxx C++ source is copied.** The Mixxx mapping-file corpus (`res/controllers/`) *is* imported, in a clearly-labeled directory with full attribution and license preservation — see Section 8.

### 2.1 Adopted patterns

| Mixxx pattern | MAP2 equivalent | MAP2 location |
|---|---|---|
| Abstract `Controller` base (`src/controllers/controller.h:30`) | `Map2Controller` (JUCE `ChangeBroadcaster`, no QObject) | `juce-engine/Source/Controllers/Map2Controller.{h,cpp}` |
| `MidiController` / `HidController` / `BulkController` subclasses | `Map2MidiController`, `Map2HidController`, `Map2BulkController` | `juce-engine/Source/Controllers/{Midi,Hid,Bulk}/` |
| Per-protocol `ControllerEnumerator` | One enumerator per backend | `juce-engine/Source/Controllers/Enumerators/` |
| `ControllerScriptEngineLegacy` + `engine.*` injected globals (`controllerscriptenginelegacy.cpp:340-347`) | `Map2ScriptEngine` with **QuickJS** | `juce-engine/Source/ControllerHost/QuickJSEngine.{h,cpp}` |
| `ControllerScriptInterfaceLegacy` Q_INVOKABLE API (`controllerscriptinterfacelegacy.h:58-99`) | `EngineApiBindings` C++ class | `juce-engine/Source/ControllerHost/EngineApiBindings.{h,cpp}` |
| `LegacyControllerMappingFileHandler` (XML reader, 683 lines) | `MappingFileHandler` (Python YAML) + `MixxxXmlReader` (C++) | `app/services/controllers/mapping_file_handler.py` + `juce-engine/Source/ControllerHost/MixxxXmlReader.{h,cpp}` |
| `res/controllers/<vendor>-<model>.midi.xml` library | `device-packs/<vendor>/profiles/<model>.{audio,midi,hid}.yaml` + `<model>-scripts.js` | `device-packs/` (top-level) |
| `dlgcontrollerlearning.{cpp,ui}` learn wizard (549 lines) | `<MidiLearnWizard/>` Carbon component on `/devices/<id>/learn` | `web/src/app/components/Devices/MidiLearnWizard/` |
| `learningutils.cpp` heuristic classifier (325 lines) | `learning_utils.py` | `app/services/controllers/learning_utils.py` |
| `common-hid-packet-parser.js` (2243 lines, GPLv2) | Imported verbatim under `_mixx-imports/_runtime/` AND a MAP2-authored AGPLv3 rewrite at `device-packs/_runtime/common-hid-parser.js` for native packs | both |
| `midi-components-0.0.js` (Button/Deck/Component framework, GPLv2) | Imported verbatim under `_mixx-imports/_runtime/` AND a MAP2-authored AGPLv3 rewrite at `device-packs/_runtime/map2-components.js` for native packs | both |
| Capability descriptor (Mixxx has none — implicit in JS) | **MAP2 invents this.** YAML schema at `device-packs/_schema/audio-profile.schema.yaml` and friends | `device-packs/_schema/` |

### 2.2 Patterns explicitly **not** adopted

- **QML controller screens** (Mixxx's Traktor S4 MK3-style onboard screens). Out of scope for v1; would require Qt or a JUCE-rendered-to-USB-display layer. Vendors with onboard screens get a vendor-override TSX component instead, rendering on the host computer.
- **Mixxx legacy XML schema as the sole authoring format.** MAP2 uses YAML for native packs (more readable, schema-validates with jsonschema, comments survive). Mixxx XML is fully supported as an *import/export* format; it is not the canonical authoring path on MAP2.
- **Mixxx's `[ChannelN]` deck model.** MAP2 has chains, not decks. The bridge layer (Section 6.4) maps Mixxx ControlObject names (`[Channel1].volume`) to MAP2 engine targets (`audio.chain.1.volume`). Mixxx mappings expecting deck features MAP2 doesn't have (scratch on a beatgrid, AutoDJ, beatsync) fail soft per binding.

---

## 3. Process model

### 3.1 Two processes

The audio engine and the mapping-script runtime are **separate processes**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          map2-backend.service                                │
│                          (Python, FastAPI, port 8080)                        │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ app/services/controller_host_service.py                              │  │
│  │ supervises both child processes; exposes /api/devices,               │  │
│  │ /api/devices/<id>/profile, /api/devices/<id>/measure-latency, ...    │  │
│  └────────┬──────────────────────────────────────────┬──────────────────┘  │
│           │ Unix socket                              │ Existing JUCE bridge│
│           │ /run/map2/controller-host.sock           │                     │
└───────────┼─────────────────────────────────────────┼─────────────────────┘
            │                                          │
            ▼                                          ▼
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│  map2-controller-host (NEW)      │    │  juce-engine binary               │
│  juce-engine/build/              │    │  juce-engine/build/               │
│  map2-controller-host            │    │  map2_juce_engine                 │
│                                  │    │                                   │
│  - QuickJS embedded              │    │  - Audio thread (CPUs 4,5)        │
│  - Map2HidController             │    │  - Map2MidiController             │
│  - Map2BulkController            │    │  - Fast-path MIDI bindings        │
│  - Mapping JS execution          │    │  - Plugin host                    │
│  - common-hid-parser.js          │    │  - Engine API surface             │
│                                  │    │                                   │
│  CPUs 0-3                        │    │  Audio: CPUs 4,5                  │
│  Heap: 256 MB max                │    │  Other: CPUs 0-3                  │
└──────────────────────────────────┘    └──────────────────────────────────┘
```

### 3.2 Crash isolation budget

A buggy mapping JS can do three bad things; this architecture stops them at the process boundary:

| Failure mode | Behavior |
|---|---|
| Infinite loop in JS | Hangs `controller-host` only. Audio engine keeps audio running. Supervisor kills + restarts within 5 s. |
| `null` deref in QuickJS C bindings | `controller-host` crash. Audio uninterrupted. Supervisor restarts. |
| JS allocates 2 GB | `controller-host` OOM. Supervisor restarts. Audio fine. |
| JS spams `engine.setValue` 1M/s | Backend's IPC layer rate-limits; `controller-host` stalls; engine never sees the storm. |
| Bad YAML in a pack | Pack-level isolation. `ProfileRegistry.load_packs()` logs and skips the broken pack. Backend boots without that pack. Other packs unaffected. |
| QuickJS source has a parse error | Mapping fails to load. Other mappings on same controller unaffected. |

The last row is the operationally important one: **a broken vendor pack must never block backend boot.** This is a hard requirement, mirroring CLAUDE.md's "AVB Install Defaults Drift" gotcha.

### 3.3 Fast-path C++ exemption

Some control paths need sub-millisecond response — a guitarist's footswitch tapping tempo, a momentary effect bypass during a run. The architecture supports this via per-control opt-in:

```yaml
# device-packs/edirol-ua/profiles/ua-1000.midi.yaml
controls:
  - { status: 0xB0, midino: 64, action: bypass, target: audio.chain.1.bypass, fast_path: true }
```

A `fast_path: true` control is wired in C++ inside `Map2MidiController::dispatch()` directly to the engine target, bypassing the IPC round-trip and QuickJS execution. The path is **explicit per-control opt-in only** — arbitrary JS cannot be promoted to fast path. This keeps the audio engine's binary free of QuickJS while still meeting tight latency budgets where they matter.

---

## 4. Vendor-pack format

### 4.1 Directory layout

```
device-packs/
├── README.md                         operator + pack-author guide
├── SCHEMA.md                         schema reference, examples
├── _runtime/                         shared JS libraries (MAP2-authored, AGPLv3)
│   ├── map2-components.js
│   └── common-hid-parser.js
├── _schema/                          JSON Schema files (Draft-07)
│   ├── pack.schema.yaml
│   ├── audio-profile.schema.yaml
│   ├── midi-profile.schema.yaml
│   └── hid-profile.schema.yaml
├── _mixx-imports/                    GPLv2-or-later imports from upstream Mixxx
│   ├── LICENSE.MIXX                  upstream license text + author credits
│   ├── MANIFEST.yaml                 upstream commit hash + import date
│   ├── res/controllers/              full mirror of mixxx/res/controllers/
│   │   ├── Pioneer-DDJ-SX.midi.xml   <-- read-only (Mixxx-authored)
│   │   ├── Pioneer-DDJ-SX.midi.xml.MAP2.yaml   <-- MAP2 sidecar, MAP2-mutable
│   │   ├── Pioneer-DDJ-SX-scripts.js
│   │   ├── ...
│   │   └── (~290 files total)
│   └── _runtime/                     GPLv2 versions of common-hid-packet-parser.js etc.
├── _tests/
│   └── fixture-pack/                 synthetic pack used by validation tests
├── edirol-ua/                        vendor pack
│   ├── pack.yaml                     vendor identity, family rules, shared metadata
│   ├── shared/
│   │   ├── identifier_rules.yaml     VID 0x0582, PID range, ALSA card-name regex
│   │   ├── images/                   logo, family branding
│   │   └── overrides/
│   │       └── EdirolRBusPanel.tsx   shared override for any UA with R-BUS
│   ├── profiles/
│   │   ├── ua-25.audio.yaml
│   │   ├── ua-25.midi.yaml
│   │   ├── ua-101.audio.yaml
│   │   ├── ua-1000.audio.yaml
│   │   ├── ua-1000.midi.yaml
│   │   └── ...                       (UA-25EX, UA-700, UA-1010)
│   ├── scripts/
│   │   └── ua-1000-scripts.js
│   └── overrides/
│       └── UA1000RBusRouter.tsx
└── hotone/
    ├── pack.yaml
    ├── profiles/
    │   ├── jogg.audio.yaml
    │   ├── jogg.midi.yaml
    │   └── ...                       (Ampero One, Ampero II Stage, Ampero Mini, Soul Press II)
    ├── scripts/
    │   └── jogg-scripts.js
    └── overrides/
        └── HotoneJoggExtras.tsx
```

### 4.2 Schema (excerpt — full reference in `device-packs/SCHEMA.md`)

```yaml
# device-packs/edirol-ua/profiles/ua-1000.audio.yaml
schema_version: 1
identity:
  manufacturer: Edirol (Roland)
  model: UA-1000
  family: Edirol UA series
  hardware_id: usb:0582:00ed
  alsa_card_regex: '^UA1000\b'
ports:
  - id: aux0
    kind: analog
    direction: bidirectional
    count: 1
    sample_rates: [44100, 48000, 88200, 96000]
    bit_depths: [24]
    connectors: [trs_quarter_inch]
    jack_node_pattern: 'EDIROL UA-1000 Pro'
  # ... AUX1-AUX9 ...
  - id: rbus_in
    kind: digital
    direction: input
    count: 8
    connectors: [rbus_db25]
mixer_surfaces:
  - id: front_panel_monitor
    kind: hardware
    description: 'Front-panel monitor mix; controlled physically, not via software.'
on_device_dsp: []   # UA-1000 has no internal DSP processors
control_surface:
  - id: midi_din
    kind: midi_din
    direction: bidirectional
    alsa_client_pattern: 'UA-1000 MIDI'
routing_topology:
  default_matrix: identity_10x10
  allowed_routes: [identity, fan_out, monitor_send]
loopback_ports:
  playback: 'EDIROL UA-1000 Pro:playback_AUX0'
  capture: 'EDIROL UA-1000 Pro:capture_AUX0'
use_case_presets:
  - id: 8ch_studio_recording
    name: '8-channel studio recording'
    ports_used: [aux0, aux1, aux2, aux3, aux4, aux5, aux6, aux7]
    routing: identity
metadata:
  product_image_urls:
    - 'https://www.roland.com/us/products/ua-1000/images/ua-1000_front.jpg'
  datasheet_url: 'https://static.roland.com/assets/media/pdf/UA-1000_OM.pdf'
  manual_url: 'https://www.roland.com/us/support/by_product/ua-1000/owners_manuals/'
  vendor_support_url: 'https://www.roland.com/us/support/by_product/ua-1000/'
```

### 4.3 Vendor-override TSX

A vendor pack may ship optional React components at `<pack>/overrides/<Component>.tsx`. They are lazy-imported by `<DeviceProfilePanel/>` and composed into the auto-rendered scaffold. Override components are subject to MAP2's Carbon conformance review (`docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`); `npm --prefix web run build` covers them.

---

## 5. IPC contract — backend ↔ controller-host

### 5.1 Transport

Unix-domain socket at `/run/map2/controller-host.sock`. Length-prefixed JSON frames (4-byte big-endian length, then UTF-8 JSON payload). Same primitive as the existing JUCE engine bridge — reused, not reinvented.

### 5.2 Message types

**Inbound (backend → host):**

| Type | Purpose |
|---|---|
| `ScriptLoadRequest` | Load a mapping script + YAML descriptor for a controller |
| `MappingActivate` | Set the active mapping for a connected controller |
| `MidiSendRequest` | Send a MIDI message out via a controller (LED feedback, etc.) |
| `Shutdown` | Graceful shutdown |

**Outbound (host → backend):**

| Type | Purpose |
|---|---|
| `EngineCommand` | A JS `engine.setValue(...)` call to forward to the audio engine |
| `ControllerEvent` | A raw MIDI/HID event seen on a controller (used by the learn wizard) |
| `LogEvent` | A JS `engine.log(...)` line |
| `ScriptError` | A QuickJS exception caught in a mapping; includes file, line, stack |

### 5.3 Schema sync

Python `TypedDict`s in `app/schemas/controller_host.py` and matching C++ `struct`s in `juce-engine/Source/ControllerHost/IpcMessages.h`. CI test `tests/test_controller_host_ipc_schema.py` parses both and fails if any field drifts. Mirrors the existing JUCE-engine schema-sync test.

---

## 6. Mixxx interoperability

### 6.1 License compatibility

MAP2 is **AGPL-3.0-only** (per `LICENSE` at repo root). Mixxx is **GPLv2-or-later**. The "or later" clause in Mixxx's license lets us treat upstream files as GPLv3, and GPLv3 is upward-compatible with AGPLv3.

**The combined work complies.** Mixxx imports go under `device-packs/_mixx-imports/` with:

1. Upstream Mixxx copyright headers preserved verbatim in every file.
2. `device-packs/_mixx-imports/LICENSE.MIXX` reproducing GPLv2-or-later license text + Mixxx authorship credits.
3. `device-packs/_mixx-imports/MANIFEST.yaml` recording the upstream commit hash + import date.
4. Root `LICENSE` updated with a one-line note that part of the work is third-party-sourced under GPLv2-or-later.
5. CI test `tests/test_mixxx_imports_immutable.py` verifying no Mixxx-attributed file has been edited (only the sidecar `<file>.MAP2.yaml` files are MAP2-mutable).

The license posture is non-negotiable. There is no "bypass" mode. The path above is the legitimate, audit-survivable, downstream-distributable path that gives MAP2 the entire 290-file Mixxx corpus.

### 6.2 Import (Mixxx XML/JS → MAP2)

`MixxxXmlReader` (C++, `juce-engine/Source/ControllerHost/MixxxXmlReader.{h,cpp}`, pugixml-backed) parses the upstream `<info>`, `<controller>`, `<scriptfiles>`, `<controls>`, `<outputs>` schema verbatim. Output is a `MappingDescriptor` that is identical in shape to what the YAML reader produces — both feed the same downstream pipeline.

### 6.3 Export (MAP2 → Mixxx XML/JS)

`mixxx_xml_writer.py` (`app/services/controllers/mixxx_xml_writer.py`) serializes a `MappingDescriptor` to upstream-compatible XML + an emitted `<model>-scripts.js`. The `<MappingNodeGraphEditor/>` GUI consumes this for the "Export to Mixxx format" action.

### 6.4 Bridge — Mixxx ControlObject → MAP2 engine target

Mixxx mappings refer to controls by ControlObject name: `[Channel1].volume`, `[EffectRack1_EffectUnit1_Effect1].parameter1`. MAP2 has no decks or effect racks in the Mixxx sense. The bridge layer translates:

```python
# app/services/controllers/mixxx_control_object_bridge.py
WELL_KNOWN: dict[tuple[str, str], str] = {
    ('[Channel1]', 'volume'): 'audio.chain.1.volume',
    ('[Channel1]', 'pfl'):    'audio.chain.1.solo',
    ('[Master]',   'volume'): 'audio.master.volume',
    # ... ~150 well-known mappings ...
}

def resolve(group: str, key: str, alias_table: dict[str, str]) -> str | None:
    """Returns a MAP2 engine target, or None if unmappable (binding fails soft)."""
    if (group, key) in WELL_KNOWN:
        return WELL_KNOWN[(group, key)]
    if group in alias_table:
        return f'{alias_table[group]}.{key}'
    return None  # caller logs a warning and skips this binding
```

Per-pack alias tables live in `device-packs/_mixx-imports/res/controllers/<file>.MAP2.yaml`. When the operator imports a Mixxx mapping that uses `[Channel1]..[Channel4]`, the GUI prompts: "This Mixxx mapping expects 4 decks. Map them to which MAP2 chains?" The choices persist in the sidecar YAML.

Bindings that touch unmapped Mixxx features (scratch, beatgrid, AutoDJ, sampler) **fail soft**: the binding is skipped at load time, a warning is logged. The hardware control still works for the bindings that *do* map. This is the right behavior — refusing to load any mapping that touches an unmapped feature would reject every interesting Mixxx mapping.

### 6.5 Round-trip test

`tests/test_mixxx_xml_round_trip.py` imports `Pioneer-CDJ-2000.midi.xml` (a simple Mixxx mapping), serializes it back with `mixxx_xml_writer`, re-parses the result, and asserts the in-memory `MappingDescriptor` is structurally equal to the first one. This is the contract: round-trip without lossy edits is a hard CI gate.

---

## 7. GUI — `<MappingNodeGraphEditor/>`

### 7.1 Authoring model

Carbon node-graph editor on `/devices/<id>/mappings`, built on ReactFlow (already in MAP2's tech stack per `docs/CLAUDE.md`).

- **Left node column:** MIDI/HID/bulk inputs from the connected controller (one node per `<control>` row in the YAML).
- **Right node column:** MAP2 engine targets (one node per addressable parameter — `audio.chain.<n>.volume`, `audio.chain.<n>.bypass`, `audio.master.volume`, etc.).
- **Middle:** drag-in logic nodes — latch, momentary, scaling, soft-takeover, mode-switch, encoder-acceleration, LED-output, multi-mode shift layer.
- **Imported Mixxx mappings:** complex stateful JS lands as a single "Custom JS" passthrough node. Operators can refactor pieces out into the visual graph if they want, or leave it as JS forever.

### 7.2 Persistence

The graph serializes to **both** YAML+JS (for native packs) **and** Mixxx XML+JS (for export). Two emitters, one node-graph data model. This is the β1 round-trip contract.

### 7.3 JS escape hatch

Any node in the graph may be a "Custom JS" node containing arbitrary QuickJS. JS nodes have inputs and outputs that connect to other graph nodes via well-defined types (number, boolean, MIDI message, HID report, void). Hand-writing JS is fully supported; the GUI is the *primary* authoring surface but not the *only* one.

---

## 8. Build / deploy integration

### 8.1 Backend startup

`ProfileRegistry.load_packs()` walks `device-packs/` at backend startup. For each pack:

1. Validate `pack.yaml` against `_schema/pack.schema.yaml`.
2. For each `profiles/<model>.<kind>.yaml`, validate against the corresponding schema.
3. For each `scripts/<model>-scripts.js`, parse with QuickJS to verify syntactic validity.
4. For each `overrides/<Component>.tsx`, the file is compiled by Vite at frontend build time (no backend-side check needed).
5. **Failure handling:** any file that fails validation logs an error and the pack is marked `degraded` but **the pack does not block backend boot**. Other packs continue to load. The GUI surfaces a "Pack <name> degraded" indicator on the Devices page.

### 8.2 `update` shorthand (CLAUDE.md §0.6)

No changes. `npm --prefix web run build` already picks up YAML and TSX changes naturally. `python3 scripts/continuous_release.py --commit-message "..."` does the full release loop without any controller-subsystem-specific steps.

### 8.3 CI gates (CLAUDE.md §0.8 Definition of Done)

A T2459 commit is **not Done** until all of these pass:

1. `python3 -m pytest tests/test_device_packs_schema.py` — every shipped YAML validates.
2. `python3 -m pytest tests/test_controller_host_ipc_schema.py` — Python TypedDicts and C++ structs are field-aligned.
3. `python3 -m pytest tests/test_controller_host_quickjs.py` — QuickJS engine semantics covered.
4. `python3 -m pytest tests/test_map2_midi_controller.py` — synthesized-MIDI integration suite.
5. `python3 -m pytest tests/test_mixxx_mapping_load.py` — every file in `_mixx-imports/` parses without error.
6. `python3 -m pytest tests/test_controller_host_failure_injection.py` — IPC failure modes don't crash audio.
7. `npm --prefix web run typecheck` — including all override TSX files.
8. `npm --prefix web run build` — including all override TSX files; bundle hash changes when source changes.
9. `cmake --build juce-engine/build` — both `map2_juce_engine` and `map2-controller-host` link clean.
10. Carbon conformance review on any new TSX per `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`.

Beyond per-commit gates, every device-pack-touching commit also requires:

11. `scripts/run_t2459_device_subsystem_hil_smoke.py` green on the bench (when bench access is available; gating CI with offline fixture-pack runs otherwise).

### 8.4 Definition of Done specifically for the epic

T2459 is closed only when:

- All 29 subtasks (T2459-A1 through T2459-F5) are `[✓] Done` with completion notes.
- UA-1000 panel renders, MIDI bridge controls a chain end-to-end, R-BUS override mounts, latency measurement shows physically plausible RTT.
- Hotone Jogg panel renders, onboard amp/cab override mounts, headphone use-case preset works, latency measurement reproduces ≈25 ms reading.
- Edirol UA range (6 SKU profiles) and Hotone product range (5 SKU profiles) ship validated.
- Mixxx import (~290 files) imported with attribution; CI mapping-load smoke green.
- `<MappingNodeGraphEditor/>` round-trips Mixxx XML on at least 5 representative mappings.
- Path-c `scripts/measure_loopback_ir.py` exists and produces evidence.

---

## 9. Open questions (deferred to future epics)

These are intentionally **not** in T2459 scope. They are listed here so the architecture leaves room for them.

- **OSC controller protocol.** Some pro audio gear (TouchOSC, Lemur, Reaper-style controllers) speaks OSC, not MIDI. Pattern would parallel `Map2MidiController`. Defer to a T-future-OSC epic.
- **Network MIDI (RTP-MIDI / IP-MIDI).** Same story; same controller-host home; defer.
- **Onboard controller screens (Traktor S4 MK3 etc.).** Mixxx renders QML to onboard USB displays. MAP2 would need either Qt or a JUCE-rendered-USB-display layer. Defer indefinitely.
- **Cluster-level controller routing.** A controller plugged into one MAP2 node, driving a chain on a remote node. Pattern would route `EngineCommand` IPC through the existing cluster-proxy middleware. Defer.

---

## 10. Cross-references

- **Worklist:** `docs/PROJECT_WORKLIST.md` T2459 epic + 29 subtasks.
- **Project rulebook:** `docs/CLAUDE.md` (this doc cross-linked from "Critical System Rules").
- **Canonical Claude rulebook:** `.gemini/instructions.md` (new "Device Packs" section added by T2459-A1).
- **Carbon conformance:** `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`.
- **Configuration authority:** `docs/architecture/CONFIGURATION_AUTHORITY_MODEL.md` (controller-host config lives in `/etc/map2/controller-host.json` for host-scoped settings, `~/.map2/controller-aliases.yaml` for per-user Mixxx alias tables).
- **Bench evidence motivating path-c:** `docs/fit-for-purpose-evidence/20260426/bench-execute-summary.md`, commit `1f079def`.
- **Memory:** `/home/mm/.claude/projects/-home-mm-map2-audio/memory/project_t2459_controller_layer.md` (locked decisions snapshot).

---

**End of document.** Authoritative for T2459 implementation work. Edits go through the standard `update` shorthand and dual-push.

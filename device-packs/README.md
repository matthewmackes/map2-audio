# MAP2 Device Packs

Canonical home for every supported audio interface, MIDI controller, HID device, and bulk USB device on the MAP2 Audio Platform.

**Architecture:** [`docs/architecture/CONTROLLER_LAYER.md`](../docs/architecture/CONTROLLER_LAYER.md) · **Worklist anchor:** `T2459` (T800-equivalent epic) · **Schema reference:** [`SCHEMA.md`](SCHEMA.md)

## Directory layout

```
device-packs/
├── README.md                    this file
├── SCHEMA.md                    schema reference + worked examples
├── _runtime/                    shared MAP2-authored JS libraries (AGPL-3.0-only)
│   ├── map2-components.js       Button / Knob / Encoder / Deck / Component framework
│   ├── common-hid-parser.js     HID packet parser library
│   └── sysex-tags.js            shared MPX-1 / IntelFX name-tag helpers
├── _schema/                     JSON Schema files (Draft-07)
│   ├── pack.schema.yaml
│   ├── audio-profile.schema.yaml
│   ├── midi-profile.schema.yaml
│   └── hid-profile.schema.yaml
├── _mixx-imports/               GPLv2-or-later imports from upstream Mixxx
│   ├── LICENSE.MIXX             upstream license + Mixxx authorship
│   ├── MANIFEST.yaml            upstream commit hash + import date
│   ├── _runtime/                GPLv2 versions of common-hid-packet-parser.js etc.
│   └── res/controllers/         full mirror of upstream mixxx/res/controllers/
├── _tests/
│   └── fixture-pack/            synthetic pack used by validation tests
└── <vendor>/                    one directory per vendor
    ├── pack.yaml                vendor manifest
    ├── shared/
    │   ├── identifier_rules.yaml
    │   ├── images/
    │   └── overrides/           shared React override TSX components
    ├── profiles/
    │   ├── <model>.audio.yaml
    │   ├── <model>.midi.yaml
    │   └── <model>.hid.yaml
    ├── scripts/
    │   └── <model>-scripts.js
    └── overrides/
        └── <Component>.tsx       per-model React override
```

## Hard rules

1. **`device-packs/` is shipped, not generated.** Single repo, lockstep release with the platform. No submodules. No external pack registry.
2. **A broken pack must never block backend boot.** `ProfileRegistry.load_packs()` validates every YAML at startup; broken packs are logged and skipped, other packs still load.
3. **Mixxx-imported files are read-only.** The upstream Mixxx headers are preserved verbatim. Only the sidecar `<file>.MAP2.yaml` files are MAP2-mutable. CI test `tests/test_mixxx_imports_immutable.py` enforces this.
4. **Override TSX components are subject to MAP2's Carbon conformance review** per `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`. They build with the rest of the frontend via `npm --prefix web run build`.
5. **Fast-path C++ bindings are per-control opt-in only.** A `fast_path: true` row in YAML is wired in C++ inside `Map2MidiController::dispatch()` directly to the engine target, bypassing the IPC round-trip and QuickJS execution. Arbitrary JS cannot be promoted to fast path.

## Authoring a new pack

1. Create `device-packs/<vendor>/pack.yaml` following [`_schema/pack.schema.yaml`](_schema/pack.schema.yaml).
2. Add audio/MIDI/HID profile YAML files under `device-packs/<vendor>/profiles/` for each supported model, matching the schemas under [`_schema/`](_schema/).
3. (Optional) Add JS scripts under `device-packs/<vendor>/scripts/` for stateful logic.
4. (Optional) Add Carbon-conformant React override components under `device-packs/<vendor>/overrides/` for vendor-specific UX.
5. Run `pytest tests/test_device_packs_schema.py` — every YAML must validate.
6. Run `npm --prefix web run typecheck` — every override TSX must compile.

## Authoring a new mapping (binding hardware to MAP2 actions)

The **primary** authoring surface is the Carbon node-graph editor at `/devices/<id>/mappings` (T2459-C4). Hand-editing YAML is supported but the GUI is the recommended path. The GUI supports both YAML+JS export (for native packs) and Mixxx XML+JS export (for upstream Mixxx-format compatibility).

## Mixxx interoperability

MAP2 reads and writes upstream Mixxx XML+JS mapping format. The full upstream `mixxx/res/controllers/` corpus is mirrored under `_mixx-imports/` with original copyright headers preserved.

Mixxx `[ChannelN]` decks have no direct MAP2 equivalent — when an operator imports a Mixxx mapping, a one-time wizard maps each `[ChannelN]` to a MAP2 chain. The choices persist in the sidecar `<file>.MAP2.yaml`. Mixxx bindings touching features MAP2 doesn't have (scratch on a beatgrid, AutoDJ, sampler) **fail soft** — logged warning, binding skipped, hardware control still works for the bindings that do map.

## License posture

- Pack-original content (overrides, scripts, MAP2-authored profiles): **AGPL-3.0-only** (matches MAP2 root license).
- `_mixx-imports/`: **GPLv2-or-later** (preserved from upstream Mixxx). License-compatible with MAP2's AGPL-3.0-only via the GPLv2-or-later → GPLv3 → AGPLv3 upward chain.
- License attribution is non-negotiable. Edits to Mixxx-attributed files are forbidden by CI.

See [`docs/architecture/CONTROLLER_LAYER.md`](../docs/architecture/CONTROLLER_LAYER.md) §6 for the full posture.

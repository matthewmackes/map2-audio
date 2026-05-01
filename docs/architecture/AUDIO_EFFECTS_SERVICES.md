# Audio Effects Services — first-class platform service offering (epic stub)

**Status**: Epic stub — full design + execution pending. Architecture doc + 5 architectural diagrams provided as the starting point for the future epic per the 2026-05-01 user directive.
**Template**: This doc lifts the structure from `docs/architecture/MIDI_SERVICES.md` (the reference implementation) and customizes for Audio Effects. See `FIRST_CLASS_SERVICES.md` for the unification pattern + the 9-step process for opening a first-class-services epic.

---

## 1. The four-services framing position

Audio Effects is one of the four first-class platform service offerings (MIDI / AVB / Sampler / **Audio Effects**). It owns the chain graph — plugins, parameters, automation, insertions, effects loops, A/B comparison, snapshot persistence, and the runtime activation FSM that ships chain state to the JUCE audio engine.

**Today's state** (2026-05-01) — **most-mature of the four; partial unification already exists**:
- **State Authority graph** (`app/services/state_authority_graph.py`): canonical version `2026.04`, schema at `schemas/snapshot-graph-v1.schema.json`. Already used by the Snapshot Editor as the canonical chain/plugin representation.
- **Snapshot Activation FSM** (`app/services/snapshot_activation_fsm.py`): canonical state machine for snapshot activation transitions (Idle → Staging → Activating → Live → Failed).
- **Snapshot Editor** (`web/src/app/components/SnapshotEditor/` + `SnapshotEditorPageContent.tsx`): canonical chain authoring surface. ~8,500 LOC after the T2467-T2473 decomposition.
- **JUCE engine** (`juce-engine/Source/`): owns the live plugin graph in the audio callback. State sync via `JuceAudioGraph` + `Map2AudioEngine`.
- **Multiple parallel storage layers**:
  - `Snapshot` table — root snapshot record (name, document JSON, controls_payload, etc.)
  - `SnapshotChain` + `SnapshotChainPlugin` + `SnapshotChannel` + `SnapshotRouting` — relational shape
  - `Chain` + `ChainPlugin` (legacy non-snapshot chain table)
  - `Preset` + `PluginPreset` + `CommunityPreset` (plugin/chain preset tables)
  - `EffectsLoop` + `EffectsLoopInsertion` + `EffectsLoopCalibration` (effects-loop subsystem)
  - State Authority graph document (lives inside `Snapshot.document` JSON column)
- **No standalone Audio Effects surface**: chain authoring lives in Snapshot Editor; chain runtime state is split between snapshot service + JUCE engine.

**Cross-service consumer relationships**:
- **Audio Effects consumes MIDI** (the most common pattern — MIDI bindings drive plugin parameters via the `plugin_param` consumer in MIDI Services).
- **Audio Effects consumes AVB** (input/output streams feed/drain the chain).
- **Audio Effects consumes Sampler** (a sampler output can feed a chain).

---

## 2. Unification scope (when the epic opens)

**Canonical authority**: extend State Authority graph to be **the** canonical for chains/plugins/parameters/automation/insertions/loops. The graph schema is already at v1; the unification work is reframing every parallel storage layer as a projection over the graph (or absorbing it).

**Canonical surface**: `/effects` mount (final naming TBD — could be `/chains`, `/audio`, etc.). Single entry point for chain authoring, plugin browsing, parameter automation, A/B comparison, effects-loop calibration. The Snapshot Editor's chain authoring panels become regions of this surface.

**Migration**:
- Audit which parallel storage layers (Chain, ChainPlugin, EffectsLoop, etc.) carry data not already represented in the State Authority graph; lift any unique data into graph extensions; delete the parallel tables.
- Audit which JUCE engine state needs to be mirrored vs derived from the graph.
- Lift the Snapshot Editor's chain authoring concerns into the canonical surface.

**Inventory (preliminary, very high-level — actual epic will need a more thorough audit)**:
- State Authority graph → already canonical, needs minor extensions for chain-level concerns
- Snapshot Editor chain authoring panels → absorbed into `/effects` regions
- Chain + ChainPlugin tables (legacy, non-snapshot) → audit + retire OR convert to projection
- Preset + PluginPreset + CommunityPreset tables → audit + decide whether they're Audio Effects concerns or a separate Preset Services concern
- EffectsLoop subsystem → reframed as a chain-level construct in the graph
- JUCE engine plugin graph → derived from the graph at activation time (already mostly true)

**Unique to Audio Effects vs the other 3 services**: the canonical authority **already exists** and is **already in use**. The unification work here is less "build a new authority" and more "audit the parallel layers, retire what's redundant, formalize the surface."

---

## 3. Architectural diagrams (5 required views)

### 3.1 Process topology

```mermaid
flowchart LR
    subgraph host["Host process — app/ (FastAPI on :8080)"]
        effects_routes["/api/effects/* routes\n(planned)"]
        snapshot_routes["/api/snapshots/* (existing,\nrewires through projection)"]
        state_authority["State Authority graph\n(app/services/state_authority_graph.py)\n— ALREADY canonical"]
        activation_fsm["Snapshot Activation FSM\n(app/services/snapshot_activation_fsm.py)"]
        effects_projections["Per-consumer projections\n(snapshot, midi_binding,\navb_stream, sampler_instrument)"]
    end

    subgraph juce_engine["juce-engine (C++ audio)"]
        audio_graph["JuceAudioGraph\n(plugin graph instance)"]
        plugins["LV2 plugins\n(NAM, Dragonfly, MVerb, etc.)"]
        audio_callback["audio callback\n(RT thread,\nplugin processing chain)"]
    end

    effects_routes -->|reads/writes| state_authority
    snapshot_routes -->|reads/writes| state_authority
    effects_projections --> state_authority
    state_authority --> activation_fsm
    activation_fsm -.->|stage + activate| audio_graph
    audio_graph --> plugins
    plugins --> audio_callback

    style state_authority fill:#198038,color:#fff
    style activation_fsm fill:#198038,color:#fff
    style effects_routes fill:#0f62fe,color:#fff
    style effects_projections fill:#a6c8ff
```

(State Authority + Activation FSM are green = already canonical. The new work is the canonical surface + parallel-layer retirement, not building the authority from scratch.)

### 3.2 Storage layout

```mermaid
flowchart TB
    subgraph canonical["CANONICAL (already partially exists)"]
        state_graph[("State Authority graph\n(Snapshot.document JSON column,\nschema v2026.04)")]
    end

    subgraph parallel["PARALLEL STORAGE LAYERS (to retire OR reframe)"]
        snapshot_root[("Snapshot table\n(root record + non-graph fields:\ntempo, version, output_level,\nio_bindings)")]
        snapshot_relational[("SnapshotChain + SnapshotChainPlugin\n+ SnapshotChannel + SnapshotRouting\n(relational mirror of the graph)")]
        legacy_chain[("Chain + ChainPlugin\n(legacy non-snapshot tables)")]
        presets[("Preset + PluginPreset +\nCommunityPreset\n(plugin/chain preset library)")]
        effects_loops[("EffectsLoop + EffectsLoopInsertion\n+ EffectsLoopCalibration\n(effects-loop subsystem)")]
    end

    state_graph -.->|future: reframe as\nrelational projection| snapshot_relational
    snapshot_root -.->|root metadata stays;\nchain content moves to graph| state_graph
    legacy_chain -.->|future: retire OR\nconvert to projection| state_graph
    effects_loops -.->|future: reframe as\ngraph-level construct| state_graph
    presets -.->|future: audit —\nseparate Preset Services?| state_graph

    style canonical fill:#defbe6
    style state_graph fill:#198038,color:#fff
    style parallel fill:#fff8e1
```

### 3.3 Consumer surface

```mermaid
flowchart TB
    state_authority["State Authority graph\n(SINGLE SOURCE — already canonical)"]

    subgraph apis["Public API surfaces"]
        effects_routes["/api/effects/* (planned)"]
        snapshot_routes["/api/snapshots/* (existing,\nthe graph's primary API today)"]
        engine_routes["/api/engine/* (existing,\nrouting to JUCE)"]
    end

    subgraph projections["Per-consumer projections (planned/partial)"]
        snapshot_proj["snapshot.py (planned)"]
        midi_binding_proj["midi_binding.py\n(plugin_param targets)"]
        avb_stream_proj["avb_stream.py\n(I/O endpoints)"]
        sampler_instrument_proj["sampler_instrument.py\n(sampler outputs as chain inputs)"]
    end

    subgraph editor_surfaces["Editor UI surfaces"]
        snapshot_editor["Snapshot Editor\n(stays in /snapshots/<id>;\nchain panels rewire to /effects regions)"]
        effects_console["/effects canonical surface (planned)"]
        chain_graph_canvas["Chain graph canvas\n(SnapshotEditor/ChainGraphCanvas.tsx)"]
        unified_channel_grid["UnifiedChannelGrid\n(SnapshotEditor 8-slot grid)"]
    end

    snapshot_routes --> state_authority
    effects_routes --> state_authority
    engine_routes --> state_authority
    snapshot_proj --> state_authority
    midi_binding_proj --> state_authority
    avb_stream_proj --> state_authority
    sampler_instrument_proj --> state_authority

    snapshot_editor --> snapshot_routes
    snapshot_editor --> chain_graph_canvas
    snapshot_editor --> unified_channel_grid
    effects_console --> effects_routes
    chain_graph_canvas --> state_authority
    unified_channel_grid --> state_authority

    style state_authority fill:#198038,color:#fff
    style effects_console fill:#fff8e1
    style effects_routes fill:#fff8e1
```

### 3.4 Migration narrative

```mermaid
flowchart LR
    subgraph today["TODAY (2026-05-01)"]
        graph_done["State Authority graph v2026.04\n(SHIPPED, in use)"]
        activation_done["Activation FSM\n(SHIPPED)"]
        snapshot_editor_done["Snapshot Editor\n(8500 LOC, decomposed T2467-T2473)"]
        parallel_layers["5 parallel storage layers\nstill present"]
    end

    subgraph future_p1["Audio Effects Services Phase 1"]
        backend_audit["Backend audit:\nwhich parallel layers carry\nunique data vs derived"]
        graph_extensions["State Authority graph extensions\n(if needed for chain-level concerns)"]
    end

    subgraph future_p2["Audio Effects Services Phase 2"]
        projection_layer["Per-consumer projections\n(snapshot, midi_binding,\navb_stream, sampler_instrument)"]
        legacy_retirement["Parallel-layer retirement:\nChain + ChainPlugin → projection;\nEffectsLoop → graph extension;\nPresets → audit (separate service?)"]
        verification["Verification suite\n(round-trip + activation\ngolden tests)"]
    end

    subgraph future_p3["Audio Effects Services Phase 3 (frontend)"]
        canonical_surface["/effects canonical mount"]
        snapshot_editor_reframe["Snapshot Editor chain panels\nreframed as /effects regions\n(stays in place visually,\nbackend rewires through projection)"]
    end

    subgraph future_p4["Audio Effects Services Phase 4"]
        template_lift["Template lifted from\nFIRST_CLASS_SERVICES.md\n(MOST-IMPORTANT diagram update:\nshow how the partial unification\nbecame full)"]
    end

    graph_done --> backend_audit
    snapshot_editor_done --> backend_audit
    parallel_layers --> backend_audit
    activation_done --> projection_layer
    backend_audit --> graph_extensions
    graph_extensions --> projection_layer
    projection_layer --> legacy_retirement
    legacy_retirement --> verification
    verification --> canonical_surface
    canonical_surface --> snapshot_editor_reframe
    snapshot_editor_reframe --> template_lift

    style today fill:#defbe6
    style graph_done fill:#198038,color:#fff
    style activation_done fill:#198038,color:#fff
    style future_p1 fill:#fff8e1
    style future_p2 fill:#fff8e1
    style future_p3 fill:#e8e8e8
    style future_p4 fill:#e8e8e8
```

### 3.5 Four-services framing position

```mermaid
flowchart TB
    subgraph platform["MAP2 Audio Platform"]
        midi["MIDI Services\n(T2482 Phase 2 SHIPPED)"]
        avb["AVB Services\n(epic queued)"]
        sampler["Sampler Services\n(epic queued)"]
        effects["Audio Effects Services\n(this doc — epic queued)\n• State Authority graph (CANONICAL)\n• Snapshot Editor (mature)\n• Activation FSM (canonical)\n• 5 parallel storage layers to retire\n• needs canonical surface\n  + parallel-store retirement"]
    end

    template["FIRST_CLASS_SERVICES.md\n(template established)"]

    midi -.->|template lifts to| effects
    template -.->|reused by| effects

    midi -->|consumed by| effects
    avb -->|consumed by| effects
    sampler -.->|optional| effects

    style midi fill:#defbe6
    style avb fill:#e8e8e8
    style sampler fill:#e8e8e8
    style effects fill:#fff8e1
    style template fill:#0f62fe,color:#fff
```

---

## 4. References

- `docs/architecture/FIRST_CLASS_SERVICES.md` — the template this doc lifts from
- `docs/architecture/MIDI_SERVICES.md` — reference implementation
- `app/services/state_authority_graph.py` — already-canonical State Authority graph
- `app/services/snapshot_activation_fsm.py` — Activation FSM
- `schemas/snapshot-graph-v1.schema.json` — graph schema v2026.04
- `web/src/app/components/SnapshotEditor/` — Snapshot Editor (8500 LOC, decomposed)
- `juce-engine/Source/JuceAudioGraph.cpp` — JUCE plugin graph instance
- `~/.claude/projects/-home-mm-map2-audio/memory/project_state_authority.md` — State Authority redesign
- `~/.claude/projects/-home-mm-map2-audio/memory/project_snapshoteditor_decomposition.md` — Snapshot Editor T2467-T2473 epic

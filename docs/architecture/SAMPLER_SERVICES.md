# Sampler Services — first-class platform service offering (epic stub)

**Status**: Epic stub — full design + execution pending. Architecture doc + 5 architectural diagrams provided as the starting point for the future epic per the 2026-05-01 user directive.
**Template**: This doc lifts the structure from `docs/architecture/MIDI_SERVICES.md` (the reference implementation) and customizes for Sampler. See `FIRST_CLASS_SERVICES.md` for the unification pattern + the 9-step process for opening a first-class-services epic.

---

## 1. The four-services framing position

Sampler is one of the four first-class platform service offerings (MIDI / AVB / **Sampler** / Audio Effects). It owns sample assets and sample-based instruments — SoundFonts, SFZ instruments, raw samples, drum kits, NAM models, Synthforge parts, the asset library scanner, and asset → instrument loading.

**Today's state** (2026-05-01):
- **Backend (scattered)**:
  - `app/services/performance_brain_service.py` — Brain library scanner (`_load_library_*` methods scan `/home/mm/.map2/brain-library/` for SoundFont/SFZ/sample/kit assets).
  - `app/services/performance_brain/models.py` — `BrainLibraryAssetModel`, `BrainLibraryCollectionModel`, `BrainLibraryStateModel`. Asset shape: `asset_id`, `name`, `asset_type` ∈ {soundfont,sfz,sample,kit,patch}, `path`, `tags`, `authored_with_devices`.
  - `app/routes/synthforge.py` — Synthforge integration (16 parts, patch loading).
  - `juce-engine/Source/Brain/PerformanceBrainProcessor.cpp` — Brain audio processor; today only generates sine test tones (`audioCallback` lines 142, 151) — **does not actually load samples**. Brain slot population is ad-hoc; no canonical loader.
  - NAM model loader: `map2:fx:nam` URI in `state_authority_uri_catalog.py`; ships empty (operator loads `.nam` files later).
- **Frontend**:
  - Brain library section at `/brain?section=library` — surfaces asset collections.
  - Brain Setup task (T2480) — Phase 4 scans the library, auto-picks first asset, populates Brain slot.
  - No standalone Sampler surface today.

**Cross-service consumer relationships**:
- **MIDI consumes Sampler**: a MIDI binding can target a Sampler instrument (key press → sampler trigger). Brain slot bindings are the most common path.
- **Audio Effects can consume Sampler**: a sampler output can feed a chain (effects in-line with the sampler).

---

## 2. Unification scope (when the epic opens)

**Canonical authority**:
- `SampleAsset` table — every loadable sound source has a canonical row. Columns: `asset_id` (UUID PK), `name`, `asset_type`, `path` (absolute), `format` (e.g., "sf2", "sfz", "wav"), `size_bytes`, `duration_ms`, `sample_rate`, `bit_depth`, `channels`, `tags` (JSON array), `provenance` fields per the four-services template.
- `SamplerInstrument` table — operator-instantiated instruments backed by an asset. Columns: `instrument_id` (UUID PK), `asset_id` (FK), `name`, `params` (JSON — per-instrument config), `created_by`, `source`, `metadata`.

**Canonical surface**: `/sampler` mount (final naming TBD). Single entry point for library browsing, asset inspector (waveform preview, format details, embedded sample-pack metadata), version management, format conversions, instrument instantiation. Old `/brain?section=library` becomes a Brain-side projection over Sampler Services.

**Migration**:
- Lift the Brain library scanner's in-memory asset list into `SampleAsset` rows.
- Lift Synthforge part configs into `SamplerInstrument` rows.
- Lift any `BrainSlotModel.asset_path` references into `SamplerInstrument` rows + replace the slot's `asset_path` with an `instrument_id` foreign key.

**Inventory (preliminary)**:
- Brain library scanner → absorbed; library state lives in canonical authority
- Brain library section UI → reframed as a Sampler region cross-linked from Brain
- Synthforge integration → reframed as a Sampler instrument backend (Synthforge becomes one of several supported instrument engines)
- NAM model loader → reframed as a Sampler instrument backend (NAM is just one instrument type)
- Brain Setup task's library-scan + asset-pick step → consumes Sampler Services API instead of Brain library directly

---

## 3. Architectural diagrams (5 required views)

### 3.1 Process topology

```mermaid
flowchart LR
    subgraph host["Host process — app/ (FastAPI on :8080)"]
        sampler_routes["/api/sampler/* routes\n(planned)"]
        sampler_authority["SampleAssetAuthority +\nSamplerInstrumentAuthority\n(planned — single writers)"]
        sampler_projections["Per-consumer projections\n(brain_slot, synthforge,\nnam_model, snapshot)"]
        library_scanner["Brain library scanner\n(performance_brain_service.py)\n— current home"]
        synthforge_routes["/api/synthforge/* (legacy)\n— rewires through projection"]
    end

    subgraph filesystem["Filesystem (~/.map2/brain-library/)"]
        soundfonts[("SoundFont files\n(.sf2)")]
        sfz_files[("SFZ files\n(.sfz + .wav samples)")]
        nam_files[("NAM models\n(.nam)")]
        kits[("Drum kit packs")]
    end

    subgraph juce_engine["juce-engine (C++ audio)"]
        nam_loader["NAM model loader\n(map2:fx:nam URI)"]
        synthforge_engine["Synthforge engine\n(16 parts)"]
        future_sampler["SoundFont/SFZ sampler engines\n(planned — currently absent;\nBrain processor only generates\nsine test tones)"]
        audio_callback["audio callback\n(samples → output)"]
    end

    sampler_routes -->|reads/writes| sampler_authority
    sampler_projections --> sampler_authority
    library_scanner --> filesystem
    library_scanner -.->|future projection| sampler_projections
    synthforge_routes -.->|future rewire| sampler_projections

    soundfonts -.->|future load path| future_sampler
    sfz_files -.->|future load path| future_sampler
    nam_files --> nam_loader
    kits -.->|future load path| future_sampler
    nam_loader --> audio_callback
    synthforge_engine --> audio_callback
    future_sampler --> audio_callback

    style sampler_authority fill:#0f62fe,color:#fff
    style sampler_routes fill:#0f62fe,color:#fff
    style sampler_projections fill:#a6c8ff
    style future_sampler fill:#fff8e1
```

### 3.2 Storage layout

```mermaid
flowchart TB
    subgraph canonical["CANONICAL (post-Sampler-Services-P2.1)"]
        sample_assets[("sample_assets table\n(planned — every loadable source)")]
        sampler_instruments[("sampler_instruments table\n(planned — operator-instantiated)")]
    end

    subgraph legacy["LEGACY (in-memory + scattered)"]
        brain_library_state["Brain library scanner\nin-memory asset list"]
        brain_slot_paths["BrainSlotModel.asset_path\n(direct path strings, no FK)"]
        synthforge_parts["Synthforge part configs\n(in-memory, file-backed)"]
    end

    subgraph filesystem["~/.map2/brain-library/ (filesystem, unchanged)"]
        files[("SoundFont / SFZ / sample\n/ kit / NAM files")]
    end

    files -->|scanned by| brain_library_state
    files -.->|scanned by\n(planned)| sample_assets

    brain_library_state -.->|future migration| sample_assets
    brain_slot_paths -.->|future migration| sampler_instruments
    synthforge_parts -.->|future migration| sampler_instruments

    style canonical fill:#defbe6
    style sample_assets fill:#fff8e1
    style sampler_instruments fill:#fff8e1
    style legacy fill:#fff8e1
```

### 3.3 Consumer surface

```mermaid
flowchart TB
    sample_authority["SampleAssetAuthority\n+ SamplerInstrumentAuthority\n(SINGLE WRITERS, planned)"]

    subgraph apis["Public API surfaces"]
        sampler_routes["/api/sampler/* routes (planned)"]
        brain_routes["/api/engine/brain/library\n(legacy, rewires through projection)"]
        synthforge_routes["/api/synthforge/* (legacy,\nrewires through projection)"]
    end

    subgraph projections["Per-consumer projections (planned)"]
        brain_slot_proj["brain_slot.py"]
        snapshot_proj["snapshot.py"]
        midi_binding_proj["midi_binding.py\n(MIDI bindings target instruments)"]
    end

    subgraph editor_surfaces["Editor UI surfaces"]
        sampler_console["/sampler canonical surface (planned)"]
        brain_library_section["Brain library section\n(stays in /brain?section=library;\nrewires backend through Sampler)"]
        brain_setup_task["Brain Setup task (T2480)\n— consumes Sampler API"]
        synthforge_panels["Synthforge panels (kept)"]
    end

    sampler_routes --> sample_authority
    brain_slot_proj --> sample_authority
    snapshot_proj --> sample_authority
    midi_binding_proj --> sample_authority

    brain_routes --> brain_slot_proj
    synthforge_routes --> sampler_routes
    brain_library_section --> brain_routes
    brain_setup_task --> sampler_routes
    synthforge_panels --> synthforge_routes
    sampler_console --> sampler_routes

    style sample_authority fill:#0f62fe,color:#fff
    style sampler_console fill:#fff8e1
    style sampler_routes fill:#fff8e1
```

### 3.4 Migration narrative

```mermaid
flowchart LR
    subgraph today["TODAY (2026-05-01)"]
        library_scanner_done["Brain library scanner\nactive (in-memory)"]
        synthforge_done["Synthforge integration\nactive (16 parts)"]
        nam_done["NAM model loader\nactive (map2:fx:nam URI)"]
        brain_setup_done["Brain Setup task (T2480)\nuses library scanner"]
        gap["GAP: SoundFont/SFZ sampler\nengine MISSING in juce-engine\n(Brain processor generates\nsine test tones only)"]
    end

    subgraph future_p1["Sampler Services Phase 1"]
        backend_audit["Backend audit:\nlibrary state + Synthforge +\nNAM + sampler engine gap"]
        engine_decision["Decision: build native sampler\nOR adopt existing (juce_audio_basics\nSFZSampler? Aubio? polyphone?)"]
        canonical_design["SampleAsset + SamplerInstrument\nschema design"]
    end

    subgraph future_p2["Sampler Services Phase 2"]
        authority["SampleAssetAuthority +\nSamplerInstrumentAuthority"]
        migration["Migration scripts\n(library state → canonical;\nBrainSlotModel.asset_path → instrument_id)"]
        verification["Verification suite"]
    end

    subgraph future_p3["Sampler Services Phase 3 (frontend)"]
        canonical_surface["/sampler canonical mount"]
        brain_library_reframe["Brain library section\nreframed as Sampler consumer"]
    end

    subgraph future_p4["Sampler Services Phase 4"]
        template_lift["Template lifted from\nFIRST_CLASS_SERVICES.md"]
    end

    library_scanner_done --> backend_audit
    synthforge_done --> backend_audit
    nam_done --> backend_audit
    gap --> engine_decision
    backend_audit --> canonical_design
    engine_decision --> canonical_design
    canonical_design --> authority
    authority --> migration
    migration --> verification
    verification --> canonical_surface
    canonical_surface --> brain_library_reframe
    brain_library_reframe --> template_lift

    style today fill:#defbe6
    style gap fill:#ffd6d6
    style future_p1 fill:#fff8e1
    style future_p2 fill:#fff8e1
    style future_p3 fill:#e8e8e8
    style future_p4 fill:#e8e8e8
```

(Red box = critical gap. Sampler Services Phase 1 has to decide whether to build a native SoundFont/SFZ sampler engine in C++ OR adopt a third-party library; today the platform's "Brain plays samples" claim is essentially unimplemented at the audio engine layer — the Brain processor only generates sine tones.)

### 3.5 Four-services framing position

```mermaid
flowchart TB
    subgraph platform["MAP2 Audio Platform"]
        midi["MIDI Services\n(T2482 Phase 2 SHIPPED)"]
        avb["AVB Services\n(epic queued)"]
        sampler["Sampler Services\n(this doc — epic queued)\n• Brain library scanner\n• Synthforge integration\n• NAM model loader\n• needs canonical authority\n  + canonical surface\n• needs sampler engine\n  in audio callback"]
        effects["Audio Effects Services\n(epic queued)"]
    end

    template["FIRST_CLASS_SERVICES.md\n(template established)"]

    midi -.->|template lifts to| sampler
    template -.->|reused by| sampler

    sampler -->|consumed by| midi
    sampler -.->|optional| effects

    style midi fill:#defbe6
    style avb fill:#e8e8e8
    style sampler fill:#fff8e1
    style effects fill:#e8e8e8
    style template fill:#0f62fe,color:#fff
```

---

## 4. References

- `docs/architecture/FIRST_CLASS_SERVICES.md` — the template this doc lifts from
- `docs/architecture/MIDI_SERVICES.md` — reference implementation
- `app/services/performance_brain_service.py` — current Brain library scanner
- `app/services/performance_brain/models.py` — `BrainLibraryAssetModel` shape
- `app/routes/synthforge.py` — current Synthforge integration
- `juce-engine/Source/Brain/PerformanceBrainProcessor.cpp` — Brain audio processor (the sampler engine gap)
- `~/.claude/projects/-home-mm-map2-audio/memory/MEMORY.md` — Brain notes

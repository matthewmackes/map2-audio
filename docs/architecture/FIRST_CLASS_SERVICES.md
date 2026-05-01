# First-class platform service offerings

**Status**: Template established 2026-05-01 by T2482 (MIDI Services). Reusable across the four-services platform model.

**Predecessor**: `~/.claude/projects/-home-mm-map2-audio/memory/project_first_class_services.md` (the standing platform directive).
**Reference implementation**: `docs/architecture/MIDI_SERVICES.md` + `docs/architecture/MIDI_BACKEND.md` + the T2482 epic in `docs/PROJECT_WORKLIST.md`. Read those first; this doc is the abstraction over them.

---

## 1. The four-services platform model

MAP2 is **four first-class platform service offerings** on equal architectural footing:

| Service | Status (2026-05-01) | Canonical surface | Canonical authority |
|---|---|---|---|
| **MIDI Services** | Phase 2 SHIPPED, Phase 3 user-gated | `/midi` (Phase 3 pending) | `MidiBinding` table |
| **AVB Services** | Epic stub queued | TBD (likely `/avb`) | TBD (stream + entity authority) |
| **Sampler Services** | Epic stub queued | TBD (likely `/sampler`) | TBD (asset + instrument authority) |
| **Audio Effects Services** | Epic stub queued | TBD (likely `/effects`) | State Authority graph (already partial) |

Each gets the **same template**. Whatever pattern lands first becomes the template; MIDI Services is that first epic and this doc captures what it produced.

---

## 2. The template — what makes a service "first class"

A service offering qualifies as "first class" on this platform when it has **all six** of the following, end-to-end:

### 2.1 Single canonical authority

One backend service that owns the concept. No parallel stores. No per-device or per-consumer scattering.

For MIDI Services this is `app/services/midi/authority.py` (`MidiBindingAuthority`) writing to the `midi_bindings` SQLite table (migration v12). It is the **only** writer to that table. Every consumer migration in T2482-P2.3+ writes through this service via per-consumer projections.

For AVB / Sampler / Audio Effects: equivalent service+table per offering. The pattern is "one writer, one table, one set of indexes."

### 2.2 Single canonical surface

One operator-facing entry point at a top-level route. Specialized editing tools may exist (snapshot editor's per-effect bindings, device-pack DSP editors, etc.) but they all read/write through the canonical authority.

For MIDI Services this is `/midi` mounted in Phase 3 (per Q2 lock-in: renamed from "MIDI Hub" to "MIDI Services"). Old `/midi-hub/*` routes redirect cleanly.

For AVB / Sampler / Audio Effects: equivalent top-level route per offering. Avoid bikeshed-naming — pick one, mount one, redirect rest.

### 2.3 Full legacy migration

When unifying an offering, every legacy store gets migrated into the canonical table and the legacy implementation is **deleted**. No dual-write transition periods that linger. No "we'll get to it later" parallel paths.

For MIDI Services: production migration ran 2026-05-01 against the live DB. The legacy `snapshot_midi_maps` and `midi_mappings` tables still exist on disk (P2.8 deletion deferred one SHIP loop as a safety net) but are no longer authoritative. Migration scripts are idempotent + tested + ran clean against live data.

For AVB / Sampler / Audio Effects: each epic includes its migration scripts as part of Phase 2-equivalent work. No epic ships "phase 1" without a concrete plan for legacy retirement.

### 2.4 Provenance + traceability

Every binding/entity/asset/chain row carries provenance metadata: who created it, when, via which surface. Migrated rows additionally carry `source="legacy-migration"` + `metadata.legacy_table=<name>` + `metadata.legacy_row_id=<id>` for audit traceability.

For MIDI Services this is enforced at the schema layer (the `created_by` / `modified_by` / `source` / `metadata` columns are NOT NULL with sensible defaults; the authority bumps them on every write).

### 2.5 Documented + diagram-complete

Every first-class service has:
- **Architecture doc** in `docs/architecture/<SERVICE>_SERVICES.md` (design intent, schema, IA, migration strategy, risk register, effort estimate)
- **Backend implementation-state doc** in `docs/architecture/<SERVICE>_BACKEND.md` (current implementation state, where things live, what's planned vs shipped)
- **Architectural diagrams** (5 required views — see §3 below)
- **Worklist epic** in `docs/PROJECT_WORKLIST.md` with the canonical subtask plan + status
- **Memory file** in `~/.claude/projects/-home-mm-map2-audio/memory/` for cross-session persistence

For MIDI Services: all five exist and are current.

### 2.6 Reusable architectural pattern

The unification pattern (authority + surface + migration + provenance + docs + diagrams) is identical across all four. Whatever pattern lands first becomes the template; future epics lift from it.

This doc IS that template. AVB / Sampler / Audio Effects epics open with "scope:" boilerplate that points back here for the pattern, then customize only the parts that genuinely differ (e.g., AVB's authority handles AVB streams + AVDECC entities, not bindings).

---

## 3. The 5 required architectural diagrams

Per the 2026-05-01 user directive, every first-class service stack ships diagrams covering five views. Format: **Mermaid embedded in the service's architecture doc** (renders inline on GitHub/GitLab; plain text in version control).

### 3.1 Process topology

Show every process that owns part of the service's responsibility, and the IPC seams between them. Mark planned-but-not-shipped boxes distinctly from currently-active boxes (use color or labels — Mermaid's `style ... fill:#xxx` works).

For MIDI Services see `MIDI_SERVICES.md` §8.1 — three processes (host FastAPI / map2-controller-host / juce-engine), UDS control plane, SPSC shm event ring.

### 3.2 Storage layout

Show the canonical authority table + every legacy store that's being absorbed. Mark each as canonical / legacy-still-on-disk / backed-up. Include the migration arrows (which legacy table feeds which canonical row).

For MIDI Services see `MIDI_SERVICES.md` §8.2 — `midi_bindings` canonical, `snapshot_midi_maps` + `midi_mappings` + `MidiDeviceState.bindings` + `app/services/midi_hub/` legacy, backup file location.

### 3.3 Consumer surface

Show every API surface and editor UI that reads/writes through the authority. Make the "no bypass paths" discipline visible in the graph: every editor flows through a per-consumer projection, which flows through the authority.

For MIDI Services see `MIDI_SERVICES.md` §8.3 — `/api/midi/*` routes, snapshot editor inline editors, Brain Setup task, `/midi` Phase 3 console.

### 3.4 Migration narrative

Left-to-right timeline showing what's shipped vs what's open. Group by epic phase. Highlight production-migration boxes (the moment the live data flipped to canonical) distinctly.

For MIDI Services see `MIDI_SERVICES.md` §8.4 — T2459-H subsumed slices, T2482 Phase 2 SHIPPED (with green highlights on the boxes that ran in production), Phase 3 + Phase 4 user-gated.

### 3.5 Four-services framing position

Show all four service stacks and the cross-service consumer relationships. Mark each service's status (shipped / queued / in-flight). Make the "no service writes into another's storage" discipline visible.

For MIDI Services see `MIDI_SERVICES.md` §8.5 — MAP2 platform with MIDI/AVB/Sampler/Effects, template extraction at FIRST_CLASS_SERVICES.md, consumer relationships (Sampler → MIDI, AVB → Audio Effects, MIDI → Audio Effects).

---

## 4. Anti-patterns explicitly forbidden

These come from the `project_first_class_services.md` memory + the lessons learned during T2482:

- **"We have a MIDI Hub *and* a MIDI Console *and* a MIDI Authority"** — pick one name, delete the rest. (Q2 lock-in: "MIDI Services" mounted at `/midi`; old "MIDI Hub" deprecated.)
- **"The legacy store stays for back-compat"** — back-compat lives at the API layer, not the storage layer. The legacy storage tables get deleted (P2.8) once the authority is verified live; back-compat APIs route through the canonical authority.
- **"Each device has its own MIDI mapping table"** — wrong. Devices have *projections* of the canonical authority. (See `app/services/midi/projections/device_pack.py` for the pattern.)
- **"The snapshot editor stores its own MIDI bindings separately"** — wrong. The snapshot editor is a *consumer surface* on top of the canonical authority. Per the Q2 refinement, inline editors stay in place visually but rewire the backend through the projection.
- **"We'll consolidate AVB after we ship a few more AVDECC features"** — no. The unification IS the feature. Don't accumulate technical debt that the next epic has to pay down.
- **Dual-write transition periods that linger** — write the migration as forward-only with backup-restore as the rollback. Don't ship "for the next 3 months we'll write to both stores until everyone migrates" — that's a permanent state in disguise.

---

## 5. The next three epics

### 5.1 AVB Services (queued)

**Architecture stub**: `docs/architecture/AVB_SERVICES.md` (to be written when the epic opens).

**Today's state** (2026-05-01):
- Backend: `la_avdecc` v4.3.1.1 integrated via `juce-engine/Source/AvdeccController.h/cpp`. Single canonical AVDECC controller per JUCE engine instance.
- Frontend: `web/src/app/components/AvbRouting/` workspace exists with routing matrix + topology + entity inspector.
- Tesira AVB panels live under `web/src/app/components/Devices/Tesira/` (overlap with MIDI Services Tesira TTP — but AVB is the audio plane; TTP is the control plane; they share the device but not the concern).

**Unification scope** (when the epic opens):
- Canonical authority: an `AvbStream` or `AvbEntity` table (final shape TBD) — every AVDECC stream binding (talker → listener) lives here.
- Canonical surface: `/avb` (or similar) — single entry point for stream management, entity discovery, format negotiation.
- Migration: lift any in-memory `AvbRouting` workspace state + Tesira AVB panel state into canonical rows.
- Diagrams: 5 views per §3 above.

**Cross-service consumer relationship**: Audio Effects consumes AVB. An AVB input stream feeds the chain graph; chain output absorbs into an AVB output stream.

### 5.2 Sampler Services (queued)

**Architecture stub**: `docs/architecture/SAMPLER_SERVICES.md` (to be written when the epic opens).

**Today's state** (2026-05-01):
- Spread across `app/services/performance_brain/` (Brain library scanner), built-in NAM model loader, SoundFont/SFZ/sample asset readers, Synthforge integration.
- Frontend: Brain library section in `/brain?section=library`; samples are loaded into Brain slots ad hoc.

**Unification scope** (when the epic opens):
- Canonical authority: `SampleAsset` + `SamplerInstrument` tables — every loadable sound source has a canonical row.
- Canonical surface: `/sampler` (or similar) — library browser, asset inspector, format conversions, version management.
- Migration: lift the Brain library scanner's in-memory asset list + Synthforge's part config into canonical rows.
- Diagrams: 5 views per §3 above.

**Cross-service consumer relationship**: MIDI consumes Sampler. A MIDI binding can reference a Sampler instrument as its target (e.g., key press → sampler trigger). Brain slots reference Sampler assets.

### 5.3 Audio Effects Services (queued)

**Architecture stub**: `docs/architecture/AUDIO_EFFECTS_SERVICES.md` (to be written when the epic opens).

**Today's state** (2026-05-01):
- The State Authority graph (`app/services/state_authority_graph.py`, `SNAPSHOT_GRAPH_VERSION = "2026.04"`) is the closest existing canonical authority. It's already used by the Snapshot Editor.
- However: the chain/plugin runtime state is partly in the JUCE engine (audio callback owns the live plugin graph), partly in the Snapshot Editor (UI state), partly in the snapshot service (persistent state).

**Unification scope** (when the epic opens):
- Canonical authority: extend State Authority graph to be THE canonical for chains/plugins/parameters/automation/insertions/loops. Already partly there.
- Canonical surface: `/effects` (or similar) — single entry point for chain authoring, plugin browsing, parameter automation, A/B comparison.
- Migration: retire any parallel chain/plugin storage layers.
- Diagrams: 5 views per §3 above.

**Cross-service consumer relationship**: Audio Effects consumes MIDI (the most common pattern — MIDI bindings drive plugin parameters via the `plugin_param` consumer in MIDI Services). Audio Effects also consumes AVB (input/output streams) and Sampler (effects can be in-line with sampler outputs).

---

## 6. Process for opening a new first-class-services epic

When you're ready to open the AVB / Sampler / Audio Effects epic:

1. **Verify the offering is one of the four named** in `project_first_class_services.md` memory. If you're adding a fifth (Cluster Services? Telemetry Services?), update the memory + this doc + get user sign-off first — don't sneak in a fifth without explicit framing.
2. **Read `MIDI_SERVICES.md` end-to-end** as the reference implementation. Don't re-derive the architecture; lift it.
3. **Open the worklist epic** with the same boilerplate sections T2482 used: locked decisions table, scope inventory, phase plan, definition of done, lineage notes.
4. **Write the architecture doc** as a customization of the MIDI Services doc. Sections 1-7 stay structurally identical (substitute the offering's specifics); §8 architectural diagrams use the 5 required views from this doc's §3.
5. **Write the backend implementation-state doc** as a snapshot of where things are when the epic opens.
6. **Migrate forward-only**. Take a backup before any production migration. Document the skipped/orphaned data honestly. Don't invent fields to make legacy rows fit the canonical model — skip + document is better than fabricate.
7. **Run the verification suite end-to-end** before declaring Phase 2-equivalent done.
8. **Open the canonical surface** with `/api/<service>/*` routes wired through the authority. Then user-gate the frontend bundles.
9. **Update this doc** with the new service's "today's state" → "unification scope" content as the epic progresses.

---

## 7. References

- **Standing platform directive**: `~/.claude/projects/-home-mm-map2-audio/memory/project_first_class_services.md`
- **Reference implementation**:
  - `docs/architecture/MIDI_SERVICES.md` (design + diagrams)
  - `docs/architecture/MIDI_BACKEND.md` (implementation state)
  - `docs/PROJECT_WORKLIST.md` epic `T2482`
- **Production migration evidence**: `docs/fit-for-purpose-evidence/20260501/T2482_phase2_migration_evidence.md`
- **Predecessor docs (subsumed)**:
  - `docs/architecture/CONTROLLER_LAYER.md` — T2459 controller subsystem locked decisions
- **Memory files**:
  - `project_first_class_services.md` — the four-services framing
  - `project_t2459_controller_layer.md` — historical (subsumed by T2482)
  - `project_t2459h_midi_unification.md` — historical (subsumed by T2482)

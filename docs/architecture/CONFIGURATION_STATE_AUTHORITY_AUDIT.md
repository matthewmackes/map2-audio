# MAP2 Configuration and State Authority Audit

**Epic:** T2431 — Configuration and State Authority plane consolidation
**Subtask:** T2431-A
**Date:** 2026-04-23
**Status:** Complete — feeds T2431-B through T2431-J

This document inventories every configuration and state authority concept in MAP2, identifies the current authority plane, flags multi-authority drift risks, and provides the ranked risk list that informs the migration plan.

---

## Table of Contents

1. [Authority Plane Summary](#1-authority-plane-summary)
2. [File-Backed Configuration](#2-file-backed-configuration)
3. [Environment Variables](#3-environment-variables)
4. [Database Models (Durable State)](#4-database-models-durable-state)
5. [State Authority Control Plane (etcd)](#5-state-authority-control-plane-etcd)
6. [Snapshot Services](#6-snapshot-services)
7. [Deployment Mode and Systemd](#7-deployment-mode-and-systemd)
8. [PipeWire and JUCE Observed State](#8-pipewire-and-juce-observed-state)
9. [Runtime / In-Memory State](#9-runtime--in-memory-state)
10. [Multi-Authority Drift Risks (Ranked)](#10-multi-authority-drift-risks-ranked)
11. [Concepts Without a Declared Plane](#11-concepts-without-a-declared-plane)
12. [Subtask Links](#12-subtask-links)

---

## 1. Authority Plane Summary

| Plane | Path | Canonical Rule |
|---|---|---|
| Host desired config | `/etc/map2/` | Machine-scoped; must exist before service start; affects systemd, boot, host role |
| Durable service state | `/var/lib/map2/` | Service-managed; cluster registries, event logs, backups, replicated inventory |
| User/operator state | `~/.map2/` | Per-user preferences, local content, compatibility shims; not cluster authority |
| SQLite (primary DB) | `data/map2.db` | Durable structured state: plugins, chains, presets, snapshots, revisions, effects loops |
| etcd control plane | `http://127.0.0.1:2379` | Audio state authority (committed, desired, observed) for clustered/multi-node operation |
| PipeWire/JACK graph | runtime metadata | Observed hardware state; never authoritative for desired config |
| JUCE C++ engine | in-process ValueTree | Live DSP parameter state; driven by State Authority, not a separate authority |

Reference: `docs/architecture/CONFIGURATION_AUTHORITY_MODEL.md`

---

## 2. File-Backed Configuration

### 2.1 `~/.map2/config.json` — Main User Config

**Authority plane:** User/operator (`~/.map2`)
**Managed by:** `app/config.py` → `ConfigManager` (singleton)
**Schema defined in:** `app/config_schema.py` → `CONFIG_SCHEMA`
**Backup:** `~/.map2/config.backup.json` (auto on every save)

**Sections and drift risks:**

| Section prefix | Keys | Plane correctness | Drift risk |
|---|---|---|---|
| `app.*` | name, version, debug, log_level, node.display_label | User pref — correct plane | Low |
| `audio.*` | sample_rate, buffer_size, backend (Tier A locked), channels, device, latency_compensation, clock_master | **WRONG PLANE** — Tier A locked values should be host config, not user config | **HIGH** |
| `audio_state.*` | authority_backend, etcd_endpoints, etcd_namespace, timeouts, TLS | **WRONG PLANE** — cluster control-plane config must be host config, not per-user | **HIGH** |
| `snapshots.*` | global_noise_gate, default devices | Borderline — these are per-node defaults | Medium |
| `midi.*` | enabled, learn_timeout, cc14_enabled, default_curve, cluster config | MIDI cluster config should be host config | Medium |
| `cluster.*` | proxy_enabled, proxy_timeout, max_connections | Should be host config for cluster role | Medium |
| `push_surface.*` | enabled, ports, profile | User/operator — acceptable | Low |
| `lcd.*` | enabled, addresses, simulation, per-display settings | User/operator — acceptable | Low |
| `backend.*` | host, port, workers, cors_origins | **WRONG PLANE** — service bind config is host config | High |
| `database.*` | path, WAL mode, checkpoint interval | **WRONG PLANE** — service-level, not per-user | High |
| `storage.*` | NAM/IR user dirs, extra paths | User pref — correct plane | Low |
| `avb.*`, `spdif.*`, `clock_sync.*` | AVB/TSN network, S/PDIF mode, clock profile | **WRONG PLANE** — hardware transport config is host config | High |
| `tesira.*` | device list, credentials, metering | Operator — borderline; credentials must not be in user home | Medium |
| `automation.*`, `plugins.*`, `preset_converter.*`, `websocket.*`, `monitoring.*`, `backup.*` | Various | User/operator — mostly acceptable | Low |

**Verdict:** `~/.map2/config.json` is too broad. It mixes user preferences (correct) with host-critical service config (wrong plane). The layered loader in T2431-D must prevent user-plane files from overriding host-critical keys.

### 2.2 `/etc/map2/environment` — Systemd EnvironmentFile

**Authority plane:** Host desired config (`/etc/map2`)
**Read by:** `systemd/map2-backend.service` via `EnvironmentFile=-/etc/map2/environment`
**Current status:** Referenced in service unit but may not exist on all installs (the `-` prefix makes it optional)
**Content:** Should contain `MAP2_*` env var overrides for host-critical settings

**Drift risk:** Medium — optional file means host-critical overrides may not be applied; no generation or checksum enforcement.

### 2.3 `/etc/map2/mode.json` — Deployment Mode

**Authority plane:** Host desired config (intended — Q1 still pending lock)
**Current status:** Referenced in architecture docs and T2431 design decisions (Q1 pending), but no implementation yet
**Competing sources:** `~/.map2/deployment.json` (user-plane fallback), systemd mode drop-ins in `systemd/modes/`, `/etc/guitarfx-mode.conf` (legacy name)
**Drift risk:** **CRITICAL** — deployment mode is the highest-risk multi-authority concept. systemd, env, UI, and service policy can disagree.

### 2.4 `~/.map2/device-hero-overrides/<id>.png` — Device Hero Images

**Authority plane:** User/operator (`~/.map2`)
**Managed by:** `app/services/device_hero_image_service.py`
**Routes:** `POST/GET/DELETE /api/devices/hero-images/{device_id}`
**Plane correctness:** Correct — shared globally per install but user/operator preference
**Drift risk:** Low

### 2.5 `~/.map2/lcd_presets/` — LCD User Presets

**Authority plane:** User/operator (`~/.map2`)
**Managed by:** `app/routes/lcd.py` (T2430-H)
**Drift risk:** Low — per-node, not replicated

### 2.6 `~/.map2/snapshot_lcd_hooks/<id>.json` — LCD Snapshot Hooks

**Authority plane:** User/operator (`~/.map2`)
**Managed by:** `app/services/lcd_hook_evaluator.py` (T2430-I)
**Drift risk:** Low — local override of snapshot surface behavior

### 2.7 `~/.local/share/map2/` — User Asset Directories

**Authority plane:** User/operator
**Managed by:** `app/paths.py` → `StoragePaths`
**Content:** NAM models, cabinet IRs, reverb IRs, user IRs, SoundFont files
**Override env vars:** `MAP2_NAM_DIR`, `MAP2_IR_DIR`
**Override config keys:** `storage.nam_user_dir`, `storage.ir_user_dir`
**Drift risk:** Low — content directories, not config

### 2.8 `/var/lib/map2/` — System Asset Directories

**Authority plane:** Durable service state (`/var/lib/map2`)
**Managed by:** `app/paths.py` → `StoragePaths.ensure_system_directories()`
**Content:** System NAM models, IR library downloads, system SoundFonts
**Drift risk:** Low — data directories

---

## 3. Environment Variables

All `MAP2_*` env vars are declared in `app/config_schema.py` with `env_var` metadata. They override the corresponding config file key at load time.

**Tier A locked (cannot be changed at runtime):**
- `MAP2_SAMPLE_RATE` → `audio.sample_rate`
- `MAP2_BUFFER_SIZE` → `audio.buffer_size`
- `MAP2_AUDIO_BACKEND` → `audio.backend`

**Host-critical (should live in `/etc/map2/environment`, not only config.json):**
- `MAP2_HOST`, `MAP2_PORT`, `MAP2_DATABASE_PATH`
- `MAP2_AUDIO_STATE_AUTHORITY_BACKEND`, `MAP2_AUDIO_STATE_ETCD_ENDPOINTS`, `MAP2_AUDIO_STATE_ETCD_NAMESPACE`
- `MAP2_MIDI_CLUSTER_*` (12 cluster MIDI keys)
- `MAP2_CLUSTER_PROXY_*`
- `MAP2_AVB_*`, `MAP2_AVDECC_*`

**User/operator (acceptable in config.json or session env):**
- `MAP2_DEBUG`, `MAP2_LOG_LEVEL`
- `MAP2_ENABLE_LCD`, `MAP2_LCD_SIMULATION`
- `MAP2_PUSH_SURFACE_ENABLED`
- `MAP2_NAM_DIR`, `MAP2_IR_DIR`
- `MAP2_PRESET_CONVERTER_VST2_LEGACY_ENABLED`
- `MAP2_TESIRA_ENABLED`, `MAP2_TESIRA_DEVICES` (credentials must NOT be in env on shared hosts)

**Full list (50 vars):** see `app/config_schema.py` — every schema entry with `env_var` set.

**Also set in systemd base unit directly (not via EnvironmentFile):**
- `MAP2_ENABLE_LCD=false`
- `MAP2_LCD_SIMULATION=false`
- `PIPEWIRE_LATENCY=64/48000`
- `PIPEWIRE_FALLBACK_PLAYBACK_DEVICE`
- `PIPEWIRE_FALLBACK_CAPTURE_DEVICE`

**Drift risk:** Medium — same concept expressed in both systemd unit env block and config schema env_var; the systemd unit value wins (it runs before `_load()` merges file). Changes to the unit require `systemctl daemon-reload`.

---

## 4. Database Models (Durable State)

**Database file:** `data/map2.db` (default) — override via `MAP2_DATABASE_PATH` or `database.path`
**ORM:** SQLAlchemy 2.x async + SQLite with WAL mode
**Schema migration table:** `schema_migrations` (8 applied migrations as of audit date)

### 4.1 Plugin Catalog

| Model | Table | Authority plane | Content |
|---|---|---|---|
| Plugin | plugins | Durable service state | LV2 plugin metadata: URI, name, category, parameters JSON, user metadata (tags, favorite, hidden) |

**Drift risk:** Low — populated by LV2 plugin scanner; stale if plugins installed outside service restart.

### 4.2 Signal Chain State

| Model | Table | Authority plane | Content |
|---|---|---|---|
| Chain | chains | Durable service state | Signal chain: name, is_active, config JSON |
| ChainPlugin | chain_plugins | Durable service state | Plugin-in-chain junction: URI, position, bypass, NAM/IR loader state |
| EffectsLoop | effects_loops | Durable service state | Loop definition: channels, topology, Tesira binding, send/return endpoints, calibration status |
| EffectsLoopInsertion | effects_loop_insertions | Durable service state | Loop-in-chain binding: slot, blend, crossfade, band-split |
| EffectsLoopCalibration | effects_loop_calibrations | Durable service state | Latency calibration history per loop |

**Drift risk:** Medium — `Chain.is_active` and `EffectsLoop.state_actual` duplicate runtime state that should come from State Authority observations, not SQLite direct writes.

### 4.3 Preset State

| Model | Table | Authority plane | Content |
|---|---|---|---|
| Preset | presets | User/operator | Named snapshot of a chain's plugin state |
| PluginPreset | plugin_presets | User/operator | Per-plugin parameter preset |
| CommunityPreset | community_presets | Durable service state | Community-shared preset with moderation flags |
| PresetRating | preset_ratings | Durable service state | Anonymous rating per community preset |
| PresetImportHistory | preset_import_history | Durable service state | Import provenance tracking |

**Drift risk:** Low — these are content stores with clear ownership.

### 4.4 Snapshot State

| Model | Table | Authority plane | Content |
|---|---|---|---|
| Snapshot | snapshots | Durable service state | Unified snapshot root: name, tags, program_number, document JSONB (graph-native since T2425), controls_payload, live_state_payload, community fields |
| SnapshotRevision | snapshot_revisions | Durable service state | Full revision history: payload + document JSON per revision |
| state_authority_assets | state_authority_assets | Durable service state | Content-addressed asset hash registry (sha256 → path) |

**Drift risk:** **HIGH** — `Snapshot.document` (SQLite JSONB) and etcd committed state are two representations of the same live audio rig intent. The reconciliation scheduler must keep them in sync. Any failure leaves them diverged with no automatic resolution beyond the 5s self-heal window.

### 4.5 SystemConfig (Key/Value Escape Hatch)

**Model:** `SystemConfig` (table: `system_config`)
**Authority plane:** NONE DECLARED — generic key/value table that predates the authority model
**Content known to be stored:** chain presets, touchscreen assignments, command-queue metadata, promoted_advanced_routes (Special Settings)
**Used by:** `app/routes/special_settings.py`, possibly other services
**Drift risk:** **CRITICAL** — violates the one-concept-one-authority rule. Adding keys here bypasses schema enforcement. T2431-G is the hard-cut retirement path.

---

## 5. State Authority Control Plane (etcd)

**Namespace:** `/map2/audio-state/v1` (default; overridable via `MAP2_AUDIO_STATE_ETCD_NAMESPACE`)
**Backend:** `app/services/audio_state_authority.py` → `AudioStateEtcdConfig` + `EtcdV3JsonClient`
**Config keys:** `audio_state.*` section in `app/config_schema.py`

### 5.1 Key Spaces

| Key pattern | Content | Authority |
|---|---|---|
| `/map2/audio-state/v1/committed` | `AuthoritativeAudioState` — committed audio state with version, epoch, snapshot ref, desired intent, engine status | etcd (sole authority) |
| `/map2/audio-state/v1/observed/<node_id>` | `AudioStateObservation` — per-node observation with TTL lease | etcd (sole authority) |

### 5.2 Routes (read/write paths)

| Route | Direction | Notes |
|---|---|---|
| `GET /api/audio/state/committed` | Read | Fetch committed state |
| `PUT /api/audio/state/desired` | Write | Submit desired state for reconciliation |
| `PUT /api/audio/state/observed/{node_id}` | Write | Node submits its observation |
| `POST /api/audio/state/reconcile` | Write | Trigger reconciliation |
| `POST /api/audio/state/snapshots/{snapshot_id}/activate` | Write | Activate snapshot into audio state |
| `POST /api/audio/state/brain/sync` | Write | Sync performance brain |

### 5.3 Single-Node Requirement Gap

**T2431-Q3:** Single-node MAP2 must run without etcd. Currently `audio_state.authority_backend` defaults to `"etcd"`, which means a bare install fails to initialize State Authority. **No single-node fallback backend exists yet.** T2431-I must add one.

**Drift risk:** **HIGH** — single-node installs cannot use State Authority; they fall back to SQLite direct reads, creating a divergent execution path.

---

## 6. Snapshot Services

**Directory:** `app/services/snapshot/`

Seven sub-services introduced in T2425:

| Service | Responsibility | Stores used |
|---|---|---|
| SnapshotCrudService | create/read/update/delete/list/duplicate | SQLite `snapshots` table |
| SnapshotActivationService | activate, live-snapshot, preflight, preload | SQLite + etcd committed state |
| SnapshotTopologyService | graph document mutations | SQLite `snapshot.document` JSONB |
| SnapshotPortabilityService | import/export/bundle/asset registry | SQLite + `~/.map2/assets/` content-addressed store |
| SnapshotRevisionService | history, diff, rollback, auto-summary | SQLite `snapshot_revisions` table |
| SnapshotControlMapService | unified control mapping CRUD | SQLite `snapshot.controls_payload` |
| SnapshotCommunityService | share/browse/rate/download/template | SQLite `community_presets` + external community API |

**Legacy flow_snapshots:** search for `flow_snapshot` in routes/services to identify what still exists. T2431-H is the removal task. The preferred authority is `Snapshot.document` (graph-native JSONB since T2425-P1).

---

## 7. Deployment Mode and Systemd

### 7.1 Current Multi-Source Problem

Deployment mode is the single highest-risk multi-authority concept. It currently spans:

| Source | Path | Written by | Read by |
|---|---|---|---|
| Legacy config | `/etc/guitarfx-mode.conf` | `map2-mode.sh` (legacy) | Unknown — may still be sourced |
| Proposed authority | `/etc/map2/mode.json` | Proposed — not implemented | Proposed service |
| User fallback | `~/.map2/deployment.json` | Unknown | Unknown |
| Systemd env | `/etc/map2/environment` | `map2-mode.sh` generates | systemd EnvironmentFile |
| Systemd drop-ins | `/etc/systemd/system/map2-backend.service.d/10-mode.conf` | `map2-mode.sh` installs | systemd |
| Frontend | via API | UI store | UI store |

**T2431-E** resolves this after Q1 is locked. The proposed design: `/etc/map2/mode.json` is the sole authority; `map2-mode.sh` becomes a reconciler that generates projections (`/etc/map2/environment`, systemd drop-in) with authority headers (T2431-F).

### 7.2 Systemd Drop-In Architecture

**Base unit:** `/etc/systemd/system/map2-backend.service` (synced from `systemd/map2-backend.service`)
**Drop-in:** `10-mode.conf` — installed by `map2-mode.sh`; sets mode-specific overrides
**Drop-in:** `override.conf` — user-edited; re-asserts `PIPEWIRE_LATENCY`, `force-quantum`, `CPUAffinity`

Rules:
- `ExecStartPre` is **additive** across drop-ins
- `CPUAffinity` is **last-write-wins** (`override.conf` wins over `10-mode.conf`)

**Drift risk:** Medium — drop-ins are generated artifacts but managed by `map2-mode.sh` without checksum enforcement. T2431-F projection headers will fix this.

### 7.3 Mode Files in `systemd/modes/`

| File | Mode | Key overrides |
|---|---|---|
| `all-in-one.conf` | Single-node | All services on one host |
| `audio.conf` | Audio processing node | Audio + JUCE only |
| `management.conf` | Management node | No audio, cluster management only |

Applied by `install_on_new_host.sh --mode <mode>`.

---

## 8. PipeWire and JUCE Observed State

### 8.1 PipeWire Metadata (clock.force-rate, clock.force-quantum)

**Set by:** `systemd/map2-backend.service` ExecStartPre via `pw-metadata`
**Read by:** PipeWire graph runtime
**Authority:** This is **not** a config authority — it is a runtime command applied at service start. If PipeWire restarts independently, the command is not re-applied.
**Do NOT set** `clock.force-quantum` in `pipewire.conf.d` — it blocks runtime overrides.
**Drift risk:** Medium — PipeWire restart without map2-backend restart loses the quantum override.

### 8.2 JUCE ValueTree (In-Process DSP State)

**Authority:** Driven by State Authority (T2425 graph-native); not an independent authority
**Persistence:** Serialized to/from `Snapshot.document` JSONB via C++ JSON↔ValueTree bridge
**Drift risk:** Low when State Authority is active; High in single-node mode without etcd (see T2431-I gap).

---

## 9. Runtime / In-Memory State

| Concept | Where | Notes |
|---|---|---|
| Node health metrics | In-process service (`node_health_service.py`) | Not persisted; rebuilt from observations |
| Node discovery | mDNS + etcd observation leases (TTL) | Stale after TTL expiry; lease renewal critical |
| LCD morph evaluator state | `app/services/lcd_morph_evaluator.py` in-process | Not persisted; reset on service restart |
| Plugin scan cache | SQLite `plugins` table | Rebuilt by LV2 scanner on restart if stale |
| MIDI learn state | In-process | Not persisted across restart |
| Push Surface render state | In-process | Not persisted |
| Web UI pin state | Browser localStorage `map2.ui.settings` | Not server-side; per-browser |

---

## 10. Multi-Authority Drift Risks (Ranked)

### CRITICAL

1. **`SystemConfig` generic key/value table** (`system_config`)
   - Stores: chain presets, touchscreen assignments, command-queue metadata, promoted_advanced_routes
   - Problem: No schema enforcement, any service can write any key; violates one-concept-one-authority
   - Fix: T2431-G — hard-cut into typed domain tables
   - Blocker: Requires inventory of every key in use before deletion

2. **Deployment mode multi-source**
   - Stores: `/etc/guitarfx-mode.conf`, `~/.map2/deployment.json`, systemd drop-ins, `/etc/map2/environment`
   - Problem: systemd, env, UI, and service policy can disagree with no reconciliation
   - Fix: T2431-E — single authority file + projection generator (depends on Q1 answer)

3. **Snapshot draft (SQLite) vs. committed state (etcd)**
   - Problem: `Snapshot.document` in SQLite and etcd committed state represent the same live intent; reconciliation scheduler is the only bridge
   - Fix: State Authority reconciliation must be reliable and observable; T2431-J adds doctor/repair
   - Current mitigation: 5 s self-heal window in reconciliation scheduler

### HIGH

4. **`audio.*` Tier A locked settings in user config file**
   - Current: `audio.sample_rate`, `audio.buffer_size`, `audio.backend` are locked in `ConfigManager` but still appear in `~/.map2/config.json`
   - Problem: User editing the file bypasses the lock check at runtime but the value is loaded on restart; could cause latency regression
   - Fix: T2431-D layered loader — host-critical keys read only from `/etc/map2/config.d/`, never from user-plane file

5. **`audio_state.*` etcd cluster config in user config file**
   - Current: etcd endpoints, namespace, timeouts, TLS in `~/.map2/config.json`
   - Problem: Changing etcd cluster members requires editing every node's user config manually; no audit trail
   - Fix: T2431-D — move to host-plane `/etc/map2/config.d/cluster.json`

6. **Single-node State Authority gap (no etcd fallback)**
   - Current: `audio_state.authority_backend` defaults to `"etcd"`; no local backend exists
   - Problem: Single-node installs cannot use State Authority; fall back to SQLite direct path with no reconciliation
   - Fix: T2431-I — single-node authority backend (file-backed or SQLite-backed committed/desired/observed contract)

7. **Service bind config (`backend.*`, `database.*`) in user config**
   - Current: `backend.host`, `backend.port`, `database.path` in `~/.map2/config.json`
   - Problem: User-plane file can change service bind address or database path with no host-admin review
   - Fix: T2431-D — restrict to host plane

### MEDIUM

8. **`flow_snapshots` authority overlap**
   - Current: Legacy `flow_snapshots` routes/service may still exist alongside `Snapshot.document` graph-native authority
   - Problem: Two competing representations of authored rig state
   - Fix: T2431-H — hard-cut removal (user confirmed Q4=remove)

9. **MIDI cluster config spread across user config and env vars**
   - Current: 12 `midi.cluster.*` keys in `~/.map2/config.json`; same keys available as `MAP2_MIDI_CLUSTER_*` env vars; MIDI cluster network state is ephemeral mDNS + RTP-MIDI
   - Fix: T2431-D — move cluster MIDI config to host plane; separate from ephemeral discovery state

10. **Effects loop `state_actual` and calibration drift**
    - Current: `EffectsLoop.state_actual`, `EffectsLoop.measured_added_latency_ms`, `EffectsLoop.compensation_samples` stored in SQLite as authoritative
    - Problem: These are observed state masquerading as desired config
    - Fix: Observed state belongs in State Authority observations, not SQLite schema columns

11. **Tesira credentials in user config**
    - Current: `tesira.ssh_password`, `tesira.ssh_credentials`, `tesira.sagevue_api_token` in `~/.map2/config.json` (marked `sensitive=True`)
    - Problem: Credentials in a per-user JSON file with no encryption; readable by any process with user access
    - Fix: T2431-D — move to host-plane secrets store or env var injection from systemd credential management

12. **PipeWire quantum lost on PipeWire restart**
    - Current: Quantum/rate set once at service start via ExecStartPre `pw-metadata`
    - Problem: PipeWire daemon restart without map2-backend restart drops the override
    - Fix: Monitor PipeWire session events and re-apply; or add PipeWire drop-in (but `force-quantum` in conf.d blocks runtime overrides — see gotcha)

### LOW

13. **`/etc/map2/environment` EnvironmentFile is optional**
    - Current: Systemd unit uses `EnvironmentFile=-/etc/map2/environment` (dash = optional)
    - Problem: File may not exist on fresh installs; host-critical env vars silently missing
    - Fix: T2431-E installer generates a baseline `/etc/map2/environment` with safe defaults

14. **NAM/IR directory config in both env vars and config file**
    - `MAP2_NAM_DIR` / `MAP2_IR_DIR` and `storage.nam_user_dir` / `storage.ir_user_dir` — duplicate override paths
    - Fix: T2431-B authority metadata on schema; T2431-D layered loader normalizes the precedence

15. **Browser-only pin state (`map2.ui.settings` localStorage)**
    - Current: Device pin state is browser-localStorage only (intentional per T2426 Q6)
    - Problem: Per-browser, not per-operator or per-node; operator moving to a new browser loses pins
    - Fix: Acceptable short-term; if cluster wants shared pin state, promote to `~/.map2/ui-settings.json` in a later task

---

## 11. Concepts Without a Declared Plane

These concepts currently exist in the codebase but have no explicit plane declaration in schema or docs:

| Concept | Current home | Correct plane | Action |
|---|---|---|---|
| Deployment mode authority | Multiple files | `/etc/map2/mode.json` (pending Q1) | T2431-E after Q1 |
| etcd cluster config | `~/.map2/config.json` | `/etc/map2/config.d/cluster.json` | T2431-D |
| Service bind host/port | `~/.map2/config.json` | `/etc/map2/config.d/service.json` | T2431-D |
| Database path | `~/.map2/config.json` + env var | `/etc/map2/config.d/service.json` | T2431-D |
| `SystemConfig` generic store | SQLite `system_config` | Typed domain tables | T2431-G |
| Tesira credentials | `~/.map2/config.json` | systemd `LoadCredential` or `/etc/map2/secrets/` | T2431-D |
| State Authority single-node fallback | Not implemented | `/var/lib/map2/state-authority/` | T2431-I |
| Generated projection checksum | Not implemented | Embedded header in generated files | T2431-F |
| Effects loop observed state | SQLite columns | State Authority observations | T2431-G scope extension |
| PipeWire quantum recovery | None | PipeWire session monitor | Separate task |

---

## 12. Subtask Links

| Subtask | Depends on audit sections | Priority |
|---|---|---|
| T2431-B: authority metadata in ConfigOption | §2.1, §3, §11 | High — prerequisite for loader |
| T2431-C: Map2Paths authority | §2, §4, §7 | High — prerequisite for loader and installer |
| T2431-D: layered config loader | §2.1, §3, §10 risks 4-9, 11, 14 | High — fixes most drift |
| T2431-E: deployment mode authority | §7, §10 risk 2 | High (after Q1) |
| T2431-F: projection header standard | §7.2, §10 risk 13 | Low effort, high value |
| T2431-G: SystemConfig hard-cut | §4.5, §10 risk 1 | Critical |
| T2431-H: flow_snapshots removal | §6, §10 risk 8 | High |
| T2431-I: single-node auth backend | §5.3, §10 risk 6 | High |
| T2431-J: authority doctor + rollback | All drift risks | Final gate |

---

*Authored by Claude Sonnet 4.6 for T2431-A, 2026-04-23.*

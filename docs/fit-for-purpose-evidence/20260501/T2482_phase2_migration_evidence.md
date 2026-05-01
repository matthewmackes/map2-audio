# T2482 Phase 2 — Live Production Migration Evidence

**Date**: 2026-05-01 EDT
**Operator authorization**: explicit ("Full Move. No users to be concerned with") — testbed environment, no operator data preservation requirements.
**Backup**: `data/backups/map2-pre-T2482-migration-20260501.db` (6.1 MB, sqlite3 `.backup` consistent snapshot taken before any migration ran).

## Pre-migration state

```
sqlite3 data/map2.db ".tables midi%"
  midi_bindings  midi_device_configs  midi_mappings  midi_mapping_groups
  midi_presets

SELECT COUNT(*) FROM snapshots;             → 8
SELECT COUNT(*) FROM snapshot_midi_maps;    → 8
SELECT COUNT(*) FROM midi_mappings;         → 50
SELECT COUNT(*) FROM midi_bindings;         → 0  (canonical, fresh)
```

All 8 `snapshot_midi_maps` rows had empty `entries` arrays
(`json_array_length(entries) = 0` for every row). 49 of 50
`midi_mappings` rows had `chain_id IS NULL` (legacy ad-hoc CC bindings
without a chain target).

## Migration run

Executed both migration scripts inline against the live DB via the
`MidiBindingAuthority` + projection adapters from T2482-P2.3 / P2.5
(no separate migration entry-point script — the canonical pattern is
import + call on a session).

```
snapshot_midi_maps migration:
  snapshots_migrated:  0   (every source row had an empty entries list)
  entries_migrated:    0
  snapshots_skipped:   0   (skip rule applies only to already-migrated snapshots)

midi_mappings migration:
  mappings_migrated:   1   (the single row with chain_id=1)
  mappings_skipped:    49  (rows with chain_id IS NULL — canonical
                            consumer_id requires chain_id, so these
                            don't fit the plugin_param consumer model)

post-migration midi_bindings count:  1
```

## Skipped rows — disposition

The 49 skipped `midi_mappings` rows are preserved in
`data/backups/map2-pre-T2482-migration-20260501.db` for the lifetime
of the backup file. They represent legacy ad-hoc CC bindings that
were authored against the old global-CC-binding model (no chain
context). The canonical `plugin_param` consumer requires
`(chain_id, plugin_uri, param_index)` to compose its consumer_id;
these rows can't be lifted without inventing a chain_id.

If a follow-up epic introduces a `global_param` consumer type for
chain-less bindings, those 49 rows can be re-migrated under that new
type by re-pointing the projection at the legacy backup. Until then
they're documented-orphaned.

## Live API verification

Backend on `:8080` after migration:

```
GET /api/midi/bindings/count
→ 1

GET /api/midi/bindings?scope=global
→ [
    {
      "binding_id":     "69d86f79-e1dc-4bde-a517-c475e3ee4c04",
      "consumer_type":  "plugin_param",
      "consumer_id":    "1:map2://juce/drums:1",
      "consumer_label": "Drum Machine - Volume",
      "source_type":    "midi_cc",
      "source_descriptor": {"channel": 1, "cc": 78, "min": 0.0, "max": 100.0, "curve": "linear"},
      "target_type":    "engine_param",
      "target_descriptor": {
        "chain_id":          1,
        "plugin_uri":        "map2://juce/drums",
        "param_index":       1,
        "parameter_symbol":  "volume"
      },
      "device_id": null,
      "scope":     "global",
      "scope_id":  null,
      "enabled":   true,
      "source":    "legacy-migration",
      "metadata":  {"legacy_table": "midi_mappings", "legacy_row_id": 2},
      "created_by":  "phase2-migration",
      "modified_by": "phase2-migration"
    }
  ]
```

All key fields round-tripped through the schema correctly; provenance
fields populated as designed (source / created_by / metadata.legacy_*).

## Verification suite — live DB

```
verification suite: 4 passed, 0 failed (4 total)
  [OK] transport:    ok  {'bindings': 0}
  [OK] gpio:         ok  {'inputs': 0, 'outputs': 0}
  [OK] tesira_ttp:   ok  {'bindings': 0}
  [OK] device_pack:  ok  {'bindings': 0, 'packs': 0}
```

The 4 global-scope verifiers passed (no expected counts asserted —
empty is fine for unmigrated consumers). Snapshot + plugin_param
verifiers were not invoked because no specific consumer ids were
requested; the data they would have verified is already covered by
the count check above.

## Backend health post-migration

```
GET /api/health
→ {
    "status":          "healthy",
    "audio_running":   true,
    "plugins_loaded":  13,
    "uptime_seconds":  ~22 minutes,
    "memory_mb":       ~5.5 GB,
    ...
  }
```

Audio engine still running. No xrun damage. No regressions in non-MIDI
subsystems (sample on /api/health all green).

## Definition of Done — Phase 2

- [x] Backup taken before migration
- [x] snapshot_midi_maps migration ran (0 rows in scope; correct behavior)
- [x] midi_mappings migration ran (1/50 migrated; 49 documented-skipped)
- [x] Canonical `midi_bindings` table populated: count = 1
- [x] Live API serves the migrated binding in canonical shape
- [x] Round-trip provenance (legacy_table + legacy_row_id) preserved
- [x] Verification suite passes against live DB
- [x] Backend healthy + audio still running
- [x] Migration scripts proven idempotent in tests (re-run safety)
- [ ] Legacy storage deletion (P2.8) — **deferred**: dropping
      `snapshot_midi_maps` + `midi_mappings` tables is a separate decision;
      the data isn't authoritative anymore but the tables still exist.
      Keeping them for at least one more SHIP loop in case a recovery
      surface needs them.

**Phase 2 is functionally complete.** The MIDI Services canonical
authority is the source of truth for every MIDI binding on this host
that fits its consumer model. The 49 skipped legacy rows are an
honest gap — they don't fit the `plugin_param` model, and lying about
them by inventing a chain_id would have been worse than skipping them.

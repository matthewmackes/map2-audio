# T2482 Phase 2.8 part 1 — Chain-Less MIDIMapping Re-Migration Evidence

**Date**: 2026-05-01 EDT
**Operator authorization**: continuing approval ("continue. you are approved for the deferred").
**Backup**: `data/backups/map2-pre-T2482-P2.8-part1-migration-20260501.db` (6.1 MB, sqlite3 `.backup` consistent snapshot taken before migration ran).

## Context

The 2026-05-01 first production migration left 49 legacy `midi_mappings` rows documented-skipped because their `chain_id IS NULL` and the canonical `plugin_param` consumer type required a chain_id. Iter 31 introduced the `global_param` consumer type to absorb chain-less plugin parameter bindings; this evidence doc captures the run that lifts those 49 rows into canonical form.

## Pre-migration state

```
midi_bindings count: 1   (the single chain-bound row from the 2026-05-01 migration:
                          Drum Machine - Volume, ch1 cc78 → chain1 map2://juce/drums param 1)

midi_mappings WHERE chain_id IS NULL: 49 rows
```

## Migration run

```
chain-less migration: {'mappings_migrated': 49, 'mappings_skipped': 0}
post-migration midi_bindings count: 50
```

Idempotency verified by tests; not re-run on live DB this iter (re-run would show 49 skipped, 0 migrated).

## Live API verification

```
GET /api/midi/bindings/count
→ 50

GET /api/midi/bindings?scope=global
→ 50 records, partitioned:
    plugin_param:  1   (the original chain-bound binding from 2026-05-01)
    global_param: 49   (the newly-migrated chain-less rows)
```

Backend restarted post-migration to pick up the iter-31 schema update (the `BindingConsumerType` Literal needed the new `global_param` value live in the running process before the server-side validation would accept the new shape).

## Backend health post-migration

```
GET /api/health
→ {"status": "healthy", "audio_running": true, "plugins_loaded": 13}
```

## Definition of Done — P2.8 part 1

- [x] Backup taken before migration
- [x] global_param consumer type added to schema
- [x] Migration script + 14 tests SHIPPED in iter 31
- [x] Migration ran on live DB; 49 rows lifted; 0 skipped
- [x] Canonical midi_bindings count: 1 → 50
- [x] Live API serves both consumer types correctly
- [x] Backend restarted + healthy + audio still running

P2.8 part 1 complete. Part 2 (drop the legacy `snapshot_midi_maps` + `midi_mappings` tables) lands in iter 33 as the closing gate of P2.8.

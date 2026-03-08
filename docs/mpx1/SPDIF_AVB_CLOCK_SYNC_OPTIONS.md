# MPX1 S/PDIF + AVB Clock/Bitrate Sync Options

Last updated: 2026-03-01

## Design Review (Current MAP2 Baseline)

The platform already had strong low-latency defaults, but sample-rate authority was spread across multiple places:

1. `~/.map2/config.json` (`audio.sample_rate`, AVB keys)
2. PipeWire user fragment (`~/.config/pipewire/pipewire.conf.d/99-map2-audio-latency.conf`)
3. `map2-backend.service` `ExecStartPre` (`clock.force-rate`, `clock.force-quantum`)
4. AVB runtime defaults (`avb.*` + readiness/router behavior)

This is reliable for fixed `48k/64`, but it is easy to drift when introducing MPX1 S/PDIF + AVB mixed transport routing. The new profile system makes one profile the source of truth and writes synchronized mappings everywhere.

## Canonical Profile Catalog (5 Options)

Canonical config file:

- `config/audio-clock-sync-profiles.yaml`

Available profile IDs:

1. `spdif_master_48k`
2. `spdif_master_44k1`
3. `avb_master_48k`
4. `dual_locked_48k`
5. `hybrid_adaptive_44k1_48k`

Each profile carries explicit remarks, lock/SRC policy, and full rate/bit-depth mapping.

## Easy Operator Process

Single command flow (AVB setup + profile apply):

```bash
sudo bash scripts/setup_mpx1_spdif_avb.sh --interface enp11s0 --profile dual_locked_48k --yes
```

Profile-only flow (no AVB reprovision):

```bash
python3 scripts/apply_clock_sync_profile.py --list-profiles
sudo python3 scripts/apply_clock_sync_profile.py --profile avb_master_48k --avb-interface enp11s0 --restart-backend
```

Dry run:

```bash
python3 scripts/apply_clock_sync_profile.py --profile hybrid_adaptive_44k1_48k --dry-run
```

## What Gets Synchronized

When a profile is applied, MAP2 now updates all of the following in one pass:

1. `~/.map2/config.json`
2. `~/.config/pipewire/pipewire.conf.d/99-map2-audio-latency.conf`
3. `/etc/systemd/system/map2-backend.service.d/20-clock-sync-profile.conf` (unless `--no-systemd`)

## Future AI Continuation Notes

Canonical implementation files:

1. `scripts/apply_clock_sync_profile.py`
2. `scripts/setup_mpx1_spdif_avb.sh`
3. `config/audio-clock-sync-profiles.yaml`

Required continuation method:

1. Add/modify profiles in `config/audio-clock-sync-profiles.yaml` first.
2. Keep `remarks` fields updated (these are intentional AI handoff notes).
3. Apply via script; do not hand-edit generated target files in normal workflows.
4. If route/API behavior changes, keep `app/routes/avb.py` and `app/routes/pipewire.py` synchronized with profile-derived values.

## Verification Checklist

1. `python3 scripts/apply_clock_sync_profile.py --profile <id> --dry-run`
2. Verify generated summary JSON shows expected rates.
3. If applied with restart: `systemctl status map2-backend --no-pager`
4. `curl -s http://localhost:8080/api/avb/status | jq '.config'`
5. `curl -s http://localhost:8080/api/pipewire/settings | jq`
6. `curl -s http://localhost:8080/api/audio/source-of-truth | jq`
7. Open GUI `/engine` and confirm the **Single Source Of Truth** panel reports expected profile/rate/buffer/bit-depth with no mismatch issues.

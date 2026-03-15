# Repository Bloat Cleanup Runbook

## Scope

`T082-subD` exists because the source repository still carries tracked build and dependency artifacts that materially slow clone, CI checkout, and tooling scans.

Current tracked inventory on `2026-03-10`:

- `node_modules/`: `8401` tracked files
- `juce-engine/build*`: `1783` tracked files at the engine root
- `juce-engine/**/build*`: `3986` tracked files in nested JUCE/plugin build trees
- `juce-engine/IntelliFX8VoiceChorusPlugin`: `171` tracked files
- `juce-engine/TweedBassmanPlugin`: `171` tracked files
- `data/repair-backups`: `9` tracked files

Notes:

- The nested build-tree count overlaps the plugin-directory counts; do not sum these rows naively.
- This host does not currently have `git-filter-repo` installed, so the destructive rewrite step remains blocked here until the tool is installed or the rewrite is run from a prepared mirror clone.
- `scripts/prepare_repo_bloat_rewrite_window.py` can now generate a rewrite-window bundle containing a guarded helper shell script, collaborator notice, and readiness summary.

## Guardrails added now

The root `.gitignore` now blocks re-addition of the identified bloat classes:

- `node_modules/`
- `juce-engine/build*/`
- `juce-engine/**/build*/`
- `juce-engine/IntelliFX8VoiceChorusPlugin/`
- `juce-engine/TweedBassmanPlugin/`
- `data/repair-backups/`

This does not remove existing history. It only prevents future accidental recommits once the index/history cleanup is executed.

## Recommended execution model

Run the destructive rewrite from a fresh mirror clone, not from a day-to-day working tree.

### Prerequisites

- Freeze new pushes to `master` on both `origin` and `gitlab`
- Notify all collaborators that history will be rewritten
- Ensure `MAP2-RELEASES` nightly flow is already functional before rewriting source history
- Install `git-filter-repo`

Optional prep bundle from any repo checkout:

```bash
python3 scripts/prepare_repo_bloat_rewrite_window.py \
  --output-dir docs/fit-for-purpose-evidence/<YYYYMMDD>/t082-rewrite-window
```

This writes:

- `run_repo_bloat_rewrite_window.sh`
- `T082_REPO_REWRITE_COLLABORATOR_NOTICE.md`
- `t082-rewrite-window-plan.json`
- `T082_REPO_BLOAT_REWRITE_WINDOW_PLAN.md`

Example install options:

```bash
pipx install git-filter-repo
# or
python3 -m pip install --user git-filter-repo
```

### Mirror-clone workflow

```bash
git clone --mirror git@github.com:matthewmackes/map2-audio.git map2-audio-cleanup.git
cd map2-audio-cleanup.git
```

If you prepared a bundle earlier, copy or regenerate it against the mirror clone and run the generated helper from there:

```bash
MAP2_REWRITE_CONFIRM=YES MAP2_REWRITE_PUSH=1 \
  ./run_repo_bloat_rewrite_window.sh "$(pwd)"
```

### Rewrite command

```bash
git filter-repo \
  --path-glob 'node_modules/**' \
  --path-glob '*/node_modules/**' \
  --path-glob 'juce-engine/build*/**' \
  --path-glob 'juce-engine/**/build*/**' \
  --path-glob 'juce-engine/IntelliFX8VoiceChorusPlugin/**' \
  --path-glob 'juce-engine/TweedBassmanPlugin/**' \
  --path-glob 'data/repair-backups/**' \
  --invert-paths
```

### Post-rewrite verification

```bash
git count-objects -vH
git log --stat -1
```

### Force-push both remotes

```bash
git push origin --force --all
git push origin --force --tags
git push gitlab --force --all
git push gitlab --force --tags
```

### Collaboration recovery steps

Every collaborator must re-clone or hard-reset to the rewritten history before resuming work.

## Acceptance criteria for final unblock

`T082-subD` can move from blocked to done only when all of the following are true:

- rewrite executed from a prepared clone with the target paths removed from history
- both `origin` and `gitlab` force-pushed successfully
- collaborators informed and migrated to the rewritten history
- follow-up clone/checkout timing is materially improved
- no listed bloat paths remain tracked in fresh history

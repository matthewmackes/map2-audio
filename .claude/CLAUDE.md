# MAP2 Audio Platform — Claude Workspace Instructions

**Last updated:** 2026-04-21
**Canonical rulebook:** [`.gemini/instructions.md`](../.gemini/instructions.md) — adopted in full for Claude
**Canonical collab prefs:** [`.github/copilot-instructions.md`](../.github/copilot-instructions.md)
**Canonical worklist:** [`docs/PROJECT_WORKLIST.md`](../docs/PROJECT_WORKLIST.md)

---

## 0. Commit & Push Rulebook (PROMOTED — APPLIES TO EVERY CHANGE)

These rules govern every commit and push Claude performs. They override any conflicting default behavior.

### 0.1 Branch discipline
- **Always stay on `master`.** Never create feature branches unless the user explicitly asks.
- **Never force-push to `master`.** If asked to force-push, warn the user and confirm first.
- **No `--no-verify`, `--no-gpg-sign`, `--amend` of pushed commits**, or hook skipping — unless the user explicitly requests it for a specific reason. Always prefer a new commit over amending.

### 0.2 Dual-remote synchronization (MANDATORY)
- **Every push targets both remotes in the same step:**
  ```bash
  git push origin master && git push gitlab master
  ```
  - `origin` → GitHub: https://github.com/matthewmackes/map2-audio
  - `gitlab` → GitLab: https://gitlab.com/matthewmackes-group/matthewmackes-project
- **Both repos must stay in sync at all times.** A push that only lands on one remote is an incomplete push and must be corrected before reporting success.
- If the user names a branch other than `master`, mirror it to **both** remotes the same way.

### 0.3 Staging hygiene
- Prefer `git add <file> <file>` with explicit paths over `git add -A` / `git add .` — avoid accidentally committing `.env`, credentials, large binaries, or in-progress files.
- Never commit a file that likely contains secrets. If the user asks to commit such a file, warn first.
- Never modify `git config`.
- Never touch tracked `VERSION` / `version.json` by hand — they are generated artifacts (see gotcha #10 in `.gemini/instructions.md`).

### 0.4 Commit message format
- Follow the repository's existing commit-message style (inspect `git log` before drafting).
- Focus the message on **why**, not what — the diff already shows what.
- Pass the commit body via HEREDOC so Markdown/newlines survive intact:
  ```bash
  git commit -m "$(cat <<'EOF'
  Concise summary of the change

  Optional paragraph explaining motivation and user-visible impact.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```
- Keep messages accurate: "add" = new feature, "update" = enhancement, "fix" = bug fix, "refactor" = no behavior change, "docs/chore/test" as appropriate.

### 0.5 Only commit and push when the user asks
- **Never commit unsolicited.** Writing code, running tests, and making edits does not license a commit.
- **Never push unsolicited.** Even after the user approves a commit, a push is a separate authorization.
- A user approving a commit/push once does **not** authorize future commits/pushes — ask each time unless the user has explicitly said "autonomous" / "keep shipping" / "no confirmation needed" for the current scope.

### 0.6 `update` shorthand (user command)
When the user types `update` (or says "update the system" in the shipping sense), treat it as **one executable command** with four ordered steps — execute all four without asking for confirmation between steps, unless a step fails:

1. **Commit** all current working-tree changes on `master` with a descriptive message.
2. **Dual-push:** `git push origin master && git push gitlab master`.
3. **Rebuild** the frontend atomically: `python3 scripts/build_web_dist_atomic.py` (or `npm --prefix web run build`).
4. **Restart** the web server on port `3000` and verify it responds.

Faster path for the full loop: `python3 scripts/continuous_release.py --commit-message "..."` — auto-commits, fetches both remotes, merges drift, pushes both, rebuilds, redeploys, and verifies health in one shot.

### 0.7 Pre-commit / pre-push checklist
Before every commit on a UI-affecting or backend-contract-affecting change:

1. `npm --prefix web run typecheck` (if `web/` touched)
2. `npm --prefix web run test -- --run <relevant-suite>` (if `web/` touched)
3. `python3 -m pytest <relevant-tests>` (if `app/` touched)
4. `npm --prefix web run build` — **the full production build is the real gate** (see gotcha #9 in `.gemini/instructions.md`). `tsc --noEmit` and route-local tests are necessary but not sufficient.
5. `ls web/dist/assets/<Page>-*.js` — confirm the bundle hash changed when source changed.

If a pre-commit hook fails, the commit did **not** happen — fix the issue, re-stage, and create a **new** commit. Never `--amend` in that scenario: amending would modify the previous commit and can destroy work.

### 0.8 Definition of Done (MANDATORY — block `[✓] Done` until satisfied)
A worklist task may not be marked `[✓] Done` until **every** gate passes:

1. **Code committed to `master`** — in git history, not only in working tree or a feature branch.
2. **Dual-pushed** — `git push origin master && git push gitlab master` completed without error on both remotes.
3. **Frontend rebuilt** — `npm --prefix web run build` exited clean (UI tasks).
4. **Bundle is live on port 3000** — static server at `:3000` serves the new build hash (UI tasks).
5. **Visually verified in-browser** — the expected visual change was observed. A "Select a chain" placeholder state is **not** the feature being present.
6. **Tests pass** — `npm --prefix web run test` / relevant pytest suite green, no new failures.

If gates 1–6 are not all confirmed, the task stays `[>] In Progress` with a note on which gate is incomplete. Writing code alone never satisfies Done.

### 0.9 Destructive operations require explicit authorization
Before running any of the following, pause and confirm with the user — even if mid-flow:

- `git push --force` / `--force-with-lease` (never to `master` without explicit authorization)
- `git reset --hard`, `git checkout -- .`, `git restore .`, `git clean -f`
- `git branch -D`
- Amending an already-pushed commit
- `rm -rf` on anything outside a build output dir
- Any action that modifies shared state on GitHub/GitLab (closing PRs/issues, deleting remote branches)

### 0.10 When a commit/push fails
- **Pre-commit hook failed** → fix the underlying issue; re-stage; make a **new** commit (not `--amend`).
- **Remote rejected push (non-fast-forward)** → `git fetch origin master && git fetch gitlab master`; merge or rebase; resolve conflicts; re-run the dual-push.
- **One remote succeeded, the other failed** → report the asymmetry immediately; do not mark the push as "done" until both remotes are in sync.

---

## 1. Canonical Rulebook Adoption

**`.gemini/instructions.md` is Claude's rulebook in full.** Every rule, pattern, gotcha, and directive in that file applies to Claude identically to how it applies to Gemini. This CLAUDE.md:

- **Promotes** the commit/push/Definition-of-Done rules to section 0 so they are always top-of-mind.
- **Does not duplicate** the 2,100+ lines of technical content in `.gemini/instructions.md` — read that file directly when you need architectural, build, React/TypeScript, Python, JUCE, or gotcha-level detail.
- **Indexes** the rulebook (below) so Claude can jump to the right section quickly.

When a rule in `.gemini/instructions.md` conflicts with default Claude behavior, the Gemini rulebook wins.

### How to navigate `.gemini/instructions.md`
Use `Grep` with these anchor patterns (from the rulebook's Table of Contents):

| Topic | Grep pattern |
|---|---|
| Memory/self-improvement protocol | `^## 🧠.*IT REMEMBERS` |
| Work tracking | `^## Work Tracking` |
| Tech stack & versions | `^## Tech Stack` |
| Build & test commands | `^## Build & Test Commands` |
| Essential files | `^## Essential Files` |
| Server management | `^## Server Management Patterns` |
| Build & deployment workflow (incl. `update` shorthand) | `^## Build & Deployment Workflow` |
| Web dev guidelines | `^## Web Development Guidelines` |
| Code quality standards | `^## Code Quality Standards` |
| Style & architecture rules | `^## Style & Architecture Rules` |
| Unified Node Pill directive | `^## Unified Node Pill Directive` |
| Golden example files | `^## Golden Example Files` |
| Gotchas & learned fixes | `^## Gotchas & Learned Fixes` |
| 5-Question Clarification Protocol | `^## 5-Question Clarification Protocol` |
| Plan-First meta rule | `^## Plan-First Meta Rule` |
| Critical system rules | `^## Critical System Rules` |
| Performance & latency | `^## Performance & Latency` |
| Update log | `^## Update Log` |
| Quick reference commands | `^## Quick Reference Commands` |
| Common pitfalls | `^## Common Pitfalls to Avoid` |

### How to keep the rulebook living
- If the user asks Claude to **remember** a fix, pattern, or directive → update `.gemini/instructions.md` directly (add to the appropriate section **and** append to the Update Log).
- If the user changes **collaboration preferences** (e.g., a new shorthand, a changed workflow) → update `.github/copilot-instructions.md` and mirror the rule into section 0 here if it affects commit/push.
- If a new **worklist rule** emerges → update `docs/PROJECT_WORKLIST.md` and, if it's a permanent directive, note it here in section 2.

---

## 2. Mandatory Operating Rules (enforced on every turn)

1. **Stay on `master`.** No feature branches unless asked.
2. **Dual-push every time.** `git push origin master && git push gitlab master`. Both remotes in sync at all times.
3. **Atomic web builds.** `npm run build` → serve from `web/dist/` on port 3000. **Never** use the Vite dev server or HMR.
4. **Worklist is source of truth.** All work lives in `docs/PROJECT_WORKLIST.md`. No side lists, no hidden plans. Mark `[>] In Progress` before substantive edits.
5. **Restart-safe execution.** Decompose work into atomic 15–60 min bundles. Update the worklist before and after.
6. **Completeness first.** Full backend/API/frontend/test updates together. No stubs, no half-finished implementations.
7. **Remember in canonical sources.** Durable fixes → `.gemini/instructions.md`. User preferences → `.github/copilot-instructions.md`. Tasks → `docs/PROJECT_WORKLIST.md`. Do not invent side files.
8. **Definition of Done before `[✓] Done`.** See §0.8.
9. **`update` shorthand executes the full release loop.** See §0.6.
10. **5-Question Clarification Protocol on "ask questions".** When the user says "ask questions", ask **one at a time**, sequentially — never batch a list.

---

## 3. .codex Skill Framework

The `.codex/` directory provides specialized skills that route execution to canonical sources. Invoke the matching skill when the user's ask fits its trigger.

| Skill | Use when |
|---|---|
| **map2-gemini-instructions** | Working on architecture, build/test/deploy, server management, RT/latency constraints, or documenting a new fix. Sources `.gemini/instructions.md`. |
| **map2-copilot-instructions** | Handling commit/push/sync/`update`. Enforces dual-push to `origin` + `gitlab`. Sources `.github/copilot-instructions.md`. |
| **map2-worklist-management** | Planning, executing, or reporting project work; adding ideas/bugs/features; coordinating parallel subtasks. Canonical: `docs/PROJECT_WORKLIST.md`. |
| **complete-remaining-work** | User asks to continue, complete, bundle, or proceed autonomously. Assumes yes on reasonable implementation choices. |
| **juce-random-effects-soak** | Validating engine stability after graph/device/lifecycle changes; release-grade perf proof. Outputs `docs/fit-for-purpose-evidence/<YYYYMMDD>/`. |
| **build-installer-rpm** | Constructing RPM installer artifacts. |
| **revisit-map2-installer-rpm** | Full installer workflow with delta-report JSON/Markdown. |

---

## 4. Response Structure for Project Work

When executing work in this repository:

1. **Show the canonical worklist state** — top 5–10 tasks with statuses (or relevant section).
2. **Propose updates/completions/new tasks** based on current findings.
3. **Execute the highest-priority feasible work**, splitting into parallel bundles where safe.
4. **End with the updated worklist state** — confirm all status changes and propose next 1–3 logical tasks.

---

## 5. Architecture Quick Reference

*For full detail, read `.gemini/instructions.md`.*

- **JUCE 8.0.0** C++ audio engine + **Python FastAPI** backend.
- **PipeWire** via JACK protocol (not direct ALSA).
- **USB audio interfaces:** Edirol UA-1000 (primary), Hotone Jogg.
- **systemd service:** `map2-backend.service` on port 8080.
- **C++ engine:** `juce-engine/Source/` (`Map2AudioEngine`, `JuceAudioIO`, `JuceAudioGraph`).
- **Python config:** `app/config.py` (ConfigManager with CONFIG_SCHEMA).
- **PipeWire config:** `~/.config/pipewire/pipewire.conf.d/99-map2-audio-latency.conf` (single fragment).

### RT/latency (as of 2026-02-26)
- Kernel cmdline: `isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 threadirqs intel_idle.max_cstate=1 processor.max_cstate=1 preempt=full`
- Audio cores: 4,5 (isolated in GRUB, pinned via `CPUAffinity=4 5`).
- Quantum: 64 samples @ 48000 Hz = 1.33 ms/period.
- `PIPEWIRE_LATENCY=64/48000` env var.
- Build: `-O3 -march=native`, `-ffast-math` OFF by default.

### Build commands
- **C++ engine:** `cmake -B juce-engine/build && cmake --build juce-engine/build`.
- **Web:** `npm --prefix web run build` (atomic) → `npm --prefix web run preview` (port 3000).
- **Python:** `pip install -r requirements.txt` + uvicorn on port 8080.

### Key file paths
- C++ buffer constant: `juce-engine/Source/Common.h` (`DEFAULT_BUFFER_SIZE=64`).
- Systemd: `systemd/map2-backend.service` (synced to `/etc/systemd/system/`).
- GRUB: `/etc/default/grub` (then `grub2-mkconfig -o /boot/grub2/grub.cfg`).
- Limits: `/etc/security/limits.d/99-map2-audio.conf`.

### Design directives
- **Unified Node Pill** — All node identity/status/scope UI goes through `NodeNavChip` in the global nav; `NodeContextBanner`, `NodeContextPicker`, `NodeAlertBar` are deprecated.
- **Device Context Pattern** — All device panels use `DeviceContextBanner` + `DeviceContextDialog` + `useDeviceNodeContext`; never write per-device inline node-switch banners.
- **Engine-command dispatcher** — Vendor mapping JS scripts emit `engine_command` IPC frames; the backend consumes them through `app/services/engine_command_dispatcher.py`. Add new audio-surface targets to `engine_command_handlers.py` via the `HandlerHooks` DI seam — never bypass the dispatcher and consume `engine_command` directly. Full doc: `docs/midi/ENGINE_COMMAND_DISPATCHER.md`.
- **Per-installation device override pattern** — For devices with stock firmware that emits different MIDI per mode (MeloAudio Commander is the reference case), capture per-install bindings to `~/.map2/devices/<device>-discovered.yaml` and merge over the device-pack defaults via a resolver (`commander_resolver.py`). Don't bend canonical device-pack constants to match one operator's mode.

### Known constraints
- GRUB changes (`isolcpus=4,5`, C-states, `preempt=full`) **require reboot** to take effect. Currently running `isolcpus=2,3` until reboot — audio is still on non-isolated cores.
- Recommended: install `kernel-rt` for PREEMPT_RT (<50 µs jitter vs ~200 µs under `preempt=full`).

---

## 6. Critical Gotchas (top-level reminders — full list in `.gemini/instructions.md`)

1. **NO Vite dev server.** Always `npm run build` → static serve from `dist/`. See `/home/mm/.claude/projects/-home-mm-map2-audio/memory/feedback_no_dev_server.md`.
2. **AVB `bufferSize=256` is NOT the audio buffer.** It's the AVTP network packet size (IEEE 1722). Main callback buffer is `DEFAULT_BUFFER_SIZE=64` in `juce-engine/Source/Common.h`.
3. **RT safety:** Metering uses a lock-free ring buffer. `setBufferSize()` and `setSampleRate()` stop audio before reallocation (fixed 2026-02-17). Plugin processors and convolution IRs still need verification for RT allocations.
4. **Systemd drop-ins:** `ExecStartPre` is additive; `CPUAffinity` is last-write-wins. `override.conf` wins over `10-mode.conf` (sort `o` > `1`).
5. **PipeWire:** DO NOT set `force-quantum` in `pipewire.conf.d` — it blocks runtime overrides. Use `ExecStartPre pw-metadata`: rate FIRST, then quantum.
6. **React infinite-loop trap:** no-dep `useLayoutEffect` calling `setState` loops forever. Use functional updater: `setState(prev => sameRef ? prev : newVal)` to break the cycle.
7. **Full production build is the real restart gate.** `tsc --noEmit` and route-local tests are necessary but not sufficient. Always `npm --prefix web run build` before restarting port 3000.
8. **`VERSION` / `version.json` churn:** Never hand-edit. They're generated; `commit`/`dirty` are refreshed at read-time from git. See Gotcha #10 in `.gemini/instructions.md`.

---

## 7. Quick Reference Commands

```bash
# Build everything
cmake -B juce-engine/build && cmake --build juce-engine/build
npm --prefix web run build

# Restart services
systemctl restart map2-backend.service
pkill -9 -f "serve_web_dist.mjs"; nohup /usr/bin/node scripts/serve_web_dist.mjs --host 0.0.0.0 --port 3000 > /tmp/preview.log 2>&1 &

# Commit + dual-push (ALWAYS both remotes)
git add <files>
git commit -m "message"
git push origin master && git push gitlab master

# `update` shorthand (commit + dual-push + rebuild + restart + verify)
python3 scripts/continuous_release.py --commit-message "your message"

# Worklist check
grep "^\[" docs/PROJECT_WORKLIST.md | head -20

# Soak test
python3 .codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py \
  --duration-seconds 1800 --flow-rotation-seconds 20 --sample-interval-seconds 1.0 \
  --reset-stats-after-warmup --threshold-max-xruns 0 --threshold-max-peak-jitter-ms 0.35
```

---

## 8. Reference Documents

- **`.gemini/instructions.md`** — Canonical Claude rulebook (full technical standards). **Read this for detail.**
- **`.github/copilot-instructions.md`** — Collaboration preferences and git workflow (source for §0).
- **`docs/PROJECT_WORKLIST.md`** — Canonical task list with full history.
- **`docs/fit-for-purpose-evidence/`** — Soak tests, performance proof, architecture validation.
- **Memory system:** `/home/mm/.claude/projects/-home-mm-map2-audio/memory/MEMORY.md` — user context, feedback, project state, references (auto-updated across sessions; path is absolute — it lives outside the repo).

---

## 9. How to update this file

- **Commit/push rule change** → update §0 here **and** mirror in `.github/copilot-instructions.md`.
- **New durable fix or pattern** → primary home is `.gemini/instructions.md` (add to the right section + Update Log). Update §6 here only if it's a top-level reminder worth surfacing.
- **New worklist rule** → primary home is `docs/PROJECT_WORKLIST.md`. Reflect here only if it's a permanent directive (§2).
- **Anything else** → don't write it here. CLAUDE.md stays lean and is always in context.

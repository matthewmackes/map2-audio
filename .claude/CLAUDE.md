# MAP2 Audio Platform — Claude Workspace Instructions

**Last updated:** 2026-04-20  
**Canonical skill framework:** `.codex/`

---

## Core Operating Rules

This workspace uses a **unified .codex framework** to enforce execution discipline across all AI/human collaboration. Three canonical documents govern all work:

1. **`.gemini/instructions.md`** — MAP2 technical standards (build, test, deploy, architecture, latency, gotchas)
2. **`.github/copilot-instructions.md`** — User collaboration preferences and git workflow
3. **`docs/PROJECT_WORKLIST.md`** — Single source of truth for all project tasks

### Mandatory Enforcement

- **No side lists, no hidden plans.** All work lives in `docs/PROJECT_WORKLIST.md` with atomic task schema.
- **Worklist rule is permanent** unless the user explicitly says `DISABLE WORKLIST RULE`.
- **Check and update the canonical worklist before starting substantive work.**
- **Git workflow:** Always stay on `master` branch. Push to both GitHub (`origin`) and GitLab (`gitlab`) simultaneously:
  ```bash
  git push origin master && git push gitlab master
  ```
- **Frontend serving:** Atomic builds only — `npm run build` then `npm run preview` on port 3000. NO dev server, NO Vite HMR.

---

## .codex Skill Framework

The `.codex/` directory provides **7 specialized skills** that route execution to canonical sources and enforce discipline:

### 1. map2-gemini-instructions
**Use when:** working on architecture, build/test/deploy commands, server management, performance/latency constraints, remembering new fixes/patterns.

- Sources canonical file: `.gemini/instructions.md`
- Fast section lookup via grep pattern in SKILL.md
- If user asks to "remember" a fix, update `.gemini/instructions.md` directly

### 2. map2-copilot-instructions
**Use when:** handling commit/push/sync requests, applying user workflow preferences, enforcing git synchronization.

- Sources canonical file: `.github/copilot-instructions.md`
- Enforces dual-push to origin + gitlab on every sync
- Primary: keep GitHub and GitLab synchronized; if user names another branch, mirror it to both remotes

### 3. map2-worklist-management
**Use when:** planning, executing, or reporting project work; adding new ideas/bugs/features; coordinating parallel subtasks; following Cortex AL worklist rule.

- Canonical location: `docs/PROJECT_WORKLIST.md`
- **Required task schema:**
  - `ID`: unique short code (T001, T002-subA)
  - `Status`: `[ ] Todo`, `[>] In Progress`, `[✓] Done`, `[✗] Blocked`, `[~] Cancelled`
  - `Title`: one-line outcome statement
  - `Description`: goal, acceptance criteria, why it matters, dependencies, estimated effort, required outputs
  - `Subtasks` (optional): nested entries using same schema
  - `Assigned to` (optional): AI thread/role/human
  - `Last updated`: YYYY-MM-DD HH:MM - actor

- **Core workflow:**
  1. Decompose into restartable units (target 15–60 min each)
  2. Prioritize and parallelize independent tasks
  3. Add every new idea/bug/improvement directly to the canonical list
  4. Make tasks atomic and handoff-ready
  5. After completion, update status with concrete notes and propose next 1–3 logical tasks

- **Definition of Done — required before marking `[✓] Done`:**
  1. Code committed to `master` (not just a branch or working-tree edit)
  2. Dual-pushed: `git push origin master && git push gitlab master`
  3. Frontend rebuilt (`npm --prefix web run build`) with no errors (UI tasks)
  4. Built bundle is live at port 3000 (UI tasks)
  5. Visually verified in-browser (UI tasks) — placeholder state ≠ feature present
  6. Tests pass (relevant Jest/pytest suite)

- **Strict prohibitions:** Do not maintain duplicate lists, side notes, or hidden memory for project tasks. Do not mark `[✓] Done` before the Definition of Done gates above are confirmed.

### 4. complete-remaining-work
**Use when:** user asks to continue work, complete remaining steps, move quickly, bundle tasks, or proceed without repeated confirmation.

- Read canonical worklist, identify highest-priority unfinished tasks
- Split next slice into independent bundles for parallel execution
- Mark selected tasks as `[>] In Progress` before substantive edits
- **Completeness standard:** Full backend/API/frontend/test updates together; no stubs
- **Parallelization standard:** Prefer parallel file reads, searches, validations; sequential only for correctness
- **Decision policy:** Assume yes for reasonable implementation choices that preserve safety and project conventions; escalate only on blockers
- If implementation introduces debt/risk/deferred work, add new worklist task immediately with dependencies and acceptance criteria
- Continue without asking for confirmation unless blocked by missing inputs, permissions, or destructive actions

### 5. juce-random-effects-soak
**Use when:** validating engine stability after graph/device/lifecycle changes, reproducing post-start_audio regressions, generating release-grade performance proof.

- 10 random native effects per flow epoch
- Rotating chain/parallel flow topologies and blend strategies
- Smoke run: 180s; Full run: 1800s
- Outputs: JSON + Markdown evidence to `docs/fit-for-purpose-evidence/<YYYYMMDD>/`

### 6. build-installer-rpm
**Use when:** constructing RPM installer artifacts.

### 7. revisit-map2-installer-rpm
**Use when:** executing full installer workflow with delta-report JSON/Markdown and map2_installer.py scaffolding.

---

## Response Structure for Project Work

When executing work in this repository:

1. **Show the canonical worklist state** — top 5–10 tasks with statuses (or relevant section)
2. **Propose updates/completions/new tasks** — based on current findings
3. **Execute the highest-priority feasible work** — split into parallel bundles where possible
4. **End with updated worklist state** — confirm all status changes and proposed next steps

---

## Key Facts

### Architecture
- JUCE 8.0.0 C++ audio engine with Python FastAPI backend
- PipeWire via JACK protocol
- USB audio: Edirol UA-1000 (primary), Hotone Jogg
- systemd service: `map2-backend.service` on port 8080
- C++ engine: `juce-engine/Source/` (Map2AudioEngine, JuceAudioIO, JuceAudioGraph)
- Python config: `app/config.py` (ConfigManager with CONFIG_SCHEMA)
- PipeWire config: `~/.config/pipewire/pipewire.conf.d/99-map2-audio-latency.conf` (single fragment)

### RT/Latency (as of 2026-02-26)
- Kernel cmdline: `isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 threadirqs intel_idle.max_cstate=1 processor.max_cstate=1 preempt=full`
- Audio CPU cores: 4,5 (isolated in GRUB, pinned via CPUAffinity=4 5 in service)
- Quantum: 64 samples / 48000 Hz = 1.33 ms/period
- PIPEWIRE_LATENCY: 64/48000 (env var in service)
- RT scheduling verified: JUCE audio callback FF/80, data-loop.0 FF/55, MIDI FF/80
- Build: -O3 -march=native, -ffast-math OFF by default

### Build Commands
- **C++ engine:** `cmake -B build && cmake --build build` (in juce-engine/)
- **Web:** `npm run build` (atomic) then `npm run preview` (on port 3000)
- **Python:** `pip install -r requirements.txt` + uvicorn on port 8080

### Key Locations
- C++ buffer constant: `juce-engine/Source/Common.h` (DEFAULT_BUFFER_SIZE=64)
- Systemd: `systemd/map2-backend.service` (synced to /etc/systemd/system/)
- GRUB: `/etc/default/grub` (requires `grub2-mkconfig -o /boot/grub2/grub.cfg` after edit)
- Limits: `/etc/security/limits.d/99-map2-audio.conf`

### Design Directives
- **Unified Node Pill Directive** — All node identity/status/scope UI via NodeNavChip in global nav; NodeContextBanner, NodeContextPicker, NodeAlertBar deprecated
- **Device Context Pattern** — All device panels use DeviceContextBanner + DeviceContextDialog + useDeviceNodeContext

### Known Issues
- GRUB changes (isolcpus=4,5, C-states, preempt=full) require reboot to take effect
- Currently running isolcpus=2,3 (old) until reboot; audio still on non-isolated cores
- Recommend: install kernel-rt for PREEMPT_RT (<50µs jitter vs ~200µs preempt=full)

---

## Reference Documents

- **`.gemini/instructions.md`** — Full MAP2 technical standards (fast lookup: grep patterns listed in `map2-gemini-instructions` SKILL.md)
- **`.github/copilot-instructions.md`** — Collaboration preferences and git workflow
- **`docs/PROJECT_WORKLIST.md`** — Canonical task list with full history
- **`docs/fit-for-purpose-evidence/`** — Soak tests, performance proof, architecture validation
- **Memory system:** `/home/mm/.claude/projects/-home-mm-map2-audio/memory/MEMORY.md` — User context, feedback, project state, references (auto-updated across sessions)

---

## Gotchas & Learned Fixes

1. **Frontend: NO dev server.** Always `npm run build` → `npm run preview`. No Vite HMR. Memory: [feedback_no_dev_server.md](../../../.claude/projects/-home-mm-map2-audio/memory/feedback_no_dev_server.md)

2. **AVB bufferSize=256 is NOT the audio buffer.** It's the AVTP network packet size (IEEE 1722 standard). Main callback buffer: DEFAULT_BUFFER_SIZE=64 in Common.h.

3. **RT safety:** Metering uses lock-free ring buffer. setBufferSize() and setSampleRate() stop audio before reallocation (fixed 2026-02-17). Plugin processors and convolution IRs still require verification for RT allocations.

4. **Systemd drop-in architecture:** ExecStartPre is ADDITIVE; CPUAffinity is LAST-WRITE-WINS. override.conf (sort 'o') wins over 10-mode.conf (sort '1').

5. **PipeWire: DO NOT set force-quantum in pipewire.conf.d** — blocks runtime overrides. Set via ExecStartPre pw-metadata: rate FIRST, then quantum.

6. **CRITICAL PATTERN (React):** no-dep useLayoutEffect calling setState causes infinite loop. Use functional updater `setState(prev => sameRef ? prev : newVal)` to break cycle.

---

## Quick Reference Commands

```bash
# Build and test
cmake -B juce-engine/build && cmake --build juce-engine/build
npm --prefix web run build && npm --prefix web run preview

# Restart services
systemctl restart map2-backend.service

# Git: commit, push to both
git add <files>
git commit -m "message"
git push origin master && git push gitlab master

# Worklist check
grep "^\[" docs/PROJECT_WORKLIST.md | head -20

# Soak test
python3 .codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py \
  --duration-seconds 1800 --flow-rotation-seconds 20 --sample-interval-seconds 1.0 \
  --reset-stats-after-warmup --threshold-max-xruns 0 --threshold-max-peak-jitter-ms 0.35
```

---

## Permanent Directives

1. **Stay on master.** No feature branches unless explicitly asked.
2. **Dual-push always:** `git push origin master && git push gitlab master`
3. **Atomic web builds:** `npm run build` → `npm run preview` (port 3000). Never dev server.
4. **Worklist is source of truth.** No side lists, no hidden plans.
5. **Restart-safe execution:** Decompose into atomic 15–60 min bundles; update worklist before and after.
6. **Completeness first:** Full backend/API/frontend/test updates together. No stubs.
7. **Remember in canonical sources:** fixes → `.gemini/instructions.md`, preferences → `.github/copilot-instructions.md`, tasks → `docs/PROJECT_WORKLIST.md`.

---

## How to Update This File

- If the user asks to "remember" a durable fix or pattern, update `.gemini/instructions.md` directly
- If the user asks to change collaboration preferences, update `.github/copilot-instructions.md`
- If new worklist rules emerge, update `docs/PROJECT_WORKLIST.md` and reflect in this file
- All three canonical sources feed back into this CLAUDE.md via the .codex skill framework

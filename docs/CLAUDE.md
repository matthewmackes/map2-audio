# MAP2 Audio Platform — AI Instructions

> **Last Updated**: 2026-03-17
> **Purpose**: Central reference for Claude Code working on the MAP2 Audio codebase.
> Also see: [.github/copilot-instructions.md](.github/copilot-instructions.md) · [.gemini/instructions.md](.gemini/instructions.md)

This file is read automatically by Claude Code at the start of every session.
It defines standing rules, conventions, and workflow norms for this repository.

---

## 🧠 IT REMEMBERS — Living Knowledge Base Protocol

This document is a living knowledge base. **You MUST update it when:**

1. **Problem Solved** → Add to [Gotchas & Learned Fixes](#gotchas--learned-fixes) with problem / solution / lesson / severity tag
2. **User Says "Remember This"** → Add to the appropriate section immediately
3. **Pattern Discovered** → Update [Style & Architecture Rules](#style--architecture-rules)
4. **Build/Deploy Issue** → Update [Build & Test Commands](#build--test-commands)
5. **Configuration Change** → Update [Tech Stack & Versions](#tech-stack--versions)

Severity tags: `CRITICAL` · `HIGH` · `MEDIUM` · `LOW`

---

## Table of Contents

1. [Git](#git)
2. [Tech Stack & Versions](#tech-stack--versions)
3. [Build & Test Commands](#build--test-commands)
4. [Global Work List](#global-work-list)
5. [Key File Locations](#key-file-locations)
6. [5-Question Clarification Protocol](#5-question-clarification-protocol)
7. [Plan-First Meta Rule](#plan-first-meta-rule)
8. [Critical System Rules](#critical-system-rules)
9. [Frontend Conventions](#frontend-conventions)
10. [Style & Architecture Rules](#style--architecture-rules)
11. [API Contract Standards](#api-contract-standards)
12. [Server Management Patterns](#server-management-patterns)
13. [Performance & Latency](#performance--latency)
14. [Gotchas & Learned Fixes](#gotchas--learned-fixes)
15. [Common Pitfalls to Avoid](#common-pitfalls-to-avoid)

---

## Git

- **Always work on the `master` branch** — never create feature branches unless the user explicitly asks
- Always push to **both** remotes after every commit:
  ```bash
  git push origin master && git push gitlab master
  ```
- GitHub: `origin` → https://github.com/matthewmackes/map2-audio
- GitLab: `gitlab` → https://gitlab.com/matthewmackes-group/matthewmackes-project
- Both repositories must stay in sync at all times.
- Never skip hooks (`--no-verify`) unless the user explicitly asks.
- Never force-push to `master` — warn the user if they request it.

---

## Tech Stack & Versions

### Frontend (React SPA)

| Package | Version | Notes |
|---|---|---|
| React | 19.0.0 | |
| TypeScript | 5.x | via `tsc -b` |
| Vite | 6.4.1 | build tool & preview server |
| **@carbon/react** | latest | **required UI standard for all new/updated UI** |
| @carbon/icons-react | latest | |
| @carbon/colors | latest | |
| MUI / @mui/material | 6.5.0 | legacy surfaces only — do not expand |
| @phosphor-icons/react | 2.1.10 | legacy surfaces only |
| TanStack Query | 5.59.0 | server state |
| React Hook Form | 7.53.0 | forms |
| Zustand | latest | global UI state |
| Recharts | 3.7.0 | charts & metering |
| ReactFlow | 11.11.4 | node graphs |
| React Three Fiber | 9.5.0 | 3D visualization |
| React Router DOM | 6.28.0 | routing |
| Framer Motion | 12.34.0 | animations |
| Emotion | 11.14.0 | CSS-in-JS (legacy surfaces) |

### Backend (Python FastAPI)

| Package | Notes |
|---|---|
| Python | 3.10+ (system Python) |
| FastAPI | async ASGI framework |
| Uvicorn | ASGI server, port **8080** |
| SQLAlchemy | 2.x ORM + async |
| Pydantic | 2.x validation |
| pytest | test runner |

### Audio Engine (C++ JUCE)

| Item | Value |
|---|---|
| JUCE | 8.0.0 |
| C++ standard | 17 |
| CMake | 3.22+ |
| Build type | **Release** (FORCED — Debug too slow for RT audio) |
| Compiler flags | `-O3 -march=native`, **no** `-ffast-math` by default |
| Audio backend | PipeWire via JACK protocol |
| Primary interface | Edirol UA-1000 (USB), Hotone Jogg |

### Port Assignments

| Port | Service |
|---|---|
| **3000** | Frontend production server (`vite preview`) |
| **8080** | Backend API (`uvicorn`) |

---

## Build & Test Commands

### Frontend

```bash
# Production build
cd web && npm run build

# Type check only (no build)
cd web && npm run typecheck
# or: cd web && npx tsc --noEmit

# Run tests
cd web && npx jest --testPathPattern=<FileName> --no-coverage
cd web && npm run test -- --runInBand

# Lint
cd web && npm run lint

# Preview production build (port 3000)
cd web && npm run preview

# Full deploy (build + restart)
cd web && npm run deploy
```

### Backend

```bash
# Start FastAPI
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080

# Run Python tests
pytest tests/
pytest tests/test_<name>.py -q
```

### JUCE Engine

```bash
# Standard build
cd juce-engine && cmake -B build && cmake --build build

# With AVDECC support
cd juce-engine && cmake -B build -DUSE_AVDECC=ON && cmake --build build

# Build with AVB
cd juce-engine && cmake -B build -DUSE_AVB=ON && cmake --build build
```

### Build Verification

```bash
# Verify build output
ls -lh web/dist/index.html

# Confirm a component made it into the bundle
grep -c 'searchTerm' web/dist/assets/PageName-*.js

# Verify an import actually exists
grep -rn 'import.*ComponentName' web/src/
```

---

## Global Work List

All planned and in-progress work is tracked in:
**[docs/PROJECT_WORKLIST.md](docs/PROJECT_WORKLIST.md)**

- Every task added during a session must be appended under a named Epic section
- Task ID format: `T###` — increment from the last ID in the file
- Status markers: `[ ]` todo · `[>]` in progress · `[✓]` done · `[✗]` blocked · `[~]` cancelled
- Always date-stamp completions and add completion notes (what was done, files changed)
- MIDI Hub v2 rollout is tracked under `T203-subA` through `T203-subK`
- For "Status" requests: report from `docs/PROJECT_WORKLIST.md` first, then add git context

---

## Key File Locations

| What | Where |
|---|---|
| C++ engine source | `juce-engine/Source/` |
| Buffer size constant | `juce-engine/Source/Common.h` — `DEFAULT_BUFFER_SIZE=64` |
| Python config | `app/config.py` |
| Systemd unit (repo copy) | `systemd/map2-backend.service` |
| Systemd drop-ins | `/etc/systemd/system/map2-backend.service.d/` |
| PipeWire config | `~/.config/pipewire/pipewire.conf.d/99-map2-audio-latency.conf` |
| GRUB config | `/etc/default/grub` — run `grub2-mkconfig -o /boot/grub2/grub.cfg` after editing |
| Web frontend root | `web/src/` |
| Web pages | `web/src/app/pages/` |
| Web components | `web/src/app/components/` |
| API layer | `web/src/map2/api.ts` |
| Advanced menu items | `web/src/app/data/advancedMenuItems.ts` |
| MIDI Hub v2 shell | `web/src/app/pages/MidiHubShell.tsx` |
| MIDI Hub v2 area pages | `web/src/app/pages/midi-hub/MidiHub*Page.tsx` |
| MIDI Hub nav store | `web/src/app/stores/midiHubNavStore.ts` |
| MIDI Hub status bar | `web/src/app/components/MidiHub/MidiHubStatusBar.tsx` |
| Event list service | `app/services/midi_hub/event_list_service.py` |
| Tesira TTP client | `app/services/midi_hub/tesira_client.py` |
| Virtual GPIO service | `app/services/midi_hub/virtual_gpio.py` |
| String interface | `app/services/midi_hub/string_interface.py` |
| OSC namespace router | `app/services/midi_hub/osc_namespace.py` |
| OSC namespace docs | `docs/midi/MAP2_OSC_NAMESPACE.md` |
| MIDI Hub architecture doc | `docs/midi/MIDI_HUB_ARCHITECTURE.md` |
| Tesira integration docs | `docs/midi/TESIRA_TTP_INTEGRATION.md` |
| Carbon conformance standard | `docs/design/CARBON_CONFORMANCE_STANDARD.md` |
| Carbon review checklist | `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md` |
| API contract standards | `docs/api-contract-standards.md` |
| Global work list | `docs/PROJECT_WORKLIST.md` |

### Dead Code Warning

`JuceAudioGraphViz.tsx` is **never imported** — editing it has no effect on the build.
Always verify before editing: `grep -rn 'import.*ComponentName' web/src/app/`

---

## 5-Question Clarification Protocol

Before acting on any directive that involves code changes or architectural decisions, **ask exactly 5 multiple-choice questions** to disambiguate intent, scope, constraints, and edge cases.

### Rules

1. **Trigger**: Fires on any directive involving code changes or architectural decisions. Does not fire on trivial one-liners (e.g. "fix this typo", "rename this variable").

2. **Delivery**: Questions are asked **one at a time, sequentially**. After each answer, give a **one-word acknowledgement** ("Got it." or "Noted.") on its own line, then immediately ask the next question.

3. **Question content**: Choose all 4 substantive questions freely — pick the dimensions most relevant to this specific directive (scope, approach, risk, constraints, edge cases, etc.). No fixed order for Q1–Q4.

4. **Q5 is always the continue question**, rephrased each round to naturally reflect what has been established so far. Options are always:
   - A) Yes — I have more nuance to share
   - B) No — proceed with my answers

5. **Skipping**: If the user says "just do it" or similar, ask Q5 only: *"Should I skip the 5-question protocol this time? A) Yes — skip it  B) No — run the protocol."* The user's answer is final.

6. **New directives inside answers**: If a user's answer introduces a new directive, flag it silently, finish the current cycle, then surface it at the end: *"I also noticed a new directive — shall we start a cycle for that?"* Do not interrupt mid-cycle.

7. **Recursion**: A new directive flagged at the end triggers its own fresh 5-question cycle if the user agrees.

8. **Depth**: No cap on consecutive "Yes" answers to Q5. The user controls depth entirely.

### Skeleton

```
Q1: [Most critical ambiguity for this directive]
   A) ...  B) ...  C) ...  D) ...

[User answers]

Got it.
Q2: [Next most relevant dimension]
   A) ...  B) ...  C) ...  D) ...

[User answers]

Noted.
Q3: [Next dimension]  ...
Q4: [Final substantive dimension]  ...

Noted.
Q5: [Rephrased to reflect coverage — e.g. "We've established scope, approach, and constraints. Should I ask 5 more questions?"]
   A) Yes — I have more nuance to share
   B) No — proceed with my answers
```

---

## Plan-First Meta Rule

**ALWAYS PLAN BEFORE IMPLEMENTING.**

1. **Read first** — check Essential Files, search for existing patterns
2. **Plan second** — create todo breakdown, identify dependencies
3. **Verify third** — confirm file is imported, bundle will include the change
4. **Execute fourth** — implement in logical order, build after major changes
5. **Test fifth** — `typecheck` + `jest` + verify in production mode

Never assume:
- Server down = pages broken
- Build failed = server needs restart
- New code not showing = cache issue

**ALWAYS check the full diagnostic stack** (build → server → response → browser) before taking action.

---

## Critical System Rules

### Tier A Locked Settings (NEVER change at runtime via API)

| Setting | Locked Value |
|---|---|
| `audio.sample_rate` | 48000 Hz |
| `audio.buffer_size` | 64 samples |
| `audio.backend` | "pipewire" |

To change these: edit systemd service → `sudo systemctl restart map2-backend` → verify with `python3 test_tier_a_locks.py` (output must show `✅ All critical performance settings are LOCKED`).

### AVB Buffer Size is NOT the Audio Buffer

`Map2AudioEngine.cpp:699 stream.config.bufferSize = 256` is inside `createAvbStreamForTest()`.
This is the AVB **AVTP network packet size** — 256 samples per packet is standard IEEE 1722.
The main audio callback buffer is controlled by `DEFAULT_BUFFER_SIZE=64` in `Common.h`.
**Do not change the AVB buffer size trying to fix audio latency.**

### Systemd Drop-In Architecture

- Base unit: `/etc/systemd/system/map2-backend.service` — synced from repo
- `10-mode.conf` (installed by `map2-mode.sh`): ALL-IN-ONE mode overrides
- `override.conf` (user edit): re-asserts `PIPEWIRE_LATENCY=64`, `force-quantum=64`, `CPUAffinity=4 5`
- `ExecStartPre` is **additive** across drop-ins — drop-in exec commands run AFTER base unit
- `CPUAffinity` is **last-write-wins** — `override.conf` wins over `10-mode.conf`

### RT/PipeWire Configuration

- Quantum: 64 samples / 48000 Hz = 1.33 ms/period
- Set by `ExecStartPre pw-metadata force-rate 48000` THEN `force-quantum 64` (rate first, always)
- **Do NOT** set `force-quantum` in `pipewire.conf.d` — it blocks runtime overrides
- GRUB changes (`isolcpus`, C-states, `preempt=full`) **REQUIRE REBOOT** to take effect
- Current state (until reboot): running `isolcpus=2,3` (old), audio still on non-isolated cores

### "Done" Means Clean Build

Before marking any task complete:
- `cd web && npm run typecheck` must pass
- `cd web && npm run build` must pass (for web changes)
- `pytest tests/` must pass (for backend changes)
- No known compile/type errors in touched subsystems — **ever**.

---

## Frontend Conventions

### Carbon Design System (Mandatory)

- **UI source of truth**: `docs/design/CARBON_CONFORMANCE_STANDARD.md`
- **Review checklist**: `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`
- Carbon guidance wins over any legacy styling guidance — no exceptions
- Use `@carbon/react` components and Carbon tokens/themes for all new and refactored UI
- Non-conforming exceptions must be documented in worklist completion notes with follow-up task IDs
- MUI and Phosphor Icons are **legacy only** — do not expand their usage

### Page Design Standards

- **No coaching/wizard/tutorial UI** — pages must be clean operator surfaces
- **No `InlineNotification` banners** for explanatory text — only for real operational warnings
- **No decorative copy** in panel headers — title + status Tags is sufficient
- **No multi-sentence summary paragraphs** on panels — use a `shortLabel` one-liner Tag instead
- Panels use a `Layer` wrapper with an `id` anchor for scroll targeting
- Live status is shown via Carbon `Tag` components with appropriate tone (green = healthy, warm-gray = idle/inactive)
- All polling queries use `refetchInterval` — no manual refresh buttons unless explicitly requested
- localStorage is used sparingly: only persist state that survives intentional page reloads (e.g. `activeTab`)

### Component Conventions

```typescript
// Import order:
// 1. React core
// 2. Third-party (tanstack, carbon, etc.)
// 3. Internal hooks
// 4. Internal components
// 5. Types/interfaces

// Constants at top of file — UPPER_SNAKE_CASE
const SLOT_COLORS = { A: '#00d9ff', B: '#ff006e' }

// Component structure order:
// 1. Hooks (state → query → mutations → effects)
// 2. Derived values with useMemo
// 3. Event handlers with useCallback
// 4. Render
```

### State Management

- **Server state**: TanStack Query — `staleTime: 0` for real-time data, `refetchInterval` for polling
- **UI state**: `useState` for local, Zustand for global
- **Form state**: React Hook Form
- **Navigation/session state**: localStorage (minimal — `activeTab` pattern)

### Testing Standards

- Test files live next to the component: `ComponentName.test.tsx`
- Mock all child panel components — test the page shell, not panel internals
- Required coverage for every page:
  1. Renders without crash
  2. API data reflected in UI (status tags, counts)
  3. Tab/nav switching works for all tabs
  4. Mutations fire on user action
- Run: `cd web && npx jest --testPathPattern=<FileName> --no-coverage`

---

## Style & Architecture Rules

### File Organization

- Barrel exports: `web/src/map2/index.ts` — export only what is used
- Custom plugin cards: `web/src/app/components/PluginCards/Custom/`
- Page components: `web/src/app/pages/`
- Shared hooks: `web/src/app/hooks/`
- Naming: React components `PascalCase`, hooks `camelCase` with `use` prefix, utils `camelCase`, constants `UPPER_SNAKE_CASE`

### React Performance Patterns

```typescript
// ALWAYS memoize expensive computations
const expensiveValue = useMemo(() => complexCalc(data), [data])

// ALWAYS memoize callbacks passed to children
const handleChange = useCallback((v) => setState(v), [setState])

// AVOID inline functions in render-heavy components
// ❌ <Component onClick={() => doSomething()} />
// ✅ <Component onClick={handleClick} />
```

**4. Snapshot-First Performance State**
- For `JUCE-GRID` and similar Carbon performance editors, do not maintain parallel `scene` and `snapshot` concepts when both represent recallable rig state.
- Use the snapshot system as the canonical data/model/UI surface, and fold scene-style behaviors into it instead of creating a second library, tab, or persistence path.
- If product language still needs the word `scene`, treat it as a presentation alias or snapshot mode within the snapshot workflow, not a separate state store.
- Keep operator-facing recall/compare/live-routing workflows unified so routing, chain state, and active rig context are inspected from one Carbon surface.

**5. JUCE-GRID Plugin Modal Pattern**
- For `JUCE-GRID` plugin/effect cards opened as modals, size the modal to the underlying window footprint at the moment it opens instead of hugging card content.
- Do not add extra modal header chrome above the card itself: no injected label/title/meta row and no extra close button when the card content is already the editing surface.
- Treat the plugin card as the canonical editor surface so modal wrappers stay visually neutral and consistent across all card types.

### Python Backend Patterns

```python
# Route pattern
router = APIRouter(prefix="/api/resource", tags=["Resource"])

@router.get("/")
async def get_resources(session: Session = Depends(get_session)):
    service = ResourceService(session)
    return await service.get_all()

# CRITICAL: Never manually commit in service methods
# Let the route's get_session context manager handle it
```

### Lilv / Python 3.14

```python
# Use explicit None checks — lilv nodes don't support __bool__ in Python 3.14
# ❌ if lilv_node:
# ✅ if lilv_node is not None:
```

### Node Display Standard — Unified Pill Directive

> **Established**: 2026-03-18 — All node identity, status, and scope UI is consolidated into the **NodeNavChip pill** in the global nav bar. No other node-identity UI is permitted on any page.

#### Canonical Component

The **sole** node-identity UI element is `NodeNavChip` rendered by `NodeNavBar` in the global nav bar (top-right, justified right). Each discovered node gets one pill. Local node sorts first, then peers alphabetically.

**Pill anatomy** (all three elements required):
1. **Status dot** — colored by `node.status` (`ok` = green, `warn` = amber, `critical`/`offline` = red)
2. **Hostname** — truncated via `truncateNodeHostname()`, full name in tooltip
3. **Health %** — numeric health score suffix (e.g., "96%")

**Pill accent** — left border colored by presence:
- Blue (`#0f62fe`) = LOCAL (the engine this browser is connected to)
- Green (`#198038`) = VIEW (the node currently scoped for this page)
- Gray (`#8d8d8d`) = PEER (discovered but not viewed)

**Presence tag** — Carbon `Tag` inside the pill: `LOCAL` / `VIEW` / `PEER`

#### Popover Interaction

Clicking a pill opens a `Popover` with `NodeMiniCard`. The popover contains:
- Node display name + hostname subtitle
- Role label (Audio Node / Management Node / All-In-One)
- Status tag (OK / WARN / CRITICAL / OFFLINE)
- **"Set as page node"** button — calls `viewedNodeStore.setViewedNode(pageKey, nodeId)`
- **"View details"** link — navigates to Platform single-node view, setting both page and platform viewed node
- **Alert rows** (folded from removed `NodeAlertBar`) — if the node has health alerts, show dismissible alert rows below actions with severity tag. Alert state lives in `nodeAlertStore` (in-memory only)
- **View context** — when viewing a remote node, show "Remote live view" subtitle; when local, show "Local studio view"

#### Removed Components

These components are **deprecated and must not be used** on any page:
- `NodeContextBanner` — host/scope card (replaced by pill accent colors + popover context line)
- `NodeContextPicker` — dropdown selector (replaced by pill popover "Set as page node")
- `NodeAlertBar` / `NodeAlertToast` — alert notifications (folded into pill: amber/red dot pulse + popover alert rows)
- Per-page "Viewing node:" text — removed (pill VIEW accent + presence tag communicates this)

If any page currently renders these components, they must be removed and replaced with the pill-only pattern.

#### Feature Migration Map

| Removed Feature | Source | Pill Equivalent |
|---|---|---|
| Host vs. Scope distinction | `NodeContextBanner` | Pill accent: blue = host, green = viewed scope |
| Node switching | `NodeContextPicker` | Popover "Set as page node" button |
| Health alerts (count + severity) | `NodeAlertBar` | Amber/red pulse on status dot; alert rows in popover |
| Alert dismiss | `NodeAlertBar` | Dismissible alert rows in popover |
| Role display | `NodeContextBanner` | Subtitle in popover |
| "Local/Remote view" label | `NodeContextBanner` | Context line in popover |
| Network stats (X/Y online) | AVB `NodeSelector` | Optional `/N` suffix or popover footer |

#### Source Files

- Pill component: `web/src/app/components/NodeNav/NodeNavChip.tsx`
- Nav bar container: `web/src/app/components/NodeNav/NodeNavBar.tsx`
- Popover card: `web/src/app/components/NodeNav/NodeMiniCard.tsx`
- Pill styles: `web/src/app/components/NodeNav/NodeNavChip.css`
- Node types: `web/src/app/types/node.ts`
- Display utilities: `web/src/app/utils/nodeDisplay.ts`
- Topology hook: `web/src/app/hooks/useNodeTopology.ts`
- Page context hook: `web/src/app/hooks/useNodePageContext.ts`
- Viewed-node store: `web/src/app/stores/viewedNodeStore.ts` (persists to localStorage `map2_viewed_nodes`)
- Alert store: `web/src/app/stores/nodeAlertStore.ts` (in-memory only)

#### Backend Contracts

- `app/routes/nodes.py` — node API routes
- `app/services/node_discovery_service.py` — discovery
- `app/services/node_health_service.py` — health metrics
- Frontend must never call remote node IPs directly; use either:
  - `node_id` query scoping on existing APIs for middleware-proxied routes
  - `GET/POST/PATCH /api/node/{node_id}/proxy/{path}` for explicit per-node proxying
- `HomePage` remote node scope uses the explicit `/api/node/{node_id}/proxy/...` path because `ClusterProxyMiddleware` excludes `/api/cluster/*`
- `MidiHubPage` child panels inherit page scope through `MidiHubNodeScopeProvider`; queries must include the scope key in React Query cache keys to avoid local/remote collisions

#### Rules

1. **No node identity UI outside the global nav bar** — pages must not render their own node selectors, banners, or status badges
2. **All node switching goes through the pill popover** — `viewedNodeStore.setViewedNode()` is the sole mechanism
3. **Health alerts surface through the pill** — status dot color/animation is the primary indicator; details in popover
4. **Pill is always visible** — it lives in the global nav bar, not inside any page layout
5. **New node features go into the pill or its popover** — do not create parallel node UI surfaces

---

## API Contract Standards

(Full spec: `docs/api-contract-standards.md`)

- **Operation IDs** must be unique across the full OpenAPI document — generated centrally, not hand-rolled
- **Error envelope** — all operations use the same shape:
  ```json
  { "error": { "code": "internal_error", "message": "...", "details": null } }
  ```
- **Versioning** — new external-facing contracts use `/api/v1/...` or `/api/v2/...`; unversioned expansion stops for integrator-facing features
- **Breaking changes** create a new versioned surface — never silently mutate existing ones

---

## Server Management Patterns

```bash
# Kill old server before starting new one
kill -9 $(pgrep -f "vite preview")
kill -9 $(pgrep -f "uvicorn app.main")

# Start frontend (production only — no dev server)
cd web && nohup npm run preview > /tmp/vite.log 2>&1 &

# Start backend
cd /home/mm/map2-audio && nohup python3 -m uvicorn app.main:app \
  --host 0.0.0.0 --port 8080 > /tmp/backend.log 2>&1 &
```

**NEVER use `sleep` in automated scripts** — it causes `^C` interrupts that kill builds mid-run.
**ONLY use `vite preview`** for the frontend — port 3000 is the sole supported web entry point.

### Diagnostic Stack (Bottom to Top)

```bash
ls -lh web/dist/index.html          # Layer 1: build files exist?
ps aux | grep "vite preview"         # Layer 2: server running?
curl -s -I http://localhost:3000/    # Layer 3: server responding?
curl -s http://localhost:3000/ | grep 'index-' # Layer 4: correct files?
```

---

## Performance & Latency

### Latency Targets

| Use Case | Target | Critical? |
|---|---|---|
| Live guitar performance | < 5 ms | Yes — drummer sync |
| Studio recording | < 10 ms | Less critical |
| Band performance | < 6 ms | Yes — bass/drum sync |

### Known Gaps (as of 2026-03-14)

- ❌ Worst-case jitter not measured (must be < 200 µs)
- ❌ Xrun rate not tested (must be 0 in 8-hour session)
- ❌ CPU headroom not benchmarked (must be > 30% free)
- ❌ Loopback latency measurement never performed
- ⚠️ Reboot required to activate `isolcpus=4,5` GRUB changes (currently `isolcpus=2,3`)

### RT Safety Status

- ✅ Metering: RT-safe lock-free ring buffer
- ✅ `setBufferSize()`: stops audio before reallocation
- ✅ `setSampleRate()`: stops audio before reconfiguration
- ✅ `audioCallback`: pre-allocated buffers, no heap allocations
- ⚠️ Still verify: plugin processors and convolution IRs for RT allocations

---

## Gotchas & Learned Fixes

### [CRITICAL] JUCE Plugin Lifecycle Crashes — Feb 25, 2026

- **Problem**: `load_plugin()`/start-audio soak runs could segfault under graph rewires and multi-instance callback load
- **Root Cause**: Transient descriptor memory in load path + out-of-range delay-line index under edge-wrapped read-position math
- **Fix**: Stabilize plugin descriptions before instance creation; add bounds/wrap guards in IntelliFX delay-line read path; add subprocess regression tests
- **Verification**: `pytest -q tests/test_juce_engine_plugin_load_lifecycle_stability.py tests/test_juce_engine_intellifx_lifecycle_stability.py`
- **Lesson**: Plugin-host stability is layered — descriptor lifetime, topology invariants, DSP index safety, and soak-orchestrator churn policy must all be addressed together

### [CRITICAL] Never Handoff with Known Build/Type Errors — Feb 25, 2026

- **Problem**: Partial delivery with compile/type errors leaves the branch non-deployable
- **Fix**: Before any handoff, run `npm run typecheck` and `npm run build` (web) or `pytest` (backend); fix all errors
- **Lesson**: "Done" means no known compile/type errors in touched subsystems

### [CRITICAL] Debug Build Causes RT Audio Stuttering

- **Problem**: Real-time audio stuttering, high CPU under debug build
- **Root Cause**: `-O0` debug build is too slow for RT audio
- **Fix**: Force Release mode in `CMakeLists.txt` — always `CMAKE_BUILD_TYPE=Release`

### [HIGH] Vite Manual Chunks Break Dependency Order

- **Problem**: `manualChunks` broke dependency order — React loaded after recharts
- **Error**: `Cannot read properties of undefined (reading 'forwardRef')`
- **Fix**: Set `manualChunks: undefined` in `vite.config.ts`
- **Lesson**: Let Vite handle dependency ordering automatically

### [HIGH] Bundle Hash Not Changing = Dead Code

- **Problem**: Editing a file doesn't change the build output hash
- **Diagnosis**: File is dead code — not imported anywhere
- **Fix**: Verify imports first: `grep -rn 'import.*ComponentName' web/src/`
- **Example**: `JuceAudioGraphViz.tsx` is never imported

### [HIGH] Port Conflict on Server Restart

- **Problem**: `ERROR: [Errno 98] address already in use`
- **Fix**: `kill -9 $(pgrep -f "vite preview")` before starting new server

### [HIGH] Canonical Work List is `docs/PROJECT_WORKLIST.md`

- **Problem**: Using a second task tracker causes status drift and split ownership
- **Fix**: Always update `docs/PROJECT_WORKLIST.md` — it is the single canonical worklist
- **For "Status" requests**: report from worklist first, then add git working-tree context

### [HIGH] MIDI Device Selection Requires ALSA Subscriptions — Feb 12, 2026

- **Files**: `juce-engine/Source/MidiHandler.cpp:190-410`, `MidiHandler.h:321-327`
- **Problem**: `openInputDevice()` stored device name but didn't actually connect
- **Fix**: Explicit `snd_seq_subscribe_port()` calls with sender/dest addresses matching `"ClientName:PortName"` format
- **Lesson**: ALSA device selection is explicit, not implicit — device names must match exactly

### [HIGH] Parallel Scene + Snapshot UX Causes Operator Confusion

- **Problem**: Exposing both "scene" and "snapshot" as separate features for the same recallable state confuses operators
- **Fix**: In JUCE-GRID, merge scene-style recall into the snapshot system — one canonical persistence surface
- **Lesson**: When the saved state is the same object, use one Carbon workflow with one source of truth

### [HIGH] AVB Install Defaults Drift

- **Problem**: AVB docs said "disabled by default" while installer/build defaults expected AVB first-class
- **Fix**: Installer runs AVB setup by default; `USE_AVB` default is `ON`; docs updated in the same change
- **Lesson**: When changing default behavior, update installer + build defaults + docs atomically

### [HIGH] H3000 Glide=0 Callback Crash — Feb 24, 2026

- **Files**: `juce-engine/Source/H3000Processor.cpp`
- **Problem**: Engine could segfault in callback thread during H3000 processing when `glide=0`
- **Root Cause**: Invalid coefficient math under `-ffast-math` with `glide=0`
- **Fix**: Fast-math-safe glide coefficient guardrails and pitch/delay bounds in H3000 path
- **Lesson**: In Release builds with `-ffast-math`, guard DSP math with deterministic bounds — NaN/Inf-dependent safety logic is not reliable

### [HIGH] Advanced Nav Promotion Must Be Persisted/Raft-Synced — Feb 27, 2026

- **Files**: `app/database.py`, `app/routes/special_settings.py`, `web/src/app/hooks/useSpecialSettings.tsx`
- **Problem**: Top-nav promotion choices could drift/reset if only stored in UI state
- **Fix**: Persist `promoted_advanced_routes` in Special Settings (DB + API + Raft sync); normalize route lists (dedupe + slash-only paths)
- **Lesson**: Navigation personalization affecting multi-node operator UX is replicated configuration state, not transient UI state

### [HIGH] MPX1 Inbound SysEx Uses Multiple Header/Frame Classes — Feb 27, 2026

- **Files**: `app/services/mpx1_service.py`
- **Problem**: Inbound frames classified as `rx_sysex_unknown` blocking physical-control validation
- **Root Cause**: Decoder only accepted one fixed header; MPX hardware emits both short param frames and long state/report SysEx classes
- **Fix**: Accept Lexicon device-id/function header variants; add long-frame decoders for `01 02` (program status) and `01 01` (panel status)

### [MEDIUM] SQLAlchemy Stale Data After Commit

- **Problem**: `DetachedInstanceError` or stale data after commit
- **Root Cause**: `expire_on_commit=True` (default) expires objects
- **Fix**: Access all needed attributes before commit, or use `expire_on_commit=False`

### [MEDIUM] WebSocket Cleanup Kills Shared Connections

- **Problem**: Multiple WebSocket connections created on re-render
- **Fix**: Check if connection is used elsewhere before disconnecting in `useEffect` cleanup

### [MEDIUM] React Query Real-Time Data Not Updating

- **Problem**: Metering data not updating
- **Fix**: `staleTime: 0` for real-time metrics: `staleTime: 0, // Always fresh for metering`

### [MEDIUM] Sleep Commands Kill Builds

- **Problem**: `sleep 5 && curl` blocks terminal, causes `^C` interrupts killing builds mid-run
- **Fix**: Use `nohup ... &` + poll logs with `grep`/`tail` — NEVER use `sleep` in CI or automated scripts

### [MEDIUM] Vite Preview on localhost Does Not Proxy `/api`

- **Problem**: `vite preview` on `localhost` or `127.0.0.1` leaves pages stuck loading for live API data because `web/src/map2/api.ts` resolves `API_BASE` to relative `/api`
- **Fix**: For real preview smoke with live data, use a same-origin reverse proxy or access preview from a non-localhost hostname/IP that resolves API calls to `http://<host>:8080/api`
- **Lesson**: A successful `vite preview` page mount does not prove API hydration on localhost; smoke evidence must distinguish shell render from live backend data

### [MEDIUM] Python 3.14 asyncio

- Use `asyncio.run()` not `asyncio.get_event_loop()` in Python 3.14+

### [LOW] no-dep useLayoutEffect Infinite Loop

- **Problem**: `useLayoutEffect` with no deps calling `setState` causes infinite render loop
- **Fix**: Use functional updater `setState(prev => sameRef ? prev : newVal)` to break the cycle
- **Example**: `web/src/app/components/MPX1/MPX1FlowCanvas.tsx`

---

## Common Pitfalls to Avoid

- **Don't** add coaching, wizards, tutorials, or explanatory `InlineNotification` banners to pages
- **Don't** expand MUI or Phosphor Icons usage — Carbon only for new work
- **Don't** use `manualChunks` in Vite config
- **Don't** use any alternate frontend serving mode — `vite preview` on port 3000 is the supported path
- **Don't** use `sleep` in scripts
- **Don't** commit with known TypeScript or build errors
- **Don't** manually commit in SQLAlchemy service methods
- **Don't** assume a component is live without verifying it is imported
- **Don't** change `DEFAULT_BUFFER_SIZE` in `Common.h` to fix AVTP/AVB packet size issues
- **Don't** set `force-quantum` in `pipewire.conf.d` — it blocks runtime overrides
- **Don't** allow multiple MIDI clock masters in the same rig
- **Don't** use `asyncio.get_event_loop()` — use `asyncio.run()` in Python 3.14+
- **Don't** create a second task tracker — `docs/PROJECT_WORKLIST.md` is canonical

---

## Planner-Only Mode

When activated with the directive **"planner mode"**, Claude operates as an **orchestrator and planner**, not an executor. The following rules override default behavior:

### Core Behavioral Rules

1. **Never write code directly.** All implementation must be delegated to background agents via the Agent tool.
2. **Never edit files directly.** Use Edit/Write only for plan documents, worklist updates, and CLAUDE.md. All source code changes go through agents.
3. **Plan first, always.** Before any implementation:
   - Read all relevant files
   - Identify dependencies and ordering constraints
   - Write a step-by-step plan with file paths and change descriptions
   - Get user confirmation before launching agents
4. **Delegate in parallel where possible.** Launch independent agents simultaneously. Never serialize work that can be parallelized.
5. **Track progress explicitly.** Use TodoWrite to maintain a live task list. Mark tasks complete only when the agent reports success AND the result is verified.
6. **Verify agent output.** After each agent completes:
   - Read the modified files to confirm correctness
   - Run relevant checks (`typecheck`, `build`, `test`)
   - Report discrepancies to the user before proceeding
7. **Never retry silently.** If an agent fails, report the failure and proposed fix to the user. Do not re-launch without acknowledgment.
8. **Preserve context.** Summarize agent results concisely so the user maintains full situational awareness without reading raw output.

### What Planner Mode Does NOT Change

- All existing CLAUDE.md rules still apply (Carbon compliance, build verification, git workflow, etc.)
- The user can override any planner-mode rule with an explicit instruction
- Planner mode is per-conversation — it does not persist across sessions unless the user says otherwise

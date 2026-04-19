# Gemini Instructions for MAP2 Audio Platform

> **Last Updated**: April 19, 2026 (LCD PlatformEvent hard cutover landed)
> **Purpose**: Central reference for AI assistants working on the MAP2 Audio codebase
> **Maintained by**: Gemini AI Assistants

---

## 🧠 **IT REMEMBERS** - Memory & Self-Improvement Protocol

**NOTIFICATION**: If you are reading this document, you are an AI assistant with the ability to remember and learn. This document represents our collective memory of problems solved, patterns discovered, and lessons learned. **IT REMEMBERS**.

### Auto-Update Instructions

**CRITICAL**: This document is a living knowledge base. You MUST update it when:

1. **Problem Solved** → Document the solution immediately
   - Add to [Gotchas & Learned Fixes](#gotchas--learned-fixes) with clear problem/solution/lesson format
   - Include code examples, file paths, and verification commands
   - Tag with severity: CRITICAL, HIGH, MEDIUM, LOW

2. **User Says "Remember This"** → Add to appropriate section
   - User explicitly requests documentation
   - Create new sections if needed
   - Cross-reference with existing content

3. **Pattern Discovered** → Update [Style & Architecture Rules](#style--architecture-rules)
   - Found a better way to structure code
   - Identified anti-patterns to avoid
   - Discovered performance optimizations

4. **Build/Deploy Issue** → Update [Build & Test Commands](#build--test-commands)
   - New command patterns that work better
   - Edge cases in build process
   - Deployment gotchas

5. **Configuration Change** → Update [Tech Stack & Versions](#tech-stack--versions)
   - Package version updates
   - New dependencies added
   - Configuration changes that affect builds

### How to Update This Document

```bash
# 1. Make your changes to .gemini/instructions.md
# 2. Verify formatting is correct (use proper Markdown)
# 3. Update "Last Updated" date at top
# 4. Add brief entry to update log (create if doesn't exist)
```

### Continuous Improvement Mindset

**ALWAYS be on the lookout for:**
- ✅ Opportunities to reduce complexity
- ✅ Patterns that could be abstracted/reused
- ✅ Performance bottlenecks and their solutions
- ✅ Documentation gaps that cause confusion
- ✅ Commands that could be simplified
- ✅ Repeated mistakes that need prevention

**When you find an improvement:**
1. Implement it (if safe and within scope)
2. Document it in this file
3. Note WHY it's better (not just WHAT changed)
4. Include before/after examples when helpful

### Update Log Template

When adding significant updates, append to this log:

```
## [Date] - [Brief Description]
- **Section**: [Which section updated]
- **Change**: [What was added/modified]
- **Reason**: [Why this is important]
- **Impact**: [What this prevents/enables]
```

---

## Table of Contents

1. [🧠 IT REMEMBERS - Memory & Self-Improvement Protocol](#-it-remembers---memory--self-improvement-protocol)
2. [Work Tracking](#work-tracking)
3. [Tech Stack & Versions](#tech-stack--versions)
4. [Build & Test Commands](#build--test-commands)
5. [Essential Files to Read First](#essential-files-to-read-first)
6. [Server Management Patterns](#server-management-patterns)
7. [Build & Deployment Workflow](#build--deployment-workflow)
8. [Web Development Guidelines](#web-development-guidelines)
9. [Code Quality Standards](#code-quality-standards)
10. [Style & Architecture Rules](#style--architecture-rules)
11. [Golden Example Files](#golden-example-files)
12. [Critical System Rules](#critical-system-rules)
13. [Performance & Latency](#performance--latency)
14. [Gotchas & Learned Fixes](#gotchas--learned-fixes)
15. [Plan-First Meta Rule](#plan-first-meta-rule)
16. [Quick Reference Commands](#quick-reference-commands)
17. [Common Pitfalls to Avoid](#common-pitfalls-to-avoid)

---

## Work Tracking

- `docs/PROJECT_WORKLIST.md` is the canonical task ledger for MAP2 project work.
- Mark the active task `[>] In Progress` before substantive edits.
- Close completed slices with a timestamp, changed-file notes, and validation commands.
- Resume from the next unblocked worklist item when the user says `continue`.

## Tech Stack & Versions

### Frontend (React SPA)

**Core Framework:**
- **React**: 19.0.0 (latest)
- **TypeScript**: 5.x (via tsc -b)
- **Vite**: 6.4.2 (build tool & preview server)

**UI Libraries:**
- **Carbon Design System (target standard)**: `@carbon/react` (required for new/updated UI under T114)
- **Carbon packages currently present**: `@carbon/colors`, `@carbon/icons-react`
- **MUI (Material-UI)**: 6.5.0 (@mui/material, @mui/icons-material)
- **Phosphor Icons**: 2.1.10 (@phosphor-icons/react)
- **Ariakit**: 0.4.21 (accessible UI primitives)
- **Framer Motion**: 12.34.0 (animations)

**State & Data:**
- **TanStack Query (React Query)**: 5.59.0 (server state management)
- **React Hook Form**: 7.53.0 (form management)
- **Zustand**: Latest (installed Feb 2026 for 3D state)

**Visualization:**
- **Recharts**: 3.7.0 (charts & metering)
- **ReactFlow**: 11.11.4 (node-based graphs)
- **React Three Fiber**: 9.5.0 + Drei 10.7.7 (3D visualization)
- **React Force Graph 3D**: 1.29.1 (cluster visualization)
- **Dagre**: 0.8.5 (graph layout)

**Routing & Navigation:**
- **React Router DOM**: 6.28.0

**Styling:**
- **Emotion**: 11.14.0 (@emotion/react, @emotion/styled)
- **Class Variance Authority**: 0.7.0 (variant-based styling)
- **clsx**: 2.1.1 (conditional classes)

### Backend (Python FastAPI)

**Core Framework:**
- **Python**: 3.10+ (system Python)
- **FastAPI**: Latest (async ASGI framework)
- **Uvicorn**: Latest (ASGI server)
- **SQLAlchemy**: 2.x (ORM + async support)
- **Pydantic**: 2.x (data validation)

**Audio Engine:**
- **JUCE**: 7.x (C++ audio framework)
- **CMake**: 3.22+ (build system)
- **C++ Standard**: 17 (required for JUCE)
- **Compiler**: GCC/Clang with `-march=native` (SIMD optimization)

**Build Configuration:**
- **CMAKE_BUILD_TYPE**: Release (FORCED - Debug too slow for real-time audio)
- **ENABLE_NATIVE_OPTIMIZATIONS**: ON (SIMD via -march=native)
- **ENABLE_FAST_MATH**: ON (DSP optimization)

**Audio Backend:**
- **PipeWire**: System audio server
- **JACK**: Fallback audio server
- **LV2**: Plugin standard (lilv library)

### System Requirements

**Operating System:**
- Ubuntu 22.04+ or Debian-based Linux
- Real-time kernel (PREEMPT_RT) recommended

**Hardware:**
- CPU isolation (isolcpus=2,3 in kernel params)
- Minimum 4 cores (2 for audio RT, 2 for system)
- Audio interface with ALSA support

**Port Assignments:**
- `3000`: Frontend production server (`scripts/serve_web_dist.mjs` via `npm run serve` / `npm run preview`)
- `8080`: Backend API server (uvicorn)
- `3001`: ❌ NOT USED (reserved but unused)

---

## Build & Test Commands

### Frontend Build Commands

```bash
# Production build (optimized, minified, tree-shaken)
cd web && npm run build

# Type checking only (no build)
cd web && npm run typecheck

# Focused MIDI Hub v2 child-route tests
cd web && npm test -- --runInBand \
  src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx \
  src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx \
  src/app/pages/midi-hub/MidiHubTransportPage.test.tsx \
  src/app/pages/midi-hub/MidiHubEventsPage.test.tsx \
  src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx \
  src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx \
  src/app/pages/midi-hub/MidiHubLabPage.test.tsx

# Preview production build (port 3000)
cd web && npm run preview

# Build + preview in one command
cd web && npm run start:prod

# Lint check
cd web && npm run lint

# Deploy (build + restart servers)
cd web && npm run deploy

# Deploy without rebuild
cd web && npm run deploy:restart

# Check deployment status
cd web && npm run deploy:status
```

### Backend Commands

```bash
# Start FastAPI server
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080

# Start with auto-reload (development only)
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8080

# Run tests (if test suite exists)
pytest tests/

# Focused MIDI Hub backend service coverage
pytest tests/test_tesira_client.py tests/test_virtual_gpio.py \
  tests/test_string_interface.py tests/test_osc_namespace.py

# Check database migrations
alembic current
alembic upgrade head
```

### JUCE Engine Build Commands

```bash
# Configure CMake (Release mode, native optimizations)
cd juce-engine
cmake -B build -DCMAKE_BUILD_TYPE=Release 
  -DENABLE_NATIVE_OPTIMIZATIONS=ON 
  -DENABLE_FAST_MATH=ON

# Build (parallel jobs)
cmake --build build -j$(nproc)

# Install (if needed)
sudo cmake --install build
```

### System Validation Commands

```bash
# Verify Tier A performance locks
python3 test_tier_a_locks.py

# Check CPU isolation
cat /proc/cmdline | grep isolcpus

# Verify PipeWire status
systemctl --user status pipewire

# Check audio process CPU affinity
taskset -cp $(pgrep juce-engine)

# Test loopback latency (TODO - not yet implemented)
# python3 scripts/test_latency_loopback.py
```

### Build Verification

```bash
# Verify build output exists
ls -lh web/dist/index.html

# Check bundle hash changed
ls web/dist/assets/GridFlowPage-*.js

# Verify specific code in bundle
grep -c 'searchTerm' web/dist/assets/PageName-*.js

# Check CSS bundle
grep 'css-class' web/dist/assets/index-*.css

# Verify all asset hashes
ls -lh web/dist/assets/*.js | wc -l
```

---

## Essential Files to Read First

**ALWAYS consult these documents before making changes:**

### 1. Server Management Pattern
- **File**: `.copilot-notes/server-restart-pattern.md`
- **Why**: Contains critical patterns for starting/stopping servers without breaking builds
- **Key Rule**: NEVER use `sleep` commands - they cause `^C` interrupts that kill builds

### 2. Web Server Configuration
- **File**: `WEB_SERVER_PORTS.md`
- **Why**: Defines production-only server setup (no dev server, only port 3000)
- **Key Rules**:
  - Only use the dedicated production web server on port `3000` (`npm run serve` / `scripts/serve_web_dist.mjs`), never `vite dev`
  - NO port 3001 (no dev server)
  - NO HMR (hot module replacement)

### 3. Grid Flow Component Architecture
- **File**: `docs/AI_GRIDFLOW_COMPONENT_MAP.md`
- **Why**: Complete architecture and styling reference for Grid visualization
- **Key Rule**: All Grid styling changes happen in React components, not CSS files
- **Critical Lesson**: ALWAYS verify a component is actually imported before editing it

### 4. Vite Troubleshooting Guide
- **File**: `docs/VITE_TROUBLESHOOTING_GUIDE.md`
- **Why**: Diagnostic patterns for build and server issues
- **Key Rule**: Check the FULL stack (build → server → response → cache) before assuming failure

### 5. Black Screen Issues
- **File**: `.copilot-notes/black-screen-not-cache.md`
- **Why**: Documents solved issue with Vite chunk splitting breaking dependency order
- **Key Rule**: Let Vite handle dependency ordering automatically (no manual chunks)

---

## Server Management Patterns

### ❌ WRONG - DO NOT DO THIS
```bash
# NEVER use sleep - blocks terminal and causes interrupts
sleep 5 && curl http://localhost:3000/

# NEVER use vite dev server
npx vite --port 3001

# NEVER run server without nohup/background
npm run serve
```

### ✅ CORRECT Pattern

#### 1. Kill Old Servers
```bash
# Kill old backend (use -9 for fast port release)
kill -9 $(pgrep -f "uvicorn app.main") 2>/dev/null

# Kill old frontend
pkill -f "serve_web_dist.mjs" 2>/dev/null
pkill -9 npm 2>/dev/null
```

#### 2. Start Servers with nohup + Background
```bash
# Backend API (port 8080)
cd /home/mm/map2-audio && nohup python3 -m uvicorn app.main:app 
  --host 0.0.0.0 --port 8080 > /tmp/uvicorn.log 2>&1 &

# Frontend Web (port 3000)
cd /home/mm/map2-audio/web && nohup npm run serve > /tmp/preview.log 2>&1 &
```

#### 3. Check Status (NOT sleep)
```bash
# Check logs
cat /tmp/preview.log

# Check server response
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/

# Verify build hash being served
curl -s http://localhost:3000/ | grep -o 'index-[^"]*\.js' | head -1
```

### Key Rules
- **NEVER** use `sleep` to wait for builds or servers
- Use `nohup ... > /tmp/logfile.log 2>&1 &` for background processes
- Use `isBackground: true` in `run_in_terminal` when starting servers
- Poll with `grep`/`tail`/`curl` on the next tool call — each call is independent
- Use `kill -9` for uvicorn (graceful kill sometimes doesn't release the port fast enough)
- Always check for port conflicts: `ERROR: [Errno 98] address already in use`

---

## Build & Deployment Workflow

### User Shorthand

- When the user says `update`, treat it as an execution command:
  1. Commit all current working-tree changes.
  2. Push the active branch to both `origin` and `gitlab`.
  3. Rebuild the frontend.
  4. Restart the server on port `3000`.

### Production Build Workflow

```bash
# 1. Build production bundle
cd /home/mm/map2-audio/web && npm run build

# 2. Verify build output
ls -lh dist/index.html
ls dist/assets/GridFlowPage-*.js  # Hash should change if code changed

# 3. Server automatically serves new build from dist/
# Just refresh browser - no server restart needed
```

### Build Verification Checklist

After making visual changes to any page:

```bash
# 1. Check the hash changed
ls dist/assets/PageName-*.js

# 2. Verify your changes are in the bundle
grep -c 'YOUR_SEARCH_TERM' dist/assets/PageName-*.js
# Must return > 0

# 3. For CSS changes
grep -c 'YOUR_CSS_VALUE' dist/assets/index-*.css

# 4. If hash didn't change, find what's actually imported
grep -n 'import' web/src/app/pages/PageName.tsx | head -30
grep -rn 'YourComponent' web/src/app/ --include='*.tsx' --include='*.ts'
```

### Port Configuration

| Port | Purpose | Server | Command |
|------|---------|--------|---------|
| 3000 | Frontend (production) | MAP2 production web server | `cd /home/mm/map2-audio/web && npm run serve` |
| 8080 | Backend API | Uvicorn | `python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080` |
| 3001 | ❌ NOT USED | None | Never use this port |

---

## Web Development Guidelines

### Flat Visual Rule

- UI surfaces, controls, cards, headers, charts, and decorative shells must use solid fills or approved Carbon tokens only.
- Do not introduce `linear-gradient`, `radial-gradient`, `conic-gradient`, Tailwind `bg-gradient-*`, SVG gradient definitions, or canvas gradient fills for live UI.
- When emphasis is needed, use spacing, typography, borders, shadows, opacity, and token changes instead of gradients.
- If a touched legacy surface still uses gradients, remove them as part of the work rather than preserving them by default.

### Component File Location Rules

**GridFlowPage (`/grid` route):**

| What to Change | File to Edit | Key Constants |
|----------------|--------------|---------------|
| Flow colors (A/B/C) | `GridFlowPage.tsx` | `SLOT_COLORS` (~line 135) |
| Signal flow diagram | `FlowRoutingVisualizer.tsx` | `WIRE_COLOR`, `WIRE_ACTIVE` |
| Page background | `index.css` | `.grid-flow-page`, `.grid-flow-header` |
| Plugin cards | `PluginCardShell` | Separate component tree |

**⚠️ DEAD CODE WARNING:**
- `JuceAudioGraphViz.tsx` is NEVER imported - editing it won't change the build
- Always verify imports before editing: `grep -rn 'import.*ComponentName' web/src/app/`

### Vite Build Behavior

**Tree-shaking rules:**
- Vite eliminates unused components automatically
- If a component isn't imported anywhere, changes to it won't appear in the bundle
- Bundle hash only changes when actually-used files are modified
- Manual chunk splitting can break dependency order (let Vite handle it)

### Diagnostic Stack (Bottom to Top)

```bash
# Layer 1: Build files exist?
ls -lh /home/mm/map2-audio/web/dist/index.html

# Layer 2: Server process running?
ps aux | grep "serve_web_dist.mjs" | grep -v grep

# Layer 3: Server responding?
curl -s -I http://localhost:3000/

# Layer 4: Correct files served?
curl -s http://localhost:3000/ | grep -o 'index-[^"]*\.js'
```

**DO NOT assume:**
- Server down = pages broken
- Build failed = server needs restart
- New code not showing = cache issue

**ALWAYS check ALL layers** before taking action.

---

## Code Quality Standards

### Critical Code Comments

When you see these patterns in code, they indicate critical rules:

#### Python Backend

```python
# CRITICAL: Python audio I/O should never be used in production
# CRITICAL: expire_on_commit=True ensures deleted objects are expired after commit
# NOTE: Legacy audio_engine service removed - use juce_engine instead
# TODO: Validate and apply configuration  # Indicates incomplete implementation
```

#### TypeScript/React Frontend

```typescript
// Note: Server persistence handled by WebSocket handler
// Critical: higher frequency, pulsing pattern
// Do NOT disconnect - other components may still need the connection
// Always fresh for metering
// Note: Phosphor has no Drum icon — MusicNote used as closest match
```

### Code Pattern Rules

**Database Sessions:**
```python
# Note: commit is handled by route's get_session context manager
# Don't manually commit inside service methods
```

**WebSocket Cleanup:**
```typescript
// Do NOT disconnect - other components may still need the connection
// Return cleanup function but don't kill shared resources
```

**Plugin Loading:**
```python
# Note: lilv nodes don't support truthiness check in Python 3.14
# Use explicit None checks instead
```

**React Query Caching:**
```typescript
staleTime: 0, // Always fresh for metering
// Polling — always enabled for initial load + fallback
```

---

## Style & Architecture Rules

### File Organization Principles

**1. Barrel Exports (index.ts)**
- Use barrel exports to simplify imports
- Export only what's actually used
- Example: `web/src/map2/index.ts` explicitly references `ChainBuilder/index` because both file and folder exist

**2. Component Co-location**
- Keep related components together
- Custom plugin cards in `web/src/app/components/PluginCards/Custom/`
- Page components in `web/src/app/pages/`
- Shared hooks in `web/src/app/hooks/`

**3. Naming Conventions**
- **React Components**: PascalCase (`GridFlowPage.tsx`, `PluginCardShell.tsx`)
- **Hooks**: camelCase with `use` prefix (`usePipeWire.ts`, `useModulation.ts`)
- **Utilities**: camelCase (`formatters.ts`, `api.ts`)
- **Constants**: UPPER_SNAKE_CASE in component files (`SLOT_COLORS`, `WIRE_ACTIVE`)

### Backend Event Plane

- LCD/runtime surfaces must consume canonical `PlatformEventBus` + `PlatformEventStore` directly.
- Do not reintroduce `LCDEventBus`, `LCDEventRouter`, `RemoteEventAggregator`, or LCD-only persistence tables.
- Temporary legacy HTTP projections are acceptable only at the route edge; the runtime source of truth stays on `PlatformEvent`.

### React Patterns

**1. Component Structure (GridFlowPage as Golden Example)**
```typescript
/**
 * ComponentName - Brief description
 * 
 * Features:
 * - Feature 1
 * - Feature 2
 */

// Imports organized by:
// 1. React core
// 2. Third-party libraries
// 3. Internal hooks
// 4. Internal components
// 5. Types/interfaces

import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSpecialSettings } from '../hooks/useSpecialSettings'

// Constants at top of file
const SLOT_COLORS = {
  A: '#00d9ff', // Cyan
  B: '#ff006e', // Magenta
  C: '#00ff9f', // Green
}

// Main component
export function ComponentName() {
  // 1. Hooks (in order: state, query, mutations, effects)
  const [state, setState] = useState()
  const { data } = useQuery(...)
  const mutation = useMutation(...)
  
  // 2. Derived values with useMemo
  const derived = useMemo(() => compute(), [deps])
  
  // 3. Event handlers with useCallback
  const handleClick = useCallback(() => {}, [deps])
  
  // 4. Render
  return <div>...</div>
}
```

**2. State Management**
- **Server State**: React Query (TanStack Query)
  - Use `staleTime: 0` for real-time data (metering)
  - Use polling for metrics that change frequently
  - Always enable REST fallback + WebSocket
- **UI State**: `useState` for local, Zustand for global
- **Form State**: React Hook Form

**3. Performance Patterns**
```typescript
// ALWAYS memoize expensive computations
const expensiveValue = useMemo(() => {
  return complexCalculation(data)
}, [data])

// ALWAYS memoize callbacks passed to children
const handleChange = useCallback((value) => {
  setState(value)
}, [setState])

// AVOID inline functions in render-heavy components
// ❌ BAD
<Component onClick={() => doSomething()} />

// ✅ GOOD
const handleClick = useCallback(() => doSomething(), [])
<Component onClick={handleClick} />
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

**1. Route Structure**
```python
# app/routes/resource_name.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database_session import get_session
from app.services.resource_service import ResourceService

router = APIRouter(prefix="/api/resource", tags=["Resource"])

@router.get("/")
async def get_resources(
    session: Session = Depends(get_session)
) -> list[ResourceResponse]:
    """Get all resources.
    
    Returns:
        List of resources with metadata
    """
    service = ResourceService(session)
    return await service.get_all()
```

**2. Service Layer Pattern**
```python
# app/services/resource_service.py

class ResourceService:
    """Business logic for resource management."""
    
    def __init__(self, session: Session):
        self.session = session
    
    async def get_all(self) -> list[Resource]:
        """Fetch all resources.
        
        Note: commit is handled by route's get_session context manager
        """
        # Business logic here
        return self.session.query(Resource).all()
```

**3. Database Session Management**
```python
# CRITICAL: Never manually commit in service methods
# ❌ BAD
def create_resource(session: Session, data: dict):
    resource = Resource(**data)
    session.add(resource)
    session.commit()  # DON'T DO THIS
    
# ✅ GOOD
def create_resource(session: Session, data: dict):
    resource = Resource(**data)
    session.add(resource)
    # Commit handled by route's context manager
    return resource
```

**4. Error Handling**
```python
# Use specific exceptions with clear messages
from fastapi import HTTPException

@router.get("/{id}")
async def get_resource(id: int, session: Session = Depends(get_session)):
    resource = session.query(Resource).filter_by(id=id).first()
    if not resource:
        raise HTTPException(
            status_code=404,
            detail=f"Resource {id} not found"
        )
    return resource
```

### CSS/Styling Rules

**1. Class Naming**
- Use kebab-case: `.grid-flow-page`, `.plugin-card-shell`
- Component-specific prefixes: `.grid-flow-*`, `.plugin-card-*`
- State modifiers: `.grid-flow-slot--active`, `.plugin-card--bypass`

**2. CSS Organization**
```css
/* Component-level styles in index.css */
.grid-flow-page {
  /* Layout */
  display: flex;
  flex-direction: column;
  
  /* Spacing */
  padding: 16px;
  gap: 16px;
  
  /* Visual */
  background: var(--cds-layer);
  border: 1px solid var(--cds-border-subtle);
}
```

**3. No-Gradient Requirement**
- Gradients are not permitted in current MAP2 UI surfaces or components.
- Prefer Carbon background, layer, border, support, and text tokens.
- If legacy code still contains gradients, track and remove them instead of copying the pattern forward.

**4. Tron-Inspired Color Palette**
```css
/* Use these exact colors for consistency */
:root {
  --cyan-primary: #00d9ff;
  --magenta-primary: #ff006e;
  --green-primary: #00ff9f;
  --amber-primary: #ffbe0b;
  --purple-primary: #a239ca;
  
  --bg-dark: #0a1628;
  --bg-darker: #050d18;
  --bg-darkest: #030a14;
}
```

### TypeScript Type Safety

**1. API Response Types**
```typescript
// Define explicit types for all API responses
interface PluginResponse {
  id: number
  name: string
  uri: string
  parameters: ParameterDef[]
}

// Use in queries
const { data } = useQuery<PluginResponse[]>({
  queryKey: ['plugins'],
  queryFn: fetchPlugins
})
```

**2. Avoid `any`**
```typescript
// ❌ BAD
const data: any = await fetchData()

// ✅ GOOD
interface DataResponse {
  value: number
  timestamp: string
}
const data: DataResponse = await fetchData()
```

---

## Unified Node Pill Directive

> **Established**: 2026-03-18 — All node identity, status, and scope UI is consolidated into the **NodeNavChip pill** in the global nav bar. No other node-identity UI is permitted on any page.

### Canonical Component

The **sole** node-identity UI element is `NodeNavChip` rendered by `NodeNavBar` in the global nav bar (top-right, justified right). Each discovered node gets one pill. Local node sorts first, then peers alphabetically.

**Pill anatomy** (all three elements required):
1. **Status dot** — colored by `node.status` (ok=green, warn=amber, critical/offline=red)
2. **Hostname** — truncated via `truncateNodeHostname()`, full name in tooltip
3. **Health %** — numeric health score suffix (e.g., "96%")

**Pill accent** — left border colored by presence:
- Blue (`#0f62fe`) = LOCAL (engine this browser is connected to)
- Green (`#198038`) = VIEW (node currently scoped for this page)
- Gray (`#8d8d8d`) = PEER (discovered but not viewed)

### Popover Interaction

Clicking a pill opens a `Popover` with `NodeMiniCard` containing:
- Node display name + hostname + role label
- Status tag + view context ("Local studio view" / "Remote live view")
- "Set as page node" button — calls `viewedNodeStore.setViewedNode(pageKey, nodeId)`
- "View details" link — navigates to Platform single-node view
- Alert rows (if any) — dismissible, with severity tag

### Deprecated Components (DO NOT USE)

- `NodeContextBanner` — replaced by pill accent colors + popover context line
- `NodeContextPicker` — replaced by pill popover "Set as page node"
- `NodeAlertBar` / `NodeAlertToast` — folded into pill dot pulse + popover alert rows
- Per-page "Viewing node:" text — pill VIEW accent communicates this

### Rules

1. **No node identity UI outside the global nav bar**
2. **All node switching goes through the pill popover** via `viewedNodeStore`
3. **Health alerts surface through the pill** — dot color/animation + popover details
4. **Pill is always visible** in the global nav bar
5. **New node features go into the pill or its popover** — no parallel node UI surfaces

### Key Files

- Pill: `web/src/app/components/NodeNav/NodeNavChip.tsx`
- Nav bar: `web/src/app/components/NodeNav/NodeNavBar.tsx`
- Popover card: `web/src/app/components/NodeNav/NodeMiniCard.tsx`
- Types: `web/src/app/types/node.ts`
- Display utils: `web/src/app/utils/nodeDisplay.ts`
- Viewed-node store: `web/src/app/stores/viewedNodeStore.ts`

---

## Golden Example Files

These files represent best practices and architectural patterns to follow:

### Frontend Examples

**1. GridFlowPage.tsx** (`web/src/app/pages/GridFlowPage.tsx`)
- **Why**: Complete feature showcase - 2,700 lines of production code
- **Patterns**: State management, memoization, callback optimization, component composition
- **Architecture**: Complex UI with real-time updates, undo/redo, preset management
- **Key Lessons**: How to structure large components without performance degradation

**2. FlowRoutingVisualizer.tsx** (`web/src/app/components/GridFlow/FlowRoutingVisualizer.tsx`)
- **Why**: SVG-based visualization with clean separation of concerns
- **Patterns**: Render function per routing mode, typed props, color constants
- **Key Lessons**: How to create dynamic visualizations with React + SVG

**3. usePipeWire.ts** (`web/src/app/hooks/usePipeWire.ts`)
- **Why**: Perfect example of dual polling + WebSocket pattern
- **Patterns**: React Query with fallback, connection state management
- **Code Comment**: `// REST polling — always enabled for initial load + fallback`

**4. PluginCardShell.tsx** (`web/src/app/components/PluginCards/PluginCardShell.tsx`)
- **Why**: Reusable component wrapper pattern
- **Patterns**: Composition, children as function, context provision
- **Key Lessons**: How to create flexible, extensible component APIs

### Backend Examples

**5. main.py** (`app/main.py`)
- **Why**: Application factory pattern with proper lifecycle management
- **Patterns**: Async lifespan, safe service startup/shutdown, error handling
- **Key Functions**: `safe_start_service()`, `safe_stop_service()`

**6. chain_service.py** (`app/services/chain_service.py`)
- **Why**: Service layer with proper session handling
- **Code Comment**: `# Note: commit is handled by route's get_session context manager`
- **Key Lessons**: Don't commit in services, let route context managers handle it

**7. plugin_loader_unified.py** (`app/services/plugin_loader_unified.py`)
- **Why**: Complex plugin discovery with LV2 + JUCE integration
- **Code Comment**: `# Note: lilv nodes don't support truthiness check in Python 3.14`
- **Key Lessons**: Platform-specific quirks and workarounds

### Configuration Examples

**8. vite.config.ts** (`web/vite.config.ts`)
- **Why**: Production-focused build configuration
- **Critical Setting**: `manualChunks: undefined` (let Vite handle dependency order)
- **Key Comment**: Shows clear distinction between port 3000/3001 usage

**9. CMakeLists.txt** (`juce-engine/CMakeLists.txt`)
- **Why**: Real-time audio build configuration
- **Critical Settings**: Release mode forced, SIMD enabled, fast math
- **Key Comment**: `# Debug build (-O0) causes unacceptable CPU overhead`

### Documentation Examples

**10. AI_GRIDFLOW_COMPONENT_MAP.md** (`docs/AI_GRIDFLOW_COMPONENT_MAP.md`)
- **Why**: Perfect example of AI-to-AI documentation
- **Format**: Problem description → Solution → Verification steps
- **Key Lesson**: Documents the "dead code" pitfall and how to avoid it

**11. VITE_TROUBLESHOOTING_GUIDE.md** (`docs/VITE_TROUBLESHOOTING_GUIDE.md`)
- **Why**: Diagnostic workflow example
- **Format**: 4-layer stack check, scenario-based troubleshooting
- **Key Lesson**: Always check full stack before assuming failure

---

## Gotchas & Learned Fixes

### Build System Gotchas

**1. Vite Manual Chunk Splitting (SOLVED)**
- **File**: `.copilot-notes/black-screen-not-cache.md`
- **Problem**: Custom `manualChunks` broke dependency order, React loaded after recharts
- **Error**: `Cannot read properties of undefined (reading 'forwardRef')`
- **Fix**: Set `manualChunks: undefined` in vite.config.ts
- **Lesson**: Let Vite handle dependency ordering automatically

**2. Bundle Hash Not Changing**
- **Problem**: Editing a file doesn't change the build output hash
- **Diagnosis**: File is dead code (not imported anywhere)
- **Fix**: Verify imports first: `grep -rn 'import.*ComponentName' web/src/`
- **Example**: `JuceAudioGraphViz.tsx` is never imported, editing it has no effect

**3. Tree-Shaking Confusion**
- **Problem**: Changes to large components don't appear in bundle
- **Diagnosis**: Vite tree-shaking correctly eliminates unused code
- **Verification**: `grep -c 'searchTerm' dist/assets/ComponentName-*.js`
- **Lesson**: Bundle hash only changes when actually-used code changes

**4. Platform Version Drift Across Web/Backend/TUI/Shell**
- **Problem**: Different surfaces report different MAP2 versions because web used `package.json`, backend used hard-coded constants, and console/shell preferred `git describe`.
- **Fix**: `npm run build` now runs `python3 ../scripts/generate_platform_version.py` first; all user-facing platform version reads must come from the generated root `version.json` / `VERSION` artifact instead of `package.json.version` or git metadata.
- **Lesson**: Treat platform build identity as a generated artifact separate from package-manager semver. The canonical MAP2 build version is digits-only `YYYYMMDDHHMMSSBB`.

**5. No-Gradient UI Rule**
- **Problem**: Gradient styling had re-entered active MAP2 web surfaces and even guidance examples, which made Carbon-flat reviews inconsistent and let new gradient usage spread.
- **Fix**: Add a repository-wide no-gradient rule, update the shared guidance examples to use solid Carbon tokens, and track the current hotspot inventory in `docs/PROJECT_WORKLIST.md` before the cleanup sweep.
- **Lesson**: “Prefer Carbon” is too soft on its own; the repo needs an explicit fail-closed rule against gradients across CSS, inline styles, SVG, canvas, and theme tooling.

### Server Management Gotchas

**5. Sleep Commands Kill Builds (CRITICAL)**
- **File**: `.copilot-notes/server-restart-pattern.md`
- **Problem**: `sleep 5 && curl` blocks terminal, causes `^C` interrupts
- **Error**: Build process killed mid-build, corrupted dist/
- **Fix**: Use `nohup ... &` + poll logs with `grep`/`tail`
- **Rule**: NEVER use `sleep` in CI or automated scripts

**6. Port Conflicts on Restart**
- **Problem**: `ERROR: [Errno 98] address already in use`
- **Cause**: Old server process still bound to port
- **Fix**: `kill -9 $(lsof -ti:3000)` or `pkill -9 -f "serve_web_dist.mjs"` before starting new server
- **Why -9**: Graceful kill sometimes doesn't release port fast enough

**7. Dist Folder Deleted Mid-Build**
- **Problem**: Server responds 404, files missing
- **Diagnosis**: `rm -rf dist` ran while build in progress
- **Fix**: Check `ps aux | grep "vite build"` before assuming server issue
- **Lesson**: Always verify build completion before troubleshooting server

**8. Large Native Fixture State Can Blow Test Stack**
- **Problem**: Standalone `synthforge_tests` could segfault before assertions when constructing `DrumSequencer` in `DrumSequencerTests.cpp`.
- **Root Cause**: `DrumSequencer` stored its full 128-pattern state inline by value, making constructor-time stack usage large enough to overflow the test process stack.
- **Fix**: Move the large pattern store to heap-backed ownership and keep the public behavior unchanged; then rerun the isolated case and the full `ctest --test-dir juce-engine/build-synthforge-tests -R '^synthforge_tests$' --output-on-failure` gate.
- **Lesson**: For large native state containers used by test-local objects, prefer heap ownership over giant stack-resident aggregates even when the class is otherwise logically value-like.

**9. Full Frontend Build Is The Real Restart Gate**
- **Problem**: Focused frontend validation (`typecheck` plus route-level tests) can still miss production-build failures that only appear during the full `npm --prefix web run build` path.
- **Root Cause**: The drum GUI closure exposed two issues outside the earlier narrow checks: a `DrumsPage.tsx` declaration-order bug (`sampleRecordingPad` used before declaration) and stale default-state shape in `web/src/map2/drumMachineState.ts` that only blocked the production build contract.
- **Fix**: Before any user-requested rebuild/restart on port `3000`, always run the full production build and treat that as the authoritative gate; if it fails, repair the build blockers before touching the live web server.
- **Lesson**: Route-local tests and `tsc --noEmit` are necessary but not sufficient for deployment. The deployment contract is `npm --prefix web run build`, then restart `serve_web_dist.mjs`.

**10. Tracked Version Artifacts Must Stay Stable Across Clean Rebuilds**
- **Problem**: The required commit/push/rebuild/restart loop used to dirty `VERSION` and `version.json` after every successful clean rebuild, even when no source files changed.
- **Root Cause**: The prebuild step both minted a new wall-clock version on every run and persisted unstable runtime git metadata (`commit`/`dirty`) into tracked artifacts, which can never stay aligned across commit boundaries.
- **Fix**: Persist only the stable build identity in tracked version artifacts, refresh runtime `commit`/`dirty` from git when loading the version payload, and reuse the existing version during clean rebuilds instead of stamping a new timestamp.
- **Lesson**: Build identity and live repo state are different contracts. Track the stable version in files; compute runtime git state dynamically.

**11. Dense ReactFlow Workspaces Need Tiered Chrome Reduction**
- **Problem**: Carbon-tokenized ReactFlow workspaces can still feel unstable on large operator routes because decorative graph chrome and animated `fitView` scale poorly once node and edge counts climb.
- **Root Cause**: Workspace graphs were rendering background dots, controls, and animated `fitView` unconditionally, even when the graph was already in a high-density inspection state.
- **Fix**: Use the shared `web/src/app/components/shared/reactFlowDensity.ts` helper and shared thresholds: `40/80` (`medium`), `100/200` (`high`), and `180/360` (`critical`) for `nodes/edges`. Above `high`, drop decorative backgrounds and `fitView` animation; above `critical`, hide controls too and expose density tier/counts on the graph owner.
- **Lesson**: In MAP2, graph density is a first-class performance input. Do not ship route-local ReactFlow surfaces with unconditional background dots, controls, and fit animations once they can exceed the shared thresholds.

### Python Backend Gotchas

**8. SQLAlchemy Session Management**
- **Problem**: `DetachedInstanceError` or stale data after commit
- **Root Cause**: `expire_on_commit=True` (default) expires objects after commit
- **Fix**: Access all needed attributes before commit, or use `expire_on_commit=False`
- **Code**: `# CRITICAL: expire_on_commit=True ensures deleted objects are expired`

**9. Lilv Node Truthiness (Python 3.14)**
- **Problem**: `if lilv_node:` raises TypeError in Python 3.14
- **Root Cause**: lilv nodes don't support `__bool__` in newer Python
- **Fix**: Use explicit `None` checks: `if lilv_node is not None:`
- **Code**: `# Note: lilv nodes don't support truthiness check in Python 3.14`

**10. Audio Engine Port Conflicts**
- **Problem**: uvicorn fails to start on port 8080
- **Diagnosis**: Old uvicorn process still running
- **Fix**: `kill -9 $(pgrep -f "uvicorn app.main")`
- **Prevention**: Use systemd service with proper cleanup

**11. MIDI-CI Recovery Sends Must Preserve Collision/Error State**
- **Files**: `app/services/midi_hub/midi2.py`, `tests/midi_hub/test_routes.py`, `tests/midi_hub/test_traffic_routes.py`
- **Problem**: Automatic discovery/invalidate sends after local or remote MUID collisions could clear `last_error`, making the status surface report a clean transport state even though a collision had just occurred.
- **Root Cause**: `_send_transport_payload()` reset `last_error` to `None` after every successful send, including protocol-driven recovery traffic scheduled immediately after collision handling.
- **Fix**: Only clear transport errors (`transport_send_failed`, `binding_required`, `midi2_disabled`) on successful sends; preserve collision and invalidation errors until a real protocol response supersedes them. Keep multi-chunk MIDI-CI tests aligned with actual wire behavior by delivering every generated chunk during subscription and Property Exchange reply simulation.
- **Verification**: `pytest tests/midi_hub/test_ports.py tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py`
- **Lesson**: In protocol managers, background recovery traffic should not overwrite the fault state it is trying to repair; recovery evidence belongs in separate TX telemetry, not by erasing the triggering error.

**12. Runtime Service Managers Must Be Explicitly Registered For Route Access**
- **Files**: `app/services/lcd_manager.py`, `app/main.py`, `app/routes/peer_discovery.py`, `tests/test_peer_discovery_routes.py`
- **Problem**: Routes that expect a live service manager can drift into `500` failures if they import an implied module-global instance that startup never actually defines or populates.
- **Root Cause**: The LCD/peer-discovery path imported `lcd_manager` from `app.services.lcd_manager`, but that module only exposed the class, not a registered runtime instance.
- **Fix**: Expose explicit `set_lcd_manager()/get_lcd_manager()` registration in the service module, wire it during lifespan startup/shutdown, and point route code/tests at that shared runtime lookup.
- **Verification**: `pytest tests/test_peer_discovery_routes.py tests/test_node_api.py tests/test_main_cluster_midi_lifecycle.py`
- **Lesson**: If routes need a live service instance, register it deliberately in one canonical place and verify the HTTP route surface with focused tests.

**13. Operator-Facing Node Visibility Must Come From One Merged Snapshot**
- **Files**: `app/services/cluster/node_visibility.py`, `app/routes/peer_discovery.py`, `app/routes/cluster_health.py`, `app/routes/cluster_admin.py`, `app/services/cluster/heartbeat_monitor.py`, `app/services/avb/avb_router.py`, `app/services/node_discovery_service.py`, `tests/test_cluster_visibility_routes.py`, `tests/test_avb_router_map2.py`
- **Problem**: Second-node operator surfaces disagreed about whether a reachable peer existed: basic mDNS showed it, `/api/cluster/online-nodes` missed it, `/api/cluster/discovered` used a different cache, and AVB router MAP2 discovery only looked at registry rows.
- **Root Cause**: Each backend surface maintained its own discovery contract, and the heartbeat monitor still assumed registry rows were object instances with `.node_id`/`.url` even though the registry returns plain dicts.
- **Fix**: Build one shared remote-node visibility snapshot that merges basic mDNS, enhanced mDNS, registry, and heartbeat state; drive `/api/peers`, `/api/cluster/online-nodes`, `/api/cluster/discovered`, AVB router MAP2 discovery, and node-topology peer lookups from that same snapshot; and resolve registry rows into concrete API URLs before heartbeat polling.
- **Verification**: `pytest tests/test_peer_discovery_routes.py tests/test_cluster_visibility_routes.py tests/test_avb_router_map2.py tests/test_node_api.py`; `npm --prefix web run typecheck`; `npm --prefix web test -- --runInBand web/src/app/contexts/ClusterContext.test.tsx web/src/app/pages/HomePage.test.tsx`; `npm --prefix web run build`
- **Lesson**: If operators can see "the cluster" in multiple places, every surface must read from the same merged visibility model; otherwise discovery, online state, and AVB capability drift apart and create false-negative second-node reports.

**14. Adoption Must Preserve The Discovery/Trust/Readiness/Activation Split**
- **Files**: `docs/ADOPTION_WORKFLOW_RUNBOOK.md`, `app/services/cluster/adoption.py`, `app/routes/adoption.py`, `app/services/cluster/adoption_bootstrap.py`, `app/routes/bootstrap.py`, `web/src/app/pages/HomePage.tsx`
- **Problem**: Multi-node setup becomes ambiguous or unsafe when code treats a discovered node as already trusted, ready, or active just because it is visible on the network.
- **Root Cause**: It is tempting to collapse onboarding into one "peer is here" state, but MAP2 now has distinct lifecycle stages with separate security and readiness meaning.
- **Fix**: Keep the canonical lifecycle `candidate -> claimable -> adopted -> ready -> active`; require pairing-code or token-based trust bootstrap before adoption; keep nodes in standby until readiness passes; and bound profile cloning to non-identity settings only.
- **Verification**: `pytest -q tests/test_bootstrap_routes.py tests/test_adoption_routes.py tests/test_peer_discovery_routes.py tests/test_cluster_visibility_routes.py tests/test_avb_router_map2.py`; `npm --prefix web test -- --runInBand web/src/app/pages/HomePage.test.tsx web/src/app/contexts/ClusterContext.test.tsx`
- **Lesson**: Discovery is only visibility. Future cluster, AVB, and onboarding work must extend the shared adoption lifecycle instead of inventing parallel "usable peer" states.

**15. Replacement AVDECC Coverage Must Target The Supported Controller/Pybind Contract**
- **Files**: `juce-engine/Source/AvdeccController.h`, `juce-engine/Source/PythonBindings.cpp`, `app/routes/avb.py`, `app/services/avb/avb_router.py`, `tests/test_avdecc_controller_contract.py`, `tests/test_avdecc_aem_cache.py`, `tests/test_avdecc_mock_integration.py`
- **Problem**: After the legacy `AvdeccEntityModel`/`AvdeccEnumerator` tests were removed, AVDECC regressions could slip through unless coverage explicitly targeted the controller-facing methods that still back the Python and route surfaces.
- **Root Cause**: The supported stack now consists of `Map2AvdeccController` plus the snake_case pybind engine wrappers and camelCase controller compatibility fallbacks, but the old tests exercised a retired internal model instead of that live contract.
- **Fix**: Keep AVDECC replacement coverage focused on the supported contract: snake_case engine methods from `PythonBindings.cpp` (`get_avdecc_entities`, `get_avdecc_entity_model`, `connect_stream`, `disconnect_stream`, `get_active_connections`, `get_stream_format`, `set_stream_format`) plus the camelCase controller fallbacks that `avb_router.py` and `app/routes/avb.py` still probe (`getDiscoveredEntities`, `getActiveConnections`, `connectStream`, `disconnectStream`).
- **Verification**: `pytest -q tests/test_avdecc_controller_contract.py tests/test_avdecc_aem_cache.py tests/test_avdecc_mock_integration.py`
- **Lesson**: AVDECC coverage should validate the production compatibility surface that operators actually use, not rebuild a second harness around the deleted legacy model/enumerator internals.

### React/TypeScript Gotchas

**11. WebSocket Connection Cleanup**
- **Problem**: Multiple WebSocket connections created on component re-render
- **Root Cause**: `useEffect` cleanup killing shared connection
- **Fix**: Check if connection is used elsewhere before disconnecting
- **Code**: `// Do NOT disconnect - other components may still need the connection`

**12. React Query Stale Time**
- **Problem**: Metering data not updating in real-time
- **Root Cause**: Default `staleTime` caches data
- **Fix**: Set `staleTime: 0` for real-time metrics
- **Code**: `staleTime: 0, // Always fresh for metering`

**13. Phosphor Icons Missing**
- **Problem**: `Note: Phosphor has no Drum icon`
- **Solution**: Use closest match (`MusicNote`) and document it
- **Code**: `// Note: Phosphor has no Drum icon — MusicNote used as closest match`

**14. Parallel Scene + Snapshot UX Causes Operator Confusion (HIGH)**
- **Problem**: Editor surfaces risk exposing both `scene` and `snapshot` as separate features for the same recallable rig state.
- **Root Cause**: UI/feature planning borrows terminology from hardware editors without reconciling the underlying MAP2 state model.
- **Fix**: In `JUCE-GRID`, merge scene-style recall/inspection capabilities into the snapshot system and keep one canonical persistence/workflow surface.
- **Lesson**: When the saved state is the same, duplicate terminology should be modeled as one Carbon workflow with one source of truth, not parallel panels or APIs.

**15. Direct Asset Uploads Must Auto-Activate In Selected-Block Editors**
- **Files**: `web/src/app/components/loaders/AssetUploadButton.tsx`, `web/src/app/components/loaders/NAMManagerDialog.tsx`, `web/src/app/components/loaders/IRManagerDialog.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/ReverbIRCard.tsx`
- **Problem**: NAM, Cabinet IR, and Reverb IR looked upload-capable but the active editor surface still hid the actual file chooser behind a second library step, so operators could not reliably pick local `.nam` or `.wav` files.
- **Root Cause**: The selected-block cards and shared manager dialogs separated upload from activation, which left the visible workflow without an obvious working chooser and required a second hidden selection step after upload.
- **Fix**: Use a real `<input type=\"file\">` over the visible Carbon button surface and wire the upload success path to immediately activate the returned asset in both the selected-block cards and the shared manager dialogs.
- **Validation**: `npm --prefix web run typecheck`; `npm --prefix web test -- --runInBand web/src/app/components/loaders/NAMManagerDialog.test.tsx web/src/app/components/loaders/IRManagerDialog.test.tsx web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx web/src/app/pages/JuceGridPage.test.tsx`; `npm --prefix web run build`
- **Lesson**: For asset-backed effect editors, "upload" is not complete until the newly uploaded asset is both visible on the active surface and selected immediately.

**16. Accessibility Labels Are More Stable Than Icon Test IDs In AVB Routing UI**
- **Files**: `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.tsx`, `web/src/app/components/AvbRouting/components/RoutingGrid/MatrixCell.tsx`, `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.badges.test.tsx`, `web/src/app/components/AvbRouting/components/RoutingGrid/MatrixCell.crossNode.test.tsx`
- **Problem**: AVB routing regressions failed even though the UI still showed node-status and cross-node glyphs because the tests depended on icon-library `data-testid`s that disappeared when the rendered icon implementation changed.
- **Root Cause**: The tests asserted Carbon icon internals instead of the operator-visible semantics that the UI is actually required to preserve.
- **Fix**: Add explicit accessible labels around the rendered status/link markers and assert those labels in the tests instead of icon component test IDs.
- **Validation**: `npm --prefix web run typecheck`; `npm run test:avb-routing -- --runInBand --silent`
- **Lesson**: For status icons and route markers, expose stable semantic labels in the rendered UI and test the user-visible contract, not the icon component internals.

**17. Normalize Untrusted `nodes` Payloads Before Mapping Or Iterating**
- **Files**: `web/src/app/components/AvbRouting/hooks/useAvbApi.ts`, `web/src/app/components/AvbRouting/hooks/useNodeApi.ts`, `web/src/app/components/MidiHub/MidiPatchbay.tsx`, `web/src/app/components/MidiHub/patchbayTopology.ts`
- **Problem**: Cluster fanout, discovery, and topology readers crashed when backend responses contained truthy but malformed `nodes` values such as arrays, objects, or missing fields where the UI expected a record or string array.
- **Root Cause**: Several frontend readers trusted `payload.nodes` and called `Object.entries`, `.map()`, or string-array casts directly instead of normalizing the transport shape first.
- **Fix**: Treat `nodes` as untrusted transport data, normalize it into the expected record or array helper before mapping, and fall back to empty collections or live port ids when the payload shape is wrong.
- **Validation**: `npm --prefix web test -- --runInBand web/src/app/components/AvbRouting/hooks/useAvbApi.clusterFanout.test.ts web/src/app/components/AvbRouting/hooks/useNodeApi.test.ts web/src/app/components/MidiHub/patchbayTopology.test.ts`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: Any cluster/discovery/topology query that reads `payload.nodes` should normalize the shape at the boundary so malformed backend data degrades to empty UI state instead of crashing render or query code.

### JUCE/Audio Gotchas

**15. Debug Build Performance**
- **Problem**: Real-time audio stuttering, high CPU usage
- **Root Cause**: Debug build (`-O0`) is too slow for RT audio
- **Fix**: Force Release mode in CMakeLists.txt
- **Code**: `# Debug build (-O0) causes unacceptable CPU overhead for real-time audio`

**16. Tier A Settings Locked**
- **Problem**: Cannot change audio settings via API
- **Root Cause**: Performance-critical settings locked at startup
- **Settings**: `sample_rate`, `buffer_size`, `backend`
- **Fix**: Edit systemd service file, restart service
- **Test**: `python3 test_tier_a_locks.py` must show ✅

**15. MIDI Device Selection (✅ SOLVED - Feb 12, 2026)**
- **File**: `juce-engine/Source/MidiHandler.cpp:190-410`, `MidiHandler.h:321-327`
- **Problem**: `openInputDevice()` stored device name but didn't actually connect
- **Symptom**: All MIDI devices sent events to MAP2 regardless of selection
- **Root Cause**: TODO stub accepted connections from any device
- **Fix**: Implemented proper ALSA sequencer subscriptions (~150 lines)
  - Parse device name format: `"ClientName:PortName"`
  - Search ALSA clients/ports via `snd_seq_query_next_client()`
  - Create specific subscription: device → MAP2 input port (input) or MAP2 output port → device (output)
  - Track connections via `std::vector<AlsaConnection>` for proper cleanup
  - Implement `closeInputDevice()` / `closeOutputDevice()` with proper unsubscribe
- **Code**: `MidiHandler::openInputDevice()`, `MidiHandler::openOutputDevice()`, `MidiHandler::closeInputDevice()`, `MidiHandler::closeOutputDevice()`
- **Test**: `engine.set_midi_device("DeviceName:Port")` now filters to that device only
- **Commit**: `54d6dfd` - Pushed to GitHub master
- **Docs**: `docs/MIDI_DEVICE_SELECTION_COMPLETE.md`
- **Lesson**: ALSA device selection requires explicit `snd_seq_subscribe_port()` calls with proper sender/dest addresses. Device names must match exactly "ClientName:PortName" format from `snd_seq_client_info_get_name()` + `snd_seq_port_info_get_name()`

**16. H3000 Glide=0 Callback Crash (✅ SOLVED - Feb 24, 2026)**
- **Files**: `juce-engine/Source/H3000Processor.cpp`, `juce-engine/Source/JuceAudioIO.cpp`, `juce-engine/Source/Map2AudioEngine.cpp`, `tests/test_juce_engine_audio_start_stability.py`
- **Problem**: Engine could segfault shortly after `start_audio()` in callback thread during H3000 processing.
- **Root Cause**: `glide=0` produced invalid coefficient math in `H3000Processor::processMicropitch/processDualShift`, leading to undefined index conversion in pitch-grain interpolation under real callback load.
- **Fix**: Added fast-math-safe glide coefficient guardrails and pitch/delay bounds in H3000 path, retained callback channel/sample clamping in JUCE/engine callback bridge, and added subprocess regression test for start/stop stability.
- **Verification**: `ASAN_OPTIONS='abort_on_error=1:detect_leaks=0' LD_PRELOAD=/usr/lib/clang/21/lib/x86_64-redhat-linux-gnu/libclang_rt.asan.so python3 /tmp/repro_t009_asan.py`; `pytest -q tests/test_juce_engine_audio_start_stability.py`
- **Lesson**: In MAP2 Release builds (`-ffast-math`), avoid NaN/Inf-dependent safety logic; guard real-time DSP math with deterministic bounds that remain valid under aggressive FP optimization.

### Project Workflow Gotchas

**17. Canonical Project Worklist Location (HIGH)**
- **File**: `docs/PROJECT_WORKLIST.md`
- **Problem**: Using a second task tracker causes status drift and split ownership.
- **Root Cause**: Legacy subsystem plans can linger as parallel trackers unless the canonical location is enforced explicitly.
- **Fix**: Treat `docs/PROJECT_WORKLIST.md` as the single canonical MAP2 worklist unless the user explicitly redesignates it.
- **Verification**: Confirm active directive files point to `docs/PROJECT_WORKLIST.md` and update statuses there only.
- **Lesson**: For "Status" requests, report relevant tasks from the canonical project worklist first, then add git working-tree context.

**18. AVB Install Defaults Drift (HIGH)**
- **Files**: `install_on_new_host.sh`, `docs/avb-setup.md`, `README.md`, `juce-engine/CMakeLists.txt`
- **Problem**: AVB docs said "disabled by default" while installer and build defaults were expected to make AVB first-class.
- **Root Cause**: Installer previously never called `scripts/setup_avb.sh`, and CMake defaulted `USE_AVB=OFF`.
- **Fix**: Make installer run AVB setup by default, add `--skip-avb` and `--uninstall-avb` controls, set `USE_AVB` default to `ON`, and update docs accordingly.
- **Verification**: `bash -n install_on_new_host.sh`; verify help output includes AVB flags; confirm docs no longer state "disabled by default".
- **Lesson**: When changing default behavior, update installer, build defaults, and operator docs in the same change to avoid operational drift.

**19. Installer Dry-Run Must Not Depend on Generated Artifacts (MEDIUM)**
- **Files**: `install_on_new_host.sh`, `tests/test_avb_ops_scripts.py`
- **Problem**: Dry-run path failed before AVB phase because it attempted `chmod /tmp/map2-rebuild.sh` even though dry-run never generated that file.
- **Root Cause**: Phase 4 performed filesystem mutation/setup unconditionally instead of branching by `DRY_RUN`.
- **Fix**: Gate `chmod` behind non-dry-run execution and validate installer AVB control branches with automated dry-run tests.
- **Verification**: `pytest tests/test_avb_ops_scripts.py -q` passes with default, `--skip-avb`, `--uninstall-avb`, and `--avb-interface` paths.
- **Lesson**: Treat dry-run as a first-class execution mode; every non-read-only action must be branch-guarded and test-covered.

**20. AVTP Init Must Be Descriptor-Backed, Not Placeholder Allocation (HIGH)**
- **Files**: `juce-engine/Source/AvbStream.cpp`, `juce-engine/Source/AvbStream.h`, `juce-engine/tests/AvbStreamManagerTests.cpp`
- **Problem**: AVTP initialization previously used a placeholder allocation (`new uint8_t[1024]`) with no stream-id/format/NSR mapping and no owned teardown semantics.
- **Root Cause**: Transport bootstrap path was left in a scaffold state after initial AVB wire-up.
- **Fix**: Build descriptor-backed AVTP init with sample-rate/bit-depth mapping, payload-length + MTU validation, header template seeding, owned storage teardown, and fail-closed decode checks for descriptor mismatches.
- **Verification**: `cmake --build juce-engine/build --target avb_tests -j4` and `ctest --test-dir juce-engine/build -R '^avb_tests$' --output-on-failure`.
- **Lesson**: Transport init code should fail fast on invalid stream descriptors and encode/decode paths must assert descriptor consistency, not rely on implicit placeholders.

**21. Node-Scoped Inspector Telemetry Must Use Explicit Stream Ownership (HIGH)**
- **Files**: `app/services/avb/avb_service.py`, `app/services/avb/avb_router.py`, `app/routes/avb.py`, `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.tsx`, `web/src/app/components/AvbRouting/utils/endpointSchema.ts`
- **Problem**: Inspector health snapshot stream scoping relied on stream-id route heuristics and a global fallback, which could attribute streams to the wrong node context.
- **Root Cause**: `/api/avb/streams` payloads did not include deterministic node ownership metadata, forcing frontend inference logic.
- **Fix**: Add explicit stream ownership payload fields (`owner_node_id`, peer/talker/listener node+endpoint IDs, plus normalized `node_ids`/`endpoint_ids`) in backend stream payloads and scope Inspector node-context streams strictly by ownership matching.
- **Verification**: `pytest tests/test_avb_service_engine_contract.py tests/test_avb_stream_validation.py tests/test_avb_router_map2.py tests/test_avb_service_stats.py -q`; `npm run test -- web/src/app/components/AvbRouting/utils/endpointSchema.test.ts web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.nodeContext.test.tsx --runInBand`; `npm run test:avb-routing`; `cd web && npm run typecheck`.
- **Lesson**: Node-scoped telemetry should fail closed when ownership is unknown; avoid global-fallback stream attribution in multi-node AVB views.

**22. ACMP Connect Must Validate/Negotiate AVDECC Stream Formats First (HIGH)**
- **Files**: `juce-engine/Source/AvdeccEntity.h`, `juce-engine/Source/AvdeccEntity.cpp`, `juce-engine/Source/PythonBindings.cpp`, `app/routes/avb.py`, `tests/test_avb_routes_srp.py`
- **Problem**: ACMP connect could be attempted with incompatible talker/listener stream tuples, causing avoidable connect-time failures.
- **Root Cause**: No pre-connect `GET_STREAM_FORMAT` check and no negotiation path to align listener format via `SET_STREAM_FORMAT`.
- **Fix**: Added AECP stream-format get/set transaction support with pending-response matching + timeout handling in engine, exposed pybind methods (`get_stream_format`, `set_stream_format`), added REST PATCH format endpoint, and enforced pre-connect validation/negotiation in `/api/avb/avdecc/connections`.
- **Verification**: `pytest tests/test_avb_routes_srp.py -q`; `cmake --build juce-engine/build --target map2_audio_engine -j4`; `cmake --build juce-engine/build --target avdecc_model_tests -j4`; `ctest --test-dir juce-engine/build -R '^avdecc_model_tests$' --output-on-failure`.
- **Lesson**: Treat stream-format compatibility as a control-plane precondition, not a post-failure recovery step.

**23. JUCE Plugin Lifecycle Crashes Required Dual Fix (CRITICAL - Feb 25, 2026)**
- **Files**: `juce-engine/Source/JucePluginHost.cpp`, `juce-engine/Source/JuceAudioGraph.cpp`, `juce-engine/Source/Map2AudioEngine.cpp`, `juce-engine/Source/IntelliFX8VoiceChorusProcessor.cpp`, `tests/test_juce_engine_plugin_load_lifecycle_stability.py`, `tests/test_juce_engine_intellifx_lifecycle_stability.py`, `.codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py`
- **Problem**: `load_plugin()`/start-audio soak runs could segfault under graph rewires and multi-instance callback load.
- **Root Cause**:
  - `JucePluginHost::loadPlugin` previously used transient descriptor memory from `KnownPluginList::getTypes()` in load path.
  - `IntelliFX8VoiceChorusProcessor::readDelayLine` could hit an out-of-range index under edge wrapped read-position math in callback thread.
  - Long LV2 soak churn also triggered third-party GTK registration faults when repeatedly unloading/reloading runtime plugins.
- **Fix**:
  - Copy/stabilize plugin descriptions before instance creation in host load path.
  - Enforce deterministic graph single-placement/node-lifecycle guardrails.
  - Add finite/bounds/wrap guards in IntelliFX delay-line read path and write-index validation in process loop.
  - Add subprocess regression for multi-instance IntelliFX rewire/start-stop stability.
  - Harden soak harness to auto-reuse effect set when runtime pool is LV2-only (keeps flow/blend rotation but avoids plugin-churn crash class).
- **Verification**:
  - `pytest -q tests/test_juce_engine_audio_start_stability.py tests/test_juce_engine_jack_stability.py tests/test_juce_engine_plugin_load_lifecycle_stability.py tests/test_juce_engine_intellifx_lifecycle_stability.py` (6 passed)
  - ASAN soak reproducer now exits cleanly with no sanitizer abort: `.../docs/fit-for-purpose-evidence/20260225/juce-random-fx-soak-20260225T001010Z.json`
  - 180s smoke soak and 90s live-rewire soak complete with artifacts and no native crash.
- **Lesson**: Treat plugin-host stability as a layered problem (descriptor lifetime, topology invariants, DSP index safety, and soak-orchestrator churn policy), not a single bug.

**24. Never Handoff with Known Build/Type Errors (CRITICAL - Feb 25, 2026)**
- **Files**: `.gemini/instructions.md`, `web/src/**` (scope of active fix)
- **Problem**: Partial delivery with known compile/type errors leaves the branch non-deployable and causes follow-up rework.
- **Root Cause**: Treating restart/deploy requests as complete before enforcing clean build gates.
- **Fix**: Before handoff, run the relevant compile/typecheck/build command(s), fix all reported errors, and only then report completion (or explicitly report blocker if truly external).
- **Verification**: `cd web && npm run typecheck` and `cd web && npm run build` must pass for web-facing changes.
- **Lesson**: "Done" means no known compile/type errors in the touched subsystem.

**25. Advanced Nav Promotion Must Be Persisted/Sanitized Across API + Raft (HIGH - Feb 27, 2026)**
- **Files**: `app/database.py`, `app/models.py`, `app/routes/special_settings.py`, `app/services/special_settings_raft.py`, `web/src/app/hooks/useSpecialSettings.tsx`, `web/src/app/layout/AppShell.tsx`, `web/src/app/data/advancedMenuItems.ts`
- **Problem**: Top-nav promotion choices for Advanced menu items can drift or reset if they are only UI-local and not normalized/replicated through backend state.
- **Root Cause**: Promotion state lacked a durable API/DB contract and route sanitization, and top-nav rendering logic was previously static.
- **Fix**: Persist `promoted_advanced_routes` in Special Settings (DB + API + Raft/state sync), normalize route lists (dedupe + slash-only paths), and drive top-nav rendering from promoted Advanced items with deterministic metadata keys.
- **Verification**: `pytest -q tests/test_special_settings_routes.py`; `npm --prefix web run typecheck`.
- **Lesson**: Navigation personalization that affects multi-node operator UX must be treated as replicated configuration state, not transient UI state.

**26. MPX1 Inbound SysEx Uses Multiple Header/Frame Classes (HIGH - Feb 27, 2026)**
- **Files**: `app/services/mpx1_service.py`, `tests/test_mpx1.py`, `docs/mpx1/SYSEX_NOTES.md`, `docs/mpx1/CONNECT.md`
- **Problem**: Live MPX diagnostics showed inbound frames (`F0 06 09 00 01 01 ... F7`) being logged as `rx_sysex_unknown`, blocking physical-control validation.
- **Root Cause**: Decoder previously accepted only one fixed header (`F0 06 7F 11`) and assumed short param-write frame shape.
- **Fix**: Hardened decode path to accept Lexicon device-id/function header variants and optional extra command-prefix byte before address for param-style frames; added long-frame class decoders for `01 02` (program status) and `01 01` (panel status) plus regression tests.
- **Verification**: `pytest -q tests/test_mpx1.py` (32 passed), live diagnostics classify `01 02` frames as `rx_program_sysex` with deterministic `current_program` updates.
- **Lesson**: MPX hardware emits both short param frames and long state/report SysEx classes; treat header/device-id as variable and keep decode paths format-aware.

**27. Default LV2 Chain Inventory Lives in Deployment Manifest (HIGH - Mar 20, 2026)**
- **Files**: `app/deployment/default_lv2_effects.json`, `app/services/default_effects_manifest.py`, `app/services/default_effects_loader.py`, `app/services/chain_service.py`
- **Problem**: Default chain templates and runtime inventory audits drift when services assume a stale or nonexistent config file instead of the deployment manifest actually shipped on the host.
- **Root Cause**: Default effects loading was split between legacy config-path assumptions and live runtime discovery.
- **Fix**: Centralize default inventory/template reads through `app/deployment/default_lv2_effects.json` via `default_effects_manifest.py`, and validate parity against `/api/plugins/discover`.
- **Verification**: `python3 scripts/audit_plugin_inventory_live.py --base-url http://localhost:8080`; `pytest -q tests/test_default_effects_manifest.py tests/test_chain_service_runtime_mapping.py`.
- **Lesson**: The deployment manifest is the canonical default LV2 inventory contract; if it drifts from runtime, fix the manifest or the deployment, not the UI heuristics.

**28. Duplicate Plugin Telemetry Must Be Identity-Aware End to End (HIGH - Mar 20, 2026)**
- **Files**: `app/services/plugin_profiler.py`, `app/services/juce_engine_service.py`, `app/routes/profiling.py`, `app/services/audio_meters.py`, `web/src/map2/utils/pluginTelemetry.ts`, `web/src/map2/components/ChainBuilder.tsx`
- **Problem**: Duplicate-URI effects can look correct for editing/reorder while still sharing CPU or meter badges.
- **Root Cause**: Runtime telemetry commonly regresses to URI-only keys, and even a small control-path bug such as a stranded instance lookup can collapse duplicate instances back together.
- **Fix**: Preserve `instance_id` / `plugin_position` through profiler stats, runtime CPU telemetry, plugin VU levels, websocket meter payloads, and UI map keys; only fall back to URI when the engine truly provides no identity.
- **Verification**: `pytest -q tests/test_plugin_profiler_identity.py tests/test_juce_engine_service_instance_resolution.py tests/test_plugin_telemetry_identity.py`; `npm --prefix web run typecheck`; `npm --prefix web test -- --runInBand web/src/map2/utils/pluginTelemetry.test.ts`.
- **Lesson**: Duplicate-plugin support is not complete until read-only telemetry paths are instance-safe too.

**29. JUCE Grid Bottom-Editor Tests Need Persisted Selected-Block State (MEDIUM - Mar 21, 2026)**
- **Files**: `web/src/app/pages/JuceGridPage.test.tsx`, `web/src/app/pages/JuceGridPage.tsx`
- **Problem**: Desktop bottom-editor integration tests can fail to find mocked `Select block` controls even when the selected-block editor path itself is correct.
- **Root Cause**: The reliable contract for the bottom editor is the persisted selected-plugin/editor-open state, not the mocked signal-canvas click path in every fixture.
- **Fix**: For tests that verify the reserved editor shell or desktop selected-block MIDI panel, seed `map2_juce_grid_flows_v2`, `map2_juce_grid_active_v2`, `map2_juce_grid_selected_plugin_uri`, and `map2_juce_grid_effect_modal_open` in `localStorage` before rendering.
- **Verification**: `cd web && npm test -- --runTestsByPath src/app/pages/JuceGridPage.test.tsx --runInBand --silent`; `cd web && npm test -- --runTestsByPath src/app/pages/JuceGridSelectedBlockMidiPanel.test.tsx --runInBand --silent`
- **Lesson**: When testing JUCE Grid bottom-editor surfaces, use the persisted selection contract the page restores at startup instead of overfitting to intermediate UI selection mechanics.

**30. Realtime Parameter Paths Must Preserve Duplicate Plugin Identity (HIGH - Mar 23, 2026)**
- **Files**: `app/services/realtime_parameter_bridge.py`, `app/services/parameter_routing.py`, `app/routes/websocket_rt.py`, `web/src/map2/realtimeParams.ts`, `web/src/map2/hooks/useRTParameter.ts`, `web/src/app/hooks/useJucePluginRT.ts`
- **Problem**: Duplicate plugin instances can still cross-talk during live websocket control even after chain serialization, snapshots, and A/B morphing are fixed.
- **Root Cause**: The dedicated realtime path originally keyed cache entries, subscriptions, reconnect resubscribe state, and engine callbacks as `(plugin_uri, param_index)` only, which silently collapses repeated plugin URIs back together.
- **Fix**: Carry `instance_id` / `plugin_position` through realtime websocket messages, bridge cache/subscription keys, coalescing keys, frontend subscription identity, reconnect resubscribe state, and the engine callback path; when JUCE updates include explicit identity, bypass URI-only dispatch and route directly to the resolved runtime instance.
- **Verification**: `pytest -q tests/test_realtime_parameter_bridge_identity.py tests/test_parameter_routing_identity.py`; `npm --prefix web run typecheck`; `npm --prefix web test -- --runInBand web/src/map2/realtimeParams.test.ts`
- **Lesson**: Low-latency control paths are correctness-critical state, not UI-only transport; if duplicate plugins are supported anywhere in the product, websocket parameter routing must be identity-aware too.

**31. Persisted MIDI And Automation Targets Must Store Plugin Position (HIGH - Mar 23, 2026)**
- **Files**: `app/database.py`, `app/services/midi_engine.py`, `app/services/midi_service.py`, `app/services/juce_engine_service.py`, `app/services/automation_engine.py`, `app/routes/midi.py`, `app/routes/midi_v2.py`, `app/routes/automation.py`
- **Problem**: Even after live websocket and snapshot paths are duplicate-safe, restartable MIDI learn/mapping state and automation lanes can still collapse duplicate plugin URIs back onto the first loaded instance.
- **Root Cause**: Persisted control producers originally stored only `plugin_uri:param_index`, and the JUCE MIDI bridge wrappers did not resolve duplicate-safe runtime instance IDs when rehydrating mappings or starting learn mode.
- **Fix**: Add additive SQLite columns for persisted `plugin_position`, store/reload that identity in MIDI mappings, learn state, and automation lanes, resolve JUCE MIDI mappings/learn targets to instance IDs via `plugin_position`, and use duplicate-safe automation parameter IDs (`plugin_uri:param_index@position`) for route compatibility.
- **Verification**: `pytest -q tests/test_midi_automation_identity_persistence.py tests/test_parameter_routing_identity.py tests/test_realtime_parameter_bridge_identity.py tests/test_chains_ab_mode_identity.py tests/test_flow_snapshots_routes.py tests/test_juce_engine_service_instance_resolution.py tests/test_chain_service_runtime_mapping.py tests/test_plugins_residency.py tests/test_plugins_engine_op_pipeline.py tests/test_nam_ir_instance_routes.py tests/test_juce_engine_current_pedalboard_identity.py`
- **Lesson**: Duplicate-instance support is not complete until persisted control producers, native rehydration paths, and route compatibility layers all preserve the same identity contract as the live websocket transport.

**32. MIDI Snapshot Recall Must Delegate To SnapshotService (HIGH - Mar 29, 2026)**
- **Files**: `app/services/midi_service.py`, `app/services/snapshot_service.py`, `tests/test_midi_service_snapshot_program_change.py`
- **Problem**: MIDI program-change snapshot recall could still bypass the canonical snapshot-first model because `MIDIService` looked up the deprecated `FlowSnapshot` table directly.
- **Root Cause**: Snapshot-first route/editor migration removed most compatibility surfaces, but the MIDI bridge kept a private legacy lookup/broadcast implementation instead of reusing the canonical snapshot activation service.
- **Fix**: Resolve snapshots by program through `SnapshotService.get_snapshot_by_program()` and activate them with `SnapshotService.activate_snapshot(triggered_by="midi_pc")`; keep focused tests that prove snapshot recall wins before chain fallback.
- **Verification**: `pytest -q tests/test_midi_service_snapshot_program_change.py tests/test_snapshot_service.py`
- **Lesson**: Snapshot recall is a single contract. Any trigger source, including MIDI program change, must route through `SnapshotService` rather than rebuilding snapshot loading logic inside secondary services.

---

## 5-Question Clarification Protocol

Before acting on any directive that involves code changes or architectural decisions, **ask exactly 5 multiple-choice questions** to disambiguate intent, scope, constraints, and edge cases.

### Rules

1. **Trigger**: Fires on any directive involving code changes or architectural decisions. Does not fire on trivial one-liners (e.g. "fix this typo", "rename this variable"). If the user explicitly says "ask questions", "ask me questions", or "ask 5 questions", that phrase itself requires this protocol instead of ad-hoc batch questioning.

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

### The Golden Rule for AI Assistants

**ALWAYS PLAN BEFORE IMPLEMENTING**

When a user requests a feature or fix:

1. **Read First** (gather context)
   - Check Essential Files list for relevant docs
   - Read Golden Example Files for similar patterns
   - Search for existing implementations: `grep -rn 'pattern' src/`

2. **Plan Second** (create task breakdown)
   - Use `manage_todo_list` to create task breakdown
   - Identify dependencies and order tasks
   - Estimate complexity and risk

3. **Verify Third** (check assumptions)
   - Verify file exists and is imported
   - Check bundle will include changes: `grep -rn 'import.*Component'`
   - Validate against build output after changes

4. **Execute Fourth** (implement with verification)
   - Make changes in logical order
   - Build after each major change
   - Verify in bundle: `grep -c 'searchTerm' dist/assets/Page-*.js`

5. **Test Fifth** (validate end-to-end)
   - Check server responds correctly
   - Clear browser cache and test
   - Verify in production mode, not dev

### Example: Adding New GridFlow Colors

**❌ BAD (No Planning):**
```
User: "Change grid colors to purple"
AI: *immediately edits first file found*
*realizes it's the wrong file after 3 build cycles*
```

**✅ GOOD (Plan-First):**
```
User: "Change grid colors to purple"

AI: *reads AI_GRIDFLOW_COMPONENT_MAP.md*
AI: *creates todo list*
  1. Find SLOT_COLORS constant in GridFlowPage.tsx
  2. Update color values
  3. Build and verify hash changes
  4. Check colors in bundle with grep
  5. Verify FlowRoutingVisualizer uses updated colors
  
AI: *executes in order*
  - grep -n 'SLOT_COLORS' web/src/app/pages/GridFlowPage.tsx
  - Edit GridFlowPage.tsx
  - npm run build
  - grep -c 'purple-hex' dist/assets/GridFlowPage-*.js
  - ✅ Found in bundle
```

### When to Use Plan-First

**ALWAYS use for:**
- Multi-file changes
- Component architecture changes
- Build system modifications
- Server configuration changes
- Performance-critical code

**Optional for:**
- Single-line bug fixes
- Documentation updates
- Adding simple comments
- Formatting changes

### Planning Tools

```bash
# Use manage_todo_list for task tracking
manage_todo_list write [
  {id: 1, title: "Find component file", status: "not-started"},
  {id: 2, title: "Verify imports", status: "not-started"},
  {id: 3, title: "Make changes", status: "not-started"},
  {id: 4, title: "Build and verify", status: "not-started"}
]

# Mark in-progress before starting
manage_todo_list write [
  {id: 1, title: "Find component file", status: "in-progress"},
  ...
]

# Mark completed immediately after finishing
manage_todo_list write [
  {id: 1, title: "Find component file", status: "completed"},
  {id: 2, title: "Verify imports", status: "in-progress"},
  ...
]
```

---

## Critical System Rules

### Configuration Authority Model

- MAP2 uses a plane-based authority model for config and state, not a fake single-file source of truth.
- `/etc/map2` is for host desired configuration and generated machine-scoped artifacts required by boot, systemd, or service startup.
- `/var/lib/map2` is for durable service-managed state such as registries, event stores, backups, and cluster/service data.
- `~/.map2` is for user/operator/session-scoped state, preferences, local content, and compatibility shims that are not host or cluster authority.
- Runtime/control-plane systems such as `/proc`, PipeWire metadata/graph state, etcd, and Raft are live observed state or dedicated control-plane authority; they must not be flattened into static config and then treated as authoritative.
- For any new field, decide its plane first. If that decision is unclear, the design is not ready.
- If the same concept appears in multiple places, one location must be declared authoritative and the others must be documented as generated projections, caches, or compatibility layers.
- Prefer reducing mirrors over adding new ones. Never add a new config store for an existing concept without removing ambiguity elsewhere.
- Transitional exception: deployment mode currently spans `/etc/guitarfx-mode.conf`, `/etc/map2/environment`, `~/.map2/deployment.json`, and systemd mode drop-ins. Treat `map2-mode.sh` as the reconciliation entrypoint and do not introduce a fourth/fifth parallel store.
- Reference: `docs/architecture/CONFIGURATION_AUTHORITY_MODEL.md`

### Live State Source Of Truth

- The platform source-of-truth system is the canonical operator-facing authority for live audio state, path state, and related topology shown in GUI surfaces such as Audio Table.
- Direct JUCE realtime state is still the low-level runtime fact source, but it must reach operator surfaces through the platform authority model instead of ad hoc route-local reads, cached websocket residue, or `chain.is_active` style fallbacks.
- For audio-state work, use the authoritative audio-state contract (`committed`, `desired`, `observed`) as the standard pattern: operator surfaces read the control-plane authority object, node/runtime layers publish observations into it, and UI/editor code must not invent a second competing source of truth.
- Backend/database rows, cached query results, websocket reconnect state, and last-known GUI payloads may describe intent or previous observations, but they must never be treated as proof that audio is currently live.
- UI and backend flows may represent commands such as `Make Live`, MIDI Program Change recall, or activation requests as requested/pending work, but they must not promote that state to `live` until the realtime process explicitly reports successful activation.
- If realtime confirmation is missing, delayed, or disconnected, operator surfaces must degrade to a non-authoritative state such as `pending`, `unknown`, `stale`, or `failed` rather than presenting cached live status as fact.
- Any multi-node synchronization model must replicate runtime-issued state from the active realtime authority outward through the shared source-of-truth system; it must not invent or infer live truth from cache reconciliation alone.
- When designing new topology or graph views, prefer layering the authority model explicitly:
  - control-plane truth for committed/desired live state
  - observed/runtime truth for node-specific execution status
  - direct engine payloads only when they are being surfaced as observations, diagnostics, or diff context rather than a parallel live-state authority

### Audio Performance (Tier A Requirements)

**Locked Settings (NEVER change at runtime):**
1. `audio.sample_rate` - Locked at 48000 Hz
2. `audio.buffer_size` - Locked at 128 samples
3. `audio.backend` - Locked at "pipewire"

**Changing these requires:**
```bash
# 1. Edit systemd service configuration
sudo systemctl edit map2-audio

# 2. Restart service
sudo systemctl restart map2-audio

# 3. Verify with test script
python3 test_tier_a_locks.py
```

**Test output should show:**
```
✅ All critical performance settings are LOCKED
```

### Latency Targets

| Use Case | Target | Critical? |
|----------|--------|-----------|
| Live guitar performance | < 5 ms | Yes - drummer sync |
| Studio recording | < 10 ms | Less critical |
| Backing track playback | < 10 ms | No - not live |
| Band performance | < 6 ms | Yes - bass/drum sync |

### Performance Metrics

**Critical gaps that block professional use:**
- ❌ Worst-case jitter not measured (must be < 200 µs)
- ❌ Xrun rate not tested (must be 0 in 8-hour session)
- ❌ CPU headroom not benchmarked (must be > 30% free)
- ❌ Stress testing not performed (need 8-hour validation)
- ❌ Loopback latency measurement never performed

### Error Handling Patterns

**PipeWire Recovery:**
```python
# === Critical: PipeWire daemon down ===
# Automatic recovery with exponential backoff

# === Critical: JACK server down ===
# Fallback to ALSA with notification

# === Critical: Audio device disconnected ===
# Queue buffer, attempt reconnect, graceful degradation
```

**Plugin Priority Levels:**
```python
CRITICAL = 0  # Always in memory (high-frequency effects)
CORE = 4      # Always must work (critical)
```

**Service Priority:**
```python
# Performance metrics are always running in background
# Always invalidate plugin cache to remove from database
# Always include JUCE native processors (best-in-class built-in effects)
```

---

## Performance & Latency

### CPU Isolation (Real-Time Critical)

**Must verify:**
```bash
# Check isolcpus setting
cat /proc/cmdline | grep isolcpus
# Should show: isolcpus=2,3

# Verify audio process pinned to isolated cores
taskset -cp $(pgrep juce-engine)

# Verify settings NOT changeable at runtime
python3 test_tier_a_locks.py
```

### Buffer Size Calculation

```
Latency (ms) = (buffer_size / sample_rate) * 1000
128 samples @ 48kHz = 2.67 ms per buffer
Round-trip latency = input buffer + processing + output buffer
Target: < 5 ms total
```

### Validation Checklist

**Before claiming professional-grade:**
- [ ] Measured latency with loopback test (CRITICAL GAP)
- [ ] Characterized jitter (worst-case < 200 µs)
- [ ] Stress tested 8 hours with full plugin chain
- [ ] Verified xrun rate = 0
- [ ] Benchmarked CPU headroom > 30%
- [ ] Tested failover/recovery mechanisms
- [ ] Validated against industry specs
- [ ] Verified Tier A locks are enforced

---

## Update Log

### [2026-04-19] - LCD PlatformEvent Hard Cutover
- **Section**: Style & Architecture Rules, Update Log
- **Change**: Documented the rule that LCD/runtime surfaces must consume `PlatformEventBus` and `PlatformEventStore` directly and that the legacy LCD bus/router/aggregator/persistence stack must not be reintroduced.
- **Reason**: `T2363-subG` removed the parallel LCD event system and made the `/api/lcd/*` surface a projection of canonical PlatformEvents instead of a second runtime control plane.
- **Impact**: Future LCD, peer-discovery, or operator-surface work should extend the canonical PlatformEvent pipeline and avoid adding LCD-local buses, routers, or event-history stores.
- **Files**: `.gemini/instructions.md`, `.github/copilot-instructions.md`, `app/services/lcd_manager.py`, `app/routes/lcd_events.py`, `app/services/platform_event/lcd_projection.py`, `docs/PROJECT_WORKLIST.md`

### [2026-04-17] - ReactFlow Density Thresholds And Alert De-Islanding
- **Section**: Gotchas & Learned Fixes, Performance & Latency
- **Change**: Added the shared ReactFlow density-threshold rule (`40/80`, `100/200`, `180/360` nodes/edges) and documented the expectation to reduce graph chrome as density rises; also captured the removal of the legacy MUI alert-stack wrapper from `web/src/app/hooks/useAlertNotifications.tsx`.
- **Reason**: The frontend responsiveness audit needed concrete graph-behavior thresholds, and the web shell still had a leftover MUI/Emotion island in the alert path.
- **Impact**: Future graph work should instrument density before adding more chrome, and small cross-cutting MUI islands should be retired instead of normalized as permanent exceptions.
- **Files**: `.gemini/instructions.md`, `docs/design/FRONTEND_FRAMEWORK_RETIREMENT_AUDIT_2026-04-17.md`, `web/src/app/components/shared/reactFlowDensity.ts`, `web/src/app/hooks/useAlertNotifications.tsx`
- **Status**: Active

### [2026-04-16] - Plane-Based Configuration Authority Model
- **Section**: Critical System Rules
- **Change**: Added the standing rule that MAP2 configuration must be modeled by authority plane: `/etc/map2` for host desired config, `/var/lib/map2` for durable service/cluster state, `~/.map2` for user/session-scoped state, and runtime systems such as `/proc`, PipeWire, etcd, and Raft as observed or control-plane authority rather than static config.
- **Reason**: Configuration analysis found recurring confusion caused by mixing static config, durable state, and live observations into the same “source of truth” discussion, which encourages duplicate stores and drift.
- **Impact**: Future AI should classify each new config/state field by plane before implementation, avoid adding parallel stores for the same concept, and document any temporary compatibility mirrors explicitly.
- **Files**: `.gemini/instructions.md`, `docs/AGENTS.md`, `docs/CLAUDE.md`, `docs/architecture/CONFIGURATION_AUTHORITY_MODEL.md`
- **Status**: Active

### [2026-04-13] - No-Gradient UI Rule
- **Section**: Web Development Guidelines, Gotchas & Learned Fixes
- **Change**: Added the project-wide no-gradients rule for live UI and documented the follow-on cleanup hotspot inventory in the canonical worklist.
- **Reason**: Gradient styling had re-entered active surfaces without a single authoritative rule saying it was disallowed.
- **Impact**: Future frontend work should fail closed on gradients and use flat Carbon-aligned surfaces by default.
- **Files**: `.gemini/instructions.md`, `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`
- **Status**: Active

### [2026-04-07] - State Authority Downstream Contract
- **Section**: Critical System Rules, Gotchas & Learned Fixes
- **Change**: Documented the final `T778` downstream contract: `snapshots.document` is the canonical persisted snapshot payload, the `snapshot_*` relational rows are compatibility projections only, `SnapshotService.to_legacy_snapshot_data()` is a compatibility adapter rather than an extension point, and future Brain restore work must keep using merged desired+committed authority projections.
- **Reason**: The qualification and cutover work is not actually complete if later assistants can still extend the old compatibility shape or reintroduce file-first Brain restore behavior by mistake.
- **Impact**: Future snapshot, MIDI recall, activation, and Performance Brain work should extend the dedicated State Authority services and authority-sync pipeline instead of rebuilding features on top of the compatibility tables or the legacy flow-snapshot payload.
- **Files**: `.gemini/instructions.md`, `.github/copilot-instructions.md`, `docs/STATE_AUTHORITY_DOWNSTREAM_CONTRACT.md`, `app/services/snapshot_service.py`
- **Status**: Active

### [2026-04-03] - Platform Source-Of-Truth Rule For Audio Table And Live Topology
- **Section**: Critical System Rules
- **Change**: Updated the live-state authority rule to reflect the platform source-of-truth system as the canonical operator-facing model, with JUCE/runtime facts feeding UI through the authoritative audio-state pattern (`committed`, `desired`, `observed`) instead of route-local runtime residue.
- **Reason**: The product direction for the Audio Table flagship redesign was clarified: new topology, table, and runtime-inspection work must align to the platform authority system, not bypass it with direct per-surface reads.
- **Impact**: Future AI should treat Audio Table, live graphs, cluster/runtime topology, and similar operator surfaces as authority-driven by default, using direct JUCE/runtime data only as observation/diagnostic inputs inside that model.
- **Files**: `.gemini/instructions.md`
- **Status**: Active

### [2026-04-03] - Hard-Cut `/audio-table` Into `/platforms` Workspaces
- **Section**: Style & Architecture Rules
- **Change**: Recorded the product decision that the standalone `/audio-table` route is no longer the target architecture. Its surviving graph/table/operator concepts should migrate into the appropriate `/platforms/*` workspaces, and platform-facing references to `audio-table` should be removed rather than maintained in parallel. The `/audio-table` route should be removed with no legacy redirect, and the old `AudioTable` code/tests should be deleted in the same hard-cut workstream rather than parked as legacy.
- **Reason**: The user clarified that the React Flow-first operator experience belongs inside the `/platforms` shell and wants a hard cut, not a coexistence phase with duplicate navigation and duplicate concepts.
- **Impact**: Future AI should prefer extending `/platforms` workspace structure, navigation, and data integration rather than evolving `/audio-table` as an independent platform surface.
- **Files**: `.gemini/instructions.md`, `docs/PROJECT_WORKLIST.md`
- **Status**: Active

### [2026-04-03] - React Flow-First Rule For `/platforms` Submenus
- **Section**: Style & Architecture Rules
- **Change**: Recorded the product rule that every operational/data `/platforms` submenu should receive a dataset-specific React Flow canvas with a consistent graph-on-top, table-on-bottom structure, except `/platforms/overview`, which remains a supervisory landing surface with no flow canvas. JUCE controls specifically belong under `/platforms/audio-engine`. Utility workspaces such as `about`, `theme`, `host-machine`, and `workspace-catalog` should instead be moved to the bottom of the `/platforms` navigation and styled with Carbon green navigation buttons. Network discovery should read already-collected node-health and heartbeat telemetry rather than launching fresh probes from the UI.
- **Reason**: The user expanded the migration from a single Audio Table replacement into a shell-wide `/platforms` pattern, where each workspace needs its own purpose-built topology/flow surface.
- **Impact**: Future AI should design `/platforms` workspaces around React Flow as the primary canvas, not treat flow diagrams as a one-off Audio Table feature. When choosing canvas styling, the shared shell remains Carbon-oriented, but the React Flow canvases may use current best-in-class visual patterns even when not strictly Carbon compliant.
- **Files**: `.gemini/instructions.md`, `docs/PROJECT_WORKLIST.md`
- **Status**: Active

### [2026-03-30] - Realtime Process Live-State Authority Rule
- **Section**: Critical System Rules
- **Change**: Added the standing rule that the JUCE realtime process is the only authoritative source of truth for live snapshot/path state, and that GUI/backend caches may express intent but must never assert live audio without runtime confirmation.
- **Reason**: The platform requirement was clarified explicitly during snapshot/live-state architecture review and needs to govern all future activation, sync, and cluster-state work.
- **Impact**: Future GUI, backend, snapshot, MIDI recall, and multi-node synchronization work must model runtime-confirmed truth instead of cached or database-inferred live state.
- **Files**: `.gemini/instructions.md`
- **Status**: Active

### [2026-03-24] - Stable Platform Version Artifacts Across Rebuild Loops
- **Section**: Gotchas & Learned Fixes (#10), Build & Deployment Workflow
- **Change**: Documented the split between stable tracked build identity and live runtime git metadata so clean rebuilds on port `3000` no longer re-dirty `VERSION` and `version.json`.
- **Reason**: Repeated user-requested deploy loops were leaving the repo dirty immediately after a successful restart, which broke clean-handoff expectations.
- **Impact**: Future rebuild/restart cycles can be validated from a clean tree without forcing a follow-up commit that only captures version-file churn.
- **Files**: `.gemini/instructions.md`, `app/utils/platform_version.py`, `scripts/generate_platform_version.py`, `tests/test_platform_version.py`
- **Status**: Active

### [2026-03-24] - Frontend Rebuild Gate After Drum GUI Closure
- **Section**: Gotchas & Learned Fixes (#9), Build & Deployment Workflow
- **Change**: Documented that full `npm --prefix web run build` is the authoritative pre-restart gate because focused typecheck/tests can miss production-build blockers such as declaration-order mistakes and stale generated/default state contracts.
- **Reason**: The cycle-1 rebuild for the drum-machine work caught real deployment blockers that were invisible to the earlier scoped validation commands.
- **Impact**: Future `update` or restart requests should always run the full web build before replacing the live `3000` listener.
- **Files**: `.gemini/instructions.md`, `web/src/app/pages/DrumsPage.tsx`, `web/src/map2/drumMachineState.ts`, `web/src/map2/drumMachineState.test.ts`
- **Status**: Active

### [2026-03-24] - DrumSequencer Stack-Overflow Test Fix
- **Section**: Gotchas & Learned Fixes (#8)
- **Change**: Documented the standalone native-test crash caused by `DrumSequencer` carrying its full pattern store inline by value and the fix to move that storage to heap-backed ownership.
- **Reason**: The `T392` crash only reproduced in the native harness constructor path, and without recording the cause it is easy to regress by reintroducing large stack-resident aggregates in real-time classes.
- **Impact**: Future drum/native test work should treat very large state containers as heap-backed by default and use full `ctest` as the sign-off gate after native layout changes.
- **Files**: `.gemini/instructions.md`, `juce-engine/Source/DrumMachine/DrumSequencer.h`, `juce-engine/Source/DrumMachine/DrumSequencer.cpp`, `docs/PROJECT_WORKLIST.md`
- **Status**: Active

### [2026-03-23] - Adoption Lifecycle Separation And Runbook Rule
- **Section**: Gotchas & Learned Fixes (#14), Work Tracking
- **Change**: Documented the rule that discovery, trust, readiness, and activation must remain separate adoption states and added the canonical operator/engineering runbook for pairing-code claims, signed-token claims, standby promotion, and selective profile cloning.
- **Reason**: The adoption backend and UI are now shipped, but future work will regress quickly if teams collapse the lifecycle back into "discovered means usable" or let clone flows copy identity/trust material.
- **Impact**: Future second-node and AVB onboarding work should reuse the shared adoption state machine and the runbook instead of creating route-local onboarding semantics.
- **Files**: `.gemini/instructions.md`, `docs/ADOPTION_WORKFLOW_RUNBOOK.md`, `app/services/cluster/adoption.py`, `app/routes/adoption.py`, `app/services/cluster/adoption_bootstrap.py`, `app/routes/bootstrap.py`, `web/src/app/pages/HomePage.tsx`
- **Status**: Active

### [2026-03-23] - Unified Node Visibility Snapshot Rule
- **Section**: Gotchas & Learned Fixes (#13), Python Backend Gotchas
- **Change**: Documented the merged visibility-snapshot rule for second-node operator surfaces and the registry-row endpoint-resolution fix required for heartbeat monitoring.
- **Reason**: The second-node audit found that peer discovery, cluster online-node views, `/api/cluster/discovered`, welcome-grid counts, and AVB router discovery were all using different contracts and could disagree about the same reachable peer.
- **Impact**: Future cluster/AVB discovery work should extend the shared visibility snapshot instead of inventing new per-route/per-service discovery logic, and registry consumers should treat registry rows as dict payloads unless explicitly modeled otherwise.
- **Files**: `.gemini/instructions.md`, `app/services/cluster/node_visibility.py`, `app/routes/peer_discovery.py`, `app/routes/cluster_health.py`, `app/routes/cluster_admin.py`, `app/services/cluster/heartbeat_monitor.py`, `app/services/avb/avb_router.py`, `app/services/node_discovery_service.py`, `tests/test_cluster_visibility_routes.py`, `tests/test_avb_router_map2.py`, `web/src/app/contexts/ClusterContext.tsx`, `web/src/app/pages/HomePage.tsx`
- **Status**: Active

### [2026-03-23] - AVB Semantic Status Marker Test Rule
- **Section**: Gotchas & Learned Fixes (#16), React/TypeScript Gotchas
- **Change**: Documented the AVB routing rule to wrap status/link glyphs with explicit accessibility labels and to assert those semantics in tests instead of icon-library `data-testid`s.
- **Reason**: The canonical AVB routing Jest run failed in badge and cross-node suites after icon rendering changed even though operators would still see the expected glyphs.
- **Impact**: Future AVB routing and similar frontend tests should remain stable across icon-library implementation drift while still validating the real operator-visible contract.
- **Files**: `.gemini/instructions.md`, `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.tsx`, `web/src/app/components/AvbRouting/components/RoutingGrid/MatrixCell.tsx`, `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.badges.test.tsx`, `web/src/app/components/AvbRouting/components/RoutingGrid/MatrixCell.crossNode.test.tsx`
- **Status**: Active

### [2026-03-23] - Malformed `nodes` Normalization Rule For AVB And MIDI Queries
- **Section**: Gotchas & Learned Fixes (#17), React/TypeScript Gotchas
- **Change**: Documented the boundary-normalization rule for `payload.nodes` in AVB cluster fanout, AVB discovery, and MIDI patchbay topology readers, including the fallback-to-empty/fallback-to-port-ids behavior.
- **Reason**: The malformed-topology crash family kept resurfacing because query and render code treated transport `nodes` payloads as trusted arrays or records and threw when the backend returned partial shapes.
- **Impact**: Future cluster/discovery/topology work should normalize `nodes` at the hook/helper boundary rather than casting deep inside UI components, which keeps bad backend payloads from taking down the shell.
- **Files**: `.gemini/instructions.md`, `web/src/app/components/AvbRouting/hooks/useAvbApi.ts`, `web/src/app/components/AvbRouting/hooks/useNodeApi.ts`, `web/src/app/components/MidiHub/MidiPatchbay.tsx`, `web/src/app/components/MidiHub/patchbayTopology.ts`
- **Status**: Active

### [2026-03-23] - AVDECC Controller Contract Coverage Rule
- **Section**: Gotchas & Learned Fixes (#15), Python Backend Gotchas
- **Change**: Documented the replacement-coverage rule that the supported AVDECC test surface is the `Map2AvdeccController` compatibility contract exposed through pybind snake_case engine methods and the remaining camelCase controller fallbacks in backend route/router code.
- **Reason**: `T376` removed the retired AVDECC model/enumerator tests, and `T388` needed an explicit replacement target so future work does not silently drift back to testing dead internal types.
- **Impact**: Future AVDECC changes should extend the controller/pybind contract tests instead of reviving the deleted legacy-model harness, which keeps backend coverage aligned with the production API surface.
- **Files**: `.gemini/instructions.md`, `juce-engine/Source/AvdeccController.h`, `juce-engine/Source/PythonBindings.cpp`, `app/routes/avb.py`, `app/services/avb/avb_router.py`, `tests/test_avdecc_controller_contract.py`, `tests/test_avdecc_aem_cache.py`, `tests/test_avdecc_mock_integration.py`
- **Status**: Active

### [2026-03-23] - LCD Manager Runtime Registration Rule For Peer Discovery
- **Section**: Gotchas & Learned Fixes, Python Backend Gotchas
- **Change**: Documented the explicit LCD-manager registration pattern required for `/api/peers` and related runtime routes, including startup/shutdown wiring and HTTP-level regression coverage.
- **Reason**: The second-node audit surfaced a live `500` on `/api/peers` because route code imported a nonexistent manager singleton from the LCD service module.
- **Impact**: Future route/service integrations should register live managers explicitly and verify the real route surface instead of assuming an ambient global exists.
- **Files**: `.gemini/instructions.md`, `app/services/lcd_manager.py`, `app/main.py`, `app/routes/peer_discovery.py`, `tests/test_peer_discovery_routes.py`
- **Status**: Active

### [2026-03-23] - MIDI-CI Multi-Chunk + Collision Recovery State Rule
- **Section**: Gotchas & Learned Fixes, Python Backend Gotchas
- **Change**: Documented that MIDI-CI recovery sends must not clear collision/invalidation error state and that multi-chunk subscription/property tests must inject the full generated packet set.
- **Reason**: The advanced MIDI2 completion pass exposed a false-clean status regression after collision recovery and a test-harness blind spot where only chunk 1 of generated MIDI-CI traffic was delivered.
- **Impact**: Future MIDI2/MIDI-CI work should preserve meaningful operator-visible error state during automatic recovery and keep test fixtures protocol-accurate for chunked traffic.
- **Files**: `.gemini/instructions.md`, `app/services/midi_hub/midi2.py`, `tests/midi_hub/test_routes.py`, `tests/midi_hub/test_traffic_routes.py`
- **Status**: Active

### [2026-03-22] - Direct Asset Upload Activation for NAM and IR Editors
- **Section**: Gotchas & Learned Fixes (#15), React/TypeScript Gotchas
- **Change**: Documented the selected-block asset-upload failure mode and the reusable direct file-chooser pattern that immediately activates uploaded NAM and IR assets.
- **Reason**: The JUCE Grid selected-block NAM/Cabinet/Reverb editors remained practically unusable until upload and activation were collapsed into one visible workflow.
- **Impact**: Future asset-backed editor work should preserve a visible local-file chooser on the active card surface and auto-select the uploaded asset instead of requiring a second hidden step.
- **Files**: `.gemini/instructions.md`, `.github/copilot-instructions.md`, `web/src/app/components/loaders/AssetUploadButton.tsx`, `web/src/app/components/loaders/NAMManagerDialog.tsx`, `web/src/app/components/loaders/IRManagerDialog.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/ReverbIRCard.tsx`
- **Status**: Active

### [2026-03-21] - JUCE Grid Selected-Block MIDI Panel Test Fixture Rule
- **Section**: Gotchas & Learned Fixes (#29)
- **Change**: Added a standing note that bottom-editor integration tests should seed persisted selected-block state instead of depending on mocked signal-canvas selection paths.
- **Reason**: The desktop selected-block MIDI panel work exposed a flaky fixture pattern that obscured the real editor-restoration contract.
- **Impact**: Future JUCE Grid editor and selected-block MIDI tests should be more stable and align with the page's actual persisted-state behavior.
- **Files**: `.gemini/instructions.md`, `web/src/app/pages/JuceGridPage.test.tsx`
- **Status**: Active

### [2026-03-23] - Persisted MIDI/Automation Duplicate Identity Contract
- **Section**: Gotchas & Learned Fixes (#31), Work Tracking
- **Change**: Documented the persisted `plugin_position` requirement for MIDI mappings, MIDI learn state, automation lanes, and JUCE MIDI binding rehydration.
- **Reason**: The duplicate-instance audit found that live websocket routing was fixed while restartable control producers still collapsed duplicate URIs back together.
- **Impact**: Future MIDI learn, automation, route-compatibility, and native JUCE control work should preserve the same duplicate-safe identity contract instead of reintroducing URI-only persistence.
- **Files**: `.gemini/instructions.md`, `docs/PROJECT_WORKLIST.md`, `app/database.py`, `app/services/midi_service.py`, `app/services/automation_engine.py`, `app/services/juce_engine_service.py`
- **Status**: Active

### [2026-03-20] - Effect Inventory + Duplicate Telemetry Contracts
- **Section**: Gotchas & Learned Fixes (#27, #28), Work Tracking
- **Change**: Documented the deployment-manifest source of truth for default LV2 inventory/templates and the end-to-end identity contract for duplicate-plugin telemetry.
- **Reason**: The effect-card remediation exposed two repo-wide failure modes that are easy to miss during isolated UI or backend work.
- **Impact**: Future chain-template, audit, profiler, meter, and duplicate-plugin work should stay aligned with live runtime inventory and per-instance telemetry semantics.
- **Files**: `.gemini/instructions.md`, `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`
- **Status**: Active

### [2026-03-20] - `update` Shorthand Workflow Preference
- **Section**: Build & Deployment Workflow
- **Change**: Added a standing shorthand rule that the user command `update` means commit all current changes, push to both remotes, rebuild the frontend, and restart the port `3000` server.
- **Reason**: Preserve the user's preferred deployment shorthand as an executable workflow, not a vague synonym.
- **Impact**: Future `update` requests should perform the full sync and frontend restart sequence consistently.
- **Files**: `.gemini/instructions.md`, `.github/copilot-instructions.md`
- **Status**: Active

### [2026-03-15] - Explicit "Ask Questions" Trigger Preference
- **Section**: 5-Question Clarification Protocol
- **Change**: Added an explicit trigger rule that user phrases like "ask questions", "ask me questions", or "ask 5 questions" must invoke the one-at-a-time 5-question protocol rather than free-form grouped questions.
- **Reason**: Preserve the user's stated preference and prevent future drift back to ad-hoc multi-question batches.
- **Impact**: Future clarification turns should use the documented sequential protocol whenever the user explicitly asks for questions.
- **Files**: `.gemini/instructions.md`
- **Status**: Active

### [2026-03-14] - JUCE-GRID Snapshot-First Scene Merge Rule
- **Section**: Style & Architecture Rules, Gotchas & Learned Fixes (#13)
- **Change**: Added a standing rule that `JUCE-GRID` must treat scene and snapshot as one concept, with scene-style capabilities folded into the snapshot workflow instead of maintaining parallel surfaces.
- **Reason**: Preserve the user’s explicit product decision and prevent route-level design drift during continued Carbonization work.
- **Impact**: Prevents duplicate state models, conflicting operator language, and split recall workflows on the replacement grid editor.
- **Files**: `.gemini/instructions.md`, `docs/PROJECT_WORKLIST.md`
- **Status**: Active

### [2026-02-27] - MPX1 Inbound SysEx Variant Decode Hardening
- **Section**: Gotchas & Learned Fixes (#26)
- **Change**: Added memory entry for Lexicon header-variant decode support and documented observed long inbound state/report frames (`F0 06 09 00 01 01 ... F7`).
- **Reason**: Preserve the real hardware integration fact pattern needed to close MPX physical-control validation work.
- **Impact**: Prevents regressions to overly strict fixed-header decode logic and accelerates follow-on mapping of long inbound frame classes.
- **Files**: `app/services/mpx1_service.py`, `tests/test_mpx1.py`, `docs/mpx1/SYSEX_NOTES.md`, `docs/mpx1/CONNECT.md`
- **Status**: Active

### [2026-02-27] - Advanced Nav Promotion Persistence + Lexicon Trigger Path
- **Section**: Gotchas & Learned Fixes (#25)
- **Change**: Added memory entry for persisted/sanitized `promoted_advanced_routes` state across DB/API/Raft and dynamic AppShell promotion behavior (including MPX1 mega-menu trigger path).
- **Reason**: Preserve the required contract so promoted Advanced items remain deterministic across reloads and cluster nodes.
- **Impact**: Prevents nav-state drift and regression to static top-nav behavior when operators customize promoted Advanced routes.
- **Files**: `app/database.py`, `app/models.py`, `app/routes/special_settings.py`, `app/services/special_settings_raft.py`, `web/src/app/data/advancedMenuItems.ts`, `web/src/app/hooks/useSpecialSettings.tsx`, `web/src/app/layout/AppShell.tsx`
- **Status**: Active

### [2026-02-25] - JUCE Plugin Lifecycle + Soak Hardening
- **Section**: Gotchas & Learned Fixes (#23)
- **Change**: Added memory entry covering host load lifetime fix, graph invariant hardening, IntelliFX delay-line bounds fix, and LV2 soak auto-reuse stabilization.
- **Reason**: Preserve a multi-root-cause crash fix that spans host lifecycle, DSP safety, and soak orchestration.
- **Impact**: Prevents regression to native segfaults during plugin load/rewire/start-audio stress paths.
- **Files**: `juce-engine/Source/JucePluginHost.cpp`, `juce-engine/Source/JuceAudioGraph.cpp`, `juce-engine/Source/Map2AudioEngine.cpp`, `juce-engine/Source/IntelliFX8VoiceChorusProcessor.cpp`, `tests/test_juce_engine_plugin_load_lifecycle_stability.py`, `tests/test_juce_engine_intellifx_lifecycle_stability.py`, `.codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py`
- **Status**: Active

### [2026-02-25] - Strict Build/Type Gate Before Handoff
- **Section**: Gotchas & Learned Fixes (#24)
- **Change**: Added a hard rule to never handoff with known compile/type errors and to fix all reported errors before marking work complete.
- **Reason**: User-requested standing expectation ("ALWAYS fix all errors").
- **Impact**: Prevents non-deployable checkpoints and reduces iteration churn caused by incomplete validation.
- **Files**: `.gemini/instructions.md`
- **Status**: Active

### [2026-02-22] - AVDECC Stream-Format Negotiation + Pre-Connect Validation
- **Section**: Gotchas & Learned Fixes (#21)
- **Change**: Added memory entry for AECP stream-format get/set support and ACMP pre-connect validation/negotiation workflow.
- **Reason**: Preserve the requirement that stream tuple compatibility is verified/aligned before ACMP handshake.
- **Impact**: Prevents avoidable AVDECC connect failures from mismatched `(channels, sample_rate, bits_per_sample)` tuples.
- **Files**: `juce-engine/Source/AvdeccEntity.h`, `juce-engine/Source/AvdeccEntity.cpp`, `juce-engine/Source/PythonBindings.cpp`, `app/routes/avb.py`, `tests/test_avb_routes_srp.py`
- **Status**: Active

### [2026-02-21] - AVB Stream Ownership Metadata + Inspector Scoping
- **Section**: Gotchas & Learned Fixes (#20)
- **Change**: Added memory entry for deterministic stream ownership fields and ownership-only Inspector node scoping.
- **Reason**: Preserve removal of global fallback heuristics in node-scoped health telemetry.
- **Impact**: Keeps multi-node health snapshots precise even when stream IDs are not directly route-mappable.
- **Files**: `app/services/avb/avb_service.py`, `app/services/avb/avb_router.py`, `app/routes/avb.py`, `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.tsx`, `web/src/app/components/AvbRouting/utils/endpointSchema.ts`, `web/src/app/components/AvbRouting/utils/avbRouteStreams.ts`
- **Status**: Active

### [2026-02-21] - AVTP Init/Teardown Contract Hardening
- **Section**: Gotchas & Learned Fixes (#19)
- **Change**: Added memory entry for descriptor-backed AVTP init and teardown/failure-path validation.
- **Reason**: Preserve removal of placeholder AVTP initialization and enforce regression checks for stream descriptor mapping.
- **Impact**: Prevents transport regressions where AVTP streams initialize without valid format/NSR/length semantics.
- **Files**: `juce-engine/Source/AvbStream.cpp`, `juce-engine/Source/AvbStream.h`, `juce-engine/tests/AvbStreamManagerTests.cpp`, `.gemini/instructions.md`
- **Status**: Active

### [2026-02-21] - AVB Installer Dry-Run Branch Validation
- **Section**: Gotchas & Learned Fixes (#18)
- **Change**: Added memory entry for installer dry-run artifact assumptions and branch-coverage tests.
- **Reason**: Preserve fix for a real dry-run regression surfaced by automated tests.
- **Impact**: Prevents future breakage in installer dry-run mode and keeps AVB branch controls verifiable.
- **Files**: `install_on_new_host.sh`, `tests/test_avb_ops_scripts.py`, `.gemini/instructions.md`
- **Status**: Active

### [2026-02-21] - AVB Default Install + Uninstall Controls
- **Section**: Gotchas & Learned Fixes (#17)
- **Change**: Added a workflow/config gotcha for AVB default-on install behavior and required installer/build/doc synchronization.
- **Reason**: Prevent regressions where AVB defaults diverge between scripts, CMake, and docs.
- **Impact**: Keeps host-install behavior deterministic and operator guidance accurate.
- **Files**: `install_on_new_host.sh`, `juce-engine/CMakeLists.txt`, `README.md`, `docs/avb-setup.md`, `.gemini/instructions.md`
- **Status**: Active

### [2026-02-21] - Canonical AVB Worklist Memory (STATUS PROTOCOL)
- **Section**: Gotchas & Learned Fixes (#13)
- **Change**: Added a project workflow gotcha documenting the canonical AVB worklist location and status reporting order.
- **Reason**: Preserve memory from a user-requested status workflow ("remember").
- **Impact**: Prevents duplicate trackers and inconsistent status reporting across sessions.
- **Files**: `docs/AVB_MASTER_WORK_PLAN.md`, `.gemini/instructions.md`
- **Status**: Active

### [2026-02-12] - MIDI Device Selection Implementation (COMPLETE)
- **Section**: Gotchas & Learned Fixes (#15)
- **Change**: Documented complete MIDI device selection implementation
- **Reason**: Resolved TODO stub that allowed all devices instead of selected device
- **Impact**: MIDI input/output now properly filters to user-selected device via ALSA subscriptions
- **Files**: MidiHandler.h/cpp (~150 lines), docs/MIDI_DEVICE_SELECTION_COMPLETE.md
- **Commit**: `54d6dfd` - Pushed to GitHub master branch
- **Key Lesson**: ALSA requires explicit `snd_seq_subscribe_port()` with sender/dest addresses
- **Status**: ✅ Production-ready, tested, documented, committed, and pushed

---

## Quick Reference Commands

### Development Cycle

```bash
# 1. Make code changes in /web/src/

# 2. Build production bundle
cd /home/mm/map2-audio/web && npm run build

# 3. Refresh browser (server auto-serves new dist/)
# No server restart needed

# 4. Verify changes
curl -s http://localhost:3000/ | grep -o 'index-[^"]*\.js'
```

### Server Restart (Clean Start)

```bash
# Kill everything
kill -9 $(pgrep -f "uvicorn") 2>/dev/null
pkill -9 -f "serve_web_dist.mjs" 2>/dev/null
pkill -9 npm 2>/dev/null

# Start backend
cd /home/mm/map2-audio && nohup python3 -m uvicorn app.main:app 
  --host 0.0.0.0 --port 8080 > /tmp/uvicorn.log 2>&1 &

# Start frontend
cd /home/mm/map2-audio/web && nohup npm run serve > /tmp/preview.log 2>&1 &

# Check status
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

### Debug Bundle Contents

```bash
# Check if component is in bundle
grep -c 'ComponentName' dist/assets/PageName-*.js

# Find component imports
grep -rn 'import.*ComponentName' web/src/app/

# List all chunks
ls -lh dist/assets/*.js

# Check CSS bundle
grep 'your-css-class' dist/assets/index-*.css

# Verify specific colors in GridFlowPage
grep -c '00d9ff' dist/assets/GridFlowPage-*.js  # Cyan
grep -c 'ff006e' dist/assets/GridFlowPage-*.js  # Magenta
grep -c '00ff9f' dist/assets/GridFlowPage-*.js  # Green
```

### Verify System Health

```bash
# Check Tier A locks
python3 test_tier_a_locks.py

# Check CPU isolation
cat /proc/cmdline | grep isolcpus

# Check PipeWire status
systemctl --user status pipewire

# Check audio latency
# TODO: Implement loopback test (CRITICAL GAP)
```

---

## Common Pitfalls to Avoid

### 1. Sleep Commands
❌ `sleep 5 && curl http://localhost:3000/`  
✅ Use log polling or immediate curl (returns 000 if not ready)

### 2. Dev Server
❌ `npx vite --port 3001`  
✅ `cd /home/mm/map2-audio/web && npm run serve`

### 3. Manual Server Restarts
❌ Restarting server after every build  
✅ Server auto-serves new dist/ - just refresh browser

### 4. Editing Unused Components
❌ Editing `JuceAudioGraphViz.tsx` (dead code, never imported)  
✅ Verify imports first: `grep -rn 'import.*Component' web/src/`

### 5. Assuming Failures
❌ "Server down" → restart everything  
✅ Check all 4 layers: build → process → response → cache

### 6. Runtime Config Changes
❌ Changing audio settings via API  
✅ Tier A settings are locked - must edit systemd service

### 7. Missing Build Verification
❌ Assuming build worked if no errors  
✅ Always verify: `grep -c 'expected-value' dist/assets/Page-*.js`

### 8. Manual Chunk Splitting
❌ Custom `manualChunks` in vite.config.ts  
✅ Let Vite handle dependency ordering automatically

### 9. Ignoring Critical Comments
❌ Skipping code comments marked CRITICAL/NOTE/WARNING  
✅ These indicate architectural rules and constraints

### 10. Incomplete Testing
❌ Skipping validation checklist items  
✅ Professional-grade requires all validation steps

### 11. MAP2 Design Language Preference (User Memory)
❌ Introducing unrelated visual systems when IBM-aligned patterns are available  
✅ Prefer IBM Design Language conventions whenever practical:
- Typography: IBM Plex (`--font-sans`, `--font-mono`)
- Colors/tokens: Carbon-style token palette already defined in `web/src/index.css`
- Icons: Use Carbon icon set where licensing permits and migration cost is reasonable
- Licensing: Keep asset usage aligned with upstream licenses before broad adoption

---

## Additional Resources

### Documentation Files
- `.copilot-notes/` - AI collaboration notes and troubleshooting patterns
- `.copilot-notes/server-restart-pattern.md` - Server management best practices
- `.copilot-notes/black-screen-not-cache.md` - Solved Vite chunk splitting issue
- `docs/` - Comprehensive technical documentation
- `docs/AI_GRIDFLOW_COMPONENT_MAP.md` - Component architecture map for Grid page
- `docs/VITE_TROUBLESHOOTING_GUIDE.md` - Build/server diagnostics
- `docs/PROFESSIONAL_GUITAR_PROCESSOR_EVALUATION.md` - Industry standards & requirements
- `docs/TIER_A_IMPLEMENTATION_COMPLETE.md` - Performance requirements & validation
- `docs/EVALUATION_SUMMARY_AND_NEXT_STEPS.md` - Current gaps and roadmap
- `WEB_SERVER_PORTS.md` - Port configuration reference

### Testing & Validation
- `test_tier_a_locks.py` - Verify critical settings are locked
- `docs/VALIDATION_ROADMAP_TECHNICAL.md` - Testing procedures
- `docs/INDUSTRY_REFERENCE_SPECIFICATIONS.md` - Professional standards
- `docs/LATENCY_AUDIT_COMPREHENSIVE_2026.md` - Latency measurement guide

### Architecture & Design
- `GOOGLE_AI_ARCHITECTURAL_DIAGRAM_PROMPT.md` - System architecture
- `FUTURE-STATE-PI-NODES.md` - Multi-node cluster design
- `docs/MIDI_ROUTING_ARCHITECTURE.md` - MIDI signal flow

---

## T203 — MIDI Hub v2 Show Control Platform Rewrite (Active as of 2026-03-17)

Epic `T203` in `docs/PROJECT_WORKLIST.md` tracks a complete clean rewrite of the MIDI Hub. Key context:

### Architecture Change
- **Old**: Monolithic scrolling page at `/midi-hub` with 20+ widgets in 5 workflow bands
- **New**: 7-area sidebar-navigated platform with deep-linkable child routes under `/midi-hub/*`
- Routes: `/midi-hub/connections`, `/presets`, `/transport`, `/events`, `/processing`, `/network`, `/lab`
- Persistent left sidebar (Carbon `SideNav`), persistent bottom status bar, dark/light theme with system preference

### New Features (Net3 Show Control Gateway Parity)
- **Event Lists** (`/midi-hub/events`): Timecode-driven cue engine with MTC, RTC scheduling, Learn Mode, MSC command builder, MIDI Raw from cues
- **Tesira TTP** (`/midi-hub/network`): Bidirectional Biamp Tesira Text Protocol client — prebuilt GUI + command console, subscription manager, auto-reconnect
- **Virtual GPIO** (`/midi-hub/network`): 12 virtual inputs + 12 relay outputs, triggerable from event actions
- **String Interface** (`/midi-hub/network`): UDP text command protocol (ETC-compatible syntax)
- **`/map2/*` OSC Namespace** (`/midi-hub/network`): Hierarchical OSC address space following ETC `/eos/*` pattern with implicit output broadcasting

### New Backend Services
- `app/services/midi_hub/event_list_service.py`
- `app/services/midi_hub/tesira_client.py`
- `app/services/midi_hub/virtual_gpio.py`
- `app/services/midi_hub/string_interface.py`
- `app/services/midi_hub/osc_namespace.py`

### New Frontend Structure
- Shell: `web/src/app/pages/MidiHubShell.tsx`
- Area pages: `web/src/app/pages/midi-hub/MidiHub*Page.tsx`
- Nav store: `web/src/app/stores/midiHubNavStore.ts`
- Status bar: `web/src/app/components/MidiHub/MidiHubStatusBar.tsx`

### Subtasks (T203-subA through T203-subK)
See `docs/PROJECT_WORKLIST.md` for full details. Build order: all at once. Tesira hardware testing saved for end.

---

**For Questions**: Consult the documentation files listed in Additional Resources
**Last Updated**: March 17, 2026
**Maintained by**: Gemini AI Assistants

# GitHub Copilot Instructions for MAP2 Audio Platform

> Gemini-specific instructions are available at [../.gemini/instructions.md](../.gemini/instructions.md).


> **Last Updated**: March 23, 2026 (MIDI script sandbox verification + dead legacy MIDI drawer cleanup)
> **Purpose**: Central reference for AI assistants working on the MAP2 Audio codebase
> **Maintained by**: GitHub Copilot AI Assistants

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
# 1. Make your changes to .github/copilot-instructions.md
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

## User Preferences

### Git Workflow
- **Always push to BOTH GitHub and GitLab simultaneously**
  - GitHub remote: `origin` → https://github.com/matthewmackes/map2-audio
  - GitLab remote: `gitlab` → https://gitlab.com/matthewmackes-group/matthewmackes-project
  - When user requests push/sync: `git push origin master && git push gitlab master`
  - Both repositories must stay in sync at all times
- **When the user says `update`, perform the full release loop**
  - Commit all current changes in the working tree
  - Push to both `origin` and `gitlab`
  - Rebuild the frontend bundle
  - Restart the server on port `3000`

### Worklist Workflow
- **Treat `docs/PROJECT_WORKLIST.md` as the canonical execution ledger**
  - Mark the active task `[>] In Progress` before substantive work
  - Close each completed slice with concrete file/test notes and a timestamp
  - When a user asks to continue, resume from the next unblocked worklist item instead of inventing a side queue

### Questioning Workflow
- **When the user says "ask questions", use the 5-Question Clarification Protocol**
  - Do not switch to ad-hoc grouped question lists
  - Ask questions one at a time, sequentially, per the protocol

---

## Table of Contents

1. [🧠 IT REMEMBERS - Memory & Self-Improvement Protocol](#-it-remembers---memory--self-improvement-protocol)
2. [User Preferences](#user-preferences)
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

## Tech Stack & Versions

### Frontend (React SPA)

**Core Framework:**
- **React**: 19.0.0 (latest)
- **TypeScript**: 5.x (via tsc -b)
- **Vite**: 6.4.1 (build tool & preview server)

**UI Libraries:**
- **Carbon Design System (target standard)**: `@carbon/react` (required for new/updated UI under T114)
- **Carbon packages currently present**: `@carbon/colors`, `@carbon/icons-react`
- **MUI (Material-UI, legacy surface)**: 6.5.0 (@mui/material, @mui/icons-material)
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
cmake -B build -DCMAKE_BUILD_TYPE=Release \
  -DENABLE_NATIVE_OPTIMIZATIONS=ON \
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
cd /home/mm/map2-audio && nohup python3 -m uvicorn app.main:app \
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

### Carbon Conformance Gate (Mandatory)

- UI source of truth is `docs/design/CARBON_CONFORMANCE_STANDARD.md`.
- UI contribution/review checklist is `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`.
- For any conflict between legacy styling guidance and Carbon guidance, Carbon guidance wins.
- New and refactored UI must prefer `@carbon/react` components and Carbon tokens/themes.
- Any non-conforming exception must be documented in worklist completion notes with follow-up task IDs.

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
  background: linear-gradient(#0a1628, #050d18);
  border: 1px solid rgba(0, 217, 255, 0.15);
}
```

**3. Legacy Palette Note (Deprecated for New UI Work)**
```css
/* New/refactored surfaces should use Carbon tokens (example names). */
/* Use the Carbon theme and layer tokens rather than hard-coded palette values. */
/* Example: --cds-layer, --cds-layer-hover, --cds-text-primary, --cds-border-subtle */
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

### Server Management Gotchas

**4. Sleep Commands Kill Builds (CRITICAL)**
- **File**: `.copilot-notes/server-restart-pattern.md`
- **Problem**: `sleep 5 && curl` blocks terminal, causes `^C` interrupts
- **Error**: Build process killed mid-build, corrupted dist/
- **Fix**: Use `nohup ... &` + poll logs with `grep`/`tail`
- **Rule**: NEVER use `sleep` in CI or automated scripts

**5. Port Conflicts on Restart**
- **Problem**: `ERROR: [Errno 98] address already in use`
- **Cause**: Old server process still bound to port
- **Fix**: `kill -9 $(lsof -ti:3000)` or `pkill -9 -f "serve_web_dist.mjs"` before starting new server
- **Why -9**: Graceful kill sometimes doesn't release port fast enough

**6. Dist Folder Deleted Mid-Build**
- **Problem**: Server responds 404, files missing
- **Diagnosis**: `rm -rf dist` ran while build in progress
- **Fix**: Check `ps aux | grep "vite build"` before assuming server issue
- **Lesson**: Always verify build completion before troubleshooting server

**7. Carbon Icon Migration Build Breaks**
- **Problem**: `tsc -b` passes during localized work, but full production build fails after icon migrations.
- **Root Cause**: Swapping from Phosphor to Carbon can leave stale Phosphor-only props (`weight`) and non-existent Carbon export names such as `Gauge`, `Sliders`, or `DocumentDashed`, plus missing renamed imports like `Renew as SpinnerGap`.
- **Fix**: Verify every migrated icon against `@carbon/icons-react` exports, remove unsupported `weight` props from Carbon components, and re-run `npm --prefix web run build`, not just `typecheck`.
- **Lesson**: Treat icon-library migration as a build-level contract change, not a search-and-replace task.

### Python Backend Gotchas

**7. SQLAlchemy Session Management**
- **Problem**: `DetachedInstanceError` or stale data after commit
- **Root Cause**: `expire_on_commit=True` (default) expires objects after commit
- **Fix**: Access all needed attributes before commit, or use `expire_on_commit=False`
- **Code**: `# CRITICAL: expire_on_commit=True ensures deleted objects are expired`

**8. Lilv Node Truthiness (Python 3.14)**
- **Problem**: `if lilv_node:` raises TypeError in Python 3.14
- **Root Cause**: lilv nodes don't support `__bool__` in newer Python
- **Fix**: Use explicit `None` checks: `if lilv_node is not None:`
- **Code**: `# Note: lilv nodes don't support truthiness check in Python 3.14`

**9. Audio Engine Port Conflicts**
- **Problem**: uvicorn fails to start on port 8080
- **Diagnosis**: Old uvicorn process still running
- **Fix**: `kill -9 $(pgrep -f "uvicorn app.main")`
- **Prevention**: Use systemd service with proper cleanup

### React/TypeScript Gotchas

**10. WebSocket Connection Cleanup**
- **Problem**: Multiple WebSocket connections created on component re-render
- **Root Cause**: `useEffect` cleanup killing shared connection
- **Fix**: Check if connection is used elsewhere before disconnecting
- **Code**: `// Do NOT disconnect - other components may still need the connection`

**11. React Query Stale Time**
- **Problem**: Metering data not updating in real-time
- **Root Cause**: Default `staleTime` caches data
- **Fix**: Set `staleTime: 0` for real-time metrics
- **Code**: `staleTime: 0, // Always fresh for metering`

**12. Phosphor Icons Missing**
- **Problem**: `Note: Phosphor has no Drum icon`
- **Solution**: Use closest match (`MusicNote`) and document it
- **Code**: `// Note: Phosphor has no Drum icon — MusicNote used as closest match`

**13. Direct Asset Uploads Must Auto-Activate In Selected-Block Editors**
- **Files**: `web/src/app/components/loaders/AssetUploadButton.tsx`, `web/src/app/components/loaders/NAMManagerDialog.tsx`, `web/src/app/components/loaders/IRManagerDialog.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/ReverbIRCard.tsx`
- **Problem**: NAM, Cabinet IR, and Reverb IR looked upload-capable but the active editor surface still hid the actual file chooser behind a second library step, so operators could not reliably pick local `.nam` or `.wav` files.
- **Root Cause**: The selected-block cards and shared manager dialogs separated upload from activation, which left the visible workflow without an obvious working chooser and required a second hidden selection step after upload.
- **Fix**: Use a real `<input type="file">` over the visible Carbon button surface and wire the upload success path to immediately activate the returned asset in both the selected-block cards and the shared manager dialogs.
- **Validation**: `npm --prefix web run typecheck`; `npm --prefix web test -- --runInBand web/src/app/components/loaders/NAMManagerDialog.test.tsx web/src/app/components/loaders/IRManagerDialog.test.tsx web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx web/src/app/pages/JuceGridPage.test.tsx`; `npm --prefix web run build`
- **Lesson**: For asset-backed effect editors, "upload" is not complete until the newly uploaded asset is both visible on the active surface and selected immediately.

### JUCE/Audio Gotchas

**13. Debug Build Performance**
- **Problem**: Real-time audio stuttering, high CPU usage
- **Root Cause**: Debug build (`-O0`) is too slow for RT audio
- **Fix**: Force Release mode in CMakeLists.txt
- **Code**: `# Debug build (-O0) causes unacceptable CPU overhead for real-time audio`

**14. Tier A Settings Locked**
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
- **Problem**: Engine could segfault shortly after `start_audio()` in the real-time callback thread.
- **Root Cause**: `glide=0` in H3000 micropitch path produced invalid coefficient/index math, which could trigger undefined read indexing under callback load.
- **Fix**: Added deterministic glide/pitch/delay bounds in H3000, retained callback channel/sample clamping in JUCE/engine bridge, and added subprocess regression test to catch start/stop callback crashes.
- **Verification**: `ASAN_OPTIONS='abort_on_error=1:detect_leaks=0' LD_PRELOAD=/usr/lib/clang/21/lib/x86_64-redhat-linux-gnu/libclang_rt.asan.so python3 /tmp/repro_t009_asan.py`; `pytest -q tests/test_juce_engine_audio_start_stability.py`
- **Lesson**: Under MAP2's `-ffast-math` profile, use deterministic bound guards rather than NaN/Inf-dependent safety checks in RT DSP code.

**17. Carbon SideNav Test Mocks Need Rail-Specific Selectors**
- **File**: `web/src/app/pages/JuceGridPage.test.tsx`
- **Problem**: A shared `SideNav` mock assigned the same test id to both the snapshot rail and the MIDI rail, so `getByTestId()` failed once both rails rendered.
- **Fix**: Derive mock test ids from the rail variant (`className` / `assistiveText`) so snapshot and MIDI assertions stay distinct.
- **Lesson**: When mocking shared layout primitives, selectors need to preserve the rendered variant boundary or the test starts failing for harness reasons instead of UI regressions.

**18. Default LV2 Chain Inventory Lives in Deployment Manifest (HIGH - Mar 20, 2026)**
- **Files**: `app/deployment/default_lv2_effects.json`, `app/services/default_effects_manifest.py`, `app/services/default_effects_loader.py`, `app/services/chain_service.py`
- **Problem**: Default chain templates and audit inventory drifted because some code still assumed a nonexistent `app/config/default_lv2_effects.json` source while the live host inventory had moved on.
- **Root Cause**: The deployment manifest was the real operator-facing source of truth, but loader/service paths were split between stale config assumptions and live runtime discovery.
- **Fix**: Promote `app/deployment/default_lv2_effects.json` to the shared default-effects source of truth, load it through a single helper, and keep chain templates/audits aligned to the live runtime inventory.
- **Verification**: `python3 scripts/audit_plugin_inventory_live.py --base-url http://localhost:8080`; `pytest -q tests/test_default_effects_manifest.py tests/test_chain_service_runtime_mapping.py`.
- **Lesson**: Treat the deployment manifest, not an inferred config path, as the canonical LV2 default inventory contract.

**19. Duplicate Plugin Telemetry Must Key by Instance or Position (HIGH - Mar 20, 2026)**
- **Files**: `app/services/plugin_profiler.py`, `app/services/juce_engine_service.py`, `app/routes/profiling.py`, `app/services/audio_meters.py`, `web/src/map2/utils/pluginTelemetry.ts`, `web/src/map2/components/ChainBuilder.tsx`
- **Problem**: Duplicate-URI plugins shared CPU and meter badges even after parameter edits and reorders became instance-safe.
- **Root Cause**: Telemetry producers and consumers still keyed most profiler/meter data by URI only, and one JUCE instance lookup path was accidentally stranded out of execution.
- **Fix**: Emit and consume `instance_id` / `plugin_position` across profiler, runtime CPU, plugin VU, and websocket meter paths, with URI fallback only when runtime identity is unavailable; restore the JUCE instance lookup body.
- **Verification**: `pytest -q tests/test_plugin_profiler_identity.py tests/test_juce_engine_service_instance_resolution.py tests/test_plugin_telemetry_identity.py`; `npm --prefix web run typecheck`; `npm --prefix web test -- --runInBand web/src/map2/utils/pluginTelemetry.test.ts`.
- **Lesson**: Once duplicate plugins are allowed in the chain, every runtime telemetry path must be identity-aware end to end or the UI will silently recombine distinct instances.

**20. Verify Live MIDI Paths Before Reimplementation (Mar 23, 2026)**
- **Files**: `app/services/midi_hub/script_engine.py`, `tests/midi_hub/test_script_engine.py`, `web/src/app/App.tsx`, `web/src/map2/components/ChainBuilder.tsx`, `web/src/map2/components/MIDI/MidiLearnButton.tsx`
- **Problem**: The MIDI audit could easily misclassify the Midi Hub script editor as CRUD-only and the legacy ChainBuilder mappings drawer as a still-live feature.
- **Root Cause**: Backend script execution already existed but lacked focused proof, while the old ChainBuilder MIDI path had silently drifted into dead code: `useMidiLearn.tsx` had no consumers, the deleted mappings panel was only reachable through unsupported props, and `MidiLearnButton` only responds to `isActive`, not `isLearning`/`onOpenMappings`.
- **Fix**: Add focused backend sandbox coverage for state/MIDI/log/import-rejection behavior, delete the dead provider/panel path, and keep any remaining legacy learn toggle wired through `isActive`.
- **Verification**: `pytest tests/midi_hub/test_script_engine.py tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py tests/midi_hub/test_consumer_migration.py`; `npm --prefix web run typecheck`; `npm --prefix web test -- --runInBand src/app/App.platformRoute.test.tsx src/app/pages/JuceGridSelectedBlockMidiPanel.test.tsx`.
- **Lesson**: Before implementing "missing" MIDI behavior, prove whether the current path is live, stubbed, or dead code; audit drift in legacy UI can hide unreachable features behind silently ignored props.

**21. JUCE Engine MIDI Must Enter MidiHub As Real Hub Traffic (Mar 23, 2026)**
- **Files**: `app/services/midi_broadcast.py`, `app/services/midi_engine.py`, `tests/midi_hub/test_consumer_migration.py`
- **Problem**: MIDI controllers opened by the JUCE engine were visible to the websocket monitor but invisible to Hub routes, scripts, macros, and other consumers.
- **Root Cause**: The engine monitor callback stopped at the broadcast layer and never became a `MidiHub` message; only the opposite Hub→engine consumer path already existed.
- **Fix**: Convert monitor callback payloads to raw MIDI bytes, inject them into MidiHub as source `consumer:juce_engine_out`, ensure the JUCE engine input/output virtual ports exist, and leave `consumer:juce_engine_in` as the Hub→engine feedback path.
- **Verification**: `pytest tests/midi_hub/test_consumer_migration.py tests/midi_hub/test_script_engine.py tests/midi_hub/test_routes.py tests/midi_hub/test_traffic_routes.py`; in-process probe: `avg_ms=0.002149`, `p95_ms=0.003773`, `max_ms=0.018339` over 200 bridged CC injections.
- **Lesson**: If a MIDI source needs routing/automation in MAP2, it must enter MidiHub as a real `MidiMessage`, not just as a side-channel websocket event.

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

### [2026-03-23] - JUCE Engine Monitor Bridge Into MidiHub
- **Section**: Gotchas & Learned Fixes (#21)
- **Change**: Documented the requirement that JUCE-engine monitor callbacks must inject real hub traffic through `consumer:juce_engine_out` so Hub routes/scripts/macros can see engine-opened controllers.
- **Reason**: The MIDI audit found the largest remaining architecture gap: the engine broadcast layer existed, but the routing matrix still could not consume that traffic.
- **Impact**: Future engine/MIDI bridge work should treat websocket monitoring as observational only and keep all routable MIDI on the MidiHub message path.
- **Files**: `.github/copilot-instructions.md`, `app/services/midi_broadcast.py`, `tests/midi_hub/test_consumer_migration.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-23] - MIDI Script Sandbox Verification + Legacy Drawer Cleanup
- **Section**: Gotchas & Learned Fixes (#20), User Preferences
- **Change**: Documented that the Midi Hub script editor already runs backend code inside the restricted sandbox and that the old ChainBuilder MIDI mappings drawer had become dead legacy UI because its provider/panel path had no real consumers.
- **Reason**: The current MIDI audit surfaced the risk of re-implementing an already-live backend feature while leaving an unreachable legacy frontend path in place.
- **Impact**: Future MIDI audits should verify runtime execution and prop contracts first, then delete dead compatibility paths instead of building around them.
- **Files**: `.github/copilot-instructions.md`, `tests/midi_hub/test_script_engine.py`, `web/src/app/App.tsx`, `web/src/map2/components/ChainBuilder.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-22] - Direct Asset Upload Activation for NAM and IR Editors
- **Section**: Gotchas & Learned Fixes (#13), React/TypeScript Gotchas
- **Change**: Documented the selected-block asset-upload failure mode and the reusable direct file-chooser pattern that immediately activates uploaded NAM and IR assets.
- **Reason**: The JUCE Grid selected-block NAM/Cabinet/Reverb editors remained practically unusable until upload and activation were collapsed into one visible workflow.
- **Impact**: Future asset-backed editor work should preserve a visible local-file chooser on the active card surface and auto-select the uploaded asset instead of requiring a second hidden step.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/components/loaders/AssetUploadButton.tsx`, `web/src/app/components/loaders/NAMManagerDialog.tsx`, `web/src/app/components/loaders/IRManagerDialog.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/ReverbIRCard.tsx`

### [2026-03-20] - Effect Inventory + Duplicate Telemetry Contracts
- **Section**: Gotchas & Learned Fixes (#18, #19), Worklist Workflow
- **Change**: Documented that `app/deployment/default_lv2_effects.json` is the real default LV2 inventory/template source of truth and that duplicate-plugin telemetry must carry `instance_id` / `plugin_position` through profiler and meter paths.
- **Reason**: The effect-card remediation surfaced two repo-wide contracts that were easy to violate silently: stale manifest path assumptions and URI-only runtime telemetry.
- **Impact**: Future inventory, template, profiling, and meter changes should stay aligned with live deployment state and duplicate-plugin-safe UI behavior.
- **Files**: `.github/copilot-instructions.md`, `.gemini/instructions.md`, `docs/PROJECT_WORKLIST.md`

### [2026-03-20] - `update` Shorthand Workflow Preference
- **Section**: User Preferences, Git Workflow
- **Change**: Added an explicit rule that the user command `update` means commit all current changes, push to both remotes, then rebuild and restart the frontend service on port `3000`.
- **Reason**: Preserve the user's preferred one-word deployment shorthand and prevent partial sync/deploy handling.
- **Impact**: Future `update` requests should execute the full commit/push/rebuild/restart sequence consistently.
- **Files**: `.github/copilot-instructions.md`, `.gemini/instructions.md`

### [2026-03-18] - Carbon Icon Build-Fix Validation
- **Section**: Gotchas & Learned Fixes (#7), Build & Test Commands
- **Change**: Documented the Carbon icon migration failure mode where stale Phosphor props and wrong Carbon export names only surface under full `npm --prefix web run build`.
- **Reason**: The typography rollout uncovered production-build failures that were not typography regressions but stale icon migration debt.
- **Impact**: Future icon migrations should validate against actual Carbon exports and run a full build before being treated as complete.
- **Files**: `web/src/app/components/HostMachine/AudioNodeFeatures.tsx`, `web/src/app/components/PluginCards/Base/PluginCardShell.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.tsx`, `web/src/app/components/PluginCards/Custom/LV2/WhammyCard.tsx`, `web/src/app/components/PluginCards/Dialogs/ExpressionOverlay.tsx`, `web/src/app/components/library/SFItemCard.tsx`, `web/src/app/pages/MIDIPage.tsx`, `web/src/app/components/Platform/PlatformModal.tsx`, `.github/copilot-instructions.md`

### [2026-03-15] - Explicit "Ask Questions" Trigger Preference
- **Section**: User Preferences, 5-Question Clarification Protocol
- **Change**: Added a user-preference note and an explicit protocol trigger that the phrases "ask questions", "ask me questions", and "ask 5 questions" must invoke the documented one-at-a-time clarification flow.
- **Reason**: Preserve the user's stated preference and prevent regressions to batched free-form questioning.
- **Impact**: Future clarification turns should follow the sequential 5-question rule whenever the user explicitly asks for questions.
- **Files**: `.github/copilot-instructions.md`

### [2026-03-15] - Snapshot Rail Test Harness Fix
- **Section**: Gotchas & Learned Fixes (#17)
- **Change**: Documented the need for rail-specific Carbon `SideNav` mock selectors when a page renders more than one rail.
- **Reason**: Snapshot rename validation exposed a false failing Juce Grid test caused by duplicate mock test ids, not by a page regression.
- **Impact**: Multi-rail page tests now have a durable selector pattern that tracks snapshot vs MIDI rails correctly.
- **Files**: `web/src/app/pages/JuceGridPage.test.tsx`, `.github/copilot-instructions.md`

### [2026-03-11] - Carbon UI Conformance Standard Activated
- **Section**: Tech Stack & Versions, Web Development Guidelines, CSS/Styling Rules
- **Change**: Added Carbon as required UI standard for new/refactored surfaces, added mandatory UI conformance gate, and marked legacy hard-coded palette guidance as deprecated.
- **Reason**: T114-subA sets Carbon + IBM design language as the overriding UI standard for all new feature/design work.
- **Impact**: UI contributions now have deterministic design-review gates and a single authoritative design system baseline.
- **Files**: `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, `.github/copilot-instructions.md`

### [2026-02-24] - Callback-Path Crash Triage + Hardening (COMPLETE)
- **Section**: Gotchas & Learned Fixes (#16), JUCE/Audio
- **Change**: Added documented root cause and fix for post-`start_audio()` callback crash in H3000 glide path; added regression coverage command.
- **Reason**: T009 required a permanent host-side callback stability fix before T008 runtime validation could be trusted.
- **Impact**: Real callback path is stable in ASAN and Release validation runs; SynthForge runtime evidence now captures non-zero voice/cpu metrics.
- **Files**: `juce-engine/Source/H3000Processor.cpp`, `juce-engine/Source/JuceAudioIO.cpp`, `juce-engine/Source/Map2AudioEngine.cpp`, `tests/test_juce_engine_audio_start_stability.py`

### [2026-02-13] - Git Workflow Preferences Added
- **Section**: User Preferences (new section)
- **Change**: Added dual-push workflow for GitHub + GitLab
- **Reason**: User requires both repositories to stay synchronized at all times
- **Impact**: All push operations must target both `origin` (GitHub) and `gitlab` (GitLab) remotes
- **Command**: `git push origin master && git push gitlab master`

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
cd /home/mm/map2-audio && nohup python3 -m uvicorn app.main:app \
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
**Last Updated**: March 23, 2026
**Maintained by**: GitHub Copilot AI Assistants

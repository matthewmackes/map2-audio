# GitHub Copilot Instructions for MAP2 Audio Platform

> Gemini-specific instructions are available at [../.gemini/instructions.md](../.gemini/instructions.md).


> **Last Updated**: April 5, 2026 (Snapshot-owned Brain authority recall documented)
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
- `3000`: Frontend production server (`/usr/bin/node scripts/serve_web_dist.mjs` via `map2-web-prod.service`)
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

# Preview production build (one-off local use on port 3000)
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

- After wrapper-entrypoint renames or page/hook vocabulary migrations, treat `npm --prefix web run build` as the only authoritative gate. `npm run typecheck` can stay green while `tsc -b` fails on missing default re-exports or React APIs that the build pipeline typings do not expose.

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
- **File**: `docs/WEB_SERVER_PORTS.md`
- **Why**: Defines production-only server setup (no dev server, only port 3000)
- **Key Rules**:
  - Only use the dedicated production web server on port `3000` (`map2-web-prod.service` or direct `node scripts/serve_web_dist.mjs`), never `vite dev`
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

# NEVER run the production web server through the npm wrapper in a long-lived session
/usr/bin/node scripts/serve_web_dist.mjs --host 0.0.0.0 --port 3000
```

### ✅ CORRECT Pattern

#### 1. Kill Old Servers
```bash
# Kill old backend (use -9 for fast port release)
kill -9 $(pgrep -f "uvicorn app.main") 2>/dev/null

# Kill old frontend
pkill -f "serve_web_dist.mjs" 2>/dev/null
```

#### 2. Start Servers with nohup + Background
```bash
# Backend API (port 8080)
cd /home/mm/map2-audio && nohup python3 -m uvicorn app.main:app \
  --host 0.0.0.0 --port 8080 > /tmp/uvicorn.log 2>&1 &

# Frontend Web (port 3000)
cd /home/mm/map2-audio && nohup /usr/bin/node scripts/serve_web_dist.mjs \
  --host 0.0.0.0 --port 3000 > /tmp/preview.log 2>&1 &
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
- Prefer the direct node runtime for the production web server; avoid `npm` as a long-lived service wrapper
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
| 3000 | Frontend (production) | MAP2 production web server | `cd /home/mm/map2-audio && /usr/bin/node scripts/serve_web_dist.mjs --host 0.0.0.0 --port 3000` |
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

**11. `map2-tui` Must Point To The Ink Launcher, Not The Legacy Console**
- **Problem**: The new Ink TUI existed under `npm --prefix tui start`, but the bash-integrated `map2-tui` alias still routed to `map2.sh`, which launches the legacy Textual console by default.
- **Root Cause**: The shell bootstrap in `branding/map2-welcome.sh` predated the Ink app and aliased `map2-tui` to the wrong entrypoint, so the advertised shell command never reached `tui/src/main.tsx`.
- **Fix**: Add a dedicated `map2-tui` wrapper script, wire `map2.sh ink` to `map2_run_ink_tui()`, and point both `map2-tui` and `map2-ink` aliases at the wrapper from `branding/map2-welcome.sh`.
- **Verification**: `./map2-tui --help`; `./map2.sh ink --help`; `bash -ic 'type map2-tui; type map2-ink; type map2'`
- **Lesson**: When adding a new operator-facing surface, update the bash bootstrap and alias layer together with the docs; otherwise the documented shell command path will silently keep launching the old tool.

**12. `ProtectSystem=strict` Overrides Must Preserve `/var/lib/map2`**
- **Problem**: Platforms remediation and manifest read routes started failing with `500` even though the source tree already pointed manifest state at `/var/lib/map2`.
- **Root Cause**: The live `map2-backend.service.d/override.conf` replaced `ReadWritePaths` with only `~/.local/share` and `~/.cache`, so the backend process saw `/var/lib/map2/version_manifest_history` on a read-only mount and crashed during manifest initialization.
- **Fix**: Keep `/var/lib/map2` and `/var/log/map2` in every effective backend `ReadWritePaths` definition, detect read-only manifest storage in `VersionManifest` without eagerly `mkdir`-ing, and make manifest-backed read routes degrade to structured `200` responses while write routes stay strict `503`s.
- **Verification**: `systemctl show map2-backend.service -p ProtectSystem -p ReadWritePaths`; `curl -i http://127.0.0.1:8080/api/platform-remediation/summary`; `curl -i http://127.0.0.1:8080/api/platform-remediation/sync/history`; `curl -i http://127.0.0.1:8080/api/cluster/update/manifest`; `curl -i http://127.0.0.1:8080/api/cluster/update/manifest/drift`
- **Lesson**: Under systemd hardening, `ReadWritePaths` is part of the API contract. A later override can silently shadow the base unit and break backend state even when the repository unit looks correct.

**13. `pmc -u` Needs A Writable Client Socket Path Under Hardening**
- **Problem**: After the manifest/storage fix, the backend still spammed the journal with `pmc` failures: `uds: bind failed: Read-only file system`.
- **Root Cause**: `pmc -u` defaults its local client socket to `/var/run/pmc.$pid`; inside the hardened backend namespace that path remained read-only even though `/run/map2-audio` was writable.
- **Fix**: Reserve a unique `pmc` client socket path under `/run/map2-audio`, pass it via `pmc -u -i <path>`, clean it up after each query, and skip the direct `pmc` path entirely when a writable runtime socket cannot be prepared.
- **Verification**: `curl -i http://127.0.0.1:8080/api/avb/ptp/status`; `journalctl -u map2-backend.service --since '<restart time>' --no-pager | rg "pmc|uds: bind failed|failed to open transport"`; `pytest -q tests/test_ptp_monitor.py tests/test_avb_service_stats.py`
- **Lesson**: Hardening bugs are not limited to persisted state. Any helper that creates transient UNIX sockets must bind them under an explicitly writable runtime path, not `/var/run` by default.

**14. AVDECC Controller Startup Also Depends On `CAP_NET_RAW`**
- **Problem**: Even after writable-path hardening was fixed, the backend still logged `[AVDECC] Controller creation failed ... Attempt to create packet socket failed - CAP_NET_RAW may be required` and AVDECC discovery never came up.
- **Root Cause**: The hardened backend service only granted `CAP_SYS_NICE`, which is enough for JUCE realtime scheduling but not for the AVDECC/libpcap packet sockets used by controller startup.
- **Fix**: Carry `CAP_NET_RAW` alongside `CAP_SYS_NICE` in the canonical backend unit, the generated override guidance, and the installed live unit/override, then restart the backend so the AVDECC controller can open packet sockets on the AVB interface.
- **Verification**: `systemctl show map2-backend.service -p AmbientCapabilities -p CapabilityBoundingSet`; `journalctl -u map2-backend.service --since '<restart time>' --no-pager | rg "AVDECC|packet socket|CAP_NET_RAW"`; `curl -i http://127.0.0.1:8080/api/avb/avdecc/entities`
- **Lesson**: Under systemd hardening, capability sets are part of the live feature contract. Realtime audio and packet-capture-based discovery often need different capabilities, and the service unit must declare both explicitly.

**15. API Qualification Must Use Full-Run Observatory Sessions**
- **Files**: `tests/load_test.py`, `docs/API_LOAD_QUALIFICATION_RUNBOOK.md`
- **Problem**: The T209 server-side REST gate could report false failures because it was reading from the live API Observatory ring buffer, which caps at `1000` events and tail-truncates long smoke/full runs under mixed HTTP + WebSocket traffic.
- **Root Cause**: Qualification was fetching `/api/observatory/traffic?run_id=...` directly after the run. Under sustained load, that buffer only preserved the tail of the run, so p95/error calculations over-weighted teardown traffic and missed the true steady-state window.
- **Fix**: Start and stop an explicit observatory recording session inside `tests/load_test.py`, build the server-side summary from the recorded session events, keep the startup grace and teardown-tail exclusions, and document the default `p95 <= 100ms` mixed-workload steady-state gate in the runbook.
- **Verification**: `pytest -q tests/test_load_test_gate.py tests/test_t209_api_load_qualification.py`; `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile tests/load_test.py tests/test_load_test_gate.py`; `sudo systemd-run --wait -G -P -p LimitNOFILE=65536 ... scripts/run_t209_api_load_qualification.py ...`
- **Lesson**: Qualification evidence must come from a bounded recording whose lifetime matches the run. Live observability buffers are fine for diagnosis, but not for final pass/fail math on long-running load tests.

**16. Runtime Shutdown Signal Handlers Must Stay Signal-Safe**
- **Files**: `app/main.py`, `tests/test_main_shutdown.py`
- **Problem**: The first backend restart after the T209 full soak still burned the full `TimeoutStopUSec=30s` window and ended in `SIGABRT` even though a `5s` forced-exit watchdog had already been added.
- **Root Cause**: The runtime `SIGTERM` handler still did lock/logging work in the signal path, so the watchdog never became the reliable escape hatch when the process was already unhealthy under shutdown pressure.
- **Fix**: Emit shutdown notices with `os.write(2, ...)`, avoid lock acquisition in the signal handler, and keep the watchdog fallback minimal (`sleep` then `os._exit(0)`).
- **Verification**: `pytest -q tests/test_main_shutdown.py`; `sudo systemctl restart map2-backend.service`; `sudo journalctl -u map2-backend.service --since '<restart time>' --no-pager | rg "SIGTERM received|State 'stop-sigterm' timed out|Application shutdown complete"`
- **Lesson**: If a signal handler exists specifically to rescue a stuck process, it cannot depend on logging locks or other heavyweight runtime state in that same failure path.

**17. Tesira Offline Retries Need Backoff And Capability-Aware Fallbacks**
- **Files**: `app/services/tesira/tesira_device.py`, `app/services/tesira/tesira_fleet.py`, `tests/tesira/test_tesira_device_transport.py`, `tests/tesira/test_tesira_fleet.py`
- **Problem**: During qualification, five unreachable Tesira hosts were generating recurring backend latency bursts and journal spam while the service kept retrying them in the background.
- **Root Cause**: `transport="auto"` still attempted SSH fallback even when `asyncssh` was unavailable, and the offline retry loop walked every unreachable host in a serialized sweep with no per-device backoff.
- **Fix**: Skip SSH fallback when `asyncssh` is unavailable, retry due offline devices concurrently, and back off per device (`30s -> 60s -> 120s -> 300s`) instead of probing the full unreachable fleet on every cycle.
- **Verification**: `pytest -q tests/test_tesira_fleet_stop.py tests/tesira/test_tesira_device_transport.py tests/tesira/test_tesira_fleet.py`; `sudo journalctl -u map2-backend.service --since '<run start>' --until '<run end>' --no-pager | rg "TesiraDevice\\[|ssh connect failed"`
- **Lesson**: Offline hardware recovery must be bounded and capability-aware. If the fallback transport cannot work on the live host, remove it from the hot path instead of retrying it forever.

**18. Production Web Systemd Units Must Exec Node Directly**
- **Files**: `systemd/map2-web-prod.service`, `scripts/build/deploy`, `scripts/install-node.sh`
- **Problem**: The port-`3000` deploy loop could still time out on `systemctl stop map2-web-prod` and fall back to `SIGKILL`, even though the underlying `serve_web_dist.mjs` server itself was healthy.
- **Root Cause**: The current host was still running a stale `npm run preview` unit, and even after switching to direct node `ExecStart`, `serve_web_dist.mjs` only called `server.close()` on `SIGTERM`, which left keep-alive / upgraded sockets alive long enough for systemd to time out.
- **Fix**: Point the production unit and manual fallback at `/usr/bin/node .../scripts/serve_web_dist.mjs --host 0.0.0.0 --port 3000`, then track/destroy live client and proxy sockets inside `serve_web_dist.mjs` during shutdown so the service drains promptly under `SIGTERM`.
- **Verification**: `systemctl show map2-web-prod.service -p ExecStart`; `bash -n scripts/build/deploy`; `node --check scripts/serve_web_dist.mjs`; `pytest -q tests/test_serve_web_dist.py`; `./scripts/build/deploy --skip-build`; `journalctl -u map2-web-prod.service --since '<restart time>' --no-pager`
- **Lesson**: `npm run ...` is fine for interactive launches, but long-lived system services should exec the real runtime directly and own their socket teardown path explicitly; `server.close()` alone is not enough when persistent clients are attached.

**19. Duplicate Loader Chains Need Persisted Per-Plugin Asset State**
- **Files**: `app/database.py`, `app/services/chain_service.py`, `app/routes/chains.py`, `tests/test_chain_plugin_loader_state_persistence.py`
- **Problem**: Duplicate NAM, cabinet IR, and reverb IR blocks could preserve chain position but not their selected asset or per-loader controls, so chain/preset round-trips collapsed back to indistinguishable unloaded loaders.
- **Root Cause**: `chain_plugins` only stored `plugin_uri`, `position`, and `bypass`, and the chain deploy/preset serializers dropped all loader-specific state on every round-trip.
- **Fix**: Add additive `chain_plugins` columns for `selected_asset_name`, `selected_asset_path`, NAM gains/normalize, and IR mix; backfill legacy rows to unloaded defaults; and serialize/deserialize those values through chain payloads and preset save/load paths.
- **Verification**: `pytest -q tests/test_chain_plugin_loader_state_persistence.py tests/test_nam_ir_instance_routes.py`; `python3 - <<'PY' ... ast.parse(...) ... PY`
- **Lesson**: Once duplicate asset-backed plugins exist in one chain, `plugin_uri + position` is not enough. Persist the loader state on each chain row before trying to make runtime restore or UI warning logic duplicate-safe.

**20. Chain Activation Must Publish Runtime Capability State**
- **Files**: `app/services/chain_service.py`, `tests/test_chain_plugin_loader_state_persistence.py`
- **Problem**: Even after per-loader persistence existed, chain activation could still leave duplicate loaders with no live runtime identity and no explicit signal explaining whether deployment was active, partial, or impossible on the current node.
- **Root Cause**: Activation only toggled `chains.is_active` and optionally tried a best-effort deploy behind a default-disabled flag, with no persisted runtime status contract for later route/UI consumers.
- **Fix**: Default chain deployment on, rebuild the live JUCE chain from persisted rows during activation, restore NAM/IR loader state per instance, and persist a `runtime_sync` payload on the chain config that reports `active`, `partial`, or `capability_gap` plus warnings and missing positions.
- **Verification**: `pytest -q tests/test_chain_plugin_loader_state_persistence.py tests/test_chain_service_runtime_mapping.py`; `python3 - <<'PY' ... ast.parse(...) ... PY`
- **Lesson**: For multi-loader chains, activation success is not binary. Persist and expose runtime capability state so scoped routes and UI can distinguish a healthy live chain from a configured-only chain with no runtime identity.

**21. Scoped NAM/IR Routes Must Sync Persisted Loader State**
- **Files**: `app/routes/nam.py`, `app/routes/ir.py`, `tests/test_nam_ir_instance_routes.py`
- **Problem**: Once per-loader state lived on `chain_plugins`, scoped NAM and IR routes could still read or mutate the live runtime without updating the persisted chain row, and missing-runtime status payloads still hid the configured asset/operators’ saved settings.
- **Root Cause**: The scoped route layer only resolved runtime instances and legacy global fallbacks; it had no persistence bridge back to `ChainPlugin` and no configured-vs-runtime warning payload contract.
- **Fix**: Teach scoped NAM and IR routes to read configured loader state from the matching chain-plugin row, include configured asset/settings plus a `runtimeWarning` when the block is configured but not currently active, and persist successful scoped mutations back into `chain_plugins`. Mirror NAM’s duplicate-safe global-fallback behavior for cabinet and reverb IR routes.
- **Verification**: `pytest -q tests/test_nam_ir_instance_routes.py tests/test_chain_plugin_loader_state_persistence.py tests/test_chain_service_runtime_mapping.py`; `python3 - <<'PY' ... ast.parse(...) ... PY`
- **Lesson**: Duplicate-safe runtime routing is only half the contract. Scoped loader routes must keep persisted configuration and live control in sync so restarts, re-activation, and future UI warnings all describe the same block state.

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

**22. Scoped JUCE Actions Must Carry `plugin_position` Even When `instance_id` Exists (HIGH - Mar 27, 2026)**
- **Files**: `app/routes/nam.py`, `app/services/juce_engine_service.py`, `web/src/map2/api.ts`, `web/src/app/components/loaders/NAMManagerDialog.tsx`, `tests/test_nam_ir_instance_routes.py`, `tests/test_juce_engine_service_instance_resolution.py`, `web/src/app/components/loaders/NAMManagerDialog.test.tsx`
- **Problem**: The NAM chooser dialog could fail with `Failed to load NAM model` even when a valid NAM block was selected in the JUCE Grid.
- **Root Cause**: Selected-block UI state can retain a stale `instance_id` across runtime refreshes or backend restarts. The old dialog/API path preferred `instance_id` alone, so the backend targeted an invalid processor and never recovered through the still-valid chain `plugin_position`.
- **Fix**: When a JUCE action has both runtime identifiers, send both `instance_id` and `plugin_position`; in backend resolution, prefer an exact live position match, then keep the explicit instance only if it still maps to the same plugin URI, otherwise fall back to the live position-scoped instance.
- **Verification**: `pytest -q tests/test_juce_engine_service_instance_resolution.py tests/test_nam_ir_instance_routes.py`; `npm --prefix web test -- --runInBand web/src/app/components/loaders/NAMManagerDialog.test.tsx`; `npm --prefix web run typecheck`
- **Lesson**: In MAP2, `instance_id` is not durable across all runtime transitions. For selected-block JUCE actions, `plugin_position` is the stable recovery key and should travel alongside the cached instance id.

**23. Duplicate-Instance Frontend State Must Invalidate And Listen By Runtime Scope (HIGH - Mar 27, 2026)**
- **Files**: `web/src/app/components/loaders/NAMManagerDialog.tsx`, `web/src/app/components/loaders/IRManagerDialog.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/ReverbIRCard.tsx`, `web/src/map2/hooks/useWebSocket.ts`, `web/src/app/components/PluginCards/PluginCardRouter.tsx`, `web/src/app/components/LV2PluginParameterEditor.tsx`
- **Problem**: Duplicate effect instances could briefly cross-pollute frontend state: loading/uploading assets in one block refetched unrelated blocks, websocket parameter updates could move the wrong UI control, and the generic LV2 fallback editor missed duplicate-safe runtime identity.
- **Root Cause**: Successful mutations invalidated global `['nam']` / `['ir']` query families, the parameter websocket hook matched only `plugin_uri + param_index`, and the fallback LV2 editor never received `pluginPosition`.
- **Fix**: Scope asset/status invalidations to the active runtime identity key, require matching `instance_id` / `plugin_position` when consuming websocket parameter updates, and pass runtime identity through the generic LV2 fallback editor for both realtime output and parameter writes.
- **Verification**: `npm --prefix web test -- --runInBand web/src/app/components/loaders/NAMManagerDialog.test.tsx web/src/app/components/loaders/IRManagerDialog.test.tsx web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx web/src/app/components/PluginCards/PluginCardRouter.test.tsx web/src/map2/hooks/useWebSocket.test.ts`; `npm --prefix web run typecheck`
- **Lesson**: Once duplicate plugin instances exist, every frontend cache key, websocket filter, and fallback editor path must carry runtime identity all the way through; URI-only matching is no longer safe.

**24. Duplicate-Instance Parameter Reads Must Resolve Live Runtime Identity Before Engine Access (HIGH - Mar 27, 2026)**
- **Files**: `app/routes/plugins.py`, `tests/test_plugin_parameter_route_identity.py`
- **Problem**: `GET /api/plugins/{uri}/parameters` could read the wrong duplicate plugin instance because it ignored `instance_id` / `plugin_position` even after the rest of the duplicate-safe runtime plumbing existed.
- **Root Cause**: The route still called `engine.get_parameter(uri, symbol)` without first resolving the live scoped instance, so duplicate URIs fell back to whichever instance the engine returned first; stale cached `instance_id` values also had no route-level recovery path.
- **Fix**: Accept `instance_id` and `plugin_position` on the route, resolve the live target instance through `engine.resolve_instance_id()` when available, pass the resolved scope into `engine.get_parameter()`, and fail closed with `404` when a requested scoped position no longer exists.
- **Verification**: `pytest -q tests/test_plugin_parameter_route_identity.py tests/test_plugins_engine_op_pipeline.py tests/test_flow_snapshots_routes.py`
- **Lesson**: For duplicate plugin URIs, read paths need the same runtime-identity resolution as write paths. Never call a plugin-parameter engine API from a route until the live `instance_id` has been resolved or validated.

**25. Scoped IR Routes Must Fail Closed Instead Of Falling Back To The Global Singleton (HIGH - Mar 27, 2026)**
- **Files**: `app/routes/ir.py`, `tests/test_nam_ir_instance_routes.py`
- **Problem**: Scoped IR status/load/mix/bypass/unload flows could still fall through to the legacy `_ir_processor` singleton when an explicit `instance_id` was stale or no longer resolvable.
- **Root Cause**: The IR route helper returned explicit instance ids without validation, and unresolved scoped requests only raised for `plugin_position` misses; invalid explicit `instance_id` requests could therefore drift into the global fallback path.
- **Fix**: Resolve scoped IR requests through `engine.resolve_instance_id()` when available, let `plugin_position` recover stale explicit ids, and raise `404` for any unresolved scoped IR request instead of touching `_ir_processor`.
- **Verification**: `pytest -q tests/test_nam_ir_instance_routes.py`
- **Lesson**: Once a route accepts runtime identity, failure to resolve that identity is an error, not permission to operate on a global singleton.

**26. Duplicate-Safe NAM Status Reads Need Service-Level Instance Helpers (HIGH - Mar 27, 2026)**
- **Files**: `app/services/juce_engine_service.py`, `tests/test_juce_engine_service_instance_resolution.py`
- **Problem**: Duplicate-safe NAM routes had to unpack `get_nam_model_info_instance()` manually because the service only exposed global NAM status helpers such as `is_nam_bypassed()` and `get_nam_input_level()`.
- **Root Cause**: The service layer never added instance-scoped variants for the NAM status fields after instance-scoped model info support landed.
- **Fix**: Add `*_instance` NAM status helpers plus `get_nam_status_instance()` and source them from `get_nam_model_info_instance()` so instance-scoped consumers never need to fall back to the global NAM singleton API.
- **Verification**: `pytest -q tests/test_juce_engine_service_instance_resolution.py tests/test_nam_ir_instance_routes.py`
- **Lesson**: When instance-scoped route logic depends on a global-only service API, fix the service surface instead of duplicating per-route unpacking logic.

**27. Scoped EQ Routes Must Translate REST-Friendly Parameters To JUCE Runtime Symbols (HIGH - Mar 27, 2026)**
- **Files**: `app/routes/filters.py`, `web/src/app/hooks/useFilters.ts`, `web/src/app/components/PluginCards/Custom/JUCE/ParametricEQCard.tsx`, `tests/test_filters_route_identity.py`, `web/src/app/components/PluginCards/Custom/JUCE/ParametricEQCard.test.tsx`
- **Problem**: Duplicate parametric EQ instances still shared the global singleton route family because the selected-block card and `/api/engine/eq/*` endpoints never accepted runtime identity, and the backend REST schema (`output_gain`, filter-type strings) did not match the actual JUCE parameter IDs (`outputGain`, numeric choice values).
- **Root Cause**: The EQ route layer was still built entirely around global `engine.get_eq_*` / `set_eq_*` helpers, while the frontend hook keyed all requests under one global `['eq']` scope and never sent `instance_id` or `plugin_position`.
- **Fix**: Accept runtime identity across the EQ routes, resolve the live instance before any read/write, translate between REST-facing EQ fields and the JUCE FilterPlugin symbols (`bandN_freq`, `bandN_gain`, `bandN_q`, `bandN_type`, `bandN_enabled`, `outputGain`, `bypass`), and scope the `useFilters` hook plus `ParametricEQCard` query/mutation traffic by runtime identity.
- **Verification**: `pytest -q tests/test_filters_route_identity.py`; `npm --prefix web test -- --runInBand web/src/app/components/PluginCards/Custom/JUCE/ParametricEQCard.test.tsx`; `npm --prefix web run typecheck`
- **Lesson**: When a route contract uses human-friendly parameter names but the engine exposes different symbols or enum encodings, the route must own that translation explicitly before duplicate-safe runtime scoping can be trusted.

**28. Selected-Block JUCE Effect Families Must Preserve Runtime Identity End To End (HIGH - Mar 27, 2026)**
- **Files**: `app/routes/scoped_plugin_utils.py`, `app/routes/dynamics.py`, `app/routes/pitch.py`, `app/routes/modulation.py`, `app/routes/h3000.py`, `app/routes/lexi_love.py`, `app/routes/shoegaze.py`, `web/src/app/hooks/runtimeScopedQuery.ts`, `web/src/app/hooks/useDynamics.ts`, `web/src/app/hooks/useModulation.ts`, `web/src/app/hooks/useH3000.ts`, `web/src/app/hooks/useLexiLove.ts`, `web/src/app/hooks/useShoeGaze.ts`
- **Problem**: The remaining selected-block JUCE processors still defaulted to legacy global singleton routes and cache keys, so duplicate compressors, modulation blocks, pitch processors, H3000, Lexi Love, and ShoeGaze instances could read, meter, or mutate the wrong runtime processor.
- **Root Cause**: Those route families were written around singleton service helpers, while the matching frontend hooks either omitted `instance_id` / `plugin_position` entirely or cached every selected-block request under one global query scope.
- **Fix**: Introduce shared scoped-route helpers for live instance resolution and parameter translation, require the selected-block hooks/cards to send runtime identity on every request, preserve `plugin_position` as the fallback recovery key for stale `instance_id` values, and fail closed whenever a scoped runtime target no longer exists.
- **Verification**: `pytest -q tests/test_juce_engine_service_instance_resolution.py tests/test_nam_ir_instance_routes.py tests/test_plugin_parameter_route_identity.py tests/test_filters_route_identity.py tests/test_dynamics_route_identity.py tests/test_pitch_modulation_route_identity.py tests/test_multi_effect_route_identity.py tests/test_plugins_engine_op_pipeline.py tests/test_flow_snapshots_routes.py`; `npm --prefix web test -- --runInBand web/src/app/components/loaders/NAMManagerDialog.test.tsx web/src/app/components/loaders/IRManagerDialog.test.tsx web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx web/src/app/components/PluginCards/PluginCardRouter.test.tsx web/src/map2/hooks/useWebSocket.test.ts web/src/app/components/PluginCards/Custom/JUCE/ParametricEQCard.test.tsx web/src/app/components/PluginCards/Custom/JUCE/CompressorCard.test.tsx web/src/app/components/PluginCards/Custom/JUCE/ScopedModulationCards.test.tsx web/src/app/components/PluginCards/Custom/JUCE/ScopedAmbientCards.test.tsx`; `npm --prefix web run typecheck`
- **Lesson**: In MAP2, a selected-block JUCE surface is only correct when backend route resolution, frontend query keys, and mutation URLs all carry the same runtime identity contract. URI-only access is legacy compatibility, not a safe default for duplicate-capable processors.

**29. Shared Parameter-Control Migrations Must Preserve Legacy Wrapper Semantics Until A Surface Opts In (HIGH - Mar 27, 2026)**
- **Files**: `web/src/app/components/NumericInput/NumericInput.tsx`, `web/src/app/components/ParameterControl/*`, `web/src/app/components/Controls/NumberInput.tsx`, `web/src/app/components/Controls/ParameterKnob.tsx`, `web/src/app/components/Controls/ParameterSlider.tsx`, `web/src/map2/components/NumberInput.tsx`, `web/src/app/components/MIDICommanderSetup.tsx`
- **Problem**: The shared parameter-control runtime needs deferred `blur`/`idle` commits for calibration and future pilot controls, but most existing wrappers still assume the old eager callback contract.
- **Root Cause**: The app’s original `NumericInput` primitive collapsed live and committed values into one path, so wrappers like `NumberInput` and `ParameterKnob` fire their current side effects on every accepted change.
- **Fix**: Keep `NumericInput` in `legacy` mode by default, add explicit non-legacy commit strategies (`blur`, `idle`, `explicit`) for the new shared `ParameterControl` family, and route the old wrappers through the shared runtime with `legacy` semantics until each surface is migrated intentionally.
- **Verification**: `npm --prefix web test -- --runInBand web/src/app/components/NumericInput/NumericInput.test.tsx web/src/app/components/ParameterControl/scale.test.ts web/src/app/components/ParameterControl/ParameterControl.test.tsx web/src/app/components/MIDICommanderSetup.test.tsx`; `npm --prefix web test -- --runInBand web/src/app/components/LV2PluginParameterEditor.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: In MAP2, shared control refactors must separate runtime capability from migration timing. Do not globally flip wrapper semantics when introducing the new control stack; opt individual surfaces into non-legacy commit behavior only when their side effects are ready for it.

**30. Parameter-Control Validation Must Lock Formatting, Clamping, And No-Op Commit Behavior (MEDIUM - Mar 27, 2026)**
- **Files**: `docs/validation/parameter-controls-validation.md`, `web/src/app/components/ParameterControl/format.test.ts`, `web/src/app/components/ParameterControl/ParameterControl.test.tsx`
- **Problem**: Pilot migrations can appear complete while still drifting on shared formatter/parser rules or emitting redundant blur commits, which quietly reintroduces inconsistent UX and unnecessary mutation traffic.
- **Root Cause**: The first parameter-control pass proved descriptor adoption on the pilot surfaces, but it did not yet encode kHz/dB formatting, descriptor-bound clamping, or the "draft returns to committed value" blur case as explicit runtime regressions.
- **Fix**: Add focused shared-runtime tests for formatting/clamping and no-op blur commit suppression, then capture the consistency criteria plus frontend-only performance/audio-safety rationale in `docs/validation/parameter-controls-validation.md`.
- **Verification**: `npm --prefix web test -- --runInBand web/src/app/components/ParameterControl/format.test.ts web/src/app/components/ParameterControl/ParameterControl.test.tsx web/src/app/components/NumericInput/NumericInput.test.tsx web/src/app/components/MIDICommanderSetup.test.tsx web/src/app/pages/DrumsPage.test.tsx web/src/app/components/EQ/EQCard.test.tsx web/src/app/components/PluginCards/Custom/JUCE/PassionFXCard.test.tsx web/src/app/data/parameterSchema.test.ts web/src/app/components/LV2PluginParameterEditor.test.tsx web/src/app/pages/JuceGridParameterAudit.test.tsx`; `npm --prefix web test -- --runInBand web/src/app/pages/AudioTablePage.test.tsx web/src/app/pages/audioTableKeyboard.test.ts`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: For shared parameter-control work, surface migration tests are necessary but not sufficient. Always pin the formatter/parser contract and blur-commit deduplication in explicit runtime tests before closing the validation slice.

**31. Retire Numeric Wrapper Files Only After The Shared ParameterControl Namespace Absorbs The Legacy Contract (HIGH - Mar 27, 2026)**
- **Files**: `web/src/app/components/ParameterControl/legacyProps.ts`, `web/src/app/components/ParameterControl/ParameterNumericInput.tsx`, `web/src/app/components/ParameterControl/ParameterKnob.tsx`, `web/src/app/components/ParameterControl/ParameterSlider.tsx`, `web/src/app/components/ParameterControl/index.ts`, `web/src/app/components/Controls/*`, `web/src/map2/components/NumberInput.tsx`
- **Problem**: `T460` needed to delete the old numeric wrapper files, but dozens of app and `map2` consumers still depended on the wrapper prop shapes and import paths.
- **Root Cause**: The shared `ParameterControl` family originally accepted only descriptor-backed props, so a direct import migration would have forced per-callsite rewrites and several focused tests were shadowing the same module twice, which broke the new `NumberInput` alias export.
- **Fix**: Teach the shared `ParameterControl` namespace to absorb the legacy wrapper props directly, export `NumberInput` from that namespace, migrate the call sites/tests to the shared module path, merge duplicate `jest.mock()` blocks, and only then delete the dead wrapper files once import-count reaches zero.
- **Verification**: `npm --prefix web test -- --runInBand web/src/app/components/ParameterControl/ParameterControl.test.tsx web/src/app/components/EQ/EQCard.test.tsx web/src/app/components/PluginCards/Custom/JUCE/PassionFXCard.test.tsx web/src/app/components/LV2PluginParameterEditor.test.tsx web/src/app/pages/DrumsPage.test.tsx web/src/app/pages/JuceGridPage.test.tsx web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.test.tsx web/src/app/components/PluginCards/Custom/JUCE/AssetSelectorCards.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: In MAP2, remove compatibility wrapper files only after the shared namespace can absorb the old prop contract and the tests mock that new namespace in a single consolidated factory.

**32. Guard Query-Backed Draft Hydration Effects Against Equivalent Value Maps (MEDIUM - Mar 27, 2026)**
- **Files**: `web/src/app/components/Tesira/components/TesiraDspBlockPanel.tsx`, `web/src/app/components/Tesira/components/TesiraDspBlockPanel.test.tsx`
- **Problem**: The Tesira DSP block panel could spin into a maximum-update-depth loop under test or unstable query mocks when the fetched parameter map recreated an identical object on every render.
- **Root Cause**: The draft hydration effect always called `setDrafts(Object.fromEntries(...values))` whenever `values` changed by reference, even when the derived string map was semantically identical to the current draft state.
- **Fix**: Build the next draft map once, compare it to the existing draft state, and return the previous state when nothing actually changed; update stale test assertions to match the current UI copy after the loop is fixed.
- **Verification**: `timeout 60s npm --prefix web test -- --runInBand web/src/app/components/Tesira/components/TesiraEQTab.test.tsx web/src/app/components/Tesira/components/TesiraMixerTab.test.tsx web/src/app/components/Tesira/components/TesiraLevelsTab.test.tsx web/src/app/components/Tesira/components/TesiraDspBlockPanel.test.tsx web/src/app/components/MPX1/MPX1Knob.test.tsx web/src/app/components/ParameterControl/ParameterControl.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: In MAP2, any effect that mirrors fetched objects into draft UI state must short-circuit on semantic equality. Query layers and tests routinely recreate value objects, and reference-only dependencies are not enough to prevent render loops.

**33. Use Shared Numeric Controls Only Where The Surface Has A Real Local Draft Value (MEDIUM - Mar 27, 2026)**
- **Files**: `web/src/app/components/Tesira/components/TesiraMixerTab.tsx`, `web/src/app/components/Tesira/components/TesiraLevelsTab.tsx`, `web/src/app/components/Tesira/components/TesiraDspBlockPanel.tsx`, `web/src/app/pages/JuceGridSelectedBlockMidiPanel.tsx`
- **Problem**: `T460-subF` still had a mixed tail of raw `input[type=range|number]` controls across Tesira apply-button panels and the selected-block JUCE Grid MIDI draft editor.
- **Root Cause**: The shared `NumberInput` works well for staged numeric drafts that always have a concrete value, but `JuceGridSelectedBlockMidiPanel` intentionally uses nullable blank strings for CC/feedback drafts and would lose that behavior under a forced non-nullable migration.
- **Fix**: Move the Tesira mixer/levels/DSP apply-button controls onto shared `NumberInput` while keeping their explicit Apply/Set mutations local-draft driven, and convert the nullable JUCE Grid MIDI fields to sanitized text-mode numeric inputs instead of forcing a shared-control swap that would erase blank draft state.
- **Verification**: `npm --prefix web test -- --runInBand web/src/app/pages/AudioTablePage.test.tsx web/src/app/pages/audioTableKeyboard.test.ts web/src/app/components/Tesira/components/TesiraMixerTab.test.tsx web/src/app/components/Tesira/components/TesiraLevelsTab.test.tsx web/src/app/components/Tesira/components/TesiraDspBlockPanel.test.tsx web/src/app/pages/JuceGridSelectedBlockMidiPanel.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: For `T460`, remove raw range/number controls in two lanes: use shared numeric controls for real numeric drafts, and use sanitized text inputs where `''` is a valid part of the draft contract.

**34. AudioTable Mutation Tests Need Lazy API Mocks And Immediate Mutation Execution (MEDIUM - Mar 28, 2026)**
- **Files**: `web/src/app/pages/AudioTablePage.test.tsx`
- **Problem**: The Audio Table integration suite could cover rendering/search/column-picker flows, but newly added mutation assertions for row actions, parameter writes, MIDI updates, and preset/history flows either stayed inert or failed when the component finally dereferenced `chainsApi` / `pluginsApi`.
- **Root Cause**: Jest hoisted the `../../map2/api` module mock before the concrete mock objects were initialized, so named API exports could resolve as `undefined` once a mutation path actually touched them; on top of that, React Query mutation scheduling and Carbon popup controls made the failing path look like a generic UI-event problem.
- **Fix**: In `web/src/app/pages/AudioTablePage.test.tsx`, mock `../../map2/api` through lazy proxy objects that resolve the live jest fns at property-access time, stub `useMutation` so `mutationFn` executes immediately with `onSuccess` / `onError` callbacks, drive the preset dropdown through combobox keyboard events, and toggle the row bypass control through the semantic checkbox click path.
- **Verification**: `npm --prefix web test -- --runInBand web/src/app/pages/AudioTablePage.test.tsx`; `npm --prefix web test -- --runInBand web/src/app/pages/audioTableKeyboard.test.ts`
- **Lesson**: For Carbon/React Query suites that preseed query data, passing render coverage does not prove the mutation harness is sound. If new mutation assertions never reach their payload mocks, verify the mocked module exports are lazily bound before blaming the UI event path.

**35. E-SNAP Wrapper Renames Must Pass The Production Build Gate (MEDIUM - Mar 29, 2026)**
- **Files**: `web/src/app/hooks/useSnapshots.ts`, `web/src/app/components/MPX1/MPX1FlowCanvas.tsx`, `web/src/app/components/MPX1/MPX1FlowPatchCords.tsx`, `web/src/app/components/MPX1/MPX1SignalPathCanvas.tsx`, `web/src/app/components/MPX1/MPX1SignalPathPatchCords.tsx`
- **Problem**: The snapshot-editor/signal-path reconciliation looked healthy under `npm run typecheck` and focused tests, but the full production build failed during `tsc -b`.
- **Root Cause**: The new MPX1 signal-path wrappers re-exported `default` from modules that only had named exports, and `useSnapshots.ts` used `useEffectEvent` even though the build pipeline's React typings did not expose that API.
- **Fix**: Add explicit default exports to wrapper-owned components when compatibility files re-export `default`, replace `useEffectEvent` with a ref-backed callback when the current toolchain cannot type it, and always rerun `npm --prefix web run build` after wrapper-entrypoint migrations.
- **Verification**: `npm --prefix web run typecheck`; `npm --prefix web test -- --runInBand web/src/app/pages/SnapshotEditorPage.test.tsx web/src/app/components/SnapshotEditor/snapshotEditorState.test.ts web/src/app/components/SnapshotEditor/snapshotEditorLiveChains.test.ts`; `npm --prefix web run build`
- **Lesson**: Vocabulary migrations that add compatibility shims are build-contract work, not just import churn. If a wrapper re-exports `default`, the source module must really export it, and new React hook APIs need to match the repo's actual build-time typings.

**36. Canonical Vocabulary Migrations Must Promote The Canonical File Owner (MEDIUM - Mar 29, 2026)**
- **Files**: `web/src/app/pages/SnapshotEditorPageContent.tsx`, `web/src/app/components/SnapshotEditor/snapshotEditorLiveChains.ts`, `web/src/app/components/SnapshotEditor/snapshotEditorComparison.ts`, `web/src/app/components/SnapshotEditor/snapshotEditorLivePath.ts`, `web/src/map2/components/ChainBuilder/ChainGraphCanvas.tsx`, `web/src/app/components/MPX1/MPX1SignalPathCanvas.tsx`, `web/src/app/components/IntelFX/IntelFXSignalPathCanvas.tsx`
- **Problem**: The repo had canonical snapshot-editor, chain-graph, and signal-path filenames, but the live implementation still lived behind legacy `JuceGrid*`, `ChainFlow*`, and `*Flow*` owners.
- **Root Cause**: Earlier migrations added compatibility wrappers without flipping ownership, so new imports, docs, and future cleanup work kept drifting back toward the legacy filenames.
- **Fix**: Move the implementation into the canonical `SnapshotEditor*`, `ChainGraph*`, and `*SignalPath*` files first, then keep the legacy filenames only as thin re-export wrappers until outside callers are retired.
- **Verification**: `npm --prefix web run typecheck`; `npm --prefix web test -- --runInBand web/src/app/components/SnapshotEditor/snapshotEditorLiveChains.test.ts web/src/app/pages/SnapshotEditorPage.test.tsx`; `npm --prefix web run build`
- **Lesson**: In vocabulary migrations, the canonical filename must become the real owner. Compatibility wrappers are transitional and should never remain the source of truth.

**37. Snapshot-First Routes Must Beat Dynamic Snapshot ID Matchers, And UI Cutovers Must Remove Hidden Compatibility Writes (HIGH - Mar 29, 2026)**
- **Files**: `app/routes/unified_snapshots.py`, `web/src/map2/clients/snapshots.ts`, `web/src/app/components/snapshots/SnapshotModalContent.tsx`, `tests/test_snapshot_routes.py`, `web/src/app/components/snapshots/SnapshotModalContent.test.tsx`
- **Problem**: The canonical snapshot-first surface looked deployed, but `GET /api/snapshots/live` returned `422` because it was shadowed by `/{snapshot_id}`, and the snapshot modal still wrote through `flowSnapshotsApi.update(...)` plus `/api/flow-snapshots/{id}/program` for two mutation paths.
- **Root Cause**: FastAPI matches static routes in declaration order relative to dynamic params, and the UI cutover only replaced the obvious modal mutations while leaving one “Update snapshot” path and one program-number helper on the compatibility API.
- **Fix**: Declare `/api/snapshots/live` before `/api/snapshots/{snapshot_id}`, move the modal’s active-snapshot refresh onto `snapshotsApi.update(...)` with snapshot-first payload conversion, and expose/use `/api/snapshots/{id}/program` so operator-facing snapshot surfaces stop silently depending on `/api/flow-snapshots/*`.
- **Verification**: `pytest -q tests/test_snapshot_routes.py`; `npm --prefix web test -- --runInBand web/src/app/components/snapshots/SnapshotModalContent.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`; `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/api/snapshots/live`
- **Lesson**: During API cutovers, route order and client helpers are part of the same contract. Replacing the primary query path is not enough if any secondary modal/action path still writes through the compatibility surface.

**38. Snapshot Editor Empty-State Gating Must Treat `GET /api/snapshots/live` 404 As Canonical \"No Live Snapshot\" (MEDIUM - Mar 29, 2026)**
- **Files**: `web/src/app/pages/SnapshotEditorPageContent.tsx`, `web/src/app/pages/snapshotLiveState.ts`, `web/src/app/pages/snapshotLiveState.test.ts`
- **Problem**: The editor page still decided whether to force the entry modal by polling the compatibility snapshot list for `active_id`, even after the snapshot-first live endpoint existed.
- **Root Cause**: The page bootstrap logic was still anchored to flow-snapshot list semantics, and a missing live snapshot was not being modeled as a normal `404` empty-state on the canonical live endpoint.
- **Fix**: Fetch the active snapshot through a dedicated helper around `snapshotsApi.getLive()`, translate `ApiError(404)` into `null`, use that result for the entry gate, and invalidate the page’s `['snapshots']` / `['snapshots', 'live']` queries whenever a real recall/create path applies a snapshot to the editor.
- **Verification**: `npm --prefix web test -- --runInBand web/src/app/pages/snapshotLiveState.test.ts`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: In the snapshot-first model, “no live snapshot” is a valid state of the canonical live endpoint, not an error that should force a fallback to compatibility list polling.

**39. Snapshot-First UI Cleanup Must Retire Compatibility Cache Keys Along With API Calls (MEDIUM - Mar 29, 2026)**
- **Files**: `web/src/app/components/snapshots/SnapshotModalContent.tsx`, `web/src/app/pages/AudioTablePage.tsx`, `web/src/app/pages/AudioTablePage.test.tsx`, `web/src/app/pages/SnapshotEditorPageContent.tsx`
- **Problem**: After the primary API cutover, the app could still look compatibility-shaped because modal/query invalidations were keyed under `['flow-snapshots']`, and one shipped page (`AudioTablePage`) still counted snapshots through `flowSnapshotsApi.list()`.
- **Root Cause**: The first pass replaced mutation/read helpers but left React Query identity and one non-modal page query on the old flow-snapshot model, which kept cache invalidation and future surface work tied to compatibility vocabulary.
- **Fix**: Move shipped app surfaces to canonical `['snapshots']` cache keys and `snapshotsApi.list()`, then keep any remaining `flowSnapshotsApi` usage isolated to explicit compatibility/export layers rather than normal UI entry points.
- **Verification**: `npm --prefix web test -- --runInBand web/src/app/components/snapshots/SnapshotModalContent.test.tsx web/src/app/pages/snapshotLiveState.test.ts web/src/app/pages/AudioTablePage.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: API migration is incomplete until cache identity and secondary list surfaces migrate too. A snapshot-first app should not keep `flow-snapshots` as the default query namespace in shipped UI.

**40. MIDI Program-Change Snapshot Recall Must Reuse Canonical Snapshot Activation (HIGH - Mar 29, 2026)**
- **Files**: `app/services/midi_service.py`, `app/services/snapshot_service.py`, `tests/test_midi_service_snapshot_program_change.py`
- **Problem**: MIDI program-change recall still depended on the legacy `FlowSnapshot` table even after the snapshot-first routes and editor surfaces moved to canonical snapshots.
- **Root Cause**: `MIDIService` kept its own direct compatibility lookup and websocket-broadcast path instead of delegating to `SnapshotService`, so MIDI-triggered recalls could drift from the canonical snapshot activation contract.
- **Fix**: Resolve snapshots by program number through `SnapshotService.get_snapshot_by_program()`, then activate them through `SnapshotService.activate_snapshot(triggered_by="midi_pc")` and keep focused tests for snapshot precedence over chain fallback.
- **Verification**: `pytest -q tests/test_midi_service_snapshot_program_change.py tests/test_snapshot_service.py`
- **Lesson**: Snapshot recall should have one activation path. If MIDI can load a snapshot, it must call the same canonical service used by UI/API recall instead of rebuilding compatibility logic in `MIDIService`.

**41. Sequential Snapshot Questionnaires Need Step-Based UI And Full Build Validation (MEDIUM - Mar 30, 2026)**
- **Files**: `web/src/app/components/snapshots/SnapshotQuestionnaireModal.tsx`, `web/src/app/components/snapshots/SnapshotQuestionnaireModal.test.tsx`, `web/src/app/components/artifacts/SnapshotArtifactsWorkspace.tsx`, `web/src/app/pages/SnapshotEditorPageContent.tsx`, `web/src/app/pages/SnapshotEditorPage.css`
- **Problem**: A snapshot-create redesign can look correct with a modal and local `typecheck`, but still violate the user's "ask questions one at a time" requirement or fail the production build on route/module integration details.
- **Root Cause**: It is easy to drift into grouped-form UX instead of explicit sequential questioning, and `npm --prefix web run typecheck` does not always surface `tsc -b` failures like `JSX` namespace typing or declaration-order issues.
- **Fix**: Use an explicit step-based questionnaire that renders one prompt at a time, add focused tests for sequential navigation and final metadata shaping, and always rerun `npm --prefix web run build` after the local compile step.
- **Verification**: `npm --prefix web test -- --runInBand web/src/app/components/snapshots/SnapshotQuestionnaireModal.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: In this codebase, "ask questions" is a behavior contract. Sequential UI flow and production-build validation are both required to call the work complete.

**42. Snapshot Creation Should Stay Direct Unless The Current Task Explicitly Requires A Guided Flow (LOW - Mar 30, 2026)**
- **Files**: `web/src/app/components/artifacts/SnapshotArtifactsWorkspace.tsx`, `web/src/app/pages/SnapshotEditorPageContent.tsx`
- **Problem**: A guided questionnaire can be technically correct but still be the wrong operator workflow when the user wants `New Snapshot` to stay immediate.
- **Root Cause**: The earlier change solved a specific request but changed the default operator behavior for snapshot capture more broadly than the follow-up requirement allowed.
- **Fix**: Keep snapshot creation as a direct action by default and only introduce a guided question flow when the current task explicitly asks for it; if the requirement changes, remove the flow instead of leaving dormant modal code behind.
- **Verification**: `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: For high-frequency operator actions like snapshot creation, directness is the baseline. Guided capture is an exception, not the default.

**43. Snapshot Hero Rename Should Keep The Title As The Trigger While Persistence Stays Page-Owned (LOW - Mar 30, 2026)**
- **Files**: `web/src/app/components/SnapshotEditor/SnapshotChainManagementCard.tsx`, `web/src/app/pages/SnapshotEditorPageContent.tsx`, `web/src/app/components/SnapshotEditor/SnapshotChainManagementCard.test.tsx`
- **Problem**: After the unified Snapshot Editor hero landed, the live snapshot name became the visual focal point but remained read-only, which forced rename behavior away from the operator’s obvious click target.
- **Root Cause**: The hero card was treated as presentation-only text even though the user-facing hierarchy changed and the live snapshot title became the natural entrypoint for rename.
- **Fix**: Keep the hero card presentational except for an accessible title button that opens rename, while the actual rename mutation/cache invalidation stays in the page container via `snapshotsApi.update({ name })` and the `['snapshots', 'live']` cache update.
- **Verification**: `npm --prefix web test -- --runInBand web/src/app/components/SnapshotEditor/SnapshotChainManagementCard.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: When a Carbon hero promotes a data label into the primary focal element, the interaction model should usually follow the same hierarchy: the visible title becomes the trigger, but persistence logic remains in the owning route.

**44. Topology-Only JUCE Soak Evidence Must Preload And Prewarm The Full Effect Pool Before Stats Reset (MEDIUM - Apr 2, 2026)**
- **Files**: `.codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py`, `docs/PROJECT_WORKLIST.md`
- **Problem**: A "reuse effects" live-rewire soak can still overstate runtime apply jitter because the first measured flow rotation includes plugin load and node-creation work before the resident-node path has been established.
- **Root Cause**: The earlier harness loaded the active set lazily inside the measurement window, so even fixed-pool runs mixed first-load/plugin-node-prep spikes into what was supposed to be topology-only evidence.
- **Fix**: Add a `--preload-effect-pool` mode that loads and prewarms the full effect pool before stats reset, then rotates only resident-node topology during the measured low-latency window.
- **Verification**: `python3 -m py_compile .codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py`; `python3 .codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py --duration-seconds 20 --flow-rotation-seconds 8 --sample-interval-seconds 0.5 --warmup-seconds 2 --reset-stats-after-warmup --live-rewire --preload-effect-pool --seed 20260402 --effect-uri map2://juce/amp/peavey5150 --effect-uri map2://juce/pitch/h3000 --effect-uri map2://juce/amp/tweedbassman --effect-uri map2://juce/multieffect/passionfx --effect-uri map2://juce/delay --effect-uri map2://juce/pitch/boss-xs1 --effect-uri map2://juce/effects/eventide-h9 --effect-uri map2://juce/eq/parametric --effect-uri map2://juce/delay/circular --effect-uri map2://juce/dynamics/limiter`
- **Lesson**: When low-latency evidence is trying to isolate live topology mutation, preload and prewarm every measured effect instance before resetting stats or the first-load seam will contaminate the result.

**45. Live Snapshot/Path UI Must Read And Write Through Committed Authority State (HIGH - Apr 3, 2026)**
- **Files**: `web/src/app/components/SnapshotEditor/snapshotEditorLiveChains.ts`, `web/src/app/utils/audioStateLivePaths.ts`, `web/src/app/pages/SnapshotEditorPageContent.tsx`, `web/src/app/pages/AudioTablePage.tsx`, `web/src/app/pages/snapshotAuthorityState.ts`, `web/src/app/components/SnapshotEditor/SnapshotChainManagementCard.tsx`, `web/src/app/components/artifacts/SnapshotArtifactsWorkspace.tsx`, `web/src/app/pages/ChainsPage.tsx`, `web/src/app/pages/PerformPage.tsx`, `web/src/app/components/ChainManagementCard.tsx`
- **Problem**: Operator-facing pages could still report or mutate live snapshot/path/channel state from legacy runtime residue (`chain.is_active`, runtime websocket payloads, or direct `chainsApi.activate/deactivate`) even when the committed control plane said no snapshot or paths were live.
- **Root Cause**: The etcd-backed authority rollout removed the main split-truth architecture, but a final cluster of UI helpers and mutation handlers still treated runtime chain activity as live/control-plane truth.
- **Fix**: Build live-path projections from committed `AuthoritativeAudioState.paths`, route primary live-path mutations through `PUT /api/audio/state/desired`, quarantine secondary chain grids and stage views as explicit runtime-only utilities, remove runtime-residue fallback from shared authority selectors and channel badges, and allow Snapshot Editor metadata to fall back to persisted editor context only for non-live detail when authority is absent.
- **Verification**: `rg -n "chainsApi\\.(activate|deactivate)" web/src/app/pages/SnapshotEditorPageContent.tsx web/src/app/pages/AudioTablePage.tsx`; `npm --prefix web test -- --runInBand src/app/components/SnapshotEditor/snapshotEditorLiveChains.test.ts src/app/components/modals/LiveRuntimePathsModal.test.tsx src/app/pages/AudioTablePage.test.tsx src/app/pages/snapshotAuthorityState.test.ts src/app/components/SnapshotEditor/SnapshotChainManagementCard.test.tsx src/app/utils/audioStateLivePaths.test.ts`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: In MAP2, operator-facing live state must come from committed authority state, not runtime residue. Persisted editor context may restore metadata, but never live truth, and primary UI live-path writes must go through `PUT /api/audio/state/desired`.

**46. Platforms Utility Workspaces Must Stay In The Bottom Rail And Audio Table Must Not Reappear In Launcher Data (MEDIUM - Apr 3, 2026)**
- **Files**: `web/src/app/data/platformMenuItems.ts`, `web/src/app/components/navigation/UnifiedWorkspaceSideNav.tsx`, `web/src/app/components/navigation/UnifiedWorkspaceSideNav.css`, `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/data/advancedMenuItems.ts`, `web/src/app/data/launcherCatalog.tsx`, `web/src/app/data/homeCardProfiles.ts`
- **Problem**: During the `/platforms` hard cut, utility workspaces were still mixed into the main operational rail and the retired `/audio-table` route could still reappear through shared launcher and pinned-route data.
- **Root Cause**: Shared navigation and launcher registries still treated utility panels and `Audio Table` as ordinary first-class platform destinations, so shell-level cleanup in one menu was not enough to keep the route retired everywhere.
- **Fix**: Reordered the `/platforms` navigation so `Overview` and `Audio Engine` lead the operational stack, grouped `Host Machine`, `Theme`, `Platform Guide`, and `Workspace Catalog` into a green-tinted utility footer rail, and removed `Audio Table` from shared menu/launcher definitions so filtered landing data cannot surface `/audio-table` again.
- **Verification**: `npm --prefix web test -- --runInBand src/app/components/Platform/PlatformModal.test.tsx src/app/data/advancedMenuItems.test.ts src/app/data/launcherCatalog.test.tsx src/app/pages/HomePage.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: During a routed shell hard cut, utilities must stay visibly separate from operational workspaces and retired routes must be removed from every shared navigation/launcher registry before the final route deletion lands.

**47. Audio Engine Must Stay A Graph-First Workspace With Expandable Routing Detail, Not A Static Diagnostics Dashboard (HIGH - Apr 3, 2026)**
- **Files**: `web/src/app/components/AudioEngine/audioEngineWorkspaceGraph.ts`, `web/src/app/components/AudioEngine/AudioEngineWorkspaceGraph.tsx`, `web/src/app/pages/AudioEnginePage.tsx`, `web/src/app/pages/AudioEnginePage.css`
- **Problem**: `/platforms/audio-engine` still behaved like a generic diagnostics page even after the hard cut plan, so the flagship JUCE workspace lacked a top-of-page React Flow current-state view, traffic pulses, and a direct path from graph selections into the routing tables and controls below.
- **Root Cause**: The earlier Carbon rebuild focused on status cards, metering, and tables, but it never restructured the page around the hard-cut requirement that the graph be the dominant operator artifact and that dense detail live in expandable rows underneath it.
- **Fix**: Query source-of-truth once at page level, build a dedicated audio-engine topology model/component with animated traffic edges and anchor-aware cards, add an `Audio Flow Workspace` hero to the top of the page, and convert routing tables to Carbon expandable rows with quick mute actions for observed source/sink nodes.
- **Verification**: `npm --prefix web test -- --runInBand src/app/components/AudioEngine/audioEngineWorkspaceGraph.test.ts src/app/pages/AudioEnginePage.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: For `/platforms` hard-cut workspaces, the graph must lead and the tables must behave as anchored drill-down detail. If a page still reads like a flat dashboard, the migration is not actually complete.

**48. AVB Routing Must Live Under `/platforms/avb-routing` With Tesira Focus Params, Not The Removed `/avb-routing` Path (HIGH - Apr 3, 2026)**
- **Files**: `web/src/app/components/AvbRouting/AvbRoutingWorkspace.tsx`, `web/src/app/components/AvbRouting/AvbRoutingWorkspaceGraph.tsx`, `web/src/app/components/AvbRouting/avbRoutingWorkspaceGraph.ts`, `web/src/app/components/AvbRouting/avbRoutingWorkspaceHref.ts`, `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/components/Tesira/components/TesiraAvbTab.tsx`, `web/src/app/components/Tesira/components/TesiraDeviceDashboard.tsx`
- **Problem**: Tesira AVB launch points were still aiming at the stale `/avb-routing` route while the routed Platforms AVB layer only rendered generic layer-table chrome, so AVB/Tesira objects could not land in a graph-first operator workspace with the correct node/device context.
- **Root Cause**: The hard-cut shell migration created the routed `/platforms/avb-routing` destination, but the AVB layer never received its dedicated workspace implementation and deep-linking code still carried the pre-hard-cut path assumptions.
- **Fix**: Render a dedicated `AvbRoutingWorkspace` from `PlatformModal.tsx`, build canonical deep links with `buildAvbRoutingWorkspaceHref(...)`, and preserve `focusTesiraDevice`, `focusEntity`, and `focusNodeId` query params so Tesira cards, graph nodes, and table expansions can all resolve the same operator context.
- **Verification**: `npm --prefix web test -- --runInBand src/app/components/AvbRouting/avbRoutingWorkspaceHref.test.ts src/app/components/AvbRouting/avbRoutingWorkspaceGraph.test.ts src/app/components/AvbRouting/AvbRoutingWorkspace.test.tsx src/app/components/Tesira/components/TesiraAvbTab.test.tsx src/app/components/Tesira/components/TesiraDeviceDashboard.test.tsx src/app/components/Platform/PlatformModal.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: During the `/platforms` hard cut, AVB/Tesira handoffs must target the routed shell destination, not legacy standalone paths, and all cross-workspace links need a shared focus-param contract or node context will drift between graph and table surfaces.

**49. Cluster Dashboard Must Stay A Graph-First Workspace With Expandable Node Detail And Management Handoff, Not The Old Summary/Table Stub (HIGH - Apr 3, 2026)**
- **Files**: `web/src/app/components/ClusterDashboard/ClusterDashboardWorkspace.tsx`, `web/src/app/components/ClusterDashboard/ClusterDashboardWorkspaceGraph.tsx`, `web/src/app/components/ClusterDashboard/clusterDashboardWorkspaceGraph.ts`, `web/src/app/components/ClusterDashboard/ClusterDashboardWorkspace.css`, `web/src/app/components/Platform/PlatformModal.tsx`
- **Problem**: `/platforms/cluster-dashboard` still rendered the old summary-tile/table stub even after the hard-cut shell work, so the cluster layer had no graph hero, no peer-link telemetry view, and no direct node-scoped handoff into the routed Management workspace.
- **Root Cause**: The routed shell existed, but the cluster layer never got its dedicated React Flow workspace implementation and kept relying on the inline generic `ClusterDashboardWorkspace` placeholder inside `PlatformModal.tsx`.
- **Fix**: Replace the inline stub with a dedicated `ClusterDashboardWorkspace`, build the graph from `useNodeTopology()` audio/network edges plus node health data, use expandable Carbon rows for node detail, and wire explicit node-context adoption plus `/platforms/management` launch actions from expanded rows.
- **Verification**: `npm --prefix web test -- --runInBand src/app/components/ClusterDashboard/clusterDashboardWorkspaceGraph.test.ts src/app/components/ClusterDashboard/ClusterDashboardWorkspace.test.tsx src/app/components/Platform/PlatformModal.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: For `/platforms` hard-cut workspaces, a cluster layer is not complete until graph selection anchors into expandable detail rows and every selected node can hand operators straight into the correct routed management workspace without losing context.

**50. Platforms Layer Renames Must Keep Active IDs, Legacy Aliases, And Node Handoffs In Sync (HIGH - Apr 3, 2026)**
- **Files**: `web/src/app/platform/model.ts`, `web/src/app/platform/routes.ts`, `web/src/app/data/platformMenuItems.ts`, `web/src/app/data/advancedMenuItems.ts`, `web/src/app/pages/PlatformWorkspacePage.tsx`, `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/hooks/usePlatformShellData.ts`, `web/src/app/components/ManagementWorkspace/ManagementWorkspace.tsx`, `web/src/app/components/NetworkDiscovery/NetworkDiscoveryWorkspace.tsx`, `web/src/app/components/NodeNav/NodeMiniCard.tsx`, `web/src/app/components/ClusterDashboard/ClusterDashboardWorkspace.tsx`
- **Problem**: The routed Platforms shell still mixed legacy layer IDs (`single-node`, `api-observatory`, `midi-cluster`) with the new management/discovery operator model, so graph workspaces, menu items, and node-scoped handoffs could drift onto stale routes or misleading labels.
- **Root Cause**: Earlier `/platforms` migration slices added the routed shell incrementally, but the active layer IDs, legacy alias maps, and node-handoff launch points were not normalized together when the shell vocabulary changed.
- **Fix**: Make `management` and `network-discovery` the only active layer IDs in `PLATFORM_LAYER_META`, keep legacy aliases centralized in `platform/routes.ts` and advanced-menu mappings, redirect `midi-cluster` into `/midi-hub/connections`, render dedicated management/discovery workspaces from `PlatformModal.tsx`, and update node-scoped handoffs to target `/platforms/management` with the platform viewed-node context preserved.
- **Verification**: `npm --prefix web test -- --runInBand src/app/components/ManagementWorkspace/managementWorkspaceGraph.test.ts src/app/components/ManagementWorkspace/ManagementWorkspace.test.tsx src/app/components/NetworkDiscovery/networkDiscoveryWorkspaceGraph.test.ts src/app/components/NetworkDiscovery/NetworkDiscoveryWorkspace.test.tsx src/app/components/Platform/PlatformModal.test.tsx src/app/components/ClusterDashboard/ClusterDashboardWorkspace.test.tsx src/app/data/advancedMenuItems.test.ts src/app/components/NodeNav/NodeNavChip.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: Whenever a `/platforms` layer is renamed or moved, update `PLATFORM_LAYER_META`, route alias normalization, shared menu aliases, and every node/graph handoff in the same slice. Legacy aliases may remain for compatibility, but active shell IDs and operator-visible destinations must stay singular and consistent.

**51. Physical-Object Platform Handoffs Must Carry `focusNodeId` In The URL And Hydrate Target Context On Load (HIGH - Apr 3, 2026)**
- **Files**: `web/src/app/platform/routes.ts`, `web/src/app/platform/routes.test.ts`, `web/src/app/components/ManagementWorkspace/ManagementWorkspace.tsx`, `web/src/app/components/NetworkDiscovery/NetworkDiscoveryWorkspace.tsx`, `web/src/app/components/NodeNav/NodeMiniCard.tsx`, `web/src/app/components/ClusterDashboard/ClusterDashboardWorkspace.tsx`
- **Problem**: Graph and table objects could navigate into the right `/platforms/*` workspace while still losing the intended node context on reload or shareable deep links because the handoff depended on in-memory viewed-node state alone.
- **Root Cause**: The hard-cut workspace migration fixed routed destinations first, but it had not yet standardized a URL-level node-context contract for cross-workspace physical-object launches.
- **Fix**: Add a shared `buildPlatformNodeWorkspaceHref(...)` helper that emits `/platforms/*?focusNodeId=...`, preserve `focusNodeId` across legacy alias redirects, update graph/table launch points to use that builder, and hydrate Management/Network Discovery workspace node context from the query string on load.
- **Verification**: `npm --prefix web test -- --runInBand src/app/components/ManagementWorkspace/ManagementWorkspace.test.tsx src/app/components/NetworkDiscovery/NetworkDiscoveryWorkspace.test.tsx src/app/components/ClusterDashboard/ClusterDashboardWorkspace.test.tsx src/app/components/NodeNav/NodeNavChip.test.tsx src/app/platform/routes.test.ts`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: If a physical object launches into another `/platforms` workspace, the node scope must travel in the URL, not only in Zustand or transient cluster state. Otherwise deep links are not cold-start safe and operator context will drift.

**52. The `/audio-table` Hard Cut Is Not Complete Until The Route, Lazy Import, And Production Chunk Are Gone (HIGH - Apr 3, 2026)**
- **Files**: `web/src/app/App.tsx`, `web/src/app/App.platformRoute.test.tsx`, `web/src/app/pages/AudioTablePage.tsx`, `web/src/app/pages/AudioTablePage.test.tsx`, `web/src/app/pages/audioTableKeyboard.test.ts`, `web/src/app/components/AudioTable/*`
- **Problem**: The Platforms migration had already removed shared menu/launcher exposure for `Audio Table`, but the production app still shipped a dedicated `AudioTablePage` chunk because the lazy route and page modules remained in the router tree.
- **Root Cause**: Navigation cleanup landed earlier than the final route/file deletion, so the retired surface was hidden from normal entry points while still being directly reachable and still contributing bundle weight.
- **Fix**: Remove the `/audio-table` lazy route from `App.tsx`, add a routing regression proving `/audio-table` no longer resolves to a dedicated page, delete the legacy page/tests/private helpers, and confirm the production build output no longer emits an `AudioTablePage` asset.
- **Verification**: `npm --prefix web test -- --runInBand src/app/App.platformRoute.test.tsx src/app/data/launcherCatalog.test.tsx src/app/data/advancedMenuItems.test.ts src/app/pages/HomePage.test.tsx`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: For a hard-cut retirement, hiding a route from menus is not enough. The route import, page modules, and emitted chunk must disappear together or the legacy surface is still part of the shipped product.

**53. `/drums` Backing-Track Controls Must Share One Runtime Transport Contract, And Snapshot Routing Modals Must Not Pretend Draft Edits Are Already Live (HIGH - Apr 4, 2026)**
- **Files**: `app/services/drum_machine_service.py`, `app/routes/drums.py`, `tests/test_drum_machine_service.py`, `tests/test_drum_routes.py`, `web/src/map2/types.ts`, `web/src/map2/clients/drums.ts`, `web/src/app/hooks/useDrumMachine.ts`, `web/src/app/pages/DrumsPage.tsx`, `web/src/app/pages/DrumsPage.test.tsx`, `web/src/app/utils/snapshotRoutingLiveState.ts`, `web/src/app/utils/snapshotRoutingLiveState.test.ts`, `web/src/app/components/modals/RoutingTopologyModal.tsx`, `web/src/app/components/modals/RoutingTopologyModal.test.tsx`, `web/src/app/pages/SnapshotEditorPageContent.tsx`
- **Problem**: The Carbon `/drums` redesign exposed backing-track Play/Pause/Stop, Loop, Tempo Shift, and Pitch Shift controls that only mutated local React state, while the Snapshot Editor routing modal still advertised "changes are live" even though some edits were draft-only until reactivation.
- **Root Cause**: Neither surface had a single truth-bearing runtime contract. `/drums` lacked any backing-track transport endpoint/service, and the snapshot routing modal conflated editable draft state with authority-live runtime state.
- **Fix**: Add a service-owned backing-track catalog/transport path in `DrumMachineService` plus `/api/engine/drums/backing-tracks*` routes, route the page through shared client/hooks instead of component-local transport state, and derive live-routing status from authority-live snapshot/runtime truth so only same-mode live-safe updates mutate immediately while mode changes surface reactivation-required status.
- **Verification**: `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py`; `npm --prefix web test -- --runInBand src/app/pages/DrumsPage.test.tsx src/app/components/modals/RoutingTopologyModal.test.tsx src/app/utils/snapshotRoutingLiveState.test.ts`; `npm --prefix web run typecheck`; `npm --prefix web run build`
- **Lesson**: In MAP2, dense operator controls must round-trip through one shared runtime object. If a UI cannot mutate the live runtime path safely, the UI copy must say so explicitly instead of simulating success in local draft state.

**54. Brain Authority Sync Must Preserve The Full Scoped Projection Set Across Desired, Committed, And Observed Envelopes (HIGH - Apr 5, 2026)**
- **Files**: `app/models/audio_state.py`, `app/routes/audio_state.py`, `app/services/performance_brain_authority_sync.py`, `tests/test_audio_state_routes.py`, `tests/test_performance_brain_authority_sync.py`, `docs/PROJECT_WORKLIST.md`
- **Problem**: The first `Performance Brain` snapshot/live-authority bridge could serialize scoped runtime state into committed and desired envelopes, but node observations would silently collapse to the most recently synced Brain instance.
- **Root Cause**: `PerformanceBrainAuthoritySyncService` initially built `AudioStateObservation.extensions` from a fresh projection-only dict instead of mirroring the merged `extensions.performance_brain.instances` set already present in committed authority state.
- **Fix**: Carry extension payloads on the shared audio-state models, add `POST /api/audio/state/brain/sync` as the explicit bridge route, and populate observations from the merged committed extensions so repeated per-instance syncs preserve the full scoped Brain projection set for the node.
- **Verification**: `pytest -q tests/test_performance_brain_authority_sync.py tests/test_audio_state_routes.py`; `pytest -q tests/test_audio_state_authority_service.py tests/test_audio_state_snapshot_compiler.py tests/test_audio_state_routes.py tests/test_performance_brain_authority_sync.py tests/test_brain_service.py tests/test_brain_routes.py`
- **Lesson**: When promoting scoped runtime state into the authority plane, desired, committed, and observed envelopes must all share the same merged extension source or node-observed truth degrades into last-write-wins.

**55. Committed Brain Authority Must Rehydrate Local Runtime State Before Scoped Reads And Writes (HIGH - Apr 5, 2026)**
- **Files**: `app/routes/brain.py`, `app/services/performance_brain_authority_sync.py`, `app/services/performance_brain_service.py`, `tests/test_brain_routes.py`, `tests/test_performance_brain_authority_sync.py`, `docs/PROJECT_WORKLIST.md`
- **Problem**: Even after the Brain authority bridge started publishing scoped runtime state into committed authority, restart/open flows could still return stale local Brain instance files instead of the control-plane truth.
- **Root Cause**: The scoped Brain routes still read from and mutated local persisted service state first, and there was no service path that could replace the local Brain instance payload from the committed `extensions.performance_brain.instances` projection before route handling continued.
- **Fix**: Add authority restore support in `PerformanceBrainAuthoritySyncService`, add `resolve_runtime_instance_id()` and `replace_state()` to `PerformanceBrainService`, and make scoped Brain read/write routes restore from committed authority before operating on local persisted state.
- **Verification**: `pytest -q tests/test_brain_routes.py tests/test_performance_brain_authority_sync.py tests/test_audio_state_routes.py`; `PYTHONPYCACHEPREFIX=/tmp/map2-pyc python3 -m py_compile app/routes/brain.py app/services/performance_brain_authority_sync.py app/services/performance_brain_service.py tests/test_brain_routes.py tests/test_performance_brain_authority_sync.py`; `npm --prefix web run build`
- **Lesson**: Once runtime state is promoted into the authority plane, scoped engine routes must treat committed authority as the first restore source on open/read/write paths or local cache files will silently outrank snapshot-backed truth after restarts.

**56. Snapshot Activation Must Preserve Existing Authority Extensions During Desired And Committed Republishes (HIGH - Apr 5, 2026)**
- **Files**: `app/routes/audio_state.py`, `app/services/audio_state_snapshot_compiler.py`, `app/services/snapshot_service.py`, `tests/test_audio_state_routes.py`, `tests/test_audio_state_snapshot_compiler.py`, `tests/test_snapshot_service.py`, `docs/PROJECT_WORKLIST.md`
- **Problem**: Snapshot activation and live snapshot desired-state republishes could rebuild fresh audio-state envelopes from snapshot detail and silently drop `extensions.performance_brain.instances`, erasing Brain recall state during otherwise-valid control-plane transitions.
- **Root Cause**: The snapshot compiler defaulted `CompiledSnapshotIntent.extensions` and `AuthoritativeAudioState.extensions` to empty dicts, and the activation/publish paths wrote those fresh envelopes without merging the current authority extension payload first.
- **Fix**: Add extension-preserving snapshot compiler helpers, merge current desired/committed authority extensions before snapshot activation or desired-state republishes write fresh envelopes, and cover both paths with focused regressions.
- **Verification**: `pytest -q tests/test_audio_state_snapshot_compiler.py tests/test_audio_state_routes.py::test_activate_snapshot_route_compiles_and_commits_authoritative_state tests/test_audio_state_routes.py::test_activate_snapshot_route_preserves_existing_authority_extensions tests/test_snapshot_service.py::test_activate_snapshot_publishes_desired_state_to_audio_authority tests/test_snapshot_service.py::test_activate_snapshot_preserves_existing_authority_extensions_when_publishing_desired_state tests/test_snapshot_service.py::test_update_routing_publishes_desired_state_for_live_snapshot`; `PYTHONPYCACHEPREFIX=/tmp/map2-pyc python3 -m py_compile app/routes/audio_state.py app/services/audio_state_snapshot_compiler.py app/services/snapshot_service.py tests/test_audio_state_routes.py tests/test_audio_state_snapshot_compiler.py tests/test_snapshot_service.py`; `npm --prefix web run build`
- **Lesson**: Snapshot compilers are allowed to replace routing and IO intent, but they must preserve unrelated authority extensions unless the snapshot payload explicitly replaces them, or snapshot-first flows will erase adjacent control-plane state.

**57. Snapshot-Owned Brain Extensions Must Round-Trip Through Persistence And Replace The Live Brain Namespace On Recall (HIGH - Apr 5, 2026)**
- **Files**: `app/database.py`, `app/routes/audio_state.py`, `app/services/audio_state_snapshot_compiler.py`, `app/services/snapshot_service.py`, `tests/test_audio_state_routes.py`, `tests/test_audio_state_snapshot_compiler.py`, `tests/test_snapshot_service.py`, `docs/PROJECT_WORKLIST.md`
- **Problem**: After snapshot activation started preserving the current authority extension payload, activating Snapshot A after Snapshot B could still recall Snapshot B's latest `performance_brain` projection because snapshots themselves did not persist any Brain extension content.
- **Root Cause**: Snapshot normalization, DB persistence, detail export, and revision payloads only tracked channels/chains/routing/MIDI data, so `extensions.performance_brain` was silently dropped during save/load/restore. Activation could merge the live authority payload, but it had no snapshot-owned Brain namespace to prefer over the current live projection.
- **Fix**: Add `snapshots.extensions_payload`, extend snapshot normalize/detail/revision round-tripping to include `extensions`, capture the current authority extension projection into authored snapshots when no explicit extension payload is provided, and use namespace overlay semantics so snapshot-owned `performance_brain` replaces the live Brain namespace while unrelated extensions stay preserved.
- **Verification**: `pytest -q tests/test_audio_state_snapshot_compiler.py tests/test_audio_state_routes.py tests/test_snapshot_service.py -q`; `PYTHONPYCACHEPREFIX=/tmp/map2-pyc python3 -m py_compile app/database.py app/routes/audio_state.py app/services/audio_state_snapshot_compiler.py app/services/snapshot_service.py tests/test_audio_state_snapshot_compiler.py tests/test_audio_state_routes.py tests/test_snapshot_service.py`
- **Lesson**: Preserving current authority extensions is only half of snapshot recall. Any snapshot-owned authority namespace must round-trip through snapshot persistence and revisions, then explicitly replace the live namespace during activation, or snapshot recall will silently devolve into "whatever happened most recently."

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

### [2026-04-05] - Snapshot-Owned Brain Authority Recall
- **Section**: Gotchas & Learned Fixes (#57), Update Log
- **Change**: Documented the rule that authored snapshots must persist `extensions.performance_brain`, capture current authority extensions when authors omit them, and overlay snapshot-owned namespaces during activation/desired-state publish so snapshot recall beats the current live Brain namespace.
- **Reason**: T763-subE closed the remaining recall gap after extension-preservation work by making snapshots own Brain extension content instead of only preserving whichever projection happened to be live when activation ran.
- **Impact**: Future snapshot/authority work should treat snapshot extension round-tripping and namespace replacement as part of the recall contract, not as an optional control-plane convenience.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `app/database.py`, `app/routes/audio_state.py`, `app/services/audio_state_snapshot_compiler.py`, `app/services/snapshot_service.py`, `tests/test_audio_state_routes.py`, `tests/test_audio_state_snapshot_compiler.py`, `tests/test_snapshot_service.py`

### [2026-04-05] - Snapshot Authority Extension Preservation
- **Section**: Gotchas & Learned Fixes (#56), Update Log
- **Change**: Documented the rule that snapshot activation and desired-state republishes must preserve existing authority extensions, plus the extension-preserving compiler merge path used by the audio-state route and `SnapshotService`.
- **Reason**: T763-subD closed a regression where valid snapshot-first control-plane transitions could erase the `Performance Brain` authority projection simply by recompiling desired/committed state from snapshot detail.
- **Impact**: Future snapshot-authority work should treat extension preservation as part of the activation contract and avoid rebuilding fresh empty extension payloads unless a snapshot explicitly owns that extension namespace.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `app/routes/audio_state.py`, `app/services/audio_state_snapshot_compiler.py`, `app/services/snapshot_service.py`, `tests/test_audio_state_routes.py`, `tests/test_audio_state_snapshot_compiler.py`, `tests/test_snapshot_service.py`

### [2026-04-05] - Performance Brain Authority Restore Precedence
- **Section**: Gotchas & Learned Fixes (#55), Update Log
- **Change**: Documented the rule that scoped `Performance Brain` routes must restore local persisted instance state from committed authority before reads and writes continue, plus the new `PerformanceBrainService.replace_state()` restore path.
- **Reason**: T763-subC closed the remaining restart/open drift hole after the authority sync bridge was in place, and that precedence rule needs to be explicit so later Brain work does not reintroduce stale local-state wins.
- **Impact**: Future Brain recall and activation work should extend the committed-authority restore path instead of layering more file-first fallbacks around it.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `app/routes/brain.py`, `app/services/performance_brain_authority_sync.py`, `app/services/performance_brain_service.py`, `tests/test_brain_routes.py`, `tests/test_performance_brain_authority_sync.py`

### [2026-04-05] - Performance Brain Authority Projection Bridge
- **Section**: Gotchas & Learned Fixes (#54), Update Log
- **Change**: Documented the rule that scoped `Performance Brain` authority sync must use the merged `extensions.performance_brain.instances` set across desired, committed, and observed audio-state envelopes, plus the dedicated `/api/audio/state/brain/sync` bridge route.
- **Reason**: T763-subA introduced the first Brain snapshot/live-authority bridge, and the initial observation path would have lost previously synced instances on the same node without recording the merge requirement as part of the repo memory.
- **Impact**: Future Brain recall/live-authority work should extend the existing merged extension contract instead of inventing side stores or regressing observations back to last-write-wins behavior.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `app/models/audio_state.py`, `app/routes/audio_state.py`, `app/services/performance_brain_authority_sync.py`, `tests/test_audio_state_routes.py`, `tests/test_performance_brain_authority_sync.py`

### [2026-04-04] - Drum Runtime And Snapshot Live-Routing Truth Contract
- **Section**: Gotchas & Learned Fixes (#53), Update Log
- **Change**: Documented the service-backed `/drums` backing-track transport contract and the rule that Snapshot Editor routing surfaces must derive live/draft status from authority-live runtime truth instead of optimistic modal copy.
- **Reason**: T757 and T755 closed the last visible runtime truth gaps on the drum and snapshot control planes, and both failures came from the same class of bug: a UI that looked live but did not share a real runtime state object.
- **Impact**: Future assistants should preserve the `/api/engine/drums/backing-tracks*` contract as the single source of truth for backing-track transport, and should treat any snapshot live-routing banner/status text as incorrect unless it matches the real authority-live mutation path and reactivation rules.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `app/services/drum_machine_service.py`, `app/routes/drums.py`, `tests/test_drum_machine_service.py`, `tests/test_drum_routes.py`, `web/src/map2/types.ts`, `web/src/map2/clients/drums.ts`, `web/src/app/hooks/useDrumMachine.ts`, `web/src/app/pages/DrumsPage.tsx`, `web/src/app/pages/DrumsPage.test.tsx`, `web/src/app/utils/snapshotRoutingLiveState.ts`, `web/src/app/utils/snapshotRoutingLiveState.test.ts`, `web/src/app/components/modals/RoutingTopologyModal.tsx`, `web/src/app/components/modals/RoutingTopologyModal.test.tsx`, `web/src/app/pages/SnapshotEditorPageContent.tsx`

### [2026-04-03] - AudioTable Route Deletion And Node-Aware Platforms Deep-Link Finalization
- **Section**: Gotchas & Learned Fixes (#51, #52), Update Log
- **Change**: Documented the shared `focusNodeId` URL contract for physical-object handoffs across `/platforms/*`, plus the final hard-cut rule that `/audio-table` is not retired until the route, lazy import, files, and production chunk are all gone.
- **Reason**: T701-subF and T701-subG closed the last continuity and cleanup gaps in the Platforms hard cut: context-safe deep links and actual removal of the old Audio Table surface from the shipped bundle.
- **Impact**: Future assistants should preserve URL-based node context for platform handoffs and should treat route retirement as incomplete unless the production build output proves the old chunk disappeared.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `web/src/app/platform/routes.ts`, `web/src/app/App.tsx`, `web/src/app/App.platformRoute.test.tsx`, `web/src/app/components/ManagementWorkspace/ManagementWorkspace.tsx`, `web/src/app/components/NetworkDiscovery/NetworkDiscoveryWorkspace.tsx`, `web/src/app/components/NodeNav/NodeMiniCard.tsx`, `web/src/app/components/ClusterDashboard/ClusterDashboardWorkspace.tsx`

### [2026-04-03] - Management And Network-Discovery Workspace Contract Plus Platforms Route-Rename Alias Rules
- **Section**: Gotchas & Learned Fixes (#50), Update Log
- **Change**: Documented the dedicated `/platforms/management` and `/platforms/network-discovery` workspaces, the hard rename away from `single-node` and `api-observatory`, the `midi-cluster` redirect into MIDI Hub, and the rule that node-scoped platform handoffs must now land on `/platforms/management` while legacy aliases continue to resolve safely.
- **Reason**: T701-subE closed the management/discovery slice of the hard-cut migration and had to normalize active layer IDs, compatibility redirects, and node-context handoff behavior in one pass.
- **Impact**: Future assistants should preserve the management/discovery graph workspaces, keep legacy alias maps synchronized with active platform layer IDs, and avoid reintroducing stale route names into menus, graph links, or node-detail actions.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `web/src/app/platform/model.ts`, `web/src/app/platform/routes.ts`, `web/src/app/pages/PlatformWorkspacePage.tsx`, `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/hooks/usePlatformShellData.ts`, `web/src/app/components/ManagementWorkspace/ManagementWorkspace.tsx`, `web/src/app/components/NetworkDiscovery/NetworkDiscoveryWorkspace.tsx`, `web/src/app/components/ClusterDashboard/ClusterDashboardWorkspace.tsx`, `web/src/app/components/NodeNav/NodeMiniCard.tsx`

### [2026-04-03] - Cluster Dashboard Graph Workspace And Management Handoff Contract
- **Section**: Gotchas & Learned Fixes (#49), Update Log
- **Change**: Documented the dedicated `/platforms/cluster-dashboard` workspace, the topology/peer-link graph model, and the rule that selected cluster nodes must offer direct context-preserving handoff into `/platforms/management`.
- **Reason**: T701-subD replaced the old inline cluster stub with the next real graph-first `/platforms` workspace and had to lock the node-handoff behavior at the same time.
- **Impact**: Future assistants should preserve the graph-on-top/table-on-bottom cluster layout, keep peer telemetry visible in the graph, and avoid regressing the cluster layer back into a generic summary table.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `web/src/app/components/ClusterDashboard/ClusterDashboardWorkspace.tsx`, `web/src/app/components/ClusterDashboard/ClusterDashboardWorkspaceGraph.tsx`, `web/src/app/components/ClusterDashboard/clusterDashboardWorkspaceGraph.ts`, `web/src/app/components/Platform/PlatformModal.tsx`

### [2026-04-03] - AVB Routing Graph Workspace And Tesira Deep-Link Focus Contract
- **Section**: Gotchas & Learned Fixes (#48), Update Log
- **Change**: Documented the dedicated `/platforms/avb-routing` workspace, the shared deep-link helper for AVB/Tesira objects, and the focus-param contract that keeps graph, table, and Tesira launch points aligned.
- **Reason**: T701-subC replaced the generic AVB layer chrome with a graph-first workspace and had to close the stale `/avb-routing` deep-link seam at the same time.
- **Impact**: Future assistants should keep AVB/Tesira routing inside the Platforms shell and preserve `focusTesiraDevice`/`focusEntity`/`focusNodeId` when adding or refactoring physical-object links.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `web/src/app/components/AvbRouting/AvbRoutingWorkspace.tsx`, `web/src/app/components/AvbRouting/AvbRoutingWorkspaceGraph.tsx`, `web/src/app/components/AvbRouting/avbRoutingWorkspaceGraph.ts`, `web/src/app/components/AvbRouting/avbRoutingWorkspaceHref.ts`, `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/components/Tesira/components/TesiraAvbTab.tsx`, `web/src/app/components/Tesira/components/TesiraDeviceDashboard.tsx`

### [2026-04-03] - Audio Engine Graph Workspace And Expandable Routing Table Contract
- **Section**: Gotchas & Learned Fixes (#47), Update Log
- **Change**: Documented the graph-first `/platforms/audio-engine` workspace model, including animated runtime topology edges, source-of-truth anchoring, and expandable routing rows with direct node controls.
- **Reason**: T701-subB had to turn the existing audio-engine dashboard into the first real React Flow-first runtime workspace of the hard cut instead of leaving the old diagnostics layout mostly intact.
- **Impact**: Future assistants should preserve the graph hero, anchor-aware routing tables, and direct-detail row expansion pattern rather than regressing `/platforms/audio-engine` back into a static status page.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `web/src/app/components/AudioEngine/audioEngineWorkspaceGraph.ts`, `web/src/app/components/AudioEngine/AudioEngineWorkspaceGraph.tsx`, `web/src/app/pages/AudioEnginePage.tsx`, `web/src/app/pages/AudioEnginePage.css`

### [2026-04-03] - Platforms Rail Utility Grouping And Audio Table Launcher Removal
- **Section**: Gotchas & Learned Fixes (#46), Update Log
- **Change**: Documented the `/platforms` navigation regrouping, utility-footer styling contract, and shared launcher/menu removal of `/audio-table`.
- **Reason**: T701-subA closed the shell-level migration seam for the `/platforms` hard cut and needed an explicit memory entry so later route work does not accidentally reintroduce utility drift or resurrect the retired launcher tile.
- **Impact**: Keeps the routed Platforms shell coherent, protects the bottom-utility rail convention, and prevents `/audio-table` from reappearing through shared launcher or pinned-route normalization.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `web/src/app/data/platformMenuItems.ts`, `web/src/app/components/navigation/UnifiedWorkspaceSideNav.tsx`, `web/src/app/components/navigation/UnifiedWorkspaceSideNav.css`, `web/src/app/components/Platform/PlatformModal.tsx`, `web/src/app/data/advancedMenuItems.ts`, `web/src/app/data/homeCardProfiles.ts`

### [2026-04-03] - Authority-Only Live-Path UI And Desired-State Write Contract
- **Section**: Gotchas & Learned Fixes (#45), Update Log
- **Change**: Documented that control-plane live status must derive from committed authority state, primary live-path UI writes must use `PUT /api/audio/state/desired`, runtime-only chain controls must be labeled as such, and Snapshot Editor metadata fallback must stay separate from live semantics when authority is absent.
- **Reason**: T695 through T700 closed the remaining frontend seams where runtime residue or direct chain APIs could contradict the authority-backed live-state model.
- **Impact**: Future assistants should not reintroduce `chain.is_active`, runtime websocket residue, or direct `chainsApi.activate/deactivate` into control-plane UX, and no-authority cases should degrade to empty or saved-state semantics instead of guessing at live status.
- **Files**: `.github/copilot-instructions.md`, `docs/PROJECT_WORKLIST.md`, `web/src/app/components/SnapshotEditor/snapshotEditorLiveChains.ts`, `web/src/app/utils/audioStateLivePaths.ts`, `web/src/app/pages/SnapshotEditorPageContent.tsx`, `web/src/app/pages/AudioTablePage.tsx`, `web/src/app/pages/snapshotAuthorityState.ts`

### [2026-04-02] - Preloaded JUCE Soak Mode For Topology-Only Evidence
- **Section**: Gotchas & Learned Fixes (#44), Update Log
- **Change**: Documented and added the `--preload-effect-pool` harness mode so low-latency JUCE live-rewire evidence can preload and prewarm the measured effect pool before stats reset.
- **Reason**: The staged-node activation work needed an honest way to separate topology-only runtime mutation from first-load plugin/node construction spikes.
- **Impact**: Future snapshot-switch and graph-mutation investigations can compare topology-only evidence against construction-stress runs without contaminating the measured window.
- **Files**: `.github/copilot-instructions.md`, `.codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-30] - Snapshot Hero Rename Trigger And Web-Port Reference Fix
- **Section**: Gotchas & Learned Fixes (#43), Additional Resources, Essential Files to Read First, Update Log
- **Change**: Documented the rule that the live Snapshot Editor hero title should act as the rename trigger while the owning page handles the name-only snapshot update mutation, and corrected the stale `WEB_SERVER_PORTS.md` references to `docs/WEB_SERVER_PORTS.md`.
- **Reason**: The hero merge changed the operator hierarchy enough that rename needed to move onto the focal title itself, and the repo guidance still pointed at a non-existent root-level port-config file.
- **Impact**: Future snapshot-hero work can preserve the correct ownership split for rename behavior, and future deploy/restart work will open the right port-configuration document without path confusion.
- **Files**: `.github/copilot-instructions.md`, `docs/WEB_SERVER_PORTS.md`, `web/src/app/components/SnapshotEditor/SnapshotChainManagementCard.tsx`, `web/src/app/pages/SnapshotEditorPageContent.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-30] - Snapshot Create Direct-Action Rollback
- **Section**: Gotchas & Learned Fixes (#42), Update Log
- **Change**: Documented that snapshot creation should remain direct unless a current task explicitly requests a guided questionnaire flow, and recorded the cleanup of the now-unused questionnaire files.
- **Reason**: The user reversed the earlier questionnaire request, so the repo guidance needed to reflect the preferred default behavior for this action.
- **Impact**: Future snapshot-create work should treat direct creation as the default operator path and avoid keeping inactive question-flow code around after requirements change.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/components/artifacts/SnapshotArtifactsWorkspace.tsx`, `web/src/app/pages/SnapshotEditorPageContent.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-30] - Sequential Snapshot Questionnaire Capture
- **Section**: Gotchas & Learned Fixes (#41), Update Log
- **Change**: Documented the rule that snapshot-create question flows must be step-based and that `npm --prefix web run build` is mandatory even when local `typecheck` already passes.
- **Reason**: The questionnaire rollout surfaced both a user-facing interaction contract and build-only integration failures that would be easy to miss during local UI work.
- **Impact**: Future "ask questions" UI work should ship with sequential-flow tests plus full build validation instead of stopping at local compile success.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/components/snapshots/SnapshotQuestionnaireModal.tsx`, `web/src/app/components/snapshots/SnapshotQuestionnaireModal.test.tsx`, `web/src/app/components/artifacts/SnapshotArtifactsWorkspace.tsx`, `web/src/app/pages/SnapshotEditorPageContent.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-29] - E-SNAP Snapshot Cache-Key And Secondary-Surface Cleanup
- **Section**: Gotchas & Learned Fixes (#39), Update Log
- **Change**: Documented that shipped UI surfaces should use canonical `['snapshots']` query keys and `snapshotsApi.list()` once the snapshot-first contract exists, leaving `flowSnapshotsApi` only as an explicit compatibility layer.
- **Reason**: The third cleanup slice removed the last real compatibility snapshot query from app pages and aligned the modal/editor invalidation model with the canonical snapshot namespace.
- **Impact**: Future snapshot work can share one query namespace and one list contract across the app instead of preserving stale compatibility cache identity after the backend cutover.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/components/snapshots/SnapshotModalContent.tsx`, `web/src/app/pages/AudioTablePage.tsx`, `web/src/app/pages/AudioTablePage.test.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-29] - E-SNAP Snapshot Editor Live-Gate Canonicalization
- **Section**: Gotchas & Learned Fixes (#38), Update Log
- **Change**: Documented the rule that the Snapshot Editor must derive its entry-point gate from `GET /api/snapshots/live` with `404 => null`, plus the need to invalidate the page’s live/summary snapshot queries when a real snapshot load is applied.
- **Reason**: After the modal/library cutover, the editor page was still bootstrapping through compatibility list semantics, which kept the last high-traffic entry gate tied to `flowSnapshotsApi`.
- **Impact**: Future snapshot-first work can treat the live endpoint as the one authoritative source for “is something live?” state and avoid reintroducing compatibility polling into the editor bootstrap path.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/pages/SnapshotEditorPageContent.tsx`, `web/src/app/pages/snapshotLiveState.ts`, `web/src/app/pages/snapshotLiveState.test.ts`, `docs/PROJECT_WORKLIST.md`

### [2026-03-29] - E-SNAP Snapshot-First Modal Cutover And Live Route Ordering
- **Section**: Gotchas & Learned Fixes (#37), Update Log
- **Change**: Documented the snapshot-first route-ordering rule for `/api/snapshots/live` and the requirement to remove hidden compatibility writes when migrating modal/editor snapshot surfaces off `flowSnapshotsApi`.
- **Reason**: The first snapshot-first deployment still failed in two subtle ways: a static route shadowed by `/{snapshot_id}`, and secondary modal actions that still wrote through `/api/flow-snapshots/*` even after the main list/detail/activate path moved.
- **Impact**: Future snapshot cutovers should verify both route declaration order and every secondary mutation helper, which reduces false-green deployments where the canonical API exists but the UI still leaks compatibility traffic.
- **Files**: `.github/copilot-instructions.md`, `app/routes/unified_snapshots.py`, `web/src/map2/clients/snapshots.ts`, `web/src/app/components/snapshots/SnapshotModalContent.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-29] - E-SNAP Canonical Ownership Flip For SnapshotEditor, ChainGraph, And SignalPath
- **Section**: Gotchas & Learned Fixes (#36), Update Log
- **Change**: Documented that the real implementation for snapshot-editor, chain-graph, and device signal-path surfaces now lives under the canonical `SnapshotEditor*`, `ChainGraph*`, and `*SignalPath*` files, with legacy filenames kept only as compatibility re-exports.
- **Reason**: The final E-SNAP shim-retirement pass closed the remaining ownership gap after the earlier build-gate reconciliation, and future assistants need to start from the canonical files instead of reopening legacy wrappers.
- **Impact**: Future work can target the actual owner modules directly, which reduces wrapper churn, keeps docs accurate, and makes follow-up shim deletion safer.
- **Files**: `.github/copilot-instructions.md`, `docs/CLAUDE.md`, `docs/MEMORY.md`, `docs/PROJECT_WORKLIST.md`, `web/src/app/pages/SnapshotEditorPageContent.tsx`, `web/src/map2/components/ChainBuilder/ChainGraphCanvas.tsx`, `web/src/app/components/MPX1/MPX1SignalPathCanvas.tsx`, `web/src/app/components/IntelFX/IntelFXSignalPathCanvas.tsx`

### [2026-03-29] - E-SNAP Snapshot-Editor Build-Gate Reconciliation
- **Section**: Build & Test Commands, Gotchas & Learned Fixes (#35), Update Log
- **Change**: Documented that wrapper-entrypoint vocabulary migrations must be verified with the full production build, and recorded the specific E-SNAP failure mode around missing default re-exports plus unsupported `useEffectEvent` usage in the current build pipeline.
- **Reason**: The post-reboot reconciliation checkpoint for the snapshot editor passed `typecheck` and focused tests but still failed `npm --prefix web run build` until the wrapper/export and hook issues were repaired.
- **Impact**: Future assistants should treat wrapper renames and hook modernizations as production-build-gated work, which reduces false-green checkpoints before commit/push or any port-3000 restart loop.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/hooks/useSnapshots.ts`, `web/src/app/components/MPX1/MPX1FlowCanvas.tsx`, `web/src/app/components/MPX1/MPX1FlowPatchCords.tsx`, `docs/PROJECT_WORKLIST.md`, `docs/MEMORY.md`

### [2026-03-28] - Scoped Loader Route Persistence Sync
- **Section**: Gotchas & Learned Fixes (#21), Update Log
- **Change**: Documented the rule that scoped NAM/cabinet/reverb IR routes must round-trip persisted loader state, expose configured-vs-runtime warning payloads, and apply duplicate-safe global fallback to IR loaders the same way NAM already does.
- **Reason**: `T514` closed the route-layer gap after persistence and activation restore were in place, preventing successful scoped writes from drifting away from the saved chain-plugin state.
- **Impact**: Future assistants can build metadata UI and snapshot/deploy work on top of route payloads that already reconcile configured state with live runtime state instead of reverse-engineering that relationship again.
- **Files**: `.github/copilot-instructions.md`, `app/routes/nam.py`, `app/routes/ir.py`, `tests/test_nam_ir_instance_routes.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-28] - Chain Activation Runtime Restore
- **Section**: Gotchas & Learned Fixes (#20), Update Log
- **Change**: Documented the rule that chain activation must restore persisted NAM/IR loader state per runtime instance and must persist an explicit `runtime_sync` contract when deployment is active, partial, or unavailable.
- **Reason**: `T513` closed the gap between stored duplicate-loader configuration and live JUCE runtime identity, and future route/UI work depends on that capability signal instead of guessing from an empty pedalboard.
- **Impact**: Future assistants can build scoped loader warnings and metadata UX on top of a stable activation/runtime contract rather than rediscovering why duplicate loaders silently degrade when runtime deploy is missing.
- **Files**: `.github/copilot-instructions.md`, `app/services/chain_service.py`, `tests/test_chain_plugin_loader_state_persistence.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-28] - Chain Plugin Loader-State Persistence
- **Section**: Gotchas & Learned Fixes (#19), Update Log
- **Change**: Documented the additive `chain_plugins` loader-state schema and the rule that chain deploy/preset serializers must preserve NAM/cabinet/reverb per-loader asset state instead of reducing those rows to URI/position/bypass only.
- **Reason**: `T512` required duplicate-safe persistence before runtime activation restore or scoped-loader UI work could proceed, and the old round-trip paths silently discarded the new loader data.
- **Impact**: Future assistants can extend activation/runtime restore work on top of a stable persistence contract instead of rediscovering why duplicate loaders lose identity after any chain serialization boundary.
- **Files**: `.github/copilot-instructions.md`, `app/database.py`, `app/services/chain_service.py`, `app/routes/chains.py`, `tests/test_chain_plugin_loader_state_persistence.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-28] - AudioTable Mutation Harness Closeout
- **Section**: Gotchas & Learned Fixes (#34), Update Log
- **Change**: Documented the stable `AudioTablePage.test.tsx` mutation harness: lazy proxy API mocks, immediate `useMutation` execution, keyboard-driven preset selection, and semantic Carbon checkbox toggles for the row-action path.
- **Reason**: `T454-subN` was blocked by a test-only failure mode where preseeded render coverage hid hoisted mock timing problems and queued mutation calls never reached the API payload assertions.
- **Impact**: Future assistants can extend the Audio Table integration suite without reopening the same Carbon/jsdom dead end; the canonical stable path for mutation assertions is now explicit.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/pages/AudioTablePage.test.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-28] - DrumsPage Raw-Input Audit Closeout
- **Section**: Gotchas & Learned Fixes (#33), Update Log
- **Change**: Documented the final `T460-subF` sweep: `web/src/app/pages/DrumsPage.tsx` no longer uses raw `input[type=range|number]` for live parameter surfaces, and the page test mock now treats shared numeric controls as interactive inputs instead of read-only placeholders.
- **Reason**: The remaining wrapper-retirement tail was concentrated in `DrumsPage`, but the old page test harness still mocked `NumberInput` as inert markup, which would have hidden real regressions once the shared runtime took over those controls.
- **Impact**: Future assistants can treat the frontend raw-input audit as complete once `rg -n 'type="range"|type="number"' web/src` only reports CSS selectors, Recharts axis props, and test-only code, and `DrumsPage` regressions now exercise the real shared-control mutation wiring.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/pages/DrumsPage.tsx`, `web/src/app/pages/DrumsPage.test.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Parameter-Control Wrapper Retirement
- **Section**: Gotchas & Learned Fixes (#31), Update Log
- **Change**: Documented the rule that wrapper deletion comes after the shared `ParameterControl` namespace absorbs the legacy prop contract, exports the `NumberInput` alias directly, and the focused tests stop shadowing the module with duplicate mocks.
- **Reason**: `T460` moved the app and `map2` surfaces off `Controls/*` and `map2/components/NumberInput`, but that cleanup only stayed safe once the shared entry points preserved the old call-site contract and the test mocks were consolidated.
- **Impact**: Future cleanup passes can delete dead compatibility files cleanly instead of leaving hidden import-path debt or breaking suites that only mocked the retired wrapper path.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/components/ParameterControl/legacyProps.ts`, `web/src/app/components/ParameterControl/ParameterNumericInput.tsx`, `web/src/app/components/ParameterControl/ParameterKnob.tsx`, `web/src/app/components/ParameterControl/ParameterSlider.tsx`, `web/src/app/components/ParameterControl/index.ts`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Parameter-Control Audit Safe Subset + Tesira Draft Sync Guard
- **Section**: Gotchas & Learned Fixes (#32), Update Log
- **Change**: Recorded the safe-subset `T460-subF` migrations (Tesira EQ, Tweed Bassman bright volume, MPX1 knob) and the Tesira DSP draft-hydration equality guard that prevents maximum-update-depth loops under recreated query payloads.
- **Reason**: The wrapper-retirement follow-up surfaced a real state-sync bug while validating the next shared-control slice, and the remaining apply-button draft surfaces need an explicit reminder that they are not blind drop-in migrations.
- **Impact**: Future assistants can keep pushing `T460-subF` without reintroducing the Tesira render loop or swapping shared controls into draft/apply workflows that still need a dedicated commit strategy.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/components/Tesira/components/TesiraEQTab.tsx`, `web/src/app/components/Tesira/components/TesiraDspBlockPanel.tsx`, `web/src/app/components/Tesira/components/TesiraDspBlockPanel.test.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/TweedBassmanCard.tsx`, `web/src/app/components/MPX1/MPX1Knob.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Tesira Apply-Button Migration + Nullable MIDI Draft Cleanup
- **Section**: Gotchas & Learned Fixes (#33), Update Log
- **Change**: Documented the safe migration rule for the remaining `T460-subF` surfaces: Tesira mixer/levels/DSP apply-button controls now use shared `NumberInput` with local draft state, while `JuceGridSelectedBlockMidiPanel` drops raw `type="number"` fields via sanitized text-mode numeric inputs so nullable MIDI drafts stay intact.
- **Reason**: The raw-input audit tail was down to draft/apply panels where a blind shared-control swap could either reintroduce mutation-timing regressions or erase intentional blank draft semantics.
- **Impact**: Future assistants can keep narrowing `T460-subF` without reopening the same design question; the remaining raw-input backlog is now isolated to `DrumsPage.tsx`, and nullable MIDI drafts have an explicit non-shared migration rule until shared controls support blank state.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/components/Tesira/components/TesiraMixerTab.tsx`, `web/src/app/components/Tesira/components/TesiraLevelsTab.tsx`, `web/src/app/components/Tesira/components/TesiraDspBlockPanel.tsx`, `web/src/app/pages/JuceGridSelectedBlockMidiPanel.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Parameter-Control Validation Hardening
- **Section**: Gotchas & Learned Fixes (#30), Update Log
- **Change**: Documented the rule that shared parameter-control validation must include formatter/parser regressions, descriptor-bound clamping, and no-op blur commit suppression, and linked that evidence to the finished validation document.
- **Reason**: The pilot migrations were implemented and passing, but `T459` still needed explicit runtime evidence for consistency and mutation-suppression behavior before the validation slice could be called complete.
- **Impact**: Future parameter-control migrations now have a concrete validation checklist and shared-runtime regression pattern instead of relying only on per-surface wiring tests.
- **Files**: `.github/copilot-instructions.md`, `docs/validation/parameter-controls-validation.md`, `web/src/app/components/ParameterControl/format.test.ts`, `web/src/app/components/ParameterControl/ParameterControl.test.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Shared Parameter-Control Runtime + Calibration Pilot
- **Section**: Gotchas & Learned Fixes (#29), User Preferences
- **Change**: Documented the migration rule that old numeric wrappers must stay in `legacy` commit mode while the new `ParameterControl` family opts selected surfaces into `blur`/`idle` commit behavior, and captured the first calibration pilot on `MIDICommanderSetup`.
- **Reason**: The parameter-control runtime work introduced deferred commit semantics needed by calibration fields, but changing the legacy wrappers globally would have pushed incompatible behavior into dozens of existing surfaces that still expect eager updates.
- **Impact**: Future parameter-control migrations can reuse the shared runtime immediately without risking broad behavior drift; new surfaces opt in deliberately, and legacy wrappers stay stable until their own pilot task closes.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/components/NumericInput/NumericInput.tsx`, `web/src/app/components/ParameterControl/*`, `web/src/app/components/Controls/NumberInput.tsx`, `web/src/app/components/Controls/ParameterKnob.tsx`, `web/src/app/components/Controls/ParameterSlider.tsx`, `web/src/map2/components/NumberInput.tsx`, `web/src/app/components/MIDICommanderSetup.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Complete T453 Runtime-Identity Closeout
- **Section**: Gotchas & Learned Fixes (#28), User Preferences, Python Backend Gotchas, React/TypeScript Gotchas
- **Change**: Documented the final rule that all selected-block JUCE effect families must preserve runtime identity end to end, using shared scoped helpers, `plugin_position` stale-instance recovery, and fail-closed routing instead of singleton fallbacks.
- **Reason**: The last T453 audit slice found that dynamics, pitch/modulation, H3000, Lexi Love, and ShoeGaze were still mixing selected-block UI state with global route/service paths after NAM, IR, EQ, and plugin-parameter routing had already been hardened.
- **Impact**: Future effect-route work has one explicit contract to preserve: once a processor is duplicate-capable in the selected-block UI, every read/write/meter/query path must stay runtime-scoped from card hook to backend resolver.
- **Files**: `.github/copilot-instructions.md`, `app/routes/scoped_plugin_utils.py`, `app/routes/dynamics.py`, `app/routes/pitch.py`, `app/routes/modulation.py`, `app/routes/h3000.py`, `app/routes/lexi_love.py`, `app/routes/shoegaze.py`, `web/src/app/hooks/runtimeScopedQuery.ts`, `web/src/app/hooks/useDynamics.ts`, `web/src/app/hooks/useModulation.ts`, `web/src/app/hooks/useH3000.ts`, `web/src/app/hooks/useLexiLove.ts`, `web/src/app/hooks/useShoeGaze.ts`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Scoped EQ Runtime Identity Routing
- **Section**: Gotchas & Learned Fixes (#27), Python Backend Gotchas, React/TypeScript Gotchas
- **Change**: Documented that the EQ route family and `useFilters`/`ParametricEQCard` must carry runtime identity, resolve the live scoped instance before any engine call, and translate REST-facing EQ field names to the JUCE FilterPlugin parameter symbols.
- **Reason**: The remaining T453 EQ audit found that duplicate parametric EQ blocks still read and wrote through the global singleton path even after other selected-block JUCE cards had become runtime-identity aware.
- **Impact**: Future EQ/filter work should preserve both halves of the contract: fail-closed scoped instance resolution and explicit symbol/enum translation between the REST API and the JUCE engine.
- **Files**: `.github/copilot-instructions.md`, `app/routes/filters.py`, `web/src/app/hooks/useFilters.ts`, `web/src/app/components/PluginCards/Custom/JUCE/ParametricEQCard.tsx`, `tests/test_filters_route_identity.py`, `web/src/app/components/PluginCards/Custom/JUCE/ParametricEQCard.test.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - NAM Instance-Scoped Service Status Helpers
- **Section**: Gotchas & Learned Fixes (#26), Python Backend Gotchas
- **Change**: Documented the need for service-level `*_instance` NAM status helpers sourced from `get_nam_model_info_instance()` so duplicate-safe consumers can avoid the global NAM singleton query path.
- **Reason**: The T453 backend audit found that NAM routes had duplicate-safe instance info but the service surface still encouraged global status reads for bypass/loading/levels/gains/normalize.
- **Impact**: Future NAM consumers can stay duplicate-safe by default and no longer need ad-hoc route-local status extraction logic.
- **Files**: `.github/copilot-instructions.md`, `app/services/juce_engine_service.py`, `tests/test_juce_engine_service_instance_resolution.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Fail-Closed Scoped IR Routing
- **Section**: Gotchas & Learned Fixes (#25), Python Backend Gotchas
- **Change**: Documented that scoped IR routes must validate/recover explicit `instance_id` values through the live engine resolver and raise `404` when scoped resolution fails, rather than falling through to `_ir_processor`.
- **Reason**: The T453 audit found a remaining global-singleton leak in the IR asset/status route family even after duplicate-safe NAM and plugin-parameter routing had been hardened.
- **Impact**: Future IR route work should preserve a strict boundary between instance-scoped requests and legacy global fallback behavior, preventing duplicate-instance cross-talk and wrong-target asset operations.
- **Files**: `.github/copilot-instructions.md`, `app/routes/ir.py`, `tests/test_nam_ir_instance_routes.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Backend Runtime-Identity Scoping For Plugin Parameter Reads
- **Section**: Gotchas & Learned Fixes (#24), Python Backend Gotchas
- **Change**: Documented that `/api/plugins/{uri}/parameters` must resolve a live scoped instance from `instance_id` / `plugin_position` before reading parameter values, and that missing scoped positions should fail closed instead of falling through to an arbitrary duplicate instance.
- **Reason**: The remaining backend audit for T453 found that duplicate-plugin parameter reads were still URI-only even after the engine and frontend had mostly become runtime-identity aware.
- **Impact**: Future backend parameter-read work should treat duplicate-safe instance resolution as part of the route contract, preventing stale-instance leakage and wrong-value reads in multi-instance chains.
- **Files**: `.github/copilot-instructions.md`, `app/routes/plugins.py`, `tests/test_plugin_parameter_route_identity.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Frontend Runtime-Identity Scoping For Duplicate Instances
- **Section**: Gotchas & Learned Fixes (#23), React/TypeScript Gotchas
- **Change**: Documented the need to scope asset/status query invalidation, websocket parameter matching, and fallback LV2 editor props by runtime identity instead of URI-only matching.
- **Reason**: The T453 frontend audit found three different duplicate-instance leaks in the selected-block path even after backend/plugin-host identity plumbing existed.
- **Impact**: Future frontend work on duplicate-safe effects should treat scoped query keys and websocket filters as part of the runtime contract, not just a UI optimization detail.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/components/loaders/NAMManagerDialog.tsx`, `web/src/app/components/loaders/IRManagerDialog.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/ReverbIRCard.tsx`, `web/src/map2/hooks/useWebSocket.ts`, `web/src/app/components/PluginCards/PluginCardRouter.tsx`, `web/src/app/components/LV2PluginParameterEditor.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Scoped NAM Chooser Recovery From Stale Instance IDs
- **Section**: Gotchas & Learned Fixes (#22), User Preferences
- **Change**: Documented the rule that selected-block JUCE actions must send both `instance_id` and `plugin_position`, and that backend scoped resolution must validate cached instance ids against the live pedalboard before using them.
- **Reason**: T452 exposed a real failure mode where the NAM chooser dialog trusted a stale instance id and surfaced a false `Failed to load NAM model` error instead of recovering through the stable chain position.
- **Impact**: Future selected-block JUCE load/control flows can survive backend/runtime identity churn without regressing to stale-instance failures.
- **Files**: `.github/copilot-instructions.md`, `app/routes/nam.py`, `app/services/juce_engine_service.py`, `web/src/map2/api.ts`, `web/src/app/components/loaders/NAMManagerDialog.tsx`, `tests/test_nam_ir_instance_routes.py`, `tests/test_juce_engine_service_instance_resolution.py`, `web/src/app/components/loaders/NAMManagerDialog.test.tsx`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - Signal-Safe Shutdown + Tesira Retry Backoff
- **Section**: Gotchas & Learned Fixes (#16, #17), Server Management Gotchas
- **Change**: Documented the signal-safe `SIGTERM` watchdog pattern for backend shutdown plus the Tesira offline retry backoff/SSH-availability rules.
- **Reason**: T450 traced the remaining `68s` post-soak restart to a signal-handler deadlock and the recurring load-window latency bursts to serialized retries against five unreachable Tesira hosts.
- **Impact**: Future backend restarts stay on the ~29-30 second path, and offline Tesira recovery no longer spams pointless SSH fallback errors or churns the retry loop at near-constant cadence during load qualification.
- **Files**: `.github/copilot-instructions.md`, `app/main.py`, `app/services/tesira/tesira_device.py`, `app/services/tesira/tesira_fleet.py`, `tests/test_main_shutdown.py`, `tests/tesira/test_tesira_device_transport.py`, `tests/tesira/test_tesira_fleet.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-27] - T209 Qualification Recording-Session Gate
- **Section**: Gotchas & Learned Fixes (#15), Build & Test Commands
- **Change**: Documented that API load qualification must use full-run observability recording sessions and the calibrated mixed-workload server-side gate rather than the bounded live ring buffer.
- **Reason**: The tail-truncated ring buffer produced false p95/error failures during T209 reruns even after the backend fixes had landed.
- **Impact**: Future smoke/full qualification runs will evaluate the real steady-state window and avoid reopening T209 on observability math artifacts.
- **Files**: `.github/copilot-instructions.md`, `tests/load_test.py`, `docs/API_LOAD_QUALIFICATION_RUNBOOK.md`, `docs/PROJECT_WORKLIST.md`

### [2026-03-26] - AVDECC Packet-Socket Capability Fix Under Hardening
- **Section**: Gotchas & Learned Fixes (#14), Server Management Gotchas
- **Change**: Documented that the backend needs `CAP_NET_RAW` in addition to `CAP_SYS_NICE` so AVDECC controller startup can create packet sockets under the hardened systemd service.
- **Reason**: The live backend kept logging `CAP_NET_RAW may be required` and silently disabled AVDECC discovery until the capability contract was corrected in both the repo and installed unit files.
- **Impact**: Future hardening changes should audit capability requirements for each subsystem, not just writable paths, before declaring the service contract complete.
- **Files**: `.github/copilot-instructions.md`, `systemd/map2-backend.service`, `scripts/setup_realtime.sh`, `ReadMe-Make_New_Node.txt`, `tests/test_backend_service_contract.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-26] - PTP Monitor Runtime Socket Fix Under Hardening
- **Section**: Gotchas & Learned Fixes (#13), Server Management Gotchas
- **Change**: Documented the need to force `pmc -u` client sockets under `/run/map2-audio` and to skip direct `pmc` execution when that writable runtime path cannot be prepared.
- **Reason**: Even after the main backend writable-path contract was fixed, the live service kept spamming `uds: bind failed: Read-only file system` because `pmc` still defaulted to `/var/run/pmc.$pid`.
- **Impact**: Future AVB/PTP hardening work should audit transient UNIX-socket clients the same way it audits persisted state paths.
- **Files**: `.github/copilot-instructions.md`, `app/services/avb/ptp_monitor.py`, `tests/test_ptp_monitor.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-26] - ProtectSystem Override Fix For Manifest-Backed Routes
- **Section**: Gotchas & Learned Fixes (#12), Server Management Gotchas
- **Change**: Documented that the backend manifest/remediation surfaces depend on `/var/lib/map2` remaining in every effective `ReadWritePaths` definition and that manifest-backed reads must degrade cleanly when storage is unavailable.
- **Reason**: A live override narrowed the writable allowlist to `~/.local/share` and `~/.cache`, which made `/api/platform-remediation/summary` and `/api/cluster/update/manifest*` fail with `500` until the backend unit contract and route hardening were fixed together.
- **Impact**: Future service-hardening or realtime override edits should preserve the canonical MAP2 state paths and verify the remediation/manifest endpoints immediately after restart.
- **Files**: `.github/copilot-instructions.md`, `systemd/map2-backend.service`, `scripts/setup_realtime.sh`, `ReadMe-Make_New_Node.txt`, `app/services/cluster/version_manifest.py`, `app/routes/platform_remediation.py`, `app/routes/cluster_update.py`, `docs/PROJECT_WORKLIST.md`

### [2026-03-24] - Stable Platform Version Artifacts Across Rebuild Loops
- **Section**: Gotchas & Learned Fixes (#10), Build & Deployment Workflow
- **Change**: Documented the split between stable tracked build identity and live runtime git metadata so clean rebuilds on port `3000` no longer re-dirty `VERSION` and `version.json`.
- **Reason**: Repeated user-requested deploy loops were leaving the repo dirty immediately after a successful restart, which broke clean-handoff expectations.
- **Impact**: Future rebuild/restart cycles can be validated from a clean tree without forcing a follow-up commit that only captures version-file churn.
- **Files**: `.github/copilot-instructions.md`, `app/utils/platform_version.py`, `scripts/generate_platform_version.py`, `tests/test_platform_version.py`

### [2026-03-24] - Frontend Rebuild Gate After Drum GUI Closure
- **Section**: Gotchas & Learned Fixes (#9), User Preferences
- **Change**: Documented that full `npm --prefix web run build` is the authoritative pre-restart gate because focused typecheck/tests can miss production-build blockers such as declaration-order mistakes and stale generated/default state contracts.
- **Reason**: The cycle-1 rebuild for the drum-machine work caught real deployment blockers that were invisible to the earlier scoped validation commands.
- **Impact**: Future `update` or restart requests should always run the full web build before replacing the live `3000` listener.
- **Files**: `.github/copilot-instructions.md`, `web/src/app/pages/DrumsPage.tsx`, `web/src/map2/drumMachineState.ts`, `web/src/map2/drumMachineState.test.ts`

### [2026-03-24] - DrumSequencer Stack-Overflow Test Fix
- **Section**: Gotchas & Learned Fixes (#8)
- **Change**: Documented the standalone native-test crash caused by `DrumSequencer` carrying its full pattern store inline by value and the fix to move that storage to heap-backed ownership.
- **Reason**: The `T392` crash only reproduced in the native harness constructor path, and without recording the cause it is easy to regress by reintroducing large stack-resident aggregates in real-time classes.
- **Impact**: Future drum/native test work should treat very large state containers as heap-backed by default and use full `ctest` as the sign-off gate after native layout changes.
- **Files**: `.github/copilot-instructions.md`, `juce-engine/Source/DrumMachine/DrumSequencer.h`, `juce-engine/Source/DrumMachine/DrumSequencer.cpp`, `docs/PROJECT_WORKLIST.md`

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

### [2026-03-27] - Web Production Shutdown Hardening (COMPLETE)
- **Section**: Gotchas & Learned Fixes (#18), Build & Test Commands, Server Management Patterns
- **Change**: Updated the production web service contract so systemd and the deploy wrapper launch `serve_web_dist.mjs` through `/usr/bin/node` directly, and hardened `serve_web_dist.mjs` to destroy tracked client/proxy sockets during `SIGTERM` shutdown.
- **Reason**: The live port-`3000` restart still hit the `SIGKILL` fallback first because the host was on a stale npm-wrapper unit, and then again because `server.close()` alone did not drain persistent browser sockets fast enough.
- **Impact**: `map2-web-prod` stop/start now targets the real node server process directly and repeated production restarts no longer depend on systemd’s forced-kill escape hatch.
- **Files**: `systemd/map2-web-prod.service`, `scripts/build/deploy`, `scripts/install-node.sh`, `scripts/serve_web_dist.mjs`, `tests/test_serve_web_dist.py`

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
cd /home/mm/map2-audio && nohup /usr/bin/node scripts/serve_web_dist.mjs \
  --host 0.0.0.0 --port 3000 > /tmp/preview.log 2>&1 &

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
✅ `cd /home/mm/map2-audio && /usr/bin/node scripts/serve_web_dist.mjs --host 0.0.0.0 --port 3000`

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
- `docs/WEB_SERVER_PORTS.md` - Port configuration reference

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
**Last Updated**: April 3, 2026
**Maintained by**: GitHub Copilot AI Assistants

# AVB Routing Matrix UI Specification

**Version:** 1.0
**Date:** February 16, 2026
**Project:** MAP2 Audio Platform
**Target:** React + TypeScript + Material-UI Integration

---

## Executive Summary

Build a **professional AVB routing matrix interface** for the MAP2 Audio Platform — a high-fidelity routing & patching control surface for managing AVB/TSN audio stream connections across MAP2 nodes and third-party AVDECC devices.

This interface will provide a virtualized routing grid capable of handling N-to-M talker-to-listener connections with **full audit trail**, **scene management**, **SRP admission control integration**, and **real-time status monitoring**.

---

## 🎯 Integration with MAP2 Backend

### Existing Backend APIs (FastAPI)

The routing UI will consume these existing endpoints:

#### 1. **Endpoint Discovery**
```
GET /api/avb/router/endpoints?direction={talker|listener}
```
Returns `AudioEndpoint` objects with:
- `endpoint_id`, `entity_id`, `unique_id`
- `direction` (talker/listener)
- `device_type` (map2/avdecc)
- `device_name`, `channels`, `sample_rate`, `format`
- `mac_address`, `node_address`, `available`, `last_seen`

#### 2. **Connection Management**
```
POST /api/avb/router/connect
Body: { talker_id, listener_id }
Returns: { success, connection_id, srp_admission }

POST /api/avb/router/disconnect
Body: { talker_id, listener_id }
Returns: { success, srp_release }
```

#### 3. **Routing Matrix**
```
GET /api/avb/router/matrix
```
Returns full N×M matrix: `Dict[talker_id, Dict[listener_id, ConnectionState]]`

States: `disconnected`, `connecting`, `connected`, `disconnecting`, `error`

#### 4. **Active Connections**
```
GET /api/avb/router/connections
```
Returns list of `StreamConnection` objects with:
- `connection_id`, `talker`, `listener`, `state`
- `established_time`, `error_message`
- `srp_reservation_id`, `srp_admission_id`

#### 5. **Statistics**
```
GET /api/avb/router/stats
```
Returns endpoint/connection counts by type and state

#### 6. **SRP Admission Control** (Optional)
```
GET /api/avb/srp/status
GET /api/avb/srp/admissions?decision=allowed|denied
```

---

## 🧠 Technical Stack

### Required Technologies

- **React 19** (functional components, hooks)
- **TypeScript** (strict mode)
- **Material-UI v6** (`@mui/material` v6.5.0+)
- **react-window** (`^1.8.11`) for virtualization
- **React Router** (`react-router-dom` v6.28+) for navigation
- **react-query** (`@tanstack/react-query` v5.59+) for data fetching
- **Reducer-based state machine** (useReducer + Context)

### Architecture Principles

1. **Type Safety**: All data models defined as TypeScript interfaces
2. **Immutable State**: Reducer pattern with immutable updates
3. **Audit Trail**: All user actions logged with timestamps
4. **Real-time Updates**: WebSocket integration for live endpoint/connection changes
5. **Performance**: Virtualization for 100+ endpoint matrices
6. **Accessibility**: ARIA labels, keyboard navigation

---

## 📐 Data Models (TypeScript Interfaces)

### Endpoint Model

```typescript
interface Endpoint {
  endpoint_id: string;           // "entity_id:unique_id"
  entity_id: string;             // Hex string
  unique_id: number;             // Stream index
  direction: 'talker' | 'listener';
  device_type: 'map2' | 'avdecc' | 'unknown';
  device_name: string;
  channels: number;
  sample_rate: number;
  format: string;                // "24-bit PCM"
  mac_address: string | null;
  node_address: string | null;   // "http://192.168.1.10:8080"
  available: boolean;
  last_seen: string;             // ISO timestamp

  // UI-specific fields
  tags: string[];                // User-defined tags
  color: string;                 // User-assigned color
  group: string;                 // Logical grouping
  bank: number;                  // Banking for pagination
  pinned: boolean;               // Pin to top
  locked: boolean;               // Lock from changes
}
```

### Route Model

```typescript
interface Route {
  id: string;                    // "talker_id→listener_id"
  talker_id: string;
  listener_id: string;
  state: ConnectionState;
  established_time: string | null;
  error_message: string | null;
  locked: boolean;               // UI lock
  valid: boolean;                // Validation passed
  messages: string[];            // Validation warnings
  srp_reservation_id: string | null;
  srp_admission_id: string | null;
}

type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';
```

### Scene Model

```typescript
interface Scene {
  id: string;                    // UUID
  name: string;
  description: string;
  routes: Route[];               // Snapshot of routes
  timestamp: string;             // ISO timestamp
  tags: string[];
}
```

### Audit Log Entry

```typescript
interface AuditLogEntry {
  id: string;
  timestamp: string;
  event_type: EventType;
  actor: string;                 // User/system identifier
  payload: Record<string, any>;  // Event-specific data
  diff_summary: string;          // Human-readable summary
  validation_outcome: 'success' | 'warning' | 'error';
}

type EventType =
  | 'PATCH'
  | 'UNPATCH'
  | 'BATCH_PATCH'
  | 'LOCK_ROUTE'
  | 'UNLOCK_ROUTE'
  | 'SAVE_SCENE'
  | 'RECALL_SCENE'
  | 'ENDPOINT_LABEL_CHANGE'
  | 'ENDPOINT_TAG_CHANGE'
  | 'ENTER_SAFE_MODE'
  | 'APPLY_SAFE_CHANGES'
  | 'DISCARD_SAFE_CHANGES';
```

---

## 🎨 UI/UX Layout

### Main Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Top Bar                                                       │
│ [Search] [Filters] [Safe Patch] [Scenes ▼] [Undo/Redo]      │
├──────────┬──────────────────────────────────┬────────────────┤
│          │                                  │                │
│  Left    │     Main Routing Grid            │  Right Panel   │
│  Panel   │     (Virtualized)                │  (Inspector)   │
│          │                                  │                │
│  Inputs  │  T₁  T₂  T₃  T₄  T₅  T₆         │  Selected:     │
│  - MAP2  │ ┌──┬──┬──┬──┬──┬──┐            │  Talker T₂     │
│    T1    │L₁│  │●│  │  │  │  │            │  Name: [edit]  │
│    T2    │ ├──┼──┼──┼──┼──┼──┤            │  Channels: 2   │
│  - AVDECC│L₂│  │  │●│  │  │  │            │  Rate: 48kHz   │
│    T3    │ ├──┼──┼──┼──┼──┼──┤            │  Tags: [...]   │
│          │L₃│  │  │  │●│  │  │            │  Lock: [ ]     │
│  Filter: │ └──┴──┴──┴──┴──┴──┘            │                │
│  [All ▼] │                                  │  Connections:  │
│          │  Legend:                         │  → L₁ ✓       │
│  Bank:   │  ● = Connected                   │  → L₃ ✓       │
│  [1-32]  │  ○ = Connecting                  │                │
│          │                                  │  [Disconnect]  │
└──────────┴──────────────────────────────────┴────────────────┘
│ Bottom Panel (Collapsible)                                   │
│ History: [15:32] Connected T₂→L₁  [15:31] Scene recalled... │
└─────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
<AvbRoutingApp>
  <TopBar>
    <SearchControl />
    <FilterControls />
    <SafePatchToggle />
    <SceneManager />
    <UndoRedoButtons />
  </TopBar>

  <MainLayout>
    <LeftSidebar>
      <EndpointList direction="talker" />
      <BankingControls />
      <FilterPanel />
    </LeftSidebar>

    <RoutingGrid>
      <VirtualizedMatrix>
        {/* react-window FixedSizeGrid */}
        <MatrixCell />
      </VirtualizedMatrix>
    </RoutingGrid>

    <RightPanel>
      <InspectorPanel />
      <ConnectionDetails />
      <ValidationMessages />
    </RightPanel>
  </MainLayout>

  <BottomPanel collapsible>
    <HistoryTimeline />
    <AuditLog />
  </BottomPanel>

  <Dialogs>
    <SceneRecallDialog />
    <BatchPatchDialog />
    <ValidationWarningDialog />
  </Dialogs>
</AvbRoutingApp>
```

---

## ✨ Feature Requirements (10 Pro-Grade Features)

### 1. **Scenes / Salvos**

- **Save**: Capture current routing state with metadata
- **Recall**: Restore saved routing configuration
- **Diff Preview**: Show changes before applying (visual diff)
- **API Integration**: Store scenes in backend (future: database)

**UI Mockup:**
```
[Scenes ▼]
  ├─ Default Mix
  ├─ Studio Setup
  ├─ Live Performance ★
  └─ [+ New Scene...]

On Recall:
┌────────────────────────────────┐
│ Recall Scene: "Live Performance"│
│                                 │
│ Changes:                        │
│  + Connect T₁→L₁                │
│  + Connect T₂→L₃                │
│  - Disconnect T₃→L₂             │
│                                 │
│  [Cancel]  [Apply]              │
└────────────────────────────────┘
```

### 2. **Safe Patch Mode**

- **Toggle**: Enable staging mode (all changes pending)
- **Visual**: Highlight pending changes in grid (yellow border)
- **Actions**: Apply all / Discard all
- **State**: Separate `liveRoutes` vs `pendingRoutes`

**State Diagram:**
```
Normal Mode ───[Enable Safe Patch]──→ Safe Mode
                                       │
                                       │ User patches...
                                       ↓
                               Pending Changes
                                     ╱   ╲
                            [Apply]       [Discard]
                              ↓              ↓
                         Apply + Exit     Revert + Exit
```

### 3. **Destructive Patch Confirmation**

- **Trigger**: When patching would break existing connection
- **Dialog**: "Disconnect T₁→L₂ to connect T₃→L₂?"
- **Options**: Confirm / Cancel / Lock current route

**Example:**
```
┌────────────────────────────────┐
│ ⚠️  Confirm Destructive Patch   │
│                                 │
│ This action will disconnect:    │
│  • Talker "MAP2-Main" → L₂      │
│                                 │
│ To make room for:               │
│  • Talker "AVDECC-Mixer" → L₂   │
│                                 │
│ [ ] Lock existing route         │
│                                 │
│  [Cancel]  [Confirm]            │
└────────────────────────────────┘
```

### 4. **Route Locking & Protection**

- **Per-Route Lock**: Prevent accidental disconnection
- **Group Lock**: Lock all routes in a group (e.g., "Monitor Bus")
- **Visual**: Lock icon overlay on matrix cell

**Implementation:**
```typescript
interface RouteLock {
  route_id: string;
  locked: boolean;
  reason: string;      // "Critical monitor mix"
  locked_by: string;   // User
  locked_at: string;   // Timestamp
}
```

### 5. **Search / Filters / Pin Favorites**

- **Search**: Real-time filter by name/tag/type
- **Filters**:
  - Device type (MAP2/AVDECC)
  - Sample rate (48k/96k)
  - Channel count (stereo/mono)
  - Availability (online/offline)
- **Pinning**: Pin frequently-used endpoints to top

**Filter Panel:**
```
┌──────────────────┐
│ Filters          │
├──────────────────┤
│ Device Type:     │
│ ☑ MAP2           │
│ ☑ AVDECC         │
│ ☐ Unknown        │
│                  │
│ Sample Rate:     │
│ ☑ 48 kHz         │
│ ☐ 96 kHz         │
│                  │
│ Status:          │
│ ☑ Available      │
│ ☐ Offline        │
│                  │
│ [Reset Filters]  │
└──────────────────┘
```

### 6. **Endpoint Labels & Colors**

- **Rename**: User-friendly names (instead of entity IDs)
- **Tags**: Apply searchable tags ("Studio", "Live", "Monitor")
- **Colors**: Visual grouping via color coding

**Stored Locally:**
```typescript
// localStorage: avb_endpoint_metadata
{
  "001122fffe334455:0": {
    "label": "Studio Main L/R",
    "tags": ["studio", "main"],
    "color": "#FF5722",
    "group": "Studio Mix"
  }
}
```

### 7. **Channel Banking & Grouping**

- **Banking**: Paginate large matrices (32 endpoints per bank)
- **Grouping**: Collapsible groups (MAP2 nodes, AVDECC devices)

**Banking UI:**
```
Talkers: [◀ Bank 1-32 | 33-64 ▶]
Listeners: [◀ Bank 1-16 ▶]
```

### 8. **Validation / Constraint Engine**

- **Pre-Connection Checks**:
  - Sample rate mismatch warning
  - Channel count mismatch warning
  - SRP admission availability
  - Clock domain compatibility

**Validation Result:**
```typescript
interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  errors: ValidationError[];
}

interface ValidationWarning {
  code: 'SAMPLE_RATE_MISMATCH' | 'CHANNEL_MISMATCH';
  message: string;
  severity: 'warning' | 'error';
}
```

### 9. **Signal Status Indicators**

- **Endpoint Status**:
  - 🟢 Available & streaming
  - 🟡 Available but no signal
  - 🔴 Offline
- **Connection Status**:
  - Clock sync status (PTP)
  - SRP reservation state
  - Link up/down

**Matrix Cell with Status:**
```
┌──────┐
│  ●   │  ← Connected
│  🟢  │  ← Signal present
└──────┘
```

### 10. **Undo / Redo + History Panel**

- **Undo/Redo Stack**: Navigate routing changes
- **Keyboard Shortcuts**: `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`
- **History Timeline**: Chronological list with rollback

**History Panel:**
```
15:34:12 - Connected T₂→L₁ (Safe Patch Applied)
15:33:45 - Disconnected T₁→L₃
15:32:10 - Recalled Scene "Live Performance"
         ↑ [Rollback to here]
```

---

## 🧩 State Management Architecture

### Reducer-Based State Machine

```typescript
interface RoutingState {
  // Data
  endpoints: Record<string, Endpoint>;
  liveRoutes: Record<string, Route>;
  pendingRoutes: Record<string, Route>;  // Safe patch staging
  scenes: Record<string, Scene>;

  // UI State
  selection: {
    selectedEndpoints: string[];
    selectedRoutes: string[];
  };
  filters: FilterState;
  search: string;
  bank: { talkers: number; listeners: number };
  safePatchMode: boolean;

  // History
  history: HistoryState;
  auditLog: AuditLogEntry[];
}

interface FilterState {
  deviceTypes: ('map2' | 'avdecc')[];
  sampleRates: number[];
  availableOnly: boolean;
}

interface HistoryState {
  past: RoutingState[];
  future: RoutingState[];
}
```

### Action Types

```typescript
type RoutingAction =
  // Connection actions
  | { type: 'PATCH'; payload: { talker_id: string; listener_id: string } }
  | { type: 'UNPATCH'; payload: { route_id: string } }
  | { type: 'BATCH_PATCH'; payload: PatchOperation[] }

  // Locking
  | { type: 'LOCK_ROUTE'; payload: { route_id: string; reason: string } }
  | { type: 'UNLOCK_ROUTE'; payload: { route_id: string } }

  // Safe Patch
  | { type: 'ENTER_SAFE_MODE' }
  | { type: 'APPLY_SAFE_CHANGES' }
  | { type: 'DISCARD_SAFE_CHANGES' }

  // Scenes
  | { type: 'SAVE_SCENE'; payload: { name: string; description: string } }
  | { type: 'RECALL_SCENE'; payload: { scene_id: string } }

  // UI
  | { type: 'SET_FILTERS'; payload: Partial<FilterState> }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_BANK'; payload: { talkers?: number; listeners?: number } }
  | { type: 'SELECT_ENDPOINT'; payload: string }

  // History
  | { type: 'UNDO' }
  | { type: 'REDO' }

  // Data sync
  | { type: 'ENDPOINTS_UPDATED'; payload: Endpoint[] }
  | { type: 'CONNECTIONS_UPDATED'; payload: Route[] }
  | { type: 'STATUS_UPDATE'; payload: { endpoint_id: string; available: boolean } };
```

### Reducer Implementation

```typescript
function routingReducer(
  state: RoutingState,
  action: RoutingAction
): RoutingState {
  switch (action.type) {
    case 'PATCH': {
      const { talker_id, listener_id } = action.payload;
      const route_id = `${talker_id}→${listener_id}`;

      // Create pending route in safe mode
      if (state.safePatchMode) {
        return {
          ...state,
          pendingRoutes: {
            ...state.pendingRoutes,
            [route_id]: createRoute(talker_id, listener_id, 'connecting'),
          },
          auditLog: [
            ...state.auditLog,
            createAuditEntry('PATCH', action.payload, 'Staged connection'),
          ],
        };
      }

      // Direct patch in normal mode (call API)
      return state; // API call handled in side effect
    }

    case 'UNDO': {
      if (state.history.past.length === 0) return state;

      const previous = state.history.past[state.history.past.length - 1];
      const newPast = state.history.past.slice(0, -1);

      return {
        ...previous,
        history: {
          past: newPast,
          future: [state, ...state.history.future],
        },
      };
    }

    // ... other cases
  }
}
```

---

## 🎯 Virtualization Strategy (react-window)

### Grid Virtualization

Use `FixedSizeGrid` for optimal performance with large matrices:

```typescript
import { FixedSizeGrid } from 'react-window';

const RoutingGrid: React.FC = () => {
  const talkers = useFilteredTalkers();
  const listeners = useFilteredListeners();

  const Cell = ({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
    const talker = talkers[columnIndex];
    const listener = listeners[rowIndex];
    const route = useRoute(talker.endpoint_id, listener.endpoint_id);

    return (
      <div style={style}>
        <MatrixCell
          talker={talker}
          listener={listener}
          route={route}
          onClick={() => handlePatch(talker, listener)}
        />
      </div>
    );
  };

  return (
    <FixedSizeGrid
      columnCount={talkers.length}
      columnWidth={60}
      height={600}
      rowCount={listeners.length}
      rowHeight={40}
      width={800}
    >
      {Cell}
    </FixedSizeGrid>
  );
};
```

### Sticky Headers

Overlay sticky headers for talker/listener labels:

```tsx
<div style={{ position: 'relative' }}>
  {/* Sticky talker header */}
  <div style={{ position: 'sticky', top: 0, zIndex: 10 }}>
    {talkers.map(t => <TalkerHeader key={t.endpoint_id} {...t} />)}
  </div>

  {/* Sticky listener column */}
  <div style={{ position: 'absolute', left: 0, zIndex: 5 }}>
    {listeners.map(l => <ListenerHeader key={l.endpoint_id} {...l} />)}
  </div>

  {/* Virtualized grid */}
  <FixedSizeGrid ... />
</div>
```

### Performance Targets

- **Initial Render**: < 500ms for 100×100 matrix
- **Interaction**: < 16ms per frame (60 FPS)
- **Scroll**: Smooth at 100+ endpoints
- **Memory**: < 200MB for 1000 endpoints

---

## 📡 Real-Time Updates (WebSocket Integration)

### WebSocket Events

Subscribe to backend WebSocket for live updates:

```typescript
// Existing MAP2 WebSocket at ws://localhost:8080/ws
const wsEvents = {
  'avb.endpoint.discovered': (endpoint: Endpoint) => {
    dispatch({ type: 'ENDPOINTS_UPDATED', payload: [endpoint] });
  },

  'avb.endpoint.lost': (endpoint_id: string) => {
    dispatch({
      type: 'STATUS_UPDATE',
      payload: { endpoint_id, available: false },
    });
  },

  'avb.connection.established': (route: Route) => {
    dispatch({ type: 'CONNECTIONS_UPDATED', payload: [route] });
  },

  'avb.connection.failed': (route: Route) => {
    // Show error toast
    showError(`Connection failed: ${route.error_message}`);
  },
};
```

---

## 🧪 Implementation Checkpoints (for ChatGPT Codex)

### Phase 1: Foundation
- [ ] Setup routing module structure
- [ ] Define TypeScript interfaces (Endpoint, Route, Scene)
- [ ] Create routing reducer with basic actions
- [ ] Implement routing context provider

### Phase 2: Data Layer
- [ ] Create API client for AVB endpoints
- [ ] Implement react-query hooks (useEndpoints, useConnections)
- [ ] Add WebSocket integration for live updates
- [ ] Write validation engine

### Phase 3: Core UI
- [ ] Build virtualized routing grid (react-window)
- [ ] Implement matrix cell component
- [ ] Add sticky headers (talkers/listeners)
- [ ] Create endpoint list sidebar

### Phase 4: Interaction
- [ ] Click-to-patch functionality
- [ ] Drag-to-select for batch operations
- [ ] Keyboard navigation (arrow keys, tab)
- [ ] Copy/paste routing patterns

### Phase 5: Professional Features
- [ ] Safe patch mode (staging)
- [ ] Scene management (save/recall/diff)
- [ ] Route locking
- [ ] Destructive patch confirmation
- [ ] Undo/redo with history panel

### Phase 6: UX Polish
- [ ] Search and filtering
- [ ] Endpoint labels/colors/tags
- [ ] Banking/grouping
- [ ] Signal status indicators
- [ ] Validation warnings UI

### Phase 7: Testing & Docs
- [ ] Unit tests for reducer
- [ ] Integration tests for API client
- [ ] E2E tests for critical flows
- [ ] Component documentation
- [ ] User guide

---

## 📝 Code Comments Guidelines (for Codex)

All code must include:

1. **Architecture Comments**
```typescript
/**
 * Routing Matrix State Machine
 *
 * Architecture:
 * - Reducer manages all routing state (endpoints, routes, scenes)
 * - Safe patch mode stages changes in `pendingRoutes`
 * - History tracked via `past`/`future` stacks for undo/redo
 * - Audit log captures all user actions with timestamps
 *
 * State Flow:
 *   User Action → Reducer → State Update → API Call (side effect)
 *                                        ↓
 *                              WebSocket Update → State Sync
 */
```

2. **Feature Comments**
```typescript
/**
 * Safe Patch Mode
 *
 * When enabled:
 * 1. All patch/unpatch actions go to `pendingRoutes`
 * 2. Grid shows pending changes with visual indicators
 * 3. User can preview changes before applying
 * 4. Apply: merges pending → live, calls batch API
 * 5. Discard: clears pendingRoutes
 */
```

3. **Complex Logic**
```typescript
// Check if patch would break existing connection (destructive)
const isDestructivePatch = (talker_id: string, listener_id: string): boolean => {
  // A patch is destructive if the listener is already connected
  // to a different talker
  const existingRoute = Object.values(liveRoutes).find(
    r => r.listener_id === listener_id && r.talker_id !== talker_id
  );
  return existingRoute?.state === 'connected';
};
```

---

## 🚀 Deliverables

### 1. **Complete React Application**

File structure:
```
web/src/app/components/AvbRouting/
├── index.tsx                    # Main export
├── AvbRoutingApp.tsx            # Root component
├── context/
│   ├── RoutingContext.tsx       # Context + Provider
│   └── routingReducer.ts        # State machine
├── hooks/
│   ├── useAvbApi.ts             # API client
│   ├── useRoutingMatrix.ts      # Matrix state hook
│   └── useWebSocketSync.ts      # WS integration
├── components/
│   ├── RoutingGrid/
│   │   ├── VirtualizedMatrix.tsx
│   │   ├── MatrixCell.tsx
│   │   └── StickyHeaders.tsx
│   ├── TopBar/
│   │   ├── SearchControl.tsx
│   │   ├── FilterPanel.tsx
│   │   ├── SafePatchToggle.tsx
│   │   └── SceneManager.tsx
│   ├── Sidebar/
│   │   ├── EndpointList.tsx
│   │   └── BankingControls.tsx
│   ├── Inspector/
│   │   ├── InspectorPanel.tsx
│   │   └── ConnectionDetails.tsx
│   └── Dialogs/
│       ├── SceneRecallDialog.tsx
│       ├── DestructivePatchConfirm.tsx
│       └── BatchPatchDialog.tsx
└── utils/
    ├── validation.ts            # Constraint engine
    ├── auditLog.ts              # Audit utilities
    └── storage.ts               # LocalStorage wrapper
```

### 2. **Integration with MAP2 Routes**

Add route to `web/src/app/App.tsx`:
```tsx
<Route path="/avb-routing" element={<AvbRoutingApp />} />
```

### 3. **Documentation**

- Component API docs
- State machine documentation
- User guide with screenshots
- Integration guide for backend devs

---

## 🎓 Example Usage Scenarios

### Scenario 1: Basic Patch
```
1. User clicks cell (T₂, L₁)
2. Validation runs (sample rate OK)
3. API call: POST /api/avb/router/connect
4. State updates: route state = 'connecting'
5. WebSocket: connection established
6. State updates: route state = 'connected'
7. UI: cell shows ● (connected)
8. Audit log: "15:32 - Connected T₂→L₁"
```

### Scenario 2: Scene Recall
```
1. User: Scenes → "Live Performance"
2. UI: Show diff dialog
   - Changes: +3 new, -2 removed
3. User: Click "Apply"
4. Batch API calls (connect/disconnect)
5. Progress bar shows 60% complete...
6. All routes applied
7. Audit log: "Scene recalled: Live Performance"
```

### Scenario 3: Safe Patch Workflow
```
1. User: Enable Safe Patch
2. User: Patch T₁→L₁, T₂→L₃
3. UI: Yellow borders on pending cells
4. Inspector: "2 pending changes"
5. User: Click "Apply"
6. Batch API call
7. Exit safe mode
8. Audit log: "Safe Patch Applied (2 routes)"
```

---

## 🔧 Technical Notes

### Browser Compatibility
- Modern browsers (Chrome 120+, Firefox 120+, Safari 17+)
- WebSocket support required
- LocalStorage for user preferences

### Accessibility
- ARIA labels on all interactive elements
- Keyboard navigation: Tab, Arrow keys, Enter
- Screen reader support for matrix state
- High contrast mode support

### Security
- CORS headers for API calls
- WebSocket authentication (use MAP2's existing auth)
- XSS prevention via React sanitization

### Performance Monitoring
```typescript
// Track render performance
import { unstable_trace as trace } from 'react';

trace('RoutingGrid.render', performance.now(), () => {
  // Render logic
});
```

---

## 📋 Success Criteria

1. ✅ **Functional**: All 10 pro features implemented
2. ✅ **Performance**: 100×100 matrix renders < 500ms
3. ✅ **Reliable**: No crashes with 1000+ endpoints
4. ✅ **Auditable**: Full history of all routing changes
5. ✅ **Testable**: 80%+ code coverage
6. ✅ **Documented**: All components + state machine explained
7. ✅ **Accessible**: WCAG 2.1 AA compliance
8. ✅ **Integrated**: Works with MAP2 backend APIs

---

## 🎯 Future Enhancements (Phase 2)

- **Multi-user collaboration**: Real-time cursor positions
- **Remote control**: MIDI/OSC control surface
- **Analytics**: Connection uptime, failure rates
- **Advanced filtering**: Regex search, saved filters
- **Templates**: Pre-configured routing templates
- **Export/Import**: Routing configurations as JSON

---

**END OF SPECIFICATION**

This document provides the complete blueprint for implementing a professional AVB routing matrix UI for the MAP2 Audio Platform. All requirements are designed to integrate seamlessly with the existing FastAPI backend and React frontend architecture.

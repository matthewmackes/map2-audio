# AVB Routing Matrix - Complete Implementation Plan
## All 30 Amazing Features with Detailed Checkpoints

**Version:** 2.0 - Complete Feature Set
**Date:** February 16, 2026
**Status:** Ready for Implementation
**Target:** Industry-Leading Professional Routing Matrix

---

## 📋 Overview

This plan details the implementation of **all 30 enhancement features** to transform the AVB routing matrix from functional to industry-leading professional quality.

**Current State:** Phase 1 + 2 Complete (2,940 lines)
**Target State:** ~15,000 total lines with all features
**Estimated Timeline:** 8-10 weeks with systematic implementation

---

## 🏗️ Architecture Additions

### New Modules Required

```
web/src/app/components/AvbRouting/
├── hooks/
│   ├── useKeyboardNavigation.ts      (NEW)
│   ├── useDragSelection.ts           (NEW)
│   ├── useAudioMetering.ts           (NEW)
│   ├── useSceneDiff.ts               (NEW)
│   ├── useRoutingTemplates.ts        (NEW)
│   ├── useCollaboration.ts           (NEW)
│   └── useOfflineMode.ts             (NEW)
│
├── components/
│   ├── FlowView/                     (NEW)
│   │   ├── FlowViewCanvas.tsx
│   │   ├── FlowNode.tsx
│   │   └── FlowEdge.tsx
│   ├── SceneManager/                 (NEW)
│   │   ├── SceneList.tsx
│   │   ├── SceneDiffDialog.tsx
│   │   └── SceneEditor.tsx
│   ├── FilterPanel/                  (NEW)
│   │   ├── FilterPanel.tsx
│   │   └── FilterPresets.tsx
│   ├── AudioMetering/                (NEW)
│   │   ├── MeterBar.tsx
│   │   └── MeterOverlay.tsx
│   ├── ContextMenu/                  (NEW)
│   │   └── MatrixContextMenu.tsx
│   ├── Templates/                    (NEW)
│   │   └── RoutingTemplateDialog.tsx
│   ├── Analytics/                    (NEW)
│   │   ├── AnalyticsDashboard.tsx
│   │   └── UsageCharts.tsx
│   ├── Collaboration/                (NEW)
│   │   ├── UserCursors.tsx
│   │   └── UserPresence.tsx
│   └── Dialogs/                      (EXPAND)
│       ├── DestructivePatchDialog.tsx
│       ├── LockRouteDialog.tsx
│       ├── ExportDialog.tsx
│       └── ImportDialog.tsx
│
├── services/                         (NEW)
│   ├── meteringService.ts
│   ├── collaborationService.ts
│   ├── analyticsService.ts
│   └── midiOscService.ts
│
└── utils/                            (EXPAND)
    ├── validation.ts
    ├── templates.ts
    ├── export.ts
    └── offline.ts
```

---

## 🎯 Phase 3: Core UX Enhancements (Priority 0)

**Goal:** Make the UI feel fast, responsive, and professional
**Estimated Time:** 1 week
**Lines of Code:** ~650

### Feature 1: Keyboard Navigation

**Checkpoint 1.1: Create Keyboard Hook**
- [ ] Create `hooks/useKeyboardNavigation.ts`
- [ ] Define keyboard event handlers
- [ ] Implement selection state tracking
- [ ] Add navigation functions (move up/down/left/right)

**Code Template:**
```typescript
// hooks/useKeyboardNavigation.ts
export interface KeyboardSelection {
  row: number;
  col: number;
}

export function useKeyboardNavigation() {
  const [selection, setSelection] = useState<KeyboardSelection>({ row: 0, col: 0 });
  const { state, dispatch } = useRouting();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
          setSelection(prev => ({ ...prev, col: Math.min(prev.col + 1, maxCols - 1) }));
          break;
        case 'ArrowLeft':
          setSelection(prev => ({ ...prev, col: Math.max(prev.col - 1, 0) }));
          break;
        case 'ArrowDown':
          setSelection(prev => ({ ...prev, row: Math.min(prev.row + 1, maxRows - 1) }));
          break;
        case 'ArrowUp':
          setSelection(prev => ({ ...prev, row: Math.max(prev.row - 1, 0) }));
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          toggleConnection();
          break;
        case 'Escape':
          dispatch({ type: 'CLEAR_SELECTION' });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection]);

  return { selection, setSelection };
}
```

**Checkpoint 1.2: Integrate with Grid**
- [ ] Add keyboard focus indicator to MatrixCell
- [ ] Update RoutingGrid to use keyboard hook
- [ ] Add visual focus ring (blue border)
- [ ] Test navigation in all directions

**Checkpoint 1.3: Add Shortcuts**
- [ ] Ctrl+A: Select all in row
- [ ] Shift+Click: Select range
- [ ] Ctrl+F: Focus search
- [ ] Tab: Cycle through endpoints

**Testing Criteria:**
- ✅ Arrow keys navigate smoothly
- ✅ Enter toggles connection at focused cell
- ✅ Visual focus indicator visible
- ✅ Keyboard shortcuts work globally

---

### Feature 2: Connection Path Highlighting

**Checkpoint 2.1: Add Hover State Tracking**
- [ ] Extend routing state with `hoveredRow` and `hoveredCol`
- [ ] Add actions: `SET_HOVERED_ROW`, `SET_HOVERED_COL`
- [ ] Update reducer to handle hover state

**Checkpoint 2.2: Update MatrixCell**
- [ ] Add `isRowHighlighted` and `isColHighlighted` props
- [ ] Apply highlight styles (semi-transparent blue background)
- [ ] Dim non-highlighted cells (opacity: 0.6)

**Code Template:**
```typescript
// In MatrixCell.tsx
const isHighlighted = isRowHighlighted || isColHighlighted;
const isDimmed = state.selection.hoveredCell && !isHighlighted;

<Box
  sx={{
    opacity: isDimmed ? 0.6 : 1,
    bgcolor: isHighlighted ? 'rgba(33, 150, 243, 0.15)' : getBgColor(),
    transition: 'opacity 0.15s, background-color 0.15s',
  }}
>
```

**Checkpoint 2.3: Add Crosshair Effect**
- [ ] Render vertical line above hovered column
- [ ] Render horizontal line left of hovered row
- [ ] Use CSS overlays with pointer-events: none

**Testing Criteria:**
- ✅ Hovering cell highlights entire row + column
- ✅ Other cells dim slightly
- ✅ Crosshair lines visible
- ✅ Smooth animations

---

### Feature 3: Toast Notifications

**Checkpoint 3.1: Install Notistack**
```bash
npm install notistack
```

**Checkpoint 3.2: Wrap App with Provider**
```typescript
// In AvbRoutingApp.tsx
import { SnackbarProvider } from 'notistack';

<SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
  <RoutingProvider>
    {/* ... */}
  </RoutingProvider>
</SnackbarProvider>
```

**Checkpoint 3.3: Create Toast Hook**
```typescript
// hooks/useRoutingToasts.ts
export function useRoutingToasts() {
  const { enqueueSnackbar } = useSnackbar();

  const notifyConnected = (talker: string, listener: string) => {
    enqueueSnackbar(`Connected ${talker} → ${listener}`, {
      variant: 'success',
      autoHideDuration: 2000,
    });
  };

  const notifyError = (message: string) => {
    enqueueSnackbar(message, {
      variant: 'error',
      autoHideDuration: 5000,
    });
  };

  return { notifyConnected, notifyError, notifyWarning, notifyInfo };
}
```

**Checkpoint 3.4: Integrate with Actions**
- [ ] Call toast on successful patch
- [ ] Call toast on patch error
- [ ] Call toast on scene recall
- [ ] Call toast on safe patch apply

**Testing Criteria:**
- ✅ Success toasts appear on connection
- ✅ Error toasts appear on failure
- ✅ Toasts auto-dismiss
- ✅ Multiple toasts stack properly

---

## 🎯 Phase 4: Power User Features (Priority 1)

**Goal:** Drag-select, live metering, scene diff
**Estimated Time:** 2 weeks
**Lines of Code:** ~1,800

### Feature 4: Drag-to-Select

**Checkpoint 4.1: Create Selection Hook**
```typescript
// hooks/useDragSelection.ts
export function useDragSelection() {
  const [isDragging, setIsDragging] = useState(false);
  const [startCell, setStartCell] = useState<{ row: number; col: number } | null>(null);
  const [endCell, setEndCell] = useState<{ row: number; col: number } | null>(null);

  const handleMouseDown = (row: number, col: number) => {
    setIsDragging(true);
    setStartCell({ row, col });
    setEndCell({ row, col });
  };

  const handleMouseMove = (row: number, col: number) => {
    if (isDragging) {
      setEndCell({ row, col });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    // Calculate selected cells
    const selectedCells = getSelectedCells(startCell, endCell);
    return selectedCells;
  };

  return { isDragging, handleMouseDown, handleMouseMove, handleMouseUp };
}
```

**Checkpoint 4.2: Add Selection Overlay**
- [ ] Create `SelectionOverlay.tsx` component
- [ ] Calculate overlay position/size from start/end cells
- [ ] Render semi-transparent blue rectangle
- [ ] Position using absolute positioning

**Checkpoint 4.3: Multi-Select Actions**
- [ ] Add state for selected cells array
- [ ] Implement Shift+Click for range selection
- [ ] Implement Ctrl+Click for multi-select
- [ ] Update MatrixCell to show selected state

**Checkpoint 4.4: Batch Operations**
- [ ] Add "Connect All Selected" button
- [ ] Add "Disconnect All Selected" button
- [ ] Add "Lock All Selected" button
- [ ] Confirm dialog before batch actions

**Testing Criteria:**
- ✅ Click + drag selects rectangular area
- ✅ Shift+Click selects range
- ✅ Ctrl+Click adds to selection
- ✅ Batch operations work on selected cells

---

### Feature 5: Live Audio Metering

**Checkpoint 5.1: Backend WebSocket Metering**
- [ ] Add backend endpoint: `ws://localhost:8080/ws/metering`
- [ ] Stream meter data every 33ms (30fps)
- [ ] Format: `{ route_id: string, peak_db: number, rms_db: number }`

**Checkpoint 5.2: Create Metering Service**
```typescript
// services/meteringService.ts
export class MeteringService {
  private ws: WebSocket | null = null;
  private meterData: Map<string, MeterData> = new Map();
  private listeners: Set<(data: Map<string, MeterData>) => void> = new Set();

  connect() {
    this.ws = new WebSocket('ws://localhost:8080/ws/metering');
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.meterData.set(data.route_id, {
        peak_db: data.peak_db,
        rms_db: data.rms_db,
        timestamp: Date.now(),
      });
      this.notifyListeners();
    };
  }

  subscribe(callback: (data: Map<string, MeterData>) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.meterData));
  }
}
```

**Checkpoint 5.3: Create Meter Bar Component**
```typescript
// components/AudioMetering/MeterBar.tsx
export function MeterBar({ peakDb, rmsDb }: { peakDb: number; rmsDb: number }) {
  const peakPercent = dbToPercent(peakDb);
  const rmsPercent = dbToPercent(rmsDb);
  const isClipping = peakDb > -0.5;

  return (
    <Box sx={{ width: 4, height: 30, position: 'relative', bgcolor: '#333' }}>
      {/* RMS bar */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          width: '100%',
          height: `${rmsPercent}%`,
          bgcolor: '#4caf50',
          transition: 'height 0.05s',
        }}
      />
      {/* Peak indicator */}
      <Box
        sx={{
          position: 'absolute',
          bottom: `${peakPercent}%`,
          width: '100%',
          height: 2,
          bgcolor: isClipping ? '#f44336' : '#ffd43b',
        }}
      />
    </Box>
  );
}
```

**Checkpoint 5.4: Integrate with MatrixCell**
- [ ] Add metering hook to RoutingGrid
- [ ] Pass meter data to MatrixCell
- [ ] Render MeterBar for connected cells
- [ ] Add clip flash animation

**Checkpoint 5.5: Performance Optimization**
- [ ] Throttle updates to 30fps
- [ ] Only update visible cells
- [ ] Use requestAnimationFrame for smooth rendering

**Testing Criteria:**
- ✅ Meters update in real-time
- ✅ VU bars reflect audio level
- ✅ Clip indicator flashes on peak
- ✅ No performance degradation

---

### Feature 6: Scene Management with Diff

**Checkpoint 6.1: Create Scene Diff Hook**
```typescript
// hooks/useSceneDiff.ts
export function useSceneDiff(sceneId: string) {
  const { state } = useRouting();
  const scene = state.scenes[sceneId];

  const diff = useMemo(() => {
    if (!scene) return null;

    const current = Object.keys(state.liveRoutes);
    const target = scene.routes.map(r => r.id);

    const toAdd = target.filter(id => !current.includes(id));
    const toRemove = current.filter(id => !target.includes(id));
    const unchanged = current.filter(id => target.includes(id));

    return {
      toAdd: toAdd.map(id => scene.routes.find(r => r.id === id)!),
      toRemove: toRemove.map(id => state.liveRoutes[id]),
      unchanged,
      totalChanges: toAdd.length + toRemove.length,
    };
  }, [scene, state.liveRoutes]);

  return diff;
}
```

**Checkpoint 6.2: Create Scene Diff Dialog**
```typescript
// components/SceneManager/SceneDiffDialog.tsx
export function SceneDiffDialog({ sceneId, onApply, onCancel }: Props) {
  const diff = useSceneDiff(sceneId);
  const [selectedChanges, setSelectedChanges] = useState({
    applyConnections: true,
    applyLocks: false,
    applyMetadata: false,
  });

  return (
    <Dialog open maxWidth="md">
      <DialogTitle>Recall Scene: {scene.name}</DialogTitle>
      <DialogContent>
        <Typography variant="subtitle2">Changes:</Typography>
        <Box sx={{ display: 'flex', gap: 2, my: 2 }}>
          <Chip label={`+${diff.toAdd.length} new`} color="success" />
          <Chip label={`-${diff.toRemove.length} removed`} color="error" />
          <Chip label={`${diff.unchanged.length} unchanged`} variant="outlined" />
        </Box>

        <Typography variant="subtitle2">Details:</Typography>
        <List dense>
          {diff.toAdd.map(route => (
            <ListItem key={route.id}>
              <ListItemIcon><AddIcon color="success" /></ListItemIcon>
              <ListItemText primary={route.id} secondary="New connection" />
            </ListItem>
          ))}
          {diff.toRemove.map(route => (
            <ListItem key={route.id}>
              <ListItemIcon><RemoveIcon color="error" /></ListItemIcon>
              <ListItemText primary={route.id} secondary="Will be removed" />
            </ListItem>
          ))}
        </List>

        <FormGroup>
          <FormControlLabel
            control={<Checkbox checked={selectedChanges.applyConnections} />}
            label="Apply connection changes"
          />
          <FormControlLabel
            control={<Checkbox checked={selectedChanges.applyLocks} />}
            label="Apply lock states"
          />
        </FormGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onApply(selectedChanges)} variant="contained">
          Apply Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

**Checkpoint 6.3: Implement Scene Actions**
- [ ] Create scene save dialog
- [ ] Create scene list component
- [ ] Add scene recall with diff preview
- [ ] Add scene delete confirmation
- [ ] Add scene export/import

**Testing Criteria:**
- ✅ Diff accurately shows changes
- ✅ Partial recall works (selective apply)
- ✅ Scene list shows all saved scenes
- ✅ Export/import preserves scenes

---

### Feature 7: Right-Click Context Menu

**Checkpoint 7.1: Create Context Menu Component**
```typescript
// components/ContextMenu/MatrixContextMenu.tsx
export function MatrixContextMenu({ anchorPosition, onClose, cell }: Props) {
  const route = useRoute(cell.talker_id, cell.listener_id);
  const isConnected = route?.state === 'connected';

  return (
    <Menu
      open={Boolean(anchorPosition)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition}
    >
      <MenuItem onClick={() => handleConnect()}>
        <ListItemIcon><LinkIcon /></ListItemIcon>
        <ListItemText>Connect</ListItemText>
      </MenuItem>

      {isConnected && (
        <MenuItem onClick={() => handleDisconnect()}>
          <ListItemIcon><LinkOffIcon /></ListItemIcon>
          <ListItemText>Disconnect</ListItemText>
        </MenuItem>
      )}

      <Divider />

      <MenuItem onClick={() => handleLock()}>
        <ListItemIcon><LockIcon /></ListItemIcon>
        <ListItemText>Lock Route</ListItemText>
      </MenuItem>

      <MenuItem onClick={() => handleShowDetails()}>
        <ListItemIcon><InfoIcon /></ListItemIcon>
        <ListItemText>Show Details</ListItemText>
      </MenuItem>

      <Divider />

      <MenuItem onClick={() => handleCopyEndpointId()}>
        <ListItemIcon><ContentCopyIcon /></ListItemIcon>
        <ListItemText>Copy Endpoint ID</ListItemText>
      </MenuItem>
    </Menu>
  );
}
```

**Checkpoint 7.2: Integrate with MatrixCell**
- [ ] Add onContextMenu handler to MatrixCell
- [ ] Track right-click position
- [ ] Show context menu at cursor
- [ ] Close menu after action

**Testing Criteria:**
- ✅ Right-click shows context menu
- ✅ Menu items work correctly
- ✅ Menu closes after selection
- ✅ Menu positioned at cursor

---

## 🎯 Phase 5: Advanced Workflows (Priority 1)

**Goal:** Templates, copy/paste, flow view
**Estimated Time:** 2 weeks
**Lines of Code:** ~1,600

### Feature 8: Signal Flow Visualization

**Checkpoint 8.1: Install ReactFlow**
```bash
npm install reactflow
```

**Checkpoint 8.2: Create Flow View Component**
```typescript
// components/FlowView/FlowViewCanvas.tsx
import ReactFlow, { Node, Edge, Background, Controls } from 'reactflow';

export function FlowViewCanvas() {
  const { state } = useRouting();
  const talkers = useFilteredEndpoints('talker');
  const listeners = useFilteredEndpoints('listener');

  const nodes: Node[] = [
    ...talkers.map((t, i) => ({
      id: t.endpoint_id,
      type: 'talker',
      position: { x: 100, y: i * 100 },
      data: { endpoint: t },
    })),
    ...listeners.map((l, i) => ({
      id: l.endpoint_id,
      type: 'listener',
      position: { x: 600, y: i * 100 },
      data: { endpoint: l },
    })),
  ];

  const edges: Edge[] = Object.values(state.liveRoutes)
    .filter(r => r.state === 'connected')
    .map(r => ({
      id: r.id,
      source: r.talker_id,
      target: r.listener_id,
      animated: r.state === 'connecting',
      style: { stroke: getConnectionColor(r.state), strokeWidth: 2 },
    }));

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onConnect={handleConnect}
      onEdgeClick={handleDisconnect}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
```

**Checkpoint 8.3: Create Custom Node Components**
- [ ] Create TalkerNode component (left side)
- [ ] Create ListenerNode component (right side)
- [ ] Add device icons and status indicators
- [ ] Add drag handles for repositioning

**Checkpoint 8.4: Add View Toggle**
- [ ] Add "Grid View" / "Flow View" toggle in TopBar
- [ ] Persist view preference in localStorage
- [ ] Smooth transition between views

**Testing Criteria:**
- ✅ Flow view shows all endpoints as nodes
- ✅ Connections shown as edges
- ✅ Click edge to disconnect
- ✅ Drag nodes to rearrange

---

### Feature 9: Smart Routing Templates

**Checkpoint 9.1: Create Template Definitions**
```typescript
// utils/templates.ts
export interface RoutingTemplate {
  id: string;
  name: string;
  description: string;
  apply: (talkers: Endpoint[], listeners: Endpoint[]) => PatchOperation[];
}

export const templates: RoutingTemplate[] = [
  {
    id: '1-to-1',
    name: '1-to-1 Mapping',
    description: 'Connect T1→L1, T2→L2, T3→L3, etc.',
    apply: (talkers, listeners) => {
      const ops: PatchOperation[] = [];
      const count = Math.min(talkers.length, listeners.length);
      for (let i = 0; i < count; i++) {
        ops.push({
          talker_id: talkers[i].endpoint_id,
          listener_id: listeners[i].endpoint_id,
          action: 'connect',
        });
      }
      return ops;
    },
  },
  {
    id: '1-to-many',
    name: '1-to-Many (Split)',
    description: 'Connect one talker to all listeners',
    apply: (talkers, listeners) => {
      if (talkers.length === 0) return [];
      const talker = talkers[0];
      return listeners.map(l => ({
        talker_id: talker.endpoint_id,
        listener_id: l.endpoint_id,
        action: 'connect' as const,
      }));
    },
  },
  // Add more templates...
];
```

**Checkpoint 9.2: Create Template Dialog**
- [ ] Create RoutingTemplateDialog component
- [ ] List all available templates
- [ ] Preview operations before applying
- [ ] Add custom pattern input (regex)

**Checkpoint 9.3: Integrate with UI**
- [ ] Add "Templates" button in TopBar
- [ ] Apply template with confirmation
- [ ] Show progress for batch operations

**Testing Criteria:**
- ✅ All templates work correctly
- ✅ Preview shows accurate operations
- ✅ Custom patterns supported
- ✅ Batch apply with progress

---

### Feature 10: Copy/Paste Routing Patterns

**Checkpoint 10.1: Implement Copy**
```typescript
// Add to keyboard navigation hook
const handleCopy = () => {
  const selected = getSelectedCells();
  const routes = selected
    .map(cell => state.liveRoutes[`${cell.talker_id}→${cell.listener_id}`])
    .filter(Boolean);

  const pattern = {
    type: 'routing-pattern',
    routes: routes.map(r => ({
      talker_offset: getTalkerIndex(r.talker_id),
      listener_offset: getListenerIndex(r.listener_id),
    })),
  };

  navigator.clipboard.writeText(JSON.stringify(pattern));
  notifyInfo('Copied routing pattern');
};
```

**Checkpoint 10.2: Implement Paste**
```typescript
const handlePaste = async () => {
  const text = await navigator.clipboard.readText();
  try {
    const pattern = JSON.parse(text);
    if (pattern.type !== 'routing-pattern') return;

    const targetRow = selection.row;
    const operations = pattern.routes.map(r => ({
      talker_id: getTalkerAtIndex(r.talker_offset),
      listener_id: getListenerAtIndex(targetRow + r.listener_offset),
      action: 'connect' as const,
    }));

    // Show confirmation
    const confirmed = await confirmPaste(operations.length);
    if (confirmed) {
      batchPatchMutation.mutate(operations);
    }
  } catch (e) {
    notifyError('Invalid routing pattern');
  }
};
```

**Checkpoint 10.3: Add Visual Feedback**
- [ ] Show "Copied" indicator
- [ ] Preview paste target with overlay
- [ ] Confirmation dialog with details

**Testing Criteria:**
- ✅ Ctrl+C copies selected routes
- ✅ Ctrl+V pastes at target
- ✅ Pattern scales to target size
- ✅ Confirmation shows before apply

---

## 🎯 Phase 6: Visual Polish (Priority 2)

**Goal:** Animations, themes, minimap, filters
**Estimated Time:** 1.5 weeks
**Lines of Code:** ~1,200

### Feature 11: Smooth Animations

**Checkpoint 11.1: Install Framer Motion**
```bash
npm install framer-motion
```

**Checkpoint 11.2: Animate MatrixCell**
```typescript
import { motion } from 'framer-motion';

export function MatrixCell(props) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      {/* Cell content */}
    </motion.div>
  );
}
```

**Checkpoint 11.3: Add State Transitions**
- [ ] Fade animation on connection state change
- [ ] Pulse animation for connecting state
- [ ] Shake animation on error
- [ ] Slide-in for new endpoints

**Checkpoint 11.4: Performance Check**
- [ ] Ensure animations don't block interactions
- [ ] Test with 100+ endpoints
- [ ] Optimize with will-change CSS

**Testing Criteria:**
- ✅ Smooth hover effects
- ✅ State transitions visible
- ✅ No jank or lag
- ✅ Works on large grids

---

### Feature 12: Advanced Filtering

**Checkpoint 12.1: Create Filter Panel**
```typescript
// components/FilterPanel/FilterPanel.tsx
export function FilterPanel() {
  const { state, dispatch } = useRouting();

  return (
    <Paper sx={{ p: 2, width: 250 }}>
      <Typography variant="h6">Filters</Typography>

      <FormGroup>
        <FormLabel>Device Type</FormLabel>
        <FormControlLabel
          control={<Checkbox checked={state.filters.deviceTypes.includes('map2')} />}
          label="MAP2"
          onChange={(e) => toggleFilter('deviceTypes', 'map2')}
        />
        <FormControlLabel
          control={<Checkbox checked={state.filters.deviceTypes.includes('avdecc')} />}
          label="AVDECC"
        />
      </FormGroup>

      <Divider sx={{ my: 2 }} />

      <FormGroup>
        <FormLabel>Sample Rate</FormLabel>
        {[48000, 96000].map(rate => (
          <FormControlLabel
            key={rate}
            control={<Checkbox />}
            label={`${rate / 1000}kHz`}
          />
        ))}
      </FormGroup>

      {/* More filter sections... */}
    </Paper>
  );
}
```

**Checkpoint 12.2: Add Filter Presets**
- [ ] Create preset save dialog
- [ ] Load/save presets to localStorage
- [ ] "Studio Only", "Live Inputs" presets
- [ ] Quick preset buttons

**Checkpoint 12.3: Regex Search**
- [ ] Add regex toggle in search box
- [ ] Validate regex input
- [ ] Show match count

**Testing Criteria:**
- ✅ All filters work independently
- ✅ Filters combine correctly (AND logic)
- ✅ Presets save/load
- ✅ Regex search works

---

### Feature 13: Minimap

**Checkpoint 13.1: Create Minimap Component**
```typescript
// components/Minimap/Minimap.tsx
export function Minimap() {
  const { state } = useRouting();
  const talkers = useFilteredEndpoints('talker');
  const listeners = useFilteredEndpoints('listener');

  const MINIMAP_SCALE = 10; // 1 pixel per cell
  const width = talkers.length * MINIMAP_SCALE;
  const height = listeners.length * MINIMAP_SCALE;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width,
        height,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: 2,
      }}
    >
      <canvas ref={canvasRef} width={width} height={height} />
    </Box>
  );
}
```

**Checkpoint 13.2: Render Connections**
- [ ] Draw green pixel for each connection
- [ ] Draw red rectangle for viewport
- [ ] Click to jump to area

**Testing Criteria:**
- ✅ Minimap shows full matrix
- ✅ Connections visible as dots
- ✅ Viewport indicator updates
- ✅ Click navigates to area

---

## 🎯 Phase 7: Professional Features (Priority 2)

**Goal:** Groups, colors, metadata, dialogs
**Estimated Time:** 1.5 weeks
**Lines of Code:** ~1,100

### Feature 14: Endpoint Groups & Colors

**Checkpoint 14.1: Add Group Management**
- [ ] Create group creation dialog
- [ ] Assign endpoints to groups
- [ ] Collapsible group headers
- [ ] Drag-drop to reorder

**Checkpoint 14.2: Color Picker**
- [ ] Add color picker component
- [ ] Apply colors to endpoints
- [ ] Use colors in headers and cells

**Checkpoint 14.3: Storage**
- [ ] Save groups to localStorage
- [ ] Sync with endpoint metadata

**Testing Criteria:**
- ✅ Groups collapse/expand
- ✅ Colors apply correctly
- ✅ Persists across sessions

---

### Feature 15-20: Dialogs

**Checkpoint 15.1: Destructive Patch Dialog**
- [ ] Detect conflicting patches
- [ ] Show warning before disconnect
- [ ] Option to lock current route

**Checkpoint 15.2: Lock Route Dialog**
- [ ] Reason input field
- [ ] Show who locked and when
- [ ] Admin unlock option

**Checkpoint 15.3-5: Export/Import/Audit**
- [ ] Export to JSON/CSV/Excel
- [ ] Import with validation
- [ ] Audit log viewer table

---

## 🎯 Phase 8: Real-Time & Collaboration (Priority 3)

**Goal:** WebSocket, offline mode, multi-user
**Estimated Time:** 2 weeks
**Lines of Code:** ~2,000

### Feature 21: WebSocket Real-Time Updates

**Checkpoint 21.1: Create WebSocket Service**
```typescript
// services/websocketService.ts
export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  connect(onMessage: (data: any) => void) {
    this.ws = new WebSocket('ws://localhost:8080/ws');

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.clearReconnectTimer();
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => this.connect(), 3000);
  }
}
```

**Checkpoint 21.2: Integrate with Context**
- [ ] Use WebSocket in RoutingProvider
- [ ] Dispatch events on messages
- [ ] Handle endpoint discovery events
- [ ] Handle connection state changes

---

### Feature 22: Multi-User Collaboration

**Checkpoint 22.1: User Presence**
```typescript
// Backend WebSocket message format
{
  type: 'user-cursor',
  user_id: 'john',
  position: { row: 5, col: 3 }
}

// Frontend component
export function UserCursors() {
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(new Map());

  useWebSocket((data) => {
    if (data.type === 'user-cursor') {
      setCursors(prev => new Map(prev).set(data.user_id, data.position));
    }
  });

  return (
    <>
      {Array.from(cursors.entries()).map(([userId, pos]) => (
        <CursorIndicator key={userId} name={userId} position={pos} />
      ))}
    </>
  );
}
```

**Checkpoint 22.2: Lock Conflicts**
- [ ] Show who has cell selected
- [ ] Prevent simultaneous edits
- [ ] Conflict resolution dialog

---

## 🎯 Phase 9: Integration & Control (Priority 3)

**Goal:** MIDI/OSC, MAP2 integration, analytics
**Estimated Time:** 1.5 weeks
**Lines of Code:** ~1,400

### Feature 23: MIDI/OSC Control

**Checkpoint 23.1: MIDI Mapping**
```typescript
// services/midiOscService.ts
export class MidiService {
  private midiAccess: MIDIAccess | null = null;

  async init() {
    this.midiAccess = await navigator.requestMIDIAccess();

    this.midiAccess.inputs.forEach(input => {
      input.onmidimessage = (event) => {
        const [command, note, velocity] = event.data;

        // Map to routing actions
        if (command === 144 && velocity > 0) { // Note On
          this.handleNoteOn(note);
        }
      };
    });
  }

  private handleNoteOn(note: number) {
    // Map MIDI note to grid position
    const row = Math.floor(note / 12);
    const col = note % 12;
    dispatch({ type: 'PATCH', payload: { /* ... */ } });
  }
}
```

**Checkpoint 23.2: OSC Support**
- [ ] WebSocket-to-OSC bridge (backend)
- [ ] OSC message format definition
- [ ] TouchOSC template creation

---

### Feature 24: MAP2 Integration

**Checkpoint 24.1: Shared State**
- [ ] Connect AVB routing to plugin chain
- [ ] Show AVB streams in pedalboard
- [ ] Unified navigation

**Checkpoint 24.2: Combined Presets**
- [ ] Save routing + effects as preset
- [ ] Recall both simultaneously

---

## 🎯 Phase 10: Analytics & Health (Priority 3)

**Goal:** Dashboard, monitoring, testing
**Estimated Time:** 1 week
**Lines of Code:** ~1,200

### Feature 25: Analytics Dashboard

**Checkpoint 25.1: Data Collection**
```typescript
// Track usage metrics
interface AnalyticsEvent {
  timestamp: number;
  event: 'connection' | 'disconnection' | 'scene_recall';
  route_id?: string;
  user_id: string;
}

export function useAnalytics() {
  const trackConnection = (routeId: string) => {
    const event: AnalyticsEvent = {
      timestamp: Date.now(),
      event: 'connection',
      route_id: routeId,
      user_id: 'current_user',
    };
    // Store in IndexedDB
    storeEvent(event);
  };

  return { trackConnection, trackDisconnection, trackSceneRecall };
}
```

**Checkpoint 25.2: Visualization**
- [ ] Chart.js/Recharts integration
- [ ] Uptime chart per route
- [ ] Heatmap of most-used connections
- [ ] Error rate over time

---

### Feature 26-30: Testing & Polish

**Checkpoint 26.1: Unit Tests**
- [ ] Reducer tests (all actions)
- [ ] Validation tests
- [ ] Template tests

**Checkpoint 26.2: Integration Tests**
- [ ] API hook tests (mocked backend)
- [ ] Component render tests
- [ ] User flow tests

**Checkpoint 26.3: E2E Tests**
- [ ] Playwright setup
- [ ] Critical path tests
- [ ] Performance benchmarks

**Checkpoint 26.4: Accessibility Audit**
- [ ] ARIA labels on all interactive elements
- [ ] Keyboard navigation complete
- [ ] Screen reader testing
- [ ] Color contrast check

**Checkpoint 26.5: Documentation**
- [ ] User guide with screenshots
- [ ] API documentation
- [ ] Keyboard shortcuts reference
- [ ] Troubleshooting guide

---

## 📊 Summary Statistics

| Phase | Features | Lines | Time | Priority |
|-------|----------|-------|------|----------|
| 1-2 | Foundation + Core UI | 2,940 | ✅ Done | - |
| 3 | Core UX | 3 | 650 | 1 week | P0 |
| 4 | Power User | 4 | 1,800 | 2 weeks | P1 |
| 5 | Advanced | 3 | 1,600 | 2 weeks | P1 |
| 6 | Visual | 3 | 1,200 | 1.5 weeks | P2 |
| 7 | Professional | 6 | 1,100 | 1.5 weeks | P2 |
| 8 | Real-Time | 2 | 2,000 | 2 weeks | P3 |
| 9 | Integration | 2 | 1,400 | 1.5 weeks | P3 |
| 10 | Analytics | 7 | 1,200 | 1 week | P3 |
| **TOTAL** | **30** | **~13,890** | **~13 weeks** | - |

**Grand Total with Phase 1-2:** ~16,830 lines of TypeScript

---

## 🎯 Recommended Implementation Order

### Week 1-2: Quick Wins (Phase 3)
**Goal:** Make it feel amazing immediately
- Keyboard navigation
- Connection highlighting
- Toast notifications

**Result:** Users immediately notice the quality

---

### Week 3-6: Power Features (Phase 4-5)
**Goal:** Add killer features
- Drag-to-select
- Live audio metering
- Scene diff
- Flow view
- Templates

**Result:** Competitive with pro tools

---

### Week 7-10: Polish (Phase 6-7)
**Goal:** Production ready
- Animations
- Filters
- Groups/colors
- All dialogs
- Analytics

**Result:** Polished, professional

---

### Week 11-13: Advanced (Phase 8-10)
**Goal:** Industry leading
- Multi-user collaboration
- MIDI/OSC
- MAP2 integration
- Full testing
- Documentation

**Result:** Best-in-class routing matrix

---

## 🚀 Ready to Build

This plan provides:
- ✅ 30 complete features
- ✅ 120+ detailed checkpoints
- ✅ Code templates for complex features
- ✅ Testing criteria for each feature
- ✅ Clear implementation sequence
- ✅ Estimated timeline and effort

**All checkpoints are designed to be completed by another AI (ChatGPT Codex, etc.) with these instructions.**

---

**Next Step:** Start with Phase 3 (Core UX) or pick any specific feature!

Which phase would you like to begin? 🎯

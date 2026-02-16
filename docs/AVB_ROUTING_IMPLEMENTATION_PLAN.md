# AVB Routing Matrix - Implementation Plan

**Version:** 1.0
**Date:** February 16, 2026
**Project:** MAP2 Audio Platform
**Status:** Ready for Implementation

---

## 📋 Executive Summary

This document provides a **step-by-step implementation plan** for building the AVB Routing Matrix UI specified in [`AVB_ROUTING_UI_SPECIFICATION.md`](./AVB_ROUTING_UI_SPECIFICATION.md).

The implementation is divided into **7 phases**, each with clear deliverables, dependencies, and quality gates. Total estimated effort: **3-4 weeks** for a single developer, or **10-14 days** with parallel work.

---

## 🏗️ Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (React App)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐      ┌──────────────────┐           │
│  │ Routing UI       │      │ WebSocket Client │           │
│  │ (React)          │◄─────┤ (Real-time sync) │           │
│  └─────┬────────────┘      └────────┬─────────┘           │
│        │                              │                     │
│        ▼                              ▼                     │
│  ┌─────────────────────────────────────────────┐           │
│  │   Routing State Machine (Reducer)           │           │
│  │   - endpoints, routes, scenes               │           │
│  │   - UI state (filters, selection)           │           │
│  │   - Audit log, undo/redo history            │           │
│  └─────────────────┬───────────────────────────┘           │
│                    │                                        │
│                    ▼                                        │
│  ┌─────────────────────────────────────────────┐           │
│  │   API Client (react-query)                  │           │
│  │   - Fetch endpoints, connections            │           │
│  │   - Patch/unpatch operations                │           │
│  │   - Scene management                        │           │
│  └─────────────────┬───────────────────────────┘           │
│                    │                                        │
└────────────────────┼────────────────────────────────────────┘
                     │ HTTP + WebSocket
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                FastAPI Backend (Python)                     │
├─────────────────────────────────────────────────────────────┤
│  /api/avb/router/endpoints                                  │
│  /api/avb/router/connections                                │
│  /api/avb/router/matrix                                     │
│  /api/avb/router/connect    (POST)                          │
│  /api/avb/router/disconnect (POST)                          │
│  /api/avb/router/stats                                      │
│  /ws                        (WebSocket)                     │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           AVB Router (Python Service)                       │
│  - Endpoint discovery (MAP2 + AVDECC)                       │
│  - Stream connection management                             │
│  - SRP admission control                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📐 Module Structure

```
web/src/app/components/AvbRouting/
├── index.tsx                           # Main export
├── AvbRoutingApp.tsx                   # Root component
│
├── context/
│   ├── RoutingContext.tsx              # Context provider + hooks
│   ├── routingReducer.ts               # State machine
│   └── routingActions.ts               # Action creators
│
├── hooks/
│   ├── useAvbApi.ts                    # react-query API hooks
│   ├── useRoutingMatrix.ts             # Derived matrix state
│   ├── useWebSocketSync.ts             # WebSocket integration
│   ├── useRoutingValidation.ts         # Validation logic
│   ├── useUndoRedo.ts                  # History management
│   └── useSafePatch.ts                 # Safe patch mode
│
├── components/
│   ├── RoutingGrid/
│   │   ├── VirtualizedMatrix.tsx       # react-window grid
│   │   ├── MatrixCell.tsx              # Single cell component
│   │   ├── StickyHeaders.tsx           # Talker/listener labels
│   │   └── ConnectionIndicator.tsx     # Status icons
│   │
│   ├── TopBar/
│   │   ├── TopBar.tsx                  # Main toolbar
│   │   ├── SearchControl.tsx           # Search input
│   │   ├── FilterPanel.tsx             # Filter controls
│   │   ├── SafePatchToggle.tsx         # Safe mode button
│   │   ├── SceneManager.tsx            # Scene dropdown
│   │   └── UndoRedoButtons.tsx         # History controls
│   │
│   ├── Sidebar/
│   │   ├── EndpointList.tsx            # Talker/listener list
│   │   ├── EndpointItem.tsx            # Single endpoint
│   │   ├── BankingControls.tsx         # Pagination
│   │   └── GroupHeader.tsx             # Collapsible groups
│   │
│   ├── Inspector/
│   │   ├── InspectorPanel.tsx          # Right panel
│   │   ├── EndpointDetails.tsx         # Selected endpoint info
│   │   ├── ConnectionDetails.tsx       # Active connections
│   │   └── ValidationMessages.tsx      # Warnings/errors
│   │
│   ├── BottomPanel/
│   │   ├── HistoryTimeline.tsx         # Chronological actions
│   │   └── AuditLog.tsx                # Detailed log table
│   │
│   └── Dialogs/
│       ├── SceneRecallDialog.tsx       # Scene diff + recall
│       ├── SceneSaveDialog.tsx         # Save scene form
│       ├── DestructivePatchDialog.tsx  # Confirm overwrite
│       ├── BatchPatchDialog.tsx        # Multi-select patch
│       └── LockRouteDialog.tsx         # Lock route with reason
│
├── utils/
│   ├── validation.ts                   # Constraint checks
│   ├── auditLog.ts                     # Audit entry creation
│   ├── storage.ts                      # LocalStorage wrapper
│   ├── formatting.ts                   # Display formatters
│   └── constants.ts                    # Enums, defaults
│
├── types/
│   ├── endpoint.ts                     # Endpoint interfaces
│   ├── route.ts                        # Route interfaces
│   ├── scene.ts                        # Scene interfaces
│   ├── state.ts                        # State machine types
│   └── api.ts                          # API response types
│
└── __tests__/
    ├── routingReducer.test.ts          # Reducer tests
    ├── validation.test.ts              # Validation tests
    └── AvbRoutingApp.test.tsx          # Integration tests
```

---

## 🚀 Implementation Phases

### **Phase 1: Foundation & Data Layer** (2-3 days)

#### Objectives
- Setup module structure
- Define TypeScript types
- Create basic state machine
- Implement API client

#### Tasks

1. **Create Type Definitions** (`types/`)
   ```typescript
   // types/endpoint.ts
   export interface Endpoint {
     endpoint_id: string;
     entity_id: string;
     unique_id: number;
     direction: 'talker' | 'listener';
     device_type: 'map2' | 'avdecc' | 'unknown';
     device_name: string;
     channels: number;
     sample_rate: number;
     format: string;
     mac_address: string | null;
     node_address: string | null;
     available: boolean;
     last_seen: string;

     // UI metadata
     tags: string[];
     color: string;
     group: string;
     bank: number;
     pinned: boolean;
     locked: boolean;
   }
   ```

2. **Create Routing Reducer** (`context/routingReducer.ts`)
   ```typescript
   export interface RoutingState {
     endpoints: Record<string, Endpoint>;
     liveRoutes: Record<string, Route>;
     pendingRoutes: Record<string, Route>;
     scenes: Record<string, Scene>;

     selection: {
       selectedEndpoints: string[];
       selectedRoutes: string[];
     };

     filters: FilterState;
     search: string;
     bank: { talkers: number; listeners: number };
     safePatchMode: boolean;

     history: {
       past: RoutingState[];
       future: RoutingState[];
     };

     auditLog: AuditLogEntry[];
   }

   export function routingReducer(
     state: RoutingState,
     action: RoutingAction
   ): RoutingState {
     // Implementation...
   }
   ```

3. **Create API Client** (`hooks/useAvbApi.ts`)
   ```typescript
   export function useEndpoints(direction?: 'talker' | 'listener') {
     return useQuery({
       queryKey: ['avb', 'endpoints', direction],
       queryFn: async () => {
         const params = direction ? `?direction=${direction}` : '';
         const res = await fetch(`/api/avb/router/endpoints${params}`);
         return res.json();
       },
       refetchInterval: 5000, // Poll every 5 seconds
     });
   }

   export function useConnections() {
     return useQuery({
       queryKey: ['avb', 'connections'],
       queryFn: async () => {
         const res = await fetch('/api/avb/router/connections');
         return res.json();
       },
       refetchInterval: 2000, // Poll every 2 seconds
     });
   }

   export function usePatchMutation() {
     const queryClient = useQueryClient();

     return useMutation({
       mutationFn: async (payload: { talker_id: string; listener_id: string }) => {
         const res = await fetch('/api/avb/router/connect', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(payload),
         });
         if (!res.ok) throw new Error(await res.text());
         return res.json();
       },
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ['avb', 'connections'] });
       },
     });
   }
   ```

4. **Create Context Provider** (`context/RoutingContext.tsx`)
   ```typescript
   const RoutingContext = createContext<{
     state: RoutingState;
     dispatch: React.Dispatch<RoutingAction>;
   } | null>(null);

   export function RoutingProvider({ children }: { children: React.ReactNode }) {
     const [state, dispatch] = useReducer(routingReducer, initialState);

     // Sync with API
     const { data: endpoints } = useEndpoints();
     const { data: connections } = useConnections();

     useEffect(() => {
       if (endpoints) {
         dispatch({ type: 'ENDPOINTS_UPDATED', payload: endpoints });
       }
     }, [endpoints]);

     useEffect(() => {
       if (connections) {
         dispatch({ type: 'CONNECTIONS_UPDATED', payload: connections });
       }
     }, [connections]);

     return (
       <RoutingContext.Provider value={{ state, dispatch }}>
         {children}
       </RoutingContext.Provider>
     );
   }

   export const useRouting = () => {
     const context = useContext(RoutingContext);
     if (!context) throw new Error('useRouting must be used within RoutingProvider');
     return context;
   };
   ```

#### Deliverables
- ✅ Complete type definitions
- ✅ Working reducer with basic actions
- ✅ API client with react-query hooks
- ✅ Context provider with data sync

#### Quality Gate
- [ ] Types compile without errors
- [ ] Reducer tests pass (basic actions)
- [ ] API calls work with mock backend

---

### **Phase 2: Core UI - Routing Grid** (3-4 days)

#### Objectives
- Build virtualized routing matrix
- Implement matrix cell interactions
- Add sticky headers
- Handle basic patch/unpatch

#### Tasks

1. **Create Matrix Cell Component** (`components/RoutingGrid/MatrixCell.tsx`)
   ```tsx
   interface MatrixCellProps {
     talker: Endpoint;
     listener: Endpoint;
     route: Route | null;
     onClick: () => void;
     pending: boolean;
   }

   export const MatrixCell: React.FC<MatrixCellProps> = ({
     talker,
     listener,
     route,
     onClick,
     pending,
   }) => {
     const isConnected = route?.state === 'connected';
     const isConnecting = route?.state === 'connecting';
     const hasError = route?.state === 'error';

     return (
       <Box
         onClick={onClick}
         sx={{
           width: '100%',
           height: '100%',
           display: 'flex',
           alignItems: 'center',
           justifyContent: 'center',
           cursor: 'pointer',
           border: pending ? '2px solid orange' : '1px solid #333',
           backgroundColor: isConnected ? '#4caf50' : 'transparent',
           '&:hover': { backgroundColor: '#555' },
         }}
       >
         {isConnected && '●'}
         {isConnecting && <CircularProgress size={16} />}
         {hasError && '✗'}
       </Box>
     );
   };
   ```

2. **Create Virtualized Grid** (`components/RoutingGrid/VirtualizedMatrix.tsx`)
   ```tsx
   import { FixedSizeGrid } from 'react-window';

   export const VirtualizedMatrix: React.FC = () => {
     const { state, dispatch } = useRouting();
     const talkers = useFilteredEndpoints('talker');
     const listeners = useFilteredEndpoints('listener');
     const patchMutation = usePatchMutation();

     const handleCellClick = (talker_id: string, listener_id: string) => {
       if (state.safePatchMode) {
         dispatch({ type: 'PATCH', payload: { talker_id, listener_id } });
       } else {
         patchMutation.mutate({ talker_id, listener_id });
       }
     };

     const Cell = ({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
       const talker = talkers[columnIndex];
       const listener = listeners[rowIndex];
       const route = state.liveRoutes[`${talker.endpoint_id}→${listener.endpoint_id}`];
       const pending = !!state.pendingRoutes[`${talker.endpoint_id}→${listener.endpoint_id}`];

       return (
         <div style={style}>
           <MatrixCell
             talker={talker}
             listener={listener}
             route={route}
             onClick={() => handleCellClick(talker.endpoint_id, listener.endpoint_id)}
             pending={pending}
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

3. **Add Sticky Headers** (`components/RoutingGrid/StickyHeaders.tsx`)
   ```tsx
   export const StickyHeaders: React.FC = () => {
     const talkers = useFilteredEndpoints('talker');
     const listeners = useFilteredEndpoints('listener');

     return (
       <>
         {/* Talker header (top) */}
         <Box sx={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#222' }}>
           <Stack direction="row">
             <Box sx={{ width: 150 }} /> {/* Spacer for listener column */}
             {talkers.map(t => (
               <Box key={t.endpoint_id} sx={{ width: 60, textAlign: 'center' }}>
                 <Tooltip title={t.device_name}>
                   <Typography variant="caption" noWrap>
                     {t.device_name.slice(0, 8)}
                   </Typography>
                 </Tooltip>
               </Box>
             ))}
           </Stack>
         </Box>

         {/* Listener column (left) */}
         <Box sx={{ position: 'absolute', left: 0, top: 40, zIndex: 5, backgroundColor: '#222' }}>
           <Stack>
             {listeners.map(l => (
               <Box key={l.endpoint_id} sx={{ width: 150, height: 40, display: 'flex', alignItems: 'center', px: 1 }}>
                 <Typography variant="body2" noWrap>
                   {l.device_name}
                 </Typography>
               </Box>
             ))}
           </Stack>
         </Box>
       </>
     );
   };
   ```

4. **Create Root Component** (`AvbRoutingApp.tsx`)
   ```tsx
   export const AvbRoutingApp: React.FC = () => {
     return (
       <RoutingProvider>
         <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
           <TopBar />
           <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
             <Sidebar />
             <Box sx={{ flex: 1, position: 'relative' }}>
               <StickyHeaders />
               <VirtualizedMatrix />
             </Box>
             <InspectorPanel />
           </Box>
           <BottomPanel />
         </Box>
       </RoutingProvider>
     );
   };
   ```

#### Deliverables
- ✅ Working virtualized grid
- ✅ Click-to-patch functionality
- ✅ Sticky headers
- ✅ Basic connection indicators

#### Quality Gate
- [ ] Grid renders 100×100 matrix in < 500ms
- [ ] Clicking cell patches connection
- [ ] Headers remain visible on scroll

---

### **Phase 3: Professional Features** (4-5 days)

#### Objectives
- Safe patch mode
- Scene management
- Route locking
- Validation engine

#### Tasks

1. **Implement Safe Patch Mode** (`hooks/useSafePatch.ts`)
   ```typescript
   export function useSafePatch() {
     const { state, dispatch } = useRouting();
     const patchMutation = usePatchMutation();

     const applySafeChanges = async () => {
       const pending = Object.values(state.pendingRoutes);

       // Batch API calls
       for (const route of pending) {
         await patchMutation.mutateAsync({
           talker_id: route.talker_id,
           listener_id: route.listener_id,
         });
       }

       dispatch({ type: 'APPLY_SAFE_CHANGES' });
     };

     const discardSafeChanges = () => {
       dispatch({ type: 'DISCARD_SAFE_CHANGES' });
     };

     return { applySafeChanges, discardSafeChanges };
   }
   ```

2. **Implement Scene Management** (`components/Dialogs/SceneRecallDialog.tsx`)
   ```tsx
   export const SceneRecallDialog: React.FC<{ scene: Scene }> = ({ scene }) => {
     const { state } = useRouting();

     const diff = useMemo(() => {
       const current = Object.keys(state.liveRoutes);
       const target = scene.routes.map(r => r.id);

       const toAdd = target.filter(id => !current.includes(id));
       const toRemove = current.filter(id => !target.includes(id));

       return { toAdd, toRemove };
     }, [state.liveRoutes, scene.routes]);

     return (
       <Dialog open>
         <DialogTitle>Recall Scene: {scene.name}</DialogTitle>
         <DialogContent>
           <Typography variant="h6">Changes:</Typography>
           <List>
             {diff.toAdd.map(id => (
               <ListItem key={id}>
                 <ListItemText primary={`+ Connect ${id}`} />
               </ListItem>
             ))}
             {diff.toRemove.map(id => (
               <ListItem key={id}>
                 <ListItemText primary={`- Disconnect ${id}`} />
               </ListItem>
             ))}
           </List>
         </DialogContent>
         <DialogActions>
           <Button onClick={onCancel}>Cancel</Button>
           <Button onClick={onApply} color="primary">Apply</Button>
         </DialogActions>
       </Dialog>
     );
   };
   ```

3. **Implement Validation Engine** (`utils/validation.ts`)
   ```typescript
   export interface ValidationResult {
     valid: boolean;
     warnings: ValidationWarning[];
     errors: ValidationError[];
   }

   export function validateConnection(
     talker: Endpoint,
     listener: Endpoint
   ): ValidationResult {
     const warnings: ValidationWarning[] = [];
     const errors: ValidationError[] = [];

     // Sample rate check
     if (talker.sample_rate !== listener.sample_rate) {
       warnings.push({
         code: 'SAMPLE_RATE_MISMATCH',
         message: `Talker ${talker.sample_rate}Hz ≠ Listener ${listener.sample_rate}Hz`,
         severity: 'warning',
       });
     }

     // Channel count check
     if (talker.channels !== listener.channels) {
       warnings.push({
         code: 'CHANNEL_MISMATCH',
         message: `Talker ${talker.channels}ch ≠ Listener ${listener.channels}ch`,
         severity: 'warning',
       });
     }

     // Availability check
     if (!talker.available || !listener.available) {
       errors.push({
         code: 'ENDPOINT_UNAVAILABLE',
         message: 'One or both endpoints are offline',
         severity: 'error',
       });
     }

     return {
       valid: errors.length === 0,
       warnings,
       errors,
     };
   }
   ```

4. **Implement Undo/Redo** (`hooks/useUndoRedo.ts`)
   ```typescript
   export function useUndoRedo() {
     const { state, dispatch } = useRouting();

     const undo = useCallback(() => {
       dispatch({ type: 'UNDO' });
     }, [dispatch]);

     const redo = useCallback(() => {
       dispatch({ type: 'REDO' });
     }, [dispatch]);

     const canUndo = state.history.past.length > 0;
     const canRedo = state.history.future.length > 0;

     // Keyboard shortcuts
     useEffect(() => {
       const handler = (e: KeyboardEvent) => {
         if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
           e.preventDefault();
           if (e.shiftKey) {
             redo();
           } else {
             undo();
           }
         }
       };

       window.addEventListener('keydown', handler);
       return () => window.removeEventListener('keydown', handler);
     }, [undo, redo]);

     return { undo, redo, canUndo, canRedo };
   }
   ```

#### Deliverables
- ✅ Safe patch mode toggle + apply/discard
- ✅ Scene save/recall with diff preview
- ✅ Route locking mechanism
- ✅ Validation warnings/errors
- ✅ Undo/redo with keyboard shortcuts

#### Quality Gate
- [ ] Safe patch mode stages changes correctly
- [ ] Scene recall shows accurate diff
- [ ] Validation catches mismatches
- [ ] Undo/redo preserves state correctly

---

### **Phase 4: UX & Search/Filter** (2-3 days)

#### Objectives
- Search functionality
- Filter panel
- Endpoint labels/colors
- Banking/grouping

#### Tasks

1. **Implement Search** (`components/TopBar/SearchControl.tsx`)
   ```tsx
   export const SearchControl: React.FC = () => {
     const { state, dispatch } = useRouting();

     return (
       <TextField
         placeholder="Search endpoints..."
         value={state.search}
         onChange={(e) => dispatch({ type: 'SET_SEARCH', payload: e.target.value })}
         InputProps={{
           startAdornment: <SearchIcon />,
         }}
       />
     );
   };
   ```

2. **Implement Filters** (`components/TopBar/FilterPanel.tsx`)
   ```tsx
   export const FilterPanel: React.FC = () => {
     const { state, dispatch } = useRouting();

     return (
       <Popover>
         <FormGroup>
           <FormLabel>Device Type</FormLabel>
           <FormControlLabel
             control={
               <Checkbox
                 checked={state.filters.deviceTypes.includes('map2')}
                 onChange={(e) => dispatch({
                   type: 'SET_FILTERS',
                   payload: { deviceTypes: e.target.checked ? ['map2'] : [] }
                 })}
               />
             }
             label="MAP2"
           />
           <FormControlLabel
             control={
               <Checkbox
                 checked={state.filters.deviceTypes.includes('avdecc')}
               />
             }
             label="AVDECC"
           />

           <Divider sx={{ my: 1 }} />

           <FormLabel>Sample Rate</FormLabel>
           {[48000, 96000].map(rate => (
             <FormControlLabel
               key={rate}
               control={<Checkbox />}
               label={`${rate / 1000}kHz`}
             />
           ))}
         </FormGroup>
       </Popover>
     );
   };
   ```

3. **Implement Endpoint Metadata Storage** (`utils/storage.ts`)
   ```typescript
   const STORAGE_KEY = 'avb_endpoint_metadata';

   export interface EndpointMetadata {
     label?: string;
     tags: string[];
     color: string;
     group: string;
     pinned: boolean;
     locked: boolean;
   }

   export function getEndpointMetadata(endpoint_id: string): EndpointMetadata {
     const stored = localStorage.getItem(STORAGE_KEY);
     const data = stored ? JSON.parse(stored) : {};
     return data[endpoint_id] || { tags: [], color: '#fff', group: 'Default', pinned: false, locked: false };
   }

   export function setEndpointMetadata(endpoint_id: string, metadata: Partial<EndpointMetadata>) {
     const stored = localStorage.getItem(STORAGE_KEY);
     const data = stored ? JSON.parse(stored) : {};
     data[endpoint_id] = { ...getEndpointMetadata(endpoint_id), ...metadata };
     localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
   }
   ```

#### Deliverables
- ✅ Search with real-time filtering
- ✅ Filter panel with checkboxes
- ✅ Endpoint labels/colors persisted
- ✅ Banking controls

#### Quality Gate
- [ ] Search filters endpoints instantly
- [ ] Filters combine correctly (AND logic)
- [ ] Metadata persists in localStorage

---

### **Phase 5: Inspector & Dialogs** (2 days)

#### Objectives
- Inspector panel with details
- All confirmation dialogs
- History timeline

#### Tasks

1. **Inspector Panel** (`components/Inspector/InspectorPanel.tsx`)
2. **Connection Details** (`components/Inspector/ConnectionDetails.tsx`)
3. **Validation Messages** (`components/Inspector/ValidationMessages.tsx`)
4. **Destructive Patch Dialog** (`components/Dialogs/DestructivePatchDialog.tsx`)
5. **History Timeline** (`components/BottomPanel/HistoryTimeline.tsx`)

#### Deliverables
- ✅ Inspector shows selected endpoint details
- ✅ All dialogs implemented
- ✅ History timeline with rollback

#### Quality Gate
- [ ] Inspector updates on selection change
- [ ] Dialogs prevent destructive actions
- [ ] History allows rollback

---

### **Phase 6: WebSocket Integration** (1-2 days)

#### Objectives
- Real-time endpoint discovery updates
- Real-time connection state changes
- Live status indicators

#### Tasks

1. **WebSocket Hook** (`hooks/useWebSocketSync.ts`)
   ```typescript
   export function useWebSocketSync() {
     const { dispatch } = useRouting();
     const ws = useRef<WebSocket | null>(null);

     useEffect(() => {
       ws.current = new WebSocket('ws://localhost:8080/ws');

       ws.current.onmessage = (event) => {
         const data = JSON.parse(event.data);

         switch (data.event) {
           case 'avb.endpoint.discovered':
             dispatch({ type: 'ENDPOINTS_UPDATED', payload: [data.endpoint] });
             break;

           case 'avb.connection.established':
             dispatch({ type: 'CONNECTIONS_UPDATED', payload: [data.route] });
             break;

           case 'avb.endpoint.lost':
             dispatch({
               type: 'STATUS_UPDATE',
               payload: { endpoint_id: data.endpoint_id, available: false },
             });
             break;
         }
       };

       return () => ws.current?.close();
     }, [dispatch]);
   }
   ```

#### Deliverables
- ✅ WebSocket connection
- ✅ Real-time updates for endpoints/connections
- ✅ Auto-reconnect on disconnect

#### Quality Gate
- [ ] UI updates within 500ms of backend change
- [ ] No duplicate updates
- [ ] Handles reconnection gracefully

---

### **Phase 7: Testing & Documentation** (2-3 days)

#### Objectives
- Unit tests for reducer
- Integration tests
- Component documentation
- User guide

#### Tasks

1. **Reducer Tests** (`__tests__/routingReducer.test.ts`)
   ```typescript
   describe('routingReducer', () => {
     it('should handle PATCH action in safe mode', () => {
       const initialState = { ...defaultState, safePatchMode: true };
       const action = {
         type: 'PATCH' as const,
         payload: { talker_id: 't1', listener_id: 'l1' },
       };

       const newState = routingReducer(initialState, action);

       expect(newState.pendingRoutes['t1→l1']).toBeDefined();
       expect(newState.liveRoutes['t1→l1']).toBeUndefined();
     });

     it('should handle UNDO action', () => {
       const state = { ...defaultState, history: { past: [defaultState], future: [] } };
       const action = { type: 'UNDO' as const };

       const newState = routingReducer(state, action);

       expect(newState.history.past).toHaveLength(0);
       expect(newState.history.future).toHaveLength(1);
     });
   });
   ```

2. **Integration Tests** (`__tests__/AvbRoutingApp.test.tsx`)
3. **Component Documentation** (JSDoc comments)
4. **User Guide** (`docs/AVB_ROUTING_USER_GUIDE.md`)

#### Deliverables
- ✅ 80%+ code coverage
- ✅ All critical flows tested
- ✅ Component documentation complete
- ✅ User guide with screenshots

#### Quality Gate
- [ ] All tests pass
- [ ] Coverage > 80%
- [ ] Documentation reviewed

---

## 📊 Project Timeline (Gantt Chart)

```
Week 1:
  Mon-Tue:  Phase 1 (Foundation)
  Wed-Fri:  Phase 2 (Core UI)

Week 2:
  Mon-Wed:  Phase 3 (Pro Features)
  Thu-Fri:  Phase 4 (UX/Search)

Week 3:
  Mon-Tue:  Phase 5 (Inspector/Dialogs)
  Wed:      Phase 6 (WebSocket)
  Thu-Fri:  Phase 7 (Testing/Docs)
```

---

## 🎯 Critical Success Factors

1. **Type Safety**: All API responses typed correctly
2. **Performance**: Virtualization must handle 100+ endpoints
3. **State Consistency**: Reducer must be pure (no side effects)
4. **Real-time Sync**: WebSocket updates must not race with API calls
5. **Audit Trail**: Every user action must be logged

---

## 🧪 Testing Strategy

### Unit Tests
- Reducer: All action types
- Validation: All constraint checks
- Utilities: Formatters, storage

### Integration Tests
- API hooks: Mock backend responses
- Component interactions: Click → dispatch → state update

### E2E Tests (Manual)
- Full patch workflow: Click cell → API call → connection
- Scene recall: Load scene → diff → apply
- Safe patch: Toggle → stage → apply

---

## 🚀 Deployment Plan

1. **Development Build**: `npm run dev` (port 3001)
2. **Production Build**: `npm run build`
3. **Deploy**: `npm run deploy` (copies to backend static/)
4. **Verify**: Open http://localhost:8080/avb-routing

---

## 📚 References

- [AVB_ROUTING_UI_SPECIFICATION.md](./AVB_ROUTING_UI_SPECIFICATION.md)
- [Backend API: app/routes/avb.py](../app/routes/avb.py)
- [Backend Router: app/services/avb/avb_router.py](../app/services/avb/avb_router.py)
- [react-window docs](https://react-window.vercel.app/)
- [react-query docs](https://tanstack.com/query/latest)

---

**END OF IMPLEMENTATION PLAN**

This plan provides a clear roadmap for building the AVB Routing Matrix UI with well-defined phases, deliverables, and quality gates. Follow this plan sequentially for best results.

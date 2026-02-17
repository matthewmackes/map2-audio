# AVB Routing Matrix - Multi-Node Architecture

## Overview

The AVB Routing Matrix is designed with **multi-node control as a first-class citizen**. Users can discover, monitor, and control any MAP2 or AVDECC node on the network from a single unified interface.

## Core Principles

1. **Network-First Design**: The interface represents the entire AVB network, not just a single node
2. **Unified Control Surface**: Control any node without switching tools or interfaces
3. **Cross-Node Routing**: Route audio between different nodes seamlessly
4. **Topology Awareness**: Visualize network structure and relationships
5. **Distributed State**: Track state across multiple nodes with real-time sync

## Architecture Components

### 1. Network Discovery Layer

**Purpose**: Discover and monitor all nodes on the AVB network

**Data Flow**:
```
Backend Discovery Service → API Endpoints → Frontend Node State → UI Components
```

**Key Features**:
- Automatic node discovery via AVB/AVDECC
- Real-time node health monitoring
- Capability detection (MAP2 vs AVDECC)
- PTP/gPTP synchronization status

### 2. Node Management

**Node Types**:

| Type | Description | Control Level |
|------|-------------|---------------|
| **Local** | The current MAP2 node running the backend | Full control |
| **MAP2 Remote** | Other MAP2 nodes on the network | Full control (via REST API) |
| **AVDECC** | Third-party AVB devices | AVDECC protocol control |
| **Offline** | Previously discovered but currently unavailable | Read-only history |

**Node Capabilities**:
- Talker endpoints (output streams)
- Listener endpoints (input streams)
- AVDECC controller capabilities
- Audio processing capabilities
- Configuration management

### 3. Multi-Node State Management

**State Structure**:
```typescript
{
  network: {
    nodes: Record<string, AvbNode>,           // All discovered nodes
    currentNodeId: string | null,              // Currently selected node
    localNodeId: string,                       // Local node (always available)
    topology: NetworkTopology,                 // Network graph structure
    syncStatus: SyncStatus,                    // PTP/gPTP sync info
  },
  endpoints: {
    byNode: Record<string, Endpoint[]>,        // Endpoints grouped by node
    all: Record<string, Endpoint>,             // Flat lookup by endpoint_id
  },
  routes: {
    intraNode: Record<string, Route[]>,        // Routes within single node
    crossNode: Record<string, Route[]>,        // Routes between nodes
    all: Record<string, Route>,                // Flat lookup by route_id
  }
}
```

### 4. UI Layout (Multi-Node First)

```
┌─────────────────────────────────────────────────────────────────┐
│ Top Bar                                                         │
│  [Network View ▼] [Local Node] [Remote Node 1] [Remote Node 2] │
│  [Topology] [Search...] [Safe Patch] [Undo/Redo]              │
└─────────────────────────────────────────────────────────────────┘
┌──────────┬────────────────────────────────────┬─────────────────┐
│          │                                    │                 │
│  Node    │   Routing Matrix                   │   Inspector     │
│  Tree    │   (Talkers × Listeners)           │                 │
│          │                                    │   Selected:     │
│  • Local │   Shows ALL nodes by default       │   Node: Local   │
│    📊    │   or filtered to selected node    │   Endpoint: ... │
│  • Node1 │                                    │                 │
│    🔌    │   Color-coded by node              │   Routes: 3     │
│  • Node2 │   Cross-node routes highlighted   │   Status: ✓     │
│    🔌    │                                    │                 │
│          │                                    │   [Lock]        │
│  [+Add]  │                                    │   [Disconnect]  │
│          │                                    │                 │
└──────────┴────────────────────────────────────┴─────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Status Bar: 3 nodes online • 47 endpoints • 12 routes • PTP ✓  │
└─────────────────────────────────────────────────────────────────┘
```

**Key UI Elements**:

1. **Node Selector Tabs** (Top Bar)
   - Quick switch between nodes
   - Visual status indicators (online/offline, sync, load)
   - Badge showing endpoint/route count

2. **Network Topology Button** (Top Bar)
   - Opens modal with visual network graph
   - Shows PTP master/slave relationships
   - Shows active audio routes as edges

3. **Node Tree** (Left Sidebar)
   - Hierarchical view of all nodes
   - Expandable to show endpoints per node
   - Drag-drop endpoints between nodes

4. **Routing Matrix** (Center)
   - **All Nodes Mode**: Shows endpoints from all nodes
   - **Single Node Mode**: Filters to selected node
   - Color-coded by node (each node gets a color)
   - Cross-node routes have special visual treatment

5. **Inspector Panel** (Right)
   - Shows node context for selected endpoint/route
   - Node-specific controls and settings
   - Real-time metrics per node

### 5. Visual Design Patterns

**Node Color Coding**:
- Each node assigned a unique accent color
- Headers, cells, and routes use node's color
- Alpha blending for cross-node routes

**Cross-Node Route Indicators**:
- Gradient fill (talker color → listener color)
- Dashed border
- Special icon overlay (🔗)
- Tooltip shows both nodes

**Node Status Badges**:
- 🟢 Online + Synced
- 🟡 Online + No PTP sync
- 🔴 Offline
- ⚠️ Degraded (high latency, packet loss)

### 6. API Integration Strategy

**Node Context Headers**:
All API calls include node context:
```typescript
headers: {
  'X-Target-Node-Id': nodeId,  // Which node to control
  'X-Source-Node-Id': localNodeId,  // Who is making the request
}
```

**Endpoint Formats**:
```typescript
// Single node control (existing)
POST /api/avb/router/connect
{ talker_id, listener_id }

// Multi-node control (new)
POST /api/avb/router/connect
{
  talker_id,
  listener_id,
  talker_node_id,    // Source node
  listener_node_id,  // Destination node
  cross_node: true   // Trigger distributed routing
}
```

**Polling Strategy**:
```typescript
// Poll local node frequently (2s)
useQuery(['nodes', localNodeId], { refetchInterval: 2000 })

// Poll remote nodes less frequently (5s)
useQuery(['nodes', remoteNodeId], { refetchInterval: 5000 })

// Use WebSocket for real-time events (future)
useWebSocket('/ws/avb/network')
```

### 7. Cross-Node Routing Logic

**Scenario**: Route from Node A Talker → Node B Listener

**Steps**:
1. User clicks cell in routing matrix (A→B)
2. Frontend detects cross-node routing
3. Frontend calls batch API:
   ```json
   {
     "operations": [
       {
         "type": "connect",
         "talker": { "node_id": "A", "endpoint_id": "..." },
         "listener": { "node_id": "B", "endpoint_id": "..." }
       }
     ]
   }
   ```
4. Backend orchestrates:
   - Node A: Start talker stream
   - Network: SRP reservation
   - Node B: Connect listener to stream
5. Frontend polls both nodes for status
6. UI updates when both sides confirm

### 8. Network Topology View

**Visualization** (using reactflow):
```
                ┌─────────────┐
                │  PTP Master │
                │   (Switch)  │
                └──────┬──────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
   ┌───▼───┐       ┌───▼───┐      ┌───▼───┐
   │ MAP2  │       │ MAP2  │      │AVDECC │
   │ Local │◄─────►│ Node1 │◄────►│Device │
   │ 🎛️    │  🔊   │ 🎛️    │ 🔊  │ 🔌    │
   └───────┘       └───────┘      └───────┘
     3 🔊            5 🔊            2 🔊
```

**Features**:
- Nodes as rounded rectangles
- Active routes as colored edges
- PTP relationships as hierarchy
- Click node to select/focus
- Drag to rearrange layout

### 9. Performance Optimizations

**Challenges**:
- Large networks (10+ nodes × 20 endpoints = 200+ endpoints)
- Real-time updates across nodes
- Cross-node routing complexity

**Solutions**:
1. **Virtualization**: Already using react-window
2. **Lazy Loading**: Load node details on demand
3. **Filtering**: Bank/group by node to reduce visible endpoints
4. **Caching**: Aggressive react-query caching
5. **WebSocket**: Future real-time protocol (reduce polling)
6. **IndexedDB**: Offline node history/metadata

### 10. Security & Access Control

**Future Considerations**:
- Node authentication (API keys per node)
- Role-based access (some nodes read-only)
- Audit logging (who controlled which node)
- Rate limiting (prevent node flooding)

## Implementation Phases

### Phase 1: Foundation (Current)
- ✅ Node type definitions
- ✅ Network state management
- ✅ Node discovery API integration
- 🔄 Node selector UI

### Phase 2: Core Multi-Node
- 🔄 Node tree sidebar
- 🔄 Multi-node routing matrix
- ⏳ Cross-node routing logic
- ⏳ Node color coding

### Phase 3: Advanced Visualization
- ⏳ Network topology view (reactflow)
- ⏳ PTP sync indicators
- ⏳ Node health monitoring

### Phase 4: Polish & Performance
- ⏳ WebSocket real-time updates
- ⏳ IndexedDB offline support
- ⏳ Advanced filtering by node
- ⏳ Multi-node scene management

## Summary

This multi-node architecture ensures that **network control is central to the design**, not bolted on. Users can:

- ✅ See all nodes at a glance
- ✅ Control any node without switching interfaces
- ✅ Route audio across nodes seamlessly
- ✅ Monitor network health in real-time
- ✅ Visualize network topology
- ✅ Work with hundreds of endpoints efficiently

**Next**: Implement the node types and state management!

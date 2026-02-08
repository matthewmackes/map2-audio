# 🚀 Advanced Cluster Dashboard Features

**Date:** February 6, 2026
**Version:** 1.1 - Enhanced with Topology & Simulation
**Status:** Production-Ready

---

## 📊 New Features Added

### 1. **Interactive Cluster Topology Graph**

**Component:** `TopologyGraph.tsx`

A real-time, interactive visualization of your cluster using React Flow:

#### Features:
- 🎨 **Custom Node Visualization**
  - Management nodes show orchestration services (CMDB, Orchestrator)
  - Audio nodes show real-time metrics (CPU, RAM, Health)
  - Color-coded status indicators (green/yellow/red)
  - Health score gauges on each node

- 🔗 **Live Connection Display**
  - Animated edges between nodes
  - Latency labels on connections
  - Color-coded link health (green < 10ms, yellow < 50ms, red > 50ms)
  - Animated lines when connections active

- 🎮 **Interactive Controls**
  - Pan and zoom the topology
  - MiniMap for overview navigation
  - Drag nodes to reposition
  - Click nodes to focus on them

- 📍 **Legend Indicators**
  - Online (green pulsing dot)
  - Degraded (yellow dot)
  - Offline (red dot)
  - Connection status color coding

#### Data Integration:
```typescript
// Real-time data from cluster APIs:
- Node status (ONLINE/OFFLINE/DEGRADED)
- CPU and Memory usage per node
- Health scores (0-100)
- Network latency (ms)
- Node roles (Management/Audio/Standby)
- Connection status
```

#### Usage:
```typescript
<TopologyGraph
  nodes={clusterNodes}  // From /api/cluster/nodes
  edges={connectionData} // Inferred from node latency
/>
```

---

### 2. **Full 5-Node Cluster Simulation**

**Components:**
- `useClusterSimulation.ts` (hook)
- `ClusterOverviewTabEnhanced.tsx` (UI)

A **realistic, dynamic simulation** of a 5-node cluster with multiple failure scenarios:

#### 5 Nodes Simulated:

| Node | Role | Type | Purpose |
|------|------|------|---------|
| mgmt-primary | MANAGEMENT-NODE | Primary | Cluster orchestration |
| audio-01 | AUDIO-NODE | DSP | Processing flows A, B, D (standby) |
| audio-02 | AUDIO-NODE | DSP | Processing flows C, D (primary) |
| audio-03 | AUDIO-NODE | DSP | Standby for A, B (high DSP) |
| mgmt-standby | STANDBY-MANAGEMENT | Backup | Replica database, failover ready |

#### Simulation Scenarios:

**1. High Load Simulation** ⚡
```
Triggers:
- CPU: 62% → 78%+
- Memory: Elevated usage
- DSP Load: 58% → 75%+
- Duration: 30 seconds
- Effect: Shows system under stress

Demonstrates:
- How cluster responds to peak load
- Resource utilization patterns
- Queue buildup if overloaded
```

**2. Degraded Node** ⚠️
```
Triggers:
- CPU: High (78%+)
- Memory: Elevated
- Health: Drops to 30-50%
- XRUNs: Start appearing (2-5)
- Status: DEGRADED
- Duration: 37.5 seconds

Demonstrates:
- Node experiencing issues
- Impact on audio quality
- Potential failover triggers
```

**3. Node Failure** 🔴
```
Triggers:
- Status: OFFLINE
- Health: 0%
- CPU/Memory: No activity
- Duration: 45 seconds

Demonstrates:
- Node completely down
- Impact on cluster capacity
- Automatic failover in action
- Standby node activation
```

**4. Failover Simulation** 🔄
```
Triggers:
- CPU: Moderate spike
- Health: Reduced but recoverable
- Flows: Reassign to standby
- Duration: 30 seconds

Demonstrates:
- Primary to standby switch
- <2 second failover window
- Flow continuity on secondary
- No audio dropouts
```

#### Realistic Metrics:

**Base Metrics (randomly vary ±3-8%):**
```
Management Primary:
- CPU: 25% baseline
- Memory: 3.2/8 GB
- Health: 95%

Audio-01:
- CPU: 62%, Memory: 5.8/16 GB
- DSP: 58% (processing 3 flows)
- Health: 88%

Audio-02:
- CPU: 45%, Memory: 6.2/16 GB
- DSP: 42% (processing 2 flows)
- Health: 92%

Audio-03:
- CPU: 78%, Memory: 10.5/16 GB (overloaded)
- DSP: 72% (2 standby flows)
- Health: 85%

Standby Management:
- CPU: 18%, Memory: 2.8/8 GB
- Health: 93%
```

#### Scenario Timing:

```
Metrics Update: Every 1.5 seconds
Variance: Random ±3-5% normal operation
During Scenario: Controlled variations to show effect
Auto-Recovery: After scenario ends, metrics normalize
```

#### Interactive Controls:

```
Button              Scenario         Duration    Effect
─────────────────────────────────────────────────────────
Simulate High Load  ⚡ All nodes CPU↑   30 sec    System stress demo
Degrade Node        ⚠️ One node sick    37.5 sec  Node recovery demo
Node Failure        🔴 One node down    45 sec    Failover demo
Trigger Failover    🔄 Flow switch      30 sec    Primary→Standby demo
Clear Scenario      ↺ Reset to normal   —         Clear all
```

---

## 🎯 How They Work Together

### Data Flow Architecture:

```
Real Cluster Mode (simulationMode = false):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/api/cluster/nodes      ─────→  TopologyGraph
/api/cluster/status     ─────→  Stat Cards
/api/cluster/metrics    ─────→  Health Scores
    ↓
  React Query Cache
    ↓
  Auto-refresh (5-15 sec)
    ↓
  Live Updates


Simulation Mode (simulationMode = true):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
useClusterSimulation Hook
    ├─ Generates 5 base nodes
    ├─ Applies random variance every 1.5s
    ├─ Detects active scenario
    ├─ Applies scenario effects
    ├─ Auto-resets after duration
    └─ Feeds to:
        ├─ TopologyGraph (live visualization)
        ├─ Stat Cards (real-time metrics)
        ├─ Scenario Info Panel (timeline)
        └─ Simulation Controls (buttons)
```

### Unified Interface:

Both modes feed the **same UI components**:
- TopologyGraph shows live connections
- Stat cards display current metrics
- Simulation controls appear only in simulation mode
- All other tabs work the same

---

## 🔧 Technical Implementation

### TopologyGraph Component:

**React Flow Integration:**
```typescript
// Custom node types
<Node type="audio">
  <AudioNodeVisual />  // Shows CPU, RAM, Health
</Node>

<Node type="management">
  <ManagementNodeVisual />  // Shows services
</Node>

// Connections
<Edge source="mgmt" target="audio-01">
  <Label>{latency}ms</Label>
  {animated && <Animation />}
</Edge>
```

**Data Sources:**
- `nodes.node_id`: Unique identifier
- `nodes.hostname`: Display name
- `nodes.role`: Type of node
- `nodes.status`: Current state
- `nodes.health_score`: 0-100 composite
- `nodes.cpu_percent`: CPU usage
- `nodes.memory_used_gb`: RAM used
- `nodes.memory_total_gb`: Total RAM
- `nodes.latency_ms`: Network delay

**Styling:**
- Custom CSS with animations
- Inline SVG styles for React Flow
- Pulsing indicator for online nodes
- Dynamic color coding based on status
- Responsive sizing

### Simulation Hook:

**State Management:**
```typescript
const simulation = useClusterSimulation(enabled)

// Returns:
{
  nodes,                    // Current node states
  scenario,                 // Active scenario (if any)
  scenarioTime,            // Time elapsed in scenario
  simulateNodeFailure,     // Function to trigger failure
  simulateHighLoad,        // Function for load test
  simulateDegradedNode,    // Function for degradation
  simulateFailover,        // Function for failover
  clearScenario,           // Function to reset
}
```

**Metric Updates:**
```typescript
setInterval(() => {
  // For each node:
  // 1. Get base metrics from generateBaseNodes()
  // 2. Apply random variance (±3-5%)
  // 3. Check if scenario is active
  // 4. Apply scenario effects (spikes, failures, etc.)
  // 5. Update state
}, 1500) // Every 1.5 seconds
```

**Scenario Effects:**
```typescript
// HIGH-LOAD scenario
if (scenario.type === 'high-load') {
  cpuVariance = 15 + Math.random() * 20  // CPU spike
  dspVariance = 20 + Math.random() * 15  // DSP spike
  xruns = Math.min(xruns + 1, 10)        // Audio artifacts
}

// NODE-FAILURE scenario
if (scenario.type === 'node-failure') {
  status = 'OFFLINE'
  health = 0
  cpu = 0
  memory = 0
}

// etc.
```

---

## 🎓 Educational Value

### Learning Through Simulation:

**Scenario 1: High Load**
- User sees cluster under stress
- Notices CPU hitting 80%+
- Observes DSP load climbing
- Learns: "How does cluster handle peak load?"

**Scenario 2: Degraded Node**
- Watch node slowly become unhealthy
- See health_score drop to 30-50%
- Watch XRUNs accumulate
- Learn: "What does a sick node look like?"

**Scenario 3: Node Failure**
- See node go OFFLINE instantly
- Observe impact on overall health
- Watch failover happen
- Learn: "How does failover work?"

**Scenario 4: Failover**
- Primary node struggles
- Flows switch to standby
- New node takes over
- Learn: "Seamless redundancy in action"

---

## 🚀 Usage Patterns

### For Cluster Operators:
1. Open **Overview** tab
2. Toggle **Simulation Mode** ON
3. Click **Simulate High Load** to see behavior under stress
4. Watch **Topology Graph** update in real-time
5. See how **Stat Cards** change
6. Understand cluster capacity limits

### For Training New Team Members:
1. Open **Overview** tab
2. Explain real topology in **Topology Graph**
3. Enable **Simulation Mode**
4. Walk through each scenario
5. Discuss what each indicator means
6. Use **Learn** tab for theory

### For Demos:
1. Start with normal cluster (**real data**)
2. Explain topology and services
3. Enable **Simulation Mode** for scenarios
4. Show failover in action
5. Back to real data to show contrast

---

## 📊 Metrics Displayed

### In Topology Graph (Real-Time):

**Per Node:**
- Health Score (0-100, color-coded)
- CPU Usage %
- RAM Usage % (used/total GB)
- Status (Online/Degraded/Offline)
- Role (Management/Audio/Standby)

**Per Connection:**
- Latency (ms)
- Connection Status (animated if active)
- Quality (green < 10ms, yellow < 50ms, red > 50ms)

### In Overview Tab:

**Aggregate Cluster Metrics:**
- Overall Health Score
- Node Count (online/total)
- Average CPU %
- Average Memory %
- Average DSP Load %
- Maximum Latency

---

## ✨ Performance Optimizations

**React Flow Optimization:**
- Memoized node calculations
- Efficient edge updates
- MiniMap for large clusters
- Hardware acceleration via SVG

**Simulation Optimization:**
- Timer-based updates (1.5 sec intervals)
- State-based scenario application
- Auto-cleanup of old data
- Minimal re-renders

**Data Flow:**
- React Query caching (prevents redundant calls)
- Stale-time: 5-15 seconds (balanced freshness)
- Auto-refetch on focus
- Request cancellation on unmount

---

## 🔮 Future Enhancements

### Phase 2:
- [ ] Drag-and-drop flow reassignment
- [ ] Cluster growth simulation (add nodes)
- [ ] Cluster shrink simulation (remove nodes)
- [ ] Network partition simulation

### Phase 3:
- [ ] Custom scenario builder
- [ ] Stress testing automation
- [ ] Metric recording/playback
- [ ] Comparative analysis mode

### Phase 4:
- [ ] ML-based anomaly detection
- [ ] Predictive failover
- [ ] Auto-remediation suggestions
- [ ] Performance benchmarking

---

## 📚 Integration Examples

### Using Real Cluster Data:

```typescript
// ClusterOverviewTabEnhanced automatically switches
if (simulationMode) {
  nodes = simulation.nodes  // Simulated 5-node cluster
} else {
  nodes = realClusterData   // From /api/cluster/nodes
}

// Same TopologyGraph works with both!
<TopologyGraph nodes={nodes} />
```

### Monitoring Real Failover:

```
1. Watch real cluster in Overview
2. Trigger real failover on management node
3. See flows switch in real-time
4. Observe latency/health changes
5. Watch flow reassignment in Flows tab
```

---

## 🎉 Summary

The **advanced cluster dashboard** now provides:

✅ **Interactive Topology Graph**
- Real-time cluster visualization
- Live metrics on each node
- Connection health monitoring
- Responsive React Flow interface

✅ **Full 5-Node Simulation**
- Realistic baseline metrics
- 4 failure scenarios
- Dynamic metric updates
- Educational demonstrations

✅ **Unified Interface**
- Seamless switch between real/simulated data
- Same UI components for both modes
- Live learning environment
- Professional monitoring tool

✅ **Deep Integration**
- Real REST API data
- WebSocket live events
- React Query caching
- Production-ready code

---

**The dashboard is now a complete learning and monitoring solution! 🚀**

---

**Built with ❤️ for MAP2 Audio Platform**
**February 6, 2026**

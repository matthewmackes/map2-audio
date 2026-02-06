# 🌐 Multi-Node Grid Architecture - World-Class Distributed Audio Processing

**Date:** February 5, 2026  
**Version:** 2.0 (NetJACK-free, Management-Centric)  
**Status:** Architectural Design & Implementation Plan

---

## 🎯 Quick Reference

### **What This Architecture Provides**

✅ **Complete flows per node** - Each audio node runs entire chains independently (no inter-node audio routing)  
✅ **Centralized management** - Control all nodes from single `/grid` web interface on management node  
✅ **Manual flow assignment** - User-directed placement with data-driven insights and capacity visualization  
✅ **Redundancy & failover** - Run flows on multiple nodes with < 2 second automatic failover  
✅ **Node capacity display** - See available CPU, RAM, GPU per node to guide assignments  
✅ **Zero configuration** - Automatic node discovery via mDNS, instant cluster formation  
✅ **Real-time monitoring** - Live cluster metrics, node status, flow assignments in web UI  

### **Key Architectural Decisions**

🚫 **NO NetJACK2** - Eliminated inter-node audio routing complexity  
✅ **HTTP/WebSocket** - Management node communicates with audio nodes via REST APIs  
✅ **Event Bus** - State synchronization (parameters, MIDI) across redundant flows  
✅ **Single Pane of Glass** - All cluster control from management node's web interface  
✅ **Per-Node JACK** - Each audio node uses local JACK for audio I/O (no network audio)  

### **Management Node Responsibilities**

- 🌐 Host `/grid` web interface (cluster dashboard)
- 🧠 Run FlowOrchestrator service (assignment logic)
- 📊 Aggregate metrics from all audio nodes
- 🔄 Trigger failover on node failures
- 💾 Store cluster configuration and history
- 📡 Broadcast events to UI via WebSocket

### **Audio Node Responsibilities**

- 🎵 Execute assigned flows (complete chains)
- 📈 Report metrics to management node (CPU, latency)
- 🔊 Local JACK audio I/O
- 🔌 Load/unload plugins via remote API calls
- 💓 Send heartbeat to management node
- 🔄 Promote standby flows to active on failover

---

## 📋 Executive Summary

This document outlines a comprehensive world-class architecture for extending the MAP2 Grid Flow interface (`/grid`) to support **distributed multi-node audio processing**. The design enables multiple audio nodes to execute independent flows while maintaining real-time performance, state coherency, and an intuitive user experience through centralized management.

### Core Innovation

Transform the current single-node Grid Flow interface into a **distributed audio cluster** where:
- **Complete flows execute on dedicated audio nodes** (no inter-node audio routing)
- **Flows are assigned to optimal nodes** (based on CPU, GPU, specialized hardware availability)
- **Redundant flows** can run on multiple nodes for failover protection
- **MIDI, parameters, and state** synchronize seamlessly across the cluster
- **Single management interface** provides unified control of all nodes
- **Users manage the entire cluster** from any node's web interface

---

## 🎯 Vision & Goals

### Primary Objectives

1. **Distributed Flow Execution**: Enable multiple flows to run on different audio nodes simultaneously
2. **Centralized Management**: Single web interface to control all nodes from the management node
3. **Intelligent Flow Assignment**: Automatically assign flows to nodes with optimal resources (CPU, RAM, GPU)
4. **Redundancy & Failover**: Run critical flows on multiple nodes with automatic failover
5. **Unified Experience**: Users see all nodes and flows in one interface, regardless of physical location
6. **Zero-Configuration**: Automatic node discovery via mDNS, instant cluster formation

### World-Class Inspirations

- **Kubernetes**: Container orchestration with centralized control plane
- **Proxmox VE**: Cluster management with single web interface
- **Apache Kafka**: Distributed event streaming with broker coordination
- **HashiCorp Nomad**: Workload orchestration across multiple nodes
- **ProPresenter**: Multi-screen display system with centralized control

---

## 🏗️ Current Architecture Analysis

### Existing Grid Flow System

The `/grid` interface currently provides:

```
┌─────────────────────────────────────────────────────────────┐
│                    GRID FLOW INTERFACE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  FLOW SLOTS (2-6 flows)                                     │
│  ├─ FlowSlot { id, chainId, label, color, muted, solo }    │
│  ├─ Each flow references a Chain (from /api/chains)        │
│  └─ Routing Config (parallel_blend, ab_switch, series)     │
│                                                              │
│  JUCE CHAINS (per flow)                                     │
│  ├─ Linear plugin chain (INPUT → P1 → P2 → ... → OUTPUT)   │
│  ├─ Plugins: LV2 + Native JUCE processors                  │
│  ├─ Parameters: Real-time control via knobs                │
│  ├─ MIDI Learn: CC → Parameter mapping                     │
│  └─ Automation: Timeline-based parameter automation        │
│                                                              │
│  SIGNAL ROUTING MODES                                       │
│  ├─ series: Flow A → Flow B → Flow C                       │
│  ├─ parallel_blend: Mix multiple flows                     │
│  ├─ ab_switch: Hard switch between flows                   │
│  ├─ parameter_morph: Crossfade parameters                  │
│  └─ sidechain: Routing for dynamics processing             │
│                                                              │
│  AUDIO I/O                                                  │
│  ├─ Input ports (JACK)                                     │
│  ├─ Output ports (JACK)                                    │
│  ├─ Per-plugin VU metering                                 │
│  └─ Master latency reporting                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              BACKEND (Python + JUCE C++)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Map2AudioEngine (C++)                                       │
│  ├─ JucePluginHost: Load/unload plugins                    │
│  ├─ JuceAudioGraph: Signal routing with PDC                │
│  ├─ Chain management: Add, remove, reorder                 │
│  ├─ Parallel groups: A/B routing with blend                │
│  └─ Sidechain connections                                  │
│                                                              │
│  ChainService (Python)                                       │
│  ├─ CRUD operations on chains                              │
│  ├─ SQLite persistence                                     │
│  └─ WebSocket events for real-time sync                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Current Limitations

1. **Single Node Only**: All processing happens on one machine
2. **CPU Bottleneck**: Limited by single node's CPU cores
3. **No Load Distribution**: Can't offload heavy plugins to other nodes
4. **Fixed Topology**: Can't adapt to available cluster resources
5. **No Redundancy**: Single point of failure

---

## 🌟 Multi-Node Architecture Design

### Conceptual Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               MANAGEMENT NODE - Web Interface (/grid)                        │
│                    http://management-node:8080/grid                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  CLUSTER DASHBOARD                                                           │
│  ├─ Node Status Panel (all nodes visible)                                   │
│  ├─ Flow Assignment Matrix                                                  │
│  ├─ Aggregate Metrics (total CPU, flows, latency)                           │
│  └─ Quick Actions (assign, failover, rebalance)                             │
│                                                                              │
│  FLOW MANAGEMENT                                                             │
│  ├─ Flow A → Node 1 (Primary) + Node 2 (Standby)                           │
│  ├─ Flow B → Node 3 (Primary)                                               │
│  ├─ Flow C → Node 1 (Primary)                                               │
│  └─ Flow D → Node 2 (Primary) + Node 3 (Standby)                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
                      ┌─────────────────────────┐
                      │  FLOW ORCHESTRATOR      │
                      │  (Management Node)      │
                      ├─────────────────────────┤
                      │ • Assignment logic      │
                      │ • Health monitoring     │
                      │ • Failover coordinator  │
                      │ • State synchronization │
                      └─────────────────────────┘
                                    ↓
              ┌─────────────────────┼─────────────────────┐
              ↓                     ↓                     ↓
    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
    │  AUDIO NODE 1   │   │  AUDIO NODE 2   │   │  AUDIO NODE 3   │
    ├─────────────────┤   ├─────────────────┤   ├─────────────────┤
    │ Role: AUDIO     │   │ Role: AUDIO     │   │ Role: AUDIO     │
    │ Status: ONLINE  │   │ Status: ONLINE  │   │ Status: ONLINE  │
    ├─────────────────┤   ├─────────────────┤   ├─────────────────┤
    │ ASSIGNED FLOWS: │   │ ASSIGNED FLOWS: │   │ ASSIGNED FLOWS: │
    │                 │   │                 │   │                 │
    │ • Flow A (PRI)  │   │ • Flow A (STB)  │   │ • Flow B (PRI)  │
    │   ├─ Chain 1    │   │   ├─ Chain 1    │   │   ├─ Chain 2    │
    │   └─ Active     │   │   └─ Standby    │   │   └─ Active     │
    │                 │   │                 │   │                 │
    │ • Flow C (PRI)  │   │ • Flow D (PRI)  │   │ • Flow D (STB)  │
    │   ├─ Chain 3    │   │   ├─ Chain 4    │   │   ├─ Chain 4    │
    │   └─ Active     │   │   └─ Active     │   │   └─ Standby    │
    │                 │   │                 │   │                 │
    │ Physical I/O:   │   │ Physical I/O:   │   │ Physical I/O:   │
    │ ├─ Input: JACK  │   │ ├─ Input: JACK  │   │ ├─ Input: JACK  │
    │ └─ Output: JACK │   │ └─ Output: JACK │   │ └─ Output: JACK │
    │                 │   │                 │   │                 │
    │ Resources:      │   │ Resources:      │   │ Resources:      │
    │ CPU: 42%        │   │ CPU: 68%        │   │ CPU: 35%        │
    │ RAM: 8GB/16GB   │   │ RAM: 10GB/12GB  │   │ RAM: 4GB/16GB   │
    │ GPU: RTX 4090   │   │ GPU: None       │   │ GPU: M2 Ultra   │
    └─────────────────┘   └─────────────────┘   └─────────────────┘
  assignedNodeId: string | null      // Primary node executing this flow
  redundancy: FlowRedundancy | null  // Failover configuration
  nodeMetrics: FlowNodeMetrics       // Per-node execution stats
  assignmentStrategy: AssignmentStrategy
}

interface FlowRedundancy {
  enabled: boolean
  standbyNodeIds: string[]        // Nodes running standby copies
  failoverMode: 'automatic' | 'manual'
  activeNodeId: string            // Currently active node
  lastFailoverTime: number | null
}

interface FlowNodeMetrics {
  primaryNode: {
    nodeId: string
    cpuPercent: number
    latencyMs: number
    isActive: boolean
  }
  standbyNodes: Array<{
    nodeId: string
    cpuPercent: number
    latencyMs: number
    isReady: boolean
  }>
}

type AssignmentStrategy = 
  | 'manual'         // User explicitly assigns to node
  | 'pinned'         // Fixed to specific node (never move)
```

### 2. **Flow Orchestrator Service**

New backend service running on the **management node** to manage distributed flows:

```python
# app/services/flow_orchestrator.py

from typing import List, Dict, Optional
from dataclasses import dataclass
from .cluster import ClusterManager, ClusterNode

@dataclass
class FlowAssignment:
    """Complete flow assignment to a node"""
    flow_id: str
    chain_id: int
    assigned_node_id: str
    assignment_type: str  # 'primary' or 'standby'
    reason: str           # Why this node was chosen

@dataclass
class PluginPlacement:
    """Decision about where to run a plugin"""
    plugin_uri: str
    node_id: str
    position_in_chain: int
    reason: str  # Why this node was chosen
    
@dataclass
class FlowDeployment:
    """Complete description of flow deployment across nodes"""
    flow_id: str
    chain_id: int
    primary_assignment: FlowAssignment
    standby_assignments: List[FlowAssignment]
    is_deployed: bool
    deployment_timestamp: float

class FlowOrchestrator:
    """
    Manages distributed execution of flows across cluster nodes.
    Runs on the MANAGEMENT node and controls all AUDIO nodes.
    """
    
    def __init__(self, cluster_manager: ClusterManager):
        self.cluster = cluster_manager
        self.active_deployments: Dict[str, FlowDeployment] = {}
        self.node_flow_map: Dict[str, List[str]] = {}  # node_id -> [flow_ids]
        
    async def assign_flow_to_node(
        self,
        flow: FlowSlot,
        chain: Chain,
        strategy: AssignmentStrategy,
        redundancy_enabled: bool = False
    ) -> FlowDeployment:
        """
        Assign complete flow to optimal node(s)
        
        Factors:
        - Node current CPU/GPU load
        - Chain complexity and requirements
        - Redundancy requirements
        - Node capabilities (GPU, memory, etc.)
        - User preferences (pinning)
        """
        available_nodes = self.cluster.get_online_audio_nodes()
        
        if strategy == 'automatic':
            primary_node = await self._smart_node_selection(chain, available_nodes)
        elif strategy == 'cpu_balanced':
            primary_node = await self._cpu_balanced_selection(available_nodes)
        elif strategy == 'gpu_required':
            primary_node = await self._gpu_node_selection(available_nodes)
        elif strategy == 'manual':
            primary_node = await self._get_manually_assigned_node(flow)
        else:
            primary_node = available_nodes[0]  # Default to first available
    
    async def _smart_node_selection(
        self,
        chain: Chain,
        nodes: List[ClusterNode]
    ) -> ClusterNode:
        """
        Intelligent node selection considering all factors:
        1. Chain complexity and CPU requirements
        2. GPU requirements for ML plugins
        3. Available memory for large plugins
        4. Current node load
        5. Node capabilities
        """
        # Analyze chain requirements
        chain_analysis = await self._analyze_chain_requirements(chain)
        
        # Score each node
        node_scores = []
        for node in nodes:
            score = self._calculate_node_score_for_chain(
                node=node,
                chain_analysis=chain_analysis
            )
            node_scores.append((node, score))
        
        # Pick best node
        best_node, best_score = max(node_scores, key=lambda x: x[1])
        
        logger.info(f"Selected node {best_node.node_id} for chain (score: {best_score:.2f})")
        return best_node
    
    async def _analyze_chain_requirements(self, chain: Chain) -> Dict:
        """
        Analyze chain to determine resource requirements
        """
        requires_gpu = False
        estimated_cpu_percent = 0
        estimated_memory_mb = 0
        
        for plugin in chain.plugins:
            meta = await self._get_plugin_metadata(plugin.uri)
            if meta:
                requires_gpu = requires_gpu or meta.get('requires_gpu', False)
                estimated_cpu_percent += meta.get('estimated_cpu_percent', 5)
                estimated_memory_mb += meta.get('estimated_memory_mb', 100)
        
        return {
            'requires_gpu': requires_gpu,
            'estimated_cpu_percent': min(estimated_cpu_percent, 95),
            'estimated_memory_mb': estimated_memory_mb,
            'plugin_count': len(chain.plugins)
        }
    
    def _calculate_node_score_for_chain(
        self,
        node: ClusterNode,
        chain_analysis: Dict
    ) -> float:
        """
        Score node suitability for entire chain:
        Score = (
            cpu_availability * 40 +
            gpu_compatibility * 30 +
            memory_availability * 20 +
            load_balance * 10
        )
        """
        score = 0.0
        
        # CPU availability (0-40 points)
        cpu_available = 100 - node.metadata.cpu_usage_percent
        cpu_required = chain_analysis['estimated_cpu_percent']
        if cpu_available >= cpu_required + 20:  # 20% headroom
            score += 40
        elif cpu_available >= cpu_required:
            score += 30
        elif cpu_available >= cpu_required - 10:
            score += 15
        else:
            score -= 50  # Insufficient CPU
        
        # GPU compatibility (0-30 points)
        if chain_analysis['requires_gpu']:
            if node.metadata.has_gpu:
                score += 30
            else:
                score -= 100  # Critical failure if GPU required but not available
        elif node.metadata.has_gpu:
            score += 10  # Bonus for GPU available even if not required
        
        # Memory availability (0-20 points)
        mem_available_mb = node.metadata.memory_available_gb * 1024
        mem_required_mb = chain_analysis['estimated_memory_mb']
        if mem_available_mb > mem_required_mb * 2:
            score += 20
        elif mem_available_mb > mem_required_mb * 1.5:
            score += 15
        elif mem_available_mb > mem_required_mb:
            score += 10
        else:
            score -= 40  # Insufficient memory
        
        # Load balance (0-10 points)
        # Prefer nodes with fewer flows already assigned
        flows_on_node = len(self.node_flow_map.get(node.node_id, []))
        if flows_on_node == 0:
            score += 10
        elif flows_on_node <= 2:
            score += 5
        else:
            score += max(0, 10 - flows_on_node * 2)
        
        return score
        # Select standby nodes if redundancy enabled
        standby_assignments = []
        if redundancy_enabled:
            standby_nodes = await self._select_standby_nodes(
                primary_node,
                available_nodes,
                count=2
            )
            for standby_node in standby_nodes:
                standby_assignments.append(FlowAssignment(
                    flow_id=flow.id,
                    chain_id=chain.id,
                    assigned_node_id=standby_node.node_id,
                    assignment_type='standby',
                    reason='Redundancy failover'
                ))
        
        primary_assignment = FlowAssignment(
            flow_id=flow.id,
            chain_id=chain.id,
            assigned_node_id=primary_node.node_id,
            assignment_type='primary',
            reason=f'{strategy} strategy'
        )
        
        return FlowDeployment(
            flow_id=flow.id,
            chain_id=chain.id,
            primary_assignment=primary_assignment,
            standby_assignments=standby_assignments,
            is_deployed=False,
            deployment_timestamp=time.time()
        )
    
    async def deploy_flow(
        self,
        deployment: FlowDeployment,
        chain: Chain
    ) -> bool:
        """
        Deploy flow to assigned node(s) via HTTP API:
        1. Send chain configuration to primary node
        2. Load plugins on primary node
        3. Start audio processing
        4. If redundancy enabled, deploy to standby nodes
        5. Monitor deployment status
        """
        try:
            # Deploy to primary node
            primary_success = await self._deploy_to_node(
                node_id=deployment.primary_assignment.assigned_node_id,
                chain=chain,
                mode='active'
            )
            
            if not primary_success:
                logger.error(f"Failed to deploy flow {deployment.flow_id} to primary node")
                return False
            
            # Deploy to standby nodes
            for standby in deployment.standby_assignments:
                await self._deploy_to_node(
                    node_id=standby.assigned_node_id,
                    chain=chain,
                    mode='standby'
                )
            
            # Track deployment
            deployment.is_deployed = True
            self.active_deployments[deployment.flow_id] = deployment
            
            # Update node->flow mapping
            if deployment.primary_assignment.assigned_node_id not in self.node_flow_map:
                self.node_flow_map[deployment.primary_assignment.assigned_node_id] = []
            self.node_flow_map[deployment.primary_assignment.assigned_node_id].append(deployment.flow_id)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to deploy flow: {e}")
            await self._rollback_deployment(deployment)
            return False
    
    async def _deploy_to_node(
        self,
        node_id: str,
        chain: Chain,
        mode: str
    ) -> bool:
        """
        Deploy chain to specific node via HTTP API
        """
        node = self.cluster.get_node(node_id)
        if not node:
            return False
        
        # Send chain configuration to node's API
        # POST http://<node>:8080/api/chains/deploy
        url = f"http://{node.hostname}:8080/api/chains/deploy"
        payload = {
            'chain_id': chain.id,
            'chain_name': chain.name,
            'plugins': [
                {
                    'uri': p.uri,
                    'position': idx,
                    'bypassed': p.bypassed or False,
                    'parameters': p.parameters or {}
                }
                for idx, p in enumerate(chain.plugins)
            ],
            'mode': mode,  # 'active' or 'standby'
            'activate': (mode == 'active')
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as resp:
                if resp.status == 200:
                    logger.info(f"Deployed chain {chain.id} to {node_id} ({mode})")
                    return True
                else:
                    logger.error(f"Failed to deploy to {node_id}: {resp.status}")
                    return False
```

### 3. **Management Node API Extensions**

Extend the management node's FastAPI to expose cluster-wide flow control:

```python
# app/api/cluster_flows.py

from fastapi import APIRouter, HTTPException
from typing import List
from ..services.flow_orchestrator import FlowOrchestrator
from ..services.cluster import ClusterManager

router = APIRouter(prefix='/api/cluster/flows', tags=['cluster-flows'])

@router.get('/assignments')
async def get_flow_assignments():
    """
    Get all current flow-to-node assignments
    
    Returns:
    {
      "assignments": [
        {
          "flow_id": "flow-0",
          "flow_label": "A",
          "chain_id": 1,
          "chain_name": "Guitar Rig",
          "primary_node_id": "AUDIO-NODE-A1B2",
          "primary_node_name": "audio-01",
          "standby_nodes": [
            {
              "node_id": "AUDIO-NODE-X9Y8",
              "node_name": "audio-02",
              "is_ready": true
            }
          ],
          "status": "active",
          "cpu_percent": 42,
          "latency_ms": 3.2
        }
      ],
      "total_flows": 4,
      "total_nodes": 3
    }
    """
    orchestrator = FlowOrchestrator.get_instance()
    assignments = []
    
    for flow_id, deployment in orchestrator.active_deployments.items():
        # Get flow details
        flow = await get_flow_by_id(flow_id)
        chain = await get_chain_by_id(deployment.chain_id)
        
        # Get node metrics
        primary_metrics = await orchestrator.get_flow_metrics(
            deployment.primary_assignment.assigned_node_id,
            flow_id
        )
        
        assignments.append({
            'flow_id': flow_id,
            'flow_label': flow.label,
            'chain_id': deployment.chain_id,
            'chain_name': chain.name,
            'primary_node_id': deployment.primary_assignment.assigned_node_id,
            'primary_node_name': await get_node_hostname(deployment.primary_assignment.assigned_node_id),
            'standby_nodes': [
                {
                    'node_id': standby.assigned_node_id,
                    'node_name': await get_node_hostname(standby.assigned_node_id),
                    'is_ready': await check_standby_ready(standby.assigned_node_id, flow_id)
                }
                for standby in deployment.standby_assignments
            ],
            'status': 'active' if deployment.is_deployed else 'deploying',
            'cpu_percent': primary_metrics.get('cpu_percent', 0),
            'latency_ms': primary_metrics.get('latency_ms', 0)
        })
    
    return {
        'assignments': assignments,
        'total_flows': len(assignments),
        'total_nodes': len(orchestrator.cluster.get_online_audio_nodes())
    }

@router.post('/assign')
async def assign_flow_to_node(
    flow_id: str,
    node_id: str,
    redundancy_enabled: bool = False
):
    """
    Manually assign flow to specific node
    
    Request:
    {
      "flow_id": "flow-0",
      "node_id": "AUDIO-NODE-A1B2",
      "redundancy_enabled": true
    }
    """
    orchestrator = FlowOrchestrator.get_instance()
    flow = await get_flow_by_id(flow_id)
    chain = await get_chain_by_id(flow.chainId)
    
    # Create manual assignment
    deployment = await orchestrator.assign_flow_to_node(
        flow=flow,
        chain=chain,
        strategy='manual',
        redundancy_enabled=redundancy_enabled
    )
    
    # Deploy
    success = await orchestrator.deploy_flow(deployment, chain)
    
    if success:
        return {'status': 'deployed', 'deployment': deployment}
    else:
        raise HTTPException(status_code=500, detail='Deployment failed')

@router.post('/failover')
async def trigger_failover(flow_id: str):
    """
    Manually trigger failover to standby node
    """
    orchestrator = FlowOrchestrator.get_instance()
    success = await orchestrator.failover_flow(flow_id)
    
    if success:
        return {'status': 'failed_over', 'flow_id': flow_id}
    else:
        raise HTTPException(status_code=500, detail='Failover failed')

@router.get('/cluster/nodes')
async def get_cluster_nodes():
    """
    Get all cluster nodes with current load and assigned flows
    
    Returns:
    {
      "nodes": [
        {
          "node_id": "AUDIO-NODE-A1B2",
          "hostname": "audio-01",
          "role": "AUDIO_NODE",
          "status": "ONLINE",
          "cpu_percent": 42,
          "memory_used_gb": 8,
          "memory_total_gb": 16,
          "has_gpu": true,
          "gpu_name": "NVIDIA RTX 4090",
          "assigned_flows": [
            {"flow_id": "flow-0", "type": "primary"},
            {"flow_id": "flow-2", "type": "primary"}
          ],
          "flow_count": 2,
          "latency_to_mgmt_ms": 1.2
        }
      ]
    }
    """
    cluster_mgr = ClusterManager.get_instance()
    orchestrator = FlowOrchestrator.get_instance()
    
    nodes = []
    for node in cluster_mgr.get_all_audio_nodes():
        assigned_flows = []
        
        # Find flows assigned to this node
        for flow_id, deployment in orchestrator.active_deployments.items():
            if deployment.primary_assignment.assigned_node_id == node.node_id:
                assigned_flows.append({'flow_id': flow_id, 'type': 'primary'})
            
            for standby in deployment.standby_assignments:
                if standby.assigned_node_id == node.node_id:
                    assigned_flows.append({'flow_id': flow_id, 'type': 'standby'})
        
        nodes.append({
            'node_id': node.node_id,
            'hostname': node.hostname,
            'role': node.role.value,
            'status': node.status.value,
            'cpu_percent': node.metadata.cpu_usage_percent,
            'memory_used_gb': node.metadata.memory_total_gb - node.metadata.memory_available_gb,
            'memory_total_gb': node.metadata.memory_total_gb,
            'has_gpu': node.metadata.has_gpu,
            'gpu_name': node.metadata.gpu_name if node.metadata.has_gpu else None,
            'assigned_flows': assigned_flows,
            'flow_count': len(assigned_flows),
            'latency_to_mgmt_ms': node.latency_ms
        })
    
    return {'nodes': nodes}
```

### 4. **Shared State Synchronization**

Extend the existing cluster event bus for real-time state sync:

```python
# app/services/flow_state_sync.py

from .cluster.event_bus import ClusterEventBus
from typing import Dict, Any

class FlowStateSync:
    """
    Synchronizes flow/chain/parameter state across all nodes
    """
    
    def __init__(self, event_bus: ClusterEventBus):
        self.bus = event_bus
        self.state_cache: Dict[str, Any] = {}
        
        # Subscribe to relevant events
        self.bus.subscribe('PARAMETER_CHANGE', self._on_parameter_change)
        self.bus.subscribe('PLUGIN_LOADED', self._on_plugin_loaded)
        self.bus.subscribe('PLUGIN_BYPASSED', self._on_plugin_bypassed)
        self.bus.subscribe('CHAIN_REORDERED', self._on_chain_reordered)
        self.bus.subscribe('MIDI_EVENT', self._on_midi_event)
    
    async def broadcast_parameter_change(
        self,
        plugin_uri: str,
        param_symbol: str,
        value: float,
        source_node: str
    ):
        """
        Broadcast parameter change to all nodes hosting this plugin
        """
        event = {
            'type': 'PARAMETER_CHANGE',
            'plugin_uri': plugin_uri,
            'param_symbol': param_symbol,
            'value': value,
            'source_node': source_node,
            'timestamp': time.time()
        }
        
        # Broadcast to cluster
        await self.bus.publish(event)
        
        # Update local cache
        self.state_cache[f"{plugin_uri}:{param_symbol}"] = value
    
    async def sync_chain_state(
        self,
        chain_id: int,
        target_nodes: List[str]
    ):
        """
        Ensure all nodes have consistent chain state
        """
        # Get canonical state from DB
        chain = await chain_service.get_chain(chain_id)
        
        # Send full state to each node
        for node_id in target_nodes:
            await self._send_chain_state_to_node(node_id, chain)
```

### 5. **Grid Flow Web Interface Enhancements**

The `/grid` interface on the **management node** shows all cluster nodes and flow assignments.

#### 5.1 **Cluster Dashboard Panel** (New Component)

```typescript
// web/src/app/components/GridFlow/ClusterDashboard.tsx

import { useQuery } from '@tanstack/react-query'
import { clusterFlowsApi } from '../../api'

interface ClusterNode {
  node_id: string
  hostname: string
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED'
  cpu_percent: number
  memory_used_gb: number
  memory_total_gb: number
  has_gpu: boolean
  gpu_name: string | null
  assigned_flows: Array<{ flow_id: string; type: 'primary' | 'standby' }>
  flow_count: number
  latency_to_mgmt_ms: number
}

export function ClusterDashboard() {
  const { data: nodesData } = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: () => clusterFlowsApi.getClusterNodes(),
    refetchInterval: 2000  // Update every 2 seconds
  })
  
  const nodes = nodesData?.nodes || []
  
  return (
    <div className="cluster-dashboard">
      <div className="cluster-dashboard-header">
        <h3>🌐 Cluster Nodes ({nodes.length})</h3>
        <button className="cluster-dashboard-refresh">
          <RefreshCw size={16} />
        </button>
      </div>
      
      <div className="cluster-nodes-grid">
        {nodes.map(node => (
          <ClusterNodeCard
            key={node.node_id}
            node={node}
            onClick={() => handleNodeClick(node.node_id)}
          />
        ))}
      </div>
    </div>
  )
}

function ClusterNodeCard({ node, onClick }: { node: ClusterNode; onClick: () => void }) {
  const statusColor = {
    'ONLINE': '#22c55e',
    'OFFLINE': '#ef4444',
    'DEGRADED': '#f59e0b'
  }[node.status]
  
  const cpuBarColor = node.cpu_percent > 80 ? '#ef4444' : 
                       node.cpu_percent > 60 ? '#f59e0b' : '#22c55e'
  
  return (
    <div 
      className="cluster-node-card"
      onClick={onClick}
      style={{ borderColor: statusColor }}
    >
      {/* Node Header */}
      <div className="cluster-node-header">
        <div className="cluster-node-status" style={{ backgroundColor: statusColor }} />
        <h4>{node.hostname}</h4>
        {node.has_gpu && (
          <span className="cluster-node-gpu-badge" title={node.gpu_name || 'GPU'}>
            🎮
          </span>
        )}
      </div>
      
      {/* Resources */}
      <div className="cluster-node-resources">
        <div className="cluster-resource-row">
          <span className="cluster-resource-label">CPU</span>
          <div className="cluster-resource-bar">
            <div 
              className="cluster-resource-bar-fill"
              style={{ 
                width: `${node.cpu_percent}%`,
                backgroundColor: cpuBarColor
              }}
            />
          </div>
          <span className="cluster-resource-value">{node.cpu_percent}%</span>
        </div>
        
        <div className="cluster-resource-row">
          <span className="cluster-resource-label">RAM</span>
          <div className="cluster-resource-bar">
            <div 
              className="cluster-resource-bar-fill"
              style={{ 
                width: `${(node.memory_used_gb / node.memory_total_gb) * 100}%`,
                backgroundColor: '#3b82f6'
              }}
            />
          </div>
          <span className="cluster-resource-value">
            {node.memory_used_gb.toFixed(1)}/{node.memory_total_gb}GB
          </span>
        </div>
      </div>
      
      {/* Assigned Flows */}
      <div className="cluster-node-flows">
        <div className="cluster-node-flows-header">
          <span>Flows: {node.flow_count}</span>
        </div>
        <div className="cluster-node-flows-list">
          {node.assigned_flows.map(assignment => (
            <div 
              key={assignment.flow_id}
              className={`cluster-flow-badge ${assignment.type}`}
            >
              {getFlowLabel(assignment.flow_id)}
              {assignment.type === 'standby' && <span className="standby-indicator">●</span>}
            </div>
          ))}
        </div>
      </div>
      
      {/* Latency */}
      <div className="cluster-node-footer">
        <Clock size={12} />
        <span>{node.latency_to_mgmt_ms.toFixed(1)}ms</span>
      </div>
    </div>
  )
}
```

#### 5.2 **Flow Assignment Matrix** (New Component)

```typescript
// web/src/app/components/GridFlow/FlowAssignmentMatrix.tsx

export function FlowAssignmentMatrix() {
  const { data: assignmentsData } = useQuery({
    queryKey: ['cluster', 'flow-assignments'],
    queryFn: () => clusterFlowsApi.getFlowAssignments(),
    refetchInterval: 2000
  })
  
  const assignments = assignmentsData?.assignments || []
  
  return (
    <div className="flow-assignment-matrix">
      <table className="assignment-matrix-table">
        <thead>
          <tr>
            <th>Flow</th>
            <th>Chain</th>
            <th>Primary Node</th>
            <th>Standby Nodes</th>
            <th>Status</th>
            <th>CPU</th>
            <th>Latency</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map(assignment => (
            <tr key={assignment.flow_id}>
              <td>
                <div 
                  className="flow-label-badge"
                  style={{ backgroundColor: getFlowColor(assignment.flow_id) }}
                >
                  {assignment.flow_label}
                </div>
              </td>
              <td>{assignment.chain_name}</td>
              <td>
                <div className="node-name-cell">
                  <Server size={14} />
                  {assignment.primary_node_name}
                </div>
              </td>
              <td>
                <div className="standby-nodes-cell">
                  {assignment.standby_nodes.map(standby => (
                    <span 
                      key={standby.node_id}
                      className={`standby-badge ${standby.is_ready ? 'ready' : 'not-ready'}`}
                      title={standby.is_ready ? 'Ready for failover' : 'Not ready'}
                    >
                      {standby.node_name}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <span className={`status-badge ${assignment.status}`}>
                  {assignment.status}
                </span>
              </td>
              <td>{assignment.cpu_percent}%</td>
              <td>{assignment.latency_ms.toFixed(1)}ms</td>
              <td>
                <div className="assignment-actions">
                  <button 
                    className="action-btn"
                    onClick={() => handleReassign(assignment.flow_id)}
                    title="Reassign to different node"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button 
                    className="action-btn"
                    onClick={() => handleFailover(assignment.flow_id)}
                    title="Trigger failover"
                    disabled={assignment.standby_nodes.length === 0}
                  >
                    <AlertTriangle size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 🔗 Integration Points

### 1. **Flow-Per-Node Configuration**

Add per-flow configuration for multi-node features in the management interface:

```typescript
interface FlowOptions {
  // Existing
  muted: boolean
  solo: boolean
  dryWetMix: number
  
  // NEW: Multi-node options
  assignment: {
    strategy: AssignmentStrategy
    pinnedNodeId?: string             // Force flow to specific node
    allowRebalancing: boolean         // Allow automatic rebalancing
    preferredNodes?: string[]         // Whitelist of nodes
    excludedNodes?: string[]          // Blacklist of nodes
  }
  
  redundancy: {
    enabled: boolean
    standbyCount: number              // Number of standby nodes (0-2)
    failoverMode: 'automatic' | 'manual'
    syncInterval: number              // State sync frequency (ms)
  }
  
  requirements: {
    minCpuCores?: number
    minMemoryGb?: number
    requiresGpu?: boolean
    gpuMinVram?: number
  }
}
```

### 2. **Shared Resources Across Nodes**

Enable resource sharing for maximum flexibility:

#### 2.1 **Plugin Library Sync**

```python
# Ensure all nodes have access to the same plugins

class PluginLibrarySync:
    async def sync_plugin_library_across_cluster(self):
        """
        Ensure all nodes have same LV2 plugins installed
        """
        primary_node = self.cluster.get_primary_node()
        all_nodes = self.cluster.get_all_audio_nodes()
        
        # Get plugin list from primary
        primary_plugins = await self._get_installed_plugins(primary_node)
        
        # Compare with each node
        for node in all_nodes:
            if node.node_id == primary_node.node_id:
                continue
            
            node_plugins = await self._get_installed_plugins(node)
            missing = set(primary_plugins) - set(node_plugins)
            
            if missing:
                logger.info(f"Syncing {len(missing)} plugins to {node.hostname}")
                await self._install_plugins(node, missing)
```

#### 2.2 **Preset Sharing**

```python
# Presets are already in SQLite, accessible from all nodes
# Just need to ensure cache coherency

class PresetSync:
    async def broadcast_preset_change(self, preset_id: int):
        """
        Notify all nodes when a preset is created/modified
        """
        await self.event_bus.publish({
            'type': 'PRESET_UPDATED',
            'preset_id': preset_id,
            'timestamp': time.time()
        })
```

#### 2.3 **MIDI Routing**

```python
# MIDI events need to reach the correct node(s)

class MidiRouter:
    async def route_midi_event(
        self,
        event: MidiEvent,
        flow_id: str
    ):
        """
        Route MIDI to nodes hosting plugins for this flow
        """
        topology = self.orchestrator.active_topologies[flow_id]
        
        # Send to all involved nodes
        for node_id in topology.nodes_involved:
            await self._send_midi_to_node(node_id, event)
```

#### 2.4 **Automation Lane Sync**

```python
# Automation data needs to be in sync across nodes

class AutomationSync:
    async def sync_automation_lanes(
        self,
        flow_id: str,
        lanes: List[AutomationLane]
    ):
        """
        Distribute automation data to all nodes in flow
        """
        topology = self.orchestrator.active_topologies[flow_id]
        
        for node_id in topology.nodes_involved:
            await self._upload_automation_to_node(node_id, lanes)
```

---

## 🎨 User Experience Scenarios

### Scenario 1: Manual Flow Assignment with Capacity Display

```
User opens Grid interface and sees cluster:
  Node 1: CPU 20% (available), RAM 12GB/16GB, GPU: RTX 4090
  Node 2: CPU 45% (available), RAM 4GB/12GB, GPU: None
  Node 3: CPU 15% (available), RAM 13GB/16GB, GPU: M2 Ultra

User creates 4 flows and assigns them manually:
  Flow A (Guitar Amp, CPU 30%):        → Node 2 (has available CPU)
  Flow B (Reverb + GPU reverb):        → Node 1 (has RTX 4090 GPU)
  Flow C (Vocal Processing):           → Node 3 (low load)
  Flow D (Mastering Suite, CPU 25%):   → Node 3 (enough capacity)

Result:
  - Load distributed by user judgment
  - Node capacity metrics guide decisions
  - User pins GPU-heavy flows to GPU nodes manually
  - Each flow runs on single node independently
  - User sees unified interface showing all assignments

### Scenario 2: Manual Pinning for Critical Flow

```
User has a mission-critical vocal processing chain:

1. User right-clicks Flow C in Grid interface
2. Selects "Assignment Options..."
3. Dialog opens:
   - Strategy: Manual ✅
   - Pinned to: Node 1 (dropdown selection)
   - Redundancy: Enabled ✅
   - Standby Nodes: Node 2, Node 3
4. Clicks "Apply"

Result:
  - Flow C permanently assigned to Node 1
  - Standby copies running on Node 2 and Node 3
  - If Node 1 fails, automatic failover to Node 2
  - Flow never moved by rebalancing
  - Badge shows "Pinned" in UI
```

### Scenario 3: Automatic Failover

```
Node 2 crashes during live performance:

1. Management node detects missing heartbeat (3 sec timeout)
2. Checks affected flows: Flow A (primary on Node 2)
3. Checks redundancy: Flow A has standby on Node 3
4. Sends failover command to Node 3:
   POST /api/flows/promote-standby
5. Node 3 promotes Flow A from standby to active
6. Node 3 starts audio processing
7. Event bus broadcasts FLOW_FAILOVER
8. UI updates to show Flow A now on Node 3

Audio impact: < 2 second gap, then seamless continuation
User notification: "Flow A failed over to Node 3"
```

---

## 📊 Sharing & Interaction Matrix

### What Can Be Shared?

| Component | Sharing Method | Latency | Use Case |
|-----------|---------------|---------|----------|
| **Plugin State** | Event bus broadcast | < 1ms | Parameter automation synchronized across nodes |
| **MIDI Events** | Event bus multicast | < 1ms | MIDI learn and CC control work cluster-wide |
| **Flow Assignments** | Management node HTTP API | N/A | Orchestrator controls which node runs which flow |
| **Presets** | SQLite replication | N/A | Preset load/save accessible from all nodes |
| **Automation Data** | File sync + event notify | < 100ms | Automation lanes synchronized |
| **Plugin Library** | Package manager sync | Minutes | Cluster-wide plugin install |
| **VU Meters & Metrics** | Event bus (throttled) | < 50ms | Visual feedback from all nodes |
| **CPU/Latency Metrics** | Event bus (1Hz) | 1000ms | Monitoring dashboard, rebalancing decisions |
| **Failover Triggers** | Event bus (urgent) | < 10ms | Immediate failover on node failure |
| **Node Health** | Heartbeat (1Hz) | 1000ms | Cluster health monitoring |

### Interaction Patterns

#### Pattern 1: **Synchronized Parameters Across Redundant Flows**

```
User tweaks knob on Flow A (running on Node 1 + Node 2 standby)
→ Parameter change broadcast via event bus
→ Node 1 (primary) updates plugin instance immediately
→ Node 2 (standby) updates plugin instance immediately
→ All nodes in sync within 1ms
→ If Node 1 fails, Node 2 has identical state and can take over
```

#### Pattern 2: **Flow Assignment From Management Interface**

```
User opens /grid on Management Node
→ Sees all flows and all audio nodes
→ Right-clicks Flow B → "Assign to Node..."
→ Selects Node 3 from dropdown
→ Management node sends HTTP POST /api/cluster/flows/assign
→ Orchestrator validates Node 3 has capacity
→ Orchestrator sends chain configuration to Node 3
→ Node 3 loads plugins and starts processing
→ Node 3 begins reporting metrics back to management node
→ UI updates to show Flow B running on Node 3
```

#### Pattern 3: **Automatic Failover**

```
Node 2 crashes (power failure, kernel panic, etc.)
→ Management node detects missing heartbeat (3 seconds)
→ Marks Node 2 as OFFLINE
→ Finds flows with Node 2 as primary: [Flow D]
→ Checks if Flow D has standby configured: Yes (Node 3)
→ Sends HTTP POST /api/failover to Node 3
→ Node 3 promotes standby Flow D to active
→ Node 3 starts audio processing for Flow D
→ Event bus broadcasts "FLOW_FAILOVER" event
→ UI updates to show Flow D now on Node 3 (primary)
→ Total interruption: < 2 seconds
```

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)

**Goal**: Enable basic multi-node awareness

1. ✅ **Cluster Infrastructure** (already exists)
   - mDNS discovery
   - Node registry
   - Event bus
   - HTTP API for node communication

2. **Flow Orchestrator Service**
   - Create `FlowOrchestrator` class
   - Implement basic assignment algorithms
   - Add deployment planning methods
   - HTTP API for deploying flows to nodes

3. **Management Node API**
   - Create `/api/cluster/flows` endpoints
   - Flow assignment API
   - Node status API
   - Failover trigger API

4. **Data Model Updates**
   - Extend `FlowSlot` for multi-node
   - Add `FlowAssignment` table to DB
   - Create `FlowDeployment` schema
   - Add node assignment tracking

**Deliverable**: Can manually assign 1 flow to any node from management interface

### Phase 2: Management UI Integration (Weeks 4-6)

**Goal**: User can see and control flow assignments from web interface

1. **Cluster Dashboard Component**
   - Display all cluster nodes
   - Real-time node status and metrics
   - Show flows assigned to each node
   - Drag-and-drop flow assignment

2. **Flow Assignment Matrix**
   - Table view of all flow assignments
   - Primary and standby node display
   - Quick actions (reassign, failover)
   - Status indicators

3. **Assignment Dialog**
   - Manual node selection
   - Strategy picker (automatic, CPU balanced, etc.)
   - Redundancy configuration
   - Node requirements (GPU, CPU, RAM)

4. **Real-Time Updates**
   - WebSocket connection to management node
   - Live metrics from all nodes
   - Failover notifications
   - Assignment change animations

**Deliverable**: Full web UI for managing multi-node flows from `/grid`

### Phase 3: Chain Analysis & Profiling (Weeks 7-9)

**Goal**: Profile chains and provide placement insights

1. **Chain Analysis**
   - Measure chain CPU usage during playback
   - Detect GPU requirements from plugins
   - Estimate memory footprint
   - Store analysis in metadata DB

2. **Profiling Data Display**
   - Show estimated resource needs in assignment dialog
   - Display historical CPU usage patterns
   - Highlight GPU-dependent plugins
   - Suggest nodes with sufficient capacity

3. **Manual Assignment Enhancements**
   - Filter nodes by capacity (CPU, GPU, RAM)
   - Show "insufficient resources" warnings
   - Provide node recommendations in UI
   - Simulate assignment impact

**Deliverable**: Profiling data enables informed manual flow assignment

### Phase 4: Redundancy & Advanced Features (Weeks 10-12)

**Goal**: World-class reliability and advanced features

1. **Redundancy & Failover**
   - Flow replication to standby nodes
   - Automatic failover on node failure
   - State synchronization (parameters, MIDI)
   - Graceful degradation

2. **Advanced Management**
   - Node maintenance mode
   - Cluster-wide preset deployment
   - Bulk flow reassignment
   - Performance optimization suggestions

3. **Monitoring & Alerting**
   - Cluster health dashboard
   - Performance graphs and trends
   - Alert system for failures
   - Email/webhook notifications

**Deliverable**: Production-ready multi-node system with redundancy

### Phase 5: Polish & Documentation (Weeks 13-14)

1. **User Documentation**
   - Multi-node setup guide
   - Distribution strategy guide
   - Troubleshooting guide
   - Best practices

2. **Performance Tuning**
   - Benchmark suite
   - Latency optimization
   - Network configuration guide
   - Reference architectures

3. **Testing & Validation**
   - Multi-node test suite
   - Stress testing
   - Failure scenario testing
   - Performance regression tests

**Deliverable**: Complete, documented, tested system

---

## 🎯 Success Metrics

### Performance Targets

- **State Sync Latency**: < 1ms for parameter changes
- **Failover Time**: < 2 seconds (standby to active promotion)
- **Management Overhead**: < 2% CPU on management node
- **Event Bus Latency**: < 5ms for MIDI events
- **Cluster Scaling**: Support up to 10 audio nodes
- **Per-Node Load**: Support 4-6 flows per audio node (@ 48kHz)

### User Experience Targets

- **Setup Time**: < 5 minutes (zero-config auto-discovery)
- **Transparency**: User should rarely think about nodes
- **Flexibility**: Support manual override for power users
- **Reliability**: 99.9% uptime (with redundancy)

---

## 🔬 Research & Best Practices

Based on research into distributed system management:

### Industry Standards

1. **Kubernetes** (Container Orchestration)
   - Centralized control plane
   - Automatic pod placement and scheduling
   - Health monitoring and self-healing
   - **Lesson**: Centralized management simplifies complexity, automatic health checks are essential

2. **Proxmox VE** (Virtualization Cluster)
   - Single web interface for entire cluster
   - Live migration of VMs between nodes
   - Resource pooling and allocation
   - **Lesson**: Users want single pane of glass, live migration is valuable

3. **Apache Kafka** (Distributed Messaging)
   - Broker-based message routing
   - Automatic failover and replication
   - Strong consistency guarantees
   - **Lesson**: Event-driven architecture scales well, replication provides reliability

4. **HashiCorp Nomad** (Workload Orchestration)
   - Automatic task placement
   - Resource-based scheduling
   - Multi-datacenter support
   - **Lesson**: Scoring algorithm for placement works well, flexibility in constraints is valuable

### Key Insights

- **Complete Flows Per Node**: Simpler than splitting chains across nodes
- **State Synchronization**: Critical for redundancy and failover
- **Automatic Placement**: Users appreciate smart defaults but want manual override
- **Visual Feedback**: Show users what's happening (which node runs what)
- **Zero-Config Discovery**: mDNS auto-discovery reduces friction massively
- **Centralized Management**: Single web interface is key to usability

---

## 🛡️ Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Network latency too high | High | Use NetJACK2, QoS, larger buffers if needed |
| State synchronization bugs | High | Extensive testing, immutable state pattern |
| Node failure during performance | Critical | Redundancy mode, automatic failover |
| CPU/GPU mismatch | Medium | Robust plugin profiling, smart placement |
| MIDI timing issues | Medium | Dedicated MIDI event bus, timestamping |

### User Experience Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Too complex for users | High | Default to automatic mode, hide complexity |
| Confusing error messages | Medium | Clear, actionable error dialogs |
| Performance degradation | Medium | Real-time monitoring, automatic optimization |

---

## 📚 References & Further Reading

1. **Kubernetes Architecture**: https://kubernetes.io/docs/concepts/architecture/
2. **Proxmox VE Cluster**: https://pve.proxmox.com/wiki/Cluster_Manager
3. **Apache Kafka**: https://kafka.apache.org/documentation/
4. **HashiCorp Nomad**: https://www.nomadproject.io/docs
5. **JACK Audio Connection Kit**: https://jackaudio.org (local audio routing per node)
6. **JUCE Framework**: https://juce.com (especially `AudioProcessorGraph`)
7. **LV2 Plugin Specification**: https://lv2plug.in
8. **mDNS/Avahi**: https://avahi.org
9. **FastAPI**: https://fastapi.tiangolo.com (Python async web framework)
10. **WebSocket Protocol**: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

---

## 🎬 Conclusion

This architecture transforms the MAP2 Grid Flow interface into a **world-class distributed audio platform** managed from a single web interface. By leveraging:

### ✅ **Complete Flows Per Node**
- Each audio node runs complete, independent chains
- No inter-node audio routing complexity
- Simple, reliable architecture
- Each node operates autonomously

### 🏛️ **Centralized Management**
- Single `/grid` interface on management node
- Control all audio nodes from one location
- Real-time visibility into entire cluster
- Unified user experience

### 🤖 **Manual Flow Assignment with Insights**
- Manual flow assignment to specific nodes
- Chain profiling data to guide placement decisions
- Node capacity display (available CPU, GPU, RAM)
- User controls all flow assignments

### 🔄 **Redundancy & Failover**
- Standby flows on multiple nodes
- Automatic failover on node failure
- State synchronization across redundant flows
- < 2 second recovery time

### 🌐 **Seamless Integration**
- Existing cluster infrastructure (mDNS, event bus)
- HTTP/WebSocket for inter-node communication
- SQLite for shared presets and metadata
- Standard JACK audio on each node locally

We enable users to **scale their audio processing across multiple machines** while maintaining the simplicity and elegance of the single-node experience. The management node provides a **single pane of glass** for the entire cluster.

**Next Steps**: Begin Phase 1 implementation with Flow Orchestrator and Management Node API extensions.

---

## 📊 Management Node Exposure Summary

### **How Components Are Exposed at Management Node**

#### 🔧 **API Endpoints** (FastAPI on Management Node)

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/api/cluster/flows/assignments` | GET | List all flow-to-node assignments | Flow assignment details |
| `/api/cluster/flows/assign` | POST | Manually assign flow to node | Deployment status |
| `/api/cluster/flows/failover` | POST | Trigger manual failover | Failover result |
| `/api/cluster/nodes` | GET | List all cluster nodes and status | Node details, metrics |
| `/api/cluster/flows/rebalance` | POST | Trigger automatic rebalancing | Rebalance plan |
| `/api/cluster/metrics/aggregate` | GET | Cluster-wide metrics | CPU, flows, health |

#### 🖥️ **Web Interface Components** (`/grid` on Management Node)

**1. Cluster Dashboard** (Top Panel)
- 🟢 Node status indicators (online/offline/degraded)
- 📊 Real-time CPU/RAM/GPU metrics per node
- 💻 Flow count badges per node
- ⏱️ Latency from management to each node
- 🎮 GPU availability badges

**2. Flow Assignment Matrix** (Center Panel)
- 📊 Table showing all flows and their node assignments
- 🔴 Primary node column (which node is actively running)
- 🟡 Standby nodes column (redundancy status)
- ⚡ Quick action buttons (reassign, failover)
- 📊 Per-flow CPU and latency metrics

**3. Flow Configuration Panel** (Right Sidebar)
- 🎯 Assignment strategy selector (automatic/manual/etc.)
- 📍 Node pinning controls (force flow to specific node)
- 🔄 Redundancy toggle and standby count
- 💎 Resource requirements (CPU, GPU, RAM)

**4. Node Detail View** (Click any node card)
- 📋 Full node specifications
- 📈 Historical CPU/memory graphs
- 🔗 List of all assigned flows
- ⚙️ Maintenance mode toggle
- 📝 Event log for this node

#### 📡 **Real-Time Updates** (WebSocket)

**Management node broadcasts to UI:**
- Node status changes (online → offline)
- Flow assignment changes
- Failover events
- Metrics updates (every 1 second)
- Cluster health alerts

**UI subscribes to:**
- `cluster.node.status_changed`
- `cluster.flow.assigned`
- `cluster.flow.failover`
- `cluster.metrics.updated`
- `cluster.health.alert`

#### 🧠 **Orchestration Logic** (Running on Management Node)

**FlowOrchestrator Service:**
- Maintains map of flow → node assignments
- Monitors all node health via heartbeats
- Executes assignment algorithms
- Triggers failover automatically
- Provides rebalancing recommendations
- Exposes REST API for manual control

**ClusterManager Service:**
- Tracks all nodes (discovery via mDNS)
- Maintains node metadata (CPU, GPU, RAM, etc.)
- Publishes node status changes
- Provides node query methods

#### 💾 **Persistent State** (SQLite on Management Node)

**New Tables:**
- `flow_assignments` - Which flow is assigned to which node
- `flow_redundancy_config` - Standby node configuration
- `node_capabilities` - Cached node specs (CPU, GPU, etc.)
- `flow_deployment_history` - Audit log of assignments
- `cluster_events` - Historical cluster events

### **User Workflow Example**

1. **User opens browser** → `http://management-node:8080/grid`
2. **Sees cluster dashboard** showing 3 audio nodes (all online)
3. **Creates new flow** (Flow E) with heavy ML plugin chain
4. **Orchestrator automatically assigns** to Node 3 (has GPU)
5. **UI updates instantly** showing Flow E on Node 3
6. **User right-clicks Flow E** → "Assignment Options"
7. **Enables redundancy** → Standby nodes: Node 1
8. **Node 3 fails** (power outage)
9. **Automatic failover** to Node 1 (< 2 sec)
10. **UI shows alert** "Flow E failed over to Node 1"
11. **Audio continues** seamlessly on Node 1

All control happens from the **management node's web interface** - the user never needs to SSH into audio nodes or manage them individually.

---

**Document Version**: 2.0 (NetJACK-free, Management-Node-Centric)  
**Last Updated**: February 5, 2026  
**Author**: MAP2 Audio Platform Development Team

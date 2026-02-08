# 🛠️ Multi-Node Grid Architecture - Implementation Plan

**Date Created**: February 5, 2026  
**Last Updated**: February 5, 2026  
**Status**: Planning Phase  
**Target Start**: Week 1  
**Total Duration**: 14 weeks (5 phases)

---

## 📋 Document Purpose

This document provides a step-by-step implementation plan with detailed checkpoints for the Multi-Node Grid Architecture. Each checkpoint includes:
- ✅ Acceptance criteria (how to verify it's done)
- 📁 Files to create/modify
- 🗄️ Database changes
- 🔌 API endpoints
- 🎨 UI components
- 🧪 Tests to write
- ⚠️ Risks/considerations

**For AI Continuation**: When resuming work, start at the first incomplete checkpoint and follow the acceptance criteria to know when to move forward.

---

## 📊 Project Phases Overview

| Phase | Name | Duration | Goal | Status |
|-------|------|----------|------|--------|
| 0 | Setup & Planning | Week 0 | Prepare infrastructure | Not Started |
| 1 | Foundation | Weeks 1-3 | Cluster API & data models | Not Started |
| 2 | Management UI | Weeks 4-6 | Web interface for cluster control | Not Started |
| 3 | Profiling | Weeks 7-9 | Chain analysis & insights | Not Started |
| 4 | Redundancy | Weeks 10-12 | Failover & advanced features | Not Started |
| 5 | Polish | Weeks 13-14 | Documentation, testing, deployment | Not Started |

---

## 🎯 PHASE 0: Setup & Planning (Week 0)

### Objective
Prepare development environment and validate architecture assumptions.

---

## ✅ CHECKPOINT 0.1: Validate Cluster Infrastructure Exists

**Task**: Verify mDNS discovery, event bus, and node registry are operational

**What to Do**:
1. Check `/home/mm/map2-audio/app/services/cluster/` directory exists
2. Verify `ClusterManager` class is implemented with:
   - `get_online_audio_nodes()` method
   - `get_node(node_id)` method
   - `get_all_audio_nodes()` method
3. Verify event bus exists in `app/services/cluster/event_bus.py`
4. Test mDNS discovery on local network

**Acceptance Criteria**:
- [ ] `ClusterManager` can list all online nodes
- [ ] Event bus can publish and subscribe to events
- [ ] At least 2 nodes (real or docker) are discoverable via mDNS
- [ ] Node heartbeat working (nodes report status every 1 second)

**Files to Check**:
- `app/services/cluster/__init__.py`
- `app/services/cluster/enhanced_node_identity.py`
- `app/services/cluster/event_bus.py`

**Risk**: If cluster infrastructure incomplete, must build before proceeding

---

## ✅ CHECKPOINT 0.2: Document Current Grid Flow Architecture

**Task**: Map existing `/grid` endpoint and understand current data structures

**What to Do**:
1. Review `web/src/app/pages/GridFlowPage.tsx` (2576 lines)
2. Document current `FlowSlot` structure
3. Document current `RoutingConfig` structure
4. Document existing API calls to chains, plugins, etc.
5. Create diagram of current data flow

**Acceptance Criteria**:
- [ ] Document shows current FlowSlot interface structure
- [ ] Document shows current RoutingConfig types
- [ ] List all API endpoints called by GridFlow page
- [ ] Clear understanding of how flows -> chains -> plugins mapping works

**Files to Review**:
- `web/src/app/pages/GridFlowPage.tsx`
- `map2/api/index.ts` (check for chainsApi, pluginsApi)
- `map2/types/index.ts` (check for Chain, Plugin types)

**Output**: Create `GRID_CURRENT_STATE.md` documenting findings

---

## ✅ CHECKPOINT 0.3: Create Implementation Tracking Spreadsheet

**Task**: Set up way to track which checkpoints are complete

**What to Do**:
1. Create `IMPLEMENTATION_STATUS.md` with table of all checkpoints
2. Create `WORK_LOG.md` for recording work completed
3. Set up branch strategy (feature branches for each phase)

**Acceptance Criteria**:
- [ ] `IMPLEMENTATION_STATUS.md` exists with all checkpoints listed
- [ ] Status column shows: Not Started / In Progress / Completed
- [ ] Each checkpoint links to its detailed section in this plan

**Files to Create**:
- `IMPLEMENTATION_STATUS.md`
- `WORK_LOG.md`

---

## 🎯 PHASE 1: Foundation (Weeks 1-3)

### Objective
Implement core data models, API endpoints, and orchestrator service for managing flow assignments.

---

## ✅ CHECKPOINT 1.1: Create Database Schema Extensions

**Task**: Add tables for flow assignments, deployments, and node capabilities

**What to Do**:

1. Create migration file: `app/database/migrations/001_add_cluster_flows.py`
2. Add these SQLAlchemy models to `app/models/flow.py`:

```python
class FlowAssignment(Base):
    """Maps flows to nodes"""
    __tablename__ = "flow_assignments"
    
    id = Column(Integer, primary_key=True)
    flow_id = Column(String, unique=True, nullable=False)
    chain_id = Column(Integer, nullable=False)
    assigned_node_id = Column(String, nullable=False)
    assignment_type = Column(String)  # 'primary' or 'standby'
    assignment_strategy = Column(String)  # 'manual' or 'pinned'
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    __table_args__ = (
        Index('idx_node_id', 'assigned_node_id'),
        Index('idx_flow_id', 'flow_id'),
    )

class FlowDeployment(Base):
    """Tracks deployment status of flows"""
    __tablename__ = "flow_deployments"
    
    id = Column(Integer, primary_key=True)
    flow_id = Column(String, nullable=False)
    primary_node_id = Column(String, nullable=False)
    standby_node_ids = Column(JSON, default=[])  # List of node IDs
    deployment_status = Column(String)  # 'deploying', 'active', 'failed'
    deployment_timestamp = Column(DateTime, default=datetime.now)
    last_failover_time = Column(DateTime, nullable=True)
    error_message = Column(String, nullable=True)

class NodeCapability(Base):
    """Cache of node hardware capabilities"""
    __tablename__ = "node_capabilities"
    
    id = Column(Integer, primary_key=True)
    node_id = Column(String, unique=True, nullable=False)
    cpu_cores = Column(Integer)
    memory_gb = Column(Integer)
    has_gpu = Column(Boolean, default=False)
    gpu_name = Column(String, nullable=True)
    last_updated = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class FlowDeploymentHistory(Base):
    """Audit log of all flow deployments"""
    __tablename__ = "flow_deployment_history"
    
    id = Column(Integer, primary_key=True)
    flow_id = Column(String, nullable=False)
    from_node_id = Column(String, nullable=True)
    to_node_id = Column(String, nullable=False)
    action = Column(String)  # 'deployed', 'moved', 'failed_over'
    timestamp = Column(DateTime, default=datetime.now)
    notes = Column(String, nullable=True)
```

3. Add migration to `app/database/migrations/__init__.py`
4. Run migration: `alembic upgrade head`

**Acceptance Criteria**:
- [ ] All 4 tables created in SQLite database
- [ ] Tables have appropriate indexes
- [ ] Can insert/query records in each table
- [ ] Migration can be reversed with `alembic downgrade`

**Files to Create/Modify**:
- `app/models/flow.py` (add model classes)
- `app/database/migrations/001_add_cluster_flows.py` (new)

**Tests to Write**:
- Test creating FlowAssignment record
- Test querying by node_id
- Test JSON field (standby_node_ids) serialization

**Risk**: Schema migration could fail if database already has conflicting data

---

## ✅ CHECKPOINT 1.2: Implement FlowOrchestrator Service Core

**Task**: Build the orchestrator service that manages flow-to-node assignments

**What to Do**:

1. Create `app/services/flow_orchestrator.py`:

```python
from typing import List, Optional, Dict
from dataclasses import dataclass
import asyncio
import logging

@dataclass
class FlowAssignment:
    flow_id: str
    chain_id: int
    assigned_node_id: str
    assignment_type: str  # 'primary' or 'standby'
    reason: str

@dataclass
class FlowDeployment:
    flow_id: str
    chain_id: int
    primary_assignment: FlowAssignment
    standby_assignments: List[FlowAssignment]
    is_deployed: bool
    deployment_timestamp: float

class FlowOrchestrator:
    """Manages flow-to-node assignments across cluster"""
    
    _instance = None
    
    def __init__(self, cluster_manager, db_session):
        self.cluster = cluster_manager
        self.db = db_session
        self.active_deployments: Dict[str, FlowDeployment] = {}
        self.node_flow_map: Dict[str, List[str]] = {}  # node_id -> [flow_ids]
        self.logger = logging.getLogger('FlowOrchestrator')
    
    @classmethod
    def get_instance(cls):
        """Singleton accessor"""
        if cls._instance is None:
            raise RuntimeError("FlowOrchestrator not initialized")
        return cls._instance
    
    @classmethod
    def initialize(cls, cluster_manager, db_session):
        """Initialize singleton"""
        cls._instance = cls(cluster_manager, db_session)
        return cls._instance
    
    async def assign_flow_to_node(
        self,
        flow_id: str,
        chain_id: int,
        node_id: str,
        redundancy_enabled: bool = False,
        strategy: str = 'manual'
    ) -> Optional[FlowDeployment]:
        """
        Assign flow to specific node
        
        Args:
            flow_id: Flow identifier (e.g., 'flow-0')
            chain_id: Chain ID to run on this node
            node_id: Target node ID
            redundancy_enabled: Enable standby copies
            strategy: Assignment strategy ('manual' or 'pinned')
        
        Returns:
            FlowDeployment if successful, None if failed
        """
        # Validate node exists and is online
        node = self.cluster.get_node(node_id)
        if not node or node.status.value != 'ONLINE':
            self.logger.error(f"Node {node_id} not available")
            return None
        
        # Create primary assignment
        primary_assignment = FlowAssignment(
            flow_id=flow_id,
            chain_id=chain_id,
            assigned_node_id=node_id,
            assignment_type='primary',
            reason=f'{strategy} assignment'
        )
        
        # Create standby assignments if enabled
        standby_assignments = []
        if redundancy_enabled:
            available_nodes = self.cluster.get_online_audio_nodes()
            standby_nodes = [n for n in available_nodes if n.node_id != node_id][:2]
            
            for standby_node in standby_nodes:
                standby_assignments.append(FlowAssignment(
                    flow_id=flow_id,
                    chain_id=chain_id,
                    assigned_node_id=standby_node.node_id,
                    assignment_type='standby',
                    reason='Redundancy standby'
                ))
        
        # Create deployment
        deployment = FlowDeployment(
            flow_id=flow_id,
            chain_id=chain_id,
            primary_assignment=primary_assignment,
            standby_assignments=standby_assignments,
            is_deployed=False,
            deployment_timestamp=time.time()
        )
        
        # Save to database
        try:
            await self._save_assignment_to_db(primary_assignment, strategy)
            for standby in standby_assignments:
                await self._save_assignment_to_db(standby, 'redundancy')
            
            self.logger.info(f"Assigned flow {flow_id} to {node_id}")
            return deployment
        except Exception as e:
            self.logger.error(f"Failed to assign flow: {e}")
            return None
    
    async def deploy_flow(
        self,
        deployment: FlowDeployment,
        chain_dict: dict
    ) -> bool:
        """Deploy flow to assigned nodes via HTTP API"""
        # Implementation in next checkpoint
        pass
    
    async def _save_assignment_to_db(self, assignment: FlowAssignment, strategy: str):
        """Save assignment to database"""
        # Implementation will use SQLAlchemy
        pass
    
    async def get_all_assignments(self) -> List[Dict]:
        """Get all current flow assignments"""
        pass
    
    async def failover_flow(self, flow_id: str) -> bool:
        """Promote standby to primary for given flow"""
        pass
```

2. Register in app initialization: `app/main.py`
   - Initialize after cluster manager
   - Pass database session

**Acceptance Criteria**:
- [ ] `FlowOrchestrator` class exists with singleton pattern
- [ ] `assign_flow_to_node()` method creates assignment
- [ ] Primary and standby assignments are created correctly
- [ ] Assignment is saved to database
- [ ] Can retrieve assignment from database
- [ ] Node validation works (rejects offline nodes)

**Files to Create/Modify**:
- `app/services/flow_orchestrator.py` (new)
- `app/main.py` (initialize orchestrator)

**Tests to Write**:
- Test assigning flow to valid node
- Test rejecting assignment to offline node
- Test standby node selection
- Test assignment persistence

**Risk**: Singleton pattern might conflict with test isolation

---

## ✅ CHECKPOINT 1.3: Implement Management Node API Endpoints

**Task**: Create REST API for cluster flow management

**What to Do**:

1. Create `app/api/cluster_flows.py`:

```python
from fastapi import APIRouter, HTTPException, Query
from typing import List
from ..services.flow_orchestrator import FlowOrchestrator
from ..services.cluster import ClusterManager

router = APIRouter(prefix='/api/cluster', tags=['cluster-flows'])

@router.get('/flows/assignments')
async def get_flow_assignments():
    """
    GET /api/cluster/flows/assignments
    
    Get all current flow-to-node assignments
    
    Response:
    {
        "assignments": [
            {
                "flow_id": "flow-0",
                "chain_id": 1,
                "primary_node_id": "AUDIO-NODE-A1B2",
                "primary_node_name": "audio-01",
                "standby_nodes": [
                    {"node_id": "AUDIO-NODE-X9Y8", "node_name": "audio-02", "is_ready": true}
                ],
                "status": "active",
                "cpu_percent": 42,
                "latency_ms": 1.2
            }
        ],
        "total_flows": 4,
        "total_nodes": 3
    }
    """
    orchestrator = FlowOrchestrator.get_instance()
    cluster = ClusterManager.get_instance()
    
    assignments = []
    for flow_id, deployment in orchestrator.active_deployments.items():
        assignments.append({
            'flow_id': flow_id,
            'chain_id': deployment.chain_id,
            'primary_node_id': deployment.primary_assignment.assigned_node_id,
            'primary_node_name': cluster.get_node(deployment.primary_assignment.assigned_node_id).hostname,
            'standby_nodes': [
                {
                    'node_id': s.assigned_node_id,
                    'node_name': cluster.get_node(s.assigned_node_id).hostname,
                    'is_ready': True  # Will implement proper check later
                }
                for s in deployment.standby_assignments
            ],
            'status': 'active' if deployment.is_deployed else 'deploying',
            'cpu_percent': 0,  # Will get from node metrics
            'latency_ms': 0
        })
    
    return {
        'assignments': assignments,
        'total_flows': len(assignments),
        'total_nodes': len(cluster.get_online_audio_nodes())
    }

@router.post('/flows/assign')
async def assign_flow_to_node(
    flow_id: str,
    node_id: str,
    chain_id: int,
    redundancy_enabled: bool = False
):
    """
    POST /api/cluster/flows/assign
    
    Assign flow to specific node
    
    Request:
    {
        "flow_id": "flow-0",
        "node_id": "AUDIO-NODE-A1B2",
        "chain_id": 1,
        "redundancy_enabled": true
    }
    
    Response:
    {
        "status": "assigned",
        "flow_id": "flow-0",
        "node_id": "AUDIO-NODE-A1B2"
    }
    """
    orchestrator = FlowOrchestrator.get_instance()
    
    deployment = await orchestrator.assign_flow_to_node(
        flow_id=flow_id,
        chain_id=chain_id,
        node_id=node_id,
        redundancy_enabled=redundancy_enabled,
        strategy='manual'
    )
    
    if not deployment:
        raise HTTPException(status_code=400, detail="Assignment failed")
    
    # Deploy to nodes
    success = await orchestrator.deploy_flow(deployment, {})  # Chain dict TBD
    
    if success:
        return {
            'status': 'assigned',
            'flow_id': flow_id,
            'node_id': node_id
        }
    else:
        raise HTTPException(status_code=500, detail="Deployment failed")

@router.get('/nodes')
async def get_cluster_nodes():
    """
    GET /api/cluster/nodes
    
    Get all cluster nodes with assignments and metrics
    
    Response:
    {
        "nodes": [
            {
                "node_id": "AUDIO-NODE-A1B2",
                "hostname": "audio-01",
                "status": "ONLINE",
                "cpu_percent": 42,
                "memory_used_gb": 8,
                "memory_total_gb": 16,
                "has_gpu": true,
                "gpu_name": "NVIDIA RTX 4090",
                "assigned_flows": [
                    {"flow_id": "flow-0", "type": "primary"},
                    {"flow_id": "flow-2", "type": "primary"}
                ]
            }
        ]
    }
    """
    cluster = ClusterManager.get_instance()
    orchestrator = FlowOrchestrator.get_instance()
    
    nodes = []
    for node in cluster.get_all_audio_nodes():
        # Find flows assigned to this node
        assigned_flows = []
        for flow_id, deployment in orchestrator.active_deployments.items():
            if deployment.primary_assignment.assigned_node_id == node.node_id:
                assigned_flows.append({'flow_id': flow_id, 'type': 'primary'})
            
            for standby in deployment.standby_assignments:
                if standby.assigned_node_id == node.node_id:
                    assigned_flows.append({'flow_id': flow_id, 'type': 'standby'})
        
        nodes.append({
            'node_id': node.node_id,
            'hostname': node.hostname,
            'status': node.status.value,
            'cpu_percent': node.metadata.cpu_usage_percent,
            'memory_used_gb': node.metadata.memory_total_gb - node.metadata.memory_available_gb,
            'memory_total_gb': node.metadata.memory_total_gb,
            'has_gpu': node.metadata.has_gpu,
            'gpu_name': node.metadata.gpu_name if node.metadata.has_gpu else None,
            'assigned_flows': assigned_flows
        })
    
    return {'nodes': nodes}

@router.post('/flows/failover')
async def trigger_failover(flow_id: str):
    """
    POST /api/cluster/flows/failover
    
    Manually trigger failover to standby node
    """
    orchestrator = FlowOrchestrator.get_instance()
    success = await orchestrator.failover_flow(flow_id)
    
    if success:
        return {'status': 'failed_over', 'flow_id': flow_id}
    else:
        raise HTTPException(status_code=500, detail="Failover failed")
```

2. Register router in `app/main.py`:
   ```python
   from app.api.cluster_flows import router as cluster_flows_router
   app.include_router(cluster_flows_router)
   ```

3. Create tests in `tests/test_cluster_flows_api.py`

**Acceptance Criteria**:
- [ ] GET `/api/cluster/flows/assignments` returns 200 with correct schema
- [ ] GET `/api/cluster/nodes` returns 200 with all nodes
- [ ] POST `/api/cluster/flows/assign` creates assignment
- [ ] All endpoints require valid cluster state
- [ ] Error responses are appropriate (400, 500, etc.)
- [ ] Response schemas match documentation

**Files to Create/Modify**:
- `app/api/cluster_flows.py` (new)
- `app/main.py` (register router)
- `tests/test_cluster_flows_api.py` (new)

**Tests to Write**:
- Test GET assignments endpoint
- Test GET nodes endpoint
- Test POST assign endpoint
- Test assign to offline node (should fail)
- Test response schemas

**Risk**: API might return stale data if not synced with orchestrator

---

## ✅ CHECKPOINT 1.4: Implement Flow Deployment to Nodes

**Task**: Implement `deploy_flow()` method that sends chain to audio nodes via HTTP

**What to Do**:

1. Update `app/services/flow_orchestrator.py`:

```python
import aiohttp

async def deploy_flow(
    self,
    deployment: FlowDeployment,
    chain: Chain  # From database
) -> bool:
    """
    Deploy flow to assigned node(s) via HTTP API
    
    Flow:
    1. Send chain config to primary node
    2. Load plugins on primary
    3. Mark as active
    4. If standby enabled, deploy to standby nodes (inactive)
    5. Update deployment status in DB
    """
    try:
        # Deploy to primary node
        primary_success = await self._deploy_to_node(
            node_id=deployment.primary_assignment.assigned_node_id,
            chain=chain,
            mode='active'
        )
        
        if not primary_success:
            self.logger.error(f"Failed to deploy to primary node")
            return False
        
        # Deploy to standby nodes
        for standby in deployment.standby_assignments:
            try:
                await self._deploy_to_node(
                    node_id=standby.assigned_node_id,
                    chain=chain,
                    mode='standby'
                )
            except Exception as e:
                self.logger.warning(f"Failed to deploy standby on {standby.assigned_node_id}: {e}")
        
        # Mark as deployed
        deployment.is_deployed = True
        self.active_deployments[deployment.flow_id] = deployment
        
        # Update node->flow mapping
        node_id = deployment.primary_assignment.assigned_node_id
        if node_id not in self.node_flow_map:
            self.node_flow_map[node_id] = []
        self.node_flow_map[node_id].append(deployment.flow_id)
        
        # Save to database
        await self._update_deployment_in_db(deployment, 'active')
        
        self.logger.info(f"Successfully deployed flow {deployment.flow_id}")
        return True
        
    except Exception as e:
        self.logger.error(f"Failed to deploy flow: {e}")
        await self._update_deployment_in_db(deployment, 'failed', str(e))
        return False

async def _deploy_to_node(
    self,
    node_id: str,
    chain: Chain,
    mode: str
) -> bool:
    """
    Deploy chain to specific node via HTTP API
    
    Calls: POST http://<node>:8080/api/chains/deploy
    """
    node = self.cluster.get_node(node_id)
    if not node:
        return False
    
    # Build request payload
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
    
    # Send request with timeout
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(
                url, 
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status == 200:
                    self.logger.info(f"Deployed chain {chain.id} to {node_id} ({mode})")
                    return True
                else:
                    error_text = await resp.text()
                    self.logger.error(f"Deploy failed {node_id}: {resp.status} - {error_text}")
                    return False
        except asyncio.TimeoutError:
            self.logger.error(f"Timeout deploying to {node_id}")
            return False
        except Exception as e:
            self.logger.error(f"Error deploying to {node_id}: {e}")
            return False

async def _update_deployment_in_db(
    self,
    deployment: FlowDeployment,
    status: str,
    error_msg: str = None
):
    """Update deployment status in database"""
    # Use SQLAlchemy to update FlowDeployment table
    pass
```

2. Create corresponding endpoint on **audio nodes** (if not exists):
   - Each audio node should have `POST /api/chains/deploy` endpoint
   - This might already exist in existing audio engine

3. Create tests in `tests/test_flow_deployment.py`

**Acceptance Criteria**:
- [ ] `_deploy_to_node()` sends HTTP POST to node
- [ ] Handles HTTP errors gracefully
- [ ] Handles timeouts (30 second timeout)
- [ ] Updates deployment status in database
- [ ] Logs deployment events
- [ ] Can deploy to multiple nodes simultaneously
- [ ] Test with mock HTTP responses

**Files to Create/Modify**:
- `app/services/flow_orchestrator.py` (add methods)
- `tests/test_flow_deployment.py` (new)

**Tests to Write**:
- Test successful deployment
- Test handling of HTTP error responses
- Test timeout handling
- Test concurrent deployments to multiple nodes
- Test payload construction

**Risk**: Audio nodes might not have `/api/chains/deploy` endpoint yet

---

## ✅ CHECKPOINT 1.5: Phase 1 Integration Test

**Task**: Test Phase 1 components working together end-to-end

**What to Do**:

1. Create `tests/test_phase1_integration.py`:

```python
async def test_complete_flow_assignment():
    """
    Integration test: Assign flow to node and deploy
    
    Steps:
    1. Get cluster nodes
    2. Create FlowAssignment
    3. Call API to assign
    4. Verify assignment saved in DB
    5. Verify deployment HTTP called
    6. Verify orchestrator tracks deployment
    """
    pass

async def test_redundancy_assignment():
    """Test assigning flow with standby nodes"""
    pass

async def test_assignment_persistence():
    """Test that assignments survive restart"""
    pass
```

2. Run tests: `pytest tests/test_phase1_integration.py -v`

**Acceptance Criteria**:
- [ ] All Phase 1 integration tests pass
- [ ] No warnings or errors in logs
- [ ] Database state correct after operations
- [ ] Orchestrator state matches database

**Files to Create/Modify**:
- `tests/test_phase1_integration.py` (new)

**Definition of "Phase 1 Complete"**:
- [ ] Database schema created and migrated
- [ ] FlowOrchestrator service working
- [ ] Management API endpoints responding
- [ ] Flow deployment to nodes working
- [ ] All Phase 1 tests passing
- [ ] Can assign and deploy a flow end-to-end
- [ ] Status doc updated: Phase 1 = COMPLETED

---

## 🎯 PHASE 2: Management UI (Weeks 4-6)

### Objective
Build web interface for cluster management on the `/grid` page.

---

## ✅ CHECKPOINT 2.1: Create Cluster Dashboard Component

**Task**: Build React component to display all cluster nodes with real-time metrics

**What to Do**:

1. Create `web/src/app/components/GridFlow/ClusterDashboard.tsx`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { useWebSocket } from '../../hooks/useWebSocket'
import { Server, Cpu, HardDrive, Zap } from 'lucide-react'

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
}

export function ClusterDashboard() {
  const { data: nodesData, refetch } = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/nodes')
      return res.json() as Promise<{ nodes: ClusterNode[] }>
    },
    refetchInterval: 2000
  })

  // WebSocket for real-time updates
  const messages = useWebSocket('ws://localhost:8080/ws/cluster/metrics')

  const nodes = nodesData?.nodes || []

  return (
    <div className="cluster-dashboard">
      <div className="cluster-dashboard-header">
        <h3>🌐 Cluster Nodes ({nodes.length})</h3>
        <button 
          className="cluster-dashboard-refresh"
          onClick={() => refetch()}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="cluster-nodes-grid">
        {nodes.map(node => (
          <ClusterNodeCard key={node.node_id} node={node} />
        ))}
      </div>
    </div>
  )
}

function ClusterNodeCard({ node }: { node: ClusterNode }) {
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
      style={{ borderColor: statusColor }}
    >
      <div className="cluster-node-header">
        <div className="cluster-node-status" style={{ backgroundColor: statusColor }} />
        <h4>{node.hostname}</h4>
        {node.has_gpu && (
          <span className="cluster-node-gpu-badge" title={node.gpu_name || 'GPU'}>
            🎮
          </span>
        )}
      </div>

      <div className="cluster-node-resources">
        <div className="cluster-resource-row">
          <Cpu size={14} />
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
          <HardDrive size={14} />
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

      <div className="cluster-node-flows">
        <div className="cluster-node-flows-header">
          <Zap size={12} />
          <span>Flows: {node.flow_count}</span>
        </div>
        <div className="cluster-node-flows-list">
          {node.assigned_flows.map(assignment => (
            <div
              key={assignment.flow_id}
              className={`cluster-flow-badge ${assignment.type}`}
            >
              {assignment.flow_id}
              {assignment.type === 'standby' && <span className="standby-indicator">●</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

2. Create CSS file `web/src/app/components/GridFlow/ClusterDashboard.css`:

```css
.cluster-dashboard {
  padding: 16px;
  border-radius: 8px;
  background: rgba(20, 20, 20, 0.5);
  margin-bottom: 16px;
}

.cluster-dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.cluster-dashboard-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.cluster-nodes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.cluster-node-card {
  padding: 12px;
  border: 2px solid;
  border-radius: 8px;
  background: rgba(30, 30, 30, 0.8);
  transition: all 200ms;
}

.cluster-node-card:hover {
  background: rgba(40, 40, 40, 0.8);
  transform: translateY(-2px);
}

.cluster-node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.cluster-node-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.cluster-node-gpu-badge {
  margin-left: auto;
  font-size: 12px;
}

.cluster-node-resources {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.cluster-resource-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.cluster-resource-bar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(100, 100, 100, 0.2);
  overflow: hidden;
}

.cluster-resource-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 200ms;
}

.cluster-node-flows {
  border-top: 1px solid rgba(100, 100, 100, 0.2);
  padding-top: 6px;
}

.cluster-node-flows-header {
  font-size: 11px;
  opacity: 0.7;
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.cluster-node-flows-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.cluster-flow-badge {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  background: rgba(100, 100, 200, 0.2);
  border: 1px solid rgba(100, 100, 200, 0.4);
}

.cluster-flow-badge.standby {
  background: rgba(200, 100, 100, 0.2);
  border-color: rgba(200, 100, 100, 0.4);
}

.standby-indicator {
  margin-left: 2px;
  opacity: 0.6;
}
```

3. Integrate into GridFlowPage:
   - Import ClusterDashboard
   - Add above current flow list
   - Pass cluster state as props

**Acceptance Criteria**:
- [ ] Component renders without errors
- [ ] Shows all cluster nodes
- [ ] CPU/RAM bars display correctly
- [ ] GPU badges show for nodes with GPU
- [ ] Flow badges show assigned flows
- [ ] Standby flows indicated with ●
- [ ] Real-time updates every 2 seconds
- [ ] Responsive layout on mobile

**Files to Create/Modify**:
- `web/src/app/components/GridFlow/ClusterDashboard.tsx` (new)
- `web/src/app/components/GridFlow/ClusterDashboard.css` (new)
- `web/src/app/pages/GridFlowPage.tsx` (integrate)

**Tests to Write**:
- Test component renders
- Test loading state
- Test error state
- Test metric updates

---

## ✅ CHECKPOINT 2.2: Create Flow Assignment Matrix Component

**Task**: Build table view of all flows and their assignments

**What to Do**:

1. Create `web/src/app/components/GridFlow/FlowAssignmentMatrix.tsx` (similar pattern to Dashboard)

2. Show:
   - Flow ID and name
   - Primary node
   - Standby nodes
   - Status (active/deploying/failed)
   - CPU usage
   - Latency
   - Quick action buttons (reassign, failover)

3. CSS in `FlowAssignmentMatrix.css`

4. Integrate into GridFlowPage

**Acceptance Criteria**:
- [ ] Table displays all flows
- [ ] Each row shows: flow, primary node, standbys, status, CPU, latency
- [ ] Action buttons present (reassign, failover)
- [ ] Real-time updates
- [ ] Responsive table layout

**Files to Create/Modify**:
- `web/src/app/components/GridFlow/FlowAssignmentMatrix.tsx` (new)
- `web/src/app/components/GridFlow/FlowAssignmentMatrix.css` (new)
- `web/src/app/pages/GridFlowPage.tsx` (integrate)

---

## ✅ CHECKPOINT 2.3: Create Flow Assignment Dialog

**Task**: Modal for assigning flows to nodes

**What to Do**:

1. Create `web/src/app/components/GridFlow/FlowAssignmentDialog.tsx`:

```typescript
interface FlowAssignmentDialogProps {
  isOpen: boolean
  flow: FlowSlot | null
  availableNodes: ClusterNode[]
  onAssign: (nodeId: string, redundancyEnabled: boolean) => void
  onCancel: () => void
}

export function FlowAssignmentDialog({
  isOpen,
  flow,
  availableNodes,
  onAssign,
  onCancel
}: FlowAssignmentDialogProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('')
  const [redundancyEnabled, setRedundancyEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleAssign = async () => {
    if (!selectedNodeId) return
    setIsLoading(true)
    try {
      await onAssign(selectedNodeId, redundancyEnabled)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen || !flow) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Assign Flow: {flow.label}</h2>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        <div className="modal-body">
          <div className="assignment-section">
            <label>Select Target Node</label>
            <div className="node-selector">
              {availableNodes.map(node => (
                <div
                  key={node.node_id}
                  className={`node-option ${selectedNodeId === node.node_id ? 'selected' : ''}`}
                  onClick={() => setSelectedNodeId(node.node_id)}
                >
                  <div className="node-option-header">
                    <Server size={16} />
                    <span className="node-name">{node.hostname}</span>
                    {node.has_gpu && <span className="gpu-badge">🎮</span>}
                  </div>
                  <div className="node-option-stats">
                    <span>CPU: {node.cpu_percent}%</span>
                    <span>RAM: {node.memory_used_gb}/{node.memory_total_gb}GB</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="assignment-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={redundancyEnabled}
                onChange={(e) => setRedundancyEnabled(e.target.checked)}
              />
              <span>Enable redundancy (standby nodes)</span>
            </label>
            {redundancyEnabled && (
              <p className="help-text">
                Flow will be replicated on 2 standby nodes for automatic failover
              </p>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleAssign}
            disabled={!selectedNodeId || isLoading}
          >
            {isLoading ? 'Assigning...' : 'Assign Flow'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

2. Create CSS for modal
3. Integrate into GridFlowPage
4. Wire up to API call `/api/cluster/flows/assign`

**Acceptance Criteria**:
- [ ] Dialog shows all available nodes
- [ ] User can select a node
- [ ] Redundancy toggle working
- [ ] "Assign Flow" button calls API
- [ ] Loading state shows
- [ ] Success/error feedback
- [ ] Dialog closes on successful assign

**Files to Create/Modify**:
- `web/src/app/components/GridFlow/FlowAssignmentDialog.tsx` (new)
- `web/src/app/pages/GridFlowPage.tsx` (integrate)

---

## ✅ CHECKPOINT 2.4: Integrate Components into GridFlowPage

**Task**: Add cluster dashboard and assignment controls to main `/grid` page

**What to Do**:

1. Modify `web/src/app/pages/GridFlowPage.tsx`:

```typescript
// Add state
const [clusterAssignmentOpen, setClusterAssignmentOpen] = useState(false)
const [selectedFlowForAssignment, setSelectedFlowForAssignment] = useState<FlowSlot | null>(null)

// Add UI sections in render:
// 1. Cluster Dashboard at top
<ClusterDashboard />

// 2. Add "Assign to Node" button to each flow
<button
  onClick={() => {
    setSelectedFlowForAssignment(currentFlow)
    setClusterAssignmentOpen(true)
  }}
>
  Assign to Node
</button>

// 3. Flow Assignment Matrix (table view)
<FlowAssignmentMatrix
  onReassign={(flowId) => { /* show assignment dialog */ }}
  onFailover={(flowId) => { /* trigger failover */ }}
/>

// 4. Assignment Dialog
<FlowAssignmentDialog
  isOpen={clusterAssignmentOpen}
  flow={selectedFlowForAssignment}
  availableNodes={clusterNodes}
  onAssign={(nodeId, redundancy) => {
    // Call API to assign
    handleAssignFlow(selectedFlowForAssignment!.id, nodeId, redundancy)
  }}
  onCancel={() => setClusterAssignmentOpen(false)}
/>
```

2. Add API call handler:

```typescript
const handleAssignFlow = async (
  flowId: string,
  nodeId: string,
  redundancyEnabled: boolean
) => {
  try {
    const res = await fetch('/api/cluster/flows/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow_id: flowId,
        node_id: nodeId,
        chain_id: currentChain?.id,
        redundancy_enabled: redundancyEnabled
      })
    })
    
    if (res.ok) {
      pushToast('Flow assigned successfully', 'success')
      // Refetch assignments
      queryClient.invalidateQueries({ queryKey: ['cluster', 'flow-assignments'] })
    } else {
      pushToast('Assignment failed', 'error')
    }
  } catch (error) {
    pushToast('Error assigning flow', 'error')
  }
}
```

**Acceptance Criteria**:
- [ ] ClusterDashboard visible in UI
- [ ] FlowAssignmentMatrix visible in UI
- [ ] Can open assignment dialog from flow
- [ ] Can select node and assign
- [ ] UI updates after successful assignment
- [ ] Error messages shown on failure

**Files to Create/Modify**:
- `web/src/app/pages/GridFlowPage.tsx` (major changes)

---

## ✅ CHECKPOINT 2.5: Phase 2 Integration Test

**Task**: Test UI components and API integration

**What to Do**:

1. Create `tests/test_phase2_ui.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ClusterDashboard } from '../web/src/app/components/GridFlow/ClusterDashboard'

describe('ClusterDashboard', () => {
  it('renders cluster nodes', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ClusterDashboard />
      </QueryClientProvider>
    )
    
    await waitFor(() => {
      expect(screen.getByText(/Cluster Nodes/)).toBeInTheDocument()
    })
  })

  it('displays node metrics', async () => {
    // Test CPU, RAM display
  })

  it('shows assigned flows', async () => {
    // Test flow badges
  })
})
```

2. Manual testing:
   - Open `/grid`
   - Verify ClusterDashboard shows
   - Verify cluster nodes visible
   - Click "Assign to Node" on a flow
   - Select node and assign
   - Verify assignment appears in matrix

**Acceptance Criteria**:
- [ ] All UI components render
- [ ] API calls working
- [ ] Real-time updates working
- [ ] Manual assignment workflow complete
- [ ] No console errors

**Definition of "Phase 2 Complete"**:
- [ ] ClusterDashboard component complete
- [ ] FlowAssignmentMatrix component complete
- [ ] FlowAssignmentDialog component complete
- [ ] Integrated into GridFlowPage
- [ ] API integration working
- [ ] Real-time updates via WebSocket
- [ ] All Phase 2 tests passing
- [ ] Status doc updated: Phase 2 = COMPLETED

---

## 🎯 PHASE 3: Profiling (Weeks 7-9)

### Objective
Implement chain analysis and provide insights to guide manual assignments.

---

## ✅ CHECKPOINT 3.1: Implement Chain Analysis Service

**Task**: Measure and estimate chain resource requirements

**What to Do**:

1. Create `app/services/chain_analyzer.py`:

```python
from typing import Dict, Optional
import asyncio

class ChainAnalyzer:
    """Analyzes chains to determine resource requirements"""
    
    def __init__(self, db_session):
        self.db = db_session
    
    async def analyze_chain(self, chain_id: int) -> Dict:
        """
        Analyze chain requirements
        
        Returns:
        {
            "chain_id": 1,
            "chain_name": "Guitar Rig",
            "plugin_count": 5,
            "estimated_cpu_percent": 30,
            "estimated_memory_mb": 256,
            "requires_gpu": False,
            "gpu_recommended": False,
            "analysis_timestamp": 1234567890
        }
        """
        chain = self.db.query(Chain).filter(Chain.id == chain_id).first()
        if not chain:
            return None
        
        estimated_cpu = 0
        estimated_memory = 0
        requires_gpu = False
        gpu_recommended = False
        
        for plugin in chain.plugins:
            # Look up plugin metadata
            metadata = await self._get_plugin_metadata(plugin.uri)
            
            if metadata:
                estimated_cpu += metadata.get('estimated_cpu_percent', 5)
                estimated_memory += metadata.get('estimated_memory_mb', 100)
                
                if metadata.get('requires_gpu'):
                    requires_gpu = True
                if metadata.get('recommended_gpu'):
                    gpu_recommended = True
        
        return {
            'chain_id': chain_id,
            'chain_name': chain.name,
            'plugin_count': len(chain.plugins),
            'estimated_cpu_percent': min(estimated_cpu, 95),
            'estimated_memory_mb': estimated_memory,
            'requires_gpu': requires_gpu,
            'gpu_recommended': gpu_recommended,
            'analysis_timestamp': time.time()
        }
    
    async def _get_plugin_metadata(self, plugin_uri: str) -> Optional[Dict]:
        """Get metadata about plugin"""
        # Query plugin metadata from database
        pass
```

2. Add to `ChainService`:

```python
async def get_chain_analysis(self, chain_id: int):
    analyzer = ChainAnalyzer(self.db)
    return await analyzer.analyze_chain(chain_id)
```

3. Add API endpoint to get analysis:

```python
@router.get('/chains/{chain_id}/analysis')
async def get_chain_analysis(chain_id: int):
    """Get resource requirements for chain"""
    service = ChainService()
    analysis = await service.get_chain_analysis(chain_id)
    return analysis
```

**Acceptance Criteria**:
- [ ] ChainAnalyzer class works
- [ ] Can analyze chain requirements
- [ ] Returns reasonable estimates
- [ ] API endpoint returns analysis
- [ ] Metadata stored or looked up correctly

**Files to Create/Modify**:
- `app/services/chain_analyzer.py` (new)
- `app/services/chain_service.py` (add method)
- `app/api/chains.py` (add endpoint)

---

## ✅ CHECKPOINT 3.2: Add Analysis to Assignment Dialog

**Task**: Show chain requirements when assigning flow

**What to Do**:

1. Update FlowAssignmentDialog to fetch and display chain analysis:

```typescript
const { data: chainAnalysis } = useQuery({
  queryKey: ['chain', flow?.chainId, 'analysis'],
  queryFn: async () => {
    const res = await fetch(`/api/chains/${flow?.chainId}/analysis`)
    return res.json()
  },
  enabled: !!flow?.chainId
})

// In dialog, show:
{chainAnalysis && (
  <div className="chain-requirements">
    <h3>Chain Requirements</h3>
    <div className="requirement-item">
      <span>Estimated CPU:</span>
      <span>{chainAnalysis.estimated_cpu_percent}%</span>
    </div>
    <div className="requirement-item">
      <span>Estimated Memory:</span>
      <span>{chainAnalysis.estimated_memory_mb}MB</span>
    </div>
    {chainAnalysis.requires_gpu && (
      <div className="requirement-warning">
        ⚠️ GPU Required - Select node with GPU
      </div>
    )}
  </div>
)}
```

2. Show node suitability based on requirements:

```typescript
const isSuitable = (node: ClusterNode) => {
  if (chainAnalysis.requires_gpu && !node.has_gpu) return false
  if (node.cpu_percent + chainAnalysis.estimated_cpu_percent > 85) return false
  return true
}

// Mark unsuitable nodes as disabled
<div
  className={`node-option ${!isSuitable(node) ? 'unsuitable' : ''}`}
  onClick={() => isSuitable(node) && setSelectedNodeId(node.node_id)}
>
```

**Acceptance Criteria**:
- [ ] Chain analysis fetched when opening dialog
- [ ] Requirements displayed (CPU, memory, GPU)
- [ ] Warnings shown if GPU required
- [ ] Nodes marked unsuitable if not meeting requirements
- [ ] User cannot select unsuitable nodes

**Files to Create/Modify**:
- `web/src/app/components/GridFlow/FlowAssignmentDialog.tsx` (update)

---

## ✅ CHECKPOINT 3.3: Add Node Recommendations

**Task**: Suggest best nodes based on chain requirements

**What to Do**:

1. Create recommendation logic:

```typescript
const getRecommendedNodes = (
  nodes: ClusterNode[],
  analysis: ChainAnalysis
): ClusterNode[] => {
  // Filter suitable nodes
  let suitable = nodes.filter(node => {
    if (analysis.requires_gpu && !node.has_gpu) return false
    const projectedCpu = node.cpu_percent + analysis.estimated_cpu_percent
    if (projectedCpu > 85) return false
    return true
  })

  // Sort by suitability
  return suitable.sort((a, b) => {
    // GPU-recommended plugins should go to GPU nodes
    let scoreA = 0
    let scoreB = 0

    if (analysis.gpu_recommended) {
      scoreA = a.has_gpu ? 100 : 0
      scoreB = b.has_gpu ? 100 : 0
    }

    // Lower CPU is better
    scoreA -= a.cpu_percent
    scoreB -= b.cpu_percent

    return scoreB - scoreA
  })
}

// Show top 3 recommendations
const recommended = getRecommendedNodes(availableNodes, chainAnalysis)

<div className="recommended-nodes">
  <p>Recommended nodes:</p>
  {recommended.slice(0, 3).map(node => (
    <button
      key={node.node_id}
      className="recommended-btn"
      onClick={() => setSelectedNodeId(node.node_id)}
    >
      ⭐ {node.hostname}
    </button>
  ))}
</div>
```

**Acceptance Criteria**:
- [ ] Recommendations computed correctly
- [ ] Shown at top of dialog
- [ ] Account for GPU requirements
- [ ] Account for available CPU
- [ ] Sorted by best fit first

**Files to Create/Modify**:
- `web/src/app/components/GridFlow/FlowAssignmentDialog.tsx` (add logic)

---

## ✅ CHECKPOINT 3.4: Phase 3 Integration Test

**Task**: Test profiling and recommendations

**What to Do**:

1. Create `tests/test_phase3_profiling.py`:

```python
async def test_chain_analysis():
    """Test that chain analysis returns correct estimates"""
    pass

async def test_gpu_requirement_detection():
    """Test GPU requirement detection"""
    pass
```

2. Create `tests/test_phase3_recommendations.tsx`:

```typescript
it('recommends suitable nodes', () => {
  // Test recommendation logic
})

it('marks unsuitable nodes', () => {
  // Test filtering
})
```

**Acceptance Criteria**:
- [ ] Analysis tests passing
- [ ] Recommendation tests passing
- [ ] UI updates with recommendations
- [ ] Unsuitable nodes disabled

**Definition of "Phase 3 Complete"**:
- [ ] ChainAnalyzer service working
- [ ] Analysis shown in assignment dialog
- [ ] Node recommendations displayed
- [ ] GPU and resource requirements considered
- [ ] All Phase 3 tests passing
- [ ] Status doc updated: Phase 3 = COMPLETED

---

## 🎯 PHASE 4: Redundancy & Advanced Features (Weeks 10-12)

### Objective
Implement failover, standby management, and advanced features.

---

## ✅ CHECKPOINT 4.1: Implement Failover Logic

**Task**: Auto-promote standby to primary when primary fails

**What to Do**:

1. Extend FlowOrchestrator:

```python
async def failover_flow(self, flow_id: str, trigger_reason: str = 'manual') -> bool:
    """
    Promote standby to primary
    
    Happens automatically when:
    - Primary node fails (heartbeat timeout)
    - Or manually triggered by user
    """
    deployment = self.active_deployments.get(flow_id)
    if not deployment or not deployment.standby_assignments:
        return False
    
    try:
        # Get first standby
        standby = deployment.standby_assignments[0]
        
        # Send promote command to standby node
        success = await self._promote_standby_node(standby.assigned_node_id, flow_id)
        
        if success:
            # Update deployment
            deployment.primary_assignment = standby
            deployment.standby_assignments.pop(0)
            
            # Log failover
            await self._log_failover(flow_id, standby.assigned_node_id, trigger_reason)
            
            # Broadcast event
            await self.cluster.event_bus.publish({
                'type': 'FLOW_FAILOVER',
                'flow_id': flow_id,
                'new_primary_node': standby.assigned_node_id,
                'timestamp': time.time()
            })
            
            return True
        else:
            return False
    except Exception as e:
        self.logger.error(f"Failover failed: {e}")
        return False

async def _promote_standby_node(self, node_id: str, flow_id: str) -> bool:
    """Send promote command to standby node"""
    node = self.cluster.get_node(node_id)
    if not node:
        return False
    
    url = f"http://{node.hostname}:8080/api/flows/promote-standby"
    payload = {'flow_id': flow_id}
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            return resp.status == 200
```

2. Add failover endpoint:

```python
@router.post('/flows/{flow_id}/failover')
async def trigger_failover(flow_id: str):
    """Manually trigger failover"""
    orchestrator = FlowOrchestrator.get_instance()
    success = await orchestrator.failover_flow(flow_id, trigger_reason='manual')
    
    if success:
        return {'status': 'failed_over', 'flow_id': flow_id}
    else:
        raise HTTPException(status_code=400, detail='Failover failed - no standby available')
```

3. Add health monitor that detects node failures:

```python
async def _monitor_node_health(self):
    """Background task to detect node failures and trigger failover"""
    while True:
        await asyncio.sleep(1)
        
        cluster = ClusterManager.get_instance()
        
        for flow_id, deployment in list(self.active_deployments.items()):
            primary_node_id = deployment.primary_assignment.assigned_node_id
            primary_node = cluster.get_node(primary_node_id)
            
            # Check if primary is offline
            if primary_node and primary_node.status.value == 'OFFLINE':
                if deployment.standby_assignments:
                    # Trigger automatic failover
                    await self.failover_flow(flow_id, trigger_reason='node_failure')
```

**Acceptance Criteria**:
- [ ] Failover method triggers promotion
- [ ] Standby becomes primary
- [ ] Event broadcast on failover
- [ ] Health monitor detects failures
- [ ] Automatic failover < 2 seconds
- [ ] Failover can be triggered manually

**Files to Create/Modify**:
- `app/services/flow_orchestrator.py` (add failover methods)
- `app/api/cluster_flows.py` (add endpoint)

---

## ✅ CHECKPOINT 4.2: Add Failover UI

**Task**: Show failover button and status in UI

**What to Do**:

1. Add failover button to FlowAssignmentMatrix:

```typescript
<button
  className="action-btn failover"
  onClick={() => handleFailover(row.flow_id)}
  disabled={row.standby_nodes.length === 0}
  title={row.standby_nodes.length === 0 ? 'No standby nodes available' : 'Trigger failover to standby'}
>
  <AlertTriangle size={14} />
  Failover
</button>

const handleFailover = async (flowId: string) => {
  if (!confirm('Trigger failover to standby node?')) return
  
  try {
    const res = await fetch(`/api/cluster/flows/${flowId}/failover`, {
      method: 'POST'
    })
    
    if (res.ok) {
      pushToast('Failover triggered', 'success')
      queryClient.invalidateQueries({ queryKey: ['cluster', 'flow-assignments'] })
    }
  } catch (error) {
    pushToast('Failover failed', 'error')
  }
}
```

2. Show failover status/notification:

```typescript
{assignment.status === 'failover_in_progress' && (
  <div className="failover-notification">
    ⚠️ Failover in progress...
  </div>
)}
```

**Acceptance Criteria**:
- [ ] Failover button visible in matrix
- [ ] Button disabled when no standby
- [ ] Can trigger failover from UI
- [ ] Status shows failover in progress
- [ ] Completes and shows new primary

**Files to Create/Modify**:
- `web/src/app/components/GridFlow/FlowAssignmentMatrix.tsx` (add button)

---

## ✅ CHECKPOINT 4.3: Implement Node Maintenance Mode

**Task**: Allow taking nodes offline gracefully for maintenance

**What to Do**:

1. Add maintenance mode to ClusterManager

2. Create endpoint:

```python
@router.post('/nodes/{node_id}/maintenance')
async def set_node_maintenance_mode(node_id: str, enabled: bool):
    """
    Enable/disable maintenance mode for node
    
    When enabled:
    - No new flows assigned to node
    - Existing flows with standby fail over
    - Node kept online for graceful shutdown
    """
    cluster = ClusterManager.get_instance()
    orchestrator = FlowOrchestrator.get_instance()
    
    node = cluster.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail='Node not found')
    
    if enabled:
        # Trigger failover for all flows on this node
        for flow_id, deployment in orchestrator.active_deployments.items():
            if deployment.primary_assignment.assigned_node_id == node_id:
                if deployment.standby_assignments:
                    await orchestrator.failover_flow(flow_id, trigger_reason='maintenance_mode')
        
        # Mark node in maintenance
        await cluster.set_node_maintenance(node_id, True)
    else:
        await cluster.set_node_maintenance(node_id, False)
    
    return {'status': 'ok', 'node_id': node_id, 'maintenance': enabled}
```

3. Add UI toggle in ClusterDashboard:

```typescript
{node.status === 'ONLINE' && (
  <button
    className="maintenance-btn"
    onClick={() => toggleMaintenance(node.node_id)}
    title="Enable maintenance mode"
  >
    🔧
  </button>
)}
```

**Acceptance Criteria**:
- [ ] Can enable/disable maintenance mode
- [ ] Flows fail over when entering maintenance
- [ ] New flows not assigned to maintenance node
- [ ] Node can be shut down gracefully

**Files to Create/Modify**:
- `app/services/cluster.py` (add maintenance methods)
- `app/api/cluster_flows.py` (add endpoint)
- `web/src/app/components/GridFlow/ClusterDashboard.tsx` (add button)

---

## ✅ CHECKPOINT 4.4: Phase 4 Integration Test

**Task**: Test failover and advanced features

**What to Do**:

1. Create `tests/test_phase4_failover.py`:

```python
async def test_manual_failover():
    """Test manually triggered failover"""
    pass

async def test_automatic_failover_on_node_failure():
    """Test automatic failover when primary node fails"""
    pass

async def test_maintenance_mode():
    """Test node maintenance mode"""
    pass
```

2. Integration scenarios:
   - Simulate node failure
   - Verify failover triggered
   - Verify standby becomes primary
   - Test maintenance mode on all flows

**Acceptance Criteria**:
- [ ] Failover tests passing
- [ ] Auto-failover working
- [ ] Maintenance mode working
- [ ] No data loss during failover

**Definition of "Phase 4 Complete"**:
- [ ] Failover logic implemented
- [ ] Auto-failover on node failure
- [ ] Manual failover UI
- [ ] Maintenance mode
- [ ] All Phase 4 tests passing
- [ ] Status doc updated: Phase 4 = COMPLETED

---

## 🎯 PHASE 5: Polish & Documentation (Weeks 13-14)

### Objective
Documentation, testing, and preparation for deployment.

---

## ✅ CHECKPOINT 5.1: Comprehensive Testing

**Task**: Run full test suite and achieve good coverage

**What to Do**:

1. Run all tests: `pytest tests/ -v --cov=app --cov-report=html`

2. Integration tests with real cluster (docker)

3. Load testing: `locust -f tests/load_test.py`

4. Manual testing checklist:
   - [ ] Create flow and assign to node
   - [ ] Verify flow runs on correct node
   - [ ] Add redundancy and verify standbys
   - [ ] Kill primary node and verify failover
   - [ ] Reassign flows between nodes
   - [ ] Enable maintenance mode
   - [ ] Check metrics and diagnostics

**Acceptance Criteria**:
- [ ] > 80% code coverage
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Load test shows < 200ms API response time
- [ ] Manual testing checklist complete

**Files to Create/Modify**:
- `tests/load_test.py` (new)
- `tests/test_*.py` (fill in remaining)

---

## ✅ CHECKPOINT 5.2: Documentation

**Task**: Write comprehensive documentation

**What to Do**:

1. Create `MULTI_NODE_USER_GUIDE.md`:
   - How to access cluster dashboard
   - How to assign flows to nodes
   - How to enable redundancy
   - How to trigger failover
   - Troubleshooting guide

2. Create `MULTI_NODE_ADMIN_GUIDE.md`:
   - Cluster setup
   - Node requirements
   - Adding/removing nodes
   - Monitoring and health
   - Backup and recovery

3. Create `API_REFERENCE.md`:
   - All endpoints documented
   - Request/response examples
   - Error codes

4. Update `README.md` with cluster info

**Acceptance Criteria**:
- [ ] User guide complete
- [ ] Admin guide complete
- [ ] API reference complete
- [ ] All examples tested
- [ ] Screenshots included

**Files to Create**:
- `docs/MULTI_NODE_USER_GUIDE.md`
- `docs/MULTI_NODE_ADMIN_GUIDE.md`
- `docs/API_REFERENCE.md`

---

## ✅ CHECKPOINT 5.3: Deployment Preparation

**Task**: Prepare for production deployment

**What to Do**:

1. Create deployment guide: `DEPLOYMENT_INSTRUCTIONS.md`

2. Create docker-compose for multi-node setup (if needed)

3. Database migration strategy

4. Rollback procedure

5. Monitoring setup

**Acceptance Criteria**:
- [ ] Can deploy to production
- [ ] Can roll back changes
- [ ] Monitoring configured
- [ ] Logging configured
- [ ] Backup tested

**Files to Create**:
- `DEPLOYMENT_INSTRUCTIONS.md`

---

## ✅ CHECKPOINT 5.4: Final Validation

**Task**: Comprehensive final check before release

**What to Do**:

1. Feature completeness review:
   - [ ] Manual flow assignment
   - [ ] Redundancy/failover
   - [ ] Cluster dashboard
   - [ ] Node assignment matrix
   - [ ] Chain analysis
   - [ ] Maintenance mode

2. Code review:
   - [ ] No security issues
   - [ ] Error handling complete
   - [ ] Logging comprehensive
   - [ ] Performance acceptable

3. Documentation review:
   - [ ] Complete and accurate
   - [ ] Examples work
   - [ ] Troubleshooting guide helpful

**Acceptance Criteria**:
- [ ] All features working
- [ ] Code quality acceptable
- [ ] Documentation complete
- [ ] Ready for production

**Definition of "Project Complete"**:
- [ ] All 5 phases complete
- [ ] All checkpoints passed
- [ ] Test coverage > 80%
- [ ] Documentation complete
- [ ] Ready for user deployment

---

## 📊 Checkpoint Status Table

| Phase | Checkpoint | Status | Owner | Notes |
|-------|-----------|--------|-------|-------|
| 0 | 0.1 Validate Infrastructure | Not Started | | Check cluster components |
| 0 | 0.2 Document Current Grid | Not Started | | Map existing code |
| 0 | 0.3 Setup Tracking | Not Started | | Create status doc |
| 1 | 1.1 Database Schema | Not Started | | Create tables |
| 1 | 1.2 FlowOrchestrator Core | Not Started | | Assignment logic |
| 1 | 1.3 Management API | Not Started | | REST endpoints |
| 1 | 1.4 Flow Deployment | Not Started | | Deploy to nodes |
| 1 | 1.5 Phase 1 Integration | Not Started | | End-to-end test |
| 2 | 2.1 Cluster Dashboard | Not Started | | React component |
| 2 | 2.2 Assignment Matrix | Not Started | | Table view |
| 2 | 2.3 Assignment Dialog | Not Started | | Modal for assign |
| 2 | 2.4 GridFlow Integration | Not Started | | Add to page |
| 2 | 2.5 Phase 2 Integration | Not Started | | UI end-to-end |
| 3 | 3.1 Chain Analyzer | Not Started | | Profiling |
| 3 | 3.2 Analysis in Dialog | Not Started | | Show requirements |
| 3 | 3.3 Recommendations | Not Started | | Suggest nodes |
| 3 | 3.4 Phase 3 Integration | Not Started | | Profiling test |
| 4 | 4.1 Failover Logic | Not Started | | Auto-promotion |
| 4 | 4.2 Failover UI | Not Started | | UI controls |
| 4 | 4.3 Maintenance Mode | Not Started | | Graceful shutdown |
| 4 | 4.4 Phase 4 Integration | Not Started | | Failover tests |
| 5 | 5.1 Comprehensive Tests | Not Started | | 80% coverage |
| 5 | 5.2 Documentation | Not Started | | User & admin guides |
| 5 | 5.3 Deployment Prep | Not Started | | Production ready |
| 5 | 5.4 Final Validation | Not Started | | Release check |

---

## 📌 How to Use This Plan

### For Starting Fresh
1. Read through all checkpoints at high level
2. Start at Checkpoint 0.1
3. Follow instructions in order
4. Mark status as you complete

### For Resuming Work
1. Find the first "Not Started" checkpoint
2. Read the acceptance criteria
3. Follow "What to Do" instructions
4. Verify acceptance criteria met
5. Update status to "Completed"
6. Move to next checkpoint

### For AI Continuation
When an AI resumes this work:
1. Search for first checkpoint not marked COMPLETED
2. Read that checkpoint's "What to Do" section
3. Follow the code examples
4. Create tests listed under "Tests to Write"
5. Verify all "Acceptance Criteria" boxes can be checked
6. Update status before moving to next checkpoint

---

**Current Date**: February 5, 2026  
**Plan Created By**: AI Architecture Team  
**Last Checkpoint Completed**: None (Beginning Phase 0)  
**Estimated Completion**: Week 14 (Mid-April 2026)

# Cluster Management User Guide

**MAP2 Audio Platform - Multi-Node Grid Architecture**

Version 1.0 | February 2026

---

## Overview

The MAP2 Audio Platform cluster management system allows you to distribute audio processing flows across multiple nodes in your network. This guide covers day-to-day operations for managing your cluster.

---

## Quick Start

### Accessing the Cluster Dashboard

1. Open the MAP2 web interface
2. Navigate to **Grid** → **Cluster Dashboard**
3. View real-time status of all nodes in your cluster

### Basic Concepts

- **Node**: A physical or virtual machine running MAP2
- **Flow**: An audio processing chain that can be deployed to a node
- **Assignment**: Linking a flow to run on a specific node
- **Primary/Standby**: Redundancy roles for high-availability setups

---

## Common Tasks

### 1. Viewing Cluster Status

The **Cluster Dashboard** shows:
- Node list with online/offline status
- CPU and memory usage per node
- GPU availability and utilization
- Current flow assignments

**Indicators:**
- 🟢 **ONLINE** - Node is healthy and processing
- 🔴 **OFFLINE** - Node is unreachable
- 🟡 **DEGRADED** - Node has issues but still running
- 🔧 **Maintenance** - Node is in maintenance mode

### 2. Assigning a Flow to a Node

**Steps:**
1. Go to **Grid** → **Flow Assignments**
2. Click **Assign Flow**
3. Select:
   - **Flow ID** (e.g., flow-0, flow-1)
   - **Chain** to deploy
   - **Target Node**
   - Enable **Redundancy** (optional)
4. Click **Deploy**

**Node Recommendations:**
- Nodes with 🌟 are recommended based on requirements
- Green checkmarks ✓ indicate compatibility
- Red X marks ✗ indicate missing capabilities

### 3. Monitoring Active Flows

The **Flow Assignment Matrix** displays:
- All flows (rows)
- All nodes (columns)
- Assignment status for each flow-node pair

**Status Indicators:**
- **Primary** - Active processing node
- **Standby** - Backup node (redundancy enabled)
- **—** - No assignment

### 4. Triggering Failover

If a primary node fails:

**Manual Failover:**
1. Locate the flow in the assignment matrix
2. Click **Failover** button
3. Standby node becomes primary automatically

**Automatic Failover:**
- System detects node failure within 10 seconds
- Standby promoted to primary automatically
- No user intervention required

### 5. Node Maintenance Mode

Before updating or restarting a node:

1. Navigate to **Cluster Dashboard**
2. Find the node in the list
3. Click **Maintenance** button
4. Flows will migrate to standby nodes
5. Perform maintenance
6. Click **Maintenance** again to exit

---

## Best Practices

### Flow Assignment

✅ **DO:**
- Assign GPU-intensive chains to nodes with GPUs
- Use redundancy for critical flows
- Monitor CPU/memory usage before assignment

❌ **DON'T:**
- Overload a single node with too many flows
- Assign high-latency chains to low-spec nodes
- Disable redundancy for production flows

### Node Management

✅ **DO:**
- Use maintenance mode before updates
- Keep at least one standby per critical flow
- Monitor node health regularly

❌ **DON'T:**
- Restart nodes without maintenance mode
- Run single-node setups in production
- Ignore degraded status warnings

---

## Troubleshooting

### Node Shows Offline

**Check:**
1. Network connectivity to the node
2. MAP2 service is running: `systemctl status map2`
3. Firewall rules allow cluster communication

**Fix:**
```bash
# Restart MAP2 service
sudo systemctl restart map2
```

### Assignment Failed

**Common Causes:**
- Node lacks required capabilities (GPU, plugins)
- Insufficient CPU/memory
- Chain configuration invalid

**Solution:**
1. Check node capabilities in dashboard
2. Verify chain configuration
3. Review logs: `/var/log/map2/cluster.log`

### Failover Not Working

**Check:**
1. Redundancy is enabled for the flow
2. Standby node is online
3. Standby node has required capabilities

**Manual Recovery:**
1. Re-assign flow to different node
2. Check cluster logs for errors

---

## API Quick Reference

### Get Cluster Nodes
```bash
curl http://localhost:8080/api/cluster/nodes
```

### Assign Flow
```bash
curl -X POST http://localhost:8080/api/cluster/flows/assign \
  -H "Content-Type: application/json" \
  -d '{
    "flow_id": "flow-0",
    "chain_id": 1,
    "node_id": "node-a",
    "redundancy_enabled": true
  }'
```

### Get Assignments
```bash
curl http://localhost:8080/api/cluster/flows/assignments
```

### Trigger Failover
```bash
curl -X POST http://localhost:8080/api/cluster/flows/failover \
  -H "Content-Type: application/json" \
  -d '{
    "flow_id": "flow-0"
  }'
```

### Set Maintenance Mode
```bash
curl -X POST http://localhost:8080/api/cluster/nodes/node-a/maintenance \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true
  }'
```

---

## Glossary

**Chain**: A configured audio processing pipeline with plugins  
**Flow**: A runtime instance of a chain running on a node  
**Assignment**: Mapping between flow and node  
**Redundancy**: Running backup instances for high availability  
**Failover**: Switching from primary to standby node  
**Maintenance Mode**: Temporarily disabling a node for updates  

---

## Support

- Documentation: `/docs`
- Logs: `/var/log/map2/`
- Issues: Report via GitHub or support portal

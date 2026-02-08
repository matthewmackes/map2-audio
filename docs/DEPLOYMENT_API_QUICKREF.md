# ⚡ Quick Reference - Deployment System APIs

## Configuration

### Get/Set Deployment Mode
```bash
# Get current mode
curl http://localhost:8000/api/deployment/mode

# Switch mode
curl -X POST http://localhost:8000/api/deployment/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "AUDIO-NODE"}'
```

### Get Status
```bash
# Full deployment status
curl http://localhost:8000/api/deployment/status

# Just the config
curl http://localhost:8000/api/deployment/config
```

---

## SSH Trust Management

### Generate Keys
```bash
# Generate new SSH key pair
curl -X POST http://localhost:8000/api/ssh/keys/generate \
  -H "Content-Type: application/json" \
  -d '{
    "key_type": "rsa",
    "key_bits": 4096
  }'
```

### Trust a Peer
```bash
# Add peer to trusted list
curl -X POST http://localhost:8000/api/ssh/trust/add \
  -H "Content-Type: application/json" \
  -d '{
    "peer_id": "AUDIO-NODE-ABC1",
    "peer_public_key": "ssh-rsa AAAA... mm@AUDIO-NODE-ABC1"
  }'

# Check trust status
curl http://localhost:8000/api/ssh/trust/status

# Remove peer
curl -X POST http://localhost:8000/api/ssh/trust/remove \
  -H "Content-Type: application/json" \
  -d '{"peer_id": "AUDIO-NODE-ABC1"}'
```

### Get My Keys
```bash
curl http://localhost:8000/api/ssh/keys
```

---

## Peer Discovery & Linking

### Discover Peers
```bash
# Get all discovered peers with latency
curl http://localhost:8000/api/peers

# Ping specific peer
curl -X POST http://localhost:8000/api/peers/AUDIO-NODE-ABC1/ping

# Get latency history
curl http://localhost:8000/api/peers/AUDIO-NODE-ABC1/latency
```

### Link with Peer
```bash
# One operation: SSH + mDNS + LCD routing
curl -X POST http://localhost:8000/api/peers/AUDIO-NODE-ABC1/link \
  -H "Content-Type: application/json" \
  -d '{
    "peer_id": "AUDIO-NODE-ABC1",
    "peer_host": "192.168.1.100",
    "peer_user": "mm",
    "setup_ssh": true,
    "setup_lcd_routing": true
  }'
```

---

## Health Checks & Remediation

### Run Health Checks
```bash
# Get health status
curl http://localhost:8000/api/deployment/health/status

# Run all checks
curl http://localhost:8000/api/deployment/health/checks

# Full health report
curl http://localhost:8000/api/deployment/health
```

### Get Readiness Checklist
```bash
curl http://localhost:8000/api/deployment/readiness-checklist
```

### Execute Remediation
```bash
# Available actions
curl http://localhost:8000/api/deployment/remediation/available

# Restart mDNS
curl -X POST http://localhost:8000/api/deployment/remediation/restart_mdns

# Restart SSH
curl -X POST http://localhost:8000/api/deployment/remediation/restart_ssh

# Restart backend
curl -X POST http://localhost:8000/api/deployment/remediation/restart_backend

# Run network diagnostics
curl -X POST http://localhost:8000/api/deployment/remediation/check_network

# Regenerate SSH keys
curl -X POST http://localhost:8000/api/deployment/remediation/regenerate_ssh_keys

# Re-discover peers
curl -X POST http://localhost:8000/api/deployment/remediation/rediscover_peers
```

---

## Environment Variables

```bash
# Set deployment mode on startup
export MAP2_DEPLOYMENT_MODE=AUDIO-NODE  # or CONTROL-NODE, ALL-IN-ONE, FRONTEND-ONLY

# Remote backend for frontend-only mode
export MAP2_REMOTE_BACKEND=http://audio-node:8000

# API port
export MAP2_API_PORT=8000

# Use mock LCD (no hardware required)
export MAP2_USE_MOCK_LCD=true
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `~/.map2/deployment.json` | Persistent deployment config |
| `~/.map2/ssh_trust/trusted_peers.json` | Trusted peer list |
| `~/.ssh/map2_*` | SSH key pairs |
| `~/.ssh/authorized_keys` | Trusted peer public keys |

---

## TUI Usage

### Access Cluster Screen
```bash
# In TUI, press 'c' to go to Cluster tab
./tui.sh
# Press: c
```

### Cluster Screen Tabs
- **Peers** - Discovered peers with latency
- **Readiness** - Mode requirements checklist  
- **Actions** - Available remediation actions

### Cluster Screen Buttons
- **Refresh** - Update all status
- **Ping All** - Measure latency to all peers
- **Link Peer** - Link with selected peer
- **Run Checks** - Execute health checks
- **Restart mDNS** - Restart discovery service
- **Restart SSH** - Restart SSH service
- **Mode Buttons** - Switch deployment mode

---

## Common Workflows

### Setup Multi-Node Audio Network

1. **On AUDIO-NODE:**
   ```bash
   MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start
   curl -X POST http://localhost:8000/api/ssh/keys/generate
   curl http://localhost:8000/api/ssh/keys  # Get public key
   ```

2. **On CONTROL-NODE:**
   ```bash
   MAP2_DEPLOYMENT_MODE=CONTROL-NODE ./map2.sh start
   curl -X POST http://localhost:8000/api/ssh/keys/generate
   curl http://localhost:8000/api/peers  # Wait for discovery
   ```

3. **Link peers (from either node):**
   ```bash
   curl -X POST http://localhost:8000/api/peers/AUDIO-NODE-ABC1/link \
     -H "Content-Type: application/json" \
     -d '{
       "peer_id": "AUDIO-NODE-ABC1",
       "peer_host": "192.168.1.100",
       "peer_user": "mm"
     }'
   ```

### Troubleshoot Discovery Issues

1. **Check network:**
   ```bash
   curl -X POST http://localhost:8000/api/deployment/remediation/check_network
   ```

2. **Verify mDNS:**
   ```bash
   curl http://localhost:8000/api/deployment/health/checks | grep mdns
   ```

3. **Restart discovery:**
   ```bash
   curl -X POST http://localhost:8000/api/deployment/remediation/restart_mdns
   ```

4. **Re-discover peers:**
   ```bash
   curl -X POST http://localhost:8000/api/deployment/remediation/rediscover_peers
   ```

### Monitor Peer Latency

```bash
# Initial measurement
curl -X POST http://localhost:8000/api/peers/PEER-ID/ping

# Get history
curl http://localhost:8000/api/peers/PEER-ID/latency

# Example output:
# {
#   "peer_id": "AUDIO-NODE-ABC1",
#   "average_latency_ms": 2.5,
#   "min_latency_ms": 2.1,
#   "max_latency_ms": 3.2,
#   "packet_loss_percent": 0.0,
#   "measurements": [...]
# }
```

---

## Response Examples

### Deployment Mode Response
```json
{
  "mode": "AUDIO-NODE",
  "description": "Dedicated audio processing node with API"
}
```

### Peer Discovery Response
```json
{
  "local_node_id": "CONTROL-NODE-XYZ9",
  "discovery_enabled": true,
  "discovery_uptime": "00:45:32",
  "peers_discovered": 2,
  "peers_connected": 1,
  "peers": [
    {
      "node_id": "AUDIO-NODE-ABC1",
      "node_mode": "AUDIO-NODE",
      "host": "192.168.1.100",
      "port": 8000,
      "api_url": "http://192.168.1.100:8000",
      "ws_url": "ws://192.168.1.100:8000/ws",
      "ssh_url": "ssh://mm@192.168.1.100",
      "latency_ms": 2.5,
      "ssh_trusted": true
    }
  ]
}
```

### Health Status Response
```json
{
  "mode": "AUDIO-NODE",
  "overall_status": "healthy",
  "checks_passed": 7,
  "checks_warned": 0,
  "checks_failed": 0,
  "total_checks": 7
}
```

### SSH Trust Status
```json
{
  "local_node_id": "CONTROL-NODE-XYZ9",
  "local_fingerprint": "SHA256:...",
  "trusted_peers": [
    {
      "peer_id": "AUDIO-NODE-ABC1",
      "trusted": true,
      "fingerprint": "SHA256:...",
      "trusted_at": "2026-02-05T10:30:00"
    }
  ]
}
```

---

## Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| Peers not discovered | `curl http://localhost:8000/api/deployment/health/checks` | `curl -X POST http://localhost:8000/api/deployment/remediation/restart_mdns` |
| SSH connection fails | Check `~/.ssh/authorized_keys` exists | `curl -X POST http://localhost:8000/api/ssh/keys/generate` |
| High latency | Check network: `curl -X POST http://localhost:8000/api/deployment/remediation/check_network` | Check WiFi/network conditions |
| Mode won't switch | Check service policies conflict | Review config: `curl http://localhost:8000/api/deployment/config` |
| Health checks failing | Run detailed report: `curl http://localhost:8000/api/deployment/health` | Execute suggested remediation |

---

## Documentation References

- **Full System Design:** [DEPLOYMENT_SYSTEM_COMPLETE.md](DEPLOYMENT_SYSTEM_COMPLETE.md)
- **Architecture:** [DISTRIBUTED_DEPLOYMENT_ARCHITECTURE.md](DISTRIBUTED_DEPLOYMENT_ARCHITECTURE.md)
- **Implementation:** [Implementation files listed above]

---

Generated: February 5, 2026
Last Updated: Complete Implementation
Status: ✅ Production Ready

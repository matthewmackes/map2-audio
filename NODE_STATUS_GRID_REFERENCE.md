# Node Status Grid — Quick Visual Reference

## Grid Appearance

### When Backend is Online

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NODE STATUS GRID                                 │
├─────────────────────────────────────────────────────────────────────┤
│  Hostname:              MAP2-TESTBED
│  Node Mode:             audio
│  IP Address:            172.20.234.234
│  Backend API:           Online
│  Services:              11/13 running
│  Connected Nodes:       3
│  API Version:           1.24.25.1
└─────────────────────────────────────────────────────────────────────┘
```

### When Backend is Offline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NODE STATUS GRID                                 │
├─────────────────────────────────────────────────────────────────────┤
│  Hostname:              MAP2-TESTBED
│  Node Mode:             audio
│  IP Address:            172.20.234.234
│  Backend API:           Offline
│  Services:              0/0 running
│  Connected Nodes:       N/A
│  API Version:           N/A
└─────────────────────────────────────────────────────────────────────┘
```

### When Incomplete Data Available

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NODE STATUS GRID                                 │
├─────────────────────────────────────────────────────────────────────┤
│  Hostname:              MAP2-AUDIO-01
│  Node Mode:             management
│  IP Address:            192.168.1.42
│  Backend API:           Online
│  Services:              8/13 running
│  Connected Nodes:       5
│  API Version:           1.24.20.5
└─────────────────────────────────────────────────────────────────────┘
```

---

## Field Definitions

### Hostname
- **What**: System's network hostname
- **Format**: Text string (e.g., MAP2-TESTBED)
- **Used for**: Node identification in cluster

### Node Mode
- **What**: Current deployment role
- **Values**: 
  - `audio` = Dedicated audio processing node
  - `management` = Cluster management node
  - `all-in-one` = Combined audio + management
- **Used for**: Understanding node purpose

### IP Address
- **What**: Primary network interface IP
- **Format**: IPv4 address (e.g., 172.20.234.234)
- **Used for**: SSH access, node communication

### Backend API
- **What**: FastAPI backend service status
- **Values**: 
  - `Online` = Responding to health checks
  - `Offline` = Not responding
- **Used for**: Quick health check

### Services
- **What**: Running services count
- **Format**: `X/Y running` (e.g., 11/13 running)
- **Used for**: Identifying missing services

### Connected Nodes
- **What**: Peer nodes in cluster
- **Format**: Number or N/A (e.g., 3)
- **Used for**: Cluster health assessment

### API Version
- **What**: Backend API version
- **Format**: Semantic version (e.g., 1.24.25.1)
- **Used for**: Compatibility checks, debugging

---

## Color Legend

In actual display, these elements are color-coded:

```
┌────────────────────────────── BLUE BORDERS ────────────────────────┐
│                    YELLOW TITLE TEXT                               │
├────────────────────────────────────────────────────────────────────┤
│  Label1:                GRAY TEXT
│  Label2:                GREEN (when healthy)
│  Label3:                GRAY TEXT (when offline)
└────────────────────────────────────────────────────────────────────┘
```

### Mode-Specific Colors

- **audio** → GREEN (healthy dedicated node)
- **management** → BLUE (management node)
- **all-in-one** → YELLOW (combined mode)

---

## Information Hierarchy

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  TIER 1: NODE IDENTITY                                           ┃
┃  ├─ Hostname         (Cluster member identifier)                 ┃
┃  ├─ Node Mode        (Role in deployment)                        ┃
┃  └─ IP Address       (Network connectivity)                      ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  TIER 2: SYSTEM HEALTH                                           ┃
┃  ├─ Backend API      (Core service status)                       ┃
┃  └─ Services        (Individual service health)                  ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  TIER 3: CLUSTER CONTEXT                                         ┃
┃  ├─ Connected Nodes  (Cluster membership)                        ┃
┃  └─ API Version      (Compatibility info)                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

## Troubleshooting Guide

### All Values Show "N/A" or "Unknown"

**Issue**: API completely unreachable

**Solution**:
```bash
# Start backend
systemctl start map2-backend

# Wait for startup (~30s)
sleep 30

# Re-source welcome
source /home/mm/map2-audio/branding/welcome.sh
```

### Node Mode Shows "Unknown"

**Issue**: `/etc/guitarfx-mode.conf` not readable

**Solution**:
```bash
# Check file exists
cat /etc/guitarfx-mode.conf

# Check permissions
ls -l /etc/guitarfx-mode.conf

# Verify format
grep deployment_mode /etc/guitarfx-mode.conf
```

### IP Address Shows "N/A"

**Issue**: `hostname -I` not working

**Solution**:
```bash
# Check IP directly
ip addr show

# Or use ifconfig
ifconfig -a

# Verify hostname works
hostname -I
```

### Services Count is "0/0"

**Issue**: Backend responding but health check failing

**Solution**:
```bash
# Test health endpoint
curl http://localhost:8080/api/health | python3 -m json.tool

# Check logs
journalctl -u map2-backend -n 50
```

---

## Interpreting the Grid

### Healthy Node
```
✓ All fields populated with values
✓ Node Mode is expected value
✓ Backend API is "Online"
✓ Services are "X/Y" with reasonable numbers
✓ Connected Nodes >= 1
✓ API Version is populated
```

### Unhealthy Node
```
✗ Multiple "N/A" or "Unknown" values
✗ Backend API is "Offline"
✗ Services are "0/0"
✗ Connected Nodes is "N/A"
```

### Degraded Node
```
△ Some services missing (e.g., 5/13 running)
△ Fewer connected nodes than expected
△ But Backend API is still "Online"
```

---

## Data Refresh

The grid is static during a session. To refresh:

```bash
# Re-source the welcome script
source /home/mm/map2-audio/branding/welcome.sh
```

Or create a new shell session:
```bash
# Automatic if added to ~/.bashrc
bash
```

---

## Integration with Other Tools

### SSH Login

Grid appears automatically on SSH login if added to ~/.bashrc:
```bash
echo "source /home/mm/map2-audio/branding/welcome.sh" >> ~/.bashrc
```

### Monitoring Scripts

Grid data can be parsed from script output:
```bash
# Extract hostname
source /home/mm/map2-audio/branding/welcome.sh | grep "Hostname:"

# Extract API status
source /home/mm/map2-audio/branding/welcome.sh | grep "Backend API:"
```

### Remote Dashboard

Capture grid output for centralized monitoring:
```bash
ssh user@node1 "source /home/mm/map2-audio/branding/welcome.sh" > node1_status.txt
ssh user@node2 "source /home/mm/map2-audio/branding/welcome.sh" > node2_status.txt
```

---

## Example Scenarios

### Scenario 1: Audio Node Ready
```
Hostname:              AUDIO-NODE-01
Node Mode:             audio              [GREEN]
IP Address:            10.0.0.5
Backend API:           Online             [GREEN]
Services:              13/13 running      [GREEN]
Connected Nodes:       4
API Version:           1.24.25.1
```
✅ Ready for audio processing

### Scenario 2: Management Node
```
Hostname:              MGMT-NODE-01
Node Mode:             management         [BLUE]
IP Address:            10.0.0.10
Backend API:           Online             [GREEN]
Services:              10/13 running
Connected Nodes:       5
API Version:           1.24.25.1
```
✅ Managing cluster of 5 nodes

### Scenario 3: Node Starting Up
```
Hostname:              AUDIO-NODE-02
Node Mode:             audio              [GREEN]
IP Address:            10.0.0.6
Backend API:           Offline            [GRAY]
Services:              0/0 running        [GRAY]
Connected Nodes:       N/A
API Version:           N/A
```
⏳ Backend still initializing

### Scenario 4: Degraded Node
```
Hostname:              AUDIO-NODE-03
Node Mode:             audio              [GREEN]
IP Address:            10.0.0.7
Backend API:           Online             [GREEN]
Services:              8/13 running       [YELLOW]
Connected Nodes:       3
API Version:           1.24.25.1
```
⚠️ Some services missing, investigate

---

## Summary

| Aspect | Details |
|--------|---------|
| **Location** | Top of welcome message |
| **Update frequency** | Once per session (manual refresh available) |
| **Data sources** | System + 3 API endpoints |
| **Timeout** | 2 seconds (non-blocking) |
| **Display time** | <1 second after data collected |
| **Color coding** | Mode, status, health |
| **Customizable** | Yes (colors, fields, layout) |
| **Required tools** | Standard Linux utils only |

---

**Use this grid for at-a-glance node health and connectivity assessment.**

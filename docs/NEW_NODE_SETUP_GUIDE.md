# MAP2 Audio Cluster - New Node Setup Guide

## Overview

This guide walks you through setting up a new node to join your MAP2 Audio cluster, from bare metal installation through cluster join and verification.

**Estimated Time**: 45-60 minutes  
**Difficulty**: Intermediate  
**Prerequisites**: 
- Physical or virtual machine with x86_64 CPU
- 8GB+ RAM recommended
- 40GB+ storage
- Network connectivity to cluster
- Audio interface (optional, for audio processing nodes)

---

## Phase 1: Fedora Server Installation

### Step 1.1: Download Fedora Server

1. Download **Fedora Server 40** (or latest version)
   - URL: https://fedoraproject.org/server/download
   - Choose: **Fedora Server (Standard)**
   - Architecture: **x86_64**

2. Create bootable media:
   ```bash
   # On Linux:
   sudo dd if=Fedora-Server-40.iso of=/dev/sdX bs=4M status=progress
   
   # Or use Fedora Media Writer (GUI tool)
   ```

### Step 1.2: Boot Installation Media

1. Insert bootable media
2. Boot from USB/DVD
3. Select **Install Fedora 40**

### Step 1.3: Installation Configuration

#### Language & Keyboard
- **Language**: English (or your preference)
- **Keyboard**: US (or your preference)

#### Installation Destination (Storage)
**Recommended Settings for Cluster Node**:

- **Storage**: Select your target disk
- **Partitioning**: 
  - ✅ **Custom** (recommended for cluster nodes)
  - Standard partitioning scheme:
    ```
    /boot      1 GB    (ext4)
    /boot/efi  500 MB  (FAT32 - UEFI systems)
    /          20 GB   (ext4 or xfs)
    /home      10 GB   (ext4 or xfs)
    /var       5 GB    (ext4 or xfs) - For logs
    /opt       5 GB    (ext4 or xfs) - For MAP2 installation
    swap       8 GB    (or equal to RAM)
    ```
  
  - OR **Automatic** (acceptable for testing):
    - Uses LVM by default
    - Simpler but less control

#### Network & Hostname
**Critical for cluster operation**:

1. **Network Configuration**:
   - Click on your network interface
   - **IPv4 Settings**:
     - Method: **Manual** (recommended for cluster nodes)
     - Address: `192.168.1.10` (or your cluster subnet)
     - Netmask: `255.255.255.0`
     - Gateway: `192.168.1.1` (your router)
     - DNS: `8.8.8.8, 1.1.1.1` (or your DNS server)
   
   - OR Method: **DHCP** (if you have DHCP reservations)
   
2. **Hostname**:
   - Format: `map2-node-XX` where XX is node number
   - Example: `map2-node-01`, `map2-node-02`, etc.
   - ✅ Use consistent naming scheme across cluster

3. **Enable on boot**: ✅ Check this box

#### Software Selection
**Recommended for MAP2 Cluster Node**:

- Base Environment: **Minimal Install** ✅ (recommended)
  - Provides clean, lightweight system
  - Less resource overhead
  - Better security posture
  
- OR: **Fedora Server** (includes more tools)

**Additional Software** (select these):
- ✅ Standard (basic utilities)
- ⬜ Guest Agents (only if VM)
- ⬜ Network Servers (not needed, MAP2 provides services)

#### User Creation
1. **Root Password**: 
   - Set strong password
   - ⬜ Do NOT lock root account (needed for initial setup)

2. **Create User**:
   - Full name: `MAP2 Admin` (or your name)
   - Username: `map2admin` (or your preference)
   - ✅ Make this user administrator
   - Set strong password

#### Installation Options Summary
```
┌─────────────────────────────────────────────────────┐
│ Recommended Settings for MAP2 Cluster Node         │
├─────────────────────────────────────────────────────┤
│ Installation Type:   Minimal Install               │
│ Partitioning:        Custom (see layout above)     │
│ Network:             Static IP (cluster subnet)    │
│ Hostname:            map2-node-XX                  │
│ Root Account:        Enabled with password         │
│ User Account:        Admin user created            │
│ Firewall:            Enabled (default)             │
│ SELinux:             Enforcing (default)           │
└─────────────────────────────────────────────────────┘
```

### Step 1.4: Begin Installation

1. Click **Begin Installation**
2. Wait for installation to complete (~10-15 minutes)
3. Click **Reboot System**
4. Remove installation media when prompted

---

## Phase 2: Post-Installation System Setup

### Step 2.1: First Boot

1. System boots to login prompt
2. Login as your admin user (e.g., `map2admin`)

### Step 2.2: Update System

```bash
# Update all packages to latest versions
sudo dnf update -y

# Reboot if kernel was updated
sudo reboot
```

### Step 2.3: Install Essential Packages

```bash
# Install development tools and utilities
sudo dnf install -y \
  git \
  vim \
  curl \
  wget \
  htop \
  net-tools \
  python3 \
  python3-pip \
  nodejs \
  npm

# Install audio subsystem
sudo dnf install -y \
  pipewire \
  pipewire-alsa \
  pipewire-pulseaudio \
  pipewire-jack-audio-connection-kit \
  wireplumber \
  alsa-utils

# Enable and start PipeWire
systemctl --user enable --now pipewire pipewire-pulse wireplumber
```

### Step 2.4: Configure Firewall

```bash
# Allow MAP2 services through firewall
sudo firewall-cmd --permanent --add-port=8080/tcp    # Backend API
sudo firewall-cmd --permanent --add-port=3000/tcp    # Frontend Web
sudo firewall-cmd --permanent --add-port=5353/udp    # mDNS discovery
sudo firewall-cmd --permanent --add-port=8765/tcp    # WebSocket cluster
sudo firewall-cmd --reload

# Verify firewall rules
sudo firewall-cmd --list-all
```

### Step 2.5: Configure SSH (Optional but Recommended)

```bash
# Enable and start SSH
sudo systemctl enable --now sshd

# Configure SSH for key-based auth (more secure)
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add your public key to authorized_keys
# (copy from your main workstation)
echo "your-ssh-public-key-here" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Step 2.6: Set Hostname (if not done during install)

```bash
# Set hostname
sudo hostnamectl set-hostname map2-node-02

# Verify
hostnamectl
```

---

## Phase 3: Install MAP2 Audio Platform

### Option A: RPM Installation (Production - Recommended)

**For production cluster nodes using stable releases:**

```bash
# Download latest RPM from GitHub releases
VERSION="1.0.0"
curl -L -O "https://github.com/matthewmackes/map2-audio/releases/download/v${VERSION}/map2-audio-${VERSION}-1.fc40.x86_64.rpm"

# Install MAP2 Audio
sudo dnf install -y ./map2-audio-${VERSION}-1.fc40.x86_64.rpm

# Verify installation
rpm -qi map2-audio
systemctl list-unit-files | grep map2
```

The RPM installation automatically:
- ✅ Creates `/opt/map2` directory
- ✅ Installs all dependencies
- ✅ Creates `map2` system user
- ✅ Installs systemd service units
- ✅ Configures permissions

### Option B: Git Installation (Development)

**For development nodes or testing latest features:**

```bash
# Clone repository
cd /opt
sudo git clone https://github.com/matthewmackes/map2-audio.git
cd map2-audio

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies and build frontend
cd web
npm ci
npm run build
cd ..

# Create map2 user
sudo useradd -r -s /sbin/nologin -d /var/lib/map2 -m map2

# Set permissions
sudo chown -R map2:map2 /opt/map2-audio
sudo chmod -R 755 /opt/map2-audio

# Create required directories
sudo mkdir -p /etc/map2/{ssl,ssh}
sudo mkdir -p /var/lib/map2/{backups,config-repo,logs}
sudo mkdir -p /var/log/map2

sudo chown -R map2:map2 /etc/map2 /var/lib/map2 /var/log/map2
```

---

## Phase 4: Configure MAP2 for Cluster

### Step 4.1: Create Configuration File

```bash
# Create main configuration
sudo mkdir -p /etc/map2
sudo vim /etc/map2/config.yml
```

**Minimal cluster configuration:**

```yaml
# /etc/map2/config.yml

# Node identification
node:
  id: "node-02"                    # Unique node ID
  name: "MAP2 Node 02"            # Friendly name
  role: "worker"                   # master, worker, or hybrid
  
# Cluster configuration
cluster:
  enabled: true                    # Enable cluster mode
  discovery_method: "mdns"         # mdns, manual, or consul
  master_nodes:                    # List of master nodes (if using manual)
    - "192.168.1.10:8080"
  
# Network settings
network:
  bind_address: "0.0.0.0"         # Listen on all interfaces
  api_port: 8080
  websocket_port: 8765
  
# Audio configuration
audio:
  backend: "pipewire"              # pipewire or jack
  sample_rate: 48000
  buffer_size: 256
  channels: 2
  
# Update system
update:
  mode: "auto"                     # auto, git, or rpm
  auto_update: false               # Don't auto-update in production
  
# Logging
logging:
  level: "INFO"                    # DEBUG, INFO, WARNING, ERROR
  file: "/var/log/map2/map2.log"
```

### Step 4.2: Set Permissions

```bash
sudo chown map2:map2 /etc/map2/config.yml
sudo chmod 644 /etc/map2/config.yml
```

---

## Phase 5: Easy Cluster Join

### Method 1: Automatic Discovery (mDNS - Easiest)

**Prerequisites**: Master node and new node on same subnet

```bash
# Start MAP2 services
sudo systemctl start map2-backend

# The node will automatically:
# 1. Broadcast mDNS service announcement
# 2. Discover master node(s)
# 3. Register with cluster
# 4. Sync configuration

# Monitor discovery process
sudo journalctl -u map2-backend -f
```

**Expected output:**
```
[INFO] Starting MAP2 Audio Platform...
[INFO] Cluster mode enabled
[INFO] Broadcasting mDNS service: _map2._tcp
[INFO] Discovered master node: map2-master-01 (192.168.1.10)
[INFO] Registering with cluster...
[INFO] Cluster join successful! Node ID: node-02
[INFO] Syncing cluster configuration...
[INFO] Node ready and operational
```

### Method 2: Easy Join Script (Recommended)

**For quick, guided setup:**

```bash
# Run the easy join script
sudo /opt/map2-audio/scripts/easy-join.sh

# Interactive prompts:
# ? Enter master node IP: 192.168.1.10
# ? Enter this node's name: MAP2 Node 02
# ? Select node role: [worker]
# ? Configure audio interface? [Y/n]: Y
# ? Select audio device: [0] Default
# 
# ✓ Connecting to master...
# ✓ Registering node...
# ✓ Downloading cluster configuration...
# ✓ Configuring audio...
# ✓ Starting services...
# 
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ✅ Node successfully joined cluster!
# 
# Node ID:     node-02
# Master:      192.168.1.10
# Services:    Running
# Cluster:     Connected
# 
# Access Web UI: http://192.168.1.10:3000
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Method 3: Web UI Join (Most User-Friendly)

**From the master node's web interface:**

1. **Access Master Web UI**:
   - Navigate to: `http://[master-ip]:3000`
   - Login with admin credentials

2. **Go to Cluster Management**:
   - Click **Cluster** → **Nodes** → **Add Node**

3. **Generate Join Token**:
   - Click **Generate Join Token**
   - Copy the token (valid for 1 hour)

4. **On New Node**:
   ```bash
   # Use join token
   sudo /opt/map2-audio/scripts/join-with-token.sh
   
   # Paste token when prompted:
   # ? Enter join token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   # 
   # ✓ Token validated
   # ✓ Joining cluster...
   # ✓ Success!
   ```

5. **Verify in Web UI**:
   - New node appears in Cluster Nodes list
   - Status shows **Connected**

### Method 4: Manual Registration (Advanced)

**For custom setups or troubleshooting:**

```bash
# Use API to join cluster
curl -X POST http://192.168.1.10:8080/api/cluster/nodes/join \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "node-02",
    "node_name": "MAP2 Node 02",
    "node_role": "worker",
    "api_address": "192.168.1.11:8080",
    "websocket_address": "192.168.1.11:8765",
    "capabilities": ["audio_processing", "mixing", "effects"]
  }'

# Expected response:
# {
#   "status": "ok",
#   "message": "Node registered successfully",
#   "node_id": "node-02",
#   "cluster_config": { ... }
# }
```

---

## Phase 6: Start Services

### Step 6.1: Enable and Start Services

```bash
# Enable services to start on boot
sudo systemctl enable map2-backend
sudo systemctl enable map2-frontend
sudo systemctl enable map2-cluster

# Start services
sudo systemctl start map2-backend
sudo systemctl start map2-frontend
sudo systemctl start map2-cluster

# Check service status
sudo systemctl status map2-backend
sudo systemctl status map2-frontend
sudo systemctl status map2-cluster
```

### Step 6.2: Verify Services

```bash
# Check that services are running
systemctl is-active map2-backend
systemctl is-active map2-frontend
systemctl is-active map2-cluster

# Test API endpoint
curl http://localhost:8080/api/health

# Expected response:
# {"status": "ok", "version": "1.0.0", "node_id": "node-02"}

# Check logs
sudo journalctl -u map2-backend -n 50
sudo journalctl -u map2-cluster -n 50
```

---

## Phase 7: Verification and Testing

### Step 7.1: Verify Cluster Connectivity

```bash
# Check cluster status
curl http://localhost:8080/api/cluster/status

# Expected response:
# {
#   "cluster_connected": true,
#   "master_node": "192.168.1.10",
#   "cluster_size": 3,
#   "node_id": "node-02",
#   "role": "worker"
# }
```

### Step 7.2: Verify from Master Node

**On master node or via Web UI:**

```bash
# List all cluster nodes
curl http://192.168.1.10:8080/api/cluster/nodes

# Expected to see new node in list:
# {
#   "nodes": [
#     {"id": "master-01", "name": "Master", "status": "online"},
#     {"id": "node-01", "name": "Node 01", "status": "online"},
#     {"id": "node-02", "name": "Node 02", "status": "online"}  ← New!
#   ]
# }
```

### Step 7.3: Test Audio Path (if audio interface present)

```bash
# List audio devices
aplay -l

# Test audio output
speaker-test -c 2 -t wav

# Check PipeWire status
systemctl --user status pipewire

# Test MAP2 audio routing (via API)
curl -X POST http://localhost:8080/api/audio/test \
  -d '{"duration": 5, "frequency": 440}'
```

### Step 7.4: Access Web Interface

1. From any browser on the network:
   - Navigate to: `http://[master-node-ip]:3000`
   - Or: `http://192.168.1.10:3000`

2. Verify new node appears in:
   - **Cluster** → **Nodes** (should show online)
   - **Dashboard** → **System Status**

---

## Phase 8: Post-Setup Configuration

### Step 8.1: Configure Node-Specific Settings

**Audio routing, plugins, effects specific to this node:**

```bash
# Edit node-specific config
sudo vim /etc/map2/node.yml
```

```yaml
# Node-specific overrides
audio:
  devices:
    primary: "hw:0,0"              # Primary audio interface
    secondary: "hw:1,0"            # Secondary (if available)
  
  routing:
    inputs: ["mic_1", "mic_2"]
    outputs: ["main_out", "monitor"]
    
plugins:
  enabled: true
  scan_paths:
    - "/usr/lib64/lv2"
    - "/opt/map2/plugins"
    
effects:
  auto_load: ["reverb", "compressor"]
```

### Step 8.2: Configure Firewall Rules (if needed)

```bash
# If node needs additional ports
sudo firewall-cmd --permanent --add-port=XXXX/tcp
sudo firewall-cmd --reload
```

### Step 8.3: Set Up Automated Backups

```bash
# Configure backup to master node
sudo vim /etc/map2/backup.yml
```

```yaml
backup:
  enabled: true
  schedule: "0 2 * * *"            # Daily at 2 AM
  remote_host: "192.168.1.10"
  remote_path: "/var/lib/map2/backups/node-02"
  items:
    - /etc/map2/
    - /var/lib/map2/
```

---

## Troubleshooting

### Issue: Node Cannot Discover Master

**Symptoms**: mDNS discovery fails

**Solutions**:
```bash
# Check firewall allows mDNS
sudo firewall-cmd --add-service=mdns --permanent
sudo firewall-cmd --reload

# Check Avahi daemon running
sudo systemctl status avahi-daemon
sudo systemctl enable --now avahi-daemon

# Manually specify master in config
sudo vim /etc/map2/config.yml
# Set: discovery_method: "manual"
# Add master_nodes: ["192.168.1.10:8080"]
```

### Issue: Services Fail to Start

**Solutions**:
```bash
# Check logs
sudo journalctl -u map2-backend -n 100

# Check permissions
sudo chown -R map2:map2 /opt/map2 /var/lib/map2 /var/log/map2

# Verify Python dependencies
pip list | grep -E "(fastapi|uvicorn|pydantic)"

# Reinstall if needed
pip install --force-reinstall -r /opt/map2/requirements.txt
```

### Issue: Cannot Access Web UI

**Solutions**:
```bash
# Check frontend service
sudo systemctl status map2-frontend

# Check firewall
sudo firewall-cmd --list-all | grep 3000

# Test locally first
curl http://localhost:3000
```

### Issue: Audio Device Not Detected

**Solutions**:
```bash
# List audio devices
aplay -l
arecord -l

# Check PipeWire
systemctl --user status pipewire
pw-cli ls Node

# Restart audio subsystem
systemctl --user restart pipewire wireplumber
```

---

## Quick Reference Commands

```bash
# Service management
sudo systemctl start map2-backend
sudo systemctl stop map2-backend
sudo systemctl restart map2-backend
sudo systemctl status map2-backend

# View logs
sudo journalctl -u map2-backend -f          # Follow logs
sudo journalctl -u map2-backend -n 50       # Last 50 lines
sudo journalctl -u map2-backend --since "1 hour ago"

# Test cluster connectivity
curl http://localhost:8080/api/cluster/status
curl http://localhost:8080/api/health

# Update node
# Via RPM:
sudo dnf update map2-audio
# Via git:
cd /opt/map2-audio && sudo git pull

# Restart all services
sudo systemctl restart map2-{backend,frontend,cluster}
```

---

## Next Steps

After successful node setup:

1. **Configure Audio Routing**: Set up audio inputs/outputs in Web UI
2. **Install Plugins**: Add LV2/VST plugins for effects processing
3. **Test Audio Path**: Verify audio flows correctly through cluster
4. **Set Up Monitoring**: Configure alerts and notifications
5. **Join Production**: Add node to production cluster configuration

## Additional Resources

- **Main Documentation**: [CLUSTER_MANAGEMENT_IMPLEMENTATION_GUIDE.md](../CLUSTER_MANAGEMENT_IMPLEMENTATION_GUIDE.md)
- **Update System**: [UPDATE_SYSTEM_USAGE.md](UPDATE_SYSTEM_USAGE.md)
- **Troubleshooting**: [CLUSTER_DASHBOARD_QUICK_START.md](../CLUSTER_DASHBOARD_QUICK_START.md)
- **Web Interface**: Access at `http://[master-ip]:3000`

---

**Setup Complete!** Your new node is now part of the MAP2 Audio cluster and ready for audio processing.

For support, consult the documentation or check logs with `journalctl`.

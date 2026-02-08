# MAP2 Audio - Quick Node Installation

## One-Line Install Command

Run this command on a fresh Fedora Server installation to set up a new MAP2 cluster node:

```bash
curl -fsSL https://raw.githubusercontent.com/matthewmackes/map2-audio/master/scripts/install-node.sh | sudo bash
```

Or download and run separately:

```bash
wget https://raw.githubusercontent.com/matthewmackes/map2-audio/master/scripts/install-node.sh
sudo bash install-node.sh
```

## What Does This Script Do?

The installation script provides a **full-featured TUI (Text User Interface)** wizard that walks you through:

### ✅ Pre-Installation
- System compatibility checks (Fedora 40+)
- Internet connectivity verification
- Automatic dependency installation
- Logging initialization

### 📋 Configuration Wizard

**Interactive TUI screens guide you through:**

1. **Installation Mode Selection**
   - RPM package (production/stable)
   - Git repository (development/latest)

2. **Node Configuration**
   - Node ID (e.g., `node-02`)
   - Node name (e.g., `MAP2 Node 02`)
   - Node role (`master`, `worker`, `hybrid`)

3. **Network Configuration** (Optional)
   - Static IP configuration
   - Or use DHCP
   - Gateway and DNS settings

4. **Cluster Join Method**
   - **mDNS Auto-Discovery** (easiest, zero config)
   - **Manual** (specify master IP)
   - **Join Token** (from Web UI)
   - **Skip** (configure later)

5. **Audio Configuration** (Optional)
   - Select audio device
   - Set sample rate (default: 48000 Hz)
   - Set buffer size (default: 256 frames)

6. **Configuration Summary**
   - Review all settings
   - Confirm or restart wizard

### 🔧 Automatic Installation

**Progress bars show each step:**

1. System package updates
2. Dependency installation (Python, Node.js, audio subsystem)
3. MAP2 software installation (RPM or Git)
4. Directory structure creation
5. Configuration file generation
6. Firewall configuration (ports 8080, 3000, 8765, mDNS)
7. Audio subsystem setup (PipeWire)
8. Systemd service installation
9. Service startup
10. Cluster join process
11. Installation verification

### ✅ Post-Installation

- **Verification checks** ensure all services running
- **Completion screen** with:
  - Node details and status
  - Web UI access URLs
  - Log file locations
  - Next steps

## Requirements

- **OS**: Fedora Server 40+ (minimal install recommended)
- **Access**: Root or sudo privileges
- **Network**: Internet connectivity
- **Resources**: 
  - 2GB+ RAM (4GB+ recommended)
  - 20GB+ storage
  - x86_64 CPU

## Features of the TUI Installer

### User-Friendly Interface
- Clean, professional dialog-based UI
- Similar to Fedora's anaconda installer
- Progress bars for long operations
- Helpful descriptions and hints
- Input validation with error handling

### Intelligent Defaults
- Sensible default values pre-filled
- Auto-detection of:
  - Current IP address
  - Network gateway
  - Audio devices
  - Hostname

### Safe and Reliable
- Comprehensive error checking
- Detailed logging (`/var/log/map2/install.log`)
- Rollback on configuration restart
- Service verification before completion
- Non-destructive (won't modify existing configs without confirmation)

### Flexible Configuration
- Skip optional steps
- Go back and reconfigure
- Choose installation method
- Custom audio settings
- Multiple cluster join options

## Installation Time

- **Typical**: 15-20 minutes
- **With updates**: 25-30 minutes
- **Minimal (skip audio)**: 10-15 minutes

*Time varies based on internet speed and system performance*

## What Gets Installed

### System Packages
- Python 3 + pip
- Node.js + npm
- Git, curl, wget
- Avahi (mDNS)
- PipeWire (audio) - optional
- ALSA utilities - optional

### MAP2 Software

**RPM Mode:**
- `/opt/map2-audio/` - Application files
- Systemd service units
- System user `map2`

**Git Mode:**
- Cloned repository in `/opt/map2-audio/`
- Python dependencies via pip
- Frontend built from source
- System user `map2`

### Configuration Files
- `/etc/map2/config.yml` - Main configuration
- `/etc/systemd/system/map2-*.service` - Service units
- `/var/lib/map2/` - Data directory
- `/var/log/map2/` - Log files

### Network Configuration
- Firewall rules for MAP2 services
- Optional static IP configuration
- mDNS service announcement

## Cluster Join Methods

### 1. mDNS Auto-Discovery (Recommended)
**Best for**: Same subnet as master  
**Setup**: Automatic, zero configuration  
**How it works**: 
- Node broadcasts presence via mDNS
- Discovers master automatically
- Registers and syncs config

### 2. Manual IP
**Best for**: Different subnets, routed networks  
**Setup**: Enter master node IP  
**How it works**:
- Connects directly to master API
- Registers via REST endpoint
- Downloads cluster configuration

### 3. Join Token
**Best for**: Secure joins, controlled access  
**Setup**: Copy token from Web UI  
**How it works**:
- Generate token in master Web UI
- Paste during installation
- Token validates and registers node

### 4. Skip (Configure Later)
**Best for**: Testing, special setups  
**Setup**: Manual configuration post-install  
**How it works**:
- Completes installation only
- Join cluster later via Web UI or CLI

## Post-Installation Access

### Web Interface
Access the **cluster master** Web UI:
```
http://[master-ip]:3000
```

### API Endpoint
Node API available at:
```
http://[node-ip]:8080/api
```

### Service Management
```bash
# Check service status
systemctl status map2-backend
systemctl status map2-frontend
systemctl status map2-cluster

# View logs
journalctl -u map2-backend -f
journalctl -u map2-cluster -f

# Restart services
systemctl restart map2-backend
```

## Troubleshooting

### Script Fails to Download
```bash
# Alternative: Download manually
wget https://raw.githubusercontent.com/matthewmackes/map2-audio/master/scripts/install-node.sh
sudo bash install-node.sh
```

### Dialog/TUI Not Available
The script automatically installs `dialog` if missing, but you can install manually:
```bash
sudo dnf install -y dialog
```

### Services Don't Start
Check logs:
```bash
journalctl -u map2-backend -n 50
tail -f /var/log/map2/install.log
```

### Cluster Join Fails
- **mDNS**: Ensure firewall allows mDNS (port 5353/udp)
- **Manual**: Verify master IP is correct and reachable
- **Token**: Check token hasn't expired (1 hour validity)

### Audio Issues
```bash
# List audio devices
aplay -l

# Check PipeWire
systemctl --user status pipewire

# Restart audio
systemctl --user restart pipewire wireplumber
```

## Manual Configuration

If you skipped cluster join, configure manually:

### Edit Configuration
```bash
sudo vim /etc/map2/config.yml
```

### Join via API
```bash
curl -X POST http://[master-ip]:8080/api/cluster/nodes/join \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "node-02",
    "node_name": "MAP2 Node 02",
    "node_role": "worker",
    "api_address": "[node-ip]:8080",
    "websocket_address": "[node-ip]:8765"
  }'
```

### Restart Services
```bash
sudo systemctl restart map2-{backend,frontend,cluster}
```

## Uninstall

### RPM Installation
```bash
sudo dnf remove map2-audio
```

### Git Installation
```bash
sudo systemctl stop map2-{backend,frontend,cluster}
sudo systemctl disable map2-{backend,frontend,cluster}
sudo rm -rf /opt/map2-audio /etc/map2 /var/lib/map2 /var/log/map2
sudo userdel map2
sudo rm /etc/systemd/system/map2-*.service
sudo systemctl daemon-reload
```

## Security Considerations

- Script must run as root (uses `sudo`)
- All downloads via HTTPS
- Services run as unprivileged `map2` user
- Firewall configured automatically
- Logs sensitive operations

## Support

- **Documentation**: See [NEW_NODE_SETUP_GUIDE.md](NEW_NODE_SETUP_GUIDE.md)
- **Logs**: `/var/log/map2/install.log`
- **GitHub**: https://github.com/matthewmackes/map2-audio

---

## Quick Start Summary

```bash
# 1. Install Fedora Server 40+ (minimal)

# 2. Run installer
curl -fsSL https://raw.githubusercontent.com/matthewmackes/map2-audio/master/scripts/install-node.sh | sudo bash

# 3. Follow TUI wizard (15 minutes)

# 4. Access Web UI
#    http://[master-ip]:3000

# 5. Verify node is online
#    Dashboard → Cluster → Nodes
```

**That's it!** Your new node is ready to process audio in the MAP2 cluster.

# MAP2 Node Installation - Complete Summary

## 🎉 One-Line Installation Command

```bash
curl -fsSL https://raw.githubusercontent.com/matthewmackes/map2-audio/master/scripts/install-node.sh | sudo bash
```

That's it! This single command provides a complete, professional TUI-based installation wizard for adding new nodes to your MAP2 Audio cluster.

---

## 📦 What Was Created

### 1. **Full-Featured Installation Script**
   - **File**: `scripts/install-node.sh`
   - **Size**: ~1,200 lines of production-ready bash
   - **Features**:
     - Professional TUI using `dialog` (Fedora-style)
     - Complete installation automation
     - Error handling and validation
     - Detailed logging
     - Progress bars for all operations
     - Multiple cluster join methods
     - Audio subsystem configuration
     - Network configuration wizard

### 2. **Comprehensive Documentation** (4 files)

   **a) [docs/NEW_NODE_SETUP_GUIDE.md](docs/NEW_NODE_SETUP_GUIDE.md)**
   - Complete end-to-end setup guide
   - Phase-by-phase instructions
   - Manual installation steps
   - Troubleshooting section
   - ~600 lines

   **b) [docs/QUICK_NODE_INSTALL.md](docs/QUICK_NODE_INSTALL.md)**
   - Quick reference guide
   - One-line install command
   - Requirements and features
   - Post-installation access
   - ~350 lines

   **c) [docs/TUI_INSTALLER_GUIDE.md](docs/TUI_INSTALLER_GUIDE.md)**
   - Visual guide to TUI screens
   - Flow diagrams
   - Screenshot representations
   - User experience highlights
   - ~450 lines

   **Total Documentation**: ~1,400 lines

---

## ✨ Key Features

### 🎨 Professional TUI Interface
- **Dialog-based** interface like Fedora's anaconda installer
- **Progress bars** for all long-running operations
- **Form inputs** with validation
- **Menu selections** for options
- **Confirmation dialogs** before critical operations
- **Error handling** with helpful messages

### 🚀 Installation Modes

**RPM Mode (Production)**
- Downloads latest release from GitHub
- Installs via DNF package manager
- Automatic dependency resolution
- Systemd service units included
- Clean, stable, versioned releases

**Git Mode (Development)**
- Clones latest source code
- Installs Python dependencies
- Builds frontend from source
- Creates systemd services
- Always up-to-date with master branch

### 🔌 Four Cluster Join Methods

1. **mDNS Auto-Discovery** (Easiest)
   - Zero configuration
   - Automatic master discovery
   - Same subnet requirement
   - Broadcasts via Avahi

2. **Manual IP Entry**
   - Direct connection to master
   - Works across subnets
   - Simple IP address input
   - REST API registration

3. **Join Token** (Secure)
   - Generated in Web UI
   - Time-limited validity
   - Secure authentication
   - Paste and join

4. **Skip** (Configure Later)
   - Install only
   - Manual join later
   - Testing/development
   - Special configurations

### ⚙️ Configuration Options

**Node Settings**
- Node ID (e.g., `node-02`)
- Node name (friendly name)
- Node role (`master`, `worker`, `hybrid`)

**Network Settings**
- DHCP or static IP
- Gateway configuration
- DNS server settings
- Automatic detection of current settings

**Audio Settings** (Optional)
- Audio device selection
- Sample rate configuration
- Buffer size tuning
- PipeWire integration

**Firewall Configuration** (Automatic)
- Port 8080 (Backend API)
- Port 3000 (Frontend web)
- Port 8765 (WebSocket cluster)
- Port 5353 (mDNS discovery)

### 📊 Installation Process

```
1. Pre-flight Checks          → Root, OS, Internet
2. Welcome Screen             → User greeting
3. Configuration Wizard       → 5-7 interactive screens
4. System Update              → DNF update
5. Install Dependencies       → Python, Node.js, Audio
6. Install MAP2               → RPM or Git mode
7. Create Directories         → /etc, /var, /opt
8. Generate Configuration     → config.yml
9. Configure Firewall         → Open required ports
10. Configure Audio           → PipeWire setup
11. Install Services          → Systemd units
12. Start Services            → Enable and start
13. Join Cluster              → Selected method
14. Verify Installation       → Health checks
15. Completion Screen         → Success summary
```

**Total Time**: 15-30 minutes (depends on internet speed)

---

## 📋 System Requirements

### Minimum
- Fedora Server 40+
- 2GB RAM
- 20GB storage
- x86_64 CPU
- Internet connection

### Recommended
- Fedora Server 40 (minimal install)
- 4GB+ RAM
- 40GB+ storage
- Static IP address
- Audio interface (for processing nodes)
- Same subnet as master (for mDNS)

---

## 🎯 Usage Scenarios

### Scenario 1: Production Node (Recommended)
```bash
# On fresh Fedora Server installation
curl -fsSL https://raw.githubusercontent.com/matthewmackes/map2-audio/master/scripts/install-node.sh | sudo bash

# In wizard:
1. Choose: rpm
2. Enter node details
3. Configure static IP
4. Choose: manual (enter master IP)
5. Configure audio device
6. Confirm and install
```

**Result**: Stable, production-ready node joins cluster in ~20 minutes

### Scenario 2: Development Node
```bash
# On Fedora development machine
curl -fsSL https://raw.githubusercontent.com/matthewmackes/map2-audio/master/scripts/install-node.sh | sudo bash

# In wizard:
1. Choose: git
2. Enter node details
3. Use DHCP
4. Choose: mdns
5. Skip audio (if testing)
6. Confirm and install
```

**Result**: Latest code installed, automatic cluster join via mDNS

### Scenario 3: Secure Token Join
```bash
# Generate token in master Web UI first (valid 1 hour)
# Then on new node:
curl -fsSL https://raw.githubusercontent.com/matthewmackes/map2-audio/master/scripts/install-node.sh | sudo bash

# In wizard:
1. Choose: rpm
2. Enter node details
3. Configure network
4. Choose: token
5. Paste join token
6. Configure audio
7. Confirm and install
```

**Result**: Secure cluster join with authentication

---

## 🔍 What Gets Installed

### System Packages
```
git, curl, wget              # Utilities
python3, python3-pip         # Python runtime
nodejs, npm                  # JavaScript runtime
avahi, avahi-tools, nss-mdns # mDNS discovery
pipewire, wireplumber        # Audio (optional)
alsa-utils                   # Audio utilities (optional)
dialog                       # TUI interface
```

### MAP2 Software
```
/opt/map2-audio/             # Application files
/etc/map2/                   # Configuration
  ├── config.yml             # Main config
  ├── ssl/                   # SSL certificates
  └── ssh/                   # SSH keys
/var/lib/map2/               # Runtime data
  ├── backups/               # Backup storage
  ├── config-repo/           # Config repository
  └── logs/                  # Application logs
/var/log/map2/               # System logs
  └── install.log            # Installation log
```

### Systemd Services
```
map2-backend.service         # Backend API
map2-frontend.service        # Frontend web server
map2-cluster.service         # Cluster coordination
```

### Firewall Rules
```
8080/tcp  → Backend API
3000/tcp  → Frontend web interface
8765/tcp  → WebSocket cluster communication
mdns      → Service discovery (5353/udp)
```

---

## 📱 Post-Installation

### Access Points

**Cluster Web UI** (from any browser on network)
```
http://[master-ip]:3000
```

**Node API** (direct to this node)
```
http://[node-ip]:8080/api/health
http://[node-ip]:8080/api/cluster/status
```

### Service Management
```bash
# Check status
systemctl status map2-backend
systemctl status map2-frontend
systemctl status map2-cluster

# View logs
journalctl -u map2-backend -f
journalctl -u map2-cluster -f

# Restart services
systemctl restart map2-backend
systemctl restart map2-cluster
```

### Configuration
```bash
# Edit main config
sudo vim /etc/map2/config.yml

# After changes, restart services
sudo systemctl restart map2-backend map2-cluster
```

---

## 🐛 Troubleshooting

### Installation Fails

**Check logs:**
```bash
tail -f /var/log/map2/install.log
```

**Common issues:**
- No internet connection → Check network
- Missing dependencies → Script auto-installs
- Permission denied → Run with sudo
- Disk space → Check `df -h`

### Services Won't Start

**Check service logs:**
```bash
journalctl -u map2-backend -n 50
systemctl status map2-backend
```

**Common fixes:**
```bash
# Reset permissions
sudo chown -R map2:map2 /opt/map2-audio /var/lib/map2

# Reinstall dependencies
cd /opt/map2-audio
pip3 install -r requirements.txt

# Check config syntax
cat /etc/map2/config.yml
```

### Cluster Join Fails

**mDNS not working:**
```bash
# Enable Avahi
sudo systemctl enable --now avahi-daemon

# Check firewall
sudo firewall-cmd --add-service=mdns --permanent
sudo firewall-cmd --reload
```

**Manual join fails:**
```bash
# Test connectivity
curl http://[master-ip]:8080/api/health

# Check firewall on master
# Try join again via Web UI
```

### Audio Issues

```bash
# List devices
aplay -l

# Check PipeWire
systemctl --user status pipewire

# Restart audio
systemctl --user restart pipewire wireplumber
```

---

## 🔐 Security Notes

- Script requires **root/sudo** access
- All downloads via **HTTPS**
- Services run as **unprivileged user** (`map2`)
- Firewall **automatically configured**
- Join tokens **time-limited** (1 hour)
- All actions **logged**

---

## 📚 Documentation Index

1. **Quick Start**: [QUICK_NODE_INSTALL.md](QUICK_NODE_INSTALL.md) - Get started fast
2. **Full Guide**: [NEW_NODE_SETUP_GUIDE.md](NEW_NODE_SETUP_GUIDE.md) - Complete details
3. **TUI Guide**: [TUI_INSTALLER_GUIDE.md](TUI_INSTALLER_GUIDE.md) - Visual walkthrough
4. **Update System**: [UPDATE_SYSTEM_USAGE.md](UPDATE_SYSTEM_USAGE.md) - Manage updates
5. **Cluster Management**: [CLUSTER_MANAGEMENT_IMPLEMENTATION_GUIDE.md](../CLUSTER_MANAGEMENT_IMPLEMENTATION_GUIDE.md)

---

## ✅ Verification Checklist

After installation, verify:

- [ ] All three services running (`systemctl status map2-*`)
- [ ] API responding (`curl http://localhost:8080/api/health`)
- [ ] Node visible in cluster Web UI
- [ ] Firewall rules applied (`firewall-cmd --list-all`)
- [ ] Audio working if configured (`aplay -l`)
- [ ] Logs clean, no errors (`journalctl -u map2-backend`)

---

## 🎉 Success!

Your new node is now:
- ✅ Fully installed and configured
- ✅ Connected to the cluster
- ✅ Ready to process audio
- ✅ Accessible via Web UI
- ✅ Monitored and logged

**Next Steps:**
1. Access cluster at `http://[master-ip]:3000`
2. Configure audio routing in Web UI
3. Install LV2/VST plugins as needed
4. Test audio path
5. Monitor performance

---

## 📞 Support

- **Logs**: `/var/log/map2/install.log`
- **Services**: `journalctl -u map2-backend`
- **GitHub**: https://github.com/matthewmackes/map2-audio

---

**Installation Complete!** Welcome to the MAP2 Audio cluster! 🎵

# MAP2 Audio Node Installer - TUI Screenshots & Flow

This document shows what the TUI (Text User Interface) installer looks like and the flow users will experience.

---

## Welcome Screen

```
╔═══════════════════════════════════════════════════════════════════╗
║                   Welcome to MAP2 Audio Platform                  ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  This wizard will guide you through installing and configuring   ║
║  a new MAP2 Audio cluster node.                                  ║
║                                                                   ║
║  The process includes:                                           ║
║                                                                   ║
║  • System preparation and updates                                ║
║  • MAP2 software installation                                    ║
║  • Network and firewall configuration                            ║
║  • Audio subsystem setup                                         ║
║  • Cluster join process                                          ║
║                                                                   ║
║  Estimated time: 15-30 minutes                                   ║
║                                                                   ║
║  Press OK to continue...                                         ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                           < OK >                                  ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Installation Mode Selection

```
╔═══════════════════════════════════════════════════════════════════╗
║                      Installation Mode                            ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Choose installation method:                                     ║
║                                                                   ║
║  RPM: Recommended for production (stable releases)               ║
║  Git: For development (latest features)                          ║
║                                                                   ║
║                                                                   ║
║      rpm    Install from RPM package (Recommended)               ║
║      git    Install from Git repository (Development)            ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║              < OK >                    < Cancel >                 ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Node Configuration Form

```
╔═══════════════════════════════════════════════════════════════════╗
║                     Node Configuration                            ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Enter node identification details:                              ║
║                                                                   ║
║  Node ID (e.g., node-02):  [node-02_________________]            ║
║                                                                   ║
║  Node Name:                [MAP2 Node 02____________]            ║
║                                                                   ║
║  Node Role:                [worker__________________]            ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║              < OK >                    < Cancel >                 ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Network Configuration

```
╔═══════════════════════════════════════════════════════════════════╗
║                   Network Configuration                           ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Would you like to configure a static IP address?                ║
║                                                                   ║
║  (Required for production cluster nodes)                         ║
║                                                                   ║
║  Current IP: 192.168.1.100                                       ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║              < Yes >                   < No >                     ║
╚═══════════════════════════════════════════════════════════════════╝
```

### If Yes → Static IP Form

```
╔═══════════════════════════════════════════════════════════════════╗
║                  Static IP Configuration                          ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Configure static network settings:                              ║
║                                                                   ║
║  Interface: ens192                                               ║
║                                                                   ║
║  IP Address:     [192.168.1.11_________]                         ║
║                                                                   ║
║  Netmask:        [255.255.255.0________]                         ║
║                                                                   ║
║  Gateway:        [192.168.1.1__________]                         ║
║                                                                   ║
║  DNS Server:     [8.8.8.8______________]                         ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║              < OK >                    < Cancel >                 ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Cluster Join Method

```
╔═══════════════════════════════════════════════════════════════════╗
║                   Cluster Join Method                             ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  How would you like to join the cluster?                         ║
║                                                                   ║
║                                                                   ║
║      mdns     Auto-discovery (mDNS) - Easiest                    ║
║      manual   Manual (Specify master IP)                         ║
║      token    Join token from Web UI                             ║
║      skip     Skip cluster join (configure later)                ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║              < OK >                    < Cancel >                 ║
╚═══════════════════════════════════════════════════════════════════╝
```

### If Manual → Master IP Input

```
╔═══════════════════════════════════════════════════════════════════╗
║                  Master Node IP Address                           ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Enter the IP address of the cluster master node:                ║
║                                                                   ║
║  [192.168.1.10_______________________________________]            ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║              < OK >                    < Cancel >                 ║
╚═══════════════════════════════════════════════════════════════════╝
```

### If Token → Token Input

```
╔═══════════════════════════════════════════════════════════════════╗
║                    Cluster Join Token                             ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Paste the join token from the master node's Web UI:             ║
║                                                                   ║
║  [eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub2RlIjoibm9kZ...]    ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║              < OK >                    < Cancel >                 ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Audio Configuration

```
╔═══════════════════════════════════════════════════════════════════╗
║                   Audio Configuration                             ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Configure audio subsystem?                                      ║
║                                                                   ║
║  (Required for nodes that process audio)                         ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║              < Yes >                   < No >                     ║
╚═══════════════════════════════════════════════════════════════════╝
```

### If Yes → Audio Device Selection

```
╔═══════════════════════════════════════════════════════════════════╗
║                   Select Audio Device                             ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Choose the primary audio device for this node:                  ║
║                                                                   ║
║                                                                   ║
║      hw:0,0     Built-in Audio Analog Stereo                     ║
║      hw:1,0     USB Audio Device                                 ║
║      hw:2,0     Focusrite Scarlett 2i2                           ║
║      default    Default Audio Device                             ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║              < OK >                    < Cancel >                 ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Audio Parameters

```
╔═══════════════════════════════════════════════════════════════════╗
║                     Audio Parameters                              ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Configure audio parameters:                                     ║
║                                                                   ║
║  Sample Rate (Hz):         [48000__]                             ║
║                                                                   ║
║  Buffer Size (frames):     [256____]                             ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║              < OK >                    < Cancel >                 ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Configuration Summary

```
╔═══════════════════════════════════════════════════════════════════╗
║                   Confirm Configuration                           ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Installation Configuration Summary:                             ║
║                                                                   ║
║  Installation Mode: rpm                                          ║
║  Node ID: node-02                                                ║
║  Node Name: MAP2 Node 02                                         ║
║  Node Role: worker                                               ║
║  Node IP: 192.168.1.11                                           ║
║                                                                   ║
║  Cluster Join Method: manual                                     ║
║  Master Node IP: 192.168.1.10                                    ║
║                                                                   ║
║  Audio Enabled: true                                             ║
║  Audio Device: hw:2,0                                            ║
║  Sample Rate: 48000 Hz                                           ║
║  Buffer Size: 256 frames                                         ║
║                                                                   ║
║  Proceed with installation?                                      ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║              < Yes >                   < No >                     ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Progress Screens

### System Update

```
╔═══════════════════════════════════════════════════════════════════╗
║                      System Update                                ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Updating system packages...                                     ║
║                                                                   ║
║  Installing updates...                                           ║
║                                                                   ║
║  ████████████████████████████████████████                  75%   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Installing Dependencies

```
╔═══════════════════════════════════════════════════════════════════╗
║                 Installing Dependencies                           ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Installing required packages...                                 ║
║                                                                   ║
║  Installing pipewire...                                          ║
║                                                                   ║
║  ██████████████████████████████                            60%   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Installing MAP2

```
╔═══════════════════════════════════════════════════════════════════╗
║                     Installing MAP2                               ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Installing MAP2 Audio Platform...                               ║
║                                                                   ║
║  Downloading MAP2 Audio v1.0.0...                                ║
║                                                                   ║
║  ████████████████                                          40%   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Firewall Configuration

```
╔═══════════════════════════════════════════════════════════════════╗
║                 Firewall Configuration                            ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Configuring firewall rules...                                   ║
║                                                                   ║
║  Opening WebSocket port (8765)...                                ║
║                                                                   ║
║  ███████████████████████████████████████████████           80%   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Starting Services

```
╔═══════════════════════════════════════════════════════════════════╗
║                    Starting Services                              ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Starting MAP2 services...                                       ║
║                                                                   ║
║  Starting cluster service...                                     ║
║                                                                   ║
║  ████████████████████████████████████████████████████      90%   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Cluster Join

```
╔═══════════════════════════════════════════════════════════════════╗
║                  Cluster Join (Manual)                            ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Joining cluster manually...                                     ║
║                                                                   ║
║  Registering node...                                             ║
║                                                                   ║
║  ████████████████████████████                              60%   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Completion Screen

```
╔═══════════════════════════════════════════════════════════════════╗
║                  Installation Complete!                           ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  ╔════════════════════════════════════════════════════╗          ║
║  ║                                                    ║          ║
║  ║  ✓ Installation Complete!                         ║          ║
║  ║                                                    ║          ║
║  ╚════════════════════════════════════════════════════╝          ║
║                                                                   ║
║  Node Details:                                                   ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            ║
║    Node ID:      node-02                                         ║
║    Node Name:    MAP2 Node 02                                    ║
║    Node Role:    worker                                          ║
║    IP Address:   192.168.1.11                                    ║
║    API URL:      http://192.168.1.11:8080                        ║
║                                                                   ║
║  Services Status:                                                ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            ║
║    Backend:      Running                                         ║
║    Frontend:     Running                                         ║
║    Cluster:      Running                                         ║
║                                                                   ║
║  Next Steps:                                                     ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            ║
║    1. Access cluster Web UI:                                     ║
║       http://192.168.1.10:3000                                   ║
║                                                                   ║
║    2. Verify node appears in cluster                             ║
║                                                                   ║
║    3. Configure audio routing if needed                          ║
║                                                                   ║
║  Logs:                                                           ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            ║
║    Installation: /var/log/map2/install.log                       ║
║    Backend:      journalctl -u map2-backend                      ║
║    Cluster:      journalctl -u map2-cluster                      ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                           < OK >                                  ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Error Screens

### Verification Issues

```
╔═══════════════════════════════════════════════════════════════════╗
║                   Verification Issues                             ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  The following issues were detected:                             ║
║                                                                   ║
║  Backend service not running                                     ║
║  API endpoint not responding                                     ║
║                                                                   ║
║  Please check the logs:                                          ║
║  journalctl -u map2-backend -n 50                                ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                           < OK >                                  ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Invalid Input

```
╔═══════════════════════════════════════════════════════════════════╗
║                         Error                                     ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Node ID and Name are required!                                  ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                           < OK >                                  ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## Terminal Output (After Completion)

After the TUI completes, a formatted summary is shown in the terminal:

```
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║              MAP2 Audio Platform - Node Installation                 ║
║                          Version 1.0.0                                ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║                  ✓ Installation Complete!                             ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝

Node Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Node ID:      node-02
  Node Name:    MAP2 Node 02
  Node Role:    worker
  IP Address:   192.168.1.11
  API URL:      http://192.168.1.11:8080

Services Status:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Backend:      active
  Frontend:     active
  Cluster:      active

Access Web UI:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  http://192.168.1.10:3000

```

---

## Installation Flow Diagram

```
Start
  │
  ├─→ Pre-flight Checks
  │   ├─ Root access?
  │   ├─ Fedora Server?
  │   ├─ Internet connection?
  │   └─ Install dependencies (dialog, etc.)
  │
  ├─→ Welcome Screen
  │   └─ Press OK to continue
  │
  ├─→ Configuration Wizard Loop
  │   │
  │   ├─→ Installation Mode (RPM/Git)
  │   │
  │   ├─→ Node Configuration
  │   │   ├─ Node ID
  │   │   ├─ Node Name
  │   │   └─ Node Role
  │   │
  │   ├─→ Network Configuration
  │   │   ├─ Use DHCP? → Continue
  │   │   └─ Static IP? → Configure IP/Gateway/DNS
  │   │
  │   ├─→ Cluster Join Method
  │   │   ├─ mDNS → Auto-discovery
  │   │   ├─ Manual → Enter Master IP
  │   │   ├─ Token → Enter Join Token
  │   │   └─ Skip → Configure later
  │   │
  │   ├─→ Audio Configuration
  │   │   ├─ Enable audio? → No → Continue
  │   │   └─ Enable audio? → Yes
  │   │       ├─ Select audio device
  │   │       └─ Configure parameters
  │   │
  │   └─→ Configuration Summary
  │       ├─ Confirm? → Yes → Continue
  │       └─ Confirm? → No → Restart wizard or exit
  │
  ├─→ Installation Process (with progress bars)
  │   │
  │   ├─→ Update System (0-15%)
  │   │   ├─ Update package cache
  │   │   └─ Install updates
  │   │
  │   ├─→ Install Dependencies (15-40%)
  │   │   ├─ Python, Node.js
  │   │   ├─ Audio subsystem (if enabled)
  │   │   └─ mDNS/Avahi
  │   │
  │   ├─→ Install MAP2 (40-70%)
  │   │   ├─ RPM mode: Download and install RPM
  │   │   └─ Git mode: Clone, install deps, build frontend
  │   │
  │   ├─→ Create Directories (70-75%)
  │   │
  │   ├─→ Create Configuration (75-80%)
  │   │   └─ Generate /etc/map2/config.yml
  │   │
  │   ├─→ Configure Firewall (80-85%)
  │   │   └─ Open ports 8080, 3000, 8765, mDNS
  │   │
  │   ├─→ Configure Audio (85-90%)
  │   │   └─ Enable PipeWire (if enabled)
  │   │
  │   └─→ Install Services (90-95%)
  │       └─ Systemd service units
  │
  ├─→ Start Services (95-98%)
  │   ├─ Enable on boot
  │   └─ Start now
  │
  ├─→ Join Cluster (98-99%)
  │   ├─ mDNS → Broadcast and discover
  │   ├─ Manual → POST to master API
  │   ├─ Token → Validate and join
  │   └─ Skip → No action
  │
  ├─→ Verification (99-100%)
  │   ├─ Check services running
  │   ├─ Test API endpoint
  │   └─ Verify audio (if enabled)
  │
  └─→ Completion Screen
      ├─ Show node details
      ├─ Show service status
      ├─ Show next steps
      └─ Display terminal summary
```

---

## User Experience Highlights

### ✅ Professional Interface
- Clean, dialog-based TUI similar to Fedora installer
- Consistent navigation (OK/Cancel buttons)
- Progress bars for long operations
- Clear section titles and descriptions

### ✅ Helpful & Informative
- Contextual help text on every screen
- Recommended options highlighted
- Current values shown
- Example inputs provided

### ✅ Forgiving & Flexible
- Configuration wizard can be restarted
- Input validation with clear error messages
- Optional steps can be skipped
- Auto-detection of sensible defaults

### ✅ Transparent & Logged
- All operations logged to `/var/log/map2/install.log`
- Progress bars show current operation
- Detailed terminal output after completion
- Service status verification

### ✅ Fast & Efficient
- Parallel operations where possible
- Minimal user interaction required (5-7 screens)
- Progress indication prevents anxiety
- Estimated time shown upfront

---

## Keyboard Navigation

- **Arrow Keys / Tab**: Move between fields
- **Space**: Select in menus
- **Enter**: Confirm/OK
- **Esc**: Cancel
- **Y/N**: Quick yes/no in confirmation dialogs

---

This TUI provides a professional, user-friendly installation experience that rivals commercial Linux distributions!

# MAP2 Build TUI System (MATTS-BUILD-TUI)

Professional build management interface for MAP2 Audio Platform with comprehensive system state monitoring, multiple build targets, and AI-friendly structured output.

## Quick Start

```bash
/home/mm/map2-audio/MATTS-BUILD-TUI
```

Or with the shortcut (if installed):
```bash
matts-build
```

## Usage

### Interactive Menu
```bash
MATTS-BUILD-TUI
```
Starts the interactive terminal UI with color-coded menus and status indicators.

### Command-Line Options

```bash
# Show help
MATTS-BUILD-TUI --help

# Get system status (JSON)
MATTS-BUILD-TUI --status

# View recent logs
MATTS-BUILD-TUI --log

# Show current build state
MATTS-BUILD-TUI --state
```

## Features

### 🎯 Build Operations
- **Production Web Build** (Port 3000) - **⚠️ PRODUCTION ONLY** - Serves pre-built `dist/` folder via `serve` (NO hot-reload)
- **Development Web Build** (Port 3001) - **🔥 DEVELOPMENT** - Vite dev server with hot-reload and source maps
- **JUCE Plugin Compilation** - Multi-threaded native plugin builds
- **Clean Build Artifacts** - Safe removal of build outputs

**IMPORTANT PORT NOTE:** Port 3000 is PRODUCTION (static files), Port 3001 is DEV (live reload). Common mistake: assuming 3000 is dev server!

### 🔍 System Monitoring
- **Disk Space Check** - Requires minimum 5GB free
- **Memory Validation** - Requires minimum 2GB available
- **CPU Load Assessment** - Monitors core utilization
- **Port Availability** - Tracks ports 3000 (PROD), 3001 (DEV), 5000
- **Build Tools Detection** - Verifies Node.js, npm, cmake, gcc, g++
- **Running Process Detection** - Prevents build conflicts

### 🛡️ Build Safety
- **Lock Management** - Prevents concurrent builds
- **State Persistence** - JSON-formatted build state file
- **Comprehensive Logging** - Timestamped operation logs
- **Force Unlock** - Emergency unlock with confirmation
- **Reboot Detection** - Identifies system restart requirements

### 🤖 AI Integration
- **JSON Output Mode** - Structured data for parsing
- **Build State File** - `/tmp/map2-build-locks/build-state.json`
- **Exit Codes** - 0=success, 1=failure, 2=lock_conflict
- **Structured Logs** - `/home/mm/map2-audio/logs/build-YYYYMMDD_HHMMSS.log`

## Directory Structure

```
/home/mm/map2-audio/
├── MATTS-BUILD-TUI              # Main entry point (16KB)
├── logs/                         # Build logs directory
├── build/                        # Build artifacts
└── scripts/build/
    ├── system-check             # System state evaluation
    ├── build-web-prod           # Production build helper
    ├── build-web-dev            # Development build helper
    ├── build-juce               # JUCE compilation helper
    ├── clean-build              # Cleanup helper
    └── install-build-tui.sh     # Installation script
```

## Menu Reference

```
┌─────────────────────────────────────────┐
│  MAP2 BUILD SYSTEM - MAIN MENU          │
├─────────────────────────────────────────┤
│  1) Build Production Web (port 3000)   │
│  2) Build Development Web (port 3001)  │
│  3) Recompile JUCE Plugins             │
│  4) Clean Build Artifacts              │
│  5) Check System State (detailed)       │
│  6) View Recent Logs                   │
│  7) View Build Configuration           │
│  8) Advanced Options                   │
│  0) Exit                               │
└─────────────────────────────────────────┘
```

### Advanced Options

- **Export build state (JSON)** - Output current state in JSON format
- **View lock files** - List active build locks
- **Force unlock builds** - Emergency unlock with confirmation
- **Check reboot requirement** - Identify system restart needs

## System Requirements

### Minimum Resources
- **Disk Space**: 5 GB free (production builds)
- **Memory**: 2 GB available (build operations)
- **CPU**: 2+ cores (parallel compilation)

### Required Tools
- Node.js v14+ (with npm)
- cmake 3.15+
- gcc/g++ or clang
- make
- bash 4+

## Build State File

Located at: `/tmp/map2-build-locks/build-state.json`

```json
{
  "timestamp": "2026-02-09T13:45:00-05:00",
  "operation": "production_build",
  "status": "in_progress",
  "details": "Port 3000",
  "user": "mm",
  "hostname": "MAP2-TESTBED",
  "pid": 12345
}
```

## Lock Management

Lock files located at: `/tmp/map2-build-locks/`

```
build-production-build.lock     # Production build lock
build-development-build.lock    # Development build lock
build-juce-compilation.lock     # JUCE compilation lock
build-clean-build.lock          # Clean operation lock
```

## Logging

All operations logged to: `/home/mm/map2-audio/logs/build-YYYYMMDD_HHMMSS.log`

Example log:
```
[2026-02-09 13:45:00] Beginning production web build
[2026-02-09 13:45:05] Cleaning previous build...
[2026-02-09 13:45:10] Building optimized production bundle...
[2026-02-09 13:46:30] Production build completed
```

## Color-Coded Output

- 🔵 **BLUE** `[INFO]` - Informational messages
- 🟢 **GREEN** `[✓]` - Success indicators
- 🟡 **YELLOW** `[⚠]` - Warnings
- 🔴 **RED** `[✗]` - Errors
- 🔷 **CYAN** - Headers and section dividers

## Exit Codes

```bash
0   # Success - operation completed normally
1   # Failure - operation failed with error
2   # Conflict - build already in progress (lock held)
```

## Example AI Usage

```bash
# Get JSON status for parsing
STATUS=$(MATTS-BUILD-TUI --status)
echo "$STATUS" | jq '.build_environment.tools.status'

# Check if ready to build
if MATTS-BUILD-TUI --status | jq -e '.ready_to_build' >/dev/null; then
    echo "System ready for build"
fi

# Parse build state
STATE=$(cat /tmp/map2-build-locks/build-state.json)
echo "Build status: $(echo "$STATE" | jq -r '.status')"
```

## Reboot Requirements

The system will indicate a reboot is required when:
- Kernel updates are pending
- Critical system updates are installed
- systemd units are in degraded state
- Core system services need restart

**After build completion**, if prompted:
```
System will need to be rebooted to return to proper mode.
```

Run:
```bash
sudo reboot
```

## Troubleshooting

### Build won't start
```bash
# Check for stale locks
MATTS-BUILD-TUI --state

# Force unlock if safe
MATTS-BUILD-TUI  # Select option 8 > 3
```

### System not ready
```bash
# Run detailed check
MATTS-BUILD-TUI  # Select option 5
```

### View build errors
```bash
# Show recent logs
MATTS-BUILD-TUI --log
```

## Installation

The scripts are already installed and executable. To reinstall or reset permissions:

```bash
/home/mm/map2-audio/scripts/build/install-build-tui.sh
```

## Development Notes

- Main script: 16 KB, fully self-contained
- Helper scripts: 1.5-7 KB each, modular design
- No external dependencies beyond bash + standard tools
- Portable across Linux distributions
- Works with any shell supporting bash syntax

## Support

For issues or improvements, check:
- Build logs: `/home/mm/map2-audio/logs/`
- Current state: `MATTS-BUILD-TUI --state`
- System status: `MATTS-BUILD-TUI --status`

---

**Version**: 1.0.0  
**Platform**: MAP2 Audio Platform 3.0.0-FEB2026  
**Tested On**: Fedora 43, x86_64

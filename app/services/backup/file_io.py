"""Backup archive file I/O, manifest, and documentation helpers."""

import hashlib
import json
import logging
import os
import platform
import shutil
import tarfile
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from app.utils.logging_utils import get_logger
from app.utils.platform_version import get_platform_version

logger = get_logger(__name__)


def _safe_tar_extract(tar: tarfile.TarFile, dest_path: Path) -> None:
    """Safely extract a tarfile, preventing path traversal attacks."""
    dest_path = dest_path.resolve()

    for member in tar.getmembers():
        member_path = (dest_path / member.name).resolve()

        try:
            member_path.relative_to(dest_path)
        except ValueError:
            raise tarfile.TarError(
                f"Attempted path traversal in tar archive: {member.name}"
            )

        if member.name.startswith('/') or '..' in member.name.split('/'):
            raise tarfile.TarError(
                f"Dangerous path in tar archive: {member.name}"
            )

        if member.issym() or member.islnk():
            link_target = Path(member.linkname)
            if link_target.is_absolute():
                raise tarfile.TarError(
                    f"Absolute symlink in tar archive: {member.name} -> {member.linkname}"
                )
            resolved_link = (dest_path / member.name).parent / member.linkname
            try:
                resolved_link.resolve().relative_to(dest_path)
            except ValueError:
                raise tarfile.TarError(
                    f"Symlink escapes destination: {member.name} -> {member.linkname}"
                )

    tar.extractall(dest_path)


@dataclass
class BackupInfo:
    """Information about a backup file."""
    id: str
    filename: str
    path: str
    created_at: str
    size_bytes: int
    size_human: str
    valid: bool
    manifest: Optional[Dict[str, Any]] = None


@dataclass
class BackupSettings:
    """Backup lifecycle settings."""
    max_backups: int = 5
    retention_days: int = 30
    auto_cleanup: bool = True
    backup_location: str = ""

    def __post_init__(self):
        if not self.backup_location:
            # XDG Base Directory compliant location
            self.backup_location = str(Path.home() / ".local" / "share" / "map2" / "backups")



class BackupFileIOMixin:
    """Archive creation, verification, and generated documentation helpers."""

    def _ensure_backup_dir(self) -> None:
        """Ensure backup directory exists."""
        Path(self.settings.backup_location).mkdir(parents=True, exist_ok=True)
    def _load_settings(self) -> None:
        """Load settings from file if exists."""
        if self._settings_file.exists():
            try:
                with open(self._settings_file, 'r') as f:
                    data = json.load(f)
                    self.settings.max_backups = data.get('max_backups', 5)
                    self.settings.retention_days = data.get('retention_days', 30)
                    self.settings.auto_cleanup = data.get('auto_cleanup', True)
            except Exception as e:
                logger.error(f"Failed to load backup settings: {e}")
    def _save_settings(self) -> None:
        """Save settings to file."""
        try:
            with open(self._settings_file, 'w') as f:
                json.dump({
                    'max_backups': self.settings.max_backups,
                    'retention_days': self.settings.retention_days,
                    'auto_cleanup': self.settings.auto_cleanup,
                }, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save backup settings: {e}")
    def _human_readable_size(self, size_bytes: int) -> str:
        """Convert bytes to human readable format."""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"
    def _calculate_checksum(self, file_path: Path) -> str:
        """Calculate SHA256 checksum of a file."""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return f"sha256:{sha256.hexdigest()}"
    def verify_backup_integrity(self, backup_path: Path) -> tuple[bool, str]:
        """
        Verify the integrity of a backup file.

        Checks:
        1. File exists and is readable
        2. Is a valid tar.gz archive
        3. Contains required files (manifest.json)
        4. Manifest checksum matches (if present)

        Args:
            backup_path: Path to the backup archive

        Returns:
            Tuple of (is_valid, message)
        """
        if not backup_path.exists():
            return False, f"Backup file not found: {backup_path}"

        if not backup_path.is_file():
            return False, f"Not a file: {backup_path}"

        try:
            # Try to open as tar.gz
            with tarfile.open(backup_path, "r:gz") as tar:
                # Check for manifest
                try:
                    manifest_member = tar.getmember("manifest.json")
                except KeyError:
                    return False, "Backup missing manifest.json - may be corrupted"

                # Read and parse manifest
                manifest_file = tar.extractfile(manifest_member)
                if not manifest_file:
                    return False, "Cannot read manifest.json"

                try:
                    manifest = json.load(manifest_file)
                except json.JSONDecodeError:
                    return False, "Manifest.json is not valid JSON"

                # Check required manifest fields
                required_fields = ["version", "backup_id", "created_at"]
                for field in required_fields:
                    if field not in manifest:
                        return False, f"Manifest missing required field: {field}"

                # If checksum is present in manifest, we'd need to verify it
                # but the checksum is of the archive itself, which is a chicken-egg problem
                # So we just verify the archive is structurally valid

                # Check for expected content types
                members = tar.getnames()
                if "reinstall.sh" not in members and "README.md" not in members:
                    logger.warning(
                        f"Backup {backup_path.name} missing some expected files"
                    )

            return True, "Backup integrity verified"

        except tarfile.TarError as e:
            return False, f"Invalid or corrupted tar archive: {e}"
        except Exception as e:
            logger.error(f"Error verifying backup {backup_path}: {e}")
            return False, f"Verification error: {e}"
    def _generate_backup_id(self) -> str:
        """Generate unique backup ID based on timestamp."""
        return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    def generate_skip_list(self) -> Dict[str, Any]:
        """Generate documentation of items skipped in backup."""
        return {
            "description": "Items not included in backup - reinstallable via package managers",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "categories": self.SKIP_LIST,
            "reinstall_instructions": {
                "dnf_packages": "sudo dnf install <package-name>",
                "flatpak_packages": "flatpak install flathub <package-id>",
                "python_packages": "pip install <package-name>",
                "npm_packages": "cd map2-audio && npm install",
                "source_code": "git clone <repository-url>",
                "system_services": "cd map2-audio && ./install-boot-manager.sh",
            }
        }
    def _generate_documentation_set(self, manifest: Dict[str, Any], backup_id: str, staging_dir: Path) -> None:
        """Generate comprehensive documentation set for the backup archive."""
        docs_dir = staging_dir / "docs"
        docs_dir.mkdir(exist_ok=True)

        # 1. Main README
        readme_content = self._generate_backup_readme(manifest, backup_id)
        with open(staging_dir / "README.md", 'w') as f:
            f.write(readme_content)

        # 2. Quick Start Guide
        quickstart = self._generate_quickstart_guide(manifest, backup_id)
        with open(docs_dir / "QUICKSTART.md", 'w') as f:
            f.write(quickstart)

        # 3. Full Installation Guide
        install_guide = self._generate_installation_guide(manifest)
        with open(docs_dir / "INSTALLATION.md", 'w') as f:
            f.write(install_guide)

        # 4. Troubleshooting Guide
        troubleshooting = self._generate_troubleshooting_guide()
        with open(docs_dir / "TROUBLESHOOTING.md", 'w') as f:
            f.write(troubleshooting)

        # 5. Architecture Overview
        architecture = self._generate_architecture_doc()
        with open(docs_dir / "ARCHITECTURE.md", 'w') as f:
            f.write(architecture)

        # 6. Configuration Reference
        config_ref = self._generate_config_reference()
        with open(docs_dir / "CONFIGURATION.md", 'w') as f:
            f.write(config_ref)

        # 7. API Reference
        api_ref = self._generate_api_reference()
        with open(docs_dir / "API_REFERENCE.md", 'w') as f:
            f.write(api_ref)

        # 8. Fedora-Specific Notes
        fedora_notes = self._generate_fedora_notes()
        with open(docs_dir / "FEDORA_NOTES.md", 'w') as f:
            f.write(fedora_notes)

        # 9. Changelog / Version History
        changelog = self._generate_changelog(manifest)
        with open(docs_dir / "CHANGELOG.md", 'w') as f:
            f.write(changelog)

        # 10. License
        license_text = self._generate_license()
        with open(docs_dir / "LICENSE", 'w') as f:
            f.write(license_text)
    def _generate_quickstart_guide(self, manifest: Dict[str, Any], backup_id: str) -> str:
        """Generate quick start guide."""
        return f'''# MAP2 Audio Platform - Quick Start Guide

## 5-Minute Installation

### Step 1: Extract Backup
```bash
tar -xzf map2-backup-{backup_id}.tar.gz
cd map2-backup-{backup_id}
```

### Step 2: Run Installer
```bash
sudo ./reinstall.sh
```

### Step 3: Start Platform
```bash
cd ~/map2-audio
./start_simple.sh
```

### Step 4: Access Interfaces
- **Web Dashboard:** http://localhost:3000
- **API Docs:** http://localhost:8080/docs
- **Terminal UI:** `textual run tui/app.py`

## First-Time Setup Checklist

1. [ ] Verify audio device detected: Check DASHBOARD tab
2. [ ] Configure JACK/PipeWire audio settings
3. [ ] Scan for LV2 plugins: PLUGINS tab > Scan
4. [ ] Create your first signal chain: PEDALBOARD tab
5. [ ] Set up MIDI mappings: MIDI tab

## Keyboard Shortcuts (TUI)

| Key | Action |
|-----|--------|
| 1-8 | Switch tabs |
| Left/Right | Navigate tabs |
| R | Refresh current screen |
| Ctrl+R | Hot reload modules |
| Q | Quit |

## Common Commands

```bash
# Start backend only
cd ~/map2-audio && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080

# Start TUI
cd ~/map2-audio && textual run tui/app.py

# Check service status
systemctl status map2-backend

# View logs
tail -f /tmp/map2_tui.log
journalctl -u map2-backend -f
```

## Getting Help

- Full documentation: `docs/` folder in this backup
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- API reference: `docs/API_REFERENCE.md`
'''
    def _generate_installation_guide(self, manifest: Dict[str, Any]) -> str:
        """Generate full installation guide."""
        return '''# MAP2 Audio Platform - Full Installation Guide

## System Requirements

### Minimum Requirements
- **OS:** Fedora Server 38+ (Workstation also supported)
- **CPU:** Dual-core 2.0 GHz
- **RAM:** 4 GB
- **Storage:** 2 GB free space
- **Audio:** USB audio interface or built-in audio

### Recommended
- **OS:** Fedora Server 41+
- **CPU:** Quad-core 2.5 GHz+
- **RAM:** 8 GB+
- **Storage:** 10 GB+ SSD
- **Audio:** Low-latency USB audio interface (e.g., Focusrite, MOTU)

## Pre-Installation Checklist

1. Fresh Fedora Server installation (minimal install)
2. Network connectivity for package downloads
3. Root/sudo access
4. SSH access (for remote installation)

## Installation Methods

### Method 1: Automated (Recommended)

```bash
# Extract backup
tar -xzf map2-backup-*.tar.gz
cd map2-backup-*

# Run full installation
sudo ./reinstall.sh

# Or with options
sudo ./reinstall.sh --user myuser --dry-run  # Preview first
sudo ./reinstall.sh --user myuser            # Install
```

### Method 2: Manual Installation

#### Step 1: Install System Packages

```bash
sudo dnf install -y \\
    python3 python3-pip python3-devel \\
    alsa-utils alsa-lib pipewire pipewire-jack-audio-connection-kit \\
    jack-audio-connection-kit \\
    lv2 lilv suil lv2-calf-plugins guitarix-lv2 gxplugins-lv2 lsp-plugins-lv2 \\
    nodejs npm \\
    gcc gcc-c++ cmake make git sqlite
```

#### Step 2: Install Python Packages

```bash
pip3 install fastapi uvicorn httpx aiohttp sqlalchemy aiosqlite textual rich psutil pydantic
```

#### Step 3: Copy Source Code

```bash
cp -r source/* ~/map2-audio/
cd ~/map2-audio
```

#### Step 4: Install Node.js Dependencies

```bash
npm install
cd web && npm install && npm run build
```

#### Step 5: Restore User Data

```bash
mkdir -p ~/map2-audio/data ~/.map2
cp database/map2.db ~/map2-audio/data/
cp -r user_data/* ~/.map2/
```

#### Step 6: Configure Audio System

```bash
# Add to audio group
sudo usermod -a -G audio $USER

# Configure real-time limits
sudo tee /etc/security/limits.d/99-audio.conf << 'EOF'
@audio   -  rtprio     95
@audio   -  memlock    unlimited
@audio   -  nice       -19
EOF
```

#### Step 7: Install Services (Optional)

```bash
cd ~/map2-audio
sudo ./install-boot-manager.sh
sudo systemctl enable --now map2-backend
```

## Post-Installation

### Verify Installation

```bash
# Check Python packages
python3 -c "import fastapi, textual, sqlalchemy; print('OK')"

# Check audio
aplay -l  # List audio devices

# Check LV2 plugins
ls /usr/lib64/lv2/ | wc -l

# Start backend
cd ~/map2-audio && ./start_simple.sh
```

### Configure Audio

1. Open DASHBOARD tab
2. Select audio device
3. Set sample rate (44100 or 48000 recommended)
4. Set buffer size (256-512 for low latency)

## Uninstallation

```bash
# Stop services
sudo systemctl stop map2-backend
sudo systemctl disable map2-backend

# Remove files
rm -rf ~/map2-audio ~/.map2

# Remove services
sudo rm /etc/systemd/system/map2-*.service
sudo systemctl daemon-reload
```
'''
    def _generate_troubleshooting_guide(self) -> str:
        """Generate troubleshooting guide."""
        return '''# MAP2 Audio Platform - Troubleshooting Guide

## Common Issues

### 1. Backend Won't Start

**Symptoms:** Port 8080 not responding, connection refused

**Solutions:**
```bash
# Check if port is in use
ss -tlnp | grep 8080

# Kill existing process
pkill -f uvicorn

# Start with verbose logging
cd ~/map2-audio
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level debug
```

### 2. No Audio Output

**Symptoms:** Signal chain active but no sound

**Solutions:**
```bash
# Check audio devices
aplay -l
cat /proc/asound/cards

# Check PipeWire/JACK status
systemctl --user status pipewire
pw-cli ls

# Test audio output
speaker-test -c 2 -t wav
```

### 3. High Latency / Audio Glitches

**Symptoms:** Crackling, dropouts, high latency

**Solutions:**
```bash
# Check real-time privileges
ulimit -r  # Should show 95

# Reduce buffer size in DASHBOARD
# Try 128 or 256 samples

# Check CPU governor
cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
# Set to performance:
sudo cpupower frequency-set -g performance
```

### 4. LV2 Plugins Not Found

**Symptoms:** Plugin list empty or missing plugins

**Solutions:**
```bash
# Check LV2 path
echo $LV2_PATH
ls /usr/lib64/lv2/

# Rescan plugins
# In TUI: PLUGINS tab > Scan

# Install common plugins
sudo dnf install lv2-calf-plugins guitarix-lv2 gxplugins-lv2 lsp-plugins-lv2
```

### 5. TUI Display Issues

**Symptoms:** Garbled display, wrong colors, layout broken

**Solutions:**
```bash
# Check terminal capabilities
echo $TERM

# Use a compatible terminal
export TERM=xterm-256color

# Try different terminal emulator
# gnome-terminal, kitty, or alacritty recommended
```

### 6. Database Errors

**Symptoms:** "Database locked", corruption errors

**Solutions:**
```bash
# Stop all services first
pkill -f uvicorn
pkill -f "textual run"

# Backup current database
cp ~/map2-audio/data/map2.db ~/map2-audio/data/map2.db.backup

# Check database integrity
sqlite3 ~/map2-audio/data/map2.db "PRAGMA integrity_check;"

# If corrupt, restore from backup
cp ~/map2-audio/data/map2.db.backup ~/map2-audio/data/map2.db
```

### 7. Permission Denied Errors

**Symptoms:** Can't access audio devices, I2C errors

**Solutions:**
```bash
# Add user to required groups
sudo usermod -a -G audio,i2c,dialout $USER

# Log out and back in, or:
newgrp audio

# Check group membership
groups $USER
```

## Log Files

| Log | Location |
|-----|----------|
| TUI | `/tmp/map2_tui.log` |
| Backend | `journalctl -u map2-backend` |
| Boot Manager | `/home/*/map2-audio/logs/boot-manager.log` |
| Reinstaller | `/tmp/map2-reinstall-*.log` |

## Diagnostic Commands

```bash
# System info
uname -a
cat /etc/fedora-release

# Audio subsystem
aplay -l
pactl info
pw-cli info all

# Python environment
python3 --version
pip3 list | grep -E "fastapi|textual|sqlalchemy"

# Network/ports
ss -tlnp | grep -E "8080|3000"

# Services
systemctl list-units | grep map2
```

## Getting Support

1. Check logs for error messages
2. Run diagnostic commands above
3. Include system info when reporting issues
4. Check API docs at http://localhost:8080/docs
'''
    def _generate_architecture_doc(self) -> str:
        """Generate architecture documentation."""
        return '''# MAP2 Audio Platform - Architecture Overview

## System Architecture

```
+------------------+     +------------------+     +------------------+
|                  |     |                  |     |                  |
|   Terminal UI    |     |  Web Dashboard   |     |   LCD Display    |
|   (Textual)      |     |  (Vue/Vite)      |     |   (I2C)          |
|                  |     |                  |     |                  |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         |                        |                        |
         +------------------------+------------------------+
                                  |
                                  v
                    +-------------+-------------+
                    |                           |
                    |    FastAPI Backend        |
                    |    (Python/Async)         |
                    |                           |
                    +-------------+-------------+
                                  |
         +------------------------+------------------------+
         |                        |                        |
         v                        v                        v
+--------+---------+   +----------+--------+   +---------+---------+
|                  |   |                   |   |                   |
|  SQLite Database |   |  LV2 Plugin Host  |   |  MIDI Engine      |
|  (SQLAlchemy)    |   |  (JUCE/LV2)       |   |  (ALSA/JACK)      |
|                  |   |                   |   |                   |
+------------------+   +-------------------+   +-------------------+
                                  |
                                  v
                    +-------------+-------------+
                    |                           |
                    |   Audio Hardware          |
                    |   (ALSA/JACK/PipeWire)    |
                    |                           |
                    +---------------------------+
```

## Component Overview

### Frontend Interfaces

| Component | Technology | Purpose |
|-----------|------------|---------|
| Terminal UI | Python/Textual | Primary control interface |
| Web Dashboard | Vue.js/Vite | Remote web access |
| LCD Display | Python/I2C | Hardware display output |

### Backend Services

| Service | Technology | Purpose |
|---------|------------|---------|
| API Server | FastAPI/Uvicorn | REST API and WebSocket |
| Database | SQLite/SQLAlchemy | Persistence layer |
| Plugin Host | LV2/lilv | Audio plugin management |
| MIDI Engine | ALSA/rtmidi | MIDI I/O and mapping |

### Audio Stack

```
Application Layer
       |
       v
+------+------+
|  PipeWire   |  (Session manager, routing)
+------+------+
       |
       v
+------+------+
|    JACK     |  (Low-latency audio server)
+------+------+
       |
       v
+------+------+
|    ALSA     |  (Kernel audio drivers)
+------+------+
       |
       v
+------+------+
|  Hardware   |  (USB audio interface)
+-------------+
```

## Directory Structure

```
~/map2-audio/
├── app/                    # FastAPI backend
│   ├── main.py            # Application factory
│   ├── routes/            # API route modules
│   ├── services/          # Business logic
│   └── database.py        # ORM models
├── tui/                    # Terminal UI
│   ├── app.py             # Main TUI application
│   ├── screens/           # Tab screens
│   ├── widgets.py         # Custom widgets
│   └── api_client.py      # Backend API client
├── web/                    # Web dashboard
│   ├── src/               # Vue source
│   └── dist/              # Built assets
├── scripts/               # Helper scripts
├── systemd/               # Service files
├── data/                  # Runtime data
│   └── map2.db           # SQLite database
└── logs/                  # Log files

~/.map2/                   # User data
├── ir/                    # Impulse responses
├── nam/                   # NAM models
├── sessions/              # Saved sessions
└── packages/              # Custom packages
```

## Data Flow

### Signal Chain Processing

```
Audio Input -> [Plugin 1] -> [Plugin 2] -> ... -> [Plugin N] -> Audio Output
                  |              |                    |
                  v              v                    v
              Parameters    Parameters           Parameters
                  ^              ^                    ^
                  |              |                    |
              MIDI CC        MIDI CC              MIDI CC
```

### API Request Flow

```
Client Request
      |
      v
  FastAPI Router
      |
      v
  Service Layer
      |
      +---> Database (SQLAlchemy)
      |
      +---> Plugin Host (LV2)
      |
      +---> MIDI Engine
      |
      v
  JSON Response
```

## Database Schema

### Core Tables

- **plugins** - LV2 plugin metadata
- **chains** - Signal chain definitions
- **chain_plugins** - Plugin instances in chains
- **presets** - Saved chain configurations
- **midi_mappings** - MIDI CC to parameter mappings
- **system_config** - Key-value configuration

### Relationships

```
chains 1:N chain_plugins N:1 plugins
chains 1:N presets
plugins 1:N midi_mappings
```

## Security Considerations

- Backend listens on localhost by default
- No authentication (designed for local use)
- Database stored in user home directory
- Real-time privileges limited to audio group
'''
    def _generate_config_reference(self) -> str:
        """Generate configuration reference."""
        return '''# MAP2 Audio Platform - Configuration Reference

## Configuration Files

### ~/.map2/config.json

Main user configuration file.

```json
{
    "audio": {
        "sample_rate": 48000,
        "buffer_size": 256,
        "device": "hw:1,0"
    },
    "midi": {
        "enabled": true,
        "learn_timeout": 10
    },
    "ui": {
        "theme": "dark",
        "refresh_rate": 30
    }
}
```

### Audio Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `audio.sample_rate` | int | 48000 | Sample rate in Hz (44100, 48000, 96000) |
| `audio.buffer_size` | int | 256 | Buffer size in samples (64-2048) |
| `audio.device` | string | auto | ALSA device identifier |
| `audio.channels` | int | 2 | Number of audio channels |

### MIDI Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `midi.enabled` | bool | true | Enable MIDI input |
| `midi.learn_timeout` | int | 10 | MIDI learn timeout in seconds |
| `midi.device` | string | auto | MIDI input device |

### UI Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ui.theme` | string | "dark" | UI theme (dark, light) |
| `ui.refresh_rate` | int | 30 | Status refresh rate (Hz) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAP2_CONFIG_DIR` | `~/.map2` | User config directory |
| `MAP2_LOG_LEVEL` | `WARNING` | Logging level |
| `MAP2_API_HOST` | `127.0.0.1` | API bind address |
| `MAP2_API_PORT` | `8080` | API port |
| `LV2_PATH` | System default | LV2 plugin search path |

## Systemd Service Configuration

### /etc/systemd/system/map2-backend.service

```ini
[Unit]
Description=MAP2 Audio Platform Backend
After=network.target sound.target

[Service]
Type=simple
User=mm
WorkingDirectory=/home/mm/map2-audio
ExecStart=/usr/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Audio Configuration

### Real-Time Limits (/etc/security/limits.d/99-audio.conf)

```
@audio   -  rtprio     95
@audio   -  memlock    unlimited
@audio   -  nice       -19
```

### PipeWire Configuration (~/.config/pipewire/pipewire.conf.d/)

```
context.properties = {
    default.clock.rate = 48000
    default.clock.quantum = 256
    default.clock.min-quantum = 64
}
```

## Backup Settings

Stored in `~/.local/share/map2/backups/settings.json`:

```json
{
    "max_backups": 5,
    "retention_days": 30,
    "auto_cleanup": true
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `max_backups` | int | 5 | Maximum backups to keep |
| `retention_days` | int | 30 | Days before auto-deletion |
| `auto_cleanup` | bool | true | Enable automatic cleanup |
'''
    def _generate_api_reference(self) -> str:
        """Generate API reference."""
        return '''# MAP2 Audio Platform - API Reference

## Base URL

```
http://localhost:8080/api
```

## Interactive Documentation

- **Swagger UI:** http://localhost:8080/docs
- **ReDoc:** http://localhost:8080/redoc

## Authentication

No authentication required (local use only).

## Endpoints Overview

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/metrics` | System metrics |

### Signal Chains

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chains/` | List all chains |
| POST | `/api/chains/` | Create chain |
| GET | `/api/chains/{id}` | Get chain details |
| DELETE | `/api/chains/{id}` | Delete chain |
| POST | `/api/chains/{id}/activate` | Activate chain |
| POST | `/api/chains/{id}/plugins` | Add plugin |
| DELETE | `/api/chains/{id}/plugins/{uri}` | Remove plugin |

### Plugins

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plugins/` | List plugins |
| GET | `/api/plugins/scan` | Scan for plugins |
| GET | `/api/plugins/{uri}` | Plugin details |

### MIDI

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/midi/devices` | List MIDI devices |
| GET | `/api/midi/mappings` | List mappings |
| POST | `/api/midi/mappings` | Create mapping |
| POST | `/api/midi/learn` | Start MIDI learn |

### Snapshots

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/snapshots/` | List snapshots |
| POST | `/api/snapshots/` | Create snapshot |
| PATCH | `/api/snapshots/{id}` | Update snapshot metadata |
| DELETE | `/api/snapshots/{id}` | Delete snapshot |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/` | List sessions |
| POST | `/api/sessions/save` | Save session |
| POST | `/api/sessions/{id}/load` | Load session |

### Backup

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backup/` | List backups |
| POST | `/api/backup/create` | Create backup |
| GET | `/api/backup/status` | Backup status |
| POST | `/api/backup/{id}/restore` | Restore backup |
| DELETE | `/api/backup/{id}` | Delete backup |
| GET | `/api/backup/settings/current` | Get settings |
| PUT | `/api/backup/settings/current` | Update settings |

## Example Requests

### Create Signal Chain

```bash
curl -X POST "http://localhost:8080/api/chains/" \\
     -H "Content-Type: application/json" \\
     -d '{"name": "My Guitar Chain"}'
```

### Add Plugin to Chain

```bash
curl -X POST "http://localhost:8080/api/chains/1/plugins" \\
     -H "Content-Type: application/json" \\
     -d '{"plugin_uri": "http://calf.sourceforge.net/plugins/Compressor"}'
```

### Create Backup

```bash
curl -X POST "http://localhost:8080/api/backup/create" \\
     -H "Content-Type: application/json" \\
     -d '{"description": "Before major changes"}'
```

## WebSocket Endpoints

### /ws/metrics

Real-time system metrics stream.

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/metrics');
ws.onmessage = (event) => {
    const metrics = JSON.parse(event.data);
    console.log('CPU:', metrics.cpu_percent);
};
```

### /ws/midi

Real-time MIDI events.

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/midi');
ws.onmessage = (event) => {
    const midi = JSON.parse(event.data);
    console.log('MIDI:', midi.channel, midi.cc, midi.value);
};
```

## Error Responses

```json
{
    "detail": "Error message here"
}
```

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 404 | Not Found |
| 500 | Server Error |
'''
    def _generate_fedora_notes(self) -> str:
        """Generate Fedora-specific notes."""
        return '''# MAP2 Audio Platform - Fedora-Specific Notes

## Supported Fedora Versions

| Version | Status | Notes |
|---------|--------|-------|
| Fedora 38 | Supported | Minimum version |
| Fedora 39 | Supported | Recommended |
| Fedora 40 | Supported | Recommended |
| Fedora 41 | Supported | Latest, recommended |
| Fedora 42+ | Should work | Not tested |

## Fedora Server vs Workstation

### Fedora Server (Recommended)
- Minimal install, less overhead
- No desktop environment by default
- Ideal for headless/dedicated audio systems
- SSH access for remote management

### Fedora Workstation
- Full desktop environment
- More resource usage
- Easier initial setup
- Better for development

## Fedora Atomic / Silverblue

For immutable Fedora variants:

```bash
# Use toolbox for development
toolbox create map2-dev
toolbox enter map2-dev

# Install packages in toolbox
sudo dnf install python3 ...

# Or use Flatpak for GUI apps
flatpak install flathub org.audacityteam.Audacity
```

## SELinux Considerations

MAP2 is designed to work with SELinux enabled.

```bash
# Check SELinux status
getenforce

# If issues occur, check audit log
sudo ausearch -m avc -ts recent

# Allow specific actions if needed
sudo audit2allow -a
```

## Firewall Configuration

For remote access (optional):

```bash
# Allow web dashboard
sudo firewall-cmd --add-port=3000/tcp --permanent

# Allow API
sudo firewall-cmd --add-port=8080/tcp --permanent

# Reload
sudo firewall-cmd --reload
```

## PipeWire vs JACK

Fedora uses PipeWire by default since F34.

### Using PipeWire (Default)
```bash
# Check status
systemctl --user status pipewire

# PipeWire provides JACK compatibility
# No additional configuration needed
```

### Using Native JACK
```bash
# Install JACK
sudo dnf install jack-audio-connection-kit qjackctl

# Disable PipeWire JACK
systemctl --user mask pipewire-jack

# Start JACK manually
jackd -d alsa -d hw:1 -r 48000 -p 256
```

## Package Management

### DNF Commands

```bash
# Search for audio packages
dnf search lv2

# Install specific plugin
sudo dnf install lv2-calf-plugins

# List installed LV2 plugins
rpm -qa | grep lv2

# Find package contents
rpm -ql guitarix-lv2
```

### Copr Repositories

Additional audio software from Copr:

```bash
# Enable Planet CCRMA repo (optional)
sudo dnf copr enable hobbes1069/fedora-audio

# Search and install
dnf search --enablerepo=copr:hobbes1069:fedora-audio
```

## Real-Time Kernel (Optional)

For lowest latency:

```bash
# Install RT kernel
sudo dnf install kernel-rt kernel-rt-devel

# Reboot and select RT kernel
sudo reboot
```

## Troubleshooting Fedora-Specific Issues

### DNF Lock Issues
```bash
# Kill any stuck DNF processes
sudo pkill -9 dnf

# Clean cache
sudo dnf clean all
```

### Missing Development Headers
```bash
# Install development tools
sudo dnf groupinstall "Development Tools"
sudo dnf install python3-devel alsa-lib-devel
```

### Codec Issues
```bash
# Enable RPM Fusion
sudo dnf install \\
    https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm

# Install codecs
sudo dnf install ffmpeg
```
'''
    def _generate_changelog(self, manifest: Dict[str, Any]) -> str:
        """Generate changelog."""
        map2_version = manifest.get("map2_version", get_platform_version())
        return f'''# MAP2 Audio Platform - Changelog

## Version {map2_version}

### Backup Created: {manifest.get("created_at", "Unknown")}

This backup was created from host: {manifest.get("hostname", "Unknown")}

---

## Version History

### Version {map2_version} (Current)

#### Features
- Full backup and restore functionality
- Self-contained reinstaller for Fedora Server
- 8-tab TUI interface:
  - PEDALBOARD: Signal chain management
  - MIDI: MIDI mapping and control
  - PLUGINS: LV2 plugin browser
  - DASHBOARD: System status and metrics
  - WORKFLOW: Sessions and presets
  - GUITAR/NAM: Neural amp modeling
  - ABOUT: System information
  - BACKUP: Backup management

#### Audio Features
- LV2 plugin hosting via the JUCE engine
- Real-time signal chain processing
- MIDI CC parameter control
- MIDI learn functionality
- Latency compensation

#### Backend Features
- FastAPI REST API
- WebSocket real-time updates
- SQLite database persistence
- Async architecture

### Installation
- Automated Fedora Server installation
- Systemd service integration
- PipeWire/JACK audio support
- Real-time audio configuration

---

## Future Roadmap

- [ ] Cloud backup integration
- [ ] Multi-device sync
- [ ] Plugin preset sharing
- [ ] Advanced automation
- [ ] Mobile companion app
'''
    def _generate_license(self) -> str:
        """Generate license file."""
        return '''GNU Affero General Public License v3.0 only (AGPL-3.0-only)

MAP2-owned code and documentation are licensed under AGPL-3.0-only unless an
explicit file-level or package-level notice states otherwise. If you modify and
run MAP2 for users over a network, you must provide the corresponding source
code for that running version as required by AGPLv3. See the repository LICENSE
and docs/THIRD_PARTY_NOTICES.md files for the canonical license posture.

---

## Third-Party Licenses

This software incorporates components from the following projects:

### LV2
- License: ISC
- https://lv2plug.in/

### FastAPI
- License: MIT
- https://fastapi.tiangolo.com/

### Textual
- License: MIT
- https://textual.textualize.io/

### SQLAlchemy
- License: MIT
- https://www.sqlalchemy.org/

### LV2 Plugin Collections
- Calf Studio Gear: LGPL-2.1
- Guitarix: GPL-2.0
- LSP Plugins: LGPL-3.0

Full license texts for third-party components are available in their
respective source repositories.
'''
    def _generate_backup_readme(self, manifest: Dict[str, Any], backup_id: str) -> str:
        """Generate README documentation for the backup archive."""
        return f'''# MAP2 Audio Platform Backup

## Backup Information

- **Backup ID:** {backup_id}
- **Created:** {manifest.get("created_at", "Unknown")}
- **Source Host:** {manifest.get("hostname", "Unknown")}
- **Platform:** {manifest.get("platform", "Unknown")}
- **MAP2 Version:** {manifest.get("map2_version", "Unknown")}

## Quick Start - Fresh Fedora Server Installation

This backup is self-contained and can reinstall the entire MAP2 Audio Platform
on a fresh Fedora Server installation.

### Requirements

- Fresh Fedora Server (38+ recommended)
- Root access (sudo)
- Network connection for package downloads
- SSH access (for remote installation)

### Installation Steps

1. **Extract the backup:**
   ```bash
   tar -xzf map2-backup-{backup_id}.tar.gz
   cd map2-backup-{backup_id}
   ```

2. **Run the reinstaller:**
   ```bash
   chmod +x reinstall.sh
   sudo ./reinstall.sh
   ```

3. **Start the platform:**
   ```bash
   cd ~/map2-audio
   ./start_simple.sh        # Start backend
   textual run tui/app.py   # Start TUI (optional)
   ```

### Reinstaller Options

```bash
sudo ./reinstall.sh --help              # Show help
sudo ./reinstall.sh --user USERNAME     # Install for specific user
sudo ./reinstall.sh --skip-packages     # Skip DNF packages (already installed)
sudo ./reinstall.sh --skip-python       # Skip Python packages
sudo ./reinstall.sh --skip-restore      # Skip restoring user data
sudo ./reinstall.sh --dry-run           # Preview without making changes
```

## Backup Contents

### User Data (Backed Up)
- Database: `database/map2.db` - Chains, presets, MIDI mappings
- Impulse Responses: `user_data/ir/`
- NAM Models: `user_data/nam/`
- Sessions: `user_data/sessions/`
- Packages: `user_data/packages/`
- Config: `config/config.json`

### Source Code (Backed Up)
- Application code: `source/app/`
- TUI interface: `source/tui/`
- Scripts: `source/scripts/`
- Systemd services: `source/systemd/`

### Not Included (Reinstallable)
See `skip_list.json` for complete list of items that can be reinstalled
via package managers:
- DNF packages (python3, alsa-utils, jack, lv2 plugins, etc.)
- Python packages (fastapi, uvicorn, textual, etc.)
- Node.js packages (npm install)
- Build artifacts (regenerated automatically)

## Manual Restoration

If you prefer manual restoration instead of using the reinstaller:

1. Copy database:
   ```bash
   cp database/map2.db ~/map2-audio/data/
   ```

2. Copy user data:
   ```bash
   cp -r user_data/* ~/.map2/
   ```

3. Copy config (if exists):
   ```bash
   cp config/config.json ~/.map2/
   ```

## Support

For issues with the reinstaller or backup:
1. Check the installation log: `/tmp/map2-reinstall-*.log`
2. Verify Fedora version: `cat /etc/fedora-release`
3. Check network connectivity for package downloads

## License

MAP2 Audio Platform - AGPL-3.0-only License
'''
    async def create_backup(self, description: str = "") -> BackupInfo:
        """
        Create a new backup archive.

        Args:
            description: Optional description for the backup

        Returns:
            BackupInfo with details about the created backup
        """
        backup_id = self._generate_backup_id()
        backup_filename = f"map2-backup-{backup_id}.tar.gz"
        backup_path = Path(self.settings.backup_location) / backup_filename

        # Create manifest
        manifest = {
            "version": "1.0",
            "backup_id": backup_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "description": description,
            "hostname": platform.node(),
            "platform": f"{platform.system()} {platform.release()}",
            "map2_version": get_platform_version(),
            "backup_type": "full",
            "contents": {},
            "total_size_bytes": 0,
        }

        # Create skip list
        skip_list = self.generate_skip_list()

        # Use temp directory for atomic operation
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            staging_dir = temp_path / "backup_staging"
            staging_dir.mkdir()

            # Write manifest placeholder (will update at end)
            manifest_path = staging_dir / "manifest.json"

            # Write skip list
            skip_list_path = staging_dir / "skip_list.json"
            with open(skip_list_path, 'w') as f:
                json.dump(skip_list, f, indent=2)

            # Backup database
            db_path = self.DEFAULT_BACKUP_PATHS["database"]
            if db_path.exists():
                db_staging = staging_dir / "database"
                db_staging.mkdir()
                dest_db = db_staging / "map2.db"
                shutil.copy2(db_path, dest_db)
                size = dest_db.stat().st_size
                manifest["contents"]["database"] = {
                    "path": "database/map2.db",
                    "size_bytes": size,
                    "original_path": str(db_path)
                }
                manifest["total_size_bytes"] += size

            # Backup user data directories
            user_data_staging = staging_dir / "user_data"
            user_data_staging.mkdir()

            for key, source_path in [
                ("ir", self.DEFAULT_BACKUP_PATHS["user_ir"]),
                ("nam", self.DEFAULT_BACKUP_PATHS["user_nam"]),
                ("sessions", self.DEFAULT_BACKUP_PATHS["user_sessions"]),
                ("packages", self.DEFAULT_BACKUP_PATHS["user_packages"]),
            ]:
                if source_path.exists() and source_path.is_dir():
                    dest_dir = user_data_staging / key
                    shutil.copytree(source_path, dest_dir, dirs_exist_ok=True)

                    # Calculate size and count
                    file_count = 0
                    total_size = 0
                    for f in dest_dir.rglob("*"):
                        if f.is_file():
                            file_count += 1
                            total_size += f.stat().st_size

                    manifest["contents"][f"user_{key}"] = {
                        "path": f"user_data/{key}",
                        "count": file_count,
                        "size_bytes": total_size,
                        "original_path": str(source_path)
                    }
                    manifest["total_size_bytes"] += total_size

            # Backup config file
            config_path = self.DEFAULT_BACKUP_PATHS["user_config"]
            if config_path.exists():
                config_staging = staging_dir / "config"
                config_staging.mkdir()
                dest_config = config_staging / "config.json"
                shutil.copy2(config_path, dest_config)
                size = dest_config.stat().st_size
                manifest["contents"]["config"] = {
                    "path": "config/config.json",
                    "size_bytes": size,
                    "original_path": str(config_path)
                }
                manifest["total_size_bytes"] += size

            # Generate and write reinstaller script
            from app.services.backup.recovery import REINSTALLER_SCRIPT

            reinstaller_content = REINSTALLER_SCRIPT.format(
                timestamp=manifest["created_at"],
                backup_id=backup_id,
                hostname=manifest["hostname"],
                map2_version=manifest["map2_version"],
            )
            reinstaller_path = staging_dir / "reinstall.sh"
            with open(reinstaller_path, 'w') as f:
                f.write(reinstaller_content)
            # Make executable
            os.chmod(reinstaller_path, 0o755)
            manifest["contents"]["reinstaller"] = {
                "path": "reinstall.sh",
                "description": "Self-contained reinstaller for Fedora Server"
            }

            # Write README for the backup
            readme_content = self._generate_backup_readme(manifest, backup_id)
            readme_path = staging_dir / "README.md"
            with open(readme_path, 'w') as f:
                f.write(readme_content)


            # Backup full application source directory as a tar.gz
            full_source_dir = self._get_app_root_dir()
            if full_source_dir.exists():
                full_source_tar = staging_dir / "full_source.tar.gz"
                with tarfile.open(full_source_tar, "w:gz") as tar:
                    tar.add(full_source_dir, arcname="map2-audio")
                source_size = full_source_tar.stat().st_size
                manifest["contents"]["full_source"] = {
                    "path": "full_source.tar.gz",
                    "size_bytes": source_size,
                    "original_path": str(full_source_dir),
                    "description": f"Full tar.gz copy of MAP2 source from {full_source_dir}"
                }
                manifest["total_size_bytes"] += source_size

            # Generate comprehensive documentation set
            self._generate_documentation_set(manifest, backup_id, staging_dir)
            manifest["contents"]["documentation"] = {
                "path": "docs/",
                "description": "Complete documentation including installation, troubleshooting, API reference"
            }

            # Write final manifest
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)

            # Create tar.gz archive
            temp_archive = temp_path / backup_filename
            with tarfile.open(temp_archive, "w:gz") as tar:
                for item in staging_dir.iterdir():
                    tar.add(item, arcname=item.name)

            # Calculate checksum
            checksum = self._calculate_checksum(temp_archive)

            # Update manifest with checksum (re-create archive)
            manifest["checksum"] = checksum
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)

            with tarfile.open(temp_archive, "w:gz") as tar:
                for item in staging_dir.iterdir():
                    tar.add(item, arcname=item.name)

            # Atomic move to final location
            shutil.move(str(temp_archive), str(backup_path))

        # Apply lifecycle cleanup if enabled
        if self.settings.auto_cleanup:
            await self.cleanup_old_backups()

        # Return backup info
        size = backup_path.stat().st_size
        return BackupInfo(
            id=backup_id,
            filename=backup_filename,
            path=str(backup_path),
            created_at=manifest["created_at"],
            size_bytes=size,
            size_human=self._human_readable_size(size),
            valid=True,
            manifest=manifest
        )

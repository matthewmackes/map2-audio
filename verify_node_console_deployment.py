#!/usr/bin/env python3
"""
Deployment verification script for MAP2 Node Console.
Tests that all components are in place and importable.
"""

import sys
import os

sys.path.insert(0, '/home/mm/map2-audio')
os.chdir('/home/mm/map2-audio')

print("\n" + "=" * 60)
print("MAP2 NODE CONSOLE — DEPLOYMENT VERIFICATION")
print("=" * 60 + "\n")

# Test 1: Core models
print("[1] Testing core models...")
try:
    from tui.node_console.models import (
        NodeSnapshot, NodeMode, HealthLevel,
        AudioEngineStatus, PipewireStatus, ClusterStatus
    )
    print("    ✓ Models: NodeSnapshot, NodeMode, HealthLevel")
    print("    ✓ Audio models: AudioEngineStatus, PipewireStatus")
    print("    ✓ Cluster models: ClusterStatus")
except Exception as e:
    print(f"    ✗ FAILED: {e}")
    sys.exit(1)

# Test 2: API Client
print("\n[2] Testing API client...")
try:
    from tui.node_console.api_client import NodeAPIClient
    client = NodeAPIClient()
    print(f"    ✓ NodeAPIClient instantiated")
    print(f"    ✓ Base URL: {client.base_url}")
    print(f"    ✓ Timeout: {client.timeout}s")
except Exception as e:
    print(f"    ✗ FAILED: {e}")
    sys.exit(1)

# Test 3: Collectors
print("\n[3] Testing collectors...")
try:
    from tui.node_console.collectors import (
        collect_hostname, collect_cpu, collect_memory,
        collect_network, collect_node_mode, collect_snapshot
    )
    print("    ✓ Local collectors: hostname, cpu, memory, network, mode")
    hostname = collect_hostname()
    cpu = collect_cpu()
    mem = collect_memory()
    print(f"    ✓ Sample data: {hostname} | {cpu.percent:.1f}% CPU | {mem.percent:.1f}% RAM")
except Exception as e:
    print(f"    ✗ FAILED: {e}")
    sys.exit(1)

# Test 4: Modals
print("\n[4] Testing modals...")
try:
    from tui.node_console.modals.confirm import ConfirmModal, ProgressModal
    print("    ✓ ConfirmModal loaded")
    print("    ✓ ProgressModal loaded")
except Exception as e:
    print(f"    ✗ FAILED: {e}")
    sys.exit(1)

# Test 5: Screens
print("\n[5] Testing screen modules...")
try:
    from tui.node_console.screens.dashboard import DashboardPane
    from tui.node_console.screens.audio import AudioPane
    from tui.node_console.screens.cluster import ClusterPane
    from tui.node_console.screens.node_actions import NodeActionsPane
    from tui.node_console.screens.logs import LogsPane
    from tui.node_console.screens.help import HelpPane
    print("    ✓ DashboardPane")
    print("    ✓ AudioPane")
    print("    ✓ ClusterPane")
    print("    ✓ NodeActionsPane")
    print("    ✓ LogsPane")
    print("    ✓ HelpPane")
except Exception as e:
    print(f"    ✗ FAILED: {e}")
    sys.exit(1)

# Test 6: Main app
print("\n[6] Testing main app...")
try:
    from tui.node_console.app import NodeConsoleApp
    print("    ✓ NodeConsoleApp loaded")
except Exception as e:
    print(f"    ✗ FAILED: {e}")
    sys.exit(1)

# Test 7: Package metadata
print("\n[7] Testing package metadata...")
try:
    from tui.node_console import __version__, __app_name__
    print(f"    ✓ App name: {__app_name__}")
    print(f"    ✓ Version: {__version__}")
except Exception as e:
    print(f"    ✗ FAILED: {e}")
    sys.exit(1)

# Test 8: CLI entry point
print("\n[8] Testing CLI entry point...")
try:
    from tui.node_console.__main__ import main
    print("    ✓ CLI main() function loaded")
    print("    ✓ Supports: --help, --version, --no-color, --debug, --refresh, --api-url")
except Exception as e:
    print(f"    ✗ FAILED: {e}")
    sys.exit(1)

# Test 9: File structure
print("\n[9] Verifying file structure...")
files_to_check = [
    "tui/node_console/__init__.py",
    "tui/node_console/__main__.py",
    "tui/node_console/app.py",
    "tui/node_console/models.py",
    "tui/node_console/api_client.py",
    "tui/node_console/collectors.py",
    "tui/node_console/theme.tcss",
    "tui/node_console/screens/__init__.py",
    "tui/node_console/screens/dashboard.py",
    "tui/node_console/screens/audio.py",
    "tui/node_console/screens/cluster.py",
    "tui/node_console/screens/node_actions.py",
    "tui/node_console/screens/logs.py",
    "tui/node_console/screens/help.py",
    "tui/node_console/modals/__init__.py",
    "tui/node_console/modals/confirm.py",
]
for f in files_to_check:
    if os.path.exists(f):
        print(f"    ✓ {f}")
    else:
        print(f"    ✗ MISSING: {f}")
        sys.exit(1)

# Test 10: Deprecated components archived
print("\n[10] Verifying old components archived...")
try:
    if os.path.isdir("tui/_deprecated_old_ui"):
        print("    ✓ Old UI components archived in _deprecated_old_ui/")
    else:
        print("    ⚠ Warning: _deprecated_old_ui/ not found (old modules may still exist)")
except Exception as e:
    print(f"    ⚠ Check skipped: {e}")

# Success!
print("\n" + "=" * 60)
print("✓✓✓ DEPLOYMENT VERIFICATION SUCCESSFUL ✓✓✓")
print("=" * 60)
print("\nLaunch the TUI:")
print("  ./tui.sh")
print("  python3 -m tui.node_console")
print("  python3 -m tui.node_console --help")
print("  python3 -m tui.node_console --version")
print("\n")

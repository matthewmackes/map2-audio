"""
Core Plugins API Routes
Endpoints for managing and verifying core plugin installations (ToobAmp, etc.)
"""

import os
import json
import logging
import subprocess
from typing import List, Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from fastapi import APIRouter, HTTPException, BackgroundTasks
    from pydantic import BaseModel

    router = APIRouter(prefix="/api/core-plugins", tags=["core-plugins"])

    # ToobAmp plugin definitions
    TOOBAMP_PLUGINS = {
        # Amp Modeling
        "http://two-play.com/plugins/toob-nam": {
            "name": "TooB Neural Amp Modeler",
            "category": "Amp Modeling",
            "description": "Neural Amp Modeler using NAM library",
            "priority": "high"
        },
        "http://two-play.com/plugins/toob-ml": {
            "name": "TooB ML Amplifier",
            "category": "Amp Modeling",
            "description": "ML-based amp modeling",
            "priority": "high"
        },
        # Cabinet Simulation
        "http://two-play.com/plugins/toob-cab-ir": {
            "name": "TooB Cab IR",
            "category": "Cabinet",
            "description": "Convolution-based cabinet IR",
            "priority": "high"
        },
        "http://two-play.com/plugins/toob-cabsim": {
            "name": "TooB CabSim",
            "category": "Cabinet",
            "description": "EQ-based cabinet simulation",
            "priority": "medium"
        },
        # Reverb
        "http://two-play.com/plugins/toob-convolution-reverb": {
            "name": "TooB Convolution Reverb",
            "category": "Reverb",
            "description": "Convolution reverb with IR support",
            "priority": "medium"
        },
        "http://two-play.com/plugins/toob-freeverb": {
            "name": "TooB Freeverb",
            "category": "Reverb",
            "description": "Classic Freeverb algorithm",
            "priority": "medium"
        },
        # EQ
        "http://two-play.com/plugins/toob-peq": {
            "name": "TooB Parametric EQ",
            "category": "EQ",
            "description": "4-band parametric EQ",
            "priority": "medium"
        },
        "http://two-play.com/plugins/toob-3band-eq": {
            "name": "TooB 3 Band EQ",
            "category": "EQ",
            "description": "Simple 3-band EQ",
            "priority": "medium"
        },
        "http://two-play.com/plugins/toob-tone-stack": {
            "name": "TooB Tone Stack",
            "category": "EQ",
            "description": "Classic amp tone stack",
            "priority": "medium"
        },
        "http://two-play.com/plugins/toob-ge7-eq": {
            "name": "TooB GE-7 Graphics Equalizer",
            "category": "EQ",
            "description": "7-band graphic EQ",
            "priority": "low"
        },
        # Modulation
        "http://two-play.com/plugins/toob-ce2-chorus": {
            "name": "TooB CE-2 Chorus",
            "category": "Modulation",
            "description": "Boss CE-2 chorus replica",
            "priority": "medium"
        },
        "http://two-play.com/plugins/toob-bf2-flanger": {
            "name": "TooB BF-2 Flanger",
            "category": "Modulation",
            "description": "Boss BF-2 flanger replica",
            "priority": "medium"
        },
        "http://two-play.com/plugins/toob-phaser": {
            "name": "TooB Phaser",
            "category": "Modulation",
            "description": "Phaser effect",
            "priority": "medium"
        },
        "http://two-play.com/plugins/toob-tremolo": {
            "name": "TooB Tremolo",
            "category": "Modulation",
            "description": "Tremolo effect",
            "priority": "low"
        },
        # Time-based
        "http://two-play.com/plugins/toob-delay": {
            "name": "TooB Delay",
            "category": "Delay",
            "description": "Delay effect",
            "priority": "medium"
        },
        # Utility
        "http://two-play.com/plugins/toob-tuner": {
            "name": "TooB Tuner",
            "category": "Utility",
            "description": "Guitar tuner",
            "priority": "high"
        },
        "http://two-play.com/plugins/toob-noise-gate": {
            "name": "TooB Noise Gate",
            "category": "Dynamics",
            "description": "Noise gate / slow gear",
            "priority": "high"
        },
        "http://two-play.com/plugins/toob-input-stage": {
            "name": "TooB Input Stage",
            "category": "Utility",
            "description": "Input conditioning",
            "priority": "medium"
        },
        "http://two-play.com/plugins/toob-volume": {
            "name": "TooB Volume",
            "category": "Utility",
            "description": "Volume control",
            "priority": "low"
        },
        "http://two-play.com/plugins/toob-mix": {
            "name": "TooB Mix",
            "category": "Utility",
            "description": "Stereo channel mixer",
            "priority": "low"
        },
        "http://two-play.com/plugins/toob-spectrum-analyzer": {
            "name": "TooB Spectrum Analyzer",
            "category": "Analyzer",
            "description": "Spectrum analyzer",
            "priority": "low"
        },
        "http://two-play.com/plugins/toob-4looper": {
            "name": "TooB 4Looper",
            "category": "Looper",
            "description": "4-track looper",
            "priority": "low"
        },
        "http://two-play.com/plugins/toob-one-button-looper": {
            "name": "TooB One-Button Looper",
            "category": "Looper",
            "description": "Simple MIDI looper",
            "priority": "low"
        },
    }

    # Standard LV2 paths to check
    LV2_PATHS = [
        "/usr/lib/lv2",
        "/usr/lib64/lv2",
        "/usr/local/lib/lv2",
        os.path.expanduser("~/.lv2"),
        "/usr/lib/x86_64-linux-gnu/lv2",
        "/usr/lib/aarch64-linux-gnu/lv2",
    ]

    class PluginStatus(BaseModel):
        """Status of a single plugin"""
        uri: str
        name: str
        category: str
        description: str
        priority: str
        installed: bool
        path: Optional[str] = None

    class CorePluginsStatus(BaseModel):
        """Overall core plugins status"""
        toobamp_installed: bool
        toobamp_version: Optional[str]
        total_expected: int
        total_installed: int
        missing_high_priority: List[str]
        plugins: List[PluginStatus]

    class InstallResult(BaseModel):
        """Installation result"""
        success: bool
        message: str
        installed_count: int
        errors: List[str]

    def _find_toobamp_bundle() -> Optional[str]:
        """Find ToobAmp LV2 bundle location."""
        for lv2_path in LV2_PATHS:
            if not os.path.isdir(lv2_path):
                continue

            # Check for ToobAmp.lv2 bundle
            bundle_path = os.path.join(lv2_path, "ToobAmp.lv2")
            if os.path.isdir(bundle_path):
                return bundle_path

            # Check for individual toob-*.lv2 bundles
            for item in os.listdir(lv2_path):
                if item.startswith("toob-") and item.endswith(".lv2"):
                    return os.path.join(lv2_path, item)

        return None

    def _get_toobamp_version() -> Optional[str]:
        """Try to get ToobAmp version from installed files."""
        bundle_path = _find_toobamp_bundle()
        if not bundle_path:
            return None

        # Try to find version in manifest.ttl or other files
        manifest = os.path.join(bundle_path, "manifest.ttl")
        if os.path.isfile(manifest):
            try:
                with open(manifest, 'r') as f:
                    content = f.read()
                    # Look for version patterns
                    import re
                    match = re.search(r'lv2:minorVersion\s+(\d+)', content)
                    if match:
                        minor = match.group(1)
                        match2 = re.search(r'lv2:microVersion\s+(\d+)', content)
                        micro = match2.group(1) if match2 else "0"
                        return f"1.{minor}.{micro}"
            except Exception:
                pass

        return "unknown"

    def _check_plugin_installed(uri: str) -> tuple[bool, Optional[str]]:
        """Check if a specific plugin URI is available."""
        try:
            # Use lv2ls if available
            result = subprocess.run(
                ["lv2ls"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                if uri in result.stdout:
                    return True, None
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

        # Fallback: check if ToobAmp bundle exists
        bundle_path = _find_toobamp_bundle()
        if bundle_path:
            # If bundle exists, assume plugin is available
            return True, bundle_path

        return False, None

    @router.get("/status", response_model=CorePluginsStatus)
    async def get_core_plugins_status():
        """Get status of all core plugins."""
        plugins = []
        installed_count = 0
        missing_high_priority = []

        # Check ToobAmp bundle
        bundle_path = _find_toobamp_bundle()
        toobamp_installed = bundle_path is not None
        toobamp_version = _get_toobamp_version() if toobamp_installed else None

        # If ToobAmp bundle exists, assume all plugins are installed
        for uri, info in TOOBAMP_PLUGINS.items():
            installed = toobamp_installed
            path = bundle_path if installed else None

            if not installed and info["priority"] == "high":
                missing_high_priority.append(info["name"])

            if installed:
                installed_count += 1

            plugins.append(PluginStatus(
                uri=uri,
                name=info["name"],
                category=info["category"],
                description=info["description"],
                priority=info["priority"],
                installed=installed,
                path=path
            ))

        return CorePluginsStatus(
            toobamp_installed=toobamp_installed,
            toobamp_version=toobamp_version,
            total_expected=len(TOOBAMP_PLUGINS),
            total_installed=installed_count,
            missing_high_priority=missing_high_priority,
            plugins=plugins
        )

    @router.get("/verify")
    async def verify_core_plugins():
        """Verify core plugin installation and return detailed report."""
        status = await get_core_plugins_status()

        report = {
            "status": "ok" if status.toobamp_installed else "missing",
            "toobamp": {
                "installed": status.toobamp_installed,
                "version": status.toobamp_version,
                "path": _find_toobamp_bundle()
            },
            "summary": {
                "total": status.total_expected,
                "installed": status.total_installed,
                "missing": status.total_expected - status.total_installed,
                "coverage": f"{(status.total_installed / status.total_expected * 100):.0f}%"
            },
            "high_priority_missing": status.missing_high_priority,
            "install_command": "bash scripts/install-toobamp.sh" if not status.toobamp_installed else None
        }

        return report

    @router.get("/categories")
    async def get_plugin_categories():
        """Get core plugins grouped by category."""
        categories: Dict[str, List[Dict]] = {}

        for uri, info in TOOBAMP_PLUGINS.items():
            cat = info["category"]
            if cat not in categories:
                categories[cat] = []
            categories[cat].append({
                "uri": uri,
                "name": info["name"],
                "description": info["description"],
                "priority": info["priority"]
            })

        # Sort each category by priority
        priority_order = {"high": 0, "medium": 1, "low": 2}
        for cat in categories:
            categories[cat].sort(key=lambda x: priority_order.get(x["priority"], 3))

        return categories

    @router.post("/install")
    async def install_core_plugins(background_tasks: BackgroundTasks):
        """Trigger core plugin installation (runs install script in background)."""
        script_path = Path(__file__).parent.parent.parent / "scripts" / "install-toobamp.sh"

        if not script_path.exists():
            raise HTTPException(
                status_code=500,
                detail=f"Installation script not found: {script_path}"
            )

        # Check if already installed
        if _find_toobamp_bundle():
            return {
                "status": "already_installed",
                "message": "ToobAmp is already installed",
                "path": _find_toobamp_bundle()
            }

        # Run installation in background
        def run_install():
            try:
                result = subprocess.run(
                    ["bash", str(script_path)],
                    capture_output=True,
                    text=True,
                    timeout=600  # 10 minute timeout
                )
                logger.info(f"ToobAmp installation completed: {result.returncode}")
                if result.stdout:
                    logger.info(f"stdout: {result.stdout[-1000:]}")
                if result.stderr:
                    logger.warning(f"stderr: {result.stderr[-1000:]}")
            except Exception as e:
                logger.error(f"ToobAmp installation failed: {e}")

        background_tasks.add_task(run_install)

        return {
            "status": "started",
            "message": "ToobAmp installation started in background",
            "check_endpoint": "/api/core-plugins/status"
        }

    @router.get("/lv2-paths")
    async def get_lv2_paths():
        """Get LV2 plugin paths and their status."""
        paths = []
        for path in LV2_PATHS:
            exists = os.path.isdir(path)
            plugin_count = 0
            if exists:
                try:
                    plugin_count = len([
                        d for d in os.listdir(path)
                        if d.endswith(".lv2") and os.path.isdir(os.path.join(path, d))
                    ])
                except PermissionError:
                    plugin_count = -1  # Permission denied

            paths.append({
                "path": path,
                "exists": exists,
                "plugin_count": plugin_count
            })

        return {"paths": paths}

    @router.post("/refresh-cache")
    async def refresh_plugin_cache():
        """Clear and refresh the plugin cache to detect newly installed plugins."""
        try:
            from app.routes.plugins import invalidate_plugin_cache
            count = invalidate_plugin_cache()
            return {
                "status": "success",
                "message": f"Plugin cache cleared ({count} plugins)",
                "action": "Cache will be repopulated on next plugin discovery"
            }
        except Exception as e:
            logger.error(f"Error refreshing plugin cache: {e}")
            raise HTTPException(status_code=500, detail=str(e))

except ImportError:
    router = None

"""
LV2 Plugin Package Management API Routes

Allows installing and uninstalling sets of LV2 plugins via system package manager.
"""

import asyncio
import logging
import os
import glob
from typing import List, Optional
from enum import Enum

try:
    from fastapi import APIRouter, HTTPException, BackgroundTasks
    from pydantic import BaseModel
    from app.routes.plugins import invalidate_plugin_cache

    router = APIRouter(prefix="/api/plugin-packages", tags=["plugin-packages"])
    logger = logging.getLogger(__name__)

    class PackageStatus(str, Enum):
        INSTALLED = "installed"
        NOT_INSTALLED = "not_installed"
        INSTALLING = "installing"
        UNINSTALLING = "uninstalling"
        DISABLED = "disabled"
        DISABLING = "disabling"
        ENABLING = "enabling"
        ERROR = "error"

    class PluginPack(BaseModel):
        id: str
        name: str
        description: str
        packages: List[str]  # apt package names
        category: str
        size_estimate: str
        plugin_count: int
        status: PackageStatus = PackageStatus.NOT_INSTALLED
        error_message: Optional[str] = None
        can_install: bool = True  # Whether this pack can be installed via package manager
        can_uninstall: bool = True  # Whether this pack can be uninstalled via package manager

    # Define available plugin packs
    PLUGIN_PACKS = {
        "guitarix": PluginPack(
            id="guitarix",
            name="Guitarix",
            description="Guitar amp simulation and effects suite with many high-quality amp models, cabinets, and effects",
            packages=["guitarix-lv2"],
            category="Guitar/Amp Simulation",
            size_estimate="~50 MB",
            plugin_count=180
        ),
        "calf": PluginPack(
            id="calf",
            name="Calf Studio Gear",
            description="Professional audio plugins including compressors, EQs, reverbs, delays, and synthesizers",
            packages=["calf-plugins"],
            category="Studio/Mixing",
            size_estimate="~15 MB",
            plugin_count=45
        ),
        "lsp": PluginPack(
            id="lsp",
            name="LSP Plugins",
            description="Linux Studio Plugins - high-quality EQs, compressors, limiters, gates, and analysis tools",
            packages=["lsp-plugins-lv2"],
            category="Studio/Mixing",
            size_estimate="~30 MB",
            plugin_count=140
        ),
        "x42": PluginPack(
            id="x42",
            name="x42 Plugins",
            description="Robin Gareus plugins including meters, EQs, auto-tune, MIDI filters, and more",
            packages=["x42-plugins"],
            category="Utility/Analysis",
            size_estimate="~20 MB",
            plugin_count=50
        ),
        "dragonfly": PluginPack(
            id="dragonfly",
            name="Dragonfly Reverbs",
            description="High-quality algorithmic reverb plugins - Hall, Room, Plate, and Early Reflections",
            packages=["dragonfly-reverb"],
            category="Reverb/Space",
            size_estimate="~5 MB",
            plugin_count=4
        ),
        "zam": PluginPack(
            id="zam",
            name="ZAM Plugins",
            description="Damien Zammit's plugins - compressors, limiters, EQs, delays, and saturation",
            packages=["zam-plugins"],
            category="Studio/Mixing",
            size_estimate="~10 MB",
            plugin_count=20
        ),
        "gxplugins": PluginPack(
            id="gxplugins",
            name="GxPlugins",
            description="Additional Guitarix-style effect plugins for guitar and bass processing",
            packages=["gxplugins"],
            category="Guitar/Effects",
            size_estimate="~15 MB",
            plugin_count=35
        ),
        "dpf": PluginPack(
            id="dpf",
            name="DPF Plugins",
            description="DISTRHO Plugin Framework plugins including Nekobi synth, Kars, ProM visualizer",
            packages=["dpf-plugins-lv2"],
            category="Synths/Effects",
            size_estimate="~8 MB",
            plugin_count=25
        ),
        "ams-lv2": PluginPack(
            id="ams-lv2",
            name="AMS LV2",
            description="Alsa Modular Synth plugins - oscillators, filters, LFOs, envelopes for modular synthesis",
            packages=["ams-lv2"],
            category="Synth/Modular",
            size_estimate="~5 MB",
            plugin_count=30
        ),
        "mda-lv2": PluginPack(
            id="mda-lv2",
            name="MDA Plugins",
            description="Classic MDA plugin collection - synths, effects, and utilities",
            packages=["mda-lv2"],
            category="Classic/Vintage",
            size_estimate="~3 MB",
            plugin_count=35
        ),
        "tap": PluginPack(
            id="tap",
            name="TAP Plugins",
            description="Tom's Audio Processing plugins - reverb, EQ, dynamics, and creative effects",
            packages=["tap-lv2"],
            category="Effects",
            size_estimate="~3 MB",
            plugin_count=20
        ),
        "swh": PluginPack(
            id="swh",
            name="SWH Plugins",
            description="Steve Harris plugins - over 90 plugins including filters, delays, distortions",
            packages=["swh-lv2"],
            category="Effects/Utility",
            size_estimate="~5 MB",
            plugin_count=90
        ),
        "invada": PluginPack(
            id="invada",
            name="Invada Plugins",
            description="Invada Records plugins - tube distortion, compressor, delays, filters, phaser",
            packages=["invada-studio-plugins-lv2"],
            category="Effects",
            size_estimate="~3 MB",
            plugin_count=15
        ),
        "mod": PluginPack(
            id="mod",
            name="MOD Audio Plugins",
            description="MOD Devices plugin collection for guitar and bass pedalboard effects",
            packages=["mod-host", "mod-ui"],
            category="Guitar/Pedalboard",
            size_estimate="~25 MB",
            plugin_count=50
        ),
        "caps": PluginPack(
            id="caps",
            name="CAPS Plugins",
            description="C* Audio Plugin Suite - amp simulations, reverbs, EQs, vintage effects",
            packages=["caps-lv2"],
            category="Guitar/Vintage",
            size_estimate="~3 MB",
            plugin_count=25
        ),
        "carla": PluginPack(
            id="carla",
            name="Carla",
            description="Carla plugin host - multi-format audio plugin host as an LV2 plugin",
            packages=["carla"],
            category="Plugin Host",
            size_estimate="~50 MB",
            plugin_count=1
        ),
        "drumkv1": PluginPack(
            id="drumkv1",
            name="drumkv1",
            description="Vee One drumkv1 - old-school drum-kit sampler with 16 instrument pads",
            packages=["drumkv1"],
            category="Drums/Sampler",
            size_estimate="~5 MB",
            plugin_count=1
        ),
        "samplv1": PluginPack(
            id="samplv1",
            name="samplv1",
            description="Vee One samplv1 - polyphonic sampler synthesizer with 4 oscillators",
            packages=["samplv1"],
            category="Synth/Sampler",
            size_estimate="~5 MB",
            plugin_count=1
        ),
        "abgate": PluginPack(
            id="abgate",
            name="abGate",
            description="abGate - simple noise gate plugin for cutting background noise",
            packages=["abgate"],
            category="Dynamics",
            size_estimate="~1 MB",
            plugin_count=1
        ),
        "eq10q": PluginPack(
            id="eq10q",
            name="EQ10Q / Sapista EQ",
            description="EQ10Q suite - parametric equalizers including Sapista 10-band EQ",
            packages=["eq10q"],
            category="EQ",
            size_estimate="~5 MB",
            plugin_count=5
        ),
        "ir": PluginPack(
            id="ir",
            name="IR LV2",
            description="IR LV2 - zero-latency convolution reverb for impulse response loading",
            packages=["ir-lv2"],
            category="Reverb/Convolution",
            size_estimate="~2 MB",
            plugin_count=1
        ),
    }

    # Track installation status
    _installation_status = {}

    # LV2 directory patterns for detecting installed plugins
    LV2_DETECTION_PATTERNS = {
        "guitarix": ["gx_*.lv2", "gxautowah.lv2", "gxbooster.lv2"],
        "calf": ["calf.lv2"],
        "lsp": ["lsp-*.lv2"],
        "x42": ["fil4.lv2", "fat1.lv2", "meters.lv2", "midifilter.lv2", "balance.lv2", "darc.lv2", "dpl.lv2", "controlfilter.lv2"],
        "dragonfly": ["Dragonfly*.lv2"],
        "zam": ["zam*.lv2", "ZaM*.lv2"],
        "gxplugins": ["gx_*.lv2"],  # Same as guitarix, they overlap
        # DPF plugins - includes both official DISTRHO and common DPF-based plugins
        "dpf": ["Kars.lv2", "Nekobi.lv2", "ProM.lv2", "glBars.lv2",
                "3BandEQ.lv2", "3BandSplitter.lv2", "AmplitudeImposer.lv2",
                "MaBitcrush.lv2", "MaFreeverb.lv2", "MaGigaverb.lv2", "MaPitchshift.lv2",
                "MVerb.lv2", "PingPongPan.lv2", "SoulForce.lv2"],
        "ams-lv2": ["ams_lv2*.lv2", "vcf*.lv2"],
        "mda-lv2": ["mda.lv2", "mod-mda-*.lv2"],
        "tap": ["tap-*.lv2", "tap_*.lv2"],
        "swh": ["*-swh.lv2"],
        "invada": ["invada*.lv2", "inv_*.lv2"],
        "mod": ["mod-*.lv2"],
        "caps": ["caps-*.lv2", "C*"],
        # Additional common plugins
        "carla": ["carla.lv2"],
        "drumkv1": ["drumkv1.lv2"],
        "samplv1": ["samplv1.lv2"],
        "abgate": ["abGate.lv2"],
        "eq10q": ["sapistaEQv2.lv2"],
        "ir": ["ir.lv2"],
    }

    # Standard LV2 search paths
    LV2_PATHS = [
        "/usr/lib/lv2",
        "/usr/lib64/lv2",
        "/usr/local/lib/lv2",
        "/usr/local/lib64/lv2",
        os.path.expanduser("~/.lv2"),
    ]

    # Disabled plugins storage path
    LV2_DISABLED_PATH = os.path.expanduser("~/.lv2-disabled")

    def get_lv2_plugin_dirs(pack_id: str, search_paths: List[str] = None) -> List[str]:
        """Get all LV2 plugin directories for a pack."""
        patterns = LV2_DETECTION_PATTERNS.get(pack_id, [])
        if not patterns:
            return []

        paths = search_paths or LV2_PATHS
        found_dirs = []
        for lv2_path in paths:
            if not os.path.isdir(lv2_path):
                continue
            for pattern in patterns:
                matches = glob.glob(os.path.join(lv2_path, pattern))
                found_dirs.extend(matches)
        return found_dirs

    def check_lv2_disabled(pack_id: str) -> bool:
        """Check if LV2 plugins for a pack are in the disabled directory."""
        if not os.path.isdir(LV2_DISABLED_PATH):
            return False
        return len(get_lv2_plugin_dirs(pack_id, [LV2_DISABLED_PATH])) > 0

    def check_lv2_installed(pack_id: str) -> bool:
        """Check if LV2 plugins for a pack are installed by scanning directories."""
        patterns = LV2_DETECTION_PATTERNS.get(pack_id, [])
        if not patterns:
            return False

        for lv2_path in LV2_PATHS:
            if not os.path.isdir(lv2_path):
                continue
            for pattern in patterns:
                matches = glob.glob(os.path.join(lv2_path, pattern))
                if matches:
                    return True
        return False

    async def check_package_installed(packages: List[str], pack_id: str = None) -> bool:
        """Check if all packages in a list are installed using multiple methods."""
        # First try LV2 directory scanning (works on all distros)
        if pack_id and check_lv2_installed(pack_id):
            return True

        # Try dpkg (Debian/Ubuntu)
        try:
            for pkg in packages:
                proc = await asyncio.create_subprocess_exec(
                    "dpkg", "-s", pkg,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL
                )
                await proc.wait()
                if proc.returncode != 0:
                    # Try rpm (Fedora/RHEL)
                    proc = await asyncio.create_subprocess_exec(
                        "rpm", "-q", pkg,
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL
                    )
                    await proc.wait()
                    if proc.returncode != 0:
                        return False
            return True
        except Exception as e:
            logger.debug(f"Package manager check failed: {e}")
            return False

    def detect_package_manager() -> str:
        """Detect the system package manager."""
        import shutil
        if shutil.which("dnf"):
            return "dnf"
        elif shutil.which("apt-get"):
            return "apt"
        elif shutil.which("pacman"):
            return "pacman"
        return "unknown"

    # Fedora package name mappings (pack_id -> fedora packages)
    # None means not available in Fedora repos
    FEDORA_PACKAGES = {
        "guitarix": ["lv2-guitarix-plugins"],
        "calf": ["lv2-calf-plugins", "lv2-calf-plugins-gui"],
        "lsp": ["lsp-plugins-lv2"],
        "x42": ["lv2-x42-plugins"],
        "dragonfly": None,  # Not in Fedora repos - pre-installed or manual
        "zam": ["lv2-zam-plugins"],
        "gxplugins": ["lv2-guitarix-plugins"],  # Part of guitarix on Fedora
        "dpf": None,  # Not in Fedora repos - manually installed
        "ams-lv2": None,  # Not in Fedora repos
        "mda-lv2": ["lv2-mdala-plugins"],
        "tap": None,  # Not in Fedora repos
        "swh": ["lv2-swh-plugins"],
        "invada": None,  # Not in Fedora repos
        "mod": None,  # Not in Fedora repos
        "caps": None,  # Not in Fedora repos
        # Additional common plugins on Fedora
        "carla": ["lv2-carla"],
        "drumkv1": ["lv2-drumkv1"],
        "samplv1": ["lv2-samplv1"],
        "abgate": ["lv2-abGate"],
        "eq10q": ["lv2-eq10q"],
        "ir": None,  # Not in Fedora repos - manual install
    }

    def get_packages_for_distro(pack_id: str, debian_packages: List[str]) -> Optional[List[str]]:
        """Get the correct package names for the current distro."""
        pkg_mgr = detect_package_manager()
        if pkg_mgr == "dnf":
            fedora_pkgs = FEDORA_PACKAGES.get(pack_id)
            if fedora_pkgs is None:
                return None  # Not available in Fedora repos
            return fedora_pkgs
        # For apt/pacman, use the original package names
        return debian_packages

    async def install_packages(pack_id: str, packages: List[str]):
        """Install packages in background."""
        global _installation_status
        _installation_status[pack_id] = {"status": PackageStatus.INSTALLING, "error": None}

        try:
            pkg_mgr = detect_package_manager()

            if pkg_mgr == "dnf":
                # Fedora/RHEL
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "dnf", "install", "-y", *packages,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            elif pkg_mgr == "apt":
                # Debian/Ubuntu - update first
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "apt-get", "update",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await proc.wait()
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "apt-get", "install", "-y", *packages,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            elif pkg_mgr == "pacman":
                # Arch Linux
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "pacman", "-S", "--noconfirm", *packages,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            else:
                _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": "No supported package manager found"}
                return

            stdout, stderr = await proc.communicate()

            if proc.returncode == 0:
                _installation_status[pack_id] = {"status": PackageStatus.INSTALLED, "error": None}
                logger.info(f"Successfully installed plugin pack: {pack_id}")
                # Invalidate plugin browser cache so new plugins appear
                invalidate_plugin_cache()
            else:
                error_msg = stderr.decode() if stderr else "Installation failed"
                _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": error_msg}
                logger.error(f"Failed to install {pack_id}: {error_msg}")

        except Exception as e:
            _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": str(e)}
            logger.error(f"Error installing {pack_id}: {e}")

    async def uninstall_packages(pack_id: str, packages: List[str]):
        """Uninstall packages in background."""
        global _installation_status
        _installation_status[pack_id] = {"status": PackageStatus.UNINSTALLING, "error": None}

        try:
            pkg_mgr = detect_package_manager()

            if pkg_mgr == "dnf":
                # Fedora/RHEL
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "dnf", "remove", "-y", *packages,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            elif pkg_mgr == "apt":
                # Debian/Ubuntu
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "apt-get", "remove", "-y", *packages,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            elif pkg_mgr == "pacman":
                # Arch Linux
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "pacman", "-R", "--noconfirm", *packages,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            else:
                _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": "No supported package manager found"}
                return

            stdout, stderr = await proc.communicate()

            if proc.returncode == 0:
                _installation_status[pack_id] = {"status": PackageStatus.NOT_INSTALLED, "error": None}
                logger.info(f"Successfully uninstalled plugin pack: {pack_id}")
                # Invalidate plugin browser cache so removed plugins disappear
                invalidate_plugin_cache()
            else:
                error_msg = stderr.decode() if stderr else "Uninstallation failed"
                _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": error_msg}
                logger.error(f"Failed to uninstall {pack_id}: {error_msg}")

        except Exception as e:
            _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": str(e)}
            logger.error(f"Error uninstalling {pack_id}: {e}")

    async def disable_pack(pack_id: str):
        """Disable a plugin pack by moving its LV2 directories to disabled location."""
        global _installation_status
        _installation_status[pack_id] = {"status": PackageStatus.DISABLING, "error": None}

        try:
            # Create disabled directory if it doesn't exist (use sudo for system-wide)
            proc = await asyncio.create_subprocess_exec(
                "sudo", "mkdir", "-p", LV2_DISABLED_PATH,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await proc.wait()

            # Find all plugin directories for this pack
            plugin_dirs = get_lv2_plugin_dirs(pack_id)
            if not plugin_dirs:
                _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": "No plugins found to disable"}
                return

            moved_count = 0
            errors = []
            for plugin_dir in plugin_dirs:
                if os.path.isdir(plugin_dir):
                    dest = os.path.join(LV2_DISABLED_PATH, os.path.basename(plugin_dir))
                    # Remove destination if it exists
                    if os.path.exists(dest):
                        proc = await asyncio.create_subprocess_exec(
                            "sudo", "rm", "-rf", dest,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE
                        )
                        await proc.wait()
                    # Move using sudo
                    proc = await asyncio.create_subprocess_exec(
                        "sudo", "mv", plugin_dir, dest,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout, stderr = await proc.communicate()
                    if proc.returncode == 0:
                        moved_count += 1
                        logger.info(f"Moved {plugin_dir} to {dest}")
                    else:
                        errors.append(stderr.decode() if stderr else f"Failed to move {plugin_dir}")

            if moved_count > 0:
                _installation_status[pack_id] = {"status": PackageStatus.DISABLED, "error": None}
                logger.info(f"Successfully disabled plugin pack: {pack_id} ({moved_count} directories)")
                # Invalidate plugin browser cache so disabled plugins disappear
                invalidate_plugin_cache()
            else:
                error_msg = "; ".join(errors) if errors else "No directories could be moved"
                _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": error_msg}

        except Exception as e:
            _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": str(e)}
            logger.error(f"Error disabling {pack_id}: {e}")

    async def enable_pack(pack_id: str):
        """Enable a disabled plugin pack by moving its LV2 directories back."""
        global _installation_status
        _installation_status[pack_id] = {"status": PackageStatus.ENABLING, "error": None}

        try:
            # Find disabled plugin directories for this pack
            plugin_dirs = get_lv2_plugin_dirs(pack_id, [LV2_DISABLED_PATH])
            if not plugin_dirs:
                _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": "No disabled plugins found to enable"}
                return

            # Determine target directory (prefer /usr/lib64/lv2 if it exists, otherwise /usr/lib/lv2)
            target_path = None
            for path in LV2_PATHS:
                if os.path.isdir(path):
                    target_path = path
                    break

            if not target_path:
                # Fall back to /usr/lib64/lv2 and create it
                target_path = "/usr/lib64/lv2"
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "mkdir", "-p", target_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await proc.wait()

            moved_count = 0
            errors = []
            for plugin_dir in plugin_dirs:
                if os.path.isdir(plugin_dir):
                    dest = os.path.join(target_path, os.path.basename(plugin_dir))
                    # Remove destination if it exists
                    if os.path.exists(dest):
                        proc = await asyncio.create_subprocess_exec(
                            "sudo", "rm", "-rf", dest,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE
                        )
                        await proc.wait()
                    # Move using sudo
                    proc = await asyncio.create_subprocess_exec(
                        "sudo", "mv", plugin_dir, dest,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout, stderr = await proc.communicate()
                    if proc.returncode == 0:
                        moved_count += 1
                        logger.info(f"Moved {plugin_dir} to {dest}")
                    else:
                        errors.append(stderr.decode() if stderr else f"Failed to move {plugin_dir}")

            if moved_count > 0:
                _installation_status[pack_id] = {"status": PackageStatus.INSTALLED, "error": None}
                logger.info(f"Successfully enabled plugin pack: {pack_id} ({moved_count} directories)")
                # Invalidate plugin browser cache so enabled plugins reappear
                invalidate_plugin_cache()
            else:
                error_msg = "; ".join(errors) if errors else "No directories could be moved"
                _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": error_msg}

        except Exception as e:
            _installation_status[pack_id] = {"status": PackageStatus.ERROR, "error": str(e)}
            logger.error(f"Error enabling {pack_id}: {e}")

    @router.get("/list")
    async def list_plugin_packs():
        """List all available plugin packs with their installation status."""
        packs = []
        for pack_id, pack in PLUGIN_PACKS.items():
            pack_dict = pack.model_dump()

            # Check if package management is available for this pack on this distro
            distro_packages = get_packages_for_distro(pack_id, pack.packages)
            can_manage_via_pkg = distro_packages is not None
            pack_dict["can_install"] = can_manage_via_pkg
            pack_dict["can_uninstall"] = can_manage_via_pkg

            # Check if we have a pending status
            if pack_id in _installation_status:
                pack_dict["status"] = _installation_status[pack_id]["status"]
                pack_dict["error_message"] = _installation_status[pack_id]["error"]
            else:
                # Check if disabled first
                if check_lv2_disabled(pack_id):
                    pack_dict["status"] = PackageStatus.DISABLED
                else:
                    # Check actual installation status
                    is_installed = await check_package_installed(pack.packages, pack_id)
                    pack_dict["status"] = PackageStatus.INSTALLED if is_installed else PackageStatus.NOT_INSTALLED

            packs.append(pack_dict)

        return {"packs": packs}

    @router.get("/{pack_id}/status")
    async def get_pack_status(pack_id: str):
        """Get the installation status of a specific plugin pack."""
        if pack_id not in PLUGIN_PACKS:
            raise HTTPException(status_code=404, detail="Plugin pack not found")

        pack = PLUGIN_PACKS[pack_id]

        # Check if we have a pending status
        if pack_id in _installation_status:
            return {
                "pack_id": pack_id,
                "status": _installation_status[pack_id]["status"],
                "error_message": _installation_status[pack_id]["error"]
            }

        # Check if disabled first
        if check_lv2_disabled(pack_id):
            return {
                "pack_id": pack_id,
                "status": PackageStatus.DISABLED,
                "error_message": None
            }

        # Check actual installation status
        is_installed = await check_package_installed(pack.packages, pack_id)
        return {
            "pack_id": pack_id,
            "status": PackageStatus.INSTALLED if is_installed else PackageStatus.NOT_INSTALLED,
            "error_message": None
        }

    @router.post("/{pack_id}/install")
    async def install_plugin_pack(pack_id: str, background_tasks: BackgroundTasks):
        """Start installation of a plugin pack."""
        if pack_id not in PLUGIN_PACKS:
            raise HTTPException(status_code=404, detail="Plugin pack not found")

        pack = PLUGIN_PACKS[pack_id]

        # Get distro-specific packages
        packages = get_packages_for_distro(pack_id, pack.packages)
        if packages is None:
            return {
                "status": "unavailable",
                "pack_id": pack_id,
                "message": f"{pack.name} is not available via package manager on this system. Use disable/enable for pre-installed plugins."
            }

        # Check if already installing
        if pack_id in _installation_status and _installation_status[pack_id]["status"] == PackageStatus.INSTALLING:
            return {"status": "already_installing", "pack_id": pack_id}

        # Check if already installed
        is_installed = await check_package_installed(packages, pack_id)
        if is_installed:
            return {"status": "already_installed", "pack_id": pack_id}

        # Start installation in background
        background_tasks.add_task(install_packages, pack_id, packages)

        return {"status": "installing", "pack_id": pack_id, "message": f"Installing {pack.name}..."}

    @router.post("/{pack_id}/uninstall")
    async def uninstall_plugin_pack(pack_id: str, background_tasks: BackgroundTasks):
        """Start uninstallation of a plugin pack."""
        if pack_id not in PLUGIN_PACKS:
            raise HTTPException(status_code=404, detail="Plugin pack not found")

        pack = PLUGIN_PACKS[pack_id]

        # Get distro-specific packages
        packages = get_packages_for_distro(pack_id, pack.packages)
        if packages is None:
            return {
                "status": "unavailable",
                "pack_id": pack_id,
                "message": f"{pack.name} was not installed via package manager. Use disable to hide these plugins."
            }

        # Check if already uninstalling
        if pack_id in _installation_status and _installation_status[pack_id]["status"] == PackageStatus.UNINSTALLING:
            return {"status": "already_uninstalling", "pack_id": pack_id}

        # Check if not installed
        is_installed = await check_package_installed(packages, pack_id)
        if not is_installed:
            return {"status": "not_installed", "pack_id": pack_id}

        # Start uninstallation in background
        background_tasks.add_task(uninstall_packages, pack_id, packages)

        return {"status": "uninstalling", "pack_id": pack_id, "message": f"Uninstalling {pack.name}..."}

    @router.post("/{pack_id}/disable")
    async def disable_plugin_pack(pack_id: str, background_tasks: BackgroundTasks):
        """Disable a plugin pack by moving its LV2 directories to a disabled location."""
        if pack_id not in PLUGIN_PACKS:
            raise HTTPException(status_code=404, detail="Plugin pack not found")

        pack = PLUGIN_PACKS[pack_id]

        # Check if already disabling
        if pack_id in _installation_status and _installation_status[pack_id]["status"] == PackageStatus.DISABLING:
            return {"status": "already_disabling", "pack_id": pack_id}

        # Check if already disabled
        if check_lv2_disabled(pack_id):
            return {"status": "already_disabled", "pack_id": pack_id}

        # Check if installed (can only disable installed packs)
        if not check_lv2_installed(pack_id):
            return {"status": "not_installed", "pack_id": pack_id, "message": "Pack is not installed, cannot disable"}

        # Start disable in background
        background_tasks.add_task(disable_pack, pack_id)

        return {"status": "disabling", "pack_id": pack_id, "message": f"Disabling {pack.name}..."}

    @router.post("/{pack_id}/enable")
    async def enable_plugin_pack(pack_id: str, background_tasks: BackgroundTasks):
        """Enable a disabled plugin pack by moving its LV2 directories back."""
        if pack_id not in PLUGIN_PACKS:
            raise HTTPException(status_code=404, detail="Plugin pack not found")

        pack = PLUGIN_PACKS[pack_id]

        # Check if already enabling
        if pack_id in _installation_status and _installation_status[pack_id]["status"] == PackageStatus.ENABLING:
            return {"status": "already_enabling", "pack_id": pack_id}

        # Check if not disabled
        if not check_lv2_disabled(pack_id):
            return {"status": "not_disabled", "pack_id": pack_id, "message": "Pack is not disabled, cannot enable"}

        # Start enable in background
        background_tasks.add_task(enable_pack, pack_id)

        return {"status": "enabling", "pack_id": pack_id, "message": f"Enabling {pack.name}..."}

except ImportError as e:
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/plugin-packages", tags=["plugin-packages"])

    @router.get("/list")
    async def list_plugin_packs():
        return {"packs": [], "error": "Plugin package management not available"}

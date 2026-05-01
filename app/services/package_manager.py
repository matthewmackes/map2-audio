"""
Package Manager - Unified component lifecycle management

Manages lifecycle for:
- System packages (pip, dnf)
- LV2 plugins
- IR cabinets (.wav files)
- IR reverbs (.wav files)
- NAM models (.nam files)

Provides central interface for discovery, installation, updates, and removal.
"""

import os
import json
import logging
import asyncio
import subprocess
import hashlib
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
import urllib.request
import shutil

from app.paths import StoragePaths

logger = logging.getLogger(__name__)


class PackageType(Enum):
    """Package type enumeration"""
    SYSTEM_PIP = "pip"
    SYSTEM_DNF = "dnf"
    LV2_PLUGIN = "lv2"
    IR_CABINET = "ir_cabinet"
    IR_REVERB = "ir_reverb"
    NAM_MODEL = "nam"


class PackageStatus(Enum):
    """Package installation status"""
    INSTALLED = "installed"
    AVAILABLE = "available"
    UPDATE_AVAILABLE = "update_available"
    INSTALLING = "installing"
    REMOVING = "removing"
    FAILED = "failed"


@dataclass
class Package:
    """Package metadata"""
    name: str
    type: PackageType
    version: str = ""
    description: str = ""
    status: PackageStatus = PackageStatus.AVAILABLE
    installed_version: str = ""
    size_bytes: int = 0
    install_path: str = ""
    dependencies: List[str] = field(default_factory=list)
    homepage: str = ""
    author: str = ""
    license: str = ""
    tags: List[str] = field(default_factory=list)
    installed_at: Optional[str] = None
    updated_at: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "name": self.name,
            "type": self.type.value,
            "version": self.version,
            "description": self.description,
            "status": self.status.value,
            "installed_version": self.installed_version,
            "size_bytes": self.size_bytes,
            "install_path": self.install_path,
            "dependencies": self.dependencies,
            "homepage": self.homepage,
            "author": self.author,
            "license": self.license,
            "tags": self.tags,
            "installed_at": self.installed_at,
            "updated_at": self.updated_at
        }


class PackageManager:
    """
    Unified package management for all MAP2 Audio components
    
    Features:
    - System package management (pip, dnf)
    - LV2 plugin lifecycle
    - Audio asset management (IR, NAM)
    - Dependency resolution
    - Update checking
    - Installation verification
    """
    
    # Realtime audio system packages
    # T2482 loop 9 / iter 87: python-rtmidi removed. MIDI I/O routes
    # exclusively through map2-controller-host (libremidi C++ binary).
    REALTIME_PACKAGES_PIP = [
        "jack-client",
        "numpy",
        "scipy",
        "torch",
        "psutil",
        "fastapi",
        "uvicorn",
        "sqlalchemy",
        "aiosqlite"
    ]
    
    REALTIME_PACKAGES_DNF = [
        "jack-audio-connection-kit",
        "jack-audio-connection-kit-devel",
        "alsa-lib",
        "alsa-lib-devel",
        "lv2",
        "lv2-devel",
        "lilv",
        "lilv-devel",
        "rtkit"
    ]
    
    def __init__(
        self,
        data_dir: Optional[Path] = None,
        lv2_paths: Optional[List[Path]] = None,
        ir_paths: Optional[List[Path]] = None,
        nam_paths: Optional[List[Path]] = None
    ):
        """
        Initialize package manager
        
        Args:
            data_dir: Data directory for package metadata
            lv2_paths: LV2 plugin search paths
            ir_paths: IR file search paths
            nam_paths: NAM model search paths
        """
        if data_dir is None:
            data_dir = Path.home() / ".map2" / "packages"
        
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        self.cache_file = self.data_dir / "package_cache.json"
        self.install_log = self.data_dir / "install_log.json"
        
        # Configure paths
        self.lv2_paths = lv2_paths or self._get_default_lv2_paths()
        self.ir_paths = ir_paths or self._get_default_ir_paths()
        self.nam_paths = nam_paths or self._get_default_nam_paths()
        
        # Package cache
        self.packages: Dict[str, Package] = {}
        self._load_cache()
        
        # Operation locks
        self.operation_locks: Dict[str, asyncio.Lock] = {}
        
        logger.info("Package manager initialized")
    
    def _get_default_lv2_paths(self) -> List[Path]:
        """Get default LV2 plugin paths"""
        paths = [
            Path.home() / ".lv2",
            Path("/usr/lib/lv2"),
            Path("/usr/local/lib/lv2"),
            Path("/usr/lib64/lv2")
        ]
        return [p for p in paths if p.exists()]
    
    def _get_default_ir_paths(self) -> List[Path]:
        """Get default IR file paths using centralized StoragePaths."""
        # Ensure user directories exist
        StoragePaths.ensure_directories()
        return StoragePaths.get_all_ir_paths(include_nonexistent=True)

    def _get_default_nam_paths(self) -> List[Path]:
        """Get default NAM model paths using centralized StoragePaths."""
        # Ensure user directories exist
        StoragePaths.ensure_directories()
        return StoragePaths.get_all_nam_paths(include_nonexistent=True)

    def _normalize_package_type(self, package_type: Any) -> PackageType:
        """Normalize package type to PackageType enum or raise a clear error."""
        if isinstance(package_type, PackageType):
            return package_type
        if isinstance(package_type, str):
            try:
                return PackageType(package_type)
            except ValueError as e:
                raise ValueError(f"Unsupported package type: {package_type}") from e
        raise TypeError(f"Invalid package type value: {package_type!r}")
    
    def _load_cache(self):
        """Load package cache from disk"""
        if not self.cache_file.exists():
            return
        
        try:
            with open(self.cache_file, 'r') as f:
                cache_data = json.load(f)
            
            for name, data in cache_data.items():
                pkg = Package(
                    name=data["name"],
                    type=PackageType(data["type"]),
                    version=data.get("version", ""),
                    description=data.get("description", ""),
                    status=PackageStatus(data.get("status", "available")),
                    installed_version=data.get("installed_version", ""),
                    size_bytes=data.get("size_bytes", 0),
                    install_path=data.get("install_path", ""),
                    dependencies=data.get("dependencies", []),
                    homepage=data.get("homepage", ""),
                    author=data.get("author", ""),
                    license=data.get("license", ""),
                    tags=data.get("tags", []),
                    installed_at=data.get("installed_at"),
                    updated_at=data.get("updated_at")
                )
                self.packages[name] = pkg
            
            logger.info(f"Loaded {len(self.packages)} packages from cache")
            
        except Exception as e:
            logger.error(f"Error loading package cache: {e}")
    
    def _save_cache(self):
        """Save package cache to disk"""
        try:
            cache_data = {
                name: pkg.to_dict()
                for name, pkg in self.packages.items()
            }
            
            with open(self.cache_file, 'w') as f:
                json.dump(cache_data, f, indent=2)
            
            logger.debug(f"Saved {len(self.packages)} packages to cache")
            
        except Exception as e:
            logger.error(f"Error saving package cache: {e}")
    
    async def scan_all(self, force_rescan: bool = False) -> Dict[PackageType, List[Package]]:
        """
        Scan all package types
        
        Args:
            force_rescan: Force rescan even if cached
        
        Returns:
            Dictionary of package type to package list
        """
        if not force_rescan and self.packages:
            logger.info("Using cached package data")
            return self._group_packages_by_type()
        
        logger.info("Scanning all packages...")
        
        # Scan in parallel
        results = await asyncio.gather(
            self.scan_pip_packages(),
            self.scan_dnf_packages(),
            self.scan_lv2_plugins(),
            self.scan_ir_files(),
            self.scan_nam_models(),
            return_exceptions=True
        )
        
        # Log any errors
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error in scan task {i}: {result}")
        
        self._save_cache()
        return self._group_packages_by_type()
    
    def _group_packages_by_type(self) -> Dict[PackageType, List[Package]]:
        """Group packages by type"""
        grouped = {}
        for pkg_type in PackageType:
            grouped[pkg_type] = [
                pkg for pkg in self.packages.values()
                if pkg.type == pkg_type
            ]
        return grouped
    
    async def scan_pip_packages(self) -> List[Package]:
        """Scan pip packages"""
        logger.info("Scanning pip packages...")
        
        try:
            # Get installed packages
            result = await asyncio.create_subprocess_exec(
                "pip", "list", "--format=json",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await result.communicate()
            
            installed = {}
            if result.returncode == 0:
                installed_list = json.loads(stdout.decode())
                installed = {pkg["name"].lower(): pkg["version"] for pkg in installed_list}
            
            # Check realtime audio packages
            for pkg_name in self.REALTIME_PACKAGES_PIP:
                pkg_key = f"pip:{pkg_name}"
                
                if pkg_name.lower() in installed:
                    version = installed[pkg_name.lower()]
                    status = PackageStatus.INSTALLED
                    installed_version = version
                else:
                    version = ""
                    status = PackageStatus.AVAILABLE
                    installed_version = ""
                
                self.packages[pkg_key] = Package(
                    name=pkg_name,
                    type=PackageType.SYSTEM_PIP,
                    version=version,
                    status=status,
                    installed_version=installed_version,
                    description=f"Python package: {pkg_name}",
                    tags=["realtime-audio", "system"]
                )
            
            logger.info(f"Scanned {len(self.REALTIME_PACKAGES_PIP)} pip packages")
            return [p for p in self.packages.values() if p.type == PackageType.SYSTEM_PIP]
            
        except Exception as e:
            logger.error(f"Error scanning pip packages: {e}")
            return []
    
    async def scan_dnf_packages(self) -> List[Package]:
        """Scan dnf packages"""
        logger.info("Scanning dnf packages...")
        
        try:
            # Check if dnf is available
            result = await asyncio.create_subprocess_exec(
                "which", "dnf",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await result.communicate()
            
            if result.returncode != 0:
                logger.warning("dnf not available, skipping dnf packages")
                return []
            
            # Get installed packages
            result = await asyncio.create_subprocess_exec(
                "rpm", "-qa", "--qf", "%{NAME}\\t%{VERSION}\\n",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await result.communicate()
            
            installed = {}
            if result.returncode == 0:
                for line in stdout.decode().splitlines():
                    if '\t' in line:
                        name, version = line.split('\t', 1)
                        installed[name.lower()] = version
            
            # Check realtime audio packages
            for pkg_name in self.REALTIME_PACKAGES_DNF:
                pkg_key = f"dnf:{pkg_name}"
                
                if pkg_name.lower() in installed:
                    version = installed[pkg_name.lower()]
                    status = PackageStatus.INSTALLED
                    installed_version = version
                else:
                    version = ""
                    status = PackageStatus.AVAILABLE
                    installed_version = ""
                
                self.packages[pkg_key] = Package(
                    name=pkg_name,
                    type=PackageType.SYSTEM_DNF,
                    version=version,
                    status=status,
                    installed_version=installed_version,
                    description=f"System package: {pkg_name}",
                    tags=["realtime-audio", "system"]
                )
            
            logger.info(f"Scanned {len(self.REALTIME_PACKAGES_DNF)} dnf packages")
            return [p for p in self.packages.values() if p.type == PackageType.SYSTEM_DNF]
            
        except Exception as e:
            logger.error(f"Error scanning dnf packages: {e}")
            return []
    
    async def scan_lv2_plugins(self) -> List[Package]:
        """Scan LV2 plugins"""
        logger.info("Scanning LV2 plugins...")
        
        try:
            from app.services.plugin_scanner import get_plugin_scanner
            
            plugins = get_plugin_scanner().scan_all(force_rescan=False)
            
            for uri, metadata in plugins.items():
                pkg_key = f"lv2:{uri}"
                
                self.packages[pkg_key] = Package(
                    name=metadata.name,
                    type=PackageType.LV2_PLUGIN,
                    version="",
                    status=PackageStatus.INSTALLED,
                    description=metadata.description or f"{metadata.category} plugin",
                    install_path=metadata.bundle_path,
                    author=metadata.author,
                    license=metadata.license,
                    tags=[metadata.category.lower(), "lv2", "plugin"]
                )
            
            logger.info(f"Scanned {len(plugins)} LV2 plugins")
            return [p for p in self.packages.values() if p.type == PackageType.LV2_PLUGIN]
            
        except Exception as e:
            logger.error(f"Error scanning LV2 plugins: {e}")
            return []
    
    async def scan_ir_files(self) -> List[Package]:
        """Scan IR cabinet and reverb files"""
        logger.info("Scanning IR files...")
        
        ir_packages = []
        
        try:
            for search_path in self.ir_paths:
                if not search_path.exists():
                    continue
                
                # Determine type from path
                if "cabinet" in str(search_path).lower():
                    pkg_type = PackageType.IR_CABINET
                    tag_prefix = "cabinet"
                else:
                    pkg_type = PackageType.IR_REVERB
                    tag_prefix = "reverb"
                
                # Scan for .wav files
                for wav_file in search_path.rglob("*.wav"):
                    pkg_key = f"ir:{wav_file.stem}"
                    
                    size = wav_file.stat().st_size
                    
                    self.packages[pkg_key] = Package(
                        name=wav_file.stem,
                        type=pkg_type,
                        status=PackageStatus.INSTALLED,
                        description=f"IR {tag_prefix}: {wav_file.stem}",
                        install_path=str(wav_file),
                        size_bytes=size,
                        tags=[tag_prefix, "ir", "audio"]
                    )
                    ir_packages.append(self.packages[pkg_key])
            
            logger.info(f"Scanned {len(ir_packages)} IR files")
            return ir_packages
            
        except Exception as e:
            logger.error(f"Error scanning IR files: {e}")
            return []
    
    async def scan_nam_models(self) -> List[Package]:
        """Scan NAM model files"""
        logger.info("Scanning NAM models...")
        
        nam_packages = []
        
        try:
            for search_path in self.nam_paths:
                if not search_path.exists():
                    continue
                
                # Scan for .nam files
                for nam_file in search_path.rglob("*.nam"):
                    pkg_key = f"nam:{nam_file.stem}"
                    
                    size = nam_file.stat().st_size
                    
                    self.packages[pkg_key] = Package(
                        name=nam_file.stem,
                        type=PackageType.NAM_MODEL,
                        status=PackageStatus.INSTALLED,
                        description=f"NAM model: {nam_file.stem}",
                        install_path=str(nam_file),
                        size_bytes=size,
                        tags=["nam", "neural-amp", "guitar"]
                    )
                    nam_packages.append(self.packages[pkg_key])
            
            logger.info(f"Scanned {len(nam_packages)} NAM models")
            return nam_packages
            
        except Exception as e:
            logger.error(f"Error scanning NAM models: {e}")
            return []
    
    async def install_package(
        self,
        package_name: str,
        package_type: PackageType,
        source_url: Optional[str] = None,
        source_path: Optional[str] = None
    ) -> bool:
        """
        Install a package

        Args:
            package_name: Package name
            package_type: Package type
            source_url: Optional URL to download from (for IR, NAM, LV2)
            source_path: Optional local path to install from (for IR, NAM, LV2)

        Returns:
            True if successful
        """
        package_type = self._normalize_package_type(package_type)
        pkg_key = f"{package_type.value}:{package_name}"

        # Get or create lock
        if pkg_key not in self.operation_locks:
            self.operation_locks[pkg_key] = asyncio.Lock()

        async with self.operation_locks[pkg_key]:
            logger.info(f"Installing package: {package_name} ({package_type.value})")

            if package_type == PackageType.SYSTEM_PIP:
                return await self._install_pip_package(package_name)
            elif package_type == PackageType.SYSTEM_DNF:
                return await self._install_dnf_package(package_name)
            elif package_type == PackageType.IR_CABINET:
                return await self._install_ir_file(package_name, "cabinet", source_url, source_path)
            elif package_type == PackageType.IR_REVERB:
                return await self._install_ir_file(package_name, "reverb", source_url, source_path)
            elif package_type == PackageType.NAM_MODEL:
                return await self._install_nam_model(package_name, source_url, source_path)
            elif package_type == PackageType.LV2_PLUGIN:
                return await self._install_lv2_plugin(package_name, source_url, source_path)
            else:
                raise ValueError(f"Install not supported for package type: {package_type.value}")
    
    async def _install_pip_package(self, package_name: str) -> bool:
        """Install pip package"""
        try:
            result = await asyncio.create_subprocess_exec(
                "pip", "install", package_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await result.communicate()
            
            if result.returncode == 0:
                logger.info(f"Successfully installed pip package: {package_name}")
                
                # Update package status
                pkg_key = f"pip:{package_name}"
                if pkg_key in self.packages:
                    self.packages[pkg_key].status = PackageStatus.INSTALLED
                    self.packages[pkg_key].installed_at = datetime.now(timezone.utc).isoformat()
                
                self._save_cache()
                return True
            else:
                logger.error(f"Failed to install pip package: {stderr.decode()}")
                return False
                
        except Exception as e:
            logger.error(f"Error installing pip package: {e}")
            return False
    
    async def _install_dnf_package(self, package_name: str) -> bool:
        """Install dnf package"""
        try:
            result = await asyncio.create_subprocess_exec(
                "sudo", "dnf", "install", "-y", package_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await result.communicate()
            
            if result.returncode == 0:
                logger.info(f"Successfully installed dnf package: {package_name}")
                
                # Update package status
                pkg_key = f"dnf:{package_name}"
                if pkg_key in self.packages:
                    self.packages[pkg_key].status = PackageStatus.INSTALLED
                    self.packages[pkg_key].installed_at = datetime.now(timezone.utc).isoformat()
                
                self._save_cache()
                return True
            else:
                logger.error(f"Failed to install dnf package: {stderr.decode()}")
                return False
                
        except Exception as e:
            logger.error(f"Error installing dnf package: {e}")
            return False

    async def _install_ir_file(
        self,
        file_name: str,
        ir_type: str,
        source_url: Optional[str] = None,
        source_path: Optional[str] = None
    ) -> bool:
        """Install IR file from URL or local path"""
        try:
            # Determine target directory
            if ir_type == "cabinet":
                target_dir = self.ir_paths[0] / "cabinets"
            else:
                target_dir = self.ir_paths[0] / "reverbs"
            target_dir.mkdir(parents=True, exist_ok=True)

            # Ensure file has .wav extension
            if not file_name.lower().endswith('.wav'):
                file_name = f"{file_name}.wav"
            target_path = target_dir / file_name

            if source_url:
                # Download from URL
                logger.info(f"Downloading IR file from {source_url}")
                urllib.request.urlretrieve(source_url, target_path)
            elif source_path:
                # Copy from local path
                src = Path(source_path)
                if not src.exists():
                    logger.error(f"Source file not found: {source_path}")
                    return False
                shutil.copy2(src, target_path)
            else:
                logger.error("No source URL or path provided for IR file")
                return False

            logger.info(f"Installed IR file: {target_path}")

            # Update package registry
            pkg_type = PackageType.IR_CABINET if ir_type == "cabinet" else PackageType.IR_REVERB
            pkg_key = f"{pkg_type.value}:{file_name}"
            self.packages[pkg_key] = Package(
                name=file_name,
                type=pkg_type,
                status=PackageStatus.INSTALLED,
                install_path=str(target_path),
                size_bytes=target_path.stat().st_size,
                installed_at=datetime.now(timezone.utc).isoformat()
            )
            self._save_cache()
            return True

        except Exception as e:
            logger.error(f"Error installing IR file: {e}")
            return False

    async def _install_nam_model(
        self,
        model_name: str,
        source_url: Optional[str] = None,
        source_path: Optional[str] = None
    ) -> bool:
        """Install NAM model from URL or local path"""
        try:
            target_dir = self.nam_paths[0]
            target_dir.mkdir(parents=True, exist_ok=True)

            # Ensure file has .nam extension
            if not model_name.lower().endswith('.nam'):
                model_name = f"{model_name}.nam"
            target_path = target_dir / model_name

            if source_url:
                # Download from URL
                logger.info(f"Downloading NAM model from {source_url}")
                urllib.request.urlretrieve(source_url, target_path)
            elif source_path:
                # Copy from local path
                src = Path(source_path)
                if not src.exists():
                    logger.error(f"Source file not found: {source_path}")
                    return False
                shutil.copy2(src, target_path)
            else:
                logger.error("No source URL or path provided for NAM model")
                return False

            logger.info(f"Installed NAM model: {target_path}")

            # Update package registry
            pkg_key = f"nam:{model_name}"
            self.packages[pkg_key] = Package(
                name=model_name,
                type=PackageType.NAM_MODEL,
                status=PackageStatus.INSTALLED,
                install_path=str(target_path),
                size_bytes=target_path.stat().st_size,
                installed_at=datetime.now(timezone.utc).isoformat(),
                tags=["nam", "neural-amp", "guitar"]
            )
            self._save_cache()
            return True

        except Exception as e:
            logger.error(f"Error installing NAM model: {e}")
            return False

    async def _install_lv2_plugin(
        self,
        plugin_name: str,
        source_url: Optional[str] = None,
        source_path: Optional[str] = None
    ) -> bool:
        """Install LV2 plugin from URL or local path"""
        try:
            # LV2 plugins are directories ending in .lv2
            if not plugin_name.lower().endswith('.lv2'):
                plugin_name = f"{plugin_name}.lv2"

            # Default LV2 path for user plugins
            target_base = Path.home() / ".lv2"
            target_base.mkdir(parents=True, exist_ok=True)
            target_path = target_base / plugin_name

            if source_url:
                # Download and extract
                logger.info(f"Downloading LV2 plugin from {source_url}")
                import tempfile
                import tarfile
                import zipfile

                with tempfile.NamedTemporaryFile(delete=False, suffix='.tmp') as tmp:
                    urllib.request.urlretrieve(source_url, tmp.name)
                    tmp_path = Path(tmp.name)

                    # Determine archive type and extract
                    if source_url.endswith('.zip'):
                        with zipfile.ZipFile(tmp_path, 'r') as zf:
                            # Find the .lv2 directory in the archive
                            lv2_dirs = [n for n in zf.namelist() if '.lv2/' in n]
                            if lv2_dirs:
                                # Validate paths (Zip Slip prevention)
                                for member in zf.namelist():
                                    member_path = (target_base / member).resolve()
                                    if not str(member_path).startswith(str(target_base.resolve())):
                                        raise ValueError(f"Illegal path in archive: {member}")
                                zf.extractall(target_base)
                    elif source_url.endswith(('.tar.gz', '.tgz', '.tar.xz', '.tar.bz2')):
                        with tarfile.open(tmp_path) as tf:
                            # Validate paths (path traversal prevention)
                            for member in tf.getmembers():
                                member_path = (target_base / member.name).resolve()
                                if not str(member_path).startswith(str(target_base.resolve())):
                                    raise ValueError(f"Illegal path in archive: {member.name}")
                            tf.extractall(target_base)
                    else:
                        # Assume it's a single .so file or similar
                        if target_path.exists():
                            shutil.rmtree(target_path)
                        target_path.mkdir(parents=True)
                        shutil.copy2(tmp_path, target_path / f"{plugin_name.replace('.lv2', '.so')}")

                    tmp_path.unlink()

            elif source_path:
                # Copy from local path
                src = Path(source_path)
                if not src.exists():
                    logger.error(f"Source path not found: {source_path}")
                    return False

                if target_path.exists():
                    shutil.rmtree(target_path)
                shutil.copytree(src, target_path)

            else:
                logger.error("No source URL or path provided for LV2 plugin")
                return False

            logger.info(f"Installed LV2 plugin: {target_path}")

            # Update package registry
            pkg_key = f"lv2:{plugin_name}"
            self.packages[pkg_key] = Package(
                name=plugin_name,
                type=PackageType.LV2_PLUGIN,
                status=PackageStatus.INSTALLED,
                install_path=str(target_path),
                installed_at=datetime.now(timezone.utc).isoformat(),
                tags=["lv2", "plugin", "audio"]
            )
            self._save_cache()

            # Invalidate plugin discovery cache
            try:
                from app.routes.plugins import invalidate_plugin_cache
                invalidate_plugin_cache()
            except ImportError:
                pass

            return True

        except Exception as e:
            logger.error(f"Error installing LV2 plugin: {e}")
            return False

    async def remove_package(self, package_name: str, package_type: PackageType) -> bool:
        """
        Remove a package
        
        Args:
            package_name: Package name
            package_type: Package type
        
        Returns:
            True if successful
        """
        package_type = self._normalize_package_type(package_type)
        pkg_key = f"{package_type.value}:{package_name}"
        
        # Get or create lock
        if pkg_key not in self.operation_locks:
            self.operation_locks[pkg_key] = asyncio.Lock()
        
        async with self.operation_locks[pkg_key]:
            logger.info(f"Removing package: {package_name} ({package_type.value})")
            
            if package_type == PackageType.SYSTEM_PIP:
                return await self._remove_pip_package(package_name)
            elif package_type == PackageType.SYSTEM_DNF:
                return await self._remove_dnf_package(package_name)
            elif package_type in [PackageType.IR_CABINET, PackageType.IR_REVERB]:
                return await self._remove_ir_file(package_name)
            elif package_type == PackageType.NAM_MODEL:
                return await self._remove_nam_model(package_name)
            elif package_type == PackageType.LV2_PLUGIN:
                return await self._remove_lv2_plugin(package_name)
            else:
                raise ValueError(f"Remove not supported for package type: {package_type.value}")
    
    async def _remove_pip_package(self, package_name: str) -> bool:
        """Remove pip package"""
        try:
            result = await asyncio.create_subprocess_exec(
                "pip", "uninstall", "-y", package_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await result.communicate()
            
            if result.returncode == 0:
                logger.info(f"Successfully removed pip package: {package_name}")
                
                # Update package status
                pkg_key = f"pip:{package_name}"
                if pkg_key in self.packages:
                    self.packages[pkg_key].status = PackageStatus.AVAILABLE
                    self.packages[pkg_key].installed_version = ""
                
                self._save_cache()
                return True
            else:
                return False
                
        except Exception as e:
            logger.error(f"Error removing pip package: {e}")
            return False
    
    async def _remove_dnf_package(self, package_name: str) -> bool:
        """Remove dnf package"""
        try:
            result = await asyncio.create_subprocess_exec(
                "sudo", "dnf", "remove", "-y", package_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await result.communicate()
            
            if result.returncode == 0:
                logger.info(f"Successfully removed dnf package: {package_name}")
                
                # Update package status
                pkg_key = f"dnf:{package_name}"
                if pkg_key in self.packages:
                    self.packages[pkg_key].status = PackageStatus.AVAILABLE
                    self.packages[pkg_key].installed_version = ""
                
                self._save_cache()
                return True
            else:
                return False
                
        except Exception as e:
            logger.error(f"Error removing dnf package: {e}")
            return False
    
    async def _remove_ir_file(self, file_name: str) -> bool:
        """Remove IR file"""
        try:
            pkg_key = f"ir:{file_name}"
            if pkg_key not in self.packages:
                return False
            
            file_path = Path(self.packages[pkg_key].install_path)
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Removed IR file: {file_path}")
            
            del self.packages[pkg_key]
            self._save_cache()
            return True
            
        except Exception as e:
            logger.error(f"Error removing IR file: {e}")
            return False
    
    async def _remove_nam_model(self, model_name: str) -> bool:
        """Remove NAM model"""
        try:
            pkg_key = f"nam:{model_name}"
            if pkg_key not in self.packages:
                return False

            file_path = Path(self.packages[pkg_key].install_path)
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Removed NAM model: {file_path}")

            del self.packages[pkg_key]
            self._save_cache()
            return True

        except Exception as e:
            logger.error(f"Error removing NAM model: {e}")
            return False

    async def _remove_lv2_plugin(self, plugin_name: str) -> bool:
        """Remove LV2 plugin"""
        try:
            pkg_key = f"lv2:{plugin_name}"
            if pkg_key not in self.packages:
                # Try with .lv2 extension
                if not plugin_name.endswith('.lv2'):
                    pkg_key = f"lv2:{plugin_name}.lv2"
                if pkg_key not in self.packages:
                    logger.warning(f"LV2 plugin not found in registry: {plugin_name}")
                    return False

            plugin_path = Path(self.packages[pkg_key].install_path)
            if plugin_path.exists():
                if plugin_path.is_dir():
                    shutil.rmtree(plugin_path)
                else:
                    plugin_path.unlink()
                logger.info(f"Removed LV2 plugin: {plugin_path}")

            del self.packages[pkg_key]
            self._save_cache()

            # Invalidate plugin discovery cache
            try:
                from app.routes.plugins import invalidate_plugin_cache
                invalidate_plugin_cache()
            except ImportError:
                pass

            return True

        except Exception as e:
            logger.error(f"Error removing LV2 plugin: {e}")
            return False

    def get_package(self, package_name: str, package_type: PackageType) -> Optional[Package]:
        """Get package by name and type"""
        pkg_key = f"{package_type.value}:{package_name}"
        return self.packages.get(pkg_key)
    
    def search_packages(
        self,
        query: str = "",
        package_type: Optional[PackageType] = None,
        status: Optional[PackageStatus] = None,
        tags: Optional[List[str]] = None
    ) -> List[Package]:
        """
        Search packages by criteria
        
        Args:
            query: Name/description search
            package_type: Filter by type
            status: Filter by status
            tags: Filter by tags
        
        Returns:
            List of matching packages
        """
        results = []
        query_lower = query.lower()
        
        for pkg in self.packages.values():
            # Type filter
            if package_type and pkg.type != package_type:
                continue
            
            # Status filter
            if status and pkg.status != status:
                continue
            
            # Search filter
            if query:
                name_match = query_lower in pkg.name.lower()
                desc_match = query_lower in pkg.description.lower()
                if not (name_match or desc_match):
                    continue
            
            # Tags filter
            if tags:
                pkg_tags = set(pkg.tags)
                required_tags = set(tags)
                if not required_tags.issubset(pkg_tags):
                    continue
            
            results.append(pkg)
        
        return sorted(results, key=lambda p: p.name)
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get package statistics"""
        stats = {
            "total_packages": len(self.packages),
            "by_type": {},
            "by_status": {},
            "total_size_mb": 0
        }
        
        for pkg_type in PackageType:
            count = len([p for p in self.packages.values() if p.type == pkg_type])
            stats["by_type"][pkg_type.value] = count
        
        for status in PackageStatus:
            count = len([p for p in self.packages.values() if p.status == status])
            stats["by_status"][status.value] = count
        
        total_bytes = sum(p.size_bytes for p in self.packages.values())
        stats["total_size_mb"] = round(total_bytes / (1024 * 1024), 2)
        
        return stats


# Global instance
package_manager = PackageManager()

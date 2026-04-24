"""
Folder Scanner API Routes
Scan and manage audio file folders.
"""

import asyncio
import logging
from typing import Dict
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.services.folder_scanner import get_folder_scanner
from app.paths import Map2Paths, StoragePaths

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/folders", tags=["folders"])


class ScanRequest(BaseModel):
    """Request to scan specific folders."""
    scan_nams: bool = True
    scan_irs: bool = True
    scan_lv2: bool = True


# Track if scan is in progress
_scan_in_progress = False


@router.get("/stats")
async def get_folder_stats() -> Dict:
    """Get current folder statistics.
    
    Returns:
        {
            "nams": {...},
            "irs": {...},
            "lv2": {...}
        }
    """
    try:
        scanner = get_folder_scanner()
        return scanner.get_folder_stats()
    except Exception as e:
        logger.error(f"Error getting folder stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/paths")
async def get_folder_paths() -> Dict:
    """Get folder paths for all audio file types.
    
    Returns:
        {
            "nams": str,
            "irs": str,
            "lv2": str
        }
    """
    try:
        scanner = get_folder_scanner()
        return scanner.base_paths
    except Exception as e:
        logger.error(f"Error getting folder paths: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/display-paths")
async def get_display_paths() -> Dict:
    """Get canonical display paths for UI components.
    
    Returns synchronized path information for all frontends.
    These paths should be used for displaying file locations to users.
    
    Returns:
        {
            "nam_models": str,           # Full path to NAM models
            "ir_cabinets": str,          # Full path to cabinet IRs  
            "ir_reverbs": str,           # Full path to reverb IRs
            "ir_user_uploads": str,      # Full path to user uploads
            "nam_models_display": str,   # Tilde-prefixed display path
            "ir_cabinets_display": str,  # Tilde-prefixed display path
            "ir_reverbs_display": str,   # Tilde-prefixed display path
        }
    """
    return StoragePaths.get_display_paths()


@router.get("/storage-info")
async def get_storage_info() -> Dict:
    """Get comprehensive storage information.
    
    Returns detailed info about all storage paths including
    existence status and all search paths.
    """
    return StoragePaths.get_storage_info()


@router.post("/scan")
async def scan_folders(
    request: ScanRequest,
    background_tasks: BackgroundTasks
) -> Dict:
    """Trigger folder scan to detect changes.
    
    Args:
        request: Scan configuration
        background_tasks: FastAPI background tasks
        
    Returns:
        {
            "status": "started",
            "message": str
        }
    """
    global _scan_in_progress
    
    if _scan_in_progress:
        raise HTTPException(status_code=409, detail="Scan already in progress")
    
    try:
        scanner = get_folder_scanner()
        
        # Determine what to scan
        scan_types = []
        if request.scan_nams:
            scan_types.append("NAMs")
        if request.scan_irs:
            scan_types.append("IRs")
        if request.scan_lv2:
            scan_types.append("LV2")
        
        if not scan_types:
            raise HTTPException(status_code=400, detail="No folders selected for scanning")
        
        # Run scan in background
        async def run_scan():
            global _scan_in_progress
            _scan_in_progress = True
            try:
                results = {}
                if request.scan_nams:
                    results['nams'] = await scanner.scan_nams()
                if request.scan_irs:
                    results['irs'] = await scanner.scan_irs()
                if request.scan_lv2:
                    results['lv2'] = await scanner.scan_lv2()
                
                logger.info(f"Folder scan complete: {results}")
            except Exception as e:
                logger.error(f"Error during folder scan: {e}")
            finally:
                _scan_in_progress = False
        
        background_tasks.add_task(run_scan)
        
        return {
            "status": "started",
            "message": f"Scanning folders: {', '.join(scan_types)}",
            "scan_types": scan_types
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan/all")
async def scan_all_folders(background_tasks: BackgroundTasks) -> Dict:
    """Scan all folders for changes.
    
    Args:
        background_tasks: FastAPI background tasks
        
    Returns:
        {
            "status": "started",
            "message": str
        }
    """
    global _scan_in_progress
    
    if _scan_in_progress:
        raise HTTPException(status_code=409, detail="Scan already in progress")
    
    try:
        scanner = get_folder_scanner()
        
        # Run scan in background
        async def run_full_scan():
            global _scan_in_progress
            _scan_in_progress = True
            try:
                results = await scanner.scan_all()
                logger.info(f"Full folder scan complete: {results}")
            except Exception as e:
                logger.error(f"Error during full scan: {e}")
            finally:
                _scan_in_progress = False
        
        background_tasks.add_task(run_full_scan)
        
        return {
            "status": "started",
            "message": "Scanning all folders (NAMs, IRs, LV2)",
            "scan_types": ["NAMs", "IRs", "LV2"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting full scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scan/status")
async def get_scan_status() -> Dict:
    """Get current scan status.

    Returns:
        {
            "scanning": bool,
            "message": str
        }
    """
    global _scan_in_progress

    return {
        "scanning": _scan_in_progress,
        "message": "Scan in progress" if _scan_in_progress else "No scan running"
    }


@router.get("/network-shares")
async def get_network_share_status() -> Dict:
    """Get network share (SMB) status and accessibility info.

    Returns:
        {
            "smb_enabled": bool,
            "smb_port_445": bool,
            "smb_port_139": bool,
            "local_ip": str,
            "shares": [{"name": str, "path": str, "accessible": bool}],
            "access_urls": {"windows": str, "linux": str, "mac": str}
        }
    """
    import subprocess
    import socket

    result = {
        "smb_enabled": False,
        "smb_port_445": False,
        "smb_port_139": False,
        "local_ip": "",
        "shares": [],
        "access_urls": {}
    }

    try:
        # Get local IP
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            result["local_ip"] = s.getsockname()[0]
            s.close()
        except Exception:
            result["local_ip"] = "127.0.0.1"

        local_ip = result["local_ip"]

        # Check if SMB ports are listening
        async def check_port(port: int) -> bool:
            try:
                proc = await asyncio.to_thread(subprocess.run,
                    ["ss", "-tln"],
                    capture_output=True, text=True, timeout=5
                )
                return f":{port}" in proc.stdout
            except Exception:
                return False

        result["smb_port_445"] = await check_port(445)
        result["smb_port_139"] = await check_port(139)
        result["smb_enabled"] = result["smb_port_445"] or result["smb_port_139"]

        # Check SMB service status
        try:
            proc = await asyncio.to_thread(subprocess.run,
                ["systemctl", "is-active", "smb"],
                capture_output=True, text=True, timeout=5
            )
            if proc.returncode == 0:
                result["smb_enabled"] = True
        except Exception:
            pass

        # Define shares and check accessibility
        scanner = get_folder_scanner()
        share_configs = [
            {"name": "MAP2-NAMs", "path": scanner.base_paths['nams'], "description": "Neural Amp Models"},
            {"name": "MAP2-IRs", "path": scanner.base_paths['irs'], "description": "Impulse Responses"},
            {"name": "MAP2-LV2", "path": scanner.base_paths['lv2'], "description": "LV2 Plugins"},
        ]

        import os
        for share in share_configs:
            share_info = {
                "name": share["name"],
                "path": share["path"],
                "description": share["description"],
                "accessible": os.path.exists(share["path"]) and os.access(share["path"], os.R_OK),
                "writable": os.path.exists(share["path"]) and os.access(share["path"], os.W_OK)
            }
            result["shares"].append(share_info)

        # Generate access URLs
        if result["smb_enabled"]:
            result["access_urls"] = {
                "windows": f"\\\\{local_ip}\\MAP2-NAMs",
                "linux": f"smb://{local_ip}/MAP2-NAMs",
                "mac": f"smb://{local_ip}/MAP2-NAMs"
            }

        return result

    except Exception as e:
        logger.error(f"Error getting network share status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/counts")
async def get_asset_counts() -> Dict:
    """Get counts of all audio assets (NAMs, IRs, LV2 plugins).

    Returns:
        {
            "nams": int,
            "irs": {"total": int, "cabinets": int, "reverbs": int},
            "lv2": {"system": int, "user": int, "total": int}
        }
    """
    import os

    try:
        # Count NAM files from centralized paths
        nam_count = 0
        nam_paths = StoragePaths.get_all_nam_paths()

        for nam_path in nam_paths:
            if nam_path.exists():
                for root, dirs, files in os.walk(nam_path):
                    nam_count += sum(1 for f in files if f.lower().endswith('.nam'))

        # Count IR files by category from centralized paths
        ir_total = 0
        ir_cabinets = 0
        ir_reverbs = 0
        ir_extensions = ['.wav', '.flac', '.aiff', '.aif']

        ir_paths = StoragePaths.get_all_ir_paths()

        for ir_path in ir_paths:
            if ir_path.exists():
                for root, dirs, files in os.walk(ir_path):
                    for f in files:
                        if any(f.lower().endswith(ext) for ext in ir_extensions):
                            ir_total += 1
                            # Categorize by subdirectory
                            if 'cabinet' in root.lower() or 'cab' in root.lower():
                                ir_cabinets += 1
                            elif 'reverb' in root.lower() or 'room' in root.lower():
                                ir_reverbs += 1

        # Count system LV2 plugins from multiple standard locations
        system_lv2_count = 0
        system_lv2_paths = [
            '/usr/lib/lv2',
            '/usr/lib64/lv2',
            '/usr/local/lib/lv2',
            '/usr/lib/x86_64-linux-gnu/lv2',
            '/usr/lib/aarch64-linux-gnu/lv2',
        ]
        
        for lv2_path in system_lv2_paths:
            if os.path.exists(lv2_path):
                try:
                    system_lv2_count += sum(
                        1 for item in os.listdir(lv2_path)
                        if item.endswith('.lv2') and os.path.isdir(os.path.join(lv2_path, item))
                    )
                except (OSError, PermissionError):
                    pass

        # Count user LV2 plugins
        user_lv2_count = 0
        user_lv2_paths = [
            Path.home() / ".lv2",
            Path.home() / ".local/lib/lv2",
            Map2Paths.lv2_library_dir(),
        ]
        
        for user_lv2_path in user_lv2_paths:
            if user_lv2_path.exists():
                try:
                    user_lv2_count += sum(
                        1 for item in os.listdir(user_lv2_path)
                        if item.endswith('.lv2') and os.path.isdir(os.path.join(user_lv2_path, item))
                    )
                except (OSError, PermissionError):
                    pass

        return {
            "nams": nam_count,
            "irs": {
                "total": ir_total,
                "cabinets": ir_cabinets,
                "reverbs": ir_reverbs,
                "other": ir_total - ir_cabinets - ir_reverbs
            },
            "lv2": {
                "system": system_lv2_count,
                "user": user_lv2_count,
                "total": system_lv2_count + user_lv2_count
            }
        }

    except Exception as e:
        logger.error(f"Error getting asset counts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan/nams")
async def scan_nams_folder(background_tasks: BackgroundTasks) -> Dict:
    """Scan NAM models folder.
    
    Args:
        background_tasks: FastAPI background tasks
        
    Returns:
        {
            "status": "started"
        }
    """
    global _scan_in_progress
    
    if _scan_in_progress:
        raise HTTPException(status_code=409, detail="Scan already in progress")
    
    try:
        scanner = get_folder_scanner()
        
        async def run_nam_scan():
            global _scan_in_progress
            _scan_in_progress = True
            try:
                await scanner.scan_nams()
            finally:
                _scan_in_progress = False
        
        background_tasks.add_task(run_nam_scan)
        
        return {"status": "started", "message": "Scanning NAM models"}
        
    except Exception as e:
        logger.error(f"Error starting NAM scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan/irs")
async def scan_irs_folder(background_tasks: BackgroundTasks) -> Dict:
    """Scan impulse responses folder.
    
    Args:
        background_tasks: FastAPI background tasks
        
    Returns:
        {
            "status": "started"
        }
    """
    global _scan_in_progress
    
    if _scan_in_progress:
        raise HTTPException(status_code=409, detail="Scan already in progress")
    
    try:
        scanner = get_folder_scanner()
        
        async def run_ir_scan():
            global _scan_in_progress
            _scan_in_progress = True
            try:
                await scanner.scan_irs()
            finally:
                _scan_in_progress = False
        
        background_tasks.add_task(run_ir_scan)
        
        return {"status": "started", "message": "Scanning impulse responses"}
        
    except Exception as e:
        logger.error(f"Error starting IR scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan/lv2")
async def scan_lv2_folder(background_tasks: BackgroundTasks) -> Dict:
    """Scan LV2 plugins folder.
    
    Args:
        background_tasks: FastAPI background tasks
        
    Returns:
        {
            "status": "started"
        }
    """
    global _scan_in_progress
    
    if _scan_in_progress:
        raise HTTPException(status_code=409, detail="Scan already in progress")
    
    try:
        scanner = get_folder_scanner()
        
        async def run_lv2_scan():
            global _scan_in_progress
            _scan_in_progress = True
            try:
                await scanner.scan_lv2()
            finally:
                _scan_in_progress = False
        
        background_tasks.add_task(run_lv2_scan)
        
        return {"status": "started", "message": "Scanning LV2 plugins"}
        
    except Exception as e:
        logger.error(f"Error starting LV2 scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))

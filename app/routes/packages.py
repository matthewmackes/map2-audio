"""
Package Manager Routes - Unified component lifecycle management API
"""

import logging
import os
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.services.package_manager import package_manager, PackageType, PackageStatus

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/packages", tags=["packages"])


class InstallRequest(BaseModel):
    """Package installation request"""
    package_name: str
    package_type: str
    source_url: Optional[str] = None
    source_path: Optional[str] = None


class RemoveRequest(BaseModel):
    """Package removal request"""
    package_name: str
    package_type: str


@router.post("/scan")
async def scan_all_packages(force_rescan: bool = False) -> Dict[str, Any]:
    """
    Scan all package types
    
    Query parameters:
    - force_rescan: Force rescan even if cached (default: false)
    
    Returns:
        Grouped packages by type
    """
    try:
        packages_by_type = await package_manager.scan_all(force_rescan)
        
        result = {
            "status": "success",
            "packages_by_type": {}
        }
        
        for pkg_type, packages in packages_by_type.items():
            result["packages_by_type"][pkg_type.value] = [
                p.to_dict() for p in packages
            ]
        
        result["statistics"] = package_manager.get_statistics()
        
        return result
        
    except Exception as e:
        logger.error(f"Error scanning packages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_packages(
    package_type: Optional[str] = None,
    status: Optional[str] = None,
    query: str = "",
    tags: Optional[str] = None
) -> Dict[str, Any]:
    """
    List packages with filtering
    
    Query parameters:
    - package_type: Filter by type (pip, dnf, lv2, ir_cabinet, ir_reverb, nam)
    - status: Filter by status (installed, available, update_available)
    - query: Search query for name/description
    - tags: Comma-separated tags filter
    
    Returns:
        List of packages
    """
    try:
        # Parse filters
        pkg_type = PackageType(package_type) if package_type else None
        pkg_status = PackageStatus(status) if status else None
        tag_list = [t.strip() for t in tags.split(',')] if tags else None
        
        # Search packages
        packages = package_manager.search_packages(
            query=query,
            package_type=pkg_type,
            status=pkg_status,
            tags=tag_list
        )
        
        return {
            "packages": [p.to_dict() for p in packages],
            "count": len(packages)
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid filter value: {e}")
    except Exception as e:
        logger.error(f"Error listing packages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/statistics")
async def get_statistics() -> Dict[str, Any]:
    """
    Get package statistics
    
    Returns:
        Package statistics by type and status
    """
    return package_manager.get_statistics()


@router.get("/{package_type}/{package_name}")
async def get_package_info(package_type: str, package_name: str) -> Dict[str, Any]:
    """
    Get package information
    
    Path parameters:
    - package_type: Package type
    - package_name: Package name
    
    Returns:
        Package information
    """
    try:
        pkg_type = PackageType(package_type)
        package = package_manager.get_package(package_name, pkg_type)
        
        if not package:
            raise HTTPException(
                status_code=404,
                detail=f"Package not found: {package_name}"
            )
        
        return package.to_dict()
        
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid package type: {package_type}")
    except Exception as e:
        logger.error(f"Error getting package info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/install")
async def install_package(request: InstallRequest) -> Dict[str, Any]:
    """
    Install a package

    Request body:
    - package_name: Package name
    - package_type: Package type (pip, dnf, lv2, ir_cabinet, ir_reverb, nam)
    - source_url: Optional URL to download from (for lv2, ir, nam)
    - source_path: Optional local path to install from (for lv2, ir, nam)

    Returns:
        Installation result
    """
    try:
        pkg_type = PackageType(request.package_type)

        # For asset types, require source_url or source_path
        asset_types = [
            PackageType.LV2_PLUGIN,
            PackageType.IR_CABINET,
            PackageType.IR_REVERB,
            PackageType.NAM_MODEL
        ]
        if pkg_type in asset_types and not (request.source_url or request.source_path):
            raise HTTPException(
                status_code=400,
                detail=f"source_url or source_path required for type: {request.package_type}"
            )

        success = await package_manager.install_package(
            request.package_name,
            pkg_type,
            source_url=request.source_url,
            source_path=request.source_path
        )

        if success:
            return {
                "status": "success",
                "message": f"Installed {request.package_name}"
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to install {request.package_name}"
            )

    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid package type: {request.package_type}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error installing package: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/remove")
async def remove_package(request: RemoveRequest) -> Dict[str, Any]:
    """
    Remove a package
    
    Request body:
    - package_name: Package name
    - package_type: Package type
    
    Returns:
        Removal result
    """
    try:
        pkg_type = PackageType(request.package_type)
        
        success = await package_manager.remove_package(
            request.package_name,
            pkg_type
        )
        
        if success:
            return {
                "status": "success",
                "message": f"Removed {request.package_name}"
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to remove {request.package_name}"
            )
        
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid package type: {request.package_type}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing package: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload/ir")
async def upload_ir_file(
    file: UploadFile = File(...),
    file_type: str = "cabinet"
) -> Dict[str, Any]:
    """
    Upload IR file
    
    Request:
    - file: IR .wav file
    - file_type: "cabinet" or "reverb"
    
    Returns:
        Upload result
    """
    try:
        if not file.filename.endswith('.wav'):
            raise HTTPException(status_code=400, detail="Only .wav files are supported")
        
        # Determine target directory
        if file_type == "cabinet":
            target_dir = package_manager.ir_paths[0] / "cabinets"
        elif file_type == "reverb":
            target_dir = package_manager.ir_paths[0] / "reverbs"
        else:
            raise HTTPException(status_code=400, detail="file_type must be 'cabinet' or 'reverb'")
        
        target_dir.mkdir(parents=True, exist_ok=True)
        safe_name = os.path.basename(file.filename)
        if not safe_name or safe_name.startswith('.'):
            raise HTTPException(status_code=400, detail="Invalid filename")
        target_path = target_dir / safe_name
        
        # Save file
        content = await file.read()
        with open(target_path, 'wb') as f:
            f.write(content)
        
        logger.info(f"Uploaded IR file: {target_path}")
        
        # Rescan IR files
        await package_manager.scan_ir_files()
        
        return {
            "status": "success",
            "message": f"Uploaded {safe_name}",
            "path": str(target_path)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading IR file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload/nam")
async def upload_nam_model(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Upload NAM model file
    
    Request:
    - file: NAM .nam file
    
    Returns:
        Upload result
    """
    try:
        if not file.filename.endswith('.nam'):
            raise HTTPException(status_code=400, detail="Only .nam files are supported")
        
        target_dir = package_manager.nam_paths[0]
        target_dir.mkdir(parents=True, exist_ok=True)
        safe_name = os.path.basename(file.filename)
        if not safe_name or safe_name.startswith('.'):
            raise HTTPException(status_code=400, detail="Invalid filename")
        target_path = target_dir / safe_name
        
        # Save file
        content = await file.read()
        with open(target_path, 'wb') as f:
            f.write(content)
        
        logger.info(f"Uploaded NAM model: {target_path}")
        
        # Rescan NAM models
        await package_manager.scan_nam_models()
        
        return {
            "status": "success",
            "message": f"Uploaded {safe_name}",
            "path": str(target_path)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading NAM model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/realtime-packages")
async def get_realtime_packages() -> Dict[str, Any]:
    """
    Get realtime audio system packages
    
    Returns:
        List of required realtime packages with installation status
    """
    pip_packages = []
    for pkg_name in package_manager.REALTIME_PACKAGES_PIP:
        pkg_key = f"pip:{pkg_name}"
        if pkg_key in package_manager.packages:
            pip_packages.append(package_manager.packages[pkg_key].to_dict())
    
    dnf_packages = []
    for pkg_name in package_manager.REALTIME_PACKAGES_DNF:
        pkg_key = f"dnf:{pkg_name}"
        if pkg_key in package_manager.packages:
            dnf_packages.append(package_manager.packages[pkg_key].to_dict())
    
    return {
        "pip_packages": pip_packages,
        "dnf_packages": dnf_packages,
        "total": len(pip_packages) + len(dnf_packages)
    }


@router.post("/install-realtime-deps")
async def install_realtime_dependencies() -> Dict[str, Any]:
    """
    Install all realtime audio dependencies
    
    Returns:
        Installation results
    """
    results = {
        "pip": {"success": [], "failed": []},
        "dnf": {"success": [], "failed": []}
    }
    
    try:
        # Install pip packages
        for pkg_name in package_manager.REALTIME_PACKAGES_PIP:
            try:
                success = await package_manager.install_package(pkg_name, PackageType.SYSTEM_PIP)
                if success:
                    results["pip"]["success"].append(pkg_name)
                else:
                    results["pip"]["failed"].append(pkg_name)
            except Exception as e:
                logger.error(f"Error installing pip package {pkg_name}: {e}")
                results["pip"]["failed"].append(pkg_name)
        
        # Install dnf packages
        for pkg_name in package_manager.REALTIME_PACKAGES_DNF:
            try:
                success = await package_manager.install_package(pkg_name, PackageType.SYSTEM_DNF)
                if success:
                    results["dnf"]["success"].append(pkg_name)
                else:
                    results["dnf"]["failed"].append(pkg_name)
            except Exception as e:
                logger.error(f"Error installing dnf package {pkg_name}: {e}")
                results["dnf"]["failed"].append(pkg_name)
        
        total_success = len(results["pip"]["success"]) + len(results["dnf"]["success"])
        total_failed = len(results["pip"]["failed"]) + len(results["dnf"]["failed"])
        
        return {
            "status": "success" if total_failed == 0 else "partial",
            "results": results,
            "summary": {
                "total_success": total_success,
                "total_failed": total_failed
            }
        }
        
    except Exception as e:
        logger.error(f"Error installing realtime dependencies: {e}")
        raise HTTPException(status_code=500, detail=str(e))

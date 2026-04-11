"""
Phase 2: NAM Model Processing API Routes

Handles NAM model file upload, library management, and metadata queries.
Integrates with NAMProcessor for file parsing and NAMLibraryService for persistence.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from pathlib import Path
import tempfile
import shutil

from app.services.nam_processor import get_nam_processor, NAMModel
from app.services.nam_library import get_nam_library_service
from app.utils.time import utc_now

router = APIRouter(prefix="/api/nam/library", tags=["nam"])


class NAMModelResponse(BaseModel):
    """NAM model information response."""
    id: Optional[int] = None
    name: str
    author: str
    version: int
    architecture: str
    sample_rate: int
    file_hash: Optional[str] = None
    file_size_mb: Optional[float] = None
    metadata: Dict[str, Any]
    uploaded_at: Optional[str] = None


class NAMUploadResponse(BaseModel):
    """NAM upload response."""
    status: str
    message: str
    model: NAMModelResponse


class NAMListResponse(BaseModel):
    """NAM models list response."""
    status: str
    total: int
    models: List[NAMModelResponse]


@router.post("/upload", response_model=NAMUploadResponse)
async def upload_nam_model(file: UploadFile = File(...)):
    """
    Upload a NAM model file to the library.
    
    Supports:
    - .nam binary format
    - .json text format
    
    The model will be parsed, validated, stored in the library, and indexed in the database.
    """
    try:
        processor = get_nam_processor()
        library_service = get_nam_library_service()
        
        # Validate file type
        if not file.filename:
            raise HTTPException(400, "No filename provided")
        
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in ['.nam', '.json']:
            raise HTTPException(
                400, 
                f"Invalid file type: {file_ext}. Supported: .nam, .json"
            )
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(
            delete=False, 
            suffix=file_ext
        ) as temp_file:
            temp_path = Path(temp_file.name)
            content = await file.read()
            temp_file.write(content)
        
        try:
            # Parse NAM model
            nam_model = processor.parse_nam_file(temp_path)
            
            # Validate model
            if not processor.validate_nam_model(nam_model):
                raise HTTPException(400, "NAM model validation failed")
            
            # Create library directory if needed
            library_dir = Path("/var/lib/map2/nam")
            library_dir.mkdir(parents=True, exist_ok=True)
            
            # Move to library
            final_path = library_dir / f"{nam_model.name}{file_ext}"
            shutil.move(str(temp_path), str(final_path))
            
            nam_model.file_path = str(final_path)
            
            # Get file size
            file_size = final_path.stat().st_size
            
            # Add to database
            record = library_service.add_model(
                name=nam_model.name,
                author=nam_model.author,
                version=nam_model.version,
                architecture=nam_model.architecture,
                sample_rate=nam_model.sample_rate,
                file_path=str(final_path),
                file_hash=nam_model.file_hash,
                file_size_bytes=file_size,
                metadata=nam_model.metadata
            )
            
            # Get model info for response
            model_info = processor.get_model_info(nam_model)
            
            return NAMUploadResponse(
                status="ok",
                message=f"NAM model '{nam_model.name}' uploaded, validated, and indexed",
                model=NAMModelResponse(
                    id=record.id,
                    **model_info,
                    uploaded_at=record.uploaded_at.isoformat() if record.uploaded_at else None
                )
            )
        
        finally:
            # Clean up temp file
            if temp_path.exists():
                temp_path.unlink()
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {e}")


@router.get("/{model_name}", response_model=NAMModelResponse)
async def get_nam_model(model_name: str):
    """
    Get information about a specific NAM model.
    
    Path Parameters:
        model_name: Name or hash of the NAM model
    """
    try:
        library_service = get_nam_library_service()
        
        # Try database first
        record = library_service.get_model(model_name)
        if record:
            return NAMModelResponse(**record.to_dict())
        
        # Fallback to filesystem
        processor = get_nam_processor()
        library_dir = Path("/var/lib/map2/nam")
        
        for file_path in library_dir.glob("*"):
            if file_path.stem == model_name:
                nam_model = processor.parse_nam_file(file_path)
                model_info = processor.get_model_info(nam_model)
                return NAMModelResponse(**model_info)
        
        raise HTTPException(404, f"NAM model not found: {model_name}")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get model: {e}")


@router.get("/", response_model=NAMListResponse)
async def list_nam_models(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    architecture: Optional[str] = None,
    author: Optional[str] = None
):
    """
    List all NAM models in the library.
    
    Returns metadata for all models with pagination support.
    
    Query Parameters:
        skip: Number of records to skip
        limit: Maximum records to return
        architecture: Filter by architecture type
        author: Filter by author name
    """
    try:
        library_service = get_nam_library_service()
        
        # Get from database
        records = library_service.list_models(
            skip=skip,
            limit=limit,
            architecture=architecture,
            author=author
        )
        
        models = [NAMModelResponse(**record.to_dict()) for record in records]
        
        return NAMListResponse(
            status="ok",
            total=len(models),
            models=models
        )
    
    except Exception as e:
        raise HTTPException(500, f"Failed to list models: {e}")


@router.post("/validate")
async def validate_nam_file(file: UploadFile = File(...)):
    """
    Validate a NAM model file without storing it.
    
    Useful for checking file integrity before upload.
    """
    try:
        processor = get_nam_processor()
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_path = Path(temp_file.name)
            content = await file.read()
            temp_file.write(content)
        
        try:
            # Parse and validate
            nam_model = processor.parse_nam_file(temp_path)
            is_valid = processor.validate_nam_model(nam_model)
            
            model_info = processor.get_model_info(nam_model) if is_valid else None
            
            return {
                "status": "ok",
                "valid": is_valid,
                "model": model_info,
                "message": "Model is valid" if is_valid else "Model validation failed"
            }
        
        finally:
            if temp_path.exists():
                temp_path.unlink()
    
    except Exception as e:
        raise HTTPException(400, f"Validation error: {e}")


@router.delete("/{model_name}")
async def delete_nam_model(model_name: str):
    """
    Delete a NAM model from the library and database.
    
    Path Parameters:
        model_name: Name of the model to delete
    """
    try:
        library_service = get_nam_library_service()
        
        # Get record to find file
        record = library_service.get_model(model_name)
        if not record:
            raise HTTPException(404, f"NAM model not found: {model_name}")
        
        # Delete file
        file_path = Path(record.file_path)
        if file_path.exists():
            file_path.unlink()
        
        # Delete from database
        library_service.delete_model(model_name)
        
        return {
            "status": "ok",
            "message": f"NAM model '{model_name}' deleted"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Delete failed: {e}")


@router.get("/stats/summary")
async def get_nam_stats():
    """Get summary statistics about NAM library."""
    try:
        library_service = get_nam_library_service()
        stats = library_service.get_stats()
        
        return {
            "status": "ok",
            "timestamp": utc_now().isoformat(),
            "statistics": {
                "total_models": stats['total_models'],
                "total_size_mb": round(stats['total_size_mb'], 2),
                "architectures": stats['architectures'],
                "unique_authors": stats['unique_authors'],
                "supported_sample_rates": stats['sample_rates']
            }
        }
    
    except Exception as e:
        raise HTTPException(500, f"Failed to get stats: {e}")


@router.post("/verify")
async def verify_library():
    """
    Verify library integrity - check if all referenced files exist.
    
    Useful for detecting missing or moved files.
    """
    try:
        library_service = get_nam_library_service()
        results = library_service.verify_library_integrity()
        
        return {
            "status": "ok",
            "timestamp": utc_now().isoformat(),
            "integrity": results
        }
    
    except Exception as e:
        raise HTTPException(500, f"Verification failed: {e}")


@router.post("/cleanup")
async def cleanup_library():
    """
    Clean up orphaned database records for missing files.
    
    Removes records from the database if the corresponding file no longer exists.
    """
    try:
        library_service = get_nam_library_service()
        removed = library_service.cleanup_orphaned_records()
        
        return {
            "status": "ok",
            "message": f"Cleaned up {removed} orphaned records"
        }
    
    except Exception as e:
        raise HTTPException(500, f"Cleanup failed: {e}")

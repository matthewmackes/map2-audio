"""
Impulse Response API Routes
"""

try:
    from fastapi import APIRouter, HTTPException, UploadFile, File
    from pydantic import BaseModel
    from typing import List
    from app.services.ir_processor import IRProcessor
    from app.paths import StoragePaths
    import shutil
    from pathlib import Path

    router = APIRouter(prefix="/api/ir", tags=["ir"])
    
    # Initialize IR processor
    _ir_processor = IRProcessor()
    
    @router.get("/")
    async def get_ir_root():
        """Get IR processor status."""
        return _ir_processor.get_status()

    @router.get("/status")
    async def get_ir_status(type: str = "cabinet"):
        """Get IR status for managing IR files.

        Args:
            type: Either 'cabinet' or 'reverb'

        Returns status of available IR files for LV2 plugins.
        """
        irs = _ir_processor.scan_irs(type)

        # Get currently loaded IR
        if type == "cabinet":
            active_ir = _ir_processor.active_cabinet_ir
        else:
            active_ir = _ir_processor.active_reverb_ir

        loaded = active_ir.name if active_ir else None

        if type == "cabinet":
            return {
                "loaded": loaded,
                "mix": 100,
                "bypass": False,
                "inputLevel": -60.0,
                "outputLevel": -60.0,
                "peakInput": -60.0,
                "peakOutput": -60.0,
                "latency": 0,
                "frequencyResponse": [],
                "availableIRs": [{"name": ir["name"], "size": f"{ir.get('size_mb', 0):.2f} MB", "length": ir.get("length", 0)} for ir in irs],
                "currentIRSize": "0 KB"
            }
        else:  # reverb
            return {
                "loaded": loaded,
                "mix": 30,
                "bypass": False,
                "inputLevel": -60.0,
                "outputLevel": -60.0,
                "peakInput": -60.0,
                "peakOutput": -60.0,
                "latency": 0,
                "decayTail": [],
                "availableIRs": [{"name": ir["name"], "type": ir.get("type", "room"), "decay": ir.get("decay", 0)} for ir in irs],
                "currentDecay": 0,
                "preDelay": 0
            }

    @router.get("/cabinets")
    async def list_cabinet_irs():
        """List available cabinet IRs."""
        irs = _ir_processor.scan_irs("cabinet")
        return {"irs": irs, "count": len(irs)}
    
    @router.get("/reverbs")
    async def list_reverb_irs():
        """List available reverb IRs."""
        irs = _ir_processor.scan_irs("reverb")
        return {"irs": irs, "count": len(irs)}
    
    @router.post("/cabinets/{ir_name}/load")
    async def load_cabinet_ir(ir_name: str):
        """Load a cabinet IR."""
        success = _ir_processor.load_ir(ir_name, "cabinet")
        if not success:
            raise HTTPException(status_code=404, detail="Cabinet IR not found or failed to load")
        return {"status": "loaded", "ir": ir_name, "type": "cabinet"}

    @router.post("/set-cabinet/{ir_name}")
    async def set_cabinet_ir(ir_name: str):
        """Set/load a cabinet IR (alias for frontend compatibility)."""
        success = _ir_processor.load_ir(ir_name, "cabinet")
        if not success:
            raise HTTPException(status_code=404, detail="Cabinet IR not found or failed to load")
        return {"status": "ok", "ir": ir_name, "type": "cabinet"}

    @router.post("/reverbs/{ir_name}/load")
    async def load_reverb_ir(ir_name: str):
        """Load a reverb IR."""
        success = _ir_processor.load_ir(ir_name, "reverb")
        if not success:
            raise HTTPException(status_code=404, detail="Reverb IR not found or failed to load")
        return {"status": "loaded", "ir": ir_name, "type": "reverb"}

    @router.post("/set-reverb/{ir_name}")
    async def set_reverb_ir(ir_name: str):
        """Set/load a reverb IR (alias for frontend compatibility)."""
        success = _ir_processor.load_ir(ir_name, "reverb")
        if not success:
            raise HTTPException(status_code=404, detail="Reverb IR not found or failed to load")
        return {"status": "ok", "ir": ir_name, "type": "reverb"}

    @router.post("/set-cabinet-mix/{mix}")
    async def set_cabinet_mix(mix: float):
        """Set cabinet IR wet/dry mix."""
        if not 0 <= mix <= 100:
            raise HTTPException(status_code=400, detail="Mix must be between 0 and 100")
        _ir_processor.set_cabinet_mix(mix)
        return {"status": "ok", "mix": mix}

    @router.post("/set-reverb-mix/{mix}")
    async def set_reverb_mix(mix: float):
        """Set reverb IR wet/dry mix."""
        if not 0 <= mix <= 100:
            raise HTTPException(status_code=400, detail="Mix must be between 0 and 100")
        _ir_processor.set_reverb_mix(mix)
        return {"status": "ok", "mix": mix}

    @router.post("/set-cabinet-bypass/{bypass}")
    async def set_cabinet_bypass(bypass: bool):
        """Set cabinet IR bypass state."""
        _ir_processor.set_cabinet_bypass(bypass)
        return {"status": "ok", "bypass": bypass}

    @router.post("/set-reverb-bypass/{bypass}")
    async def set_reverb_bypass(bypass: bool):
        """Set reverb IR bypass state."""
        _ir_processor.set_reverb_bypass(bypass)
        return {"status": "ok", "bypass": bypass}

    @router.post("/navigate-cabinet/{direction}")
    async def navigate_cabinet_ir(direction: str):
        """Navigate to next/previous cabinet IR."""
        if direction not in ("next", "prev"):
            raise HTTPException(status_code=400, detail="Direction must be 'next' or 'prev'")
        ir_name = _ir_processor.navigate_ir("cabinet", direction)
        if not ir_name:
            raise HTTPException(status_code=404, detail="No IRs available to navigate")
        return {"status": "ok", "ir": ir_name}

    @router.post("/cabinets/upload")
    async def upload_cabinet_ir(file: UploadFile = File(...)):
        """Upload a new cabinet IR file."""
        if not file.filename.endswith('.wav'):
            raise HTTPException(status_code=400, detail="Only WAV files are supported")

        # Security: sanitize filename to prevent path traversal
        import os
        safe_name = os.path.basename(file.filename)
        if not safe_name or safe_name.startswith('.'):
            raise HTTPException(status_code=400, detail="Invalid filename")

        # Size limit: 50 MB for cabinet IRs
        MAX_IR_SIZE = 50 * 1024 * 1024
        content = await file.read()
        if len(content) > MAX_IR_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large (max {MAX_IR_SIZE // (1024*1024)}MB)")

        # Save to cabinets directory using centralized paths
        cabinet_dir = StoragePaths.get_ir_cabinet_dir()
        cabinet_dir.mkdir(parents=True, exist_ok=True)
        file_path = cabinet_dir / safe_name
        # Verify resolved path is still inside cabinet_dir
        if not str(file_path.resolve()).startswith(str(cabinet_dir.resolve())):
            raise HTTPException(status_code=400, detail="Invalid filename")
        with file_path.open("wb") as buffer:
            buffer.write(content)

        return {"status": "uploaded", "filename": safe_name, "type": "cabinet"}

    @router.post("/reverbs/upload")
    async def upload_reverb_ir(file: UploadFile = File(...)):
        """Upload a new reverb IR file."""
        if not file.filename.endswith('.wav'):
            raise HTTPException(status_code=400, detail="Only WAV files are supported")

        # Security: sanitize filename to prevent path traversal
        import os
        safe_name = os.path.basename(file.filename)
        if not safe_name or safe_name.startswith('.'):
            raise HTTPException(status_code=400, detail="Invalid filename")

        # Size limit: 100 MB for reverb IRs
        MAX_IR_SIZE = 100 * 1024 * 1024
        content = await file.read()
        if len(content) > MAX_IR_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large (max {MAX_IR_SIZE // (1024*1024)}MB)")

        # Save to reverbs directory using centralized paths
        reverb_dir = StoragePaths.get_ir_reverb_dir()
        reverb_dir.mkdir(parents=True, exist_ok=True)
        file_path = reverb_dir / safe_name
        # Verify resolved path is still inside reverb_dir
        if not str(file_path.resolve()).startswith(str(reverb_dir.resolve())):
            raise HTTPException(status_code=400, detail="Invalid filename")
        with file_path.open("wb") as buffer:
            buffer.write(content)

        return {"status": "uploaded", "filename": safe_name, "type": "reverb"}

except ImportError as e:
    from fastapi import APIRouter, HTTPException
    router = APIRouter(prefix="/api/ir", tags=["ir"])
    _error_detail = f"IR dependencies not installed: {e}"

    @router.get("/")
    async def get_ir_root():
        raise HTTPException(status_code=503, detail=_error_detail)

    @router.get("/status")
    async def get_ir_status(type: str = "cabinet"):
        raise HTTPException(status_code=503, detail=_error_detail)

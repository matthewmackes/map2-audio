"""
Guitar Chain API Routes
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
OPTIONAL_ROUTE = True


def _build_router() -> Optional[APIRouter]:
    try:
        from app.services.guitar_chain import GuitarChain
    except ImportError as exc:
        logger.info("Guitar chain route not registered: %s", exc)
        return None

    router = APIRouter(prefix="/api/guitar", tags=["guitar"])
    guitar_chain = GuitarChain()

    class MixSettings(BaseModel):
        nam: float
        cabinet: float
        reverb: float

    class BypassSettings(BaseModel):
        nam: bool
        cabinet: bool
        reverb: bool

    @router.get("/")
    async def get_guitar_chain_status():
        """Get complete guitar chain status."""
        return guitar_chain.get_status()

    @router.post("/nam/model/{model_name}")
    async def set_nam_model(model_name: str):
        """Set active NAM model."""
        success = guitar_chain.set_nam_model(model_name)
        if not success:
            raise HTTPException(status_code=404, detail="NAM model not found")
        return {"status": "ok", "nam_model": model_name}

    @router.post("/cabinet/ir/{ir_name}")
    async def set_cabinet_ir(ir_name: str):
        """Set active cabinet IR."""
        success = guitar_chain.set_cabinet_ir(ir_name)
        if not success:
            raise HTTPException(status_code=404, detail="Cabinet IR not found")
        return {"status": "ok", "cabinet_ir": ir_name}

    @router.post("/reverb/ir/{ir_name}")
    async def set_reverb_ir(ir_name: str):
        """Set active reverb IR."""
        success = guitar_chain.set_reverb_ir(ir_name)
        if not success:
            raise HTTPException(status_code=404, detail="Reverb IR not found")
        return {"status": "ok", "reverb_ir": ir_name}

    @router.post("/mix")
    async def set_mix(settings: MixSettings):
        """Set wet/dry mix for each stage."""
        guitar_chain.nam_mix = max(0.0, min(1.0, settings.nam))
        guitar_chain.cabinet_mix = max(0.0, min(1.0, settings.cabinet))
        guitar_chain.reverb_mix = max(0.0, min(1.0, settings.reverb))
        return {"status": "ok", "mix": settings}

    @router.post("/bypass")
    async def set_bypass(settings: BypassSettings):
        """Set bypass state for each stage."""
        guitar_chain.bypass_nam = settings.nam
        guitar_chain.bypass_cabinet = settings.cabinet
        guitar_chain.bypass_reverb = settings.reverb
        return {"status": "ok", "bypass": settings}

    return router


router = _build_router()

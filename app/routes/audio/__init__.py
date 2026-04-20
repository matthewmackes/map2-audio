"""
/api/audio route package.
"""

from fastapi import APIRouter

from .common import get_audio_engine, get_engine_service, utc_now
from .monitoring import *
from .config import *
from .io import *
from . import monitoring, config, io
from .io import _chain_port_routing, _port_routing_config

router = APIRouter(prefix="/api/audio", tags=["audio"])
router.include_router(monitoring.router)
router.include_router(config.router)
router.include_router(io.router)

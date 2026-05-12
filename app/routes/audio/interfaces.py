"""
/api/audio/interfaces — unified audio interface enumeration for snapshot binding.
"""

from typing import Any, Dict

from fastapi import APIRouter

from app.services import audio_interface_registry as _registry_module

router = APIRouter()


@router.get("/interfaces")
async def list_audio_interfaces() -> Dict[str, Any]:
    """List every audio interface visible across PipeWire, AVB, and the cluster.

    Each entry carries a stable `interface_id` so snapshots can bind to a
    specific interface independently of PipeWire renaming or USB-port reshuffles.
    """
    # Look the factory up on the module on every call so tests can patch it.
    return await _registry_module.get_audio_interface_registry().list_interfaces()

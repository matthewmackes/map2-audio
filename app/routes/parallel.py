"""
Parallel Chain Routes

API endpoints for parallel processing chains (A/B routing).
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/parallel", tags=["parallel"])


# ========================================
# Models
# ========================================

class CreateParallelGroupRequest(BaseModel):
    position: int = Field(default=-1, description="Position in main chain (-1 for end)")
    num_branches: int = Field(default=2, ge=2, le=4, description="Number of parallel branches")


class ParallelGroupResponse(BaseModel):
    id: int
    ab_blend: float
    master_level: float
    bypass: bool
    branches: List[List[int]]
    branch_levels: List[float]


class AddToParallelBranchRequest(BaseModel):
    branch_index: int = Field(ge=0, le=3, description="Branch index (0-3)")
    plugin_id: int = Field(description="Plugin instance ID to add")
    position: int = Field(default=-1, description="Position in branch (-1 for end)")


class SetABBlendRequest(BaseModel):
    blend: float = Field(ge=0.0, le=1.0, description="A/B blend (0=A, 1=B)")


class SetBranchLevelRequest(BaseModel):
    branch_index: int = Field(ge=0, le=3, description="Branch index")
    level: float = Field(ge=0.0, le=2.0, description="Branch level (0-2)")


class SetBypassRequest(BaseModel):
    bypass: bool


# ========================================
# Routes
# ========================================

@router.get("")
async def get_parallel_groups() -> List[ParallelGroupResponse]:
    """Get all parallel processing groups."""
    engine = get_audio_engine()
    if not engine.is_available():
        raise HTTPException(status_code=503, detail="Engine not available")

    groups = await engine.get_parallel_groups()
    return [ParallelGroupResponse(**g) for g in groups]


@router.post("")
async def create_parallel_group(request: CreateParallelGroupRequest) -> dict:
    """Create a new parallel processing group."""
    engine = get_audio_engine()
    if not engine.is_available():
        raise HTTPException(status_code=503, detail="Engine not available")

    group_id = await engine.create_parallel_group(
        position=request.position,
        num_branches=request.num_branches
    )

    if group_id < 0:
        raise HTTPException(status_code=400, detail="Failed to create parallel group")

    return {"group_id": group_id, "success": True}


@router.delete("/{group_id}")
async def remove_parallel_group(group_id: int) -> dict:
    """Remove a parallel processing group."""
    engine = get_audio_engine()
    if not engine.is_available():
        raise HTTPException(status_code=503, detail="Engine not available")

    success = await engine.remove_parallel_group(group_id)
    if not success:
        raise HTTPException(status_code=404, detail="Parallel group not found")

    return {"success": True}


@router.get("/{group_id}")
async def get_parallel_group(group_id: int) -> ParallelGroupResponse:
    """Get a specific parallel group."""
    engine = get_audio_engine()
    if not engine.is_available():
        raise HTTPException(status_code=503, detail="Engine not available")

    groups = await engine.get_parallel_groups()
    for g in groups:
        if g.get("id") == group_id:
            return ParallelGroupResponse(**g)

    raise HTTPException(status_code=404, detail="Parallel group not found")


@router.post("/{group_id}/branches")
async def add_to_parallel_branch(group_id: int, request: AddToParallelBranchRequest) -> dict:
    """Add a plugin to a parallel branch."""
    engine = get_audio_engine()
    if not engine.is_available():
        raise HTTPException(status_code=503, detail="Engine not available")

    success = await engine.add_to_parallel_branch(
        group_id=group_id,
        branch_index=request.branch_index,
        plugin_id=request.plugin_id,
        position=request.position
    )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to add plugin to branch")

    return {"success": True}


@router.delete("/{group_id}/branches/{branch_index}/plugins/{plugin_id}")
async def remove_from_parallel_branch(
    group_id: int,
    branch_index: int,
    plugin_id: int
) -> dict:
    """Remove a plugin from a parallel branch."""
    engine = get_audio_engine()
    if not engine.is_available():
        raise HTTPException(status_code=503, detail="Engine not available")

    success = await engine.remove_from_parallel_branch(
        group_id=group_id,
        branch_index=branch_index,
        plugin_id=plugin_id
    )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to remove plugin from branch")

    return {"success": True}


@router.patch("/{group_id}/blend")
async def set_parallel_ab_blend(group_id: int, request: SetABBlendRequest) -> dict:
    """Set A/B blend for a parallel group (0.0 = all A, 1.0 = all B)."""
    engine = get_audio_engine()
    if not engine.is_available():
        raise HTTPException(status_code=503, detail="Engine not available")

    await engine.set_parallel_ab_blend(group_id, request.blend)
    return {"success": True, "blend": request.blend}


@router.get("/{group_id}/blend")
async def get_parallel_ab_blend(group_id: int) -> dict:
    """Get A/B blend for a parallel group."""
    engine = get_audio_engine()
    if not engine.is_available():
        raise HTTPException(status_code=503, detail="Engine not available")

    blend = await engine.get_parallel_ab_blend(group_id)
    return {"blend": blend}


@router.patch("/{group_id}/branches/{branch_index}/level")
async def set_parallel_branch_level(
    group_id: int,
    branch_index: int,
    request: SetBranchLevelRequest
) -> dict:
    """Set individual branch level."""
    engine = get_audio_engine()
    if not engine.is_available():
        raise HTTPException(status_code=503, detail="Engine not available")

    await engine.set_parallel_branch_level(group_id, branch_index, request.level)
    return {"success": True, "level": request.level}


@router.patch("/{group_id}/bypass")
async def set_parallel_bypass(group_id: int, request: SetBypassRequest) -> dict:
    """Set bypass for a parallel group."""
    engine = get_audio_engine()
    if not engine.is_available():
        raise HTTPException(status_code=503, detail="Engine not available")

    await engine.set_parallel_bypass(group_id, request.bypass)
    return {"success": True, "bypass": request.bypass}

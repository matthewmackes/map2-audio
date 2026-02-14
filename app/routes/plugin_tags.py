"""
Plugin Tags Routes

API endpoints for managing plugin metadata tags.
Allows users to categorize plugins with predefined and custom tags.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.database import get_session, Plugin

router = APIRouter(prefix="/api/plugins/tags", tags=["plugin-tags"])


# ========================================
# Predefined Tag Categories
# ========================================

# Tags organized by category for easy selection
PREDEFINED_TAGS = {
    "instrument_type": [
        "Guitar",
        "Bass",
        "Vocals",
        "Drums",
        "Keys",
        "Synth",
        "Acoustic",
        "Electric",
        "Orchestral",
        "Electronic",
    ],
    "effect_type": [
        "Distortion",
        "Overdrive",
        "Fuzz",
        "Clean",
        "Crunch",
        "High Gain",
        "Amp Sim",
        "Cabinet",
        "Reverb",
        "Delay",
        "Chorus",
        "Flanger",
        "Phaser",
        "Tremolo",
        "Vibrato",
        "Wah",
        "EQ",
        "Compressor",
        "Limiter",
        "Gate",
        "De-esser",
        "Pitch Shift",
        "Harmonizer",
        "Looper",
        "Tuner",
    ],
    "genre": [
        "Rock",
        "Metal",
        "Blues",
        "Jazz",
        "Country",
        "Pop",
        "Funk",
        "Reggae",
        "Classical",
        "Electronic",
        "Ambient",
        "Hip-Hop",
        "R&B",
        "Folk",
        "Indie",
    ],
    "tone": [
        "Warm",
        "Bright",
        "Dark",
        "Vintage",
        "Modern",
        "Transparent",
        "Colored",
        "Smooth",
        "Aggressive",
        "Subtle",
        "Extreme",
    ],
    "use_case": [
        "Live",
        "Studio",
        "Practice",
        "Recording",
        "Mixing",
        "Mastering",
        "Sound Design",
        "Experimental",
    ],
    "quality": [
        "Favorite",
        "Essential",
        "Go-To",
        "Backup",
        "Testing",
        "Archive",
        "New",
        "Classic",
    ],
    "technical": [
        "Low CPU",
        "High CPU",
        "Zero Latency",
        "High Latency",
        "Mono",
        "Stereo",
        "MIDI",
        "Sidechain",
    ],
}

# Flattened list for validation
ALL_PREDEFINED_TAGS = []
for category_tags in PREDEFINED_TAGS.values():
    ALL_PREDEFINED_TAGS.extend(category_tags)


# ========================================
# Models
# ========================================

class TagsResponse(BaseModel):
    categories: dict = Field(description="Tags organized by category")
    all_tags: List[str] = Field(description="Flat list of all tags")


class PluginTagsRequest(BaseModel):
    tags: List[str] = Field(default=[], description="List of tags to assign")


class PluginTagsResponse(BaseModel):
    uri: str
    name: str
    tags: List[str]
    is_favorite: bool
    is_hidden: bool
    user_description: str


class PluginMetadataRequest(BaseModel):
    tags: Optional[List[str]] = None
    is_favorite: Optional[bool] = None
    is_hidden: Optional[bool] = None
    user_description: Optional[str] = None


class BulkTagRequest(BaseModel):
    uris: List[str] = Field(description="Plugin URIs to update")
    add_tags: List[str] = Field(default=[], description="Tags to add")
    remove_tags: List[str] = Field(default=[], description="Tags to remove")


# ========================================
# Routes
# ========================================

@router.get("/available", response_model=TagsResponse)
async def get_available_tags():
    """Get all available predefined tags organized by category."""
    return TagsResponse(
        categories=PREDEFINED_TAGS,
        all_tags=ALL_PREDEFINED_TAGS
    )


@router.get("/plugin/{uri:path}", response_model=PluginTagsResponse)
async def get_plugin_tags(uri: str):
    """Get tags and metadata for a specific plugin."""
    async with get_session() as session:
        result = await session.execute(
            select(Plugin).where(Plugin.uri == uri)
        )
        plugin = result.scalar_one_or_none()

        if not plugin:
            # Return empty metadata for unknown plugins
            return PluginTagsResponse(
                uri=uri,
                name="Unknown Plugin",
                tags=[],
                is_favorite=False,
                is_hidden=False,
                user_description=""
            )

        return PluginTagsResponse(
            uri=plugin.uri,
            name=plugin.name,
            tags=plugin.tags or [],
            is_favorite=plugin.is_favorite or False,
            is_hidden=plugin.is_hidden or False,
            user_description=plugin.user_description or ""
        )


@router.patch("/plugin/{uri:path}", response_model=PluginTagsResponse)
async def update_plugin_metadata(uri: str, request: PluginMetadataRequest):
    """Update tags and metadata for a plugin."""
    async with get_session() as session:
        result = await session.execute(
            select(Plugin).where(Plugin.uri == uri)
        )
        plugin = result.scalar_one_or_none()

        if not plugin:
            # Create a new plugin entry if it doesn't exist
            plugin = Plugin(
                uri=uri,
                name=uri.split("/")[-1] if "/" in uri else uri,
                tags=request.tags or [],
                is_favorite=request.is_favorite or False,
                is_hidden=request.is_hidden or False,
                user_description=request.user_description or ""
            )
            session.add(plugin)
        else:
            # Update existing plugin
            if request.tags is not None:
                plugin.tags = request.tags
            if request.is_favorite is not None:
                plugin.is_favorite = request.is_favorite
            if request.is_hidden is not None:
                plugin.is_hidden = request.is_hidden
            if request.user_description is not None:
                plugin.user_description = request.user_description

        await session.commit()
        await session.refresh(plugin)

        return PluginTagsResponse(
            uri=plugin.uri,
            name=plugin.name,
            tags=plugin.tags or [],
            is_favorite=plugin.is_favorite or False,
            is_hidden=plugin.is_hidden or False,
            user_description=plugin.user_description or ""
        )


@router.post("/plugin/{uri:path}/add")
async def add_tags_to_plugin(uri: str, request: PluginTagsRequest):
    """Add tags to a plugin (without removing existing ones)."""
    async with get_session() as session:
        result = await session.execute(
            select(Plugin).where(Plugin.uri == uri)
        )
        plugin = result.scalar_one_or_none()

        if not plugin:
            plugin = Plugin(
                uri=uri,
                name=uri.split("/")[-1] if "/" in uri else uri,
                tags=request.tags
            )
            session.add(plugin)
        else:
            existing_tags = set(plugin.tags or [])
            new_tags = existing_tags.union(set(request.tags))
            plugin.tags = list(new_tags)

        await session.commit()

        return {
            "success": True,
            "uri": uri,
            "tags": plugin.tags
        }


@router.post("/plugin/{uri:path}/remove")
async def remove_tags_from_plugin(uri: str, request: PluginTagsRequest):
    """Remove specific tags from a plugin."""
    async with get_session() as session:
        result = await session.execute(
            select(Plugin).where(Plugin.uri == uri)
        )
        plugin = result.scalar_one_or_none()

        if not plugin:
            raise HTTPException(status_code=404, detail="Plugin not found")

        existing_tags = set(plugin.tags or [])
        remaining_tags = existing_tags - set(request.tags)
        plugin.tags = list(remaining_tags)

        await session.commit()

        return {
            "success": True,
            "uri": uri,
            "tags": plugin.tags
        }


@router.post("/bulk")
async def bulk_update_tags(request: BulkTagRequest):
    """Update tags for multiple plugins at once."""
    async with get_session() as session:
        updated_count = 0

        for uri in request.uris:
            result = await session.execute(
                select(Plugin).where(Plugin.uri == uri)
            )
            plugin = result.scalar_one_or_none()

            if plugin:
                existing_tags = set(plugin.tags or [])
                # Add new tags
                existing_tags.update(request.add_tags)
                # Remove specified tags
                existing_tags -= set(request.remove_tags)
                plugin.tags = list(existing_tags)
                updated_count += 1

        await session.commit()

        return {
            "success": True,
            "updated_count": updated_count,
            "total_requested": len(request.uris)
        }


@router.get("/search")
async def search_plugins_by_tags(
    tags: str,
    match_all: bool = False
):
    """
    Search for plugins with specific tags.

    Args:
        tags: Comma-separated list of tags to search for
        match_all: If True, plugins must have ALL tags. If False, plugins with ANY tag match.
    """
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]

    if not tag_list:
        raise HTTPException(status_code=400, detail="No tags provided")

    async with get_session() as session:
        result = await session.execute(
            select(Plugin).where(Plugin.tags.isnot(None))
        )
        plugins = result.scalars().all()

        matching = []
        for plugin in plugins:
            plugin_tags = set(plugin.tags or [])
            search_tags = set(tag_list)

            if match_all:
                # Plugin must have all requested tags
                if search_tags.issubset(plugin_tags):
                    matching.append({
                        "uri": plugin.uri,
                        "name": plugin.name,
                        "tags": plugin.tags,
                        "category": plugin.category
                    })
            else:
                # Plugin must have at least one matching tag
                if plugin_tags.intersection(search_tags):
                    matching.append({
                        "uri": plugin.uri,
                        "name": plugin.name,
                        "tags": plugin.tags,
                        "category": plugin.category
                    })

        return {
            "query_tags": tag_list,
            "match_all": match_all,
            "count": len(matching),
            "plugins": matching
        }


@router.get("/favorites")
async def get_favorite_plugins():
    """Get all plugins marked as favorites."""
    async with get_session() as session:
        result = await session.execute(
            select(Plugin).where(Plugin.is_favorite == True)
        )
        plugins = result.scalars().all()

        return {
            "count": len(plugins),
            "plugins": [
                {
                    "uri": p.uri,
                    "name": p.name,
                    "tags": p.tags or [],
                    "category": p.category
                }
                for p in plugins
            ]
        }


@router.post("/plugin/{uri:path}/favorite")
async def toggle_favorite(uri: str, is_favorite: bool = True):
    """Toggle favorite status for a plugin."""
    async with get_session() as session:
        result = await session.execute(
            select(Plugin).where(Plugin.uri == uri)
        )
        plugin = result.scalar_one_or_none()

        if not plugin:
            plugin = Plugin(
                uri=uri,
                name=uri.split("/")[-1] if "/" in uri else uri,
                is_favorite=is_favorite
            )
            session.add(plugin)
        else:
            plugin.is_favorite = is_favorite

        await session.commit()

        return {
            "success": True,
            "uri": uri,
            "is_favorite": is_favorite
        }

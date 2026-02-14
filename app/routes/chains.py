"""
Signal Chain Route Handlers with Database Persistence
API endpoints for creating and managing audio signal chains.
"""

try:
    from fastapi import APIRouter, HTTPException, Query, Body
    from pydantic import BaseModel
    from typing import List
    from app.services.chain_service import ChainService
    from app.services.event_publisher import event_publisher, EventType

    router = APIRouter(prefix="/api/chains", tags=["chains"])

    class ChainCreate(BaseModel):
        name: str

    class ChainUpdate(BaseModel):
        name: str = None
        is_active: bool = None

    class ChainDeployRequest(BaseModel):
        chain_id: int
        chain_name: str
        plugins: List[dict] = []
        mode: str = "active"  # active | standby
        activate: bool = True

    def validate_chain_name(name: str) -> bool:
        """Validate chain name (1-256 characters)."""
        return name and isinstance(name, str) and 1 <= len(name) <= 256

    @router.get("/")
    async def list_chains():
        """List all signal chains from database."""
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            chains = await service.list_chains()
            return {"chains": chains, "count": len(chains)}

    @router.post("/")
    async def create_chain(chain: ChainCreate):
        """Create new signal chain with database persistence.

        Request Body:
            name: Chain name (1-256 characters)
        """
        if not validate_chain_name(chain.name):
            raise HTTPException(status_code=400, detail="Chain name must be 1-256 characters")

        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            result = await service.create_chain(chain.name)
            if result is None:
                raise HTTPException(status_code=400, detail="Failed to create chain")

        # Publish chain creation event AFTER session commits
        await event_publisher.publish(
            "chain_updates",
            EventType.CHAIN_CREATED,
            {"chain_id": result["id"], "name": result["name"]}
        )

        return result

    @router.get("/presets")
    async def list_presets():
        """List all saved presets."""
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            presets = await service.list_presets()
            return {"presets": presets, "count": len(presets)}

    @router.post("/preset/{preset_id}/load")
    async def load_chain_preset(preset_id: int):
        """Load chain from preset.

        Args:
            preset_id: Preset ID to load

        Returns:
            New chain ID created from preset
        """
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            chain_id = await service.load_preset(preset_id)
            if not chain_id:
                raise HTTPException(status_code=404, detail="Preset not found or load failed")

        # Publish preset loaded event AFTER session commits
        await event_publisher.publish(
            "chain_updates",
            EventType.PRESET_LOADED,
            {"preset_id": preset_id, "chain_id": chain_id}
        )

        return {"status": "preset_loaded", "chain_id": chain_id}

    @router.delete("/preset/{preset_id}")
    async def delete_preset(preset_id: int):
        """Delete a preset."""
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            success = await service.delete_preset(preset_id)
            if not success:
                raise HTTPException(status_code=404, detail="Preset not found")
            return {"status": "preset_deleted", "preset_id": preset_id}

    @router.get("/{chain_id}")
    async def get_chain(chain_id: int):
        """Get signal chain details."""
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            result = await service.get_chain(chain_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Chain not found")
        return result

    @router.get("/{chain_id}/analysis")
    async def get_chain_analysis(chain_id: int):
        """Get estimated resource requirements for a chain."""
        from app.database import get_session
        from app.services.chain_analyzer import ChainAnalyzer

        async with get_session() as session:
            analyzer = ChainAnalyzer(ChainService(session))
            analysis = await analyzer.analyze_chain(chain_id)

        if analysis is None:
            raise HTTPException(status_code=404, detail="Chain not found")
        return analysis

    @router.post("/{chain_id}/plugins")
    async def add_plugin_to_chain(chain_id: int, plugin_uri: str = Query(..., description="Plugin URI string")):
        """Add plugin to signal chain.

        Args:
            chain_id: Signal chain ID
            plugin_uri: Plugin URI string (query parameter)
        """
        if not plugin_uri or not isinstance(plugin_uri, str):
            raise HTTPException(status_code=400, detail="Plugin URI must be a non-empty string")

        from app.database import get_session, Chain
        from sqlalchemy import select
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            logger.info(f"add_plugin route: chain_id={chain_id}, plugin_uri={plugin_uri}")

            async with get_session() as session:
                # DEBUG: Check if chain exists directly
                debug_result = await session.execute(select(Chain).filter(Chain.id == chain_id))
                debug_chain = debug_result.scalar_one_or_none()
                if debug_chain:
                    logger.info(f"DEBUG: Chain {chain_id} EXISTS: {debug_chain.name}")
                else:
                    logger.error(f"DEBUG: Chain {chain_id} NOT FOUND")
                    # List all chains
                    all_chains = await session.execute(select(Chain))
                    all = all_chains.scalars().all()
                    logger.error(f"DEBUG: Available chains: {[(c.id, c.name) for c in all]}")

                service = ChainService(session)
                success = await service.add_plugin_to_chain(chain_id, plugin_uri)
                logger.info(f"add_plugin_to_chain returned: {success}")

                if not success:
                    raise HTTPException(status_code=404, detail=f"Chain {chain_id} not found or plugin add failed")

                result = await service.get_chain(chain_id)
                plugins_count = len(result["plugins"]) if result else 0

            # Publish plugin added event AFTER session commits
            await event_publisher.publish(
                "plugin_params",
                EventType.PLUGIN_ADDED,
                {"chain_id": chain_id, "plugin_uri": plugin_uri}
            )

            return {
                "status": "plugin_added",
                "chain_id": chain_id,
                "plugin": plugin_uri,
                "plugins_count": plugins_count
            }
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            logger.error(f"Error: {str(e)}\n{traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{chain_id}/plugins")
    async def remove_plugin_from_chain(chain_id: int, plugin_uri: str = Query(..., description="Plugin URI to remove")):
        """Remove plugin from signal chain.

        CRITICAL: This endpoint uses atomic, synchronous database operations
        to ensure deletion persists completely before returning.
        
        Args:
            chain_id: Signal chain ID
            plugin_uri: Plugin URI string (query parameter)
        """
        if not plugin_uri or not isinstance(plugin_uri, str):
            raise HTTPException(status_code=400, detail="Plugin URI must be a non-empty string")

        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"DELETE_ENDPOINT: === ATOMIC DELETION START ===")
        logger.info(f"DELETE_ENDPOINT: chain_id={chain_id}, plugin_uri={plugin_uri}")

        from app.database import get_session, ChainPlugin, checkpoint_database
        from sqlalchemy import select
        
        # Step 1: Perform deletion
        deletion_succeeded = False
        deletion_error = None
        
        try:
            async with get_session() as session:
                service = ChainService(session)
                
                logger.info(f"DELETE_ENDPOINT: Calling service.remove_plugin_from_chain()...")
                deletion_succeeded = await service.remove_plugin_from_chain(chain_id, plugin_uri)
                
                if not deletion_succeeded:
                    deletion_error = "Service failed to remove plugin"
                    logger.error(f"DELETE_ENDPOINT: {deletion_error}")
                    raise HTTPException(status_code=404, detail=deletion_error)
            
            logger.info(f"DELETE_ENDPOINT: Transaction committed by context manager")
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"DELETE_ENDPOINT: Unexpected exception: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to delete plugin")
        
        if not deletion_succeeded:
            logger.error(f"DELETE_ENDPOINT: Service did not succeed")
            raise HTTPException(status_code=500, detail="Deletion failed")

        # Step 2: SYNC database checkpoint to ensure deletion is written to disk
        logger.info(f"DELETE_ENDPOINT: Performing WAL checkpoint...")
        try:
            await checkpoint_database()
            logger.info(f"DELETE_ENDPOINT: Checkpoint completed")
        except Exception as e:
            logger.warning(f"DELETE_ENDPOINT: Checkpoint failed (non-fatal): {e}")

        # Step 3: Verify deletion with fresh sessions
        logger.info(f"DELETE_ENDPOINT: Beginning verification phase...")
        max_attempts = 7
        deletion_confirmed = False
        
        for attempt in range(1, max_attempts + 1):
            try:
                async with get_session() as verify_session:
                    # Use raw text query as backup to ORM
                    from sqlalchemy import text
                    
                    # Method 1: ORM query
                    verify_result = await verify_session.execute(
                        select(ChainPlugin).filter(
                            (ChainPlugin.chain_id == chain_id) &
                            (ChainPlugin.plugin_uri == plugin_uri)
                        )
                    )
                    orm_count = len(verify_result.scalars().all())
                    
                    # Method 2: Raw SQL query (more direct)
                    sql_result = await verify_session.execute(
                        text("SELECT COUNT(*) FROM chain_plugins WHERE chain_id = :cid AND plugin_uri = :uri"),
                        {"cid": chain_id, "uri": plugin_uri}
                    )
                    sql_count = sql_result.scalar()
                    
                    logger.info(f"DELETE_ENDPOINT: Attempt {attempt} - ORM: {orm_count} records, SQL: {sql_count} records")
                    
                    if orm_count == 0 and sql_count == 0:
                        deletion_confirmed = True
                        logger.info(f"DELETE_ENDPOINT: ✓ VERIFIED - Plugin deleted (attempt {attempt})")
                        break
                    else:
                        logger.error(f"DELETE_ENDPOINT: ✗ Still in database - ORM:{orm_count}, SQL:{sql_count}")
                        
                        if attempt < max_attempts:
                            wait_time = 0.1 * attempt
                            logger.info(f"DELETE_ENDPOINT: Waiting {wait_time}s before attempt {attempt+1}...")
                            import asyncio
                            await asyncio.sleep(wait_time)
                            
            except Exception as e:
                logger.error(f"DELETE_ENDPOINT: Verification error on attempt {attempt}: {e}")
                if attempt >= max_attempts:
                    raise HTTPException(status_code=500, detail="Failed to verify deletion")
        
        if not deletion_confirmed:
            logger.error(f"DELETE_ENDPOINT: ✗✗✗ CRITICAL - Could not verify deletion after {max_attempts} attempts")
            raise HTTPException(status_code=500, detail="Deletion could not be verified")

        logger.info(f"DELETE_ENDPOINT: === ATOMIC DELETION SUCCESS ===")
        
        # Publish event
        await event_publisher.publish(
            "plugin_params",
            EventType.PLUGIN_REMOVED,
            {"chain_id": chain_id, "plugin_uri": plugin_uri}
        )

        return {"status": "plugin_removed", "chain_id": chain_id}

    @router.post("/{chain_id}/activate")
    async def activate_chain(chain_id: int):
        """Activate signal chain."""
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            success = await service.activate_chain(chain_id)
            if not success:
                raise HTTPException(status_code=404, detail="Chain not found")

        # Publish chain activation event AFTER session commits
        await event_publisher.publish(
            "chain_updates",
            EventType.CHAIN_ACTIVATED,
            {"chain_id": chain_id}
        )

        return {"status": "activated", "chain_id": chain_id}

    @router.post("/{chain_id}/deactivate")
    async def deactivate_chain(chain_id: int):
        """Deactivate signal chain."""
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            success = await service.deactivate_chain(chain_id)
            if not success:
                raise HTTPException(status_code=404, detail="Chain not found")

        # Publish chain deactivation event AFTER session commits
        await event_publisher.publish(
            "chain_updates",
            EventType.CHAIN_DEACTIVATED,
            {"chain_id": chain_id}
        )

        return {"status": "deactivated", "chain_id": chain_id}

    @router.delete("/{chain_id}")
    async def delete_chain(chain_id: int):
        """Delete signal chain."""
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            success = await service.delete_chain(chain_id)
            if not success:
                raise HTTPException(status_code=404, detail="Chain not found")

        # Publish chain deletion event AFTER session commits
        # This prevents race conditions where WebSocket listeners refetch
        # before the transaction is committed
        await event_publisher.publish(
            "chain_updates",
            EventType.CHAIN_DELETED,
            {"chain_id": chain_id}
        )

        return {"status": "deleted", "chain_id": chain_id}

    @router.put("/{chain_id}/rename")
    async def rename_chain(chain_id: int, new_name: str):
        """Rename a signal chain."""
        if not validate_chain_name(new_name):
            raise HTTPException(status_code=400, detail="Chain name must be 1-256 characters")

        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            success = await service.rename_chain(chain_id, new_name)
            if not success:
                raise HTTPException(status_code=404, detail="Chain not found")

        # Publish chain rename event AFTER session commits
        await event_publisher.publish(
            "chain_updates",
            EventType.CHAIN_RENAMED,
            {"chain_id": chain_id, "name": new_name}
        )

        return {"status": "renamed", "chain_id": chain_id, "name": new_name}

    @router.post("/{chain_id}/reorder")
    async def reorder_plugins(chain_id: int, plugin_uris: List[str] = Body(..., description="Ordered list of plugin URIs")):
        """Reorder plugins in chain.

        Args:
            chain_id: Signal chain ID
            plugin_uris: Ordered list of plugin URIs (request body)
        """
        from app.database import get_session
        
        if not plugin_uris or not isinstance(plugin_uris, list):
            raise HTTPException(status_code=400, detail="plugin_uris must be a non-empty list")
        
        async with get_session() as session:
            service = ChainService(session)
            success = await service.reorder_plugins(chain_id, plugin_uris)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to reorder plugins")
            return {"status": "reordered", "chain_id": chain_id, "plugins": plugin_uris}

    @router.post("/{chain_id}/plugins/{plugin_uri}/bypass")
    async def toggle_plugin_bypass(chain_id: int, plugin_uri: str, bypass: bool):
        """Toggle plugin bypass state.

        Args:
            chain_id: Signal chain ID
            plugin_uri: Plugin URI
            bypass: True to bypass, False to enable
        """
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            success = await service.set_plugin_bypass(chain_id, plugin_uri, bypass)
            if not success:
                raise HTTPException(status_code=404, detail="Chain or plugin not found")

        # Publish plugin bypass event AFTER session commits
        await event_publisher.publish(
            "plugin_params",
            EventType.PLUGIN_BYPASSED,
            {"chain_id": chain_id, "plugin_uri": plugin_uri, "bypass": bypass}
        )

        return {"status": "bypass_updated", "chain_id": chain_id, "plugin": plugin_uri, "bypass": bypass}

    @router.post("/{chain_id}/preset/save")
    async def save_chain_preset(chain_id: int, preset_name: str):
        """Save chain configuration as preset.

        Args:
            chain_id: Signal chain ID
            preset_name: Name for the preset
        """
        if not preset_name or len(preset_name) < 1 or len(preset_name) > 256:
            raise HTTPException(status_code=400, detail="Preset name must be 1-256 characters")

        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            preset_id = await service.save_preset(chain_id, preset_name)
            if not preset_id:
                raise HTTPException(status_code=404, detail="Chain not found or save failed")
            return {"status": "preset_saved", "preset_id": preset_id, "name": preset_name}

    # ==================== CLUSTER DEPLOYMENT ====================

    @router.post("/deploy")
    async def deploy_chain(request: ChainDeployRequest):
        """Deploy a chain configuration to this node (cluster use).

        This endpoint is called by the management node to load a chain
        on a target audio node. For now it returns success and should be
        integrated with the audio engine in Phase 1.4+.
        """
        if request.chain_id is None:
            raise HTTPException(status_code=400, detail="chain_id required")

        return {
            "status": "accepted",
            "applied": False,
            "message": "Chain deploy endpoint acknowledged request but did not apply it",
            "chain_id": request.chain_id,
            "chain_name": request.chain_name,
            "plugin_count": len(request.plugins),
            "mode": request.mode,
            "activate": request.activate,
        }

    # ==================== TEMPLATES (DEMO PEDALBOARDS) ====================

    @router.get("/templates/list")
    async def list_templates():
        """List available chain templates (demo pedalboards).

        Returns:
            List of templates with name, description, plugin_count
        """
        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            templates = await service.list_templates()
            return {"templates": templates, "count": len(templates)}

    @router.post("/templates/load")
    async def load_template(template_name: str):
        """Create a chain from a template (demo pedalboard).

        Args:
            template_name: Name of the template (e.g., "Rock Distortion")

        Returns:
            Created chain with plugins
        """
        if not template_name:
            raise HTTPException(status_code=400, detail="Template name is required")

        from app.database import get_session
        async with get_session() as session:
            service = ChainService(session)
            chain = await service.create_chain_from_template(template_name)
            if not chain:
                raise HTTPException(status_code=404, detail=f"Template '{template_name}' not found")
            return {
                "status": "template_loaded",
                "chain": chain
            }

except ImportError:
    router = None

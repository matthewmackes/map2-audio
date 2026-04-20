"""Persistence, serialization, import, export, and sharing responsibilities for SnapshotService."""

from .common import *


class SnapshotPersistenceMixin:
    async def export_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        detail = await self.get_snapshot(snapshot_id)
        if detail is None:
            return None
        payload = {
            "version": SNAPSHOT_BUNDLE_FORMAT_VERSION,
            "exported_at": _utcnow().isoformat(),
            "snapshot": detail,
            "asset_manifest": self._build_asset_manifest(detail),
        }
        gcp_payload = await self._build_ground_control_pro_bundle_payload(detail)
        if gcp_payload is not None:
            payload[_GROUND_CONTROL_PRO_EXTENSION_KEY] = gcp_payload
        return payload

    async def export_template(self, template_id: int) -> Optional[dict[str, Any]]:
        detail = await self.get_template(template_id)
        if detail is None:
            return None
        payload = {
            "version": SNAPSHOT_BUNDLE_FORMAT_VERSION,
            "exported_at": _utcnow().isoformat(),
            "template": detail,
            "asset_manifest": self._build_asset_manifest(detail),
        }
        gcp_payload = await self._build_ground_control_pro_bundle_payload(detail)
        if gcp_payload is not None:
            payload[_GROUND_CONTROL_PRO_EXTENSION_KEY] = gcp_payload
        return payload

    async def export_template_bundle(self, template_id: int) -> Optional[dict[str, Any]]:
        payload = await self.export_template(template_id)
        if payload is None:
            return None
        template_name = str(payload.get("template", {}).get("name") or f"template-{template_id}").strip() or f"template-{template_id}"
        return self._build_document_bundle(
            payload,
            name=template_name,
            extension=".map2template",
        )

    async def export_snapshot_bundle(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        payload = await self.export_snapshot(snapshot_id)
        if payload is None:
            return None
        snapshot_name = str(payload.get("snapshot", {}).get("name") or f"snapshot-{snapshot_id}").strip() or f"snapshot-{snapshot_id}"
        return self._build_document_bundle(
            payload,
            name=snapshot_name,
            extension=".map2snapshot",
        )

    async def import_snapshot(self, payload: dict[str, Any] | bytes | bytearray) -> dict[str, Any]:
        if isinstance(payload, (bytes, bytearray)):
            detail_payload = await self._extract_snapshot_bundle_payload(bytes(payload))
        elif "snapshot" in payload and isinstance(payload["snapshot"], dict):
            detail_payload = payload["snapshot"]
        else:
            detail_payload = payload

        name = str(detail_payload.get("name") or "Imported Snapshot")
        imported = await self.create_snapshot(
            name=name,
            description=str(detail_payload.get("description") or ""),
            tags=list(detail_payload.get("tags") or []),
            tempo_bpm=_safe_float(detail_payload.get("tempo_bpm"), DEFAULT_SNAPSHOT_TEMPO_BPM),
            input_device=detail_payload.get("input_device"),
            output_device=detail_payload.get("output_device"),
            detail_payload=detail_payload,
            apply_default_system_blocks=False,
            capture_current_authority_extensions=False,
        )
        return imported

    async def import_template(self, payload: dict[str, Any] | bytes | bytearray) -> dict[str, Any]:
        if isinstance(payload, (bytes, bytearray)):
            detail_payload = await self._extract_snapshot_bundle_payload(bytes(payload))
        elif "template" in payload and isinstance(payload["template"], dict):
            detail_payload = payload["template"]
        else:
            detail_payload = payload

        name = str(detail_payload.get("name") or "Imported Template")
        return await self.create_template(
            name=name,
            description=str(detail_payload.get("description") or ""),
            tags=list(detail_payload.get("tags") or []),
            input_device=detail_payload.get("input_device"),
            output_device=detail_payload.get("output_device"),
            detail_payload=detail_payload,
            is_locked=bool(detail_payload.get("is_locked", False)),
        )

    async def get_snapshot_by_program(self, program_number: int) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.program_number == program_number))
        snapshot = result.scalar_one_or_none()
        if snapshot is None:
            return None
        loaded = await self._get_snapshot_model(snapshot.id)
        return self._serialize_snapshot_summary(loaded) if loaded is not None else None

    async def share_snapshot(self, snapshot_id: int, *, author_name: str = "Anonymous") -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        if self._snapshot_document_type(snapshot) == "template":
            return None
        snapshot.community_shared = True
        snapshot.community_author = author_name.strip() or "Anonymous"
        if not snapshot.community_uuid:
            snapshot.community_uuid = uuid4().hex
        snapshot.updated_at = _utcnow()
        await self.session.flush()
        return await self._reload_snapshot_summary(snapshot.id)

    async def share_template(self, template_id: int, *, author_name: str = "Anonymous") -> Optional[dict[str, Any]]:
        template = await self._get_snapshot_model(template_id)
        if template is None or self._snapshot_document_type(template) != "template":
            return None
        template.community_shared = True
        template.community_author = author_name.strip() or "Anonymous"
        if not template.community_uuid:
            template.community_uuid = uuid4().hex
        template.updated_at = _utcnow()
        await self.session.flush()
        return await self._reload_snapshot_summary(template.id)

    async def browse_community_snapshots(
        self,
        *,
        query: Optional[str] = None,
        tags: Optional[Iterable[str]] = None,
        author: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        summaries = await self.list_snapshots(include_shared_only=True)
        query = (query or "").strip().lower()
        tag_set = {tag.strip().lower() for tag in (tags or []) if tag and tag.strip()}
        author = (author or "").strip().lower()

        results: list[dict[str, Any]] = []
        for summary in summaries:
            haystack = " ".join(
                [
                    str(summary.get("name", "")),
                    str(summary.get("description", "")),
                    " ".join(summary.get("tags", [])),
                    str(summary.get("community_author", "")),
                ]
            ).lower()
            if query and query not in haystack:
                continue
            if author and author not in str(summary.get("community_author", "")).lower():
                continue
            if tag_set:
                summary_tags = {tag.lower() for tag in summary.get("tags", [])}
                if not tag_set.issubset(summary_tags):
                    continue
            results.append(summary)
        return results

    async def browse_community_templates(
        self,
        *,
        query: Optional[str] = None,
        tags: Optional[Iterable[str]] = None,
        author: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        templates = await self.list_templates(include_shared_only=True)
        query = (query or "").strip().lower()
        tag_set = {tag.strip().lower() for tag in (tags or []) if tag and tag.strip()}
        author = (author or "").strip().lower()

        results: list[dict[str, Any]] = []
        for template in templates:
            haystack = " ".join(
                [
                    str(template.get("name", "")),
                    str(template.get("description", "")),
                    " ".join(template.get("tags", [])),
                    str(template.get("community_author", "")),
                ]
            ).lower()
            if query and query not in haystack:
                continue
            if author and author not in str(template.get("community_author", "")).lower():
                continue
            if tag_set:
                template_tags = {tag.lower() for tag in template.get("tags", [])}
                if not tag_set.issubset(template_tags):
                    continue
            results.append(template)
        return results

    async def rate_community_snapshot(self, community_uuid: str, rating: int) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.community_uuid == community_uuid))
        snapshot = result.scalar_one_or_none()
        if snapshot is None or self._snapshot_document_type(snapshot) == "template":
            return None
        rating = max(1, min(5, int(rating)))
        snapshot.community_rating_sum = float(snapshot.community_rating_sum or 0.0) + rating
        snapshot.community_rating_count = int(snapshot.community_rating_count or 0) + 1
        snapshot.updated_at = _utcnow()
        await self.session.flush()
        return await self._reload_snapshot_summary(snapshot.id)

    async def rate_community_template(self, community_uuid: str, rating: int) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.community_uuid == community_uuid))
        template = result.scalar_one_or_none()
        if template is None or self._snapshot_document_type(template) != "template":
            return None
        rating = max(1, min(5, int(rating)))
        template.community_rating_sum = float(template.community_rating_sum or 0.0) + rating
        template.community_rating_count = int(template.community_rating_count or 0) + 1
        template.updated_at = _utcnow()
        await self.session.flush()
        return await self._reload_snapshot_summary(template.id)

    async def record_community_download(self, community_uuid: str) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.community_uuid == community_uuid))
        snapshot = result.scalar_one_or_none()
        if snapshot is None or self._snapshot_document_type(snapshot) == "template":
            return None
        snapshot_id = snapshot.id
        snapshot.community_download_count = int(snapshot.community_download_count or 0) + 1
        snapshot.updated_at = _utcnow()
        await self.session.flush()
        self.session.expire_all()
        export_payload = await self.export_snapshot(snapshot_id)
        if export_payload is None:
            return None
        export_payload["community_uuid"] = community_uuid
        return export_payload

    async def record_community_template_download(self, community_uuid: str) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.community_uuid == community_uuid))
        template = result.scalar_one_or_none()
        if template is None or self._snapshot_document_type(template) != "template":
            return None
        template_id = template.id
        template.community_download_count = int(template.community_download_count or 0) + 1
        template.updated_at = _utcnow()
        await self.session.flush()
        self.session.expire_all()
        export_payload = await self.export_template_bundle(template_id)
        if export_payload is None:
            return None
        export_payload["community_uuid"] = community_uuid
        return export_payload

    async def create_deployment(
        self,
        snapshot_id: int,
        *,
        primary_node_id: str,
        standby_node_ids: Optional[list[str]] = None,
        assignment_strategy: str = "manual",
        redundancy_enabled: bool = False,
        deployment_status: str = "deploying",
        error_message: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        deployment = SnapshotDeployment(
            snapshot_id=snapshot.id,
            primary_node_id=primary_node_id,
            standby_node_ids=list(standby_node_ids or []),
            assignment_strategy=assignment_strategy,
            redundancy_enabled=redundancy_enabled,
            deployment_status=deployment_status,
            error_message=error_message,
        )
        self.session.add(deployment)
        await self.session.flush()
        return self._serialize_deployment(deployment)

    async def add_deployment_history(
        self,
        deployment_id: int,
        *,
        snapshot_id: int,
        to_node_id: str,
        action: str,
        from_node_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        deployment = await self.session.get(SnapshotDeployment, deployment_id)
        if deployment is None:
            return None
        history = SnapshotDeploymentHistory(
            snapshot_deployment_id=deployment.id,
            snapshot_id=snapshot_id,
            from_node_id=from_node_id,
            to_node_id=to_node_id,
            action=action,
            notes=notes,
        )
        self.session.add(history)
        await self.session.flush()
        return {
            "id": history.id,
            "snapshot_deployment_id": history.snapshot_deployment_id,
            "snapshot_id": history.snapshot_id,
            "from_node_id": history.from_node_id,
            "to_node_id": history.to_node_id,
            "action": history.action,
            "notes": history.notes,
            "created_at": history.created_at.isoformat() if history.created_at else None,
        }

    async def list_deployments(self, snapshot_id: Optional[int] = None) -> list[dict[str, Any]]:
        stmt = select(SnapshotDeployment).options(selectinload(SnapshotDeployment.history)).order_by(SnapshotDeployment.deployed_at.desc())
        if snapshot_id is not None:
            stmt = stmt.where(SnapshotDeployment.snapshot_id == snapshot_id)
        result = await self.session.execute(stmt)
        deployments = result.scalars().all()
        return [self._serialize_deployment(item) for item in deployments]

    def to_legacy_snapshot_data(self, detail: dict[str, Any]) -> dict[str, Any]:
        """Compatibility adapter for legacy runtime/MIDI bridges, not new authority work."""
        chains = detail.get("chains", [])
        chain_map = {
            str(chain["id"]): {
                "name": chain.get("name") or f"Chain {chain['id']}",
                "plugins": [
                    {
                        "uri": plugin["uri"],
                        "position": plugin.get("position", index),
                        "bypass": bool(plugin.get("bypass", False)),
                        "parameters": dict(plugin.get("parameters") or {}),
                        "loader_state": dict(plugin.get("loader_state") or {}),
                    }
                    for index, plugin in enumerate(chain.get("plugins", []))
                ],
            }
            for chain in chains
        }
        routing = detail.get("routing") or {}
        return {
            "flowSlots": [
                {
                    "id": channel.get("channel_key") or channel.get("id"),
                    "chainId": channel.get("chain_id"),
                    "label": channel.get("label"),
                    "color": channel.get("color"),
                    "muted": bool(channel.get("muted", False)),
                    "solo": bool(channel.get("solo", False)),
                    "dryWetMix": _safe_float(channel.get("dry_wet_mix", channel.get("dryWetMix")), DEFAULT_DRY_WET_MIX),
                }
                for channel in detail.get("channels", [])
            ],
            "routing": {
                "mode": _legacy_mode(str(routing.get("mode") or "parallel_blend")),
                "activeSlotId": routing.get("active_channel_key") or routing.get("activeChannelId"),
                "blendPositions": dict(routing.get("blend_positions") or routing.get("blendPositions") or {}),
                "morphProgress": _safe_float(routing.get("morph_position", routing.get("morphProgress")), 0.5),
                "morphSourceSlotId": routing.get("morph_source_channel_key") or routing.get("morphSourceChannelId"),
                "morphTargetSlotId": routing.get("morph_target_channel_key") or routing.get("morphTargetChannelId"),
                "seriesOrder": list(routing.get("series_order") or routing.get("seriesOrder") or []),
            },
            "activeFlowIndex": int(detail.get("active_channel_index", 0) or 0),
            "chains": chain_map,
        }

    async def _get_snapshot_model(self, snapshot_id: int) -> Optional[Snapshot]:
        result = await self.session.execute(
            select(Snapshot)
            .options(
                selectinload(Snapshot.channels),
                selectinload(Snapshot.chains).selectinload(SnapshotChain.plugins),
                selectinload(Snapshot.chains).selectinload(SnapshotChain.loop_insertions),
                selectinload(Snapshot.routing),
                selectinload(Snapshot.midi_map),
                selectinload(Snapshot.deployments).selectinload(SnapshotDeployment.history),
            )
            .execution_options(populate_existing=True)
            .where(Snapshot.id == snapshot_id)
        )
        return result.scalar_one_or_none()

    async def _reload_snapshot_detail(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        self.session.expire_all()
        return await self.get_snapshot(snapshot_id)

    async def _reload_snapshot_summary(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        self.session.expire_all()
        snapshot = await self._get_snapshot_model(snapshot_id)
        return self._serialize_snapshot_summary(snapshot) if snapshot is not None else None

    async def _get_channel(self, snapshot_id: int, channel_id: int) -> Optional[SnapshotChannel]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        return next((item for item in snapshot.channels if item.id == channel_id), None)

    async def _get_chain(self, snapshot_id: int, chain_id: int) -> Optional[SnapshotChain]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        return next((item for item in snapshot.chains if item.id == chain_id), None)

    async def _get_plugin(self, snapshot_id: int, chain_id: int, plugin_id: int) -> Optional[SnapshotChainPlugin]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        return next((item for item in chain.plugins if item.id == plugin_id), None)

    async def _validate_program_number(
        self,
        program_number: Optional[int],
        *,
        exclude_snapshot_id: Optional[int] = None,
    ) -> None:
        if program_number is None:
            return
        if program_number < 0 or program_number > 127:
            raise ValueError("Program number must be 0-127")

        stmt = select(Snapshot).where(Snapshot.program_number == program_number)
        if exclude_snapshot_id is not None:
            stmt = stmt.where(Snapshot.id != exclude_snapshot_id)
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing is not None:
            raise ValueError(f"Program number {program_number} already mapped")

    async def _get_max_display_order(self) -> int:
        result = await self.session.execute(select(Snapshot.display_order).order_by(Snapshot.display_order.desc()).limit(1))
        return int(result.scalar_one_or_none() or 0)

    @staticmethod
    def _snapshot_document_type(snapshot: Snapshot) -> str:
        document = snapshot.document if isinstance(snapshot.document, dict) else {}
        return SnapshotPersistenceMixin._snapshot_document_type_from_document(document)

    @staticmethod
    def _snapshot_document_type_from_document(document: Any) -> str:
        document = document if isinstance(document, dict) else {}
        meta = document.get("meta") if isinstance(document.get("meta"), dict) else {}
        document_type = str(meta.get("type") or "snapshot").strip().lower()
        return "template" if document_type == "template" else "snapshot"

    async def _persist_snapshot_document(
        self,
        snapshot: Snapshot,
        normalized: dict[str, Any],
        *,
        document_type: str = "snapshot",
    ) -> None:
        await self.state_authority_documents.persist_snapshot_document(
            snapshot,
            normalized,
            document_type=document_type,
        )

    async def _replace_snapshot_state(self, snapshot: Snapshot, normalized: dict[str, Any]) -> None:
        snapshot.extensions_payload = copy.deepcopy(normalized.get("extensions") or {})
        await self.session.execute(delete(SnapshotChannel).where(SnapshotChannel.snapshot_id == snapshot.id))
        await self.session.execute(delete(SnapshotRouting).where(SnapshotRouting.snapshot_id == snapshot.id))
        await self.session.execute(delete(SnapshotMidiMap).where(SnapshotMidiMap.snapshot_id == snapshot.id))
        await self.session.execute(delete(SnapshotChain).where(SnapshotChain.snapshot_id == snapshot.id))
        await self.session.flush()

        chain_rows: dict[str, SnapshotChain] = {}
        for index, chain_payload in enumerate(normalized["chains"]):
            chain = SnapshotChain(
                snapshot_id=snapshot.id,
                name=chain_payload["name"],
                order_index=index,
            )
            self.session.add(chain)
            await self.session.flush()
            chain_rows[chain_payload["source_key"]] = chain

            for plugin_index, plugin_payload in enumerate(chain_payload["plugins"]):
                self.session.add(
                    SnapshotChainPlugin(
                        snapshot_chain_id=chain.id,
                        plugin_uri=plugin_payload["uri"],
                        plugin_name=plugin_payload.get("name"),
                        position=plugin_index,
                        bypass=bool(plugin_payload.get("bypass", False)),
                        parameters=dict(plugin_payload.get("parameters") or {}),
                        loader_state=dict(plugin_payload.get("loader_state") or {}),
                        is_placeholder=bool(plugin_payload.get("is_placeholder", False)),
                    )
                )

            for loop_payload in chain_payload["loop_insertions"]:
                self.session.add(
                    SnapshotLoopInsertion(
                        snapshot_chain_id=chain.id,
                        insertion_id=loop_payload.get("insertion_id"),
                        loop_id=loop_payload.get("loop_id"),
                        slot_index=int(loop_payload.get("slot_index", 0)),
                        enabled=bool(loop_payload.get("enabled", True)),
                        mode=str(loop_payload.get("mode") or "serial_insert"),
                        blend_pct=_safe_float(loop_payload.get("blend_pct"), 100.0),
                        send_gain_db=_safe_float(loop_payload.get("send_gain_db"), 0.0),
                        return_gain_db=_safe_float(loop_payload.get("return_gain_db"), 0.0),
                        crossfade_ms=int(_safe_int(loop_payload.get("crossfade_ms")) or 12),
                        band_split_hz=list(loop_payload.get("band_split_hz") or []),
                    )
                )

        for index, channel_payload in enumerate(normalized["channels"]):
            channel = SnapshotChannel(
                snapshot_id=snapshot.id,
                chain_id=chain_rows.get(channel_payload["chain_ref"]).id if channel_payload["chain_ref"] in chain_rows else None,
                channel_key=channel_payload["channel_key"],
                label=channel_payload["label"],
                color=channel_payload["color"],
                muted=channel_payload["muted"],
                solo=channel_payload["solo"],
                dry_wet_mix=channel_payload["dry_wet_mix"],
                order_index=index,
            )
            self.session.add(channel)

        routing_payload = normalized["routing"]
        self.session.add(
            SnapshotRouting(
                snapshot_id=snapshot.id,
                mode=routing_payload["mode"],
                active_channel_key=routing_payload["active_channel_key"],
                blend_positions=dict(routing_payload["blend_positions"]),
                morph_position=routing_payload["morph_position"],
                morph_source_channel_key=routing_payload["morph_source_channel_key"],
                morph_target_channel_key=routing_payload["morph_target_channel_key"],
                series_order=list(routing_payload["series_order"]),
            )
        )
        self.session.add(
            SnapshotMidiMap(
                snapshot_id=snapshot.id,
                entries=[dict(entry) for entry in normalized["midi_map"]],
            )
        )
        await self.session.flush()

    def _normalize_detail_payload(self, detail_payload: dict[str, Any]) -> dict[str, Any]:
        payload = copy.deepcopy(detail_payload or {})

        raw_chains = payload.get("chains", [])
        normalized_chains: list[dict[str, Any]] = []
        chain_by_ref: dict[str, dict[str, Any]] = {}
        if isinstance(raw_chains, dict):
            chain_items = list(raw_chains.items())
        elif isinstance(raw_chains, list):
            chain_items = [
                (
                    str(item.get("source_key") or item.get("id") or f"chain-{index}"),
                    item,
                )
                for index, item in enumerate(raw_chains)
                if isinstance(item, dict)
            ]
        else:
            chain_items = []

        seen_chain_refs: set[str] = set()
        for index, (source_key, raw_chain) in enumerate(chain_items):
            if not isinstance(raw_chain, dict):
                continue
            chain_key = str(source_key)
            seen_chain_refs.add(chain_key)
            plugins: list[dict[str, Any]] = []
            for plugin_index, raw_plugin in enumerate(raw_chain.get("plugins", []) or []):
                if not isinstance(raw_plugin, dict):
                    continue
                uri = str(raw_plugin.get("uri") or raw_plugin.get("plugin_uri") or "").strip()
                if not uri:
                    continue
                plugins.append(
                    {
                        "uri": uri,
                        "name": raw_plugin.get("name"),
                        "position": plugin_index,
                        "bypass": bool(raw_plugin.get("bypass", raw_plugin.get("bypassed", False))),
                        "parameters": {
                            str(key): float(value)
                            for key, value in dict(raw_plugin.get("parameters") or {}).items()
                            if isinstance(key, str) and isinstance(value, (int, float))
                        },
                        "loader_state": dict(raw_plugin.get("loader_state") or {}),
                        "is_placeholder": bool(raw_plugin.get("is_placeholder", False)) or not _plugin_available(uri),
                    }
                )

            loop_insertions = [
                dict(item)
                for item in (raw_chain.get("loop_insertions") or [])
                if isinstance(item, dict)
            ]
            normalized_chains.append(
                {
                    "source_key": chain_key,
                    "name": str(raw_chain.get("name") or f"Chain {index + 1}"),
                    "plugins": plugins,
                    "loop_insertions": loop_insertions,
                }
            )
            chain_by_ref[chain_key] = normalized_chains[-1]

        raw_paths = payload.get("paths", []) or []
        normalized_paths: list[dict[str, Any]] = []
        next_path_chain_ref = len(normalized_chains)
        for index, raw_path in enumerate(raw_paths):
            if not isinstance(raw_path, dict):
                continue

            path_plugins: list[dict[str, Any]] = []
            for plugin_index, raw_plugin in enumerate(raw_path.get("plugins", []) or []):
                if not isinstance(raw_plugin, dict):
                    continue
                uri = str(raw_plugin.get("uri") or raw_plugin.get("plugin_uri") or "").strip()
                if not uri:
                    continue
                path_plugins.append(
                    {
                        "uri": uri,
                        "name": raw_plugin.get("name"),
                        "position": plugin_index,
                        "bypass": bool(raw_plugin.get("bypass", raw_plugin.get("bypassed", False))),
                        "parameters": {
                            str(key): float(value)
                            for key, value in dict(raw_plugin.get("parameters") or {}).items()
                            if isinstance(key, str) and isinstance(value, (int, float))
                        },
                        "loader_state": dict(raw_plugin.get("loader_state") or {}),
                        "is_placeholder": bool(raw_plugin.get("is_placeholder", False)) or not _plugin_available(uri),
                    }
                )

            path_chain_ref_value = (
                raw_path.get("snapshot_chain_id")
                if raw_path.get("snapshot_chain_id") is not None
                else raw_path.get("runtime_chain_id")
            )
            if path_chain_ref_value is None:
                next_path_chain_ref += 1
                path_chain_ref = f"path:{raw_path.get('id') or index}:{next_path_chain_ref}"
            else:
                path_chain_ref = str(path_chain_ref_value)

            normalized_paths.append(
                {
                    "channel_key": str(raw_path.get("id") or f"path-{index}"),
                    "label": str(raw_path.get("label") or raw_path.get("name") or _stable_channel_label(index)),
                    "color": str(raw_path.get("color") or DEFAULT_CHANNEL_COLOR),
                    "muted": _normalize_bool(raw_path.get("muted"), False),
                    "solo": _normalize_bool(raw_path.get("solo"), False),
                    "dry_wet_mix": _safe_float(raw_path.get("dry_wet_mix", raw_path.get("dryWetMix")), DEFAULT_DRY_WET_MIX),
                    "chain_ref": path_chain_ref,
                    "chain_name": str(raw_path.get("name") or raw_path.get("label") or f"Path {index + 1}"),
                    "plugins": path_plugins,
                    "loop_insertions": [
                        dict(item)
                        for item in (raw_path.get("loop_insertions") or [])
                        if isinstance(item, dict)
                    ],
                }
            )

            if path_chain_ref not in seen_chain_refs:
                normalized_chains.append(
                    {
                        "source_key": path_chain_ref,
                        "name": normalized_paths[-1]["chain_name"],
                        "plugins": path_plugins,
                        "loop_insertions": normalized_paths[-1]["loop_insertions"],
                    }
                )
                seen_chain_refs.add(path_chain_ref)
                chain_by_ref[path_chain_ref] = normalized_chains[-1]
            else:
                existing_chain = chain_by_ref.get(path_chain_ref)
                if existing_chain is not None:
                    if not existing_chain.get("plugins") and path_plugins:
                        existing_chain["plugins"] = path_plugins
                    if not existing_chain.get("loop_insertions") and normalized_paths[-1]["loop_insertions"]:
                        existing_chain["loop_insertions"] = normalized_paths[-1]["loop_insertions"]
                    if existing_chain.get("name", "").startswith("Chain "):
                        existing_chain["name"] = normalized_paths[-1]["chain_name"]

        raw_channels = payload.get("channels", payload.get("flowSlots", [])) or []
        normalized_channels: list[dict[str, Any]] = []
        for index, raw_channel in enumerate(raw_channels):
            if not isinstance(raw_channel, dict):
                continue
            chain_ref_value = raw_channel.get("chain_ref")
            if chain_ref_value is None:
                chain_ref_value = raw_channel.get("chain_id", raw_channel.get("chainId"))
            chain_ref = str(chain_ref_value) if chain_ref_value is not None else None
            if chain_ref is not None and chain_ref not in seen_chain_refs:
                normalized_chains.append(
                    {
                        "source_key": chain_ref,
                        "name": f"Chain {chain_ref}",
                        "plugins": [],
                        "loop_insertions": [],
                    }
                )
                seen_chain_refs.add(chain_ref)

            normalized_channels.append(
                {
                    "channel_key": str(raw_channel.get("channel_key") or raw_channel.get("id") or f"channel-{index}"),
                    "label": str(raw_channel.get("label") or _stable_channel_label(index)),
                    "color": str(raw_channel.get("color") or DEFAULT_CHANNEL_COLOR),
                    "muted": _normalize_bool(raw_channel.get("muted"), False),
                    "solo": _normalize_bool(raw_channel.get("solo"), False),
                    "dry_wet_mix": _safe_float(raw_channel.get("dry_wet_mix", raw_channel.get("dryWetMix")), DEFAULT_DRY_WET_MIX),
                    "chain_ref": chain_ref,
                }
            )

        path_by_channel_key = {
            path["channel_key"]: path
            for path in normalized_paths
        }
        if normalized_channels:
            for channel in normalized_channels:
                matching_path = path_by_channel_key.get(channel["channel_key"])
                if matching_path is None:
                    continue
                if channel["chain_ref"] is None:
                    channel["chain_ref"] = matching_path["chain_ref"]
                if not channel.get("label"):
                    channel["label"] = matching_path["label"]
        else:
            normalized_channels = [
                {
                    "channel_key": path["channel_key"],
                    "label": path["label"],
                    "color": path["color"],
                    "muted": path["muted"],
                    "solo": path["solo"],
                    "dry_wet_mix": path["dry_wet_mix"],
                    "chain_ref": path["chain_ref"],
                }
                for path in normalized_paths
            ]

        if not normalized_channels:
            normalized_channels.append(
                {
                    "channel_key": "channel-0",
                    "label": "A",
                    "color": DEFAULT_CHANNEL_COLOR,
                    "muted": False,
                    "solo": False,
                    "dry_wet_mix": DEFAULT_DRY_WET_MIX,
                    "chain_ref": None,
                }
            )

        raw_routing = payload.get("routing") if isinstance(payload.get("routing"), dict) else {}
        preferred_solo_channel_key = (
            raw_routing.get("active_channel_key")
            or raw_routing.get("activeChannelId")
            or raw_routing.get("activeSlotId")
        )
        normalized_channels = _enforce_single_solo_channel(
            normalized_channels,
            preferred_channel_key=str(preferred_solo_channel_key) if preferred_solo_channel_key else None,
        )
        active_channel_key = (
            raw_routing.get("active_channel_key")
            or raw_routing.get("activeChannelId")
            or raw_routing.get("activeSlotId")
            or normalized_channels[0]["channel_key"]
        )
        normalized_routing = {
            "mode": _normalize_mode(raw_routing.get("mode")),
            "active_channel_key": str(active_channel_key) if active_channel_key else None,
            "blend_positions": dict(raw_routing.get("blend_positions") or raw_routing.get("blendPositions") or {}),
            "morph_position": _safe_float(raw_routing.get("morph_position", raw_routing.get("morphProgress")), 0.5),
            "morph_source_channel_key": (
                raw_routing.get("morph_source_channel_key")
                or raw_routing.get("morphSourceChannelId")
                or raw_routing.get("morphSourceSlotId")
            ),
            "morph_target_channel_key": (
                raw_routing.get("morph_target_channel_key")
                or raw_routing.get("morphTargetChannelId")
                or raw_routing.get("morphTargetSlotId")
            ),
            "series_order": list(raw_routing.get("series_order") or raw_routing.get("seriesOrder") or []),
        }

        midi_map = payload.get("midi_map", payload.get("midiMap", [])) or []
        normalized_midi_map = [dict(entry) for entry in midi_map if isinstance(entry, dict)]

        return {
            "channels": normalized_channels,
            "chains": normalized_chains,
            "routing": normalized_routing,
            "midi_map": normalized_midi_map,
            "extensions": copy.deepcopy(payload.get("extensions") or {})
            if isinstance(payload.get("extensions"), dict)
            else {},
        }

    async def _enrich_normalized_payload(self, normalized: dict[str, Any]) -> dict[str, Any]:
        detail = self._normalized_to_detail(normalized, snapshot_row=None)
        try:
            legacy_payload = self.to_legacy_snapshot_data(detail)
            enriched = await snapshot_runtime_service.enrich_snapshot_data(copy.deepcopy(legacy_payload))
            enriched_normalized = self._normalize_detail_payload(enriched)
            preserved_chain_state = {
                str(chain.get("source_key")): {
                    "loop_insertions": [dict(item) for item in chain.get("loop_insertions", []) if isinstance(item, dict)],
                    "effects_loops": [dict(item) for item in chain.get("effects_loops", []) if isinstance(item, dict)],
                }
                for chain in normalized.get("chains", [])
                if isinstance(chain, dict) and chain.get("source_key") is not None
            }
            for chain in enriched_normalized.get("chains", []):
                if not isinstance(chain, dict):
                    continue
                preserved = preserved_chain_state.get(str(chain.get("source_key")))
                if not isinstance(preserved, dict):
                    continue
                if preserved.get("loop_insertions"):
                    chain["loop_insertions"] = [dict(item) for item in preserved["loop_insertions"]]
                if preserved.get("effects_loops"):
                    chain["effects_loops"] = [dict(item) for item in preserved["effects_loops"]]
            enriched_normalized["midi_map"] = [dict(entry) for entry in normalized.get("midi_map", [])]
            enriched_normalized["extensions"] = copy.deepcopy(normalized.get("extensions") or {})
            return enriched_normalized
        except Exception as exc:
            logger.debug("Snapshot enrichment skipped runtime refresh: %s", exc)
            return normalized

    async def _serialize_snapshot_detail(
        self,
        snapshot: Snapshot,
        *,
        compatibility_live_state_payload: dict[str, Any] | None = None,
        compatibility_is_live: bool = False,
        compatibility_activated_at: datetime | None = None,
    ) -> dict[str, Any]:
        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        normalized = await self._snapshot_to_normalized(snapshot)
        detail = self._normalized_to_detail(normalized, snapshot)
        latest_revision_result = await self.session.execute(
            select(SnapshotRevision.revision_number)
            .where(SnapshotRevision.snapshot_id == int(snapshot.id))
            .order_by(SnapshotRevision.revision_number.desc(), SnapshotRevision.id.desc())
            .limit(1)
        )
        latest_revision_number = latest_revision_result.scalar_one_or_none()
        runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
        runtime_payload = runtime_state.get("live_snapshot_payload")
        runtime_live_paths: list[dict[str, Any]] = []
        if (
            runtime_state.get("state") == "live"
            and int(runtime_state.get("snapshot_id") or 0) == int(snapshot.id)
            and isinstance(runtime_payload, dict)
        ):
            live_state_payload = runtime_payload.get("live_state")
            if isinstance(live_state_payload, dict):
                runtime_live_paths = [
                    dict(item)
                    for item in live_state_payload.get("paths", [])
                    if isinstance(item, dict)
                ]
            elif isinstance(runtime_payload.get("paths"), list):
                runtime_live_paths = [
                    {
                        "path_id": item.get("id"),
                        "runtime_chain_id": item.get("runtime_chain_id"),
                    }
                    for item in runtime_payload.get("paths", [])
                    if isinstance(item, dict) and item.get("id") is not None
                ]
        detail["snapshot_revision"] = self._snapshot_revision_from_normalized(normalized)
        detail["revision_number"] = int(latest_revision_number) if latest_revision_number is not None else None
        detail["controls"] = self._normalize_controls_payload(
            snapshot.controls_payload if isinstance(snapshot.controls_payload, dict) else None,
            detail,
        )
        detail["io_bindings"] = {
            "input_device": snapshot.input_device,
            "output_device": snapshot.output_device,
            "monitoring_output_index": detail["controls"].get("monitoring_output_index"),
            "remap_required": False,
        }
        detail["lineage"] = {
            "derived_from_snapshot_id": snapshot.derived_from_snapshot_id,
        }
        detail["is_locked"] = bool(snapshot.is_locked)
        detail["assets"] = self._build_asset_manifest(detail)
        detail["paths"] = self._build_snapshot_paths(
            detail,
            runtime_live_paths,
            compatibility_live_state_payload=compatibility_live_state_payload,
        )
        detail["live_state"] = await self._build_live_state(
            snapshot,
            runtime_state=runtime_state,
            compatibility_live_state_payload=compatibility_live_state_payload,
            compatibility_is_live=compatibility_is_live,
            compatibility_activated_at=compatibility_activated_at,
        )
        is_runtime_live_snapshot = bool(
            runtime_state.get("state") == "live"
            and int(runtime_state.get("snapshot_id") or 0) == int(snapshot.id)
        )
        if is_runtime_live_snapshot:
            runtime_activated_at = None
            if isinstance(runtime_payload, dict):
                live_state_payload = runtime_payload.get("live_state")
                if isinstance(live_state_payload, dict):
                    runtime_activated_at = str(live_state_payload.get("activated_at") or "").strip() or None
            detail["activated_at"] = runtime_activated_at or str(runtime_state.get("emitted_at") or "").strip() or None
            tempo_status = self._tempo_status_for_snapshot(snapshot, is_active=True)
            detail["tempo_bpm"] = tempo_status["stored_tempo_bpm"]
            detail["live_tempo_bpm"] = tempo_status["live_tempo_bpm"]
            detail["active_tempo_bpm"] = tempo_status["active_tempo_bpm"]
            detail["tempo_source"] = tempo_status["tempo_source"]
            detail["tempo_updated_at"] = tempo_status["updated_at"]
        return detail

    async def _snapshot_name_exists(
        self,
        name: str,
        *,
        exclude_snapshot_id: Optional[int] = None,
    ) -> bool:
        statement = select(Snapshot.id).where(func.lower(Snapshot.name) == name.lower())
        if exclude_snapshot_id is not None:
            statement = statement.where(Snapshot.id != exclude_snapshot_id)
        result = await self.session.execute(statement.limit(1))
        return result.scalar_one_or_none() is not None

    async def _build_duplicate_snapshot_name(
        self,
        source_name: Any,
        *,
        exclude_snapshot_id: Optional[int] = None,
    ) -> str:
        base_name = f"{sanitize_snapshot_name_seed(source_name)}copy"
        candidate = base_name
        suffix = 2
        while await self._snapshot_name_exists(candidate, exclude_snapshot_id=exclude_snapshot_id):
            candidate = f"{base_name}{suffix}"
            suffix += 1
        return candidate

    def _build_snapshot_paths(
        self,
        detail: dict[str, Any],
        runtime_live_paths: list[dict[str, Any]] | None = None,
        *,
        compatibility_live_state_payload: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        chain_by_id = {
            chain.get("id"): chain
            for chain in detail.get("chains", [])
            if chain.get("id") is not None
        }
        if not runtime_live_paths and isinstance(compatibility_live_state_payload, dict):
            runtime_live_paths = [
                dict(item)
                for item in compatibility_live_state_payload.get("paths", [])
                if isinstance(item, dict)
            ]
        live_paths = {
            str(item.get("path_id")): item
            for item in (runtime_live_paths or [])
            if isinstance(item, dict) and item.get("path_id") is not None
        }

        paths: list[dict[str, Any]] = []
        for channel in detail.get("channels", []):
            chain_id = channel.get("chain_id")
            chain = chain_by_id.get(chain_id)
            live_path = live_paths.get(str(channel.get("channel_key")))
            paths.append(
                {
                    "id": channel.get("channel_key"),
                    "name": chain.get("name") if isinstance(chain, dict) else f"Path {channel.get('label') or channel.get('channel_key')}",
                    "label": channel.get("label"),
                    "color": channel.get("color"),
                    "muted": bool(channel.get("muted", False)),
                    "solo": bool(channel.get("solo", False)),
                    "dry_wet_mix": _safe_float(channel.get("dry_wet_mix"), DEFAULT_DRY_WET_MIX),
                    "order_index": channel.get("order_index", 0),
                    "snapshot_chain_id": chain_id,
                    "runtime_chain_id": live_path.get("runtime_chain_id") if isinstance(live_path, dict) else None,
                    "plugins": list(chain.get("plugins", [])) if isinstance(chain, dict) else [],
                    "loop_insertions": list(chain.get("loop_insertions", [])) if isinstance(chain, dict) else [],
                    "effects_loops": list(chain.get("effects_loops", [])) if isinstance(chain, dict) else [],
                }
            )
        return paths

    async def _snapshot_to_normalized(
        self,
        snapshot: Snapshot,
        *,
        prefer_document: bool = True,
    ) -> dict[str, Any]:
        if (
            prefer_document
            and isinstance(snapshot.document, dict)
            and snapshot.document.get("version") == SNAPSHOT_GRAPH_VERSION
        ):
            return await self.state_authority_documents.document_to_normalized(snapshot.document)

        has_relational_projection = bool(snapshot.chains or snapshot.channels or snapshot.routing or snapshot.midi_map)
        if (
            not has_relational_projection
            and isinstance(snapshot.document, dict)
            and snapshot.document.get("version") == SNAPSHOT_GRAPH_VERSION
        ):
            return await self.state_authority_documents.document_to_normalized(snapshot.document)

        loop_ids = {
            loop.loop_id
            for chain in snapshot.chains
            for loop in chain.loop_insertions
            if loop.loop_id
        }
        effects_loop_map: dict[str, dict[str, Any]] = {}
        if loop_ids:
            result = await self.session.execute(select(EffectsLoop).where(EffectsLoop.loop_id.in_(sorted(loop_ids))))
            effects_loops = result.scalars().all()
            effects_loop_map = {
                loop.loop_id: ChainService._serialize_effects_loop(loop)
                for loop in effects_loops
            }

        chains: list[dict[str, Any]] = []
        for chain in snapshot.chains:
            plugins: list[dict[str, Any]] = []
            for plugin in sorted(chain.plugins, key=lambda item: int(item.position)):
                metadata = self.chain_service._get_plugin_metadata(plugin.plugin_uri)
                plugins.append(
                    {
                        "uri": plugin.plugin_uri,
                        "name": plugin.plugin_name or metadata.get("name", plugin.plugin_uri),
                        "position": int(plugin.position),
                        "bypass": bool(plugin.bypass),
                        "parameters": dict(plugin.parameters or {}),
                        "loader_state": dict(plugin.loader_state or {}),
                        "is_placeholder": bool(plugin.is_placeholder),
                    }
                )

            chains.append(
                {
                    "source_key": str(chain.id),
                    "id": chain.id,
                    "name": chain.name,
                    "plugins": plugins,
                    "loop_insertions": [
                        ChainService._serialize_loop_insertion(loop)
                        for loop in sorted(chain.loop_insertions, key=lambda item: int(item.slot_index))
                    ],
                    "effects_loops": [
                        effects_loop_map[loop.loop_id]
                        for loop in sorted(chain.loop_insertions, key=lambda item: int(item.slot_index))
                        if loop.loop_id in effects_loop_map
                    ],
                }
            )

        routing = snapshot.routing or SnapshotRouting(
            snapshot_id=snapshot.id,
            mode="parallel_blend",
            active_channel_key=snapshot.channels[0].channel_key if snapshot.channels else None,
            blend_positions={},
            morph_position=0.5,
            morph_source_channel_key=None,
            morph_target_channel_key=None,
            series_order=[],
        )

        return {
            "channels": [
                {
                    "id": channel.id,
                    "channel_key": channel.channel_key,
                    "label": channel.label,
                    "color": channel.color,
                    "muted": bool(channel.muted),
                    "solo": bool(channel.solo),
                    "dry_wet_mix": float(channel.dry_wet_mix),
                    "order_index": int(channel.order_index),
                    "chain_ref": str(channel.chain_id) if channel.chain_id is not None else None,
                }
                for channel in sorted(snapshot.channels, key=lambda item: int(item.order_index))
            ],
            "chains": chains,
            "routing": {
                "mode": routing.mode,
                "active_channel_key": routing.active_channel_key,
                "blend_positions": dict(routing.blend_positions or {}),
                "morph_position": float(routing.morph_position),
                "morph_source_channel_key": routing.morph_source_channel_key,
                "morph_target_channel_key": routing.morph_target_channel_key,
                "series_order": list(routing.series_order or []),
            },
            "midi_map": [dict(entry) for entry in (snapshot.midi_map.entries if snapshot.midi_map else [])],
            "input_device": snapshot.input_device,
            "output_device": snapshot.output_device,
            "extensions": (
                copy.deepcopy(snapshot.extensions_payload)
                if isinstance(snapshot.extensions_payload, dict)
                else {}
            ),
        }

    async def _sync_snapshot_document_from_relational_projection(
        self,
        snapshot_id: int,
    ) -> None:
        """Rebuild the canonical document from compatibility rows after legacy mutations."""
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return
        normalized = await self._snapshot_to_normalized(snapshot, prefer_document=False)
        await self._persist_snapshot_document(
            snapshot,
            normalized,
            document_type=self._snapshot_document_type(snapshot),
        )
        await self.session.flush()

    def _canonicalize_snapshot_normalized(self, normalized: dict[str, Any]) -> dict[str, Any]:
        chain_index_by_source_key = {
            str(chain.get("source_key") or index): index
            for index, chain in enumerate(normalized.get("chains", []))
        }

        canonical_chains: list[dict[str, Any]] = []
        for chain in normalized.get("chains", []):
            plugins = []
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue
                plugins.append(
                    {
                        "uri": str(plugin.get("uri") or ""),
                        "name": plugin.get("name"),
                        "position": int(plugin.get("position", 0)),
                        "bypass": bool(plugin.get("bypass", False)),
                        "parameters": _canonicalize_json_value(plugin.get("parameters") or {}),
                        "loader_state": _canonicalize_json_value(plugin.get("loader_state") or {}),
                        "is_placeholder": bool(plugin.get("is_placeholder", False)),
                    }
                )

            loop_insertions = []
            for loop in chain.get("loop_insertions", []):
                if not isinstance(loop, dict):
                    continue
                loop_insertions.append(
                    {
                        key: _canonicalize_json_value(value)
                        for key, value in sorted(loop.items())
                        if key not in (_CANONICAL_TRANSIENT_KEYS | {"insertion_id"})
                    }
                )

            effects_loops = []
            for loop in chain.get("effects_loops", []):
                if not isinstance(loop, dict):
                    continue
                effects_loops.append(
                    {
                        key: _canonicalize_json_value(loop.get(key))
                        for key in sorted(_CANONICAL_EFFECTS_LOOP_KEYS)
                        if key in loop
                    }
                )

            canonical_chains.append(
                {
                    "name": chain.get("name"),
                    "plugins": plugins,
                    "loop_insertions": loop_insertions,
                    "effects_loops": effects_loops,
                }
            )

        canonical_channels = []
        for index, channel in enumerate(normalized.get("channels", [])):
            if not isinstance(channel, dict):
                continue
            canonical_channels.append(
                {
                    "channel_key": channel.get("channel_key"),
                    "label": channel.get("label"),
                    "color": channel.get("color"),
                    "muted": bool(channel.get("muted", False)),
                    "solo": bool(channel.get("solo", False)),
                    "dry_wet_mix": _safe_float(channel.get("dry_wet_mix"), DEFAULT_DRY_WET_MIX),
                    "order_index": int(channel.get("order_index", index)),
                    "chain_index": (
                        chain_index_by_source_key.get(str(channel.get("chain_ref")))
                        if channel.get("chain_ref") is not None
                        else None
                    ),
                }
            )

        return {
            "channels": canonical_channels,
            "chains": canonical_chains,
            "routing": _canonicalize_json_value(normalized.get("routing") or {}),
            "midi_map": _canonicalize_json_value(normalized.get("midi_map") or []),
            "input_device": normalized.get("input_device"),
            "output_device": normalized.get("output_device"),
            "extensions": _canonicalize_json_value(normalized.get("extensions") or {}),
        }

    def _snapshot_revision_from_normalized(self, normalized: dict[str, Any]) -> str:
        canonical = self._canonicalize_snapshot_normalized(normalized)
        encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        return hashlib.sha256(encoded.encode("ascii")).hexdigest()

    def _tempo_status_for_snapshot(
        self,
        snapshot_row: Optional[Snapshot],
        *,
        snapshot_id: Optional[int] = None,
        stored_tempo_bpm: Any = DEFAULT_SNAPSHOT_TEMPO_BPM,
        is_active: Optional[bool] = None,
    ) -> dict[str, Any]:
        resolved_snapshot_id = snapshot_row.id if snapshot_row is not None else snapshot_id
        resolved_stored_bpm = (
            snapshot_row.tempo_bpm
            if snapshot_row is not None and snapshot_row.tempo_bpm is not None
            else stored_tempo_bpm
        )
        resolved_is_active = bool(is_active) if is_active is not None else False
        try:
            from app.services.snapshot_tempo_service import get_snapshot_tempo_service

            return get_snapshot_tempo_service().get_status(
                snapshot_id=resolved_snapshot_id,
                stored_tempo_bpm=resolved_stored_bpm,
                is_active=resolved_is_active,
            )
        except Exception as exc:
            logger.debug("Snapshot tempo status lookup skipped for %s: %s", resolved_snapshot_id, exc)
            fallback_bpm = _safe_float(resolved_stored_bpm, DEFAULT_SNAPSHOT_TEMPO_BPM)
            return {
                "snapshot_id": resolved_snapshot_id,
                "stored_tempo_bpm": fallback_bpm,
                "live_tempo_bpm": None,
                "active_tempo_bpm": fallback_bpm,
                "tempo_source": "stored",
                "is_live_override_active": False,
                "updated_at": None,
                "tap_count": 0,
            }

    def _normalized_to_detail(
        self,
        normalized: dict[str, Any],
        snapshot_row: Optional[Snapshot],
    ) -> dict[str, Any]:
        chain_entries = normalized["chains"]
        channels = normalized["channels"]
        ordered_snapshot_chains = (
            sorted(snapshot_row.chains, key=lambda item: int(item.order_index))
            if snapshot_row is not None
            else []
        )
        ordered_snapshot_channels = (
            sorted(snapshot_row.channels, key=lambda item: int(item.order_index))
            if snapshot_row is not None
            else []
        )
        channel_key_to_index = {
            channel["channel_key"]: index
            for index, channel in enumerate(channels)
        }

        chain_ids_by_ref: dict[str, Optional[int]] = {}
        chains_payload: list[dict[str, Any]] = []
        next_generated_chain_id = max(
            [int(chain.get("id")) for chain in chain_entries if chain.get("id") is not None] or [0]
        )
        for index, chain in enumerate(chain_entries):
            chain_id = (
                ordered_snapshot_chains[index].id
                if index < len(ordered_snapshot_chains)
                else chain.get("id")
            )
            if chain_id is None:
                next_generated_chain_id += 1
                chain_id = next_generated_chain_id
            chain_ids_by_ref[chain["source_key"]] = chain_id
            chains_payload.append(
                {
                    "id": chain_id,
                    "name": chain["name"],
                    "plugins": [
                        {
                            "id": plugin.get("id"),
                            "uri": plugin["uri"],
                            "name": plugin.get("name"),
                            "position": plugin.get("position", plugin_index),
                            "bypass": bool(plugin.get("bypass", False)),
                            "parameters": dict(plugin.get("parameters") or {}),
                            "loader_state": dict(plugin.get("loader_state") or {}),
                            "is_placeholder": bool(plugin.get("is_placeholder", False)),
                        }
                        for plugin_index, plugin in enumerate(chain["plugins"])
                    ],
                    "loop_insertions": [dict(item) for item in chain.get("loop_insertions", [])],
                    "effects_loops": [dict(item) for item in chain.get("effects_loops", [])],
                }
            )

        snapshot_id = snapshot_row.id if snapshot_row is not None else None
        detail_channels: list[dict[str, Any]] = []
        for index, channel in enumerate(channels):
            detail_channels.append(
                {
                    "id": (
                        ordered_snapshot_channels[index].id
                        if index < len(ordered_snapshot_channels)
                        else channel.get("id")
                    ),
                    "snapshot_id": snapshot_id,
                    "channel_key": channel["channel_key"],
                    "label": channel["label"],
                    "color": channel["color"],
                    "muted": bool(channel["muted"]),
                    "solo": bool(channel["solo"]),
                    "dry_wet_mix": float(channel["dry_wet_mix"]),
                    "order_index": index,
                    "chain_id": chain_ids_by_ref.get(channel["chain_ref"]) if channel.get("chain_ref") is not None else None,
                }
            )

        routing = normalized["routing"]
        average_rating = None
        if snapshot_row is not None and snapshot_row.community_rating_count:
            average_rating = float(snapshot_row.community_rating_sum or 0.0) / float(snapshot_row.community_rating_count)
        tempo_status = self._tempo_status_for_snapshot(snapshot_row)
        persisted_extensions = (
            snapshot_row.extensions_payload
            if snapshot_row is not None and isinstance(snapshot_row.extensions_payload, dict)
            else {}
        )

        return {
            "id": snapshot_id,
            "name": snapshot_row.name if snapshot_row is not None else "Unsaved Snapshot",
            "description": snapshot_row.description if snapshot_row is not None else "",
            "tags": list(snapshot_row.tags or []) if snapshot_row is not None else [],
            "program_number": snapshot_row.program_number if snapshot_row is not None else None,
            "tempo_bpm": tempo_status["stored_tempo_bpm"],
            "live_tempo_bpm": tempo_status["live_tempo_bpm"],
            "active_tempo_bpm": tempo_status["active_tempo_bpm"],
            "tempo_source": tempo_status["tempo_source"],
            "tempo_updated_at": tempo_status["updated_at"],
            "output_level_reference_dbfs": (
                float(snapshot_row.output_level_reference_dbfs)
                if snapshot_row is not None and snapshot_row.output_level_reference_dbfs is not None
                else None
            ),
            "output_level_warning_threshold_db": (
                float(snapshot_row.output_level_warning_threshold_db)
                if snapshot_row is not None and snapshot_row.output_level_warning_threshold_db is not None
                else 3.0
            ),
            "input_device": snapshot_row.input_device if snapshot_row is not None else None,
            "output_device": snapshot_row.output_device if snapshot_row is not None else None,
            "is_favorite": bool(snapshot_row.is_favorite) if snapshot_row is not None else False,
            "is_locked": bool(snapshot_row.is_locked) if snapshot_row is not None else False,
            "display_order": int(snapshot_row.display_order) if snapshot_row is not None else 0,
            "channels": detail_channels,
            "chains": chains_payload,
            "routing": {
                "mode": routing["mode"],
                "active_channel_key": routing["active_channel_key"],
                "blend_positions": dict(routing["blend_positions"]),
                "morph_position": float(routing["morph_position"]),
                "morph_source_channel_key": routing["morph_source_channel_key"],
                "morph_target_channel_key": routing["morph_target_channel_key"],
                "series_order": list(routing["series_order"]),
            },
            "midi_map": [dict(entry) for entry in normalized["midi_map"]],
            "extensions": copy.deepcopy(normalized.get("extensions") or persisted_extensions),
            "active_channel_index": channel_key_to_index.get(routing["active_channel_key"], 0),
            "channel_count": len(detail_channels),
            "chain_count": len(chains_payload),
            "document_type": self._snapshot_document_type(snapshot_row) if snapshot_row is not None else "snapshot",
            "community_uuid": snapshot_row.community_uuid if snapshot_row is not None else None,
            "community_shared": bool(snapshot_row.community_shared) if snapshot_row is not None else False,
            "community_author": snapshot_row.community_author if snapshot_row is not None else "Anonymous",
            "community_download_count": int(snapshot_row.community_download_count or 0) if snapshot_row is not None else 0,
            "community_rating": average_rating,
            "community_rating_count": int(snapshot_row.community_rating_count or 0) if snapshot_row is not None else 0,
            "activated_at": snapshot_row.activated_at.isoformat() if snapshot_row is not None and snapshot_row.activated_at else None,
            "created_at": snapshot_row.created_at.isoformat() if snapshot_row is not None and snapshot_row.created_at else None,
            "updated_at": snapshot_row.updated_at.isoformat() if snapshot_row is not None and snapshot_row.updated_at else None,
            "deployments": [self._serialize_deployment(item) for item in (snapshot_row.deployments if snapshot_row is not None else [])],
        }

    def _serialize_snapshot_summary(
        self,
        snapshot: Snapshot,
        *,
        live_snapshot_id: int | None = None,
        live_activated_at: str | None = None,
    ) -> dict[str, Any]:
        document_graph = (
            snapshot.document.get("graph")
            if isinstance(snapshot.document, dict) and snapshot.document.get("version") == SNAPSHOT_GRAPH_VERSION
            else None
        )
        if isinstance(document_graph, dict):
            graph_channels = [
                channel
                for channel in (document_graph.get("channels") or [])
                if isinstance(channel, dict)
            ]
            channel_rows = sorted(snapshot.channels, key=lambda item: int(item.order_index))
            channel_summaries = [
                {
                    "id": channel_rows[index].id if index < len(channel_rows) else channel.get("id"),
                    "channel_key": channel.get("channel_key"),
                    "label": channel.get("label"),
                    "color": channel.get("color"),
                    "chain_id": (
                        channel_rows[index].chain_id
                        if index < len(channel_rows)
                        else channel.get("chain_id", channel.get("chainId", channel.get("chain_ref")))
                    ),
                }
                for index, channel in enumerate(graph_channels)
            ]
            chain_count = len(
                [chain for chain in (document_graph.get("chains") or []) if isinstance(chain, dict)]
            )
        else:
            channel_summaries = [
                {
                    "id": channel.id,
                    "channel_key": channel.channel_key,
                    "label": channel.label,
                    "color": channel.color,
                    "chain_id": channel.chain_id,
                }
                for channel in sorted(snapshot.channels, key=lambda item: int(item.order_index))
            ]
            chain_count = len(snapshot.chains)
        average_rating = None
        if snapshot.community_rating_count:
            average_rating = float(snapshot.community_rating_sum or 0.0) / float(snapshot.community_rating_count)
        is_live_snapshot = live_snapshot_id is not None and int(snapshot.id) == int(live_snapshot_id)
        tempo_status = self._tempo_status_for_snapshot(
            snapshot,
            is_active=is_live_snapshot if live_snapshot_id is not None else None,
        )
        return {
            "id": snapshot.id,
            "name": snapshot.name,
            "description": snapshot.description or "",
            "tags": list(snapshot.tags or []),
            "program_number": snapshot.program_number,
            "tempo_bpm": tempo_status["stored_tempo_bpm"],
            "live_tempo_bpm": tempo_status["live_tempo_bpm"],
            "active_tempo_bpm": tempo_status["active_tempo_bpm"],
            "tempo_source": tempo_status["tempo_source"],
            "tempo_updated_at": tempo_status["updated_at"],
            "output_level_reference_dbfs": (
                float(snapshot.output_level_reference_dbfs)
                if snapshot.output_level_reference_dbfs is not None
                else None
            ),
            "output_level_warning_threshold_db": (
                float(snapshot.output_level_warning_threshold_db)
                if snapshot.output_level_warning_threshold_db is not None
                else 3.0
            ),
            "input_device": snapshot.input_device,
            "output_device": snapshot.output_device,
            "io_bindings": {
                "input_device": snapshot.input_device,
                "output_device": snapshot.output_device,
                "monitoring_output_index": self._normalize_controls_payload(
                    snapshot.controls_payload if isinstance(snapshot.controls_payload, dict) else None,
                    None,
                ).get("monitoring_output_index"),
                "remap_required": False,
            },
            "lineage": {
                "derived_from_snapshot_id": snapshot.derived_from_snapshot_id,
            },
            "is_favorite": bool(snapshot.is_favorite),
            "is_locked": bool(snapshot.is_locked),
            "display_order": int(snapshot.display_order),
            "channels": channel_summaries,
            "channel_count": len(channel_summaries),
            "chain_count": chain_count,
            "document_type": self._snapshot_document_type(snapshot),
            "community_uuid": snapshot.community_uuid,
            "community_shared": bool(snapshot.community_shared),
            "community_author": snapshot.community_author,
            "community_download_count": int(snapshot.community_download_count or 0),
            "community_rating": average_rating,
            "community_rating_count": int(snapshot.community_rating_count or 0),
            "activated_at": (
                live_activated_at
                if is_live_snapshot and live_activated_at is not None
                else (snapshot.activated_at.isoformat() if snapshot.activated_at else None)
            ),
            "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
            "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else None,
        }

    async def _append_snapshot_revision(self, snapshot_id: int, detail: dict[str, Any]) -> dict[str, Any]:
        return await self.state_authority_revisions.append_revision(snapshot_id, detail)

    def _serialize_deployment(self, deployment: SnapshotDeployment) -> dict[str, Any]:
        state = inspect(deployment)
        history_items = [] if "history" in state.unloaded else list(deployment.history)
        return {
            "id": deployment.id,
            "snapshot_id": deployment.snapshot_id,
            "primary_node_id": deployment.primary_node_id,
            "standby_node_ids": list(deployment.standby_node_ids or []),
            "deployment_status": deployment.deployment_status,
            "assignment_strategy": deployment.assignment_strategy,
            "redundancy_enabled": bool(deployment.redundancy_enabled),
            "deployed_at": deployment.deployed_at.isoformat() if deployment.deployed_at else None,
            "last_failover_time": deployment.last_failover_time.isoformat() if deployment.last_failover_time else None,
            "error_message": deployment.error_message,
            "history": [
                {
                    "id": item.id,
                    "snapshot_deployment_id": item.snapshot_deployment_id,
                    "snapshot_id": item.snapshot_id,
                    "from_node_id": item.from_node_id,
                    "to_node_id": item.to_node_id,
                    "action": item.action,
                    "notes": item.notes,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                }
                for item in history_items
            ],
        }

    def _build_asset_manifest(self, detail: dict[str, Any]) -> list[dict[str, Any]]:
        manifest: list[dict[str, Any]] = []
        for chain in detail.get("chains", []):
            for plugin in chain.get("plugins", []):
                loader_state = plugin.get("loader_state") or {}
                asset_path = str(loader_state.get("selected_asset_path") or "").strip() or None
                asset_name = (
                    loader_state.get("selected_asset_name")
                    or loader_state.get("selected_model")
                    or loader_state.get("selected_ir")
                )
                if not asset_path and not asset_name:
                    continue
                kind = "plugin_asset"
                plugin_uri = str(plugin.get("uri", ""))
                if "nam" in plugin_uri:
                    kind = "nam"
                elif "cabinet" in plugin_uri:
                    kind = "cabinet_ir"
                elif "reverb" in plugin_uri:
                    kind = "reverb_ir"
                manifest.append(
                    {
                        "kind": kind,
                        "chain_id": chain.get("id"),
                        "plugin_uri": plugin_uri,
                        "plugin_position": plugin.get("position"),
                        "asset_name": asset_name,
                        "asset_path": asset_path,
                        "filename": Path(asset_path).name if asset_path else None,
                        "checksum": hashlib.sha256(Path(asset_path).read_bytes()).hexdigest()
                        if asset_path and os.path.isfile(asset_path)
                        else None,
                        "available": bool(asset_path and os.path.isfile(asset_path) and not bool(plugin.get("is_placeholder", False))),
                    }
                )
        return manifest

    def _build_bundle_asset_manifest(self, manifest: list[dict[str, Any]]) -> list[dict[str, Any]]:
        used_paths: set[str] = set()
        bundle_manifest: list[dict[str, Any]] = []

        for index, raw_asset in enumerate(manifest):
            asset = dict(raw_asset)
            asset_path = str(asset.get("asset_path") or "").strip()
            if asset_path and os.path.isfile(asset_path):
                bundle_path = self._build_bundle_asset_path(asset, index=index, used_paths=used_paths)
                asset["bundle_path"] = bundle_path
                asset["filename"] = Path(bundle_path).name
                asset["available"] = True
                if not asset.get("checksum"):
                    asset["checksum"] = hashlib.sha256(Path(asset_path).read_bytes()).hexdigest()
            else:
                asset["bundle_path"] = None
                asset["available"] = False
            bundle_manifest.append(asset)

        return bundle_manifest

    def _build_document_bundle(
        self,
        payload: dict[str, Any],
        *,
        name: str,
        extension: str,
    ) -> dict[str, Any]:
        bundle_payload = copy.deepcopy(payload)
        asset_manifest = self._build_bundle_asset_manifest(bundle_payload.get("asset_manifest", []))
        bundle_payload["asset_manifest"] = asset_manifest

        archive_buffer = io.BytesIO()
        with zipfile.ZipFile(archive_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                SNAPSHOT_BUNDLE_MANIFEST_FILENAME,
                json.dumps(bundle_payload, indent=2).encode("utf-8"),
            )
            for asset in asset_manifest:
                bundle_path = str(asset.get("bundle_path") or "").strip()
                asset_path = str(asset.get("asset_path") or "").strip()
                if not bundle_path or not asset_path or not os.path.isfile(asset_path):
                    continue
                archive.write(asset_path, bundle_path)

        response_payload = {
            "filename": f"{name}{extension}",
            "content": archive_buffer.getvalue(),
            "asset_manifest": asset_manifest,
        }
        response_payload.update(
            {
                key: bundle_payload.get(key)
                for key in ("snapshot", "template")
                if key in bundle_payload
            }
        )
        return response_payload

    async def _build_ground_control_pro_bundle_payload(
        self,
        detail: dict[str, Any],
    ) -> dict[str, Any] | None:
        try:
            from app.services.ground_control_pro import get_ground_control_pro_service

            extensions = detail.get("extensions") if isinstance(detail, dict) else {}
            gcp_extension = extensions.get(_GROUND_CONTROL_PRO_EXTENSION_KEY) if isinstance(extensions, dict) else None
            session_id = None
            if isinstance(gcp_extension, dict):
                session_id = str(gcp_extension.get("session_id") or "").strip() or None
            return await get_ground_control_pro_service().export_bundle_payload(session_id=session_id)
        except Exception as exc:
            logger.debug("Ground Control Pro bundle export skipped: %s", exc)
            return None

    def _build_bundle_asset_path(
        self,
        asset: dict[str, Any],
        *,
        index: int,
        used_paths: set[str],
    ) -> str:
        raw_name = str(
            asset.get("filename")
            or asset.get("asset_name")
            or asset.get("asset_path")
            or f"asset-{index + 1}"
        ).strip()
        file_name = Path(raw_name).name or f"asset-{index + 1}"
        stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(file_name).stem).strip(".-") or f"asset-{index + 1}"
        suffix = Path(file_name).suffix or Path(str(asset.get("asset_path") or "")).suffix or ".bin"
        kind = re.sub(r"[^A-Za-z0-9_-]+", "-", str(asset.get("kind") or "plugin_asset")).strip("-") or "plugin_asset"
        plugin_position = _safe_int(asset.get("plugin_position"))
        chain_id = _safe_int(asset.get("chain_id"))
        candidate = f"assets/{kind}/{stem}{suffix}"
        collision_bits = [stem]
        if chain_id is not None:
            collision_bits.append(f"c{chain_id}")
        if plugin_position is not None:
            collision_bits.append(f"p{plugin_position}")
        collision_base = "-".join(collision_bits) + suffix
        collision_index = 1
        while candidate in used_paths:
            suffix_index = "" if collision_index == 1 else f"-{collision_index}"
            candidate = f"assets/{kind}/{collision_base.removesuffix(suffix)}{suffix_index}{suffix}"
            collision_index += 1
        used_paths.add(candidate)
        return candidate

    @staticmethod
    def _asset_manifest_key(asset: dict[str, Any]) -> tuple[Any, ...]:
        return (
            _safe_int(asset.get("chain_id")),
            str(asset.get("plugin_uri") or ""),
            _safe_int(asset.get("plugin_position")),
        )

    @staticmethod
    def _asset_upload_type(asset: dict[str, Any]) -> AssetType | None:
        kind = str(asset.get("kind") or "").strip().lower()
        if kind == "nam":
            return AssetType.NAM
        if kind == "cabinet_ir":
            return AssetType.CABINET_IR
        if kind == "reverb_ir":
            return AssetType.REVERB_IR

        suffix = Path(str(asset.get("asset_path") or asset.get("filename") or "")).suffix.lower()
        if suffix == ".nam":
            return AssetType.NAM
        if suffix in {".wav", ".aif", ".aiff", ".flac"}:
            plugin_uri = str(asset.get("plugin_uri") or "").lower()
            if "reverb" in plugin_uri:
                return AssetType.REVERB_IR
            return AssetType.CABINET_IR
        return None

    async def _extract_snapshot_bundle_payload(self, bundle_bytes: bytes) -> dict[str, Any]:
        with zipfile.ZipFile(io.BytesIO(bundle_bytes), "r") as archive:
            try:
                export_payload = json.loads(archive.read(SNAPSHOT_BUNDLE_MANIFEST_FILENAME).decode("utf-8"))
            except KeyError as exc:
                raise ValueError(f"Snapshot bundle missing {SNAPSHOT_BUNDLE_MANIFEST_FILENAME}") from exc
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ValueError("Snapshot bundle manifest is invalid JSON") from exc

            if "snapshot" in export_payload and isinstance(export_payload["snapshot"], dict):
                detail_payload = copy.deepcopy(export_payload["snapshot"])
            elif "template" in export_payload and isinstance(export_payload["template"], dict):
                detail_payload = copy.deepcopy(export_payload["template"])
            elif isinstance(export_payload, dict):
                detail_payload = copy.deepcopy(export_payload)
            else:
                raise ValueError("Snapshot bundle payload is invalid")

            asset_manifest = export_payload.get("asset_manifest") or []
            imported_assets = await self._import_bundle_assets(archive, asset_manifest)
            self._apply_imported_asset_paths(detail_payload, asset_manifest, imported_assets)
            await self._restore_ground_control_pro_bundle_payload(detail_payload, export_payload)
            return detail_payload

    async def _import_bundle_assets(
        self,
        archive: zipfile.ZipFile,
        asset_manifest: list[dict[str, Any]],
    ) -> dict[tuple[Any, ...], dict[str, Any]]:
        stored_assets: dict[tuple[Any, ...], dict[str, Any]] = {}
        upload_service = get_upload_service()

        for asset in asset_manifest:
            bundle_path = str(asset.get("bundle_path") or "").strip()
            if not bundle_path:
                continue

            upload_type = self._asset_upload_type(asset)
            if upload_type is None:
                continue

            try:
                content = archive.read(bundle_path)
            except KeyError:
                logger.warning("Snapshot bundle asset missing from archive: %s", bundle_path)
                continue

            filename = str(asset.get("filename") or Path(bundle_path).name or f"{upload_type.value}.bin").strip() or f"{upload_type.value}.bin"
            result = await upload_service.save_upload(filename, content, upload_type)
            if not result.success:
                raise ValueError(result.error or result.message or f"Failed to import asset {filename}")

            if upload_type == AssetType.NAM:
                await self._ensure_nam_asset_record(
                    file_path=result.file_path,
                    file_hash=result.file_hash,
                    file_size=result.file_size,
                    display_name=str(asset.get("asset_name") or Path(result.file_path).stem),
                )

            stored_assets[self._asset_manifest_key(asset)] = {
                "file_path": result.file_path,
                "asset_name": str(asset.get("asset_name") or Path(result.file_path).stem),
                "upload_type": upload_type,
            }

        return stored_assets

    async def _restore_ground_control_pro_bundle_payload(
        self,
        detail_payload: dict[str, Any],
        export_payload: dict[str, Any],
    ) -> None:
        gcp_payload = export_payload.get(_GROUND_CONTROL_PRO_EXTENSION_KEY)
        if not isinstance(gcp_payload, dict):
            return
        try:
            from app.services.ground_control_pro import get_ground_control_pro_service

            restored = await get_ground_control_pro_service().import_bundle_payload(gcp_payload)
        except Exception as exc:
            logger.warning("Ground Control Pro bundle restore skipped: %s", exc)
            return
        if not isinstance(restored, dict):
            return

        extensions = copy.deepcopy(detail_payload.get("extensions") or {})
        if not isinstance(extensions, dict):
            extensions = {}
        extensions[_GROUND_CONTROL_PRO_EXTENSION_KEY] = restored
        detail_payload["extensions"] = extensions

    async def _ensure_nam_asset_record(
        self,
        *,
        file_path: str,
        file_hash: str,
        file_size: int,
        display_name: str,
    ) -> None:
        existing_result = await self.session.execute(
            select(NAMModel).where(NAMModel.file_hash == file_hash)
        )
        existing = existing_result.scalar_one_or_none()
        if existing is not None:
            return

        self.session.add(
            NAMModel(
                name=display_name or Path(file_path).stem,
                file_path=file_path,
                file_hash=file_hash,
                file_size=file_size,
                model_type="unknown",
                category="User",
                license="Snapshot bundle import",
            )
        )
        await self.session.flush()

    def _apply_imported_asset_paths(
        self,
        detail_payload: dict[str, Any],
        asset_manifest: list[dict[str, Any]],
        imported_assets: dict[tuple[Any, ...], dict[str, Any]],
    ) -> None:
        manifest_by_key = {
            self._asset_manifest_key(asset): asset
            for asset in asset_manifest
        }

        for chain in detail_payload.get("chains", []):
            chain_id = _safe_int(chain.get("id"))
            for plugin in chain.get("plugins", []):
                key = (
                    chain_id,
                    str(plugin.get("uri") or ""),
                    _safe_int(plugin.get("position")),
                )
                manifest_entry = manifest_by_key.get(key)
                if manifest_entry is None:
                    continue

                loader_state = dict(plugin.get("loader_state") or {})
                imported_asset = imported_assets.get(key)
                asset_name = str(manifest_entry.get("asset_name") or "").strip() or None

                if imported_asset is None:
                    loader_state["selected_asset_path"] = None
                    if asset_name:
                        loader_state["selected_asset_name"] = asset_name
                        if manifest_entry.get("kind") == "nam":
                            loader_state["selected_model"] = asset_name
                        if manifest_entry.get("kind") in {"cabinet_ir", "reverb_ir"}:
                            loader_state["selected_ir"] = asset_name
                    plugin["loader_state"] = loader_state
                    continue

                loader_state["selected_asset_path"] = imported_asset["file_path"]
                if imported_asset.get("asset_name"):
                    loader_state["selected_asset_name"] = imported_asset["asset_name"]
                upload_type = imported_asset.get("upload_type")
                if upload_type == AssetType.NAM:
                    loader_state["selected_model"] = imported_asset["asset_name"]
                if upload_type in {AssetType.CABINET_IR, AssetType.REVERB_IR}:
                    loader_state["selected_ir"] = imported_asset["asset_name"]
                plugin["loader_state"] = loader_state

    async def _resequence_channels(self, snapshot_id: int) -> None:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return
        for index, channel in enumerate(sorted(snapshot.channels, key=lambda item: int(item.order_index))):
            channel.order_index = index
        await self.session.flush()

    async def _resequence_plugins(self, chain_id: int) -> None:
        result = await self.session.execute(
            select(SnapshotChainPlugin)
            .where(SnapshotChainPlugin.snapshot_chain_id == chain_id)
            .order_by(SnapshotChainPlugin.position.asc(), SnapshotChainPlugin.id.asc())
        )
        plugins = result.scalars().all()
        for index, plugin in enumerate(plugins):
            plugin.position = index
        await self.session.flush()


__all__ = [name for name in globals() if not name.startswith("__")]

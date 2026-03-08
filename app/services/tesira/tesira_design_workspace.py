"""
Tesira design workspace service.

Provides MAP2-native graph persistence and validation for Tesira signal-chain
authoring workflows.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Set

from sqlalchemy import select

from app.services.tesira.tesira_block_registry import list_blocks as list_registry_blocks


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt is not None else None


_DEFAULT_GRAPH: Dict[str, Any] = {
    "nodes": [],
    "edges": [],
    "groups": [],
}


def _normalize_graph(raw: Any) -> Dict[str, Any]:
    graph = dict(_DEFAULT_GRAPH)
    if isinstance(raw, dict):
        graph["nodes"] = list(raw.get("nodes") or [])
        graph["edges"] = list(raw.get("edges") or [])
        graph["groups"] = list(raw.get("groups") or [])
    return graph


def _port_lookup(node: Dict[str, Any], direction: str, port_name: Optional[str]) -> Optional[Dict[str, Any]]:
    io = node.get("io") or {}
    ports = io.get(direction) or []
    if not isinstance(ports, list) or len(ports) == 0:
        return None
    if port_name:
        for port in ports:
            if str(port.get("name", "")) == str(port_name):
                return port
    return ports[0]


def _edge_graph(node_ids: Iterable[str], edges: List[Dict[str, Any]]) -> Dict[str, Set[str]]:
    graph: Dict[str, Set[str]] = {node_id: set() for node_id in node_ids}
    for edge in edges:
        source = str(edge.get("source", "")).strip()
        target = str(edge.get("target", "")).strip()
        if source in graph and target in graph and source != target:
            graph[source].add(target)
    return graph


def _has_cycle(graph: Dict[str, Set[str]]) -> bool:
    temp: Set[str] = set()
    perm: Set[str] = set()

    def visit(node: str) -> bool:
        if node in perm:
            return False
        if node in temp:
            return True
        temp.add(node)
        for nxt in graph.get(node, set()):
            if visit(nxt):
                return True
        temp.remove(node)
        perm.add(node)
        return False

    return any(visit(node) for node in graph.keys())


class TesiraDesignWorkspaceService:
    """CRUD + validation service for Tesira design workspaces."""

    @staticmethod
    def default_graph() -> Dict[str, Any]:
        return dict(_DEFAULT_GRAPH)

    @staticmethod
    def design_block_library(profile: str | None = None) -> List[Dict[str, Any]]:
        blocks = list_registry_blocks(profile)
        return [
            {
                "block_type": str(entry.get("block_type", "")),
                "title": str(entry.get("title", entry.get("block_type", ""))),
                "category": str(entry.get("category", "processing")),
                "io": dict(entry.get("io") or {}),
                "parameter_map": dict(entry.get("parameter_map") or {}),
                "editor": dict(entry.get("editor") or {}),
            }
            for entry in blocks
            if str(entry.get("block_type", "")).strip()
        ]

    @staticmethod
    def _to_dict(row: Any) -> Dict[str, Any]:
        return {
            "design_id": row.design_id,
            "device_id": row.device_id,
            "name": row.name,
            "description": row.description,
            "graph": _normalize_graph(row.graph),
            "is_template": bool(row.is_template),
            "is_active": bool(row.is_active),
            "compile_status": str(row.compile_status or "UNCOMPILED"),
            "compile_revision": int(row.compile_revision or 0),
            "compiled_graph_hash": row.compiled_graph_hash,
            "compile_diagnostics": row.compile_diagnostics or {},
            "last_compiled_at": _iso(row.last_compiled_at),
            "created_at": _iso(row.created_at),
            "updated_at": _iso(row.updated_at),
        }

    async def list_designs(
        self,
        *,
        device_id: str,
        include_inactive: bool = False,
        include_templates: bool = True,
    ) -> List[Dict[str, Any]]:
        from app.database import TesiraDesignWorkspace, get_session

        async with get_session(read_only=True) as session:
            stmt = select(TesiraDesignWorkspace).where(TesiraDesignWorkspace.device_id == device_id)
            if not include_inactive:
                stmt = stmt.where(TesiraDesignWorkspace.is_active.is_(True))
            if not include_templates:
                stmt = stmt.where(TesiraDesignWorkspace.is_template.is_(False))
            stmt = stmt.order_by(TesiraDesignWorkspace.updated_at.desc(), TesiraDesignWorkspace.created_at.desc())
            rows = (await session.execute(stmt)).scalars().all()
            return [self._to_dict(row) for row in rows]

    async def create_design(self, *, device_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        from app.database import TesiraDesignWorkspace, get_session

        name = str(payload.get("name", "Untitled Design")).strip() or "Untitled Design"
        description = payload.get("description")
        graph = _normalize_graph(payload.get("graph"))
        design_id = str(payload.get("design_id", "")).strip() or f"design_{uuid.uuid4().hex[:12]}"

        async with get_session() as session:
            row = TesiraDesignWorkspace(
                design_id=design_id,
                device_id=device_id,
                name=name,
                description=str(description) if description is not None else None,
                graph=graph,
                is_template=bool(payload.get("is_template", False)),
                is_active=bool(payload.get("is_active", True)),
            )
            session.add(row)
            await session.flush()
            await session.refresh(row)
            return self._to_dict(row)

    async def get_design(self, *, device_id: str, design_id: str) -> Optional[Dict[str, Any]]:
        from app.database import TesiraDesignWorkspace, get_session

        async with get_session(read_only=True) as session:
            row = (
                await session.execute(
                    select(TesiraDesignWorkspace).where(
                        TesiraDesignWorkspace.device_id == device_id,
                        TesiraDesignWorkspace.design_id == design_id,
                    )
                )
            ).scalar_one_or_none()
            return self._to_dict(row) if row is not None else None

    async def update_design(self, *, device_id: str, design_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        from app.database import TesiraDesignWorkspace, get_session

        async with get_session() as session:
            row = (
                await session.execute(
                    select(TesiraDesignWorkspace).where(
                        TesiraDesignWorkspace.device_id == device_id,
                        TesiraDesignWorkspace.design_id == design_id,
                    )
                )
            ).scalar_one_or_none()
            if row is None:
                return None

            if "name" in payload:
                row.name = str(payload.get("name", row.name)).strip() or row.name
            if "description" in payload:
                value = payload.get("description")
                row.description = str(value).strip() if value is not None else None
            if "graph" in payload:
                row.graph = _normalize_graph(payload.get("graph"))
                row.compile_status = "UNCOMPILED"
                row.compiled_graph_hash = None
                row.compile_diagnostics = {
                    "state": "graph_changed",
                    "message": "Graph changed and requires recompile",
                }
            if "is_template" in payload:
                row.is_template = bool(payload.get("is_template"))
            if "is_active" in payload:
                row.is_active = bool(payload.get("is_active"))

            await session.flush()
            await session.refresh(row)
            return self._to_dict(row)

    async def delete_design(self, *, device_id: str, design_id: str) -> bool:
        from app.database import TesiraDesignWorkspace, get_session

        async with get_session() as session:
            row = (
                await session.execute(
                    select(TesiraDesignWorkspace).where(
                        TesiraDesignWorkspace.device_id == device_id,
                        TesiraDesignWorkspace.design_id == design_id,
                    )
                )
            ).scalar_one_or_none()
            if row is None:
                return False
            await session.delete(row)
            return True

    def validate_graph(self, graph: Dict[str, Any]) -> Dict[str, Any]:
        normalized = _normalize_graph(graph)
        nodes = normalized.get("nodes") or []
        edges = normalized.get("edges") or []
        groups = normalized.get("groups") or []

        errors: List[str] = []
        warnings: List[str] = []

        node_ids: Set[str] = set()
        instance_tags: Set[str] = set()
        node_map: Dict[str, Dict[str, Any]] = {}

        for index, node in enumerate(nodes):
            node_id = str(node.get("id", "")).strip()
            if not node_id:
                errors.append(f"node[{index}] is missing id")
                continue
            if node_id in node_ids:
                errors.append(f"duplicate node id '{node_id}'")
                continue
            node_ids.add(node_id)
            node_map[node_id] = node

            block_type = str(node.get("block_type", "")).strip()
            if not block_type:
                errors.append(f"node '{node_id}' is missing block_type")

            instance_tag = str(node.get("instance_tag", "")).strip()
            if instance_tag:
                if instance_tag in instance_tags:
                    errors.append(f"duplicate instance_tag '{instance_tag}'")
                instance_tags.add(instance_tag)

        for index, edge in enumerate(edges):
            source = str(edge.get("source", "")).strip()
            target = str(edge.get("target", "")).strip()
            if not source or not target:
                errors.append(f"edge[{index}] missing source/target")
                continue
            if source not in node_ids:
                errors.append(f"edge[{index}] source '{source}' not found")
                continue
            if target not in node_ids:
                errors.append(f"edge[{index}] target '{target}' not found")
                continue
            if source == target:
                warnings.append(f"edge[{index}] self-loop on '{source}'")

            source_node = node_map[source]
            target_node = node_map[target]
            source_port = _port_lookup(source_node, "outputs", edge.get("source_port"))
            target_port = _port_lookup(target_node, "inputs", edge.get("target_port"))

            if source_port is None:
                errors.append(f"edge[{index}] source '{source}' has no output port")
                continue
            if target_port is None:
                errors.append(f"edge[{index}] target '{target}' has no input port")
                continue

            source_domain = str(source_port.get("domain", "audio"))
            target_domain = str(target_port.get("domain", "audio"))
            if source_domain != target_domain:
                errors.append(
                    f"edge[{index}] domain mismatch: {source}.{source_port.get('name')} "
                    f"({source_domain}) -> {target}.{target_port.get('name')} ({target_domain})"
                )

            source_channels = int(source_port.get("channels", 1) or 1)
            target_channels = int(target_port.get("channels", 1) or 1)
            if source_channels != target_channels:
                warnings.append(
                    f"edge[{index}] channel mismatch: {source_channels} -> {target_channels}"
                )

        group_ids: Set[str] = set()
        for index, group in enumerate(groups):
            group_id = str(group.get("id", "")).strip()
            if not group_id:
                errors.append(f"group[{index}] is missing id")
                continue
            if group_id in group_ids:
                errors.append(f"duplicate group id '{group_id}'")
            group_ids.add(group_id)

            members = group.get("node_ids") or []
            if not isinstance(members, list):
                errors.append(f"group '{group_id}' has invalid node_ids")
                continue
            for member_id in members:
                member_id_s = str(member_id)
                if member_id_s not in node_ids:
                    errors.append(f"group '{group_id}' references unknown node '{member_id_s}'")

        if node_ids:
            graph_edges = _edge_graph(node_ids, edges)
            if _has_cycle(graph_edges):
                warnings.append("graph contains at least one cycle")

        return {
            "ok": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "counts": {
                "nodes": len(nodes),
                "edges": len(edges),
                "groups": len(groups),
            },
        }


_tesira_design_workspace_service: Optional[TesiraDesignWorkspaceService] = None


def get_tesira_design_workspace_service() -> TesiraDesignWorkspaceService:
    global _tesira_design_workspace_service
    if _tesira_design_workspace_service is None:
        _tesira_design_workspace_service = TesiraDesignWorkspaceService()
    return _tesira_design_workspace_service

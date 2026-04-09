"""
MAP2-native Tesira design compiler service.

Compiles persisted design graphs into deterministic compile metadata, provides
recompile/optimization workflows, and emits diagnostics suitable for authoring
feedback loops.
"""

from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.services.tesira.tesira_design_workspace import TesiraDesignWorkspaceService


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt is not None else None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


_BLOCK_WEIGHTS: Dict[str, float] = {
    "AudioInput": 0.2,
    "AudioOutput": 0.2,
    "LevelControl": 0.5,
    "PEQ": 0.9,
    "Mixer": 1.4,
    "Router": 1.1,
    "LogicState": 0.3,
}


class TesiraDesignCompilerService:
    """Compile/recompile/diagnostic workflows for Tesira design workspaces."""

    def __init__(self) -> None:
        self._workspace = TesiraDesignWorkspaceService()

    @staticmethod
    def _normalize_graph(graph: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "nodes": list(graph.get("nodes") or []),
            "edges": list(graph.get("edges") or []),
            "groups": list(graph.get("groups") or []),
        }

    @staticmethod
    def _graph_hash(graph: Dict[str, Any], optimize: bool) -> str:
        payload = {
            "graph": graph,
            "optimize": bool(optimize),
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _estimate_load(nodes: List[Dict[str, Any]], optimize: bool) -> float:
        total = 0.0
        for node in nodes:
            block_type = str(node.get("block_type", "")).strip()
            total += _BLOCK_WEIGHTS.get(block_type, 0.6)
        if optimize:
            total *= 0.9
        return round(total, 3)

    @staticmethod
    def _estimate_latency_ms(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]], optimize: bool) -> float:
        base = 0.25 + (0.06 * len(nodes)) + (0.01 * len(edges))
        if optimize:
            base *= 0.88
        return round(base, 3)

    @staticmethod
    def _extra_diagnostics(graph: Dict[str, Any]) -> Dict[str, List[str]]:
        nodes = list(graph.get("nodes") or [])
        edges = list(graph.get("edges") or [])

        warnings: List[str] = []
        info: List[str] = []

        node_ids = {str(node.get("id", "")).strip() for node in nodes}
        incoming = {node_id: 0 for node_id in node_ids}
        outgoing = {node_id: 0 for node_id in node_ids}

        for edge in edges:
            source = str(edge.get("source", "")).strip()
            target = str(edge.get("target", "")).strip()
            if source in outgoing:
                outgoing[source] += 1
            if target in incoming:
                incoming[target] += 1

        disconnected = [node_id for node_id in node_ids if incoming.get(node_id, 0) == 0 and outgoing.get(node_id, 0) == 0]
        if disconnected:
            warnings.append(f"Disconnected nodes detected: {', '.join(sorted(disconnected))}")

        audio_outputs = [
            node for node in nodes
            if str(node.get("block_type", "")).strip() in {"AudioOutput", "ExplicitAVBOutStream", "Output"}
        ]
        if not audio_outputs:
            warnings.append("No explicit output block detected (AudioOutput/ExplicitAVBOutStream/Output)")

        info.append(f"Graph size: {len(nodes)} nodes, {len(edges)} edges")
        return {"warnings": warnings, "info": info}

    async def compile_design(
        self,
        *,
        device_id: str,
        design_id: str,
        optimize: bool = False,
        recompile: bool = False,
    ) -> Dict[str, Any]:
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
                raise ValueError(f"Design '{design_id}' not found")

            graph = self._normalize_graph(dict(row.graph or {}))
            validation = self._workspace.validate_graph(graph)
            diagnostics_extra = self._extra_diagnostics(graph)

            graph_hash = self._graph_hash(graph, optimize=optimize)
            is_noop = (
                not recompile
                and str(row.compile_status or "") == "COMPILED"
                and str(row.compiled_graph_hash or "") == graph_hash
            )

            base_diagnostics = {
                "validation": validation,
                "extra": diagnostics_extra,
                "optimize": bool(optimize),
                "recompile": bool(recompile),
            }

            if is_noop:
                result = {
                    "device_id": device_id,
                    "design_id": design_id,
                    "status": "UP_TO_DATE",
                    "compile_status": row.compile_status,
                    "compile_revision": row.compile_revision,
                    "graph_hash": row.compiled_graph_hash,
                    "compiled_at": _iso(row.last_compiled_at),
                    "diagnostics": row.compile_diagnostics or base_diagnostics,
                    "artifact": None,
                }
                return result

            if not validation["ok"]:
                row.compile_status = "FAILED"
                row.compile_diagnostics = base_diagnostics
                row.last_compiled_at = _utc_now()
                await session.flush()
                return {
                    "device_id": device_id,
                    "design_id": design_id,
                    "status": "FAILED",
                    "compile_status": row.compile_status,
                    "compile_revision": row.compile_revision,
                    "graph_hash": row.compiled_graph_hash,
                    "compiled_at": _iso(row.last_compiled_at),
                    "diagnostics": base_diagnostics,
                    "artifact": None,
                }

            nodes = list(graph.get("nodes") or [])
            edges = list(graph.get("edges") or [])

            artifact = {
                "artifact_id": f"compiled_{design_id}_{graph_hash[:10]}",
                "partition_count": max(1, len(graph.get("groups") or []) or 1),
                "node_count": len(nodes),
                "edge_count": len(edges),
                "estimated_dsp_load": self._estimate_load(nodes, optimize=optimize),
                "estimated_latency_ms": self._estimate_latency_ms(nodes, edges, optimize=optimize),
                "optimized": bool(optimize),
            }

            row.compile_status = "COMPILED"
            row.compile_revision = int(row.compile_revision or 0) + 1
            row.compiled_graph_hash = graph_hash
            row.compile_diagnostics = base_diagnostics
            row.last_compiled_at = _utc_now()
            await session.flush()

            return {
                "device_id": device_id,
                "design_id": design_id,
                "status": "COMPILED",
                "compile_status": row.compile_status,
                "compile_revision": row.compile_revision,
                "graph_hash": row.compiled_graph_hash,
                "compiled_at": _iso(row.last_compiled_at),
                "diagnostics": base_diagnostics,
                "artifact": artifact,
            }

    async def get_diagnostics(self, *, device_id: str, design_id: str) -> Dict[str, Any]:
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
            if row is None:
                raise ValueError(f"Design '{design_id}' not found")

            graph = self._normalize_graph(dict(row.graph or {}))
            validation = self._workspace.validate_graph(graph)
            diagnostics_extra = self._extra_diagnostics(graph)

            return {
                "device_id": device_id,
                "design_id": design_id,
                "compile_status": row.compile_status,
                "compile_revision": int(row.compile_revision or 0),
                "compiled_at": _iso(row.last_compiled_at),
                "graph_hash": row.compiled_graph_hash,
                "diagnostics": row.compile_diagnostics or {
                    "validation": validation,
                    "extra": diagnostics_extra,
                },
            }

    async def compile_all(
        self,
        *,
        device_id: str,
        optimize: bool = False,
        recompile: bool = False,
        only_uncompiled: bool = False,
        include_templates: bool = False,
    ) -> Dict[str, Any]:
        designs = await self._workspace.list_designs(
            device_id=device_id,
            include_templates=include_templates,
            include_inactive=True,
        )

        results: List[Dict[str, Any]] = []
        for design in designs:
            if only_uncompiled and str(design.get("compile_status", "UNCOMPILED")) == "COMPILED":
                continue
            result = await self.compile_design(
                device_id=device_id,
                design_id=str(design["design_id"]),
                optimize=optimize,
                recompile=recompile,
            )
            results.append(result)

        return {
            "device_id": device_id,
            "count": len(results),
            "results": results,
        }

    async def compile_active(
        self,
        *,
        device_id: str,
        optimize: bool = False,
        recompile: bool = False,
    ) -> Dict[str, Any]:
        designs = await self._workspace.list_designs(
            device_id=device_id,
            include_templates=False,
            include_inactive=False,
        )
        if not designs:
            return {"device_id": device_id, "count": 0, "results": []}

        target = designs[0]
        result = await self.compile_design(
            device_id=device_id,
            design_id=str(target["design_id"]),
            optimize=optimize,
            recompile=recompile,
        )
        return {
            "device_id": device_id,
            "count": 1,
            "results": [result],
        }


_tesira_design_compiler_service: Optional[TesiraDesignCompilerService] = None
_tesira_design_compiler_service_lock = threading.Lock()


def get_tesira_design_compiler_service() -> TesiraDesignCompilerService:
    global _tesira_design_compiler_service
    if _tesira_design_compiler_service is None:
        with _tesira_design_compiler_service_lock:
            if _tesira_design_compiler_service is None:
                _tesira_design_compiler_service = TesiraDesignCompilerService()
    return _tesira_design_compiler_service

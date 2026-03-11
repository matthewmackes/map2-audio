"""Cluster content distribution for presets, IRs, and NAM models."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from app.config import config_get
from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity
from app.services.cluster.mdns_discovery_enhanced import (
    EnhancedMDNSDiscovery,
    get_enhanced_mdns_discovery,
)

logger = logging.getLogger(__name__)


@dataclass
class SyncResult:
    source_node_id: str
    target_node_id: str
    content_type: str
    transferred: int = 0
    skipped: int = 0
    failed: int = 0
    details: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ContentDistributor:
    def __init__(
        self,
        *,
        client: Optional[httpx.AsyncClient] = None,
        discovery: Optional[EnhancedMDNSDiscovery] = None,
        local_node_id: Optional[str] = None,
    ) -> None:
        self._client = client or httpx.AsyncClient(timeout=15.0, follow_redirects=True)
        self._discovery = discovery or get_enhanced_mdns_discovery()
        self._local_node_id = local_node_id or get_enhanced_node_identity().get_node_id()
        self._backend_port = int(config_get("backend.port", 8080))
        self._local_base_url = f"http://127.0.0.1:{self._backend_port}"

    async def get_preset_availability(
        self,
        preset_id: int,
        target_node_ids: Optional[List[str]] = None,
        source_node_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        source_node = source_node_id or self._local_node_id
        bundle = await self._get_preset_bundle(source_node, preset_id)
        response = await self._client.get(
            f"{self._local_base_url}/api/preset-exchange/cluster/library",
            params={"content_type": "preset", "node_id": "all"},
        )
        response.raise_for_status()
        nodes = response.json().get("nodes", {})
        available_on: List[str] = []
        missing_on: List[str] = []

        for node_id, node_payload in nodes.items():
            if target_node_ids and node_id not in target_node_ids:
                continue
            items = node_payload.get("body", {}).get("items", [])
            if any(item.get("checksum") == bundle["checksum"] for item in items):
                available_on.append(node_id)
            else:
                missing_on.append(node_id)

        return {
            "preset_id": preset_id,
            "checksum": bundle["checksum"],
            "source_node_id": source_node,
            "available_on": available_on,
            "missing_on": missing_on,
        }

    async def deploy_preset(
        self,
        preset_id: int,
        target_node_ids: Optional[List[str]] = None,
        source_node_id: Optional[str] = None,
    ) -> Dict[str, bool]:
        source_node = source_node_id or self._local_node_id
        bundle = await self._get_preset_bundle(source_node, preset_id)
        targets = target_node_ids or [
            node.node_id for node in self._discovery.get_discovered_nodes(online_only=True)
            if node.node_id != source_node
        ]
        results: Dict[str, bool] = {}
        for node_id in targets:
            if node_id == source_node:
                results[node_id] = True
                continue
            try:
                response = await self._client.post(
                    f"{self._node_base_url(node_id)}/api/preset-exchange/import-cluster",
                    headers={"X-MAP2-Proxy-Origin": self._local_node_id},
                    json=bundle,
                )
                response.raise_for_status()
                payload = response.json()
                results[node_id] = bool(payload.get("success"))
            except Exception as exc:
                logger.warning("Preset deploy to %s failed: %s", node_id, exc)
                results[node_id] = False
        return results

    async def deploy_ir(self, ir_path: str, target_node_ids: List[str]) -> Dict[str, bool]:
        return await self._deploy_file(Path(ir_path), target_node_ids, self._infer_ir_asset_type(Path(ir_path)))

    async def deploy_nam_model(self, model_path: str, target_node_ids: List[str]) -> Dict[str, bool]:
        return await self._deploy_file(Path(model_path), target_node_ids, "nam")

    async def deploy_library_item(
        self,
        content_type: str,
        path_token: str,
        target_node_ids: List[str],
        source_node_id: Optional[str] = None,
    ) -> Dict[str, bool]:
        if content_type not in {"ir", "nam"}:
            raise ValueError(f"Unsupported content_type: {content_type}")

        source_node = source_node_id or self._local_node_id
        library_items = await self._list_library(source_node, content_type)
        item = next((candidate for candidate in library_items if candidate.get("path_token") == path_token), None)
        if item is None:
            raise FileNotFoundError(path_token)

        content = await self._download_library_file(source_node, content_type, path_token)
        checksum = item.get("checksum")
        results: Dict[str, bool] = {}

        for node_id in target_node_ids:
            if node_id == source_node:
                results[node_id] = True
                continue

            try:
                response = await self._client.post(
                    f"{self._node_base_url(node_id)}/api/upload/",
                    headers={"X-MAP2-Proxy-Origin": self._local_node_id},
                    data={"asset_type": item["asset_type"]},
                    files={"file": (item["filename"], content, "application/octet-stream")},
                )
                response.raise_for_status()
                payload = response.json()
                results[node_id] = payload.get("file_hash") == checksum
            except Exception as exc:
                logger.warning("Cluster library deploy to %s failed: %s", node_id, exc)
                results[node_id] = False

        return results

    async def sync_library(self, source_node_id: str, target_node_id: str, content_type: str) -> SyncResult:
        if content_type not in {"preset", "ir", "nam"}:
            raise ValueError(f"Unsupported content_type: {content_type}")

        result = SyncResult(
            source_node_id=source_node_id,
            target_node_id=target_node_id,
            content_type=content_type,
        )

        source_items = await self._list_library(source_node_id, content_type)
        target_items = await self._list_library(target_node_id, content_type)
        target_checksums = {item.get("checksum") for item in target_items}

        for item in source_items:
            checksum = item.get("checksum")
            if checksum in target_checksums:
                result.skipped += 1
                result.details.append({"status": "skipped", "item": item})
                continue
            try:
                if content_type == "preset":
                    bundle = await self._get_preset_bundle(source_node_id, int(item["preset_id"]))
                    response = await self._client.post(
                        f"{self._node_base_url(target_node_id)}/api/preset-exchange/import-cluster",
                        headers={"X-MAP2-Proxy-Origin": self._local_node_id},
                        json=bundle,
                    )
                    response.raise_for_status()
                else:
                    content = await self._download_library_file(source_node_id, content_type, str(item["path_token"]))
                    response = await self._client.post(
                        f"{self._node_base_url(target_node_id)}/api/upload/",
                        headers={"X-MAP2-Proxy-Origin": self._local_node_id},
                        data={"asset_type": item["asset_type"]},
                        files={"file": (item["filename"], content, "application/octet-stream")},
                    )
                    response.raise_for_status()
                    payload = response.json()
                    if payload.get("file_hash") != checksum:
                        raise ValueError("Checksum verification failed after upload")
                result.transferred += 1
                result.details.append({"status": "transferred", "item": item})
            except Exception as exc:
                logger.warning("Library sync item failed (%s -> %s): %s", source_node_id, target_node_id, exc)
                result.failed += 1
                result.details.append({"status": "failed", "item": item, "error": str(exc)})

        return result

    async def _deploy_file(self, file_path: Path, target_node_ids: List[str], asset_type: str) -> Dict[str, bool]:
        if not file_path.is_file():
            raise FileNotFoundError(file_path)

        content = file_path.read_bytes()
        checksum = hashlib.sha256(content).hexdigest()
        results: Dict[str, bool] = {}

        for node_id in target_node_ids:
            try:
                response = await self._client.post(
                    f"{self._node_base_url(node_id)}/api/upload/",
                    headers={"X-MAP2-Proxy-Origin": self._local_node_id},
                    data={"asset_type": asset_type},
                    files={"file": (file_path.name, content, "application/octet-stream")},
                )
                response.raise_for_status()
                payload = response.json()
                results[node_id] = payload.get("file_hash") == checksum
            except Exception as exc:
                logger.warning("File deploy to %s failed: %s", node_id, exc)
                results[node_id] = False
        return results

    async def _get_preset_bundle(self, source_node_id: str, preset_id: int) -> Dict[str, Any]:
        response = await self._client.get(
            f"{self._node_base_url(source_node_id)}/api/preset-exchange/cluster/presets/{preset_id}",
            headers={"X-MAP2-Proxy-Origin": self._local_node_id},
        )
        response.raise_for_status()
        return response.json()

    async def _list_library(self, source_node_id: str, content_type: str) -> List[Dict[str, Any]]:
        response = await self._client.get(
            f"{self._node_base_url(source_node_id)}/api/preset-exchange/cluster/library",
            headers={"X-MAP2-Proxy-Origin": self._local_node_id},
            params={"content_type": content_type},
        )
        response.raise_for_status()
        return response.json().get("items", [])

    async def _download_library_file(self, source_node_id: str, content_type: str, path_token: str) -> bytes:
        response = await self._client.get(
            f"{self._node_base_url(source_node_id)}/api/preset-exchange/cluster/files/{content_type}",
            headers={"X-MAP2-Proxy-Origin": self._local_node_id},
            params={"path_token": path_token},
        )
        response.raise_for_status()
        return response.content

    def _node_base_url(self, node_id: str) -> str:
        if node_id == self._local_node_id:
            return self._local_base_url
        node = self._discovery.get_discovered_node(node_id)
        if node is None or not node.addresses:
            raise ValueError(f"Node {node_id} not found or offline")
        return f"http://{node.addresses[0]}:{int(getattr(node, 'port', self._backend_port) or self._backend_port)}"

    @staticmethod
    def _infer_ir_asset_type(path: Path) -> str:
        return "reverb_ir" if "reverb" in path.as_posix().lower() else "cabinet_ir"


_content_distributor: Optional[ContentDistributor] = None


def get_content_distributor() -> ContentDistributor:
    global _content_distributor
    if _content_distributor is None:
        _content_distributor = ContentDistributor()
    return _content_distributor

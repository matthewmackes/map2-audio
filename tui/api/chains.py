"""Chain and workflow domain client for the unified TUI."""

from __future__ import annotations

from .base import APIResult, DomainClient


class ChainsAPI(DomainClient):
    async def list_chains(self) -> APIResult:
        return await self.transport.get("/api/chains/")

    async def get_chain(self, chain_id: int) -> APIResult:
        return await self.transport.get(f"/api/chains/{chain_id}")

    async def create_chain(self, name: str) -> APIResult:
        return await self.transport.post("/api/chains/", json={"name": name})

    async def activate_chain(self, chain_id: int) -> APIResult:
        return await self.transport.post(f"/api/chains/{chain_id}/activate")

    async def toggle_plugin_bypass(
        self,
        chain_id: int,
        plugin_uri: str,
        *,
        bypass: bool,
        plugin_position: int | None = None,
    ) -> APIResult:
        params = {"bypass": str(bypass).lower()}
        if plugin_position is not None:
            params["plugin_position"] = plugin_position
        return await self.transport.post(
            f"/api/chains/{chain_id}/plugins/{plugin_uri}/bypass",
            params=params,
        )

    async def save_chain_preset(self, chain_id: int, preset_name: str) -> APIResult:
        return await self.transport.post(
            f"/api/chains/{chain_id}/preset/save",
            params={"preset_name": preset_name},
        )

    async def get_touchscreen_state(self, chain_id: int) -> APIResult:
        return await self.transport.get(f"/api/chains/{chain_id}/touchscreen")

    async def update_touchscreen_stomps(self, chain_id: int, assignments: list[dict]) -> APIResult:
        return await self.transport.put(
            f"/api/chains/{chain_id}/touchscreen/stomps",
            json={"assignments": assignments},
        )

    async def rename_chain(self, chain_id: int, new_name: str) -> APIResult:
        return await self.transport.put(
            f"/api/chains/{chain_id}/rename",
            params={"new_name": new_name},
        )

    async def delete_chain(self, chain_id: int) -> APIResult:
        return await self.transport.delete(f"/api/chains/{chain_id}")

    async def list_templates(self) -> APIResult:
        return await self.transport.get("/api/chains/templates/list")

    async def load_template(self, template_name: str) -> APIResult:
        return await self.transport.post(
            "/api/chains/templates/load",
            params={"template_name": template_name},
        )

    async def list_sessions(self) -> APIResult:
        return await self.transport.get("/api/sessions/list")

    async def save_session(self, name: str, description: str = "") -> APIResult:
        return await self.transport.post(
            "/api/sessions/save",
            json={"name": name, "description": description, "tags": []},
        )

    async def load_session(self, session_id: int) -> APIResult:
        return await self.transport.post(f"/api/sessions/load/{session_id}")

"""MIDI domain client for the unified TUI."""

from __future__ import annotations

from .base import APIResult, DomainClient


class MidiAPI(DomainClient):
    async def get_midi_status(self) -> APIResult:
        return await self.transport.get("/api/engine/midi/status")

    async def get_midi_devices(self) -> APIResult:
        return await self.transport.get("/api/engine/midi/devices")

    async def refresh_midi_devices(self) -> APIResult:
        return await self.transport.post("/api/midi/refresh")

    async def start_midi_learn(self, plugin_uri: str = "", param_index: int = 0) -> APIResult:
        return await self.transport.post(
            "/api/engine/midi/learn/start",
            json={"plugin_uri": plugin_uri, "param_index": param_index},
        )

    async def stop_midi_learn(self) -> APIResult:
        return await self.transport.post("/api/engine/midi/learn/stop")

    async def get_midi_learn_status(self) -> APIResult:
        return await self.transport.get("/api/engine/midi/learn/status")

    async def get_midi_activity(self, limit: int = 50) -> APIResult:
        return await self.transport.get("/api/midi/activity", params={"limit": limit})

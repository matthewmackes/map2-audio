"""Audio domain client for the unified TUI."""

from __future__ import annotations

from .base import APIResult, DomainClient


class AudioAPI(DomainClient):
    async def start_audio(self) -> APIResult:
        return await self.transport.post("/api/audio/start")

    async def stop_audio(self) -> APIResult:
        return await self.transport.post("/api/audio/stop")

    async def restart_audio(self) -> APIResult:
        return await self.transport.post("/api/audio/restart")

    async def get_audio_status(self) -> APIResult:
        return await self.transport.get("/api/audio/status")

    async def get_audio_latency(self) -> APIResult:
        return await self.transport.get("/api/audio/latency")

    async def get_audio_levels(self) -> APIResult:
        return await self.transport.get("/api/audio/levels")

    async def get_audio_pipedal_metrics(self) -> APIResult:
        return await self.transport.get("/api/audio/pipedal")

    async def get_pipedal_status(self) -> APIResult:
        return await self.transport.get("/api/pipedal/status")

    async def get_dsp_status(self) -> APIResult:
        return await self.transport.get("/api/dsp/status")

    async def get_cpu_headroom(self) -> APIResult:
        return await self.transport.get("/api/dsp/cpu-headroom")

    async def get_guitar_status(self) -> APIResult:
        return await self.transport.get("/api/guitar/")

    async def get_nam_models(self) -> APIResult:
        return await self.transport.get("/api/nam/models")

    async def activate_nam_model(self, model_name: str) -> APIResult:
        return await self.transport.post(f"/api/nam/models/{model_name}/activate")

    async def get_cabinet_irs(self) -> APIResult:
        return await self.transport.get("/api/ir/cabinets")

    async def get_reverb_irs(self) -> APIResult:
        return await self.transport.get("/api/ir/reverbs")

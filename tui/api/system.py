"""System, platform, and operations domain client for the unified TUI."""

from __future__ import annotations

from .base import APIResult, DomainClient


class SystemAPI(DomainClient):
    async def get_health(self) -> APIResult:
        return await self.transport.get("/api/health")

    async def get_version(self) -> APIResult:
        return await self.transport.get("/api/version")

    async def get_history_status(self) -> APIResult:
        return await self.transport.get("/api/history/status")

    async def undo(self) -> APIResult:
        return await self.transport.post("/api/history/undo")

    async def redo(self) -> APIResult:
        return await self.transport.post("/api/history/redo")

    async def restart_backend(self) -> APIResult:
        return await self.transport.post("/api/system/restart-backend")

    async def restart_system(self) -> APIResult:
        return await self.transport.post("/api/system/restart")

    async def apply_node_install(self, config: dict[str, object], *, dry_run: bool = False, auto_yes: bool = True) -> APIResult:
        return await self.transport.post(
            "/api/system/node-install",
            json={"config": config, "dry_run": dry_run, "auto_yes": auto_yes},
        )

    async def get_network_status(self) -> APIResult:
        return await self.transport.get("/api/network/status")

    async def get_ethernet_interfaces(self) -> APIResult:
        return await self.transport.get("/api/network/ethernet")

    async def ping_host(self, host: str, count: int = 4) -> APIResult:
        return await self.transport.post("/api/network/ping", json={"host": host, "count": count})

    async def get_services_summary(self) -> APIResult:
        return await self.transport.get("/api/services/summary")

    async def get_services_status(self) -> APIResult:
        return await self.transport.get("/api/services/status")

    async def get_realtime_status(self) -> APIResult:
        return await self.transport.get("/api/system/realtime-status")

    async def get_runtime_profile_status(self) -> APIResult:
        return await self.transport.get("/api/runtime-profiles/status")

    async def switch_runtime_profile(self, profile: str, *, dry_run: bool = False, force: bool = False) -> APIResult:
        return await self.transport.post(
            "/api/runtime-profiles/switch",
            json={"profile": profile, "dry_run": dry_run, "force": force},
        )

    async def verify_rt_hardening(self) -> APIResult:
        return await self.transport.post("/api/runtime-profiles/rt-harden/verify")

    async def apply_rt_hardening(self, *, dry_run: bool = False, auto_yes: bool = True) -> APIResult:
        return await self.transport.post(
            "/api/runtime-profiles/rt-harden/apply",
            json={"dry_run": dry_run, "auto_yes": auto_yes},
        )

    async def get_cpu_isolation_status(self) -> APIResult:
        return await self.transport.get("/api/system/cpu-isolation/status")

    async def verify_cpu_isolation(self) -> APIResult:
        return await self.transport.get("/api/system/cpu-isolation/verify")

    async def reset_cpu_isolation_to_mode(self) -> APIResult:
        return await self.transport.post("/api/system/cpu-isolation/reset-to-mode")

    async def get_system_logs(self, limit: int = 100) -> APIResult:
        return await self.transport.get("/api/system/logs", params={"limit": limit})

    async def get_usb_diagnostics(self) -> APIResult:
        return await self.transport.get("/api/usb/diagnostics")

    async def get_lcd_status(self) -> APIResult:
        return await self.transport.get("/api/lcd/status")

    async def get_lcd_pages(self) -> APIResult:
        return await self.transport.get("/api/lcd/pages")

    async def set_lcd_page(self, page: str) -> APIResult:
        return await self.transport.post("/api/lcd/page", json={"page": page})

    async def get_avb_status(self) -> APIResult:
        return await self.transport.get("/api/avb/status")

    async def apply_avb_setup(self, *, interface: str = "", dry_run: bool = False, auto_yes: bool = True) -> APIResult:
        return await self.transport.post(
            "/api/avb/setup",
            json={"interface": interface, "dry_run": dry_run, "auto_yes": auto_yes},
        )

    async def apply_avb_ptp_setup(
        self,
        *,
        interface: str = "",
        domain: int = 0,
        priority: int = 128,
        dry_run: bool = False,
        auto_yes: bool = True,
    ) -> APIResult:
        return await self.transport.post(
            "/api/avb/ptp/setup",
            json={
                "interface": interface,
                "domain": domain,
                "priority": priority,
                "dry_run": dry_run,
                "auto_yes": auto_yes,
            },
        )

    async def get_avb_streams(self) -> APIResult:
        return await self.transport.get("/api/avb/streams")

    async def get_avb_discovery(self) -> APIResult:
        return await self.transport.get("/api/avb/discovery")

    async def get_ptp_status(self) -> APIResult:
        return await self.transport.get("/api/avb/ptp/status")

    async def get_tsn_status(self) -> APIResult:
        return await self.transport.get("/api/avb/tsn/status")

    async def list_backups(self) -> APIResult:
        return await self.transport.get("/api/backup/")

    async def get_backup_status(self) -> APIResult:
        return await self.transport.get("/api/backup/status")

    async def create_backup(self, description: str = "") -> APIResult:
        return await self.transport.post("/api/backup/create", json={"description": description})

    async def restore_backup(
        self,
        backup_id: str,
        restore_database: bool = True,
        restore_user_data: bool = True,
        restore_config: bool = True,
    ) -> APIResult:
        return await self.transport.post(
            f"/api/backup/{backup_id}/restore",
            json={
                "restore_database": restore_database,
                "restore_user_data": restore_user_data,
                "restore_config": restore_config,
            },
        )

    async def delete_backup(self, backup_id: str) -> APIResult:
        return await self.transport.delete(f"/api/backup/{backup_id}")

    async def get_updates_status(self) -> APIResult:
        result = await self.transport.get("/api/updates/status")
        if result.success or result.status_code != 404:
            return result
        version = await self.get_version()
        if version.success:
            payload = version.data if isinstance(version.data, dict) else {"version": version.data}
            payload.setdefault("status", "No update endpoint available")
            return APIResult(True, payload, status_code=version.status_code)
        return result

"""Canonical PlatformEvent kind taxonomy and LCD surface projection helpers."""

from __future__ import annotations

from typing import Final


# Canonical kinds from the PlatformEvent control-plane design plus LCD surface
# kinds used by the hardware/UI projection layer.
PLATFORM_EVENT_KINDS: Final[tuple[str, ...]] = (
    "audio.xrun",
    "audio.engine.status",
    "audio.path.changed",
    "snapshot.activation.started",
    "snapshot.activation.ok",
    "snapshot.activation.failed",
    "snapshot.live.pinned",
    "snapshot.runtime.progress",
    "node.online",
    "node.offline",
    "node.degraded",
    "node.failover",
    "node.recovered",
    "device.mpx1.connected",
    "device.mpx1.disconnected",
    "device.intelfx.status",
    "device.midihub.peer.online",
    "device.midihub.peer.offline",
    "device.tesira.fleet.delta",
    "device.avb.stream.delta",
    "workflow.started",
    "workflow.progress",
    "workflow.completed",
    "workflow.cancelled",
    "system.cpu.high",
    "system.cpu.critical",
    "system.memory.high",
    "system.disk.high",
    "system.temp.high",
    "plugin.added",
    "plugin.removed",
    "plugin.bypassed",
    "plugin.parameter.changed",
    "plugin.preset.loaded",
    "plugin.output.clipping",
    "plugin.scan.progress",
    "midi.port.discovered",
    "midi.port.lost",
    "midi.node.discovered",
    "midi.node.lost",
    "midi.connection.requested",
    "midi.connection.established",
    "midi.connection.failed",
    "midi.connection.lost",
    "midi.clock.master.elected",
    "midi.clock.drift",
    "midi.profile.shared",
    "midi.failover.triggered",
    "midi.failover.completed",
    "ir.download.progress",
    "soundfont.download.progress",
    "api.openapi.out_of_sync",
    "api.observatory.anomaly",
    "config.changed",
    "config.updated",
    "config.sync.requested",
    "config.sync.completed",
    "config.pushed",
    "config.rolled_back",
    "config.synced",
    "cluster.federation.state",
    "cluster.update.started",
    "cluster.update.completed",
    "cluster.update.failed",
    "cluster.update.rolled_back",
    "failover.initiated",
    "failover.completed",
    "failover.failed",
    "maintenance.started",
    "maintenance.completed",
    "metrics.collected",
    "system.performance.alert",
    "system.status",
    "system.health.degraded",
    "system.health.recovered",
    "system.health.critical",
    "chain.created",
    "chain.deleted",
    "chain.renamed",
    "chain.activated",
    "chain.deactivated",
    "chain.morphed",
    "parameter.changed",
    "automation.started",
    "automation.stopped",
    "automation.time",
    "automation.lane.added",
    "automation.lane.deleted",
    "avb.endpoints.updated",
    "avb.connections.updated",
    "avb.connection.state.changed",
    "device.avb.stream.updated",
    "device.avb.ptp.updated",
    "device.avb.entities.updated",
    "effects_loop.state",
    "effects_loop.metrics",
    "effects_loop.calibration.progress",
    "lcd.audio",
    "lcd.system",
    "lcd.network",
    "lcd.service",
    "lcd.user",
    "lcd.alert",
)

ALL_KINDS: Final[frozenset[str]] = frozenset(PLATFORM_EVENT_KINDS)

_LCD_SURFACE_KIND_MAP: Final[dict[str, str]] = {
    "audio": "lcd.audio",
    "system": "lcd.system",
    "network": "lcd.network",
    "service": "lcd.service",
    "user": "lcd.user",
    "alert": "lcd.alert",
}


def _lookup_kind(mapping: dict[str, str], value: str, *, source: str) -> str:
    try:
        return mapping[value]
    except KeyError as exc:
        raise ValueError(f"Unknown {source} kind value: {value}") from exc


def normalize_platform_event_kind(value: str) -> str:
    normalized = str(value or "").strip()
    if normalized not in ALL_KINDS:
        raise ValueError(f"Unknown PlatformEvent kind: {value}")
    return normalized


def kind_for_lcd_surface_type(value: str) -> str:
    return _lookup_kind(_LCD_SURFACE_KIND_MAP, value, source="lcd surface")

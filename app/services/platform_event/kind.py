"""Canonical PlatformEvent kind taxonomy and legacy kind normalization."""

from __future__ import annotations

from typing import Final


# Canonical kinds from the PlatformEvent control-plane design, plus explicit
# legacy compatibility kinds needed for total-function mappings during migration.
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

_LEGACY_EVENT_BUS_KIND_MAP: Final[dict[str, str]] = {
    "node.online": "node.online",
    "node.offline": "node.offline",
    "node.failover": "node.failover",
    "flow.assigned": "audio.path.changed",
    "flow.unassigned": "audio.path.changed",
    "config.updated": "config.updated",
    "audio_path.changed": "audio.path.changed",
}

_LEGACY_CLUSTER_KIND_MAP: Final[dict[str, str]] = {
    "node.joined": "node.online",
    "node.left": "node.offline",
    "node.updated": "config.updated",
    "node.failed": "node.offline",
    "node.recovered": "node.recovered",
    "update.started": "cluster.update.started",
    "update.completed": "cluster.update.completed",
    "update.failed": "cluster.update.failed",
    "update.rolled_back": "cluster.update.rolled_back",
    "config.changed": "config.changed",
    "config.sync_requested": "config.sync.requested",
    "config.sync_completed": "config.sync.completed",
    "config.pushed": "config.pushed",
    "config.rolled_back": "config.rolled_back",
    "config.synced": "config.synced",
    "health.degraded": "system.health.degraded",
    "health.recovered": "system.health.recovered",
    "health.critical": "system.health.critical",
    "failover.initiated": "failover.initiated",
    "failover.completed": "failover.completed",
    "failover.failed": "failover.failed",
    "metrics.collected": "metrics.collected",
    "performance.alert": "system.performance.alert",
    "midi.port.discovered": "midi.port.discovered",
    "midi.port.lost": "midi.port.lost",
    "midi.node.discovered": "midi.node.discovered",
    "midi.node.lost": "midi.node.lost",
    "midi.connection.requested": "midi.connection.requested",
    "midi.connection.established": "midi.connection.established",
    "midi.connection.failed": "midi.connection.failed",
    "midi.connection.lost": "midi.connection.lost",
    "midi.failover.triggered": "midi.failover.triggered",
    "midi.failover.completed": "midi.failover.completed",
    "midi.clock.master_elected": "midi.clock.master.elected",
    "midi.clock.drift_detected": "midi.clock.drift",
    "midi.profile.shared": "midi.profile.shared",
    "system.alert": "system.status",
    "maintenance.started": "maintenance.started",
    "maintenance.completed": "maintenance.completed",
}

_LEGACY_EVENT_PUBLISHER_KIND_MAP: Final[dict[str, str]] = {
    "chain_created": "chain.created",
    "chain_deleted": "chain.deleted",
    "chain_renamed": "chain.renamed",
    "chain_activated": "chain.activated",
    "chain_deactivated": "chain.deactivated",
    "chain_morphed": "chain.morphed",
    "plugin_added": "plugin.added",
    "plugin_removed": "plugin.removed",
    "plugin_bypassed": "plugin.bypassed",
    "plugin_parameter_changed": "plugin.parameter.changed",
    "param_changed": "parameter.changed",
    "preset_loaded": "plugin.preset.loaded",
    "automation_started": "automation.started",
    "automation_stopped": "automation.stopped",
    "automation_time": "automation.time",
    "automation_lane_added": "automation.lane.added",
    "automation_lane_deleted": "automation.lane.deleted",
    "avb_endpoints_updated": "avb.endpoints.updated",
    "avb_connections_updated": "avb.connections.updated",
    "avb_connection_state_changed": "avb.connection.state.changed",
    "avb_streams_updated": "device.avb.stream.updated",
    "avb_ptp_updated": "device.avb.ptp.updated",
    "avb_avdecc_entities_updated": "device.avb.entities.updated",
    "effects_loop_state": "effects_loop.state",
    "effects_loop_metrics": "effects_loop.metrics",
    "effects_loop_calibration_progress": "effects_loop.calibration.progress",
    "system_status": "system.status",
    "audio_engine_status": "audio.engine.status",
}

_LEGACY_LCD_KIND_MAP: Final[dict[str, str]] = {
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


def kind_for_event_bus_value(value: str) -> str:
    return _lookup_kind(_LEGACY_EVENT_BUS_KIND_MAP, value, source="event_bus")


def kind_for_cluster_event_value(value: str) -> str:
    return _lookup_kind(_LEGACY_CLUSTER_KIND_MAP, value, source="cluster")


def kind_for_event_publisher_value(value: str) -> str:
    return _lookup_kind(_LEGACY_EVENT_PUBLISHER_KIND_MAP, value, source="event_publisher")


def kind_for_lcd_event_value(value: str) -> str:
    return _lookup_kind(_LEGACY_LCD_KIND_MAP, value, source="lcd")

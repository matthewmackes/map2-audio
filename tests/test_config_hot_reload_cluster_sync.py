from __future__ import annotations

import asyncio
import inspect
import json
from datetime import datetime, timezone

from app.services.cluster.distributed_event_bus import ClusterEvent, EventType
from app.services.config_hot_reload import ConfigurationHotReloader


class _FakeConfigManager:
    def __init__(self, config_path):
        self.config_path = config_path
        self._config = {"midi": {"enabled": True}}

    def get(self, key, default=None):
        value = self._config
        for part in key.split("."):
            if isinstance(value, dict) and part in value:
                value = value[part]
            else:
                return default
        return value

    def get_all(self):
        return json.loads(json.dumps(self._config))

    def set(self, key, value, save=True):
        target = self._config
        parts = key.split(".")
        for part in parts[:-1]:
            target = target.setdefault(part, {})
        target[parts[-1]] = value
        if save:
            with open(self.config_path, "w", encoding="utf-8") as handle:
                json.dump(self._config, handle)
        return True

    def reload(self):
        with open(self.config_path, "r", encoding="utf-8") as handle:
            self._config = json.load(handle)


class _FakeIdentity:
    def get_node_id(self):
        return "local-node"

    def get_role(self):
        return "AUDIO-NODE"


class _FakeEventBus:
    def __init__(self):
        self.subscribers = {}
        self.published = []

    def subscribe(self, event_type, callback):
        self.subscribers.setdefault(event_type, []).append(callback)
        return True

    async def publish_event(self, event):
        self.published.append(event)
        for callback in self.subscribers.get(event.event_type, []):
            if inspect.iscoroutinefunction(callback):
                await callback(event)
            else:
                callback(event)
        return True


def test_config_hot_reloader_broadcasts_and_applies_remote_events(monkeypatch, tmp_path):
    config_path = tmp_path / "config.json"
    config_path.write_text('{"midi": {"enabled": true}}', encoding="utf-8")

    manager = _FakeConfigManager(config_path)
    event_bus = _FakeEventBus()

    monkeypatch.setattr("app.config.get_config", lambda: manager)
    monkeypatch.setattr(
        "app.services.cluster.enhanced_node_identity.get_enhanced_node_identity",
        lambda: _FakeIdentity(),
    )
    monkeypatch.setattr(
        "app.services.cluster.distributed_event_bus.get_event_bus",
        lambda: event_bus,
    )

    reloader = ConfigurationHotReloader(str(config_path))

    asyncio.run(reloader.apply_runtime_change("midi.enabled", False, scope="cluster", broadcast=True))

    assert manager.get("midi.enabled") is False
    assert len(event_bus.published) == 1
    broadcast = event_bus.published[0]
    assert broadcast.event_type is EventType.CONFIG_CHANGED
    assert broadcast.details["key"] == "midi.enabled"
    assert broadcast.details["value"] is False
    assert broadcast.details["scope"] == "cluster"

    remote_event = ClusterEvent(
        event_type=EventType.CONFIG_CHANGED,
        timestamp=datetime.now(timezone.utc),
        source_node_id="peer-node",
        message="peer updated midi.enabled",
        details={
            "key": "midi.enabled",
            "value": True,
            "scope": "role:AUDIO-NODE",
            "source_node_id": "peer-node",
        },
    )

    asyncio.run(reloader._on_cluster_config_changed(remote_event))

    assert manager.get("midi.enabled") is True
    assert len(event_bus.published) == 1

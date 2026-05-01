"""T2480-5: device→consumer binding lifecycle tests.

Covers: add_binding (insert + replace-by-key), remove_binding,
list_bindings_for_device, list_devices_for_consumer (reverse-link).
"""

import asyncio
from datetime import datetime, timezone

import pytest

from app import database as database_module
from app.services.midi_hub.device_registry import (
    MidiDeviceBinding,
    MidiDeviceProfile,
    MidiDeviceRegistry,
)
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import VirtualMidiPort


def _init_temp_db(tmp_path):
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'midi-hub-bindings.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def _bind(consumer_id: str, source: str = "brain-setup-task") -> MidiDeviceBinding:
    return MidiDeviceBinding(
        consumer_type="snapshot",
        consumer_id=consumer_id,
        consumer_name=f"snapshot-{consumer_id}",
        bound_at=datetime.now(timezone.utc).isoformat(),
        source=source,
    )


def _seed_one_device(tmp_path):
    _init_temp_db(tmp_path)

    async def _setup():
        hub = MidiHub(auto_discover_alsa=False)
        registry = MidiDeviceRegistry(hub)
        custom = MidiDeviceProfile(
            profile_id="kbd_test",
            name="Test Keyboard",
            match_patterns=["test kbd"],
            default_channel=1,
        )
        registry.add_custom_profile(custom)
        port = VirtualMidiPort(port_id="p1", name="Test KBD Surface")
        hub.register_port(port)
        payload = await registry.refresh()
        assert payload["count"] == 1
        return registry, payload["devices"][0]["device_id"]

    return asyncio.run(_setup())


def test_add_binding_appends_to_empty_device(tmp_path):
    registry, device_id = _seed_one_device(tmp_path)

    ok = registry.add_binding(device_id=device_id, binding=_bind("42"))
    assert ok is True

    bindings = registry.list_bindings_for_device(device_id=device_id)
    assert len(bindings) == 1
    assert bindings[0].consumer_id == "42"
    assert bindings[0].source == "brain-setup-task"


def test_add_binding_replaces_same_consumer_type_and_source(tmp_path):
    """Re-binding the same device with the same (consumer_type, source)
    pair replaces the prior binding rather than appending. Two snapshots
    written by brain-setup-task to the same device collapse to the
    most-recent one."""
    registry, device_id = _seed_one_device(tmp_path)

    registry.add_binding(device_id=device_id, binding=_bind("42"))
    registry.add_binding(device_id=device_id, binding=_bind("99"))

    bindings = registry.list_bindings_for_device(device_id=device_id)
    assert len(bindings) == 1
    assert bindings[0].consumer_id == "99"


def test_add_binding_keeps_distinct_sources(tmp_path):
    """A snapshot binding from brain-setup-task and one from manual
    coexist; only same-source is replace-by-key."""
    registry, device_id = _seed_one_device(tmp_path)

    registry.add_binding(device_id=device_id, binding=_bind("42", source="brain-setup-task"))
    registry.add_binding(device_id=device_id, binding=_bind("99", source="manual"))

    bindings = registry.list_bindings_for_device(device_id=device_id)
    consumer_ids = {b.consumer_id for b in bindings}
    sources = {b.source for b in bindings}
    assert consumer_ids == {"42", "99"}
    assert sources == {"brain-setup-task", "manual"}


def test_remove_binding_by_consumer_id(tmp_path):
    registry, device_id = _seed_one_device(tmp_path)

    registry.add_binding(device_id=device_id, binding=_bind("42"))
    registry.add_binding(device_id=device_id, binding=_bind("99", source="manual"))

    removed = registry.remove_binding(
        device_id=device_id, consumer_type="snapshot", consumer_id="42"
    )
    assert removed is True

    bindings = registry.list_bindings_for_device(device_id=device_id)
    assert len(bindings) == 1
    assert bindings[0].consumer_id == "99"


def test_remove_binding_returns_false_when_not_present(tmp_path):
    registry, device_id = _seed_one_device(tmp_path)
    removed = registry.remove_binding(
        device_id=device_id, consumer_type="snapshot", consumer_id="404"
    )
    assert removed is False


def test_add_binding_returns_false_for_unknown_device(tmp_path):
    registry, _ = _seed_one_device(tmp_path)
    ok = registry.add_binding(device_id="does-not-exist", binding=_bind("42"))
    assert ok is False


def test_list_devices_for_consumer_returns_reverse_link(tmp_path):
    registry, device_id = _seed_one_device(tmp_path)

    registry.add_binding(device_id=device_id, binding=_bind("99"))

    device_ids = registry.list_devices_for_consumer(
        consumer_type="snapshot", consumer_id="99"
    )
    assert device_ids == [device_id]

    # Different consumer → empty list.
    other = registry.list_devices_for_consumer(
        consumer_type="snapshot", consumer_id="500"
    )
    assert other == []


def test_to_dict_includes_bindings(tmp_path):
    registry, device_id = _seed_one_device(tmp_path)

    registry.add_binding(device_id=device_id, binding=_bind("42"))

    snapshot = registry.snapshot()
    assert snapshot["count"] == 1
    device_dict = snapshot["devices"][0]
    assert "bindings" in device_dict
    assert len(device_dict["bindings"]) == 1
    assert device_dict["bindings"][0]["consumer_id"] == "42"

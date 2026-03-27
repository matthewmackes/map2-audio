import asyncio

from app.services.juce_engine_service import JuceEngineService


class _FakePedalboardEngine:
    def __init__(self, items):
        self._items = list(items)

    def get_current_pedalboard(self):
        return {"name": "Test", "items": list(self._items)}


class _FakeTelemetryEngine(_FakePedalboardEngine):
    def __init__(self, items, vu_levels, cpu_metrics):
        super().__init__(items)
        self._vu_levels = list(vu_levels)
        self._cpu_metrics = dict(cpu_metrics)

    def get_plugin_vu_levels(self):
        return list(self._vu_levels)

    def get_cpu_metrics(self):
        return dict(self._cpu_metrics)


def test_get_instance_id_for_uri_prefers_matching_position_for_duplicates():
    service = JuceEngineService()
    service._engine = _FakePedalboardEngine([  # noqa: SLF001 - explicit unit isolation
        {"uri": "urn:test:duplicate", "instance_id": 101, "position": 0},
        {"uri": "urn:test:duplicate", "instance_id": 202, "position": 3},
    ])

    assert service._get_instance_id_for_uri("urn:test:duplicate", 3) == 202  # noqa: SLF001


def test_get_instance_id_for_uri_falls_back_to_first_match_without_position():
    service = JuceEngineService()
    service._engine = _FakePedalboardEngine([  # noqa: SLF001 - explicit unit isolation
        {"uri": "urn:test:duplicate", "instance_id": 101},
        {"uri": "urn:test:duplicate", "instance_id": 202},
    ])

    assert service._get_instance_id_for_uri("urn:test:duplicate") == 101  # noqa: SLF001


def test_resolve_instance_id_prefers_live_position_over_stale_fallback_instance():
    service = JuceEngineService()
    service._engine = _FakePedalboardEngine([  # noqa: SLF001 - explicit unit isolation
        {"uri": "urn:test:duplicate", "instance_id": 202, "position": 3},
    ])

    resolved = asyncio.run(service.resolve_instance_id("urn:test:duplicate", 3, 999))

    assert resolved == 202


def test_get_plugin_vu_levels_attaches_runtime_identity_to_duplicate_uris():
    service = JuceEngineService()
    service._engine = _FakeTelemetryEngine(  # noqa: SLF001 - explicit unit isolation
        [
            {"uri": "urn:test:duplicate", "instance_id": 101, "position": 0},
            {"uri": "urn:test:duplicate", "instance_id": 202, "position": 1},
        ],
        [
            {"uri": "urn:test:duplicate", "input": 0.11, "output": 0.22},
            {"uri": "urn:test:duplicate", "input": 0.33, "output": 0.44},
        ],
        {"per_plugin_percent": {}},
    )

    levels = asyncio.run(service.get_plugin_vu_levels())

    assert levels[0]["instance_id"] == 101
    assert levels[0]["position"] == 0
    assert levels[1]["instance_id"] == 202
    assert levels[1]["position"] == 1


def test_get_runtime_plugin_cpu_telemetry_uses_instance_ids():
    service = JuceEngineService()
    service._engine = _FakeTelemetryEngine(  # noqa: SLF001 - explicit unit isolation
        [
            {"uri": "urn:test:duplicate", "name": "Duplicate A", "instance_id": 101, "position": 0, "latency_samples": 64},
            {"uri": "urn:test:duplicate", "name": "Duplicate B", "instance_id": 202, "position": 1, "latency_samples": 32},
        ],
        [],
        {"per_plugin_percent": {"101": 3.5, 202: 5.25}},
    )

    telemetry = asyncio.run(service.get_runtime_plugin_cpu_telemetry())

    assert telemetry == [
        {
            "uri": "urn:test:duplicate",
            "name": "Duplicate A",
            "cpu_percent": 3.5,
            "instance_id": 101,
            "position": 0,
            "plugin_position": 0,
            "latency_samples": 64,
        },
        {
            "uri": "urn:test:duplicate",
            "name": "Duplicate B",
            "cpu_percent": 5.25,
            "instance_id": 202,
            "position": 1,
            "plugin_position": 1,
            "latency_samples": 32,
        },
    ]

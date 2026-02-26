import asyncio

from app.services.juce_engine_service import JuceEngineService


class _FakeLoopEngine:
    def __init__(self):
        self.calls = []

    def set_external_loop_definitions(self, payload):
        self.calls.append(("definitions", payload))
        return True

    def set_chain_loop_insertions(self, chain_id, payload):
        self.calls.append(("insertions", chain_id, payload))
        return True

    def set_loop_bypass(self, loop_id, bypass):
        self.calls.append(("bypass", loop_id, bypass))
        return True

    def calibrate_loop(self, loop_id, options):
        self.calls.append(("calibrate", loop_id, options))
        return True

    def get_loop_metrics(self, loop_id):
        self.calls.append(("metrics", loop_id))
        return [{"loop_id": loop_id, "measured_added_latency_ms": 0.31, "compensation_samples": 15}]


def test_external_loop_control_path_wrappers_delegate_to_engine():
    service = JuceEngineService()
    fake_engine = _FakeLoopEngine()
    service._engine = fake_engine  # noqa: SLF001 - direct injection for isolated unit test

    async def _run():
        assert await service.set_external_loop_definitions([{"loop_id": "loop_1"}]) is True
        assert await service.set_chain_loop_insertions(4, [{"insertion_id": "lin_1"}]) is True
        assert await service.set_loop_bypass("loop_1", True) is True
        assert await service.calibrate_loop("loop_1", {"frames": 256}) is True
        metrics = await service.get_loop_metrics("loop_1")
        assert isinstance(metrics, list)
        assert metrics[0]["loop_id"] == "loop_1"

    asyncio.run(_run())

    assert ("definitions", [{"loop_id": "loop_1"}]) in fake_engine.calls
    assert ("insertions", 4, [{"insertion_id": "lin_1"}]) in fake_engine.calls
    assert ("bypass", "loop_1", True) in fake_engine.calls
    assert ("calibrate", "loop_1", {"frames": 256}) in fake_engine.calls
    assert ("metrics", "loop_1") in fake_engine.calls


def test_external_loop_control_path_wrappers_handle_missing_engine():
    service = JuceEngineService()
    service._engine = None  # noqa: SLF001 - explicit missing-engine behavior check

    async def _run():
        assert await service.set_external_loop_definitions([]) is False
        assert await service.set_chain_loop_insertions(1, []) is False
        assert await service.set_loop_bypass("loop_2", False) is False
        assert await service.calibrate_loop("loop_2", {}) is False
        assert await service.get_loop_metrics("loop_2") == []

    asyncio.run(_run())


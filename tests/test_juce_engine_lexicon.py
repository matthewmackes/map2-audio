import asyncio

from app.routes import chains as chains_routes
from app.services import juce_engine_service as juce_service_module
from app.services.juce_engine_service import JuceEngineService, LEXICON_MPX1_URI


class _FakeLexiconEngine:
    def __init__(self):
        self.calls = []
        self.plugins = [{"uri": "urn:test:plugin", "name": "Test"}]
        self.lexicon_loaded = False
        self.lexicon_instance_id = 91

    def list_plugins(self):
        self.calls.append(("list_plugins",))
        return list(self.plugins)

    def load_plugin(self, uri):
        self.calls.append(("load_plugin", uri))
        return 7

    def unload_plugin(self, instance_id):
        self.calls.append(("unload_plugin", instance_id))
        return True

    def load_lexicon_plugin(self):
        self.calls.append(("load_lexicon_plugin",))
        self.lexicon_loaded = True
        return self.lexicon_instance_id

    def unload_lexicon_plugin(self):
        self.calls.append(("unload_lexicon_plugin",))
        self.lexicon_loaded = False
        return True

    def is_lexicon_loaded(self):
        self.calls.append(("is_lexicon_loaded",))
        return self.lexicon_loaded

    def get_lexicon_instance_id(self):
        self.calls.append(("get_lexicon_instance_id",))
        return self.lexicon_instance_id if self.lexicon_loaded else -1

    def calibrate_lexicon_latency(self):
        self.calls.append(("calibrate_lexicon_latency",))
        return True

    def set_lexicon_bypass(self, bypass):
        self.calls.append(("set_lexicon_bypass", bypass))
        return True

    def set_lexicon_mix(self, mix):
        self.calls.append(("set_lexicon_mix", mix))
        return True

    def set_lexicon_send_gain(self, db):
        self.calls.append(("set_lexicon_send_gain", db))
        return True

    def set_lexicon_return_gain(self, db):
        self.calls.append(("set_lexicon_return_gain", db))
        return True


class _LegacyEngine:
    def __init__(self):
        self.calls = []

    def list_plugins(self):
        self.calls.append(("list_plugins",))
        return []

    def load_plugin(self, uri):
        self.calls.append(("load_plugin", uri))
        return 12

    def unload_plugin(self, instance_id):
        self.calls.append(("unload_plugin", instance_id))
        return True


def test_lexicon_listing_and_lifecycle_wrappers():
    service = JuceEngineService()
    fake_engine = _FakeLexiconEngine()
    service._engine = fake_engine  # noqa: SLF001 - explicit unit isolation

    async def _run():
        plugins = await service.list_plugins()
        lexicon_plugins = [p for p in plugins if p.get("uri") == LEXICON_MPX1_URI]
        assert len(lexicon_plugins) == 1

        fake_engine.plugins.append({"uri": LEXICON_MPX1_URI, "name": "Already Added"})
        plugins_deduped = await service.list_plugins()
        lexicon_plugins_deduped = [p for p in plugins_deduped if p.get("uri") == LEXICON_MPX1_URI]
        assert len(lexicon_plugins_deduped) == 1

        lexicon_id = await service.load_plugin(LEXICON_MPX1_URI)
        assert lexicon_id == fake_engine.lexicon_instance_id
        assert ("calibrate_lexicon_latency",) in fake_engine.calls

        # Second load should reuse existing singleton instance.
        lexicon_id_reused = await service.load_plugin(LEXICON_MPX1_URI)
        assert lexicon_id_reused == fake_engine.lexicon_instance_id
        assert fake_engine.calls.count(("load_lexicon_plugin",)) == 1

        assert await service.set_lexicon_bypass(True) is True
        assert await service.set_lexicon_mix(0.75) is True
        assert await service.set_lexicon_send_gain(-3.0) is True
        assert await service.set_lexicon_return_gain(2.5) is True
        assert await service.calibrate_lexicon_latency() is True

        assert await service.unload_plugin(lexicon_id) is True
        assert ("unload_lexicon_plugin",) in fake_engine.calls

        assert await service.unload_plugin(777) is True
        assert ("unload_plugin", 777) in fake_engine.calls

    asyncio.run(_run())


def test_lexicon_wrappers_fail_closed_for_legacy_engine():
    service = JuceEngineService()
    legacy = _LegacyEngine()
    service._engine = legacy  # noqa: SLF001 - explicit unit isolation

    async def _run():
        # Falls back to generic path when dedicated Lexicon binding is absent.
        assert await service.load_plugin(LEXICON_MPX1_URI) == 12
        assert ("load_plugin", LEXICON_MPX1_URI) in legacy.calls

        assert await service.calibrate_lexicon_latency() is False
        assert await service.set_lexicon_bypass(True) is False
        assert await service.set_lexicon_mix(0.5) is False
        assert await service.set_lexicon_send_gain(-6.0) is False
        assert await service.set_lexicon_return_gain(1.0) is False

    asyncio.run(_run())


def test_chain_lexicon_routes_delegate_to_service(monkeypatch):
    class _FakeRouteService:
        def __init__(self):
            self.calls = []

        async def calibrate_lexicon_latency(self):
            self.calls.append(("calibrate",))
            return True

        async def set_lexicon_bypass(self, bypass):
            self.calls.append(("bypass", bypass))
            return True

        async def set_lexicon_mix(self, mix):
            self.calls.append(("mix", mix))
            return True

        async def set_lexicon_send_gain(self, gain_db):
            self.calls.append(("send", gain_db))
            return True

        async def set_lexicon_return_gain(self, gain_db):
            self.calls.append(("return", gain_db))
            return True

    fake = _FakeRouteService()
    monkeypatch.setattr(juce_service_module, "JuceEngineService", lambda: fake)

    assert asyncio.run(chains_routes.calibrate_lexicon()) == {"success": True}
    assert asyncio.run(chains_routes.set_lexicon_bypass({"bypass": True})) == {
        "success": True,
        "bypass": True,
    }
    assert asyncio.run(chains_routes.set_lexicon_mix({"mix": 0.4})) == {
        "success": True,
        "mix": 0.4,
    }
    assert asyncio.run(chains_routes.set_lexicon_send_gain({"gain_db": -3.5})) == {
        "success": True,
        "gain_db": -3.5,
    }
    assert asyncio.run(chains_routes.set_lexicon_return_gain({"gain_db": 2.0})) == {
        "success": True,
        "gain_db": 2.0,
    }

    assert ("calibrate",) in fake.calls
    assert ("bypass", True) in fake.calls
    assert ("mix", 0.4) in fake.calls
    assert ("send", -3.5) in fake.calls
    assert ("return", 2.0) in fake.calls

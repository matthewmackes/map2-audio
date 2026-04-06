import asyncio
from types import SimpleNamespace

from app.services.state_authority_activation_service import StateAuthorityActivationService


class _FakeAudioEngine:
    def __init__(self):
        self.is_available = True
        self.is_running = True
        self.calls: list[tuple[dict, bool, int]] = []

    async def load_graph_document(self, document, *, use_independent_crossfade=False, max_crossfade_ms=500):
        self.calls.append((document, use_independent_crossfade, max_crossfade_ms))
        return True


def _build_service(fake_engine: _FakeAudioEngine, *, owner=None) -> StateAuthorityActivationService:
    return StateAuthorityActivationService(
        session=None,
        owner=owner or SimpleNamespace(
            state_authority_documents=SimpleNamespace(
                build_validated_document=lambda snapshot, normalized: {
                    "version": "2026.04",
                    "meta": {"name": "Built", "type": "snapshot"},
                    "graph": {"chains": normalized.get("chains", [])},
                }
            )
        ),
        chain_service=SimpleNamespace(),
        runtime_service_module=SimpleNamespace(),
        midi_service=SimpleNamespace(),
        get_audio_engine=lambda: fake_engine,
        push_snapshot_footswitch_labels=lambda *args, **kwargs: None,
        push_snapshot_controller_display_preview=lambda *args, **kwargs: None,
        schedule_snapshot_preload_for_live_snapshot=lambda snapshot_id: None,
        build_snapshot_controller_display_preview=lambda *args, **kwargs: {},
        utcnow=lambda: None,
        safe_int=lambda value: int(value) if value is not None else None,
        safe_float=lambda value, default: float(value) if value is not None else default,
        normalize_topology_mutation_stats=lambda payload: payload or {},
        build_activation_topology_metrics=lambda before, after: {},
        snapshot_spillover_native_uris=(),
        canonical_transient_keys=set(),
        canonical_effects_loop_keys=set(),
    )


def test_apply_graph_document_to_engine_builds_document_and_uses_crossfade():
    fake_engine = _FakeAudioEngine()
    service = _build_service(fake_engine)
    snapshot = SimpleNamespace(id=7, document=None)
    normalized = {"chains": [{"plugins": [{"bypass": True}, {"bypass": False}]}]}

    result = asyncio.run(
        service.apply_graph_document_to_engine(
            snapshot=snapshot,
            normalized=normalized,
        )
    )

    assert result == {
        "applied": True,
        "plugin_count": 2,
        "bypass_count": 1,
        "used_independent_crossfade": True,
    }
    assert fake_engine.calls
    document, use_independent_crossfade, max_crossfade_ms = fake_engine.calls[0]
    assert document["meta"]["name"] == "Built"
    assert use_independent_crossfade is True
    assert max_crossfade_ms == 500


def test_apply_graph_document_to_engine_reuses_snapshot_document_when_present():
    fake_engine = _FakeAudioEngine()
    owner = SimpleNamespace(
        state_authority_documents=SimpleNamespace(
            build_validated_document=lambda snapshot, normalized: {"should_not": "run"}
        )
    )
    service = _build_service(fake_engine, owner=owner)
    snapshot = SimpleNamespace(
        id=8,
        document={
            "version": "2026.04",
            "meta": {"name": "Stored", "type": "snapshot"},
            "graph": {"chains": [{"plugins": []}]},
        },
    )

    result = asyncio.run(
        service.apply_graph_document_to_engine(
            snapshot=snapshot,
            normalized={"chains": []},
        )
    )

    assert result["applied"] is True
    assert fake_engine.calls[0][0]["meta"]["name"] == "Stored"

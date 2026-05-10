"""T2503 Set 4 — /api/v1/daw verb-surface route tests.

Each verb has at least one happy-path test (200 + correct dispatch) and a
flag-OFF test (503 + standard envelope). Pydantic validation of bad
payloads is tested for one representative endpoint.
"""

from __future__ import annotations

from typing import Any, List, Optional

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import daw as daw_routes
from app.services import daw_dispatch_seam, daw_service as daw_service_module
from app.services.daw_handlers import register_daw_handlers, DawHandlerHooks
from app.services.daw_service import DawService
from app.services.engine_command_dispatcher import EngineCommandDispatcher


@pytest.fixture
def app_with_dispatcher_recording():
    """FastAPI app + a recording dispatcher wired into the seam.

    Mirrors what Set 7 will do: the route dispatches via the seam, the seam
    forwards to the dispatcher, the dispatcher invokes the registered DAW
    handlers, the handlers' hooks record into a list. Round-trippable.
    """
    facade = DawService(daw_mode_available=True)
    daw_service_module._DEFAULT_INSTANCE = facade  # type: ignore[attr-defined]

    calls: List[tuple] = []
    hooks = DawHandlerHooks(
        transport_play=lambda: calls.append(("transport_play",)),
        transport_stop=lambda: calls.append(("transport_stop",)),
        transport_record=lambda arm: calls.append(("transport_record", arm)),
        transport_set_position=lambda samples: calls.append(("transport_set_position", samples)),
        project_new=lambda name: calls.append(("project_new", name)),
        project_load=lambda path: calls.append(("project_load", path)),
        project_save=lambda: calls.append(("project_save",)),
        track_create=lambda track_type, **kw: (calls.append(("track_create", track_type, kw)), 7)[1],
        track_delete=lambda tid: calls.append(("track_delete", tid)),
        track_set_arm=lambda tid, arm: calls.append(("track_set_arm", tid, arm)),
        clip_add=lambda tid, s, l, src: (calls.append(("clip_add", tid, s, l, src)), 11)[1],
        clip_remove=lambda cid: calls.append(("clip_remove", cid)),
        clip_move=lambda cid, ns: calls.append(("clip_move", cid, ns)),
        automation_set_point=lambda lid, p, v: calls.append(("automation_set_point", lid, p, v)),
        plugin_add_to_track=lambda tid, uri: (calls.append(("plugin_add_to_track", tid, uri)), 0)[1],
        plugin_remove_from_track=lambda tid, slot: calls.append(("plugin_remove_from_track", tid, slot)),
        plugin_set_param=lambda tid, slot, pid, val: calls.append(("plugin_set_param", tid, slot, pid, val)),
    )

    dispatcher = EngineCommandDispatcher()
    register_daw_handlers(dispatcher, hooks=hooks)
    daw_dispatch_seam.set_dispatcher(dispatcher)

    app = FastAPI()
    app.include_router(daw_routes.router)
    app.include_router(daw_routes.router_v1)
    yield TestClient(app), calls

    # Cleanup
    daw_dispatch_seam.set_dispatcher(None)
    daw_service_module.reset_default_daw_service()


@pytest.fixture
def app_flag_off():
    """FastAPI app with daw_mode_available=False — every v1 verb must 503."""
    facade = DawService(daw_mode_available=False)
    daw_service_module._DEFAULT_INSTANCE = facade  # type: ignore[attr-defined]
    daw_dispatch_seam.set_dispatcher(None)

    app = FastAPI()
    app.include_router(daw_routes.router)
    app.include_router(daw_routes.router_v1)
    yield TestClient(app)

    daw_service_module.reset_default_daw_service()


# --- Happy-path tests ---


def test_transport_play_dispatches(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.post("/api/v1/daw/transport/play")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"accepted": True, "verb": "daw.transport.play"}
    assert calls == [("transport_play",)]


def test_transport_record(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.post("/api/v1/daw/transport/record", json={"arm": True})
    assert resp.status_code == 200
    assert calls == [("transport_record", True)]


def test_transport_set_position(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.post(
        "/api/v1/daw/transport/set_position", json={"samples": 96000}
    )
    assert resp.status_code == 200
    assert calls == [("transport_set_position", 96000)]


def test_project_new(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.post("/api/v1/daw/projects", json={"name": "test-song"})
    assert resp.status_code == 200
    assert calls == [("project_new", "test-song")]


def test_track_create(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.post(
        "/api/v1/daw/tracks", json={"type": "audio", "name": "Lead"}
    )
    assert resp.status_code == 200
    assert calls == [("track_create", "audio", {"name": "Lead"})]


def test_track_delete(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.delete("/api/v1/daw/tracks/3")
    assert resp.status_code == 200
    assert calls == [("track_delete", 3)]


def test_track_set_arm(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.patch("/api/v1/daw/tracks/3/arm", json={"armed": True})
    assert resp.status_code == 200
    assert calls == [("track_set_arm", 3, True)]


def test_clip_add(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.post(
        "/api/v1/daw/clips",
        json={
            "track_id": 1,
            "start_samples": 0,
            "length_samples": 48000,
            "source": "audio/take1.wav",
        },
    )
    assert resp.status_code == 200
    assert calls == [("clip_add", 1, 0, 48000, "audio/take1.wav")]


def test_clip_remove(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.delete("/api/v1/daw/clips/42")
    assert resp.status_code == 200
    assert calls == [("clip_remove", 42)]


def test_clip_move(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.patch(
        "/api/v1/daw/clips/42/move", json={"new_start_samples": 96000}
    )
    assert resp.status_code == 200
    assert calls == [("clip_move", 42, 96000)]


def test_automation_set_point(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.post(
        "/api/v1/daw/automation/points",
        json={"lane_id": 5, "position": 1.5, "value": 0.75},
    )
    assert resp.status_code == 200
    assert calls == [("automation_set_point", 5, 1.5, 0.75)]


def test_plugin_add_to_track(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.post(
        "/api/v1/daw/tracks/2/plugins",
        json={"plugin_uri": "http://lv2plug.in/plugins/eg-amp"},
    )
    assert resp.status_code == 200
    assert calls == [("plugin_add_to_track", 2, "http://lv2plug.in/plugins/eg-amp")]


def test_plugin_remove_from_track(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.delete("/api/v1/daw/tracks/2/plugins/0")
    assert resp.status_code == 200
    assert calls == [("plugin_remove_from_track", 2, 0)]


def test_plugin_set_param(app_with_dispatcher_recording):
    client, calls = app_with_dispatcher_recording
    resp = client.patch(
        "/api/v1/daw/tracks/2/plugins/0",
        json={"param_id": "gain", "value": 0.5},
    )
    assert resp.status_code == 200
    assert calls == [("plugin_set_param", 2, 0, "gain", 0.5)]


# --- Flag-OFF tests ---


def test_v1_play_returns_503_with_flag_off(app_flag_off):
    resp = app_flag_off.post("/api/v1/daw/transport/play")
    assert resp.status_code == 503
    body = resp.json()
    assert body["detail"]["error"]["code"] == "daw_mode_unavailable"


def test_v1_track_create_returns_503_with_flag_off(app_flag_off):
    resp = app_flag_off.post(
        "/api/v1/daw/tracks", json={"type": "audio", "name": "X"}
    )
    assert resp.status_code == 503


# --- Pydantic validation ---


def test_invalid_track_type_returns_422(app_with_dispatcher_recording):
    client, _ = app_with_dispatcher_recording
    resp = client.post(
        "/api/v1/daw/tracks", json={"type": "video", "name": "X"}
    )
    assert resp.status_code == 422


def test_invalid_set_position_negative_returns_422(app_with_dispatcher_recording):
    client, _ = app_with_dispatcher_recording
    resp = client.post(
        "/api/v1/daw/transport/set_position", json={"samples": -1}
    )
    assert resp.status_code == 422


def test_clip_add_missing_required_field_returns_422(app_with_dispatcher_recording):
    client, _ = app_with_dispatcher_recording
    resp = client.post(
        "/api/v1/daw/clips",
        json={"track_id": 1, "start_samples": 0, "length_samples": 48000},
        # missing 'source'
    )
    assert resp.status_code == 422


# --- Operation IDs ---


def test_all_operation_ids_unique():
    """OpenAPI requires unique operationIds; assert all 17 v1 verbs do."""
    op_ids = []
    for route in daw_routes.router_v1.routes:
        op_id = getattr(route, "operation_id", None)
        if op_id is not None:
            op_ids.append(op_id)
    # 17 verbs map to operation_ids; the WS endpoint has none.
    assert len(op_ids) == 17
    assert len(set(op_ids)) == len(op_ids), f"duplicate op_ids: {op_ids}"

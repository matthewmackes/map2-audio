"""T2503 Set 5 — DAW project service tests.

Validates filesystem layout, schema enforcement, mutation correctness, and
the project-service hook bundle.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.daw_project_schema import (
    DawProjectSchemaError,
    validate_daw_project,
)
from app.services.daw_project_service import (
    DawProject,
    DawProjectError,
    DawProjectService,
    InvalidProjectName,
    ProjectAlreadyExists,
    ProjectNotFound,
    ProjectValidationError,
)


@pytest.fixture
def service(tmp_path: Path) -> DawProjectService:
    return DawProjectService(base_dir=tmp_path)


# --- list / create / load / save / delete ---


def test_list_returns_empty_when_no_base_dir(tmp_path: Path) -> None:
    svc = DawProjectService(base_dir=tmp_path / "missing")
    assert svc.list_projects() == []


def test_create_project_writes_canonical_layout(service: DawProjectService) -> None:
    proj = service.create_project("test-song")
    assert proj.path.is_dir()
    assert (proj.path / "project.json").is_file()
    assert (proj.path / "audio").is_dir()
    assert (proj.path / "render").is_dir()
    assert proj.dirty is False  # save_project clears the flag


def test_create_project_rejects_invalid_names(service: DawProjectService) -> None:
    for bad in ("", "../escape", "name/with/slash", "x" * 256):
        with pytest.raises(InvalidProjectName):
            service.create_project(bad)


def test_create_project_rejects_duplicate(service: DawProjectService) -> None:
    service.create_project("dupe")
    with pytest.raises(ProjectAlreadyExists):
        service.create_project("dupe")


def test_load_project_round_trips(service: DawProjectService) -> None:
    created = service.create_project("rt")
    service.add_track(created, "audio", name="Drums")
    service.save_project(created)
    loaded = service.load_project("rt")
    assert loaded.document["tracks"][0]["name"] == "Drums"


def test_load_project_missing_returns_404(service: DawProjectService) -> None:
    with pytest.raises(ProjectNotFound):
        service.load_project("nope")


def test_load_project_with_corrupt_json_raises(service: DawProjectService) -> None:
    proj = service.create_project("corrupt")
    proj.path.joinpath("project.json").write_text("{not json")
    with pytest.raises(Exception):
        service.load_project("corrupt")


def test_load_project_with_invalid_schema_raises(service: DawProjectService) -> None:
    proj = service.create_project("bad-schema")
    proj.path.joinpath("project.json").write_text(
        json.dumps({"schema_version": "v2", "name": "x"})
    )
    with pytest.raises(ProjectValidationError):
        service.load_project("bad-schema")


def test_list_projects_returns_sorted(service: DawProjectService) -> None:
    for n in ("c", "a", "b"):
        service.create_project(n)
    assert service.list_projects() == ["a", "b", "c"]


def test_delete_project_removes_directory(service: DawProjectService) -> None:
    proj = service.create_project("kill-me")
    path = proj.path
    service.delete_project("kill-me")
    assert not path.exists()


def test_delete_project_refuses_unknown_entries(
    service: DawProjectService,
) -> None:
    proj = service.create_project("guarded")
    (proj.path / "stranger.txt").write_text("hello")
    with pytest.raises(DawProjectError):
        service.delete_project("guarded")


# --- mutations ---


def test_add_track_assigns_sequential_ids(service: DawProjectService) -> None:
    proj = service.create_project("ids")
    a = service.add_track(proj, "audio")
    b = service.add_track(proj, "midi", name="Synth")
    assert (a, b) == (0, 1)
    assert proj.document["tracks"][1]["name"] == "Synth"


def test_remove_track_cascades_clips_and_plugins(service: DawProjectService) -> None:
    proj = service.create_project("cascade")
    tid = service.add_track(proj, "audio")
    service.add_clip(proj, tid, 0, 48000, "audio/x.wav")
    service.add_plugin(proj, tid, "map2:fx:nam")
    service.remove_track(proj, tid)
    assert proj.document["tracks"] == []
    assert proj.document["clips"] == []
    assert proj.document["plugin_instances"] == []


def test_add_clip_validates_track_exists(service: DawProjectService) -> None:
    proj = service.create_project("c2")
    with pytest.raises(DawProjectError):
        service.add_clip(proj, 99, 0, 48000, "audio/x.wav")


def test_move_clip(service: DawProjectService) -> None:
    proj = service.create_project("mv")
    tid = service.add_track(proj, "audio")
    cid = service.add_clip(proj, tid, 0, 48000, "audio/x.wav")
    service.move_clip(proj, cid, 96000)
    assert proj.document["clips"][0]["start_samples"] == 96000


def test_add_plugin_assigns_per_track_slot(service: DawProjectService) -> None:
    proj = service.create_project("pl")
    t0 = service.add_track(proj, "audio")
    t1 = service.add_track(proj, "audio")
    assert service.add_plugin(proj, t0, "uri-a") == 0
    assert service.add_plugin(proj, t0, "uri-b") == 1
    assert service.add_plugin(proj, t1, "uri-c") == 0  # per-track namespace


def test_set_plugin_param(service: DawProjectService) -> None:
    proj = service.create_project("pp")
    tid = service.add_track(proj, "audio")
    slot = service.add_plugin(proj, tid, "uri")
    service.set_plugin_param(proj, tid, slot, "gain", 0.5)
    assert proj.document["plugin_instances"][0]["params"]["gain"] == 0.5


def test_remove_plugin(service: DawProjectService) -> None:
    proj = service.create_project("rm-plug")
    tid = service.add_track(proj, "audio")
    slot = service.add_plugin(proj, tid, "uri")
    service.remove_plugin(proj, tid, slot)
    assert proj.document["plugin_instances"] == []
    with pytest.raises(DawProjectError):
        service.remove_plugin(proj, tid, slot)


def test_set_automation_point_on_existing_lane(service: DawProjectService) -> None:
    proj = service.create_project("auto")
    proj.document["automation_lanes"].append(
        {"id": 0, "target_kind": "track_gain", "target_ref": "0", "points": []}
    )
    service.set_automation_point(proj, 0, position=2.5, value=0.75)
    pts = proj.document["automation_lanes"][0]["points"]
    assert pts == [{"position": 2.5, "value": 0.75}]
    # Re-set at same position updates rather than adds.
    service.set_automation_point(proj, 0, position=2.5, value=0.25)
    assert proj.document["automation_lanes"][0]["points"] == [
        {"position": 2.5, "value": 0.25}
    ]


def test_set_automation_point_unknown_lane(service: DawProjectService) -> None:
    proj = service.create_project("auto2")
    with pytest.raises(DawProjectError):
        service.set_automation_point(proj, 99, 0.0, 0.0)


# --- schema validator ---


def test_schema_validator_accepts_minimal() -> None:
    validate_daw_project(
        {
            "schema_version": "v1",
            "name": "x",
            "sample_rate": 48000,
            "tracks": [],
            "clips": [],
            "plugin_instances": [],
            "automation_lanes": [],
        }
    )


def test_schema_validator_rejects_wrong_version() -> None:
    with pytest.raises(DawProjectSchemaError):
        validate_daw_project(
            {
                "schema_version": "v2",
                "name": "x",
                "sample_rate": 48000,
                "tracks": [],
                "clips": [],
                "plugin_instances": [],
                "automation_lanes": [],
            }
        )


def test_schema_validator_requires_name() -> None:
    with pytest.raises(DawProjectSchemaError):
        validate_daw_project(
            {
                "schema_version": "v1",
                "sample_rate": 48000,
                "tracks": [],
                "clips": [],
                "plugin_instances": [],
                "automation_lanes": [],
            }
        )


# --- project hooks (integration with Set 4 dispatcher path) ---


def test_project_service_hooks_round_trip(tmp_path: Path) -> None:
    """Hooks built by build_project_service_hooks run a full
    create→track→clip→save flow without touching the FastAPI surface."""
    from app.services.daw_handlers import register_daw_handlers
    from app.services.daw_project_hooks import (
        ActiveProjectSlot,
        build_project_service_hooks,
    )
    from app.services.engine_command_dispatcher import EngineCommandDispatcher

    svc = DawProjectService(base_dir=tmp_path)
    slot = ActiveProjectSlot()
    hooks = build_project_service_hooks(service=svc, active=slot)

    dispatcher = EngineCommandDispatcher()
    register_daw_handlers(dispatcher, hooks=hooks)

    def frame(target: str, *, value=None, args=None) -> dict:
        return {
            "type": "engine_command",
            "target": target,
            "action": "set",
            "value": value,
            "args": list(args) if args is not None else [],
            "controller_key": "test",
            "msg_id": "x",
        }

    dispatcher.dispatch(frame("daw.project.new", args=["dispatch-test"]))
    dispatcher.dispatch(frame("daw.track.create", args=["audio", "Drums"]))
    dispatcher.dispatch(
        frame("daw.clip.add", args=[0, 0, 48000, "audio/take1.wav"])
    )

    # Active project reflects the mutations.
    proj = slot.require()
    assert proj.document["tracks"][0]["name"] == "Drums"
    assert proj.document["clips"][0]["source"] == "audio/take1.wav"

    # And the file on disk is up-to-date (save-after-each is the default).
    on_disk = json.loads((tmp_path / "dispatch-test" / "project.json").read_text())
    assert on_disk["tracks"][0]["name"] == "Drums"
    assert on_disk["clips"][0]["source"] == "audio/take1.wav"

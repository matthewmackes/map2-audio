"""T2512-FSW — Generic looper MIDI-learn target catalog regression tests.

The pack at ``device-packs/_generic/midi-learn-looper/targets.yaml``
declares every ``audio.looper.*`` verb an operator can MIDI-learn
against a footswitch. This test backstops the catalog so it can never
silently diverge from the dispatcher targets registered by
``register_default_handlers`` (T2512-MIDI).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

from app.services.engine_command_dispatcher import EngineCommandDispatcher
from app.services.engine_command_handlers import register_default_handlers


PACK_ROOT = Path(__file__).parent.parent / "device-packs/_generic/midi-learn-looper"


@pytest.fixture(scope="module")
def catalog() -> dict:
    with open(PACK_ROOT / "targets.yaml", "r", encoding="utf-8") as fp:
        return yaml.safe_load(fp)


@pytest.fixture(scope="module")
def manifest() -> dict:
    with open(PACK_ROOT / "pack.yaml", "r", encoding="utf-8") as fp:
        return yaml.safe_load(fp)


# ---------------------------------------------------------------------------
# Manifest sanity
# ---------------------------------------------------------------------------


def test_pack_manifest_identity(manifest: dict) -> None:
    assert manifest["schema_version"] == 1
    assert manifest["pack_id"] == "_generic-midi-learn-looper"
    assert manifest["license"] == "AGPL-3.0-only"
    assert manifest["source"] == "map2-native"
    assert manifest["models"] == ["generic-midi-learn-looper"]


def test_catalog_mode_is_looper(catalog: dict) -> None:
    assert catalog["mode"] == "looper"
    assert catalog["schema_version"] == 1


def test_catalog_groups_present(catalog: dict) -> None:
    group_ids = {g["id"] for g in catalog["groups"]}
    assert group_ids == {"stomps", "mixer", "master"}


# ---------------------------------------------------------------------------
# Target coverage: every verb in the catalog routes through the dispatcher.
# ---------------------------------------------------------------------------


def _flat_verbs(catalog: dict) -> list[str]:
    out: list[str] = []
    for group in catalog["groups"]:
        for entry in group["targets"]:
            out.append(entry["verb"])
    return out


def test_every_catalog_verb_routes_through_dispatcher(catalog: dict) -> None:
    """Each catalog verb must match exactly one dispatcher route.

    Dispatch a synthetic engine_command frame for every catalog verb and
    confirm the dispatcher's ``unmatched_count`` stays at zero — that's
    the same path the controller-host runs at runtime, so a rename in
    ``register_default_handlers`` would break this test loudly.
    """
    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher)
    for verb in _flat_verbs(catalog):
        frame = {
            "type": "engine_command",
            "msg_id": "regression",
            "schema_version": 1,
            "controller_key": "catalog",
            "target": verb,
            "action": "set",
            "value": 127.0,
        }
        dispatcher.dispatch(frame)
    assert dispatcher.unmatched_count == 0, (
        "catalog targets without a dispatcher handler — likely a rename "
        "in register_default_handlers; update the catalog"
    )
    assert dispatcher.errored_count == 0
    assert dispatcher.dispatched_count == len(_flat_verbs(catalog))


def test_stomp_group_covers_every_track_and_verb(catalog: dict) -> None:
    """Stomp group must include record/stop/clear/undo/redo for tracks 0..3."""
    stomps = next(g for g in catalog["groups"] if g["id"] == "stomps")
    verbs = {entry["verb"] for entry in stomps["targets"]}
    expected = {
        f"audio.looper.{track}.{verb}"
        for track in range(4)
        for verb in ("record", "stop", "clear", "undo", "redo")
    }
    assert verbs == expected


def test_mixer_group_covers_every_track_and_setter(catalog: dict) -> None:
    mixer = next(g for g in catalog["groups"] if g["id"] == "mixer")
    verbs = {entry["verb"] for entry in mixer["targets"]}
    expected = {
        f"audio.looper.{track}.{kind}"
        for track in range(4)
        # T2512-LOCK-MIDI adds the per-track ``locked`` toggle and
        # T2512-OS adds ``one_shot`` alongside the original mixer
        # setters.
        for kind in (
            "level", "muted", "soloed", "reverse", "half_speed",
            "locked", "one_shot",
        )
    }
    assert verbs == expected


def test_master_group_has_only_master_level(catalog: dict) -> None:
    master = next(g for g in catalog["groups"] if g["id"] == "master")
    verbs = [entry["verb"] for entry in master["targets"]]
    assert verbs == ["audio.looper.master.level"]


# ---------------------------------------------------------------------------
# Shape sanity: action templates and arg prompts.
# ---------------------------------------------------------------------------


def test_stomp_targets_use_set_action(catalog: dict) -> None:
    """Stomps are fire-and-forget triggers (action: set, no args)."""
    stomps = next(g for g in catalog["groups"] if g["id"] == "stomps")
    for entry in stomps["targets"]:
        assert entry["action_template"]["action"] == "set"
        assert "arg_prompts" not in entry, (
            f"{entry['verb']} should not prompt for an arg — stomps are pure triggers"
        )


def test_mixer_bool_setters_default_to_toggle(catalog: dict) -> None:
    """Mute / solo / reverse / half_speed / locked / one_shot default to
    toggle so a single footswitch press flips state (the dispatcher
    honors both set and toggle, but toggle is the more natural
    footswitch UX)."""
    mixer = next(g for g in catalog["groups"] if g["id"] == "mixer")
    bool_kinds = ("muted", "soloed", "reverse", "half_speed", "locked", "one_shot")
    bool_pattern = re.compile(r"audio\.looper\.\d\.(" + "|".join(bool_kinds) + ")$")
    for entry in mixer["targets"]:
        if bool_pattern.match(entry["verb"]):
            assert entry["action_template"]["action"] == "toggle", entry["verb"]


def test_level_setters_prompt_for_db_value(catalog: dict) -> None:
    """Continuous setters (level, master.level) must prompt for a float
    with the same clamp as the dispatcher handler (-60..+6 dB)."""
    cases: list[dict] = []
    for group in catalog["groups"]:
        for entry in group["targets"]:
            if entry["verb"].endswith(".level"):
                cases.append(entry)
    assert len(cases) == 5  # 4 track levels + 1 master
    for entry in cases:
        prompts = entry.get("arg_prompts", [])
        assert len(prompts) == 1, entry["verb"]
        prompt = prompts[0]
        assert prompt["name"] == "db"
        assert prompt["type"] == "float"
        assert prompt["min"] == -60.0
        assert prompt["max"] == 6.0


def test_catalog_total_verb_count(catalog: dict) -> None:
    """20 stomp verbs + 28 mixer setters (T2512-LOCK-MIDI added 4 ×
    locked; T2512-OS added 4 × one_shot) + 1 master = 49 total."""
    assert len(_flat_verbs(catalog)) == 49


# ---------------------------------------------------------------------------
# T2512-SCRIPT — scripts/looper.js wiring sanity
# ---------------------------------------------------------------------------


def test_pack_references_looper_script(manifest: dict) -> None:
    """pack.yaml's ``scripts`` list must point at scripts/looper.js so
    any importing pack only has to write
    ``scripts: [_generic/midi-learn-looper/scripts/looper.js]``."""
    scripts = manifest.get("scripts", [])
    assert "scripts/looper.js" in scripts, (
        "pack manifest should reference scripts/looper.js so device packs "
        "can import the looper handler surface"
    )


def test_looper_script_file_exists() -> None:
    script_path = PACK_ROOT / "scripts" / "looper.js"
    assert script_path.exists(), (
        f"missing T2512-SCRIPT module at {script_path}"
    )
    src = script_path.read_text()
    # Quick shape check — full behavior is exercised by the
    # Node-side harness at scripts/__tests__/test_looper_script.js.
    assert "Looper.track_0.record" in src
    assert "Looper.master.level" in src
    assert "engine.setValue" in src

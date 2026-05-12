"""T2512-FSW-MAC-4T — 4-track MeloAudio Commander looper profile tests.

The 4-track variant distributes record/stop verbs across all four
tracks. This test pins the per-track coverage and the dispatcher
routability so a future rename trips the test loudly.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.services.engine_command_dispatcher import EngineCommandDispatcher
from app.services.engine_command_handlers import register_default_handlers


PROFILE = (
    Path(__file__).parent.parent
    / "device-packs/meloaudio/profiles/midi-commander-looper-4track.midi.yaml"
)


@pytest.fixture(scope="module")
def profile() -> dict:
    with open(PROFILE, "r", encoding="utf-8") as fp:
        return yaml.safe_load(fp)


# ---------------------------------------------------------------------------
# Identity + manifest
# ---------------------------------------------------------------------------


def test_profile_identity_marks_4track_variant(profile: dict) -> None:
    ident = profile["identity"]
    assert ident["manufacturer"] == "MeloAudio"
    assert ident["model"] == "midi-commander"
    assert ident["variant"] == "looper-4track"
    assert ident["alsa_client_pattern"] == "MIDI Commander"
    assert ident["hardware_id"] == "alsa-seq:MIDI Commander:0"


def test_profile_pulls_generic_looper_script(profile: dict) -> None:
    scripts = profile.get("scripts", [])
    assert "../../_generic/midi-learn-looper/scripts/looper.js" in scripts


def test_profile_total_control_count(profile: dict) -> None:
    """4 record + 4 stop + 1 lock + 2 expression = 11 controls."""
    assert len(profile["controls"]) == 11


# ---------------------------------------------------------------------------
# Per-row track coverage
# ---------------------------------------------------------------------------


def test_row_1_covers_all_four_record_stomps(profile: dict) -> None:
    row1 = {
        ctl["target"]
        for ctl in profile["controls"]
        if 80 <= ctl["midino"] <= 83
    }
    expected = {f"audio.looper.{t}.record" for t in range(4)}
    assert row1 == expected


def test_row_2_covers_all_four_stop_stomps(profile: dict) -> None:
    row2 = {
        ctl["target"]
        for ctl in profile["controls"]
        if 84 <= ctl["midino"] <= 87
    }
    expected = {f"audio.looper.{t}.stop" for t in range(4)}
    assert row2 == expected


def test_bottom_switch_toggles_track_0_lock(profile: dict) -> None:
    bottom = next(c for c in profile["controls"] if c["midino"] == 14)
    assert bottom["target"] == "audio.looper.0.locked"
    assert bottom["action"] == "toggle"


def test_expression_pedals_route_to_master_and_track0_level(profile: dict) -> None:
    exp1 = next(c for c in profile["controls"] if c["midino"] == 7)
    exp2 = next(c for c in profile["controls"] if c["midino"] == 1)
    assert exp1["target"] == "audio.looper.master.level"
    assert exp2["target"] == "audio.looper.0.level"


# ---------------------------------------------------------------------------
# Dispatcher routability + script handler refs
# ---------------------------------------------------------------------------


def test_every_control_target_routes_through_dispatcher(profile: dict) -> None:
    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher)
    for control in profile["controls"]:
        target = control["target"]
        frame = {
            "type": "engine_command",
            "msg_id": "fsw-mac-4t-regression",
            "schema_version": 1,
            "controller_key": "commander-4t",
            "target": target,
            "action": control.get("action", "set"),
            "value": 127.0,
        }
        dispatcher.dispatch(frame)
    assert dispatcher.unmatched_count == 0
    assert dispatcher.errored_count == 0
    assert dispatcher.dispatched_count == len(profile["controls"])


def test_every_control_references_a_looper_script_handler(profile: dict) -> None:
    """Every control must reference a Looper.* JS helper so release-
    at-zero filtering + indexed-enum semantics stay centralized."""
    for control in profile["controls"]:
        script_ref = control.get("script", "")
        assert script_ref.startswith("Looper."), control


# ---------------------------------------------------------------------------
# Coexistence with the original 2-track profile
# ---------------------------------------------------------------------------


def test_4track_variant_uses_distinct_variant_marker() -> None:
    """The variant key must differ from the 2-track profile so the
    controller-host's profile picker can disambiguate."""
    two_track_path = (
        Path(__file__).parent.parent
        / "device-packs/meloaudio/profiles/midi-commander-looper.midi.yaml"
    )
    with open(two_track_path, "r", encoding="utf-8") as fp:
        two_track = yaml.safe_load(fp)
    with open(PROFILE, "r", encoding="utf-8") as fp:
        four_track = yaml.safe_load(fp)
    assert two_track["identity"]["variant"] != four_track["identity"]["variant"]

"""T2512-FSW-MAC — MeloAudio Commander looper profile regression tests.

The dedicated looper profile at
``device-packs/meloaudio/profiles/midi-commander-looper.midi.yaml``
maps the Commander's two switch rows + bottom switch + expression
pedals onto ``audio.looper.*`` engine_command verbs. This test pins
the profile shape so a future rename or removal of a dispatcher
target breaks loudly.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.services.engine_command_dispatcher import EngineCommandDispatcher
from app.services.engine_command_handlers import register_default_handlers


PROFILE = (
    Path(__file__).parent.parent
    / "device-packs/meloaudio/profiles/midi-commander-looper.midi.yaml"
)


@pytest.fixture(scope="module")
def profile() -> dict:
    with open(PROFILE, "r", encoding="utf-8") as fp:
        return yaml.safe_load(fp)


# ---------------------------------------------------------------------------
# Identity + structure
# ---------------------------------------------------------------------------


def test_profile_identity_matches_commander(profile: dict) -> None:
    """Same device fingerprint as the snapshot-recall profile so the
    host can swap between them without re-discovering the hardware."""
    ident = profile["identity"]
    assert ident["manufacturer"] == "MeloAudio"
    assert ident["model"] == "midi-commander"
    assert ident["alsa_client_pattern"] == "MIDI Commander"
    assert ident["hardware_id"] == "alsa-seq:MIDI Commander:0"
    # variant: looper is the discriminator from the default profile.
    assert ident.get("variant") == "looper"


def test_profile_pulls_generic_looper_script(profile: dict) -> None:
    scripts = profile.get("scripts", [])
    assert "../../_generic/midi-learn-looper/scripts/looper.js" in scripts


def test_profile_has_thirteen_controls(profile: dict) -> None:
    """4 switches × 2 rows + 1 lock latch + 2 expression pedals = 11."""
    controls = profile.get("controls", [])
    assert len(controls) == 11


# ---------------------------------------------------------------------------
# Each control's target routes through the dispatcher.
# ---------------------------------------------------------------------------


def test_every_control_target_routes_through_dispatcher(profile: dict) -> None:
    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher)
    for control in profile["controls"]:
        target = control["target"]
        frame = {
            "type": "engine_command",
            "msg_id": "profile-regression",
            "schema_version": 1,
            "controller_key": "commander",
            "target": target,
            "action": control.get("action", "set"),
            "value": 127.0,
        }
        dispatcher.dispatch(frame)
    assert dispatcher.unmatched_count == 0
    assert dispatcher.errored_count == 0
    assert dispatcher.dispatched_count == len(profile["controls"])


# ---------------------------------------------------------------------------
# Specific row coverage
# ---------------------------------------------------------------------------


def test_row_1_covers_track_0_stomps(profile: dict) -> None:
    targets_for_row1 = {
        ctl["target"]
        for ctl in profile["controls"]
        if 80 <= ctl["midino"] <= 83
    }
    assert targets_for_row1 == {
        "audio.looper.0.record",
        "audio.looper.0.stop",
        "audio.looper.0.clear",
        "audio.looper.0.undo",
    }


def test_row_2_covers_track_1_stomps(profile: dict) -> None:
    targets_for_row2 = {
        ctl["target"]
        for ctl in profile["controls"]
        if 84 <= ctl["midino"] <= 87
    }
    assert targets_for_row2 == {
        "audio.looper.1.record",
        "audio.looper.1.stop",
        "audio.looper.1.clear",
        "audio.looper.1.undo",
    }


def test_bottom_switch_toggles_track0_lock(profile: dict) -> None:
    bottom = next(c for c in profile["controls"] if c["midino"] == 14)
    assert bottom["target"] == "audio.looper.0.locked"
    assert bottom["action"] == "toggle"


def test_expression_pedals_route_to_master_and_track0_level(profile: dict) -> None:
    exp1 = next(c for c in profile["controls"] if c["midino"] == 7)
    exp2 = next(c for c in profile["controls"] if c["midino"] == 1)
    assert exp1["target"] == "audio.looper.master.level"
    assert exp1["action"] == "set"
    assert exp2["target"] == "audio.looper.0.level"
    assert exp2["action"] == "set"


def test_stomp_controls_reference_looper_script_handlers(profile: dict) -> None:
    """Each stomp must reference a ``Looper.track_<n>.<verb>`` script
    handler from the generic library — same pattern T2512-SCRIPT
    documents for any custom pack."""
    for control in profile["controls"]:
        if 80 <= control["midino"] <= 87:
            script_ref = control.get("script", "")
            assert script_ref.startswith("Looper.track_"), control

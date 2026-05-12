"""T2512-FSW-FS7 — Boss FS-7 dual-footswitch looper profile tests.

Mirrors the MeloAudio Commander looper profile test pattern. Pins
the profile shape and asserts both controls route through the
dispatcher's looper.* targets so a future rename trips the test
loudly.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.services.engine_command_dispatcher import EngineCommandDispatcher
from app.services.engine_command_handlers import register_default_handlers


PROFILE = (
    Path(__file__).parent.parent
    / "device-packs/boss/profiles/fs-7-looper.midi.yaml"
)
PACK = (
    Path(__file__).parent.parent
    / "device-packs/boss/pack.yaml"
)


@pytest.fixture(scope="module")
def profile() -> dict:
    with open(PROFILE, "r", encoding="utf-8") as fp:
        return yaml.safe_load(fp)


@pytest.fixture(scope="module")
def pack() -> dict:
    with open(PACK, "r", encoding="utf-8") as fp:
        return yaml.safe_load(fp)


# ---------------------------------------------------------------------------
# Pack manifest
# ---------------------------------------------------------------------------


def test_pack_manifest_identifies_boss_vendor(pack: dict) -> None:
    assert pack["schema_version"] == 1
    assert pack["pack_id"] == "boss"
    assert pack["vendor"]["name"] == "Roland Boss"
    assert pack["license"] == "AGPL-3.0-only"
    assert pack["source"] == "map2-native"
    assert "fs-7-looper" in pack["models"]


# ---------------------------------------------------------------------------
# Profile identity + structure
# ---------------------------------------------------------------------------


def test_profile_identity_matches_fs7(profile: dict) -> None:
    ident = profile["identity"]
    assert ident["manufacturer"] == "Roland Boss"
    assert ident["model"] == "fs-7-looper"
    assert ident["alsa_client_pattern"] == "FS-7"
    assert ident["hardware_id"] == "alsa-seq:FS-7:0"


def test_profile_pulls_generic_looper_script(profile: dict) -> None:
    scripts = profile.get("scripts", [])
    assert "../../_generic/midi-learn-looper/scripts/looper.js" in scripts


def test_profile_has_exactly_two_controls(profile: dict) -> None:
    """FS-7 has two footswitches — the profile must not declare
    more (or fewer) controls."""
    assert len(profile["controls"]) == 2


# ---------------------------------------------------------------------------
# Control surface
# ---------------------------------------------------------------------------


def test_switch_a_maps_to_track_0_record(profile: dict) -> None:
    ctl = next(c for c in profile["controls"] if c["midino"] == 80)
    assert ctl["status"] == 0xB0
    assert ctl["target"] == "audio.looper.0.record"
    assert ctl["action"] == "set"
    assert ctl["script"] == "Looper.track_0.record"


def test_switch_b_maps_to_track_0_stop(profile: dict) -> None:
    ctl = next(c for c in profile["controls"] if c["midino"] == 81)
    assert ctl["target"] == "audio.looper.0.stop"
    assert ctl["action"] == "set"
    assert ctl["script"] == "Looper.track_0.stop"


def test_every_control_target_routes_through_dispatcher(profile: dict) -> None:
    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher)
    for control in profile["controls"]:
        target = control["target"]
        frame = {
            "type": "engine_command",
            "msg_id": "fs7-regression",
            "schema_version": 1,
            "controller_key": "fs-7",
            "target": target,
            "action": control.get("action", "set"),
            "value": 127.0,
        }
        dispatcher.dispatch(frame)
    assert dispatcher.unmatched_count == 0
    assert dispatcher.errored_count == 0
    assert dispatcher.dispatched_count == len(profile["controls"])


def test_every_control_references_looper_script_handler(profile: dict) -> None:
    """Both switches must reference a ``Looper.track_<n>.<verb>`` JS
    helper from the generic library — keeps release-at-zero filtering
    centralized."""
    for control in profile["controls"]:
        script_ref = control.get("script", "")
        assert script_ref.startswith("Looper.track_"), control

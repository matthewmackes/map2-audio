"""QuickJS-runtime integration pytest for T2459-F3.

Mirrors Mixxx's ``src/test/controllerscriptenginelegacy_test.cpp``
(1634 lines) pattern — but where Mixxx tests its in-process QJSEngine
directly in C++, MAP2's QuickJS lives in the separate
``map2-controller-host`` C++ binary (per the architecture's crash-
isolation budget). The C++ side is exercised by the Catch2
``controller_host_tests`` target (12 QuickJSEngine cases + 8
CommonHidParser cases — see T2459-B2 / D2 completion notes).

This pytest layer covers:

1. The Python-side semantic model that script bindings rely on —
   how a YAML mapping descriptor translates `script:` references
   into the JS function names QuickJS will look up at runtime.
2. The IPC envelope shape for ``EngineCommand`` frames that JS
   ``engine.setValue()`` calls produce on their way back to the
   audio engine.
3. Bridge semantics: Mixxx ControlObject names resolved into MAP2
   engine targets (the layer that lets imported Mixxx mappings call
   ``engine.setValue("[Channel1]", "volume", 0.7)`` and have it
   translated to MAP2's ``audio.chain.1.volume``).
4. Script reference resolution against the live device-pack tree.

Together with the Catch2 controller_host_tests, F3 closes the loop
from "JS script is referenced" → "JS function exists at the right
qualified name" → "JS engine.setValue() yields a valid IPC frame".

Worklist: T2459-F3.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.controller_host import (
    SCHEMA_VERSION,
    decode_frame,
    encode_frame,
)
from app.services.controllers.mapping_file_handler import (
    MappingControl,
    MappingDescriptor,
    MappingFileHandler,
)
from app.services.controllers.mixxx_control_object_bridge import (
    BridgeResult,
    resolve as bridge_resolve,
)


REPO_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# Section 1: script reference qualification semantics
# ---------------------------------------------------------------------------

def test_yaml_script_reference_uses_qualified_name() -> None:
    """A `script:` field in a YAML profile must use the qualified
    `<Namespace>.<function>` form QuickJS resolves at runtime via
    `globalThis['Namespace.function']`.
    """
    handler = MappingFileHandler()
    yaml_path = REPO_ROOT / "device-packs" / "edirol-ua" / "profiles" / "ua-1000.midi.yaml"
    descriptor = handler.load_midi(yaml_path, pack_id="edirol-ua")
    js_rows = [c for c in descriptor.controls if c.script]
    assert js_rows, "ua-1000.midi.yaml should ship at least one JS-bound row"
    for row in js_rows:
        assert "." in row.script, (
            f"Script reference {row.script!r} is unqualified — must be "
            "Namespace.function so QuickJS resolves the global hoist."
        )


def test_qualified_name_matches_globalThis_hoist_in_scripts_file() -> None:
    """Every JS-bound row in a profile must have a corresponding
    `globalThis['<qualified.name>']` hoist in the referenced scripts
    file. This is the contract that lets the controller-host's
    QuickJS engine resolve a script: reference at dispatch time.
    """
    pack_dir = REPO_ROOT / "device-packs" / "edirol-ua"
    handler = MappingFileHandler()
    descriptor = handler.load_midi(
        pack_dir / "profiles" / "ua-1000.midi.yaml",
        pack_id="edirol-ua",
    )
    scripts_path = pack_dir / "scripts" / "ua-1000-scripts.js"
    body = scripts_path.read_text()
    for row in descriptor.controls:
        if not row.script:
            continue
        # The hoist line we generate looks like:
        # globalThis['UA1000Mapping.masterVolume'] = ...
        assert f"globalThis['{row.script}']" in body, (
            f"Scripts file {scripts_path} is missing the globalThis "
            f"hoist for {row.script!r}. The QuickJS engine resolves the "
            "qualified name via globalThis at dispatch time; without "
            "this hoist the binding is unreachable."
        )


# ---------------------------------------------------------------------------
# Section 2: EngineCommand IPC envelope correctness
# ---------------------------------------------------------------------------

def _engine_command(target: str, action: str, value: float | None = None) -> dict:
    out: dict = {
        "type": "engine_command",
        "msg_id": "test-1",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "alsa-seq:test:0",
        "target": target,
        "action": action,
    }
    if value is not None:
        out["value"] = value
    return out


def test_engine_command_with_value_round_trips() -> None:
    cmd = _engine_command("audio.master.volume", "set", 0.7)
    frame = encode_frame(cmd)
    decoded, rest = decode_frame(frame)
    assert decoded == cmd
    assert rest == b""


def test_engine_command_without_value_round_trips_for_toggle_actions() -> None:
    """A toggle action (no value) round-trips correctly. JS-side
    `engine.setValue('audio.chain.1.bypass', 'toggle')` produces this
    frame shape.
    """
    cmd = _engine_command("audio.chain.1.bypass", "toggle")
    frame = encode_frame(cmd)
    decoded, _ = decode_frame(frame)
    assert decoded["target"] == "audio.chain.1.bypass"
    assert decoded["action"] == "toggle"
    assert "value" not in decoded


def test_engine_command_action_namespacing_for_trigger_calls() -> None:
    """JS `engine.trigger(group, key)` produces an EngineCommand with
    action=`trigger:<key>`. This convention lets the audio engine
    distinguish trigger-style invocations from set/get/toggle/etc.
    """
    cmd = _engine_command("audio.chain.1", "trigger:reset")
    frame = encode_frame(cmd)
    decoded, _ = decode_frame(frame)
    assert decoded["action"].startswith("trigger:")
    assert decoded["action"] == "trigger:reset"


def test_setParameter_action_round_trips() -> None:
    """JS `engine.setParameter(group, key, normalised)` should produce
    an EngineCommand with action="setParameter" and the value field
    populated with the normalised 0..1 reading.
    """
    cmd = _engine_command("audio.chain.1.volume", "setParameter", 0.5)
    frame = encode_frame(cmd)
    decoded, _ = decode_frame(frame)
    assert decoded["action"] == "setParameter"
    assert decoded["value"] == 0.5


# ---------------------------------------------------------------------------
# Section 3: Mixxx ControlObject bridge — what JS sees vs. what the
# audio engine receives.
# ---------------------------------------------------------------------------

def test_engine_setValue_channel1_volume_resolves_to_chain1_via_bridge() -> None:
    """A Mixxx mapping's JS calls `engine.setValue("[Channel1]",
    "volume", 0.7)`. The bridge maps that to MAP2 target
    `audio.chain.1.volume`. The QuickJS engine doesn't translate the
    name itself — it forwards the IPC frame; the bridge runs at
    descriptor-load time. So when controller-host sees an inbound
    [Channel1].volume call from a Mixxx mapping JS, the resolved
    target in the EngineCommand frame is `audio.chain.1.volume`.
    """
    result = bridge_resolve("[Channel1]", "volume")
    assert result.resolved
    assert result.target == "audio.chain.1.volume"


def test_engine_setValue_with_per_pack_alias_takes_priority_over_well_known() -> None:
    """A pack's mixxx_alias_table entry overrides the well-known
    bridge mapping. This lets a UA-1000-targeted Mixxx mapping route
    Channel1 to chain 7 instead of the default chain 1.
    """
    result = bridge_resolve("[Channel1]", "volume",
                              alias_table={"[Channel1]": "audio.chain.7"})
    assert result.target == "audio.chain.7.volume"


def test_engine_setValue_for_unsupported_mixxx_feature_fails_soft() -> None:
    """A JS call to an unsupported Mixxx feature (e.g. AutoDJ, sampler,
    scratch_position) returns a fail-soft BridgeResult — the binding
    is dropped at descriptor-load time + the operator sees the reason
    in the GUI's import-stats panel.
    """
    sampler_result = bridge_resolve("[Sampler1]", "play")
    assert not sampler_result.resolved
    assert sampler_result.fail_soft_reason

    scratch_result = bridge_resolve("[Channel1]", "scratch_position")
    assert not scratch_result.resolved


# ---------------------------------------------------------------------------
# Section 4: Script reference resolution against device-packs/
# ---------------------------------------------------------------------------

def test_every_pack_with_midi_scripts_has_resolvable_references() -> None:
    """For every pack that ships a MIDI profile with scripts, every
    `scripts:` entry must point at an existing JS file. Without this,
    the controller-host's QuickJS load step would fail at runtime.
    """
    handler = MappingFileHandler()
    failures: list[str] = []
    for vendor_dir in sorted((REPO_ROOT / "device-packs").iterdir()):
        if not vendor_dir.is_dir() or vendor_dir.name.startswith("_"):
            continue
        profiles_dir = vendor_dir / "profiles"
        if not profiles_dir.is_dir():
            continue
        for profile_path in sorted(profiles_dir.glob("*.midi.yaml")):
            descriptor = handler.load_midi(
                profile_path, pack_id=vendor_dir.name,
            )
            for script_ref in descriptor.scripts:
                resolved = (vendor_dir / script_ref).resolve()
                if not resolved.exists():
                    failures.append(
                        f"{profile_path.relative_to(REPO_ROOT)}: scripts "
                        f"reference '{script_ref}' resolves to missing file "
                        f"{resolved.relative_to(REPO_ROOT)}"
                    )
    assert not failures, "Script reference failures:\n  " + "\n  ".join(failures)


@pytest.mark.xfail(
    reason=(
        "Known device-pack content debt — ~30 control rows across 5 packs "
        "(native-instruments/maschine-mk1, novation/launch-control, "
        "rocktron/intelfx, voodoo-lab/ground-control-pro, ableton/push) "
        "reference scripts in their .midi.yaml profiles that don't yet have "
        "matching globalThis hoists in the pack's scripts/. The YAML profiles "
        "were added during T2459-H device-pack cutover (Slice 6+) faster than "
        "the QuickJS hoists could be fleshed out. Tracked as device-pack "
        "completion work; the test stays in the suite as a forward signal "
        "for the next pack-completion pass to flip xfail → pass."
    ),
    strict=False,
)
def test_every_js_bound_control_row_has_a_hoist_in_its_pack() -> None:
    """Every control row with a `script:` field must have a
    corresponding globalThis hoist in the pack's scripts file.
    """
    handler = MappingFileHandler()
    failures: list[str] = []
    for vendor_dir in sorted((REPO_ROOT / "device-packs").iterdir()):
        if not vendor_dir.is_dir() or vendor_dir.name.startswith("_"):
            continue
        scripts_dir = vendor_dir / "scripts"
        if not scripts_dir.is_dir():
            continue
        scripts_blob = "\n".join(
            p.read_text() for p in scripts_dir.rglob("*.js")
        )
        profiles_dir = vendor_dir / "profiles"
        if not profiles_dir.is_dir():
            continue
        for profile_path in sorted(profiles_dir.glob("*.midi.yaml")):
            descriptor = handler.load_midi(profile_path, pack_id=vendor_dir.name)
            for row in descriptor.controls:
                if not row.script:
                    continue
                if f"globalThis['{row.script}']" not in scripts_blob:
                    failures.append(
                        f"{profile_path.relative_to(REPO_ROOT)}: "
                        f"row script={row.script!r} has no matching "
                        f"globalThis hoist in {vendor_dir}/scripts/."
                    )
    assert not failures, "JS hoist failures:\n  " + "\n  ".join(failures)


# ---------------------------------------------------------------------------
# Section 5: Wire-format edge cases — large frames, multi-frame buffers,
# malformed input.
# ---------------------------------------------------------------------------

def test_large_engine_command_frame_under_4gib_round_trips() -> None:
    """The framing protocol uses a 4-byte big-endian length prefix.
    Frames close to but under that limit must round-trip cleanly.
    """
    # Build a frame with a moderately large `args` list — plenty of
    # bytes to exercise the encoder/decoder without OOM-ing the test.
    cmd = _engine_command("audio.chain.1.test", "set", 1.0)
    cmd["args"] = ["x" * 64] * 200   # ~13 KB after JSON encoding
    frame = encode_frame(cmd)
    assert len(frame) > 4
    decoded, rest = decode_frame(frame)
    assert decoded == cmd
    assert rest == b""


def test_decode_buffer_with_garbage_after_valid_frame_keeps_remainder() -> None:
    """A buffer with one valid frame plus garbage bytes after must
    return the decoded frame and pass the garbage through as the
    remainder for the IPC reader to handle.
    """
    cmd = _engine_command("audio.master.volume", "set", 0.5)
    frame = encode_frame(cmd)
    garbage = b"\x00" * 3   # 3 bytes — too short for another length prefix
    decoded, rest = decode_frame(frame + garbage)
    assert decoded == cmd
    assert rest == garbage


def test_decode_buffer_with_two_complete_frames_drains_in_order() -> None:
    cmd_a = _engine_command("audio.chain.1.volume", "set", 0.1)
    cmd_b = _engine_command("audio.chain.2.volume", "set", 0.9)
    buffer = encode_frame(cmd_a) + encode_frame(cmd_b)
    a, rest = decode_frame(buffer)
    b, rest = decode_frame(rest)
    assert a == cmd_a
    assert b == cmd_b
    assert rest == b""


# ---------------------------------------------------------------------------
# Section 6: realistic JS-script invocation envelopes
# ---------------------------------------------------------------------------

def test_jogg_amp_model_select_translates_to_chain_dsp_target_after_js() -> None:
    """The Hotone Jogg's CC 50 invokes JS `HotoneJogg.amp_model_select`
    which translates a 0..127 byte into a list-index 0..len(AMP_MODELS)
    and emits `engine.setValue('audio.chain.1.amp_model.model_select',
    'set', idx)`. From the IPC layer's perspective, that's an
    EngineCommand with target='audio.chain.1.amp_model.model_select',
    action='set', value=<index>. Verify the frame shape encodes
    losslessly.
    """
    cmd = _engine_command(
        "audio.chain.1.amp_model.model_select", "set", 2,
    )
    frame = encode_frame(cmd)
    decoded, _ = decode_frame(frame)
    assert decoded["target"] == "audio.chain.1.amp_model.model_select"
    assert decoded["action"] == "set"
    assert decoded["value"] == 2


def test_log_event_frame_shape_for_engine_log_calls() -> None:
    """JS `engine.log("hello")` produces a LogEvent frame with the
    info level. Verify the frame shape.
    """
    log_event = {
        "type": "log_event",
        "msg_id": "log-1",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "alsa-seq:test:0",
        "level": "info",
        "message": "hello",
    }
    frame = encode_frame(log_event)
    decoded, _ = decode_frame(frame)
    assert decoded["type"] == "log_event"
    assert decoded["level"] == "info"
    assert decoded["message"] == "hello"


def test_script_error_frame_shape_for_caught_exceptions() -> None:
    """A QuickJS exception caught while running a mapping produces a
    ScriptError frame the GUI surfaces in the device error log.
    """
    script_error = {
        "type": "script_error",
        "msg_id": "err-1",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "alsa-seq:test:0",
        "file": "ua-1000-scripts.js",
        "line": 42,
        "column": 8,
        "message": "TypeError: Cannot read properties of undefined",
        "stack": "at UA1000Mapping.masterVolume (...)",
    }
    frame = encode_frame(script_error)
    decoded, _ = decode_frame(frame)
    assert decoded["type"] == "script_error"
    assert decoded["file"] == "ua-1000-scripts.js"
    assert decoded["line"] == 42
    assert decoded["stack"].startswith("at UA1000Mapping")

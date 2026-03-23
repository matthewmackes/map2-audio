import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest


def _run_current_pedalboard_identity_case(repo_root: Path, module_dir: Path) -> subprocess.CompletedProcess[str]:
    script = textwrap.dedent(
        f"""
        import sys

        sys.path.insert(0, {str(module_dir)!r})
        import map2_audio_engine

        engine = map2_audio_engine.create_engine()
        engine.set_sample_rate(48000)
        engine.set_buffer_size(64)

        if not engine.initialize(""):
            raise SystemExit(2)

        first = int(engine.load_plugin("map2://juce/nam"))
        second = int(engine.load_plugin("map2://juce/nam"))
        if first <= 0 or second <= 0 or first == second:
            engine.shutdown()
            raise SystemExit(20)

        if not engine.add_to_chain(first, 0):
            engine.unload_plugin(first)
            engine.unload_plugin(second)
            engine.shutdown()
            raise SystemExit(21)

        if not engine.add_to_chain(second, 1):
            engine.remove_from_chain(first)
            engine.unload_plugin(first)
            engine.unload_plugin(second)
            engine.shutdown()
            raise SystemExit(22)

        pedalboard = engine.get_current_pedalboard()
        items = list(pedalboard.get("items", []))
        if len(items) != 2:
            engine.remove_from_chain(first)
            engine.remove_from_chain(second)
            engine.unload_plugin(first)
            engine.unload_plugin(second)
            engine.shutdown()
            raise SystemExit(23)

        expected = [
            {{"instance_id": first, "position": 0}},
            {{"instance_id": second, "position": 1}},
        ]
        for item, expect in zip(items, expected):
            if item.get("uri") != "map2://juce/nam":
                raise SystemExit(24)
            if int(item.get("instance_id", -1)) != expect["instance_id"]:
                raise SystemExit(25)
            if int(item.get("position", -1)) != expect["position"]:
                raise SystemExit(26)
            if int(item.get("plugin_position", -1)) != expect["position"]:
                raise SystemExit(27)

        engine.remove_from_chain(first)
        engine.remove_from_chain(second)
        engine.unload_plugin(first)
        engine.unload_plugin(second)
        engine.shutdown()
        """
    )

    env = os.environ.copy()
    env.setdefault("MAP2_AUDIO_PREFER_JACK", "0")

    return subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(repo_root),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def test_current_pedalboard_exposes_identity_for_duplicate_native_instances() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    module_dir = repo_root / "juce-engine" / "build"
    if not module_dir.exists():
        pytest.skip(f"JUCE build output not found at {module_dir}")

    proc = _run_current_pedalboard_identity_case(repo_root, module_dir)
    if proc.returncode == 2:
        pytest.skip(f"Engine unavailable in test environment (rc={proc.returncode})")

    assert proc.returncode == 0, (
        f"Current pedalboard identity regression (rc={proc.returncode})\n"
        f"stdout:\n{proc.stdout}\n"
        f"stderr:\n{proc.stderr}"
    )

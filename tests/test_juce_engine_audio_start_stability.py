import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest


def test_audio_start_stop_stability_no_crash():
    repo_root = Path(__file__).resolve().parents[1]
    module_dir = repo_root / "juce-engine" / "build"
    if not module_dir.exists():
        pytest.skip(f"JUCE build output not found at {module_dir}")

    script = textwrap.dedent(
        f"""
        import sys
        import time

        sys.path.insert(0, {str(module_dir)!r})
        import map2_audio_engine

        engine = map2_audio_engine.create_engine()
        engine.set_sample_rate(48000)
        engine.set_buffer_size(64)

        if not engine.initialize(""):
            raise SystemExit(2)
        if not engine.start_audio():
            engine.shutdown()
            raise SystemExit(3)

        time.sleep(0.3)
        stats = engine.get_audio_io_stats()

        engine.stop_audio()
        engine.shutdown()

        if not stats.get("device_connected", False):
            raise SystemExit(4)
        """
    )

    env = os.environ.copy()
    env.setdefault("MAP2_AUDIO_PREFER_JACK", "0")

    proc = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(repo_root),
        env=env,
        capture_output=True,
        text=True,
        timeout=45,
        check=False,
    )

    if proc.returncode in (2, 3):
        pytest.skip(f"Audio backend unavailable in test environment (rc={proc.returncode})")

    assert proc.returncode == 0, (
        f"Engine start/stop stability regression (rc={proc.returncode})\n"
        f"stdout:\n{proc.stdout}\n"
        f"stderr:\n{proc.stderr}"
    )

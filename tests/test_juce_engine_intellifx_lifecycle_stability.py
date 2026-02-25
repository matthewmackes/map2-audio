import os
import subprocess
import sys
from pathlib import Path

import pytest


def test_random_fx_soak_short_run_no_native_crash() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    module_dir = repo_root / "juce-engine" / "build"
    soak_script = (
        repo_root
        / ".codex"
        / "skills"
        / "juce-random-effects-soak"
        / "scripts"
        / "run_juce_random_fx_soak.py"
    )

    if not module_dir.exists():
        pytest.skip(f"JUCE build output not found at {module_dir}")
    if not soak_script.exists():
        pytest.skip(f"Soak script not found at {soak_script}")

    env = os.environ.copy()
    env.setdefault("MAP2_AUDIO_PREFER_JACK", "0")

    proc = subprocess.run(
        [
            sys.executable,
            str(soak_script),
            "--duration-seconds",
            "12",
            "--flow-rotation-seconds",
            "4",
            "--sample-interval-seconds",
            "0.5",
            "--reset-stats-after-warmup",
            "--module-dir",
            str(module_dir),
        ],
        cwd=str(repo_root),
        env=env,
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )

    combined = f"{proc.stdout}\n{proc.stderr}"
    if proc.returncode == 1 and (
        "engine.initialize failed" in combined or "engine.start_audio failed" in combined
    ):
        pytest.skip("Audio backend unavailable in current test environment")

    assert proc.returncode == 0, (
        f"Short random FX soak crashed or failed unexpectedly (rc={proc.returncode})\n"
        f"stdout:\n{proc.stdout}\n"
        f"stderr:\n{proc.stderr}"
    )

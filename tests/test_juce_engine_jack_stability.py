import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest


def _run_case(repo_root: Path, module_dir: Path, active: str) -> subprocess.CompletedProcess[str]:
    script = textwrap.dedent(
        f"""
        import sys
        import time

        sys.path.insert(0, {str(module_dir)!r})
        import map2_audio_engine

        bypass_methods = [
            "set_chorus_bypass",
            "set_phaser_bypass",
            "set_pitch_shifter_bypass",
            "set_shoegaze_bypass",
            "set_lexilove_bypass",
            "set_h3000_bypass",
            "set_peavey5150_bypass",
            "set_tweedbassman_bypass",
            "set_passionfx_bypass",
            "set_gate_bypass",
            "set_compressor_bypass",
            "set_limiter_bypass",
            "set_eq_bypass",
            "set_nam_bypass",
            "set_cabinet_bypass",
            "set_reverb_bypass",
        ]

        engine = map2_audio_engine.create_engine()
        engine.set_sample_rate(48000)
        engine.set_buffer_size(64)

        if not engine.initialize(""):
            raise SystemExit(2)
        if not engine.start_audio():
            engine.shutdown()
            raise SystemExit(3)

        health = engine.get_connection_health()
        backend = str(health.get("current_backend", ""))
        if "JACK" not in backend.upper():
            engine.stop_audio()
            engine.shutdown()
            raise SystemExit(20)

        for method in bypass_methods:
            fn = getattr(engine, method, None)
            if callable(fn):
                fn(True)

        if {active!r} != "none":
            fn = getattr(engine, "set_" + {active!r} + "_bypass", None)
            if callable(fn):
                fn(False)

        for _ in range(80):
            engine.get_cpu_metrics()
            engine.get_audio_io_stats()
            time.sleep(0.02)

        engine.stop_audio()
        engine.shutdown()
        """
    )

    env = os.environ.copy()
    env["MAP2_AUDIO_PREFER_JACK"] = "1"

    return subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(repo_root),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


@pytest.mark.parametrize("active", ["none", "chorus", "phaser"])
def test_forced_jack_start_stop_no_crash(active: str) -> None:
    repo_root = Path(__file__).resolve().parents[1]
    module_dir = repo_root / "juce-engine" / "build"
    if not module_dir.exists():
        pytest.skip(f"JUCE build output not found at {module_dir}")

    proc = _run_case(repo_root, module_dir, active)
    if proc.returncode in (2, 3):
        pytest.skip(f"Audio backend unavailable in test environment (rc={proc.returncode})")
    if proc.returncode == 20:
        pytest.skip("JACK backend not active in current test environment")

    assert proc.returncode == 0, (
        f"Forced JACK stability regression for case={active} (rc={proc.returncode})\n"
        f"stdout:\n{proc.stdout}\n"
        f"stderr:\n{proc.stderr}"
    )

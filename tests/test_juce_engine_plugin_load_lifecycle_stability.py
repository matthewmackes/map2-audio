import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest


def _run_plugin_lifecycle_case(repo_root: Path, module_dir: Path) -> subprocess.CompletedProcess[str]:
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

        plugins = list(engine.list_plugins())
        if not plugins:
            engine.shutdown()
            raise SystemExit(20)

        uri = str(plugins[0].get("uri", ""))
        if not uri:
            engine.shutdown()
            raise SystemExit(21)

        plugin_id = int(engine.load_plugin(uri))
        if plugin_id <= 0:
            engine.shutdown()
            raise SystemExit(22)

        chain = list(engine.get_chain_order())
        if plugin_id in chain:
            # load_plugin must not implicitly place in chain.
            engine.unload_plugin(plugin_id)
            engine.shutdown()
            raise SystemExit(23)

        if not engine.add_to_chain(plugin_id, -1):
            engine.unload_plugin(plugin_id)
            engine.shutdown()
            raise SystemExit(24)

        group_id = int(engine.create_parallel_group(-1, 2))
        if group_id < 0:
            engine.remove_from_chain(plugin_id)
            engine.unload_plugin(plugin_id)
            engine.shutdown()
            raise SystemExit(25)

        # Duplicate placement is forbidden.
        if engine.add_to_parallel_branch(group_id, 0, plugin_id, -1):
            engine.remove_parallel_group(group_id)
            engine.remove_from_chain(plugin_id)
            engine.unload_plugin(plugin_id)
            engine.shutdown()
            raise SystemExit(26)

        if not engine.remove_from_chain(plugin_id):
            engine.remove_parallel_group(group_id)
            engine.unload_plugin(plugin_id)
            engine.shutdown()
            raise SystemExit(27)

        if not engine.add_to_parallel_branch(group_id, 0, plugin_id, -1):
            engine.remove_parallel_group(group_id)
            engine.unload_plugin(plugin_id)
            engine.shutdown()
            raise SystemExit(28)

        if engine.add_to_chain(plugin_id, -1):
            engine.remove_parallel_group(group_id)
            engine.unload_plugin(plugin_id)
            engine.shutdown()
            raise SystemExit(29)

        if not engine.remove_parallel_group(group_id):
            engine.unload_plugin(plugin_id)
            engine.shutdown()
            raise SystemExit(30)

        if not engine.unload_plugin(plugin_id):
            engine.shutdown()
            raise SystemExit(31)

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


def test_plugin_load_lifecycle_no_crash_and_deterministic_placement() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    module_dir = repo_root / "juce-engine" / "build"
    if not module_dir.exists():
        pytest.skip(f"JUCE build output not found at {module_dir}")

    proc = _run_plugin_lifecycle_case(repo_root, module_dir)
    if proc.returncode in (2,):
        pytest.skip(f"Engine unavailable in test environment (rc={proc.returncode})")
    if proc.returncode in (20, 21, 22):
        pytest.skip(f"No loadable plugin inventory in current test environment (rc={proc.returncode})")

    assert proc.returncode == 0, (
        f"Plugin load/placement lifecycle regression (rc={proc.returncode})\n"
        f"stdout:\n{proc.stdout}\n"
        f"stderr:\n{proc.stderr}"
    )

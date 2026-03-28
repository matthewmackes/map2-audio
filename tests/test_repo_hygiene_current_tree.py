from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

DISALLOWED_TREE_PREFIXES = (
    "juce-engine/MAP2ThePlugins/build-win/",
    "juce-engine/build-asan/",
    "juce-engine/build-asan-clang/",
    "juce-engine/build-avdecc-test/",
    "juce-engine/build-check/",
)
DISALLOWED_COMPILED_SUFFIXES = (
    ".o",
    ".obj",
    ".a",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
)


def _tracked_paths() -> list[str]:
    raw = subprocess.check_output(["git", "-C", str(ROOT), "ls-files", "-z"], text=False)
    return [path for path in raw.decode().split("\0") if path]


def test_no_tracked_juce_build_trees_or_compiled_artifacts_remain_in_current_tree() -> None:
    violations: list[str] = []

    for path in _tracked_paths():
        if path.startswith(DISALLOWED_TREE_PREFIXES):
            violations.append(path)
            continue

        if not path.startswith("juce-engine/"):
            continue

        if "/build-win/" in path:
            violations.append(path)
            continue

        if path.endswith(DISALLOWED_COMPILED_SUFFIXES):
            violations.append(path)
            continue

        if ".vst3/" in path:
            violations.append(path)

    assert violations == []

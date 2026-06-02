"""T2521-8b: USE_SONOBUS CMake option + vendor/aoo skeleton tests.

Verifies the CMake option block exists in juce-engine/CMakeLists.txt
with the locked Q15/Q20 posture, and that the vendor/aoo placeholder
documents the upstream license + Q20 vendor-source rationale.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _cmake_text() -> str:
    return (REPO_ROOT / "juce-engine" / "CMakeLists.txt").read_text()


def _vendor_readme() -> str:
    return (REPO_ROOT / "vendor" / "aoo" / "README.md").read_text()


def test_use_sonobus_option_present():
    text = _cmake_text()
    assert "option(USE_SONOBUS" in text


def test_use_sonobus_defaults_on_per_q15():
    """Q15 — installed and enabled by default. The CMake option must
    declare a default of ON."""
    text = _cmake_text()
    # Pull just the option(...) line.
    option_line = next(
        line for line in text.splitlines() if line.startswith("option(USE_SONOBUS")
    )
    assert option_line.rstrip().endswith("ON)"), option_line


def test_cmake_checks_for_vendor_aoo_skeleton():
    """The CMake block must guard add_subdirectory with an EXISTS check
    so the engine build still works with only the skeleton present."""
    text = _cmake_text()
    assert "SONOBUS_VENDOR_DIR" in text
    assert "vendor/aoo" in text
    assert "EXISTS" in text  # the guard


def test_vendor_aoo_skeleton_exists():
    placeholder = REPO_ROOT / "vendor" / "aoo" / ".gitkeep"
    readme = REPO_ROOT / "vendor" / "aoo" / "README.md"
    assert placeholder.is_file()
    assert readme.is_file()


def test_vendor_readme_cites_q20_and_bsd3():
    text = _vendor_readme()
    assert "Q20" in text
    assert "BSD-3-Clause" in text
    assert "https://aoo.iem.at" in text


def test_vendor_readme_notes_agplv3_compatibility():
    text = _vendor_readme()
    assert "AGPLv3" in text
    # The one-way upgrade is what makes the vendor strategy compatible.
    assert "BSD-3" in text


def test_vendor_aoo_carries_real_source_tree():
    """T2521-4 (2026-06-02): the real AOO source is now vendored, so the
    upstream-shipped CMakeLists.txt MUST be present — and it must be the
    genuine upstream tree, not a hand-seeded stub. Guards against the
    failure mode of a CMakeLists with no actual AOO library behind it.

    (Before the source pull this test asserted ABSENCE; it flipped to
    asserting PRESENCE in lockstep with the vendor pull, exactly as the
    SONOBUS_BENCH_HANDOFF.md "What still needs to land" note specified.)"""
    aoo_dir = REPO_ROOT / "vendor" / "aoo"
    cmake = aoo_dir / "CMakeLists.txt"
    assert cmake.exists(), (
        f"vendor/aoo/CMakeLists.txt missing at {cmake}; the real AOO "
        "source tree must be vendored as part of T2521-4."
    )
    # Sanity: the genuine upstream tree carries the core library + headers,
    # not just a lone CMakeLists.
    assert (aoo_dir / "aoo").is_dir(), "vendor/aoo/aoo/ (core library) missing"
    assert (aoo_dir / "include").is_dir(), "vendor/aoo/include/ (headers) missing"
    assert (aoo_dir / "LICENSE").exists(), "vendor/aoo/LICENSE (BSD-3) missing"
    # The pre-pull placeholder must be gone now that the real LICENSE landed.
    assert not (aoo_dir / "LICENSE.placeholder").exists(), (
        "vendor/aoo/LICENSE.placeholder should be removed once the real "
        "upstream LICENSE is vendored."
    )

"""T2521-4 cycle 1 — `map2-sonobus-transport` daemon build contract.

Locks the source-tree shape + CMake target shape for the SonoBus
daemon. Tests don't compile the daemon (CI does); they verify the
build system inputs are in place.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
DAEMON_DIR = REPO_ROOT / "juce-engine" / "SonoBusDaemon"
DAEMON_CMAKE = DAEMON_DIR / "CMakeLists.txt"
DAEMON_SOURCE_DIR = DAEMON_DIR / "Source"
PARENT_CMAKE = REPO_ROOT / "juce-engine" / "CMakeLists.txt"


# ---------------------------------------------------------------------------
# Source-tree shape
# ---------------------------------------------------------------------------


def test_daemon_dir_exists() -> None:
    assert DAEMON_DIR.is_dir(), f"missing SonoBusDaemon dir at {DAEMON_DIR}"


def test_daemon_cmake_exists() -> None:
    assert DAEMON_CMAKE.is_file(), f"missing daemon CMakeLists.txt at {DAEMON_CMAKE}"


@pytest.mark.parametrize(
    "source_file",
    [
        "Main.cpp",
        "DaemonConfig.h",
        "DaemonConfig.cpp",
        "DaemonServer.h",
        "DaemonServer.cpp",
        "UdsProtocol.h",
        "UdsProtocol.cpp",
        "AooTransport.h",
        "AooTransport.cpp",
        "JackBridge.h",
        "JackBridge.cpp",
        "MetricsCollector.h",
        "MetricsCollector.cpp",
    ],
)
def test_daemon_source_file_exists(source_file: str) -> None:
    path = DAEMON_SOURCE_DIR / source_file
    assert path.is_file(), f"missing daemon source file {path}"


# ---------------------------------------------------------------------------
# CMake target shape
# ---------------------------------------------------------------------------


def test_parent_cmake_calls_add_subdirectory_sonobusdaemon() -> None:
    """The parent juce-engine/CMakeLists.txt must add the SonoBusDaemon
    subdir when USE_SONOBUS is ON."""
    text = PARENT_CMAKE.read_text()
    assert "add_subdirectory(SonoBusDaemon)" in text, (
        "juce-engine/CMakeLists.txt must add SonoBusDaemon subdirectory "
        "so the daemon binary is built when USE_SONOBUS=ON"
    )


def test_parent_cmake_documents_three_build_modes() -> None:
    """The build supports three modes: AOO full / AOO stub / disabled."""
    text = PARENT_CMAKE.read_text()
    assert "Three build modes" in text or "three modes" in text.lower(), (
        "juce-engine/CMakeLists.txt must document the three SonoBus build modes "
        "(full / stub / disabled)"
    )
    assert "SONOBUS_BUILD_STUB" in text, (
        "juce-engine/CMakeLists.txt must set SONOBUS_BUILD_STUB flag for stub mode"
    )


def test_daemon_cmake_declares_executable_target() -> None:
    text = DAEMON_CMAKE.read_text()
    assert "add_executable(map2-sonobus-transport" in text, (
        "daemon CMakeLists must declare the map2-sonobus-transport executable target"
    )


def test_daemon_cmake_handles_aoo_vendor_optional() -> None:
    """The daemon CMake must compile in both modes: with AOO (vendored)
    or without (stub). Compile-time flag is MAP2_SONOBUS_HAS_AOO."""
    text = DAEMON_CMAKE.read_text()
    assert "MAP2_SONOBUS_HAS_AOO=1" in text, (
        "daemon CMake must set MAP2_SONOBUS_HAS_AOO=1 in full mode"
    )
    assert "MAP2_SONOBUS_HAS_AOO=0" in text, (
        "daemon CMake must set MAP2_SONOBUS_HAS_AOO=0 in stub mode"
    )


def test_daemon_cmake_links_jack_via_pkgconfig() -> None:
    text = DAEMON_CMAKE.read_text()
    assert "pkg_check_modules(JACK jack)" in text, (
        "daemon CMake must use pkg_check_modules to find JACK"
    )
    # JACK_LDFLAGS instead of JACK_LIBRARIES so the -L flags reach the linker
    # (Fedora ships libjack under /usr/lib64/pipewire-0.3/jack/).
    assert "JACK_LDFLAGS" in text, (
        "daemon CMake must use JACK_LDFLAGS so the -L flags reach the linker "
        "(libjack lives under /usr/lib64/pipewire-0.3/jack/ on Fedora)"
    )


def test_daemon_cmake_links_libuv_optional() -> None:
    """libuv is optional in cycle 1 (POSIX poll loop); becomes required
    in cycle 2 when the libuv event loop lands."""
    text = DAEMON_CMAKE.read_text()
    assert "pkg_check_modules(LIBUV libuv)" in text, (
        "daemon CMake must use pkg_check_modules to find libuv"
    )
    assert "MAP2_SONOBUS_HAS_LIBUV" in text, (
        "daemon CMake must export MAP2_SONOBUS_HAS_LIBUV compile-time flag"
    )


# ---------------------------------------------------------------------------
# DaemonConfig: locked defaults match the systemd unit
# ---------------------------------------------------------------------------


def test_daemon_config_defaults_match_systemd_unit() -> None:
    """The DEFAULT_* constants in DaemonConfig.h must match the
    Environment= block in packaging/systemd/map2-sonobus-transport.service."""
    config_text = (DAEMON_SOURCE_DIR / "DaemonConfig.h").read_text()
    unit_text = (
        REPO_ROOT / "packaging" / "systemd" / "map2-sonobus-transport.service"
    ).read_text()

    # Port range must match: 10000 + 100
    assert "DEFAULT_UDP_PORT_BASE = 10000" in config_text, (
        "daemon DEFAULT_UDP_PORT_BASE must be 10000 to match systemd unit"
    )
    assert "DEFAULT_UDP_PORT_COUNT = 100" in config_text, (
        "daemon DEFAULT_UDP_PORT_COUNT must be 100"
    )
    assert "MAP2_SONOBUS_UDP_PORT_BASE=10000" in unit_text, (
        "systemd unit must set MAP2_SONOBUS_UDP_PORT_BASE=10000"
    )

    # Sample rate / buffer size match the platform-wide locks.
    assert "DEFAULT_SAMPLE_RATE_HZ = 48000" in config_text
    assert "DEFAULT_BUFFER_SIZE = 64" in config_text


def test_daemon_config_uds_path_matches_systemd_unit() -> None:
    """The default UDS path must match the systemd unit's --socket arg."""
    config_text = (DAEMON_SOURCE_DIR / "DaemonConfig.h").read_text()
    unit_text = (
        REPO_ROOT / "packaging" / "systemd" / "map2-sonobus-transport.service"
    ).read_text()
    assert "/run/map2/sonobus-transport.sock" in config_text
    assert "/run/map2/sonobus-transport.sock" in unit_text


def test_daemon_config_max_channels_matches_q14_lock() -> None:
    """Q14 lock: full multichannel, default cap 32 channels per binding."""
    config_text = (DAEMON_SOURCE_DIR / "DaemonConfig.h").read_text()
    assert "DEFAULT_MAX_CHANNELS = 32" in config_text, (
        "DaemonConfig must enforce Q14 channel cap of 32"
    )


# ---------------------------------------------------------------------------
# AooTransport API shape
# ---------------------------------------------------------------------------


def test_aoo_transport_declares_lifecycle_api() -> None:
    """AooTransport must declare create/destroy for sources + sinks."""
    text = (DAEMON_SOURCE_DIR / "AooTransport.h").read_text()
    for symbol in (
        "createSource",
        "destroySource",
        "createSink",
        "destroySink",
        "TransportResult",
        "Unavailable",  # stub mode error code
    ):
        assert symbol in text, (
            f"AooTransport.h must declare {symbol!r}"
        )


def test_aoo_transport_has_stub_path() -> None:
    """AooTransport.cpp must compile in both modes (full + stub) via
    #if MAP2_SONOBUS_HAS_AOO guards."""
    text = (DAEMON_SOURCE_DIR / "AooTransport.cpp").read_text()
    assert "#if MAP2_SONOBUS_HAS_AOO" in text, (
        "AooTransport.cpp must guard AOO calls with #if MAP2_SONOBUS_HAS_AOO"
    )
    assert "TransportResult::Unavailable" in text, (
        "AooTransport.cpp stub path must return TransportResult::Unavailable"
    )


# ---------------------------------------------------------------------------
# Main entrypoint shape
# ---------------------------------------------------------------------------


def test_main_handles_sigterm_gracefully() -> None:
    """The daemon must install a SIGTERM handler that triggers graceful
    shutdown — without this, systemctl stop hard-kills the daemon and
    leaves stale UDS sockets."""
    text = (DAEMON_SOURCE_DIR / "Main.cpp").read_text()
    assert "SIGTERM" in text, "Main.cpp must handle SIGTERM"
    assert "SIGINT" in text, "Main.cpp must handle SIGINT (Ctrl-C in dev)"
    assert "SIGPIPE" in text and "SIG_IGN" in text, (
        "Main.cpp must SIG_IGN SIGPIPE — a closed UDS peer should fail "
        "the write with EPIPE, not kill the daemon"
    )


def test_main_supports_version_flag() -> None:
    text = (DAEMON_SOURCE_DIR / "Main.cpp").read_text()
    assert "show_version" in text or "--version" in text, (
        "Main.cpp must implement --version flag"
    )

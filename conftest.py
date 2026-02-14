"""Root pytest collection controls for this repository."""

import inspect

import pytest

# Ignore standalone scripts/hardware checks that happen to match pytest naming.
# These are executable validation utilities, not stable unit/integration suites.
collect_ignore_glob = [
    "scripts/test_*.py",
    "scripts/self_test.py",
    "lcd/test_*.py",
    "tui/test_*.py",
    "tui/screens/test_*.py",
]


def pytest_configure(config):
    """Register common markers used across suites."""
    config.addinivalue_line("markers", "asyncio: mark test as async")
    config.addinivalue_line(
        "markers",
        "avb: marks tests as requiring AVB/TSN hardware (deselect with '-m \"not avb\"')"
    )
    config.addinivalue_line(
        "markers",
        "avb_rt_safety: marks tests as requiring AVB RT safety instrumentation "
        "(deselect with '-m \"not avb_rt_safety\"')"
    )
    config.addinivalue_line(
        "markers",
        "performance: marks tests that measure performance metrics"
    )
    config.addinivalue_line(
        "markers",
        "integration: marks tests that test complete workflows across multiple components"
    )
    config.addinivalue_line(
        "markers",
        "slow: marks tests that take >10 seconds to run (deselect with '-m \"not slow\"')"
    )


def pytest_collection_modifyitems(config, items):
    """Skip async tests when pytest-asyncio plugin is unavailable."""
    if config.pluginmanager.hasplugin("asyncio"):
        return

    skip_async = pytest.mark.skip(reason="pytest-asyncio is not installed")
    for item in items:
        test_func = getattr(item, "obj", None)
        if item.get_closest_marker("asyncio") or (
            test_func is not None and inspect.iscoroutinefunction(test_func)
        ):
            item.add_marker(skip_async)

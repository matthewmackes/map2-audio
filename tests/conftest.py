import os
import inspect
import pytest


@pytest.fixture(autouse=True)
def _enable_test_mode(monkeypatch):
    monkeypatch.setenv("MAP2_TEST_MODE", "true")
    yield


def pytest_configure(config):
    """Register local markers used by this test suite."""
    config.addinivalue_line("markers", "asyncio: mark test as async")
    config.addinivalue_line("markers", "avdecc_mock: AVDECC mock-harness integration tests")


def pytest_collection_modifyitems(config, items):
    """
    Skip async tests when pytest-asyncio is not installed.

    This keeps synchronous suites runnable in constrained environments.
    """
    if config.pluginmanager.hasplugin("asyncio"):
        return

    skip_async = pytest.mark.skip(reason="pytest-asyncio is not installed")
    for item in items:
        test_func = getattr(item, "obj", None)
        if item.get_closest_marker("asyncio") or (
            test_func is not None and inspect.iscoroutinefunction(test_func)
        ):
            item.add_marker(skip_async)

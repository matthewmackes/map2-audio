import os
import inspect
import pytest

try:
    import pytest_asyncio
    _ASYNCIO_AVAILABLE = True
except ImportError:
    pytest_asyncio = None  # type: ignore
    _ASYNCIO_AVAILABLE = False

try:
    import httpx
    _HTTPX_AVAILABLE = True
except ImportError:
    _HTTPX_AVAILABLE = False

MAP2_BASE_URL = os.environ.get("MAP2_TEST_URL", "http://localhost:8080")


class _JsonClient:
    """Thin wrapper around httpx.AsyncClient that auto-parses JSON responses.

    Returns the parsed dict/list on 2xx, None on 4xx/5xx, and lets connection
    errors propagate (so the probe in api_client() can catch them).
    """

    def __init__(self, client):
        self._client = client

    async def get(self, url, **kwargs):
        resp = await self._client.get(url, **kwargs)
        if resp.status_code < 400:
            try:
                return resp.json()
            except Exception:
                return None
        return None

    async def post(self, url, **kwargs):
        resp = await self._client.post(url, **kwargs)
        if resp.status_code < 400:
            try:
                return resp.json()
            except Exception:
                return None
        return None

    async def delete(self, url, **kwargs):
        resp = await self._client.delete(url, **kwargs)
        if resp.status_code < 400:
            try:
                return resp.json()
            except Exception:
                return None
        return None


@pytest.fixture(autouse=True)
def _enable_test_mode(monkeypatch):
    monkeypatch.setenv("MAP2_TEST_MODE", "true")
    yield


# Use pytest_asyncio.fixture when available so async fixtures are properly
# handled in asyncio_mode = auto.  Fall back to plain pytest.fixture otherwise
# (sync environments skip async tests via pytest_collection_modifyitems below).
_async_fixture = pytest_asyncio.fixture if _ASYNCIO_AVAILABLE else pytest.fixture


@_async_fixture
async def api_client():
    """Async HTTP client pointed at a running MAP2 backend.

    Skips the test automatically when the server is not reachable so that
    integration tests don't block the offline unit-test suite.
    """
    if not _HTTPX_AVAILABLE:
        pytest.skip("httpx not installed (pip install httpx)")

    import httpx as _httpx
    try:
        async with _httpx.AsyncClient(base_url=MAP2_BASE_URL, timeout=2.0) as probe:
            await probe.get("/api/health")
    except Exception:
        pytest.skip(f"MAP2 backend not reachable at {MAP2_BASE_URL}")

    async with _httpx.AsyncClient(base_url=MAP2_BASE_URL, timeout=10.0) as client:
        yield _JsonClient(client)


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

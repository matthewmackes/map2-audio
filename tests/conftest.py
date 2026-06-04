import os
import inspect
from contextlib import suppress

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

_OPEN_FASTAPI_TEST_CLIENTS = []

try:
    from starlette.testclient import TestClient as _StarletteTestClient

    _ORIGINAL_TEST_CLIENT_INIT = _StarletteTestClient.__init__

    def _tracking_test_client_init(self, *args, **kwargs):
        _ORIGINAL_TEST_CLIENT_INIT(self, *args, **kwargs)
        _OPEN_FASTAPI_TEST_CLIENTS.append(self)

    if not getattr(_StarletteTestClient, "_map2_tracking_enabled", False):
        _StarletteTestClient.__init__ = _tracking_test_client_init
        _StarletteTestClient._map2_tracking_enabled = True
except Exception:
    _StarletteTestClient = None


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
def _enable_test_mode(monkeypatch, tmp_path):
    monkeypatch.setenv("MAP2_TEST_MODE", "true")
    monkeypatch.setenv("MAP2_RAFT_STATE_DIR", str(tmp_path / "raft-state"))
    yield


_TEST_AUDIO_STATE_NS_PREFIX = "/map2/audio-state-test"


def _sweep_test_audio_state_namespaces() -> None:
    """Best-effort delete of every per-test etcd audio-state key written under
    ``_TEST_AUDIO_STATE_NS_PREFIX``. No-op when etcd is unreachable."""
    import base64
    import json as _json
    import urllib.request

    try:
        import app.services.audio_state_authority as asa

        endpoints = asa.load_audio_state_etcd_config().endpoints
    except Exception:
        return
    key = base64.b64encode(_TEST_AUDIO_STATE_NS_PREFIX.encode()).decode()
    # range_end = prefix with the final byte incremented → covers the whole subtree
    end_bytes = _TEST_AUDIO_STATE_NS_PREFIX[:-1] + chr(ord(_TEST_AUDIO_STATE_NS_PREFIX[-1]) + 1)
    range_end = base64.b64encode(end_bytes.encode()).decode()
    body = _json.dumps({"key": key, "range_end": range_end}).encode()
    for endpoint in endpoints:
        with suppress(Exception):
            req = urllib.request.Request(
                f"{endpoint.rstrip('/')}/v3/kv/deleterange",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=2.0).read()
            return


@pytest.fixture(autouse=True)
def _isolate_audio_state_authority(monkeypatch):
    """Give each test its own etcd audio-state namespace.

    The audio-state authority defaults to the shared ``/map2/audio-state/v1``
    namespace. On a host with a live etcd (e.g. a dev/test appliance), one
    test that activates a snapshot publishes committed state there, and a later
    test's ``get_committed_state()`` then reads that stale snapshot — an
    order-dependent failure that does not occur in CI (where etcd is simply
    unreachable and the authority returns "no committed state"). Pointing each
    test at a unique namespace restores per-test isolation while keeping the
    authority fully functional. Tests that construct the authority with an
    explicit ``AudioStateEtcdConfig`` are unaffected (this only patches the
    implicit ``load_audio_state_etcd_config`` path). The whole test prefix is
    swept once at session end (see ``pytest_sessionfinish``)."""
    try:
        import app.services.audio_state_authority as asa
    except Exception:
        yield
        return

    from dataclasses import replace
    from uuid import uuid4

    original = asa.load_audio_state_etcd_config
    test_namespace = f"{_TEST_AUDIO_STATE_NS_PREFIX}/{uuid4().hex}"

    def _patched():
        return replace(original(), namespace=test_namespace)

    monkeypatch.setattr(asa, "load_audio_state_etcd_config", _patched)
    yield


@pytest.fixture(autouse=True)
def _dispose_async_db_in_loop(monkeypatch):
    """Dispose the async DB engine *inside* each ``asyncio.run()`` loop.

    Many suites drive the DB via a bare ``asyncio.run(_run())`` — a fresh event
    loop that is then closed. aiosqlite binds every connection (and its worker
    thread) to the loop that created it, so a pooled connection still open when
    the loop closes can only be closed from that loop. A later ``init_async_db``
    that disposes the previous engine then raises ``MissingGreenlet`` /
    ``RuntimeError: Event loop is closed`` from the orphaned worker thread — an
    order-dependent flaky failure (a prior test's leak surfaces on a later one).

    Wrapping ``asyncio.run`` to ``await engine.dispose()`` after the coroutine
    finishes but before the loop closes shuts those connections down in their
    own loop. Connection pooling *during* the test is unchanged, so test
    behavior (and visibility semantics) is identical — this only fixes teardown.
    """
    import asyncio
    import sys

    real_run = asyncio.run

    def _run_and_dispose(main, **kwargs):
        async def _wrapped():
            try:
                return await main
            finally:
                database_module = sys.modules.get("app.database")
                engine = getattr(database_module, "_async_engine", None) if database_module else None
                if engine is not None:
                    with suppress(Exception):
                        await engine.dispose()

        return real_run(_wrapped(), **kwargs)

    monkeypatch.setattr(asyncio, "run", _run_and_dispose)
    yield


@pytest.fixture(autouse=True)
def _close_fastapi_test_clients():
    """Ensure ad-hoc TestClient instances do not leave portal threads alive."""
    try:
        yield
    finally:
        while _OPEN_FASTAPI_TEST_CLIENTS:
            with suppress(Exception):
                _OPEN_FASTAPI_TEST_CLIENTS.pop().close()


def pytest_sessionfinish(session, exitstatus):
    """Release native PortAudio/PipeWire threads opened by sounddevice imports."""
    import asyncio
    import sys

    database_module = sys.modules.get("app.database")
    dispose_async_db = getattr(database_module, "dispose_async_db", None)
    if callable(dispose_async_db):
        with suppress(Exception):
            asyncio.run(dispose_async_db())

    # Sweep the per-test etcd audio-state namespaces created by
    # _isolate_audio_state_authority (best-effort; no-op when etcd is down).
    _sweep_test_audio_state_namespaces()

    sounddevice = sys.modules.get("sounddevice")
    terminate = getattr(sounddevice, "_terminate", None)
    if callable(terminate):
        with suppress(Exception):
            terminate()


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

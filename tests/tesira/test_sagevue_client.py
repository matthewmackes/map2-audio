import asyncio
import sys
import types

import pytest

from app.services.tesira.sagevue_client import SageVueClient, SageVueSettings


class _FakeResponse:
    def __init__(self, payload=None):
        self._payload = payload or {"status": "ok"}
        self.content = b"{}"

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeAsyncClient:
    last_init = None
    last_request = None

    def __init__(self, **kwargs):
        _FakeAsyncClient.last_init = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def request(self, method, url, **kwargs):
        _FakeAsyncClient.last_request = {
            "method": method,
            "url": url,
            **kwargs,
        }
        return _FakeResponse({"job_id": "sv-123", "state": "queued"})


def test_sagevue_client_disabled_guard():
    client = SageVueClient(
        SageVueSettings(
            enabled=False,
            base_url="https://sagevue.local",
            api_token="token",
            verify_ssl=True,
            timeout_s=10.0,
        )
    )

    async def _run():
        with pytest.raises(RuntimeError):
            await client.health_check()

    asyncio.run(_run())


def test_sagevue_client_deploy_uses_auth_header_and_payload(monkeypatch):
    fake_httpx = types.SimpleNamespace(AsyncClient=_FakeAsyncClient)
    monkeypatch.setitem(sys.modules, "httpx", fake_httpx)

    import app.config as config_module

    class _Cfg:
        @staticmethod
        def get(key, default=None):
            if key == "tesira.sagevue_deploy_path":
                return "/api/custom/deploy"
            return default

    monkeypatch.setattr(config_module, "get_config", lambda: _Cfg())

    client = SageVueClient(
        SageVueSettings(
            enabled=True,
            base_url="https://sagevue.local",
            api_token="secret-token",
            verify_ssl=False,
            timeout_s=7.5,
        )
    )

    async def _run():
        result = await client.deploy_layout(
            layout_id="forte_ci_default",
            target_device="172.20.146.237",
            dry_run=True,
            metadata={"requested_by": "map2"},
        )
        assert result["job_id"] == "sv-123"

    asyncio.run(_run())

    assert _FakeAsyncClient.last_init == {"timeout": 7.5, "verify": False}
    assert _FakeAsyncClient.last_request is not None
    assert _FakeAsyncClient.last_request["method"] == "POST"
    assert _FakeAsyncClient.last_request["url"] == "https://sagevue.local/api/custom/deploy"
    headers = _FakeAsyncClient.last_request["headers"]
    assert headers["Authorization"] == "Bearer secret-token"
    payload = _FakeAsyncClient.last_request["json"]
    assert payload["layout_id"] == "forte_ci_default"
    assert payload["target_device"] == "172.20.146.237"
    assert payload["dry_run"] is True


def test_sagevue_client_from_config(monkeypatch):
    import app.config as config_module

    class _Cfg:
        values = {
            "tesira.sagevue_enabled": True,
            "tesira.sagevue_base_url": "https://sagevue.example.local",
            "tesira.sagevue_api_token": "api-token",
            "tesira.sagevue_verify_ssl": False,
            "tesira.sagevue_timeout_s": 20.0,
        }

        def get(self, key, default=None):
            return self.values.get(key, default)

    monkeypatch.setattr(config_module, "get_config", lambda: _Cfg())

    client = SageVueClient.from_config()
    assert client.enabled is True
    assert client.base_url == "https://sagevue.example.local"
    assert client.has_token is True


def test_sagevue_settings_repr_redacts_api_token():
    settings = SageVueSettings(
        enabled=True,
        base_url="https://sagevue.example.local",
        api_token="secret-token",
        verify_ssl=True,
        timeout_s=5.0,
    )

    assert "secret-token" not in repr(settings)

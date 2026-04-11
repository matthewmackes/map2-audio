import asyncio
from datetime import datetime, timezone

from app.routes import www


def test_www_health_check_uses_timezone_aware_timestamp(monkeypatch):
    monkeypatch.setattr(www, "check_port_listening", lambda port: port == 3000)

    payload = asyncio.run(www.health_check())
    parsed = datetime.fromisoformat(payload["timestamp"])

    assert parsed.tzinfo is not None
    assert parsed.utcoffset() == timezone.utc.utcoffset(parsed)
    assert payload["backend"] is False
    assert payload["frontend"] is True


def test_www_log_request_persists_timezone_aware_timestamp(monkeypatch):
    persisted = []
    monkeypatch.setattr(www, "_persist_access_log", lambda entry: persisted.append(entry))
    monkeypatch.setattr(www, "_access_logs", [])
    monkeypatch.setattr(www, "_request_count", 0)

    www.log_request("GET", "/api/www/health", 200, 12.5, "127.0.0.1")

    assert len(persisted) == 1
    parsed = datetime.fromisoformat(persisted[0]["timestamp"])
    assert parsed.tzinfo is not None
    assert parsed.utcoffset() == timezone.utc.utcoffset(parsed)
    assert www._request_count == 1
    assert www._access_logs[-1]["path"] == "/api/www/health"

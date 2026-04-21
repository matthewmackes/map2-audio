"""Tests for the outbound webhook dispatcher service and routes."""

from __future__ import annotations

import hashlib
import hmac
import json
from pathlib import Path

import pytest

from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.severity import Severity
from app.services.webhook_dispatcher_service import (
    WebhookDispatcherService,
    WebhookFilter,
    _PosterResult,
)


def _make_event(
    *,
    kind: str = "system.cpu.high",
    severity: Severity = Severity.WARNING,
    priority: float = 0.5,
) -> PlatformEvent:
    return PlatformEvent(
        kind=kind,
        severity=severity,
        source_node="AUDIO-NODE-0001",
        source_service="webhook-test",
        title="CPU warning",
        message="CPU sustained at 80%",
        priority=priority,
    )


class _RecordingPoster:
    def __init__(self, responses: list[_PosterResult]) -> None:
        self._responses = list(responses)
        self.calls: list[tuple[str, dict[str, str], bytes]] = []

    async def __call__(self, url: str, headers: dict[str, str], body: bytes) -> _PosterResult:
        self.calls.append((url, dict(headers), body))
        if self._responses:
            return self._responses.pop(0)
        return _PosterResult(status_code=200, ok=True, error=None)


def _noop_sleep_factory() -> "tuple[list[float], object]":
    sleeps: list[float] = []

    async def _sleep(seconds: float) -> None:
        sleeps.append(seconds)

    return sleeps, _sleep


@pytest.mark.asyncio
async def test_register_list_and_delete_target(tmp_path: Path) -> None:
    svc = WebhookDispatcherService(db_path=str(tmp_path / "webhooks.db"))
    target = svc.register_target(
        url="https://example.com/hook",
        filter_spec=WebhookFilter(kinds=["system.cpu.high"], min_priority=0.25),
        secret="s3cret",
        enabled=True,
    )
    listed = svc.list_targets()
    assert len(listed) == 1 and listed[0].id == target.id
    assert listed[0].url == "https://example.com/hook"
    assert svc.delete_target(target.id) is True
    assert svc.list_targets() == []


@pytest.mark.asyncio
async def test_register_rejects_invalid_url(tmp_path: Path) -> None:
    svc = WebhookDispatcherService(db_path=str(tmp_path / "webhooks.db"))
    with pytest.raises(ValueError):
        svc.register_target(url="not-a-url")


@pytest.mark.asyncio
async def test_persistence_across_service_restart(tmp_path: Path) -> None:
    db = str(tmp_path / "webhooks.db")
    svc1 = WebhookDispatcherService(db_path=db)
    svc1.register_target(url="https://example.com/a", filter_spec=WebhookFilter())
    svc1.register_target(url="https://example.com/b", filter_spec=WebhookFilter())
    svc2 = WebhookDispatcherService(db_path=db)
    assert {t.url for t in svc2.list_targets()} == {
        "https://example.com/a",
        "https://example.com/b",
    }


@pytest.mark.asyncio
async def test_deliver_event_signs_with_hmac_when_secret_set(tmp_path: Path) -> None:
    poster = _RecordingPoster([_PosterResult(status_code=200, ok=True, error=None)])
    _, sleep = _noop_sleep_factory()
    svc = WebhookDispatcherService(
        db_path=str(tmp_path / "webhooks.db"), poster=poster, sleep=sleep
    )
    target = svc.register_target(url="https://example.com/hook", secret="topsecret")
    event = _make_event()

    ok = await svc.deliver_event(target, event)
    assert ok is True
    assert len(poster.calls) == 1
    _, headers, body = poster.calls[0]
    assert headers["X-Map2-Event-Id"] == event.event_id
    assert headers["X-Map2-Event-Kind"] == event.kind
    assert headers["Content-Type"] == "application/json"
    expected_sig = hmac.new(b"topsecret", body, hashlib.sha256).hexdigest()
    assert headers["X-Map2-Signature"] == f"sha256={expected_sig}"
    payload = json.loads(body.decode("utf-8"))
    assert payload["event_id"] == event.event_id


@pytest.mark.asyncio
async def test_deliver_event_omits_signature_when_no_secret(tmp_path: Path) -> None:
    poster = _RecordingPoster([_PosterResult(status_code=204, ok=True, error=None)])
    _, sleep = _noop_sleep_factory()
    svc = WebhookDispatcherService(
        db_path=str(tmp_path / "webhooks.db"), poster=poster, sleep=sleep
    )
    target = svc.register_target(url="https://example.com/hook")
    await svc.deliver_event(target, _make_event())
    _, headers, _ = poster.calls[0]
    assert "X-Map2-Signature" not in headers


@pytest.mark.asyncio
async def test_deliver_event_retries_up_to_three_attempts_with_backoff(tmp_path: Path) -> None:
    poster = _RecordingPoster(
        [
            _PosterResult(status_code=502, ok=False, error=None),
            _PosterResult(status_code=502, ok=False, error=None),
            _PosterResult(status_code=200, ok=True, error=None),
        ]
    )
    sleeps, sleep = _noop_sleep_factory()
    svc = WebhookDispatcherService(
        db_path=str(tmp_path / "webhooks.db"), poster=poster, sleep=sleep
    )
    target = svc.register_target(url="https://example.com/hook")
    ok = await svc.deliver_event(target, _make_event())
    assert ok is True
    assert len(poster.calls) == 3
    assert sleeps == [0.5, 1.0]  # exponential backoff between attempts
    deliveries = svc.list_deliveries(target.id)
    assert len(deliveries) == 3
    # list_deliveries returns newest first
    assert [d.attempt for d in deliveries] == [3, 2, 1]
    assert deliveries[0].ok is True
    assert deliveries[1].ok is False and deliveries[2].ok is False


@pytest.mark.asyncio
async def test_deliver_event_gives_up_after_max_attempts(tmp_path: Path) -> None:
    poster = _RecordingPoster(
        [_PosterResult(status_code=None, ok=False, error="ConnectError") for _ in range(5)]
    )
    _, sleep = _noop_sleep_factory()
    svc = WebhookDispatcherService(
        db_path=str(tmp_path / "webhooks.db"), poster=poster, sleep=sleep
    )
    target = svc.register_target(url="https://example.com/hook")
    ok = await svc.deliver_event(target, _make_event())
    assert ok is False
    assert len(poster.calls) == 3
    deliveries = svc.list_deliveries(target.id)
    assert len(deliveries) == 3
    assert all(d.ok is False for d in deliveries)


@pytest.mark.asyncio
async def test_on_event_respects_filter_and_skips_disabled(tmp_path: Path) -> None:
    poster = _RecordingPoster([])
    _, sleep = _noop_sleep_factory()
    svc = WebhookDispatcherService(
        db_path=str(tmp_path / "webhooks.db"), poster=poster, sleep=sleep
    )
    # Target 1: matches "system.cpu.*" critical events only
    t1 = svc.register_target(
        url="https://example.com/hook1",
        filter_spec=WebhookFilter(severities=["critical"]),
    )
    # Target 2: disabled
    svc.register_target(
        url="https://example.com/hook2",
        enabled=False,
    )
    # Target 3: min_priority 0.9 — should NOT fire for priority 0.5
    svc.register_target(
        url="https://example.com/hook3",
        filter_spec=WebhookFilter(min_priority=0.9),
    )
    await svc._on_event(_make_event(severity=Severity.CRITICAL, priority=0.5))
    assert len(poster.calls) == 1
    assert poster.calls[0][0] == t1.url


@pytest.mark.asyncio
async def test_delete_target_cascades_deliveries(tmp_path: Path) -> None:
    poster = _RecordingPoster([_PosterResult(status_code=200, ok=True, error=None)])
    _, sleep = _noop_sleep_factory()
    svc = WebhookDispatcherService(
        db_path=str(tmp_path / "webhooks.db"), poster=poster, sleep=sleep
    )
    target = svc.register_target(url="https://example.com/hook")
    await svc.deliver_event(target, _make_event())
    assert len(svc.list_deliveries(target.id)) == 1
    svc.delete_target(target.id)
    assert svc.list_deliveries(target.id) == []

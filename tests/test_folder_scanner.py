from __future__ import annotations

import types
from datetime import datetime, timedelta, timezone

import pytest

from app.services.folder_scanner import FolderScanner


@pytest.mark.asyncio
async def test_scan_all_uses_utc_runtime_window(monkeypatch: pytest.MonkeyPatch):
    scanner = object.__new__(FolderScanner)

    async def _scan_nams(self):
        return {"found": 1, "added": 2, "removed": 3, "updated": 4}

    async def _scan_irs(self):
        return {"found": 5, "added": 6, "removed": 7, "updated": 8}

    async def _scan_lv2(self):
        return {"found": 9, "added": 10, "removed": 11, "updated": 12}

    monkeypatch.setattr(scanner, "scan_nams", types.MethodType(_scan_nams, scanner))
    monkeypatch.setattr(scanner, "scan_irs", types.MethodType(_scan_irs, scanner))
    monkeypatch.setattr(scanner, "scan_lv2", types.MethodType(_scan_lv2, scanner))

    timestamps = iter(
        (
            datetime(2026, 4, 11, 17, 0, 0, tzinfo=timezone.utc),
            datetime(2026, 4, 11, 17, 0, 3, tzinfo=timezone.utc),
        )
    )
    monkeypatch.setattr("app.services.folder_scanner.utc_now", lambda: next(timestamps))

    results = await FolderScanner.scan_all(scanner)

    assert results["scan_time"] == 3.0
    assert results["totals"] == {
        "found": 15,
        "added": 18,
        "removed": 21,
        "updated": 24,
    }

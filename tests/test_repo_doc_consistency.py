from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_platform_inventory_does_not_list_deleted_orphan_services() -> None:
    inventory = _read("docs/evaluation/01-platform-inventory.md")

    assert "app/services/connection_pool_integration.py" not in inventory
    assert "app/services/resilience_middleware.py" not in inventory
    assert "app/services/port80_proxy.py" in inventory
    assert "app/services/secrets_manager.py" in inventory


def test_platform_audit_records_resolved_avb_script_and_orphan_service_followups() -> None:
    audit = _read("docs/PLATFORM_AUDIT_2026-03-28.md")

    assert "No `test:avb-routing` script in `web/package.json`" not in audit
    assert "`npm run test:avb-routing` referenced in CI but doesn't exist in package.json" not in audit
    assert "repository root `package.json`" in audit
    assert "Retained and tested in T484" in audit
    assert "Deleted in T483" in audit
    assert "Deleted in T486" in audit


def test_project_worklist_no_longer_surfaces_t466_as_blocked() -> None:
    worklist = _read("docs/PROJECT_WORKLIST.md")

    assert "ID: T466\nStatus: [✗] Blocked" not in worklist
    assert re.search(r"ID: T466\nStatus: \[~\] Cancelled\nTitle: Delete 4 orphaned Python services never imported anywhere", worklist)

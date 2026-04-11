from __future__ import annotations

from app.services.ir_loader import get_ir_loader, reset_ir_loader


def test_ir_loader_singleton_reset() -> None:
    reset_ir_loader()
    first = get_ir_loader()
    second = get_ir_loader()
    assert first is second

    reset_ir_loader()
    replacement = get_ir_loader()
    assert replacement is not first

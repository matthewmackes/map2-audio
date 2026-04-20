from __future__ import annotations

import builtins
import importlib.util
from pathlib import Path

from app.main import _route_module_is_optional_unavailable


ROUTE_PATH = Path("/home/mm/map2-audio/app/routes/guitar.py")


def test_guitar_route_is_optional_when_chain_dependency_is_missing(monkeypatch):
    original_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "app.services.guitar_chain":
            raise ImportError("guitar chain dependency unavailable")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    spec = importlib.util.spec_from_file_location("_map2_test_guitar_route_missing", ROUTE_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.OPTIONAL_ROUTE is True
    assert module.router is None
    assert _route_module_is_optional_unavailable(module) is True

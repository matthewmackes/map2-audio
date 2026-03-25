import ast
import re
from pathlib import Path

from app.routes import snapshot_library


def _registered_route_modules() -> list[str]:
    text = Path("app/main.py").read_text(encoding="utf-8")
    match = re.search(r"route_modules\s*=\s*\[(.*?)\]", text, re.S)
    assert match is not None
    return ast.literal_eval("[" + match.group(1) + "]")


def test_snapshot_library_module_is_registered_under_its_real_name() -> None:
    route_modules = _registered_route_modules()

    assert "snapshot_library" in route_modules
    assert "presets" not in route_modules


def test_snapshot_library_keeps_public_snapshot_prefix() -> None:
    assert snapshot_library.router.prefix == "/api/snapshots"

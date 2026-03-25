import ast
import re
from pathlib import Path

from fastapi.routing import APIRoute

from app.main import create_app


REPO_ROOT = Path("/home/mm/map2-audio")
ROUTES_DIR = REPO_ROOT / "app" / "routes"
MAIN_PATH = REPO_ROOT / "app" / "main.py"


def _route_files_with_apirouter() -> set[str]:
    route_files: set[str] = set()
    for path in ROUTES_DIR.glob("*.py"):
        if path.name == "__init__.py":
            continue
        module = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        if any(
            isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "APIRouter"
            for node in ast.walk(module)
        ):
            route_files.add(path.stem)
    return route_files


def _registered_route_modules() -> set[str]:
    text = MAIN_PATH.read_text(encoding="utf-8")
    match = re.search(r"route_modules\s*=\s*\[(.*?)\]", text, re.S)
    assert match is not None

    route_modules = set(re.findall(r"'([^']+)'", match.group(1)))
    explicit_modules = {
        name
        for name in re.findall(r"from app\.routes import ([a-zA-Z_][a-zA-Z0-9_]*)", text)
        if name not in {"__future__"}
    }
    return route_modules | explicit_modules


def test_every_apirouter_file_is_registered():
    route_files = _route_files_with_apirouter()
    registered_modules = _registered_route_modules()

    assert route_files - registered_modules == set()


def test_registered_http_routes_have_unique_method_path_pairs():
    app = create_app()
    seen: dict[tuple[str, str], str] = {}
    duplicates: list[tuple[str, str, str, str]] = []
    allowed_duplicates = {
    }

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue

        for method in sorted((route.methods or set()) - {"HEAD", "OPTIONS"}):
            key = (method, route.path)
            owner = f"{route.endpoint.__module__}.{route.endpoint.__name__}"
            previous = seen.get(key)
            if previous is not None:
                duplicates.append((method, route.path, previous, owner))
            else:
                seen[key] = owner

    assert duplicates == []

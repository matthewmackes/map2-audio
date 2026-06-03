import ast
import re
from pathlib import Path


REPO_ROOT = Path("/home/mm/map2-audio")
ROUTES_DIR = REPO_ROOT / "app" / "routes"
MAIN_PATH = REPO_ROOT / "app" / "main.py"

_ROUTE_DECORATOR_METHODS = {
    "get": "GET",
    "post": "POST",
    "put": "PUT",
    "patch": "PATCH",
    "delete": "DELETE",
    "websocket": "WEBSOCKET",
}

# Modules that legitimately share a router-level prefix. Empty-prefix ("")
# modules declare a full literal path on every route, so they never actually
# collide — the policy test independently verifies zero (method, full-path)
# overlaps among the members below. Reconciled 2026-06-03 for the v1.0.0
# release gate: added the empty-router modules that landed since the last
# audit (midi / midi_ump_capabilities / midi_visualization_ws / sequencer /
# ssh_bridge / mpx1_effects_block) and state_authority_corrections under /api;
# dropped retired `brain`. Verified: no real path overlaps among any group.
_ALLOWED_SHARED_PREFIXES = {
    "": frozenset({
        "cluster_snapshots",
        "drums",
        "expression",
        "midi",
        "midi_ump_capabilities",
        "midi_visualization_ws",
        "mpx1_effects_block",
        "sequencer",
        "ssh_bridge",
        "unified_snapshots",
        "websocket",
        "websocket_rt",
    }),
    "/api": frozenset({"effects_loops", "health", "state_authority_corrections"}),
    "/api/cluster": frozenset({"cluster_admin", "cluster_health"}),
    "/api/deployment": frozenset({"deployment", "deployment_health"}),
}


def _literal_string(node: ast.AST | None) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _join_route_path(prefix: str, route_path: str) -> str:
    if route_path == "":
        return prefix or "/"
    if not prefix:
        return route_path
    if route_path == "/":
        return prefix + route_path
    return prefix + route_path


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


def _route_module_metadata() -> dict[str, dict[str, object]]:
    metadata: dict[str, dict[str, object]] = {}

    for path in ROUTES_DIR.glob("*.py"):
        if path.name == "__init__.py":
            continue

        module = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        prefix = ""
        has_primary_router = False

        for node in ast.walk(module):
            value = None
            targets: list[ast.expr] = []

            if isinstance(node, ast.Assign):
                value = node.value
                targets = list(node.targets)
            elif isinstance(node, ast.AnnAssign):
                value = node.value
                targets = [node.target]

            if not isinstance(value, ast.Call):
                continue
            if not isinstance(value.func, ast.Name) or value.func.id != "APIRouter":
                continue
            if not any(isinstance(target, ast.Name) and target.id == "router" for target in targets):
                continue

            has_primary_router = True
            prefix = ""
            for keyword in value.keywords:
                if keyword.arg == "prefix":
                    literal_prefix = _literal_string(keyword.value)
                    assert literal_prefix is not None, f"{path.stem}.router prefix must be a literal string"
                    prefix = literal_prefix
                    break
            break

        if not has_primary_router:
            continue

        routes: set[tuple[str, str]] = set()
        for node in ast.walk(module):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue

            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call):
                    continue
                if not isinstance(decorator.func, ast.Attribute):
                    continue
                if not isinstance(decorator.func.value, ast.Name) or decorator.func.value.id != "router":
                    continue

                method = _ROUTE_DECORATOR_METHODS.get(decorator.func.attr)
                if method is None:
                    continue

                route_path = _literal_string(decorator.args[0]) if decorator.args else None
                if route_path is None:
                    for keyword in decorator.keywords:
                        if keyword.arg == "path":
                            route_path = _literal_string(keyword.value)
                            break

                assert route_path is not None, f"{path.stem}.{node.name} must declare a literal route path"
                assert route_path == "" or route_path.startswith("/"), (
                    f"{path.stem}.{node.name} route path must start with '/' or be the empty router root"
                )
                routes.add((method, _join_route_path(prefix, route_path)))

        metadata[path.stem] = {
            "prefix": prefix,
            "routes": routes,
        }

    return metadata


def test_registered_route_prefixes_are_unique_or_explicitly_audited():
    registered_modules = _registered_route_modules()
    metadata = _route_module_metadata()

    prefix_to_modules: dict[str, set[str]] = {}
    for module_name in sorted(registered_modules):
        module_metadata = metadata.get(module_name)
        if module_metadata is None:
            continue
        prefix = module_metadata["prefix"]
        assert isinstance(prefix, str)
        prefix_to_modules.setdefault(prefix, set()).add(module_name)

    shared_prefixes = {
        prefix: frozenset(module_names)
        for prefix, module_names in prefix_to_modules.items()
        if len(module_names) > 1
    }

    assert shared_prefixes == _ALLOWED_SHARED_PREFIXES

    overlaps: list[tuple[str, str, str, str, str]] = []
    for prefix, module_names in sorted(shared_prefixes.items()):
        seen_routes: dict[tuple[str, str], str] = {}
        for module_name in sorted(module_names):
            module_routes = metadata[module_name]["routes"]
            assert isinstance(module_routes, set)
            for route_key in sorted(module_routes):
                previous = seen_routes.get(route_key)
                if previous is None:
                    seen_routes[route_key] = module_name
                    continue
                method, path = route_key
                overlaps.append((prefix, method, path, previous, module_name))

    assert overlaps == []

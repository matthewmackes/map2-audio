#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
import re
import sys
import warnings
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib import import_module
from pathlib import Path
from typing import Any

from fastapi.routing import APIRoute
from starlette.routing import WebSocketRoute

HTTP_METHODS = {"delete", "get", "head", "options", "patch", "post", "put", "trace"}
EVENT_CALL_FRAGMENTS = ("broadcast", "emit", "notify", "publish", "push", "queue", "send")
EVENT_PAYLOAD_KEYS = {"event", "type"}
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
DEFAULT_JSON_OUT = REPO_ROOT / "docs" / "evaluation" / "api-surface-inventory.json"
DEFAULT_MD_OUT = REPO_ROOT / "docs" / "evaluation" / "api-surface-inventory.md"


@dataclass(frozen=True)
class EventCandidate:
    key: str
    value: str
    callable_name: str
    file: str
    function: str | None
    class_name: str | None
    line: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "callable": self.callable_name,
            "class": self.class_name,
            "file": self.file,
            "function": self.function,
            "key": self.key,
            "line": self.line,
            "value": self.value,
        }


class EventLiteralVisitor(ast.NodeVisitor):
    def __init__(self, relative_path: str) -> None:
        self.relative_path = relative_path
        self.class_stack: list[str] = []
        self.function_stack: list[str] = []
        self.results: list[EventCandidate] = []

    def visit_ClassDef(self, node: ast.ClassDef) -> Any:
        self.class_stack.append(node.name)
        self.generic_visit(node)
        self.class_stack.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> Any:
        self.function_stack.append(node.name)
        self.generic_visit(node)
        self.function_stack.pop()

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> Any:
        self.function_stack.append(node.name)
        self.generic_visit(node)
        self.function_stack.pop()

    def visit_Call(self, node: ast.Call) -> Any:
        callable_name = get_callable_name(node.func)
        if callable_name and any(fragment in callable_name.lower() for fragment in EVENT_CALL_FRAGMENTS):
            for payload in iter_candidate_payloads(node):
                for key, value in extract_event_literals(payload):
                    self.results.append(
                        EventCandidate(
                            key=key,
                            value=value,
                            callable_name=callable_name,
                            file=self.relative_path,
                            function=self.function_stack[-1] if self.function_stack else None,
                            class_name=self.class_stack[-1] if self.class_stack else None,
                            line=getattr(payload, "lineno", getattr(node, "lineno", 0)),
                        )
                    )
        self.generic_visit(node)


def get_callable_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def iter_candidate_payloads(node: ast.Call) -> list[ast.AST]:
    payloads = list(node.args)
    for keyword in node.keywords:
        if keyword.arg in {"data", "event", "message", "payload"}:
            payloads.append(keyword.value)
    return payloads


def extract_event_literals(node: ast.AST) -> list[tuple[str, str]]:
    if not isinstance(node, ast.Dict):
        return []
    pairs: list[tuple[str, str]] = []
    for key_node, value_node in zip(node.keys, node.values):
        if isinstance(key_node, ast.Constant) and isinstance(key_node.value, str):
            key = key_node.value
            if key in EVENT_PAYLOAD_KEYS and isinstance(value_node, ast.Constant) and isinstance(value_node.value, str):
                pairs.append((key, value_node.value))
    return pairs


def load_app(app_target: str) -> Any:
    module_name, attribute = app_target.split(":", 1)
    module = import_module(module_name)
    return getattr(module, attribute)


def route_module(route: APIRoute | WebSocketRoute | None) -> str:
    if route is None:
        return "unknown"
    endpoint = getattr(route, "endpoint", None)
    if endpoint is None:
        return "unknown"
    return getattr(endpoint, "__module__", "unknown")


def route_qualname(route: APIRoute | WebSocketRoute | None) -> str | None:
    if route is None:
        return None
    endpoint = getattr(route, "endpoint", None)
    if endpoint is None:
        return None
    return getattr(endpoint, "__qualname__", None)


def subsystem_from_path(path: str) -> str:
    parts = [part for part in path.split("/") if part and not part.startswith("{")]
    return parts[0] if parts else "root"


def scan_event_candidates(source_root: Path) -> list[dict[str, Any]]:
    candidates: dict[tuple[str, str, str, int], EventCandidate] = {}
    for path in sorted(source_root.rglob("*.py")):
        try:
            relative_path = path.relative_to(REPO_ROOT).as_posix()
        except ValueError:
            relative_path = path.as_posix()
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=relative_path)
        except SyntaxError:
            continue
        visitor = EventLiteralVisitor(relative_path)
        visitor.visit(tree)
        for result in visitor.results:
            key = (result.file, result.callable_name, result.value, result.line)
            candidates[key] = result
    ordered = sorted(candidates.values(), key=lambda item: (item.file, item.line, item.callable_name, item.value))
    return [item.as_dict() for item in ordered]


def build_inventory(app: Any, source_root: Path = REPO_ROOT / "app") -> dict[str, Any]:
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        spec = app.openapi()

    api_routes = [route for route in app.routes if isinstance(route, APIRoute)]
    websocket_routes = [route for route in app.routes if isinstance(route, WebSocketRoute)]
    route_index: dict[tuple[str, str], APIRoute] = {}
    route_operation_ids: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for route in api_routes:
        for method in route.methods or []:
            route_index[(route.path_format, method.lower())] = route
            if route.operation_id and method.lower() != "head":
                route_operation_ids[route.operation_id].append(
                    {
                        "method": method.upper(),
                        "module": route_module(route),
                        "path": route.path_format,
                    }
                )

    endpoints: list[dict[str, Any]] = []
    method_counts: Counter[str] = Counter()
    subsystem_counts: Counter[str] = Counter()
    tag_counts: Counter[str] = Counter()
    untagged_count = 0

    for path, operations in sorted(spec.get("paths", {}).items()):
        subsystem = subsystem_from_path(path)
        for method, operation in sorted(operations.items()):
            if method not in HTTP_METHODS:
                continue
            route = route_index.get((path, method))
            tags = operation.get("tags") or []
            if tags:
                tag_counts.update(tags)
            else:
                untagged_count += 1
            operation_id = operation.get("operationId") or (route.operation_id if route else None)
            entry = {
                "deprecated": bool(operation.get("deprecated", False)),
                "methods": [method.upper()],
                "module": route_module(route),
                "name": getattr(route, "name", None),
                "operation_id": operation_id,
                "parameters": [
                    {
                        "in": parameter.get("in"),
                        "name": parameter.get("name"),
                        "required": bool(parameter.get("required", False)),
                        "schema": parameter.get("schema"),
                    }
                    for parameter in operation.get("parameters", [])
                ],
                "path": path,
                "qualname": route_qualname(route),
                "request_body_content_types": sorted((operation.get("requestBody") or {}).get("content", {}).keys()),
                "response_statuses": sorted((operation.get("responses") or {}).keys()),
                "subsystem": subsystem,
                "summary": operation.get("summary"),
                "tags": tags,
            }
            endpoints.append(entry)
            method_counts[method.upper()] += 1
            subsystem_counts[subsystem] += 1

    duplicates = [
        {
            "operation_id": operation_id,
            "routes": [
                {
                    "method": route_entry["method"],
                    "module": route_entry["module"],
                    "path": route_entry["path"],
                }
                for route_entry in sorted(routes, key=lambda item: (item["path"], item["method"]))
            ],
        }
        for operation_id, routes in sorted(route_operation_ids.items())
        if len(routes) > 1
    ]

    websocket_entries = [
        {
            "module": route_module(route),
            "name": getattr(route, "name", None),
            "path": route.path,
            "qualname": route_qualname(route),
            "subsystem": subsystem_from_path(route.path),
        }
        for route in sorted(websocket_routes, key=lambda item: item.path)
    ]

    event_candidates = scan_event_candidates(source_root)
    event_type_counts: Counter[str] = Counter(candidate["value"] for candidate in event_candidates)

    route_module_counts: Counter[str] = Counter(entry["module"] for entry in endpoints)
    warnings_list = [str(item.message) for item in caught]
    duplicate_warning_messages = [message for message in warnings_list if "Duplicate Operation ID" in message]
    duplicate_warning_count = len(duplicate_warning_messages)
    duplicate_warning_entries = []
    duplicate_warning_pattern = re.compile(r"Duplicate Operation ID (\\S+) for function (\\S+) at (.+)")
    for message in duplicate_warning_messages:
        match = duplicate_warning_pattern.search(message)
        if match:
            duplicate_warning_entries.append(
                {
                    "file": match.group(3),
                    "function": match.group(2),
                    "operation_id": match.group(1),
                }
            )
        else:
            duplicate_warning_entries.append({"message": message})
    duplicate_issue_count = max(len(duplicates), duplicate_warning_count)

    inventory = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "api_route_count": len(api_routes),
            "duplicate_operation_id_count": duplicate_issue_count,
            "duplicate_operation_id_warning_count": duplicate_warning_count,
            "event_candidate_count": len(event_candidates),
            "http_operation_count": len(endpoints),
            "openapi_path_count": len(spec.get("paths", {})),
            "untagged_operation_count": untagged_count,
            "websocket_route_count": len(websocket_entries),
        },
        "duplicate_operation_ids": duplicates,
        "duplicate_operation_id_warnings": duplicate_warning_entries,
        "endpoints": endpoints,
        "event_message_candidates": event_candidates,
        "event_message_type_counts": dict(sorted(event_type_counts.items())),
        "method_counts": dict(sorted(method_counts.items())),
        "route_module_counts": [
            {"module": module_name, "operation_count": count}
            for module_name, count in route_module_counts.most_common()
        ],
        "subsystem_counts": dict(sorted(subsystem_counts.items())),
        "tag_counts": dict(sorted(tag_counts.items())),
        "warnings": warnings_list,
        "websocket_routes": websocket_entries,
    }
    return inventory


def render_markdown(inventory: dict[str, Any]) -> str:
    summary = inventory["summary"]
    lines = [
        "# MAP2 API Surface Inventory",
        "",
        f"Generated: `{inventory['generated_at']}`",
        "",
        "## Regeneration",
        "",
        "```bash",
        "python3 scripts/generate_api_inventory.py",
        "```",
        "",
        "## Summary",
        "",
        f"- OpenAPI paths: `{summary['openapi_path_count']}`",
        f"- HTTP operations: `{summary['http_operation_count']}`",
        f"- FastAPI route objects: `{summary['api_route_count']}`",
        f"- WebSocket routes: `{summary['websocket_route_count']}`",
        f"- Duplicate operation IDs: `{summary['duplicate_operation_id_count']}`",
        f"- Untagged HTTP operations: `{summary['untagged_operation_count']}`",
        f"- Source-inferred event/message candidates: `{summary['event_candidate_count']}`",
        "",
        "## HTTP operations by subsystem",
        "",
        "| Subsystem | Operations |",
        "| --- | ---: |",
    ]

    for subsystem, count in sorted(inventory["subsystem_counts"].items(), key=lambda item: (-item[1], item[0])):
        lines.append(f"| `{subsystem}` | {count} |")

    lines.extend([
        "",
        "## Top route modules by HTTP operation count",
        "",
        "| Module | Operations |",
        "| --- | ---: |",
    ])
    for item in inventory["route_module_counts"][:15]:
        lines.append(f"| `{item['module']}` | {item['operation_count']} |")

    lines.extend([
        "",
        "## Duplicate operation IDs",
        "",
    ])
    duplicates = inventory["duplicate_operation_ids"]
    duplicate_warning_entries = inventory["duplicate_operation_id_warnings"]
    if not duplicates and not duplicate_warning_entries:
        lines.append("None.")
    else:
        for duplicate in duplicates:
            lines.append(f"- `{duplicate['operation_id']}`")
            for route in duplicate["routes"]:
                lines.append(f"  - `{route['method']}` `{route['path']}` ({route['module']})")
        for duplicate_warning in duplicate_warning_entries:
            operation_id = duplicate_warning.get("operation_id")
            if operation_id:
                lines.append(
                    f"- `{operation_id}` (warning-derived: `{duplicate_warning['function']}` in `{duplicate_warning['file']}`)"
                )
            else:
                lines.append(f"- {duplicate_warning['message']}")

    lines.extend([
        "",
        "## WebSocket routes",
        "",
        "| Path | Subsystem | Module | Handler |",
        "| --- | --- | --- | --- |",
    ])
    for route in inventory["websocket_routes"]:
        lines.append(
            f"| `{route['path']}` | `{route['subsystem']}` | `{route['module']}` | `{route['qualname'] or route['name'] or 'unknown'}` |"
        )

    lines.extend([
        "",
        "## Source-inferred event/message types",
        "",
        "| Type | Count |",
        "| --- | ---: |",
    ])
    for message_type, count in sorted(inventory["event_message_type_counts"].items(), key=lambda item: (-item[1], item[0]))[:30]:
        lines.append(f"| `{message_type}` | {count} |")
    if not inventory["event_message_type_counts"]:
        lines.append("| `none-detected` | 0 |")

    lines.extend([
        "",
        "## Generation warnings",
        "",
    ])
    if not inventory["warnings"]:
        lines.append("None.")
    else:
        for warning_message in inventory["warnings"]:
            lines.append(f"- {warning_message}")

    lines.extend([
        "",
        "## Notes",
        "",
        "- HTTP endpoint details are sourced from FastAPI OpenAPI generation, so request bodies, response codes, tags, and summaries track the live app definition.",
        "- WebSocket routes are discovered from Starlette route registration. Message/event types are inferred from broadcast/send-style callsites in `app/` source and should be treated as contract clues, not a formal schema.",
        "- Duplicate operation IDs are an immediate client-generation risk because downstream SDK generation typically assumes stable unique operation identifiers.",
        "",
    ])
    return "\n".join(lines)


def write_outputs(app_target: str, json_out: Path, md_out: Path, source_root: Path) -> dict[str, Any]:
    app = load_app(app_target)
    inventory = build_inventory(app, source_root=source_root)
    json_out.parent.mkdir(parents=True, exist_ok=True)
    md_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(inventory, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_out.write_text(render_markdown(inventory) + "\n", encoding="utf-8")
    return inventory


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate MAP2 REST/WebSocket API inventory artifacts.")
    parser.add_argument("--app", default="app.main:app", help="ASGI app target in module:attribute form.")
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT, help="Path for JSON inventory output.")
    parser.add_argument("--md-out", type=Path, default=DEFAULT_MD_OUT, help="Path for Markdown summary output.")
    parser.add_argument("--source-root", type=Path, default=REPO_ROOT / "app", help="Source root for message/event inference.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    inventory = write_outputs(args.app, args.json_out, args.md_out, args.source_root)
    summary = inventory["summary"]
    print(
        "Generated API inventory: "
        f"{summary['openapi_path_count']} paths, "
        f"{summary['http_operation_count']} HTTP operations, "
        f"{summary['websocket_route_count']} WebSocket routes, "
        f"{summary['duplicate_operation_id_count']} duplicate operation IDs."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

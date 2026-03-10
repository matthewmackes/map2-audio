#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
APP_ROOT = REPO_ROOT / "app"
SERVICE_PATH = REPO_ROOT / "systemd" / "map2-backend.service"
DEFAULT_MANIFEST_OUT = REPO_ROOT / "requirements-backend-runtime.txt"
DEFAULT_DOC_OUT = REPO_ROOT / "docs" / "backend-runtime-contract.md"
DEFAULT_JSON_OUT = REPO_ROOT / "docs" / "backend-runtime-contract.json"

RUNTIME_REQUIREMENT_GROUPS = {
    "api_and_orchestration": [
        ("fastapi", ">=0.128.0,<0.129.0", "FastAPI application and OpenAPI generation"),
        ("uvicorn", ">=0.40.0,<0.41.0", "ASGI server for app.main:app"),
        ("pydantic", ">=2.12.5,<3.0.0", "Validation and settings models"),
        ("SQLAlchemy", ">=2.0.45,<3.0.0", "ORM and async database access"),
        ("httpx", ">=0.28.1,<0.29.0", "Outbound API calls for cluster and device integrations"),
        ("aiohttp", ">=3.13.3,<4.0.0", "Async HTTP clients used across discovery/scraper/integration services"),
        ("PyYAML", ">=6.0.2,<7.0.0", "YAML parsing and emitted configuration artifacts"),
        ("psutil", ">=7.2.1,<8.0.0", "System/process telemetry"),
        ("zeroconf", ">=0.148.0,<1.0.0", "Network discovery and advertisement"),
    ],
    "audio_and_control": [
        ("numpy", ">=2.3.5,<3.0.0", "Signal/data processing helpers"),
        ("scipy", ">=1.17.0,<2.0.0", "DSP/scientific utilities used by audio features"),
        ("sounddevice", ">=0.5.3,<0.6.0", "Python-side audio I/O helpers and diagnostics"),
        ("soundfile", ">=0.13.1,<0.14.0", "Audio file read/write support"),
        ("python-rtmidi", ">=1.5.8,<2.0.0", "MIDI device access"),
        ("pyserial", ">=3.5,<4.0.0", "Serial-connected hardware workflows"),
    ],
    "content_and_library_features": [
        ("beautifulsoup4", ">=4.14.3,<5.0.0", "HTML parsing for library/discovery features"),
    ],
}

OPTIONAL_PYTHON_FEATURES = [
    {
        "module": "aiofiles",
        "why": "Optional async file queue helpers",
    },
    {
        "module": "asyncssh",
        "why": "Optional SSH transport for Tesira/cluster flows",
    },
    {
        "module": "cryptography",
        "why": "Optional secrets management and certificate authority helpers",
    },
    {
        "module": "jsonschema",
        "why": "Optional config validation helpers",
    },
    {
        "module": "py7zr",
        "why": "Optional archive handling for soundfont content",
    },
    {
        "module": "watchdog",
        "why": "Optional config hot-reload support",
    },
]

EXCLUDED_NON_BACKEND_IMPORTS = [
    {
        "module": "Flask",
        "why": "Legacy Flask surface under app/api, not part of app.main FastAPI runtime",
    },
    {
        "module": "textual",
        "why": "TUI-only dependency under app/tui, not required for backend API service",
    },
]

NATIVE_PREREQUISITES = [
    {
        "name": "lilv/python-lilv bindings",
        "why": "LV2 plugin discovery/metadata access",
    },
    {
        "name": "JACK Python bindings",
        "why": "JACK/PipeWire integration helpers",
    },
    {
        "name": "PortAudio and libsndfile system libraries",
        "why": "Required by sounddevice/soundfile-backed workflows",
    },
]


@dataclass(frozen=True)
class EnvRead:
    default: str | None
    file: str
    kind: str
    line: int
    variable: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "default": self.default,
            "file": self.file,
            "kind": self.kind,
            "line": self.line,
            "variable": self.variable,
        }


class EnvReadVisitor(ast.NodeVisitor):
    def __init__(self, filename: str) -> None:
        self.filename = filename
        self.results: list[EnvRead] = []

    def visit_Call(self, node: ast.Call) -> Any:
        match = match_env_call(node)
        if match is not None:
            variable, default, kind = match
            self.results.append(
                EnvRead(
                    default=default,
                    file=self.filename,
                    kind=kind,
                    line=getattr(node, "lineno", 0),
                    variable=variable,
                )
            )
        self.generic_visit(node)


def match_env_call(node: ast.Call) -> tuple[str, str | None, str] | None:
    if isinstance(node.func, ast.Attribute):
        if isinstance(node.func.value, ast.Name) and node.func.value.id == "os" and node.func.attr == "getenv":
            if not node.args:
                return None
            variable = constant_string(node.args[0])
            if variable is None:
                return None
            default = expression_repr(node.args[1]) if len(node.args) > 1 else None
            return variable, default, "os.getenv"
        if (
            node.func.attr == "get"
            and isinstance(node.func.value, ast.Attribute)
            and isinstance(node.func.value.value, ast.Name)
            and node.func.value.value.id == "os"
            and node.func.value.attr == "environ"
        ):
            if not node.args:
                return None
            variable = constant_string(node.args[0])
            if variable is None:
                return None
            default = expression_repr(node.args[1]) if len(node.args) > 1 else None
            return variable, default, "os.environ.get"
    return None


def constant_string(node: ast.AST) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def expression_repr(node: ast.AST) -> str | None:
    try:
        return ast.unparse(node)
    except Exception:
        return None


def extract_env_reads_from_source(source: str, filename: str = "<memory>") -> list[dict[str, Any]]:
    tree = ast.parse(source, filename=filename)
    visitor = EnvReadVisitor(filename)
    visitor.visit(tree)
    return [result.as_dict() for result in visitor.results]


def scan_direct_env_reads(source_root: Path = APP_ROOT) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for path in sorted(source_root.rglob("*.py")):
        relative = path.relative_to(REPO_ROOT).as_posix()
        try:
            source = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        results.extend(extract_env_reads_from_source(source, relative))
    return sorted(results, key=lambda item: (item["variable"], item["file"], item["line"]))


def load_schema_env_contract() -> list[dict[str, Any]]:
    from app.config import CONFIG_SCHEMA

    rows = []
    for key, option in sorted(CONFIG_SCHEMA.items()):
        if not option.env_var:
            continue
        rows.append(
            {
                "config_key": key,
                "default": option.default,
                "description": option.description,
                "env_var": option.env_var,
                "locked": bool(option.locked),
                "restart_required": bool(option.restart_required),
                "value_type": getattr(option.value_type, "__name__", str(option.value_type)),
            }
        )
    return rows


def parse_systemd_environment(service_text: str) -> dict[str, Any]:
    inline_env = []
    environment_files = []
    for raw_line in service_text.splitlines():
        line = raw_line.strip()
        if line.startswith("EnvironmentFile="):
            environment_files.append(line.split("=", 1)[1])
            continue
        if not line.startswith("Environment="):
            continue
        payload = line.split("=", 1)[1].strip()
        if payload.startswith('"') and payload.endswith('"'):
            payload = payload[1:-1]
        if "=" not in payload:
            continue
        name, value = payload.split("=", 1)
        inline_env.append({"name": name, "value": value})
    return {
        "environment_files": environment_files,
        "inline_environment": inline_env,
    }


def load_systemd_contract(service_path: Path = SERVICE_PATH) -> dict[str, Any]:
    return parse_systemd_environment(service_path.read_text(encoding="utf-8"))


def build_runtime_manifest_lines() -> list[str]:
    lines = [
        "# MAP2 backend runtime dependencies",
        "#",
        "# Install with:",
        "#   pip install -r requirements-backend-runtime.txt",
        "#",
        "# This manifest covers the main FastAPI backend runtime (app.main:app).",
        "# Optional feature extras and native prerequisites are documented in",
        "# docs/backend-runtime-contract.md.",
        "",
    ]
    for group_name, requirements in RUNTIME_REQUIREMENT_GROUPS.items():
        title = group_name.replace("_", " ").title()
        lines.append(f"# {title}")
        for package, specifier, why in requirements:
            lines.append(f"# {why}")
            lines.append(f"{package}{specifier}")
        lines.append("")
    return lines


def build_contract() -> dict[str, Any]:
    schema_env = load_schema_env_contract()
    direct_env_reads = scan_direct_env_reads()
    systemd_contract = load_systemd_contract()

    schema_env_names = {item["env_var"] for item in schema_env}
    direct_only = [item for item in direct_env_reads if item["variable"] not in schema_env_names]
    direct_only_by_var: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in direct_only:
        direct_only_by_var[item["variable"]].append(item)

    contract = {
        "generated_from": {
            "config_schema": "app/config.py",
            "direct_env_scan_root": "app/",
            "systemd_service": "systemd/map2-backend.service",
        },
        "runtime_requirements": [
            {
                "group": group,
                "package": package,
                "specifier": specifier,
                "why": why,
            }
            for group, requirements in RUNTIME_REQUIREMENT_GROUPS.items()
            for package, specifier, why in requirements
        ],
        "optional_python_features": OPTIONAL_PYTHON_FEATURES,
        "excluded_non_backend_imports": EXCLUDED_NON_BACKEND_IMPORTS,
        "native_prerequisites": NATIVE_PREREQUISITES,
        "schema_env": schema_env,
        "direct_env_reads": direct_env_reads,
        "direct_only_env": [
            {
                "variable": variable,
                "occurrences": occurrences,
            }
            for variable, occurrences in sorted(direct_only_by_var.items())
        ],
        "systemd_backend_service": systemd_contract,
        "summary": {
            "schema_env_count": len(schema_env),
            "direct_env_read_count": len(direct_env_reads),
            "direct_only_env_count": len(direct_only_by_var),
            "runtime_requirement_count": sum(len(items) for items in RUNTIME_REQUIREMENT_GROUPS.values()),
            "systemd_inline_env_count": len(systemd_contract["inline_environment"]),
        },
    }
    return contract


def format_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, sort_keys=True)


def render_markdown(contract: dict[str, Any]) -> str:
    summary = contract["summary"]
    lines = [
        "# MAP2 Backend Runtime Contract",
        "",
        "This document and its paired manifest are generated by `scripts/generate_backend_contract.py`.",
        "",
        "## Canonical install command",
        "",
        "```bash",
        "pip install -r requirements-backend-runtime.txt",
        "```",
        "",
        "## Summary",
        "",
        f"- Runtime manifest packages: `{summary['runtime_requirement_count']}`",
        f"- Schema-backed environment variables: `{summary['schema_env_count']}`",
        f"- Direct environment reads in `app/`: `{summary['direct_env_read_count']}`",
        f"- Direct-only environment variables (not modeled in `app/config.py`): `{summary['direct_only_env_count']}`",
        f"- Inline backend systemd environment entries: `{summary['systemd_inline_env_count']}`",
        "",
        "## Runtime manifest scope",
        "",
        "The new manifest is intentionally scoped to the main FastAPI backend runtime (`app.main:app`).",
        "It excludes legacy or non-backend surfaces such as the Flask stub under `app/api` and the Textual TUI under `app/tui`.",
        "",
        "## Dependency groups",
        "",
    ]
    for group_name, requirements in RUNTIME_REQUIREMENT_GROUPS.items():
        lines.append(f"### {group_name.replace('_', ' ').title()}")
        lines.append("")
        for package, specifier, why in requirements:
            lines.append(f"- `{package}{specifier}`: {why}")
        lines.append("")

    lines.extend([
        "## Native prerequisites not represented in the pip manifest",
        "",
    ])
    for item in NATIVE_PREREQUISITES:
        lines.append(f"- `{item['name']}`: {item['why']}")

    lines.extend([
        "",
        "## Optional Python feature extras kept out of the core manifest",
        "",
    ])
    for item in OPTIONAL_PYTHON_FEATURES:
        lines.append(f"- `{item['module']}`: {item['why']}")

    lines.extend([
        "",
        "## Environment precedence for the backend service",
        "",
        "1. Inline `Environment=` entries in `systemd/map2-backend.service` set hard deployment defaults for the shipped service.",
        "2. `EnvironmentFile=-/etc/map2/environment` provides host-local overrides without editing the unit file.",
        "3. `app/config.py` maps schema-backed `MAP2_*` variables into typed configuration options.",
        "4. Direct `os.getenv()` / `os.environ.get()` reads in `app/` bypass schema validation and should be treated as feature flags or debt until migrated.",
        "",
        "## Backend systemd environment",
        "",
        "| Name | Value |",
        "| --- | --- |",
    ])
    for item in contract["systemd_backend_service"]["inline_environment"]:
        lines.append(f"| `{item['name']}` | `{item['value']}` |")
    for env_file in contract["systemd_backend_service"]["environment_files"]:
        lines.append(f"| `EnvironmentFile` | `{env_file}` |")

    lines.extend([
        "",
        "## Schema-backed environment variables from `app/config.py`",
        "",
        "| Env var | Config key | Default | Restart | Locked | Description |",
        "| --- | --- | --- | --- | --- | --- |",
    ])
    for item in contract["schema_env"]:
        lines.append(
            f"| `{item['env_var']}` | `{item['config_key']}` | `{format_value(item['default'])}` | `{item['restart_required']}` | `{item['locked']}` | {item['description']} |"
        )

    lines.extend([
        "",
        "## Direct-only environment variables in `app/`",
        "",
        "These variables are read directly in code and are not represented in `app/config.py` today.",
        "",
        "| Variable | First observed source | Default | Occurrences |",
        "| --- | --- | --- | ---: |",
    ])
    for item in contract["direct_only_env"]:
        first = item["occurrences"][0]
        lines.append(
            f"| `{item['variable']}` | `{first['file']}:{first['line']}` | `{first['default'] or ''}` | {len(item['occurrences'])} |"
        )

    lines.extend([
        "",
        "## Notes",
        "",
        "- `MAP2_ENABLE_LCD` and `MAP2_LCD_SIMULATION` are currently set both in `app/config.py` and as inline systemd defaults, so the effective host contract includes both schema and service-layer control.",
        "- Audio realtime behavior also depends on non-`MAP2_*` systemd environment such as `PIPEWIRE_LATENCY`, `PIPEWIRE_REMOTE`, and `JACK_DEFAULT_SERVER`.",
        "- `/etc/map2/environment` is the intended host-specific override layer for the shipped backend service.",
        "- Variables listed under direct-only reads are the highest-priority candidates for migration into `app/config.py` if MAP2 wants one typed configuration source of truth.",
        "",
    ])
    return "\n".join(lines)


def write_outputs(manifest_out: Path, doc_out: Path, json_out: Path) -> dict[str, Any]:
    contract = build_contract()
    manifest_out.write_text("\n".join(build_runtime_manifest_lines()) + "\n", encoding="utf-8")
    doc_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.parent.mkdir(parents=True, exist_ok=True)
    doc_out.write_text(render_markdown(contract) + "\n", encoding="utf-8")
    json_out.write_text(json.dumps(contract, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return contract


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate MAP2 backend runtime manifest and environment contract docs.")
    parser.add_argument("--manifest-out", type=Path, default=DEFAULT_MANIFEST_OUT)
    parser.add_argument("--doc-out", type=Path, default=DEFAULT_DOC_OUT)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    contract = write_outputs(args.manifest_out, args.doc_out, args.json_out)
    summary = contract["summary"]
    print(
        "Generated backend runtime contract: "
        f"{summary['runtime_requirement_count']} manifest packages, "
        f"{summary['schema_env_count']} schema env vars, "
        f"{summary['direct_only_env_count']} direct-only env vars."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

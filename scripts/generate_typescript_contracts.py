#!/usr/bin/env python3
"""
T2455 — generate TypeScript snapshot types directly from Pydantic via openapi-typescript.

Produces `web/src/map2/clients/snapshots.generated.ts` from the live backend's
`/openapi.json`, filtered to the snapshot schema contract roots. This
eliminates silent TS/Pydantic drift on the snapshot surface
(SnapshotCreateRequest, SnapshotUpdateRequest, SnapshotChainInput,
SnapshotChannelInput, SnapshotRoutingInput, SnapshotPluginInput,
SnapshotLoopInsertionInput) without making unrelated OpenAPI schema-name
collisions part of the snapshot type gate.

Modes:
  * --check : exit non-zero if the generated file would change. Used by CI.
  * default : write the generated file in place.

Source of OpenAPI:
  * If the backend is reachable on http://localhost:8080/openapi.json it is
    used directly (preferred — the live source of truth).
  * Otherwise, the script attempts to start the FastAPI app in-process via
    fastapi.openapi.utils.get_openapi to avoid coupling generation to a
    running daemon.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WEB_ROOT = REPO_ROOT / "web"
GENERATED_PATH = WEB_ROOT / "src" / "map2" / "clients" / "snapshots.generated.ts"
OPENAPI_TS_BIN = WEB_ROOT / "node_modules" / ".bin" / "openapi-typescript"
LOCAL_BACKEND_URL = "http://localhost:8080/openapi.json"
SCHEMA_REF_PREFIX = "#/components/schemas/"
SNAPSHOT_CONTRACT_SCHEMA_ROOTS = (
    "SnapshotCreateRequest",
    "SnapshotUpdateRequest",
    "SnapshotChainInput",
    "SnapshotChannelInput",
    "SnapshotPluginInput",
    "SnapshotRoutingInput",
    "SnapshotLoopInsertionInput",
    "SnapshotIOBindingsInput",
    "SnapshotControlsInput",
    "SnapshotPathInput",
)


def fetch_live_openapi() -> dict | None:
    """Try the running backend first."""
    try:
        with urllib.request.urlopen(LOCAL_BACKEND_URL, timeout=5) as response:
            return json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
        return None


def generate_openapi_in_process() -> dict:
    """Fall back to importing the FastAPI app and calling get_openapi()."""
    sys.path.insert(0, str(REPO_ROOT))
    from fastapi.openapi.utils import get_openapi  # type: ignore
    from app.main import app  # type: ignore

    return get_openapi(
        title=app.title,
        version=app.version,
        openapi_version=app.openapi_version,
        description=app.description,
        routes=app.routes,
    )


TS_HEADER = (
    "// AUTO-GENERATED — do not edit. Source: backend Pydantic models via\n"
    "// scripts/generate_typescript_contracts.py (T2455).\n"
    "// @ts-nocheck — this raw OpenAPI dump is consumed only through\n"
    "//   `snapshots.contract.ts` (type-only re-exports for snapshot endpoints),\n"
    "//   so type checking happens at the contract surface, not on the generated\n"
    "//   schema implementation details.\n"
)


def iter_schema_refs(value: object) -> set[str]:
    refs: set[str] = set()
    if isinstance(value, dict):
        maybe_ref = value.get("$ref")
        if isinstance(maybe_ref, str) and maybe_ref.startswith(SCHEMA_REF_PREFIX):
            refs.add(maybe_ref.removeprefix(SCHEMA_REF_PREFIX))
        for child in value.values():
            refs.update(iter_schema_refs(child))
    elif isinstance(value, list):
        for child in value:
            refs.update(iter_schema_refs(child))
    return refs


def filter_snapshot_contract_openapi(openapi_doc: dict) -> dict:
    """Trim the full OpenAPI document to the schema contract closure.

    `snapshots.contract.ts` consumes only type-only schema exports.
    Filtering avoids unrelated route model-name collisions (for example
    independent `DownloadRequest` classes) making this gate nondeterministic.
    """
    components = openapi_doc.get("components", {})
    schemas = components.get("schemas", {})
    missing_roots = [
        schema_name
        for schema_name in SNAPSHOT_CONTRACT_SCHEMA_ROOTS
        if schema_name not in schemas
    ]
    if missing_roots:
        raise RuntimeError(
            "OpenAPI document is missing snapshot contract schemas: "
            + ", ".join(missing_roots)
        )

    needed = set(SNAPSHOT_CONTRACT_SCHEMA_ROOTS)
    queue = list(needed)
    while queue:
        schema_name = queue.pop()
        schema = schemas.get(schema_name)
        if schema is None:
            continue
        for ref in iter_schema_refs(schema):
            if ref not in needed:
                needed.add(ref)
                queue.append(ref)

    filtered = {
        key: value
        for key, value in openapi_doc.items()
        if key not in {"paths", "components"}
    }
    filtered["paths"] = {}
    filtered_components = {}
    filtered_components["schemas"] = {
        name: schemas[name]
        for name in sorted(needed)
        if name in schemas
    }
    filtered["components"] = filtered_components
    return filtered


def write_typescript(openapi_doc: dict, output_path: Path) -> None:
    """Write OpenAPI doc to a temp file and run openapi-typescript."""
    if not OPENAPI_TS_BIN.exists():
        sys.stderr.write(
            f"openapi-typescript binary missing at {OPENAPI_TS_BIN}.\n"
            "Run `npm install` in web/ first.\n"
        )
        sys.exit(2)

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(openapi_doc, f)
        tmp_path = f.name

    try:
        subprocess.run(
            [str(OPENAPI_TS_BIN), tmp_path, "-o", str(output_path)],
            check=True,
            cwd=WEB_ROOT,
        )
        # Prepend the @ts-nocheck guard so duplicate operation ids in the
        # OpenAPI surface don't break the project build.
        existing = output_path.read_text()
        if not existing.startswith("// AUTO-GENERATED"):
            output_path.write_text(TS_HEADER + existing)
    finally:
        os.unlink(tmp_path)


def main() -> int:
    # FastAPI/Pydantic schema-name collision handling can consult hash-ordered
    # containers when duplicate model class names exist in independent route
    # modules. Pinning the interpreter hash seed makes this generated contract
    # deterministic across the normal write pass and the CI --check pass.
    if os.environ.get("PYTHONHASHSEED") != "0":
        env = os.environ.copy()
        env["PYTHONHASHSEED"] = "0"
        os.execvpe(sys.executable, [sys.executable, *sys.argv], env)

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero if regenerating would change the committed file.",
    )
    args = parser.parse_args()

    openapi_doc = fetch_live_openapi()
    if openapi_doc is None:
        try:
            openapi_doc = generate_openapi_in_process()
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(
                f"Could not generate OpenAPI: backend not reachable on "
                f"localhost:8080 and in-process fallback failed: {exc}\n"
            )
            return 3
    openapi_doc = filter_snapshot_contract_openapi(openapi_doc)

    if args.check:
        with tempfile.NamedTemporaryFile(
            "w", suffix=".ts", delete=False
        ) as out_temp:
            out_path = Path(out_temp.name)
        try:
            write_typescript(openapi_doc, out_path)
            committed = (
                GENERATED_PATH.read_text() if GENERATED_PATH.exists() else ""
            )
            generated = out_path.read_text()
            if committed.strip() != generated.strip():
                sys.stderr.write(
                    "snapshots.generated.ts is out of date.\n"
                    "Re-run: python3 scripts/generate_typescript_contracts.py\n"
                )
                return 1
            print("snapshots.generated.ts is up to date.")
            return 0
        finally:
            out_path.unlink(missing_ok=True)

    write_typescript(openapi_doc, GENERATED_PATH)
    print(f"Wrote {GENERATED_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

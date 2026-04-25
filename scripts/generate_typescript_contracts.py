#!/usr/bin/env python3
"""
T2455 — generate TypeScript snapshot types directly from Pydantic via openapi-typescript.

Produces `web/src/map2/clients/snapshots.generated.ts` from the live backend's
`/openapi.json`. This eliminates silent TS/Pydantic drift on the snapshot
surface (SnapshotCreateRequest, SnapshotUpdateRequest, SnapshotChainInput,
SnapshotChannelInput, SnapshotRoutingInput, SnapshotPluginInput,
SnapshotLoopInsertionInput).

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
    "// @ts-nocheck — the OpenAPI surface contains duplicate operation ids on\n"
    "//   cluster-proxy routes (one id per method); openapi-typescript emits\n"
    "//   them as duplicate keys which trip TS2300 under `tsc -b`. This module\n"
    "//   is consumed only through `snapshots.contract.ts` (type-only re-exports\n"
    "//   for snapshot endpoints), so type checking happens at the contract\n"
    "//   surface, not on the raw schema dump.\n"
)


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

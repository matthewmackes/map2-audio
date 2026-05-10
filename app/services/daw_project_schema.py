"""T2503 Set 5 — DAW project JSON schema validator.

Loads ``schemas/daw-project-v1.schema.json`` once and validates documents
against it using ``jsonschema`` (already a transitive dep). Kept separate
from ``daw_project_service.py`` so tests can import the validator without
the filesystem layer.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_SCHEMA_PATH = _PROJECT_ROOT / "schemas" / "daw-project-v1.schema.json"


class DawProjectSchemaError(ValueError):
    """Raised when a project.json fails schema validation."""


@lru_cache(maxsize=1)
def load_daw_project_schema() -> dict[str, Any]:
    return json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))


def validate_daw_project(document: Mapping[str, Any]) -> None:
    """Validate a project document against schema v1.

    Uses ``jsonschema`` if available; otherwise performs a minimal
    structural check. The minimal path covers the required top-level keys
    + the schema_version pin so even a pip-thin environment catches the
    most common authoring mistakes.
    """
    try:
        import jsonschema
    except ImportError:
        _validate_minimal(document)
        return
    schema = load_daw_project_schema()
    try:
        jsonschema.validate(instance=document, schema=schema)
    except jsonschema.ValidationError as exc:
        raise DawProjectSchemaError(
            f"DAW project schema violation at {list(exc.absolute_path)}: {exc.message}"
        ) from exc


def _validate_minimal(document: Mapping[str, Any]) -> None:
    required = (
        "schema_version", "name", "sample_rate",
        "tracks", "clips", "plugin_instances", "automation_lanes",
    )
    missing = [key for key in required if key not in document]
    if missing:
        raise DawProjectSchemaError(
            f"DAW project missing required keys: {missing}"
        )
    if document.get("schema_version") != "v1":
        raise DawProjectSchemaError(
            f"DAW project schema_version must be 'v1', got {document.get('schema_version')!r}"
        )

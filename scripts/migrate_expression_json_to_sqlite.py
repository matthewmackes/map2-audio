#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.database import ExpressionAssignment as ExpressionAssignmentRow
from app.database import get_db_session, init_db

DEFAULT_SOURCE_PATH = Path.home() / ".map2" / "expression_assignments.json"


def _assignment_payload(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(item.get("id") or uuid.uuid4()),
        "cc": int(item.get("cc", 0)),
        "channel": int(item.get("channel", 0)),
        "cc_min": int(item.get("cc_min", 0)),
        "cc_max": int(item.get("cc_max", 127)),
        "param_id": str(item.get("param_id", "engine.reverb_mix")),
        "param_label": str(item.get("param_label") or item.get("param_id") or ""),
        "out_min": float(item.get("out_min", 0.0)),
        "out_max": float(item.get("out_max", 1.0)),
        "curve": str(item.get("curve", "linear")),
        "custom_curve": list(item.get("custom_curve") or []),
        "active": bool(item.get("active", True)),
        "source": str(item.get("source", "user")),
    }


def _load_assignments(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError(f"{path} must contain a JSON array of expression assignments")
    return [_assignment_payload(item) for item in raw if isinstance(item, dict)]


def _next_archive_path(source: Path) -> Path:
    archive_path = source.with_name(f"{source.name}.migrated")
    if not archive_path.exists():
        return archive_path
    for suffix in range(1, 1000):
        candidate = source.with_name(f"{source.name}.migrated.{suffix}")
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"Could not find available archive path for {source}")


def migrate_assignments(
    *,
    source_path: Path,
    database_url: str | None,
    dry_run: bool,
    keep_source: bool,
) -> dict[str, int | str | None]:
    if not source_path.exists():
        raise FileNotFoundError(source_path)

    assignments = _load_assignments(source_path)
    if dry_run:
        return {
            "read": len(assignments),
            "created": 0,
            "updated": 0,
            "archived_to": None,
        }

    init_db(database_url)
    session = get_db_session()
    created = 0
    updated = 0
    try:
        for payload in assignments:
            row = session.query(ExpressionAssignmentRow).filter_by(id=payload["id"]).first()
            if row is None:
                row = ExpressionAssignmentRow(id=payload["id"])
                session.add(row)
                created += 1
            else:
                updated += 1
            for key, value in payload.items():
                setattr(row, key, value)
        session.commit()
    finally:
        session.close()

    archived_to: str | None = None
    if not keep_source:
        archive_path = _next_archive_path(source_path)
        source_path.replace(archive_path)
        archived_to = str(archive_path)

    return {
        "read": len(assignments),
        "created": created,
        "updated": updated,
        "archived_to": archived_to,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Migrate retired expression assignment JSON into the MAP2 SQLite "
            "expression_assignments table and archive the source file."
        )
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE_PATH)
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--keep-source",
        action="store_true",
        help="Leave the retired JSON file in place after a successful migration.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = migrate_assignments(
        source_path=args.source.expanduser(),
        database_url=args.database_url,
        dry_run=bool(args.dry_run),
        keep_source=bool(args.keep_source),
    )
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

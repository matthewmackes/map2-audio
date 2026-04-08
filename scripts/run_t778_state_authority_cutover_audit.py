#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app import database as database_module


CORE_AUTHORITY_TABLES = (
    "snapshots",
    "snapshot_revisions",
    "state_authority_assets",
)

COMPATIBILITY_PROJECTION_TABLES = (
    "snapshot_channels",
    "snapshot_chains",
    "snapshot_chain_plugins",
    "snapshot_loop_insertions",
    "snapshot_routing",
    "snapshot_midi_maps",
)

OPERATIONAL_SNAPSHOT_TABLES = (
    "snapshot_deployments",
    "snapshot_deployment_history",
    "snapshot_node_live_state",
    "snapshot_activation_events",
)

SUPPORT_TABLES = (
    "schema_migrations",
)

RETIRED_TABLES = (
    "snapshot_session_notes",
)


def _collect_table_names(database_path: Path) -> list[str]:
    with sqlite3.connect(str(database_path)) as connection:
        rows = connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
    return [str(row[0]) for row in rows]


def _present_and_missing(expected_tables: tuple[str, ...], actual_tables: set[str]) -> dict[str, list[str]]:
    expected = sorted(expected_tables)
    present = [table for table in expected if table in actual_tables]
    missing = [table for table in expected if table not in actual_tables]
    return {
        "present": present,
        "missing": missing,
    }


def build_cutover_report(database_path: Path, table_names: list[str]) -> dict[str, Any]:
    actual_tables = set(table_names)
    core = _present_and_missing(CORE_AUTHORITY_TABLES, actual_tables)
    compatibility = _present_and_missing(COMPATIBILITY_PROJECTION_TABLES, actual_tables)
    operational = _present_and_missing(OPERATIONAL_SNAPSHOT_TABLES, actual_tables)
    support = _present_and_missing(SUPPORT_TABLES, actual_tables)
    retired_present = sorted(table for table in RETIRED_TABLES if table in actual_tables)
    retired_absent = sorted(table for table in RETIRED_TABLES if table not in actual_tables)

    blockers: list[str] = []
    if core["missing"]:
        blockers.append(
            "Missing core State Authority tables: "
            + ", ".join(core["missing"])
        )
    if support["missing"]:
        blockers.append(
            "Missing schema support tables: "
            + ", ".join(support["missing"])
        )
    if retired_present:
        blockers.append(
            "Retired legacy tables still exist: "
            + ", ".join(retired_present)
        )
    if compatibility["present"]:
        blockers.append(
            "Full relational snapshot-table retirement is still blocked because "
            "compatibility projection tables remain present on fresh-start DBs: "
            + ", ".join(compatibility["present"])
        )

    retirement_ready = not blockers and not compatibility["present"]
    retirement_status = "ready" if retirement_ready else "blocked"

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "database_path": str(database_path),
        "table_count": len(table_names),
        "tables": table_names,
        "core_state_authority_tables": core,
        "compatibility_projection_tables": compatibility,
        "operational_snapshot_tables": operational,
        "support_tables": support,
        "retired_tables": {
            "present": retired_present,
            "absent": retired_absent,
        },
        "fresh_start_cutover": {
            "canonical_document_field": "snapshots.document",
            "compatibility_contract": (
                "Snapshot detail should be reconstructible from the State Authority "
                "graph document even if the legacy snapshot_* projection tables are empty."
            ),
            "retirement_status": retirement_status,
            "retirement_blockers": blockers,
        },
    }


def render_markdown_report(report: dict[str, Any]) -> str:
    compatibility = report["compatibility_projection_tables"]
    core = report["core_state_authority_tables"]
    operational = report["operational_snapshot_tables"]
    support = report["support_tables"]
    retired = report["retired_tables"]
    cutover = report["fresh_start_cutover"]

    lines = [
        "# T778 State Authority Cutover Audit",
        "",
        f"- Generated at: `{report['generated_at']}`",
        f"- Fresh-start database: `{report['database_path']}`",
        f"- Retirement status: `{cutover['retirement_status']}`",
        "",
        "## Core State Authority Tables",
        "",
        "- Present: " + (", ".join(core["present"]) if core["present"] else "None"),
        "- Missing: " + (", ".join(core["missing"]) if core["missing"] else "None"),
        "",
        "## Compatibility Projection Tables",
        "",
        "- Present: " + (", ".join(compatibility["present"]) if compatibility["present"] else "None"),
        "- Missing: " + (", ".join(compatibility["missing"]) if compatibility["missing"] else "None"),
        "",
        "## Operational Snapshot Tables",
        "",
        "- Present: " + (", ".join(operational["present"]) if operational["present"] else "None"),
        "- Missing: " + (", ".join(operational["missing"]) if operational["missing"] else "None"),
        "",
        "## Support Tables",
        "",
        "- Present: " + (", ".join(support["present"]) if support["present"] else "None"),
        "- Missing: " + (", ".join(support["missing"]) if support["missing"] else "None"),
        "",
        "## Retired Tables",
        "",
        "- Absent as expected: " + (", ".join(retired["absent"]) if retired["absent"] else "None"),
        "- Unexpectedly present: " + (", ".join(retired["present"]) if retired["present"] else "None"),
        "",
        "## Cutover Contract",
        "",
        f"- Canonical document field: `{cutover['canonical_document_field']}`",
        f"- Compatibility contract: {cutover['compatibility_contract']}",
        "",
        "## Retirement Blockers",
        "",
    ]
    blockers = cutover["retirement_blockers"]
    if blockers:
        lines.extend(f"- {blocker}" for blocker in blockers)
    else:
        lines.append("- None")
    lines.extend(
        [
            "",
            "## Fresh-Start Reset Path",
            "",
            "- Use a new SQLite path via `MAP2_DATABASE_PATH` or the audit script `--database-path`; do not point the audit at the live production DB.",
            "- Initialize the schema with `python3 scripts/run_t778_state_authority_cutover_audit.py --output-dir <dir>`.",
            "- Treat the generated JSON/Markdown bundle as the canonical proof for which snapshot tables are authoritative, compatibility-only, operational, or retired on a fresh-start database.",
        ]
    )
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a fresh-start MAP2 DB and classify State Authority cutover tables."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("/tmp/t778-state-authority-cutover-audit"),
        help="Directory for the generated report bundle.",
    )
    parser.add_argument(
        "--database-path",
        type=Path,
        default=None,
        help="SQLite path to initialize for the fresh-start audit. Defaults under the output dir.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    database_path = (
        args.database_path.resolve()
        if args.database_path is not None
        else (output_dir / "t778-state-authority-cutover.db").resolve()
    )
    if database_path.exists():
        database_path.unlink()

    database_module.init_db(f"sqlite:///{database_path}")
    table_names = _collect_table_names(database_path)
    report = build_cutover_report(database_path, table_names)

    json_path = output_dir / "t778-state-authority-cutover-report.json"
    markdown_path = output_dir / "T778_STATE_AUTHORITY_CUTOVER_REPORT.md"
    json_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown_report(report), encoding="utf-8")

    print(
        json.dumps(
            {
                "retirement_status": report["fresh_start_cutover"]["retirement_status"],
                "database_path": str(database_path),
                "json_report": str(json_path),
                "markdown_report": str(markdown_path),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

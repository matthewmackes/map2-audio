from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from .constants import PROFILE_ID
from .fixtures import write_fixture_bundle
from .model import GroundControlTransportOptions
from .service import GroundControlProService


async def _run_import(args: argparse.Namespace) -> int:
    service = GroundControlProService()
    payload = await service.import_syx_bytes(Path(args.path).read_bytes(), source_name=Path(args.path).name)
    print(json.dumps(payload["summary"], indent=2, sort_keys=True))
    return 0


async def _run_compile(args: argparse.Namespace) -> int:
    service = GroundControlProService()
    session = await service.import_syx_bytes(Path(args.from_path).read_bytes(), source_name=Path(args.from_path).name)
    draft = json.loads(Path(args.draft_path).read_text(encoding="utf-8"))
    result = await service.compile_session(session["session_id"], draft)
    Path(args.out_path).write_bytes(Path(result["artifact"]["path"]).read_bytes())
    print(json.dumps(result["validation"], indent=2, sort_keys=True))
    return 0


async def _run_diff(args: argparse.Namespace) -> int:
    service = GroundControlProService()
    left = await service.import_syx_bytes(Path(args.left_path).read_bytes(), source_name=Path(args.left_path).name)
    right = await service.import_syx_bytes(Path(args.right_path).read_bytes(), source_name=Path(args.right_path).name)
    result = await service.diff(
        left_artifact_id=left["summary"]["source_artifact_id"],
        right_artifact_id=right["summary"]["source_artifact_id"],
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


async def _run_backup(args: argparse.Namespace) -> int:
    service = GroundControlProService()
    result = await service.backup(
        GroundControlTransportOptions(
            input_port_index=args.midi_in_index,
            input_port_name=args.midi_in_name,
            timeout_seconds=args.timeout_seconds,
        ),
        create_session=False,
    )
    artifact_path = result["result"]["artifact"]["path"]
    if args.out_path:
        Path(args.out_path).write_bytes(Path(artifact_path).read_bytes())
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


async def _run_push(args: argparse.Namespace) -> int:
    service = GroundControlProService()
    imported = await service.import_syx_bytes(Path(args.path).read_bytes(), source_name=Path(args.path).name)
    compile_result = await service.compile_session(imported["session_id"], imported["model"])
    result = await service.push(
        compiled_artifact_id=compile_result["artifact"]["artifact_id"],
        session_id=imported["session_id"],
        model_payload=imported["model"],
        options=GroundControlTransportOptions(
            output_port_index=args.midi_out_index,
            output_port_name=args.midi_out_name,
            inter_message_delay_ms=args.inter_message_delay_ms,
            dry_run_path=args.dry_run_path,
        ),
        force=args.force,
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


async def _run_generate_fixtures(args: argparse.Namespace) -> int:
    manifest = write_fixture_bundle(Path(args.out_dir))
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


async def _run_field_map_update(args: argparse.Namespace) -> int:
    service = GroundControlProService()
    left_bytes = Path(args.left_path).read_bytes()
    right_bytes = Path(args.right_path).read_bytes()
    diff = service.build_diff(
        left_bytes=left_bytes,
        right_bytes=right_bytes,
        left_label=Path(args.left_path).name,
        right_label=Path(args.right_path).name,
    )
    payload = {
        "profile_id": PROFILE_ID,
        "left_file": Path(args.left_path).name,
        "right_file": Path(args.right_path).name,
        "changes": [
            {
                "offset": change["offset"],
                "before": change["left"],
                "after": change["right"],
                "labels": change["labels"],
                "confidence": "needs_review",
            }
            for change in diff["changes"]
        ],
    }
    if args.out_path:
        Path(args.out_path).write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ground-control-pro")
    subparsers = parser.add_subparsers(dest="command", required=True)

    import_parser = subparsers.add_parser("import")
    import_parser.add_argument("path")

    compile_parser = subparsers.add_parser("compile")
    compile_parser.add_argument("draft_path")
    compile_parser.add_argument("--from", dest="from_path", required=True)
    compile_parser.add_argument("--out", dest="out_path", required=True)

    diff_parser = subparsers.add_parser("diff")
    diff_parser.add_argument("left_path")
    diff_parser.add_argument("right_path")

    backup_parser = subparsers.add_parser("backup")
    backup_parser.add_argument("--midi-in-index", type=int, default=None)
    backup_parser.add_argument("--midi-in-name", default=None)
    backup_parser.add_argument("--timeout-seconds", type=float, default=30.0)
    backup_parser.add_argument("--out", dest="out_path", default=None)

    push_parser = subparsers.add_parser("push")
    push_parser.add_argument("path")
    push_parser.add_argument("--midi-out-index", type=int, default=None)
    push_parser.add_argument("--midi-out-name", default=None)
    push_parser.add_argument("--inter-message-delay-ms", type=float, default=0.0)
    push_parser.add_argument("--dry-run-path", default=None)
    push_parser.add_argument("--force", action="store_true")

    generate_fixtures_parser = subparsers.add_parser("generate-fixtures")
    generate_fixtures_parser.add_argument("--out-dir", default="tests/fixtures/ground_control_pro")

    field_map_update_parser = subparsers.add_parser("field-map-update")
    field_map_update_parser.add_argument("left_path")
    field_map_update_parser.add_argument("right_path")
    field_map_update_parser.add_argument("--out", dest="out_path", default=None)

    return parser


async def _dispatch(args: argparse.Namespace) -> int:
    if args.command == "import":
        return await _run_import(args)
    if args.command == "compile":
        return await _run_compile(args)
    if args.command == "diff":
        return await _run_diff(args)
    if args.command == "backup":
        return await _run_backup(args)
    if args.command == "push":
        return await _run_push(args)
    if args.command == "generate-fixtures":
        return await _run_generate_fixtures(args)
    if args.command == "field-map-update":
        return await _run_field_map_update(args)
    raise ValueError(f"Unsupported command: {args.command}")


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return asyncio.run(_dispatch(args))


if __name__ == "__main__":
    raise SystemExit(main())

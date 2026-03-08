#!/usr/bin/env python3
"""MAP2 AVB latency optimizer CLI."""

from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import sys


def _load_package():
    script_dir = Path(__file__).resolve().parent
    package_dir = script_dir / "avb_latency_optimizer"
    init_file = package_dir / "__init__.py"

    spec = importlib.util.spec_from_file_location(
        "avb_latency_optimizer_pkg",
        init_file,
        submodule_search_locations=[str(package_dir)],
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load avb_latency_optimizer package")

    module = importlib.util.module_from_spec(spec)
    sys.modules["avb_latency_optimizer_pkg"] = module
    spec.loader.exec_module(module)
    return module


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit MAP2 platform AVB/TSN latency posture")
    parser.add_argument("--path-to-platform", required=True, help="Path to repository/platform root")
    parser.add_argument("--output-dir", required=True, help="Directory for report artifacts")
    parser.add_argument("--dry-run", action="store_true", help="Force read-only mode (default when --apply not set)")
    parser.add_argument("--apply", action="store_true", help="Apply proposed patches to repository")
    parser.add_argument("--confirm-apply", action="store_true", help="Required safety confirmation for --apply")
    parser.add_argument("--verify", action="store_true", help="Run verification checks")
    parser.add_argument("--max-files", type=int, default=10000, help="Maximum files to scan")
    parser.add_argument("--include-ext", action="append", default=[], help="Additional extension to include")
    parser.add_argument("--exclude-dir", action="append", default=[], help="Directory name to exclude")
    parser.add_argument("--verbose", action="store_true", help="Print step-level execution detail")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pkg = _load_package()

    root = Path(args.path_to_platform).resolve()
    output_dir = Path(args.output_dir).resolve()

    dry_run = args.dry_run or not args.apply
    if args.verbose:
        print(f"[avb-optimizer] root={root}")
        print(f"[avb-optimizer] output_dir={output_dir}")
        print(f"[avb-optimizer] dry_run={dry_run} apply={args.apply} verify={args.verify}")

    scan = pkg.scan_codebase(
        root_path=str(root),
        max_files=args.max_files,
        include_ext=args.include_ext or None,
        exclude_dirs=args.exclude_dir or None,
    )

    if args.verbose:
        print(f"[avb-optimizer] scanned_files={scan.total_files_scanned} matches={len(scan.matches)}")

    config = pkg.extract_avb_config(scan)
    budget = pkg.estimate_latency_budget(config)
    findings = pkg.analyze_platform(scan, config, budget)
    proposals = pkg.propose_changes(findings)

    patch_files = pkg.write_patch_files(proposals, str(root), str(output_dir))
    if args.verbose:
        print(f"[avb-optimizer] patch_proposals={len(proposals)} patch_files={len(patch_files)}")

    apply_results = []
    apply_refused = False
    if args.apply:
        apply_results = pkg.apply_patches(proposals, str(root), confirm_apply=args.confirm_apply)
        apply_refused = any(result.status == "fail" for result in apply_results)
        if args.verbose:
            for result in apply_results:
                print(f"[apply] {result.id} {result.status} {result.target_path} :: {result.message}")

    verification_results = pkg.run_verification_tests(str(root)) if args.verify else []

    report_paths = pkg.write_reports(
        output_dir=str(output_dir),
        root_path=str(root),
        scan=scan,
        config=config,
        budget=budget,
        findings=findings,
        patches=proposals,
        verification=verification_results,
    )

    print("AVB latency optimizer completed")
    print(f"- files scanned: {scan.total_files_scanned}")
    print(f"- findings: {len(findings)}")
    print(f"- patch proposals: {len(proposals)}")
    print(f"- report.md: {report_paths['report_md']}")
    print(f"- report.json: {report_paths['report_json']}")
    print(f"- findings.csv: {report_paths['findings_csv']}")
    print(f"- patch dir: {output_dir / 'patches'}")

    if args.apply and not args.confirm_apply:
        print("Safety refusal: --apply requires --confirm-apply")

    if apply_refused:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

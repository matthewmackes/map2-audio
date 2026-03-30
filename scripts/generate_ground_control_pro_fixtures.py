#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.services.ground_control_pro.fixtures import write_fixture_bundle


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate deterministic Ground Control Pro SysEx fixtures.")
    parser.add_argument(
        "--output-dir",
        default=str(REPO_ROOT / "tests" / "fixtures" / "ground_control_pro"),
        help="Directory to receive generated .syx fixtures and manifest.yml",
    )
    args = parser.parse_args()
    manifest = write_fixture_bundle(Path(args.output_dir))
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

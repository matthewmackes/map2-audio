"""
Final validation script (Phase 5.4)

Runs lightweight checks to validate key endpoints.
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
os.environ["MAP2_TEST_MODE"] = "true"

from fastapi.testclient import TestClient
from contextlib import asynccontextmanager
from app.main import create_app


def run_checks() -> int:
    app = create_app()

    @asynccontextmanager
    async def _no_lifespan(_app):
        yield

    app.router.lifespan_context = _no_lifespan
    client = TestClient(app)

    checks = [
        ("/api/cluster/nodes", 200),
        ("/api/cluster/flows/assignments", 200),
        ("/api/chains", 200),
    ]

    failures = 0
    for path, expected in checks:
        resp = client.get(path)
        if resp.status_code != expected:
            failures += 1
            print(f"FAIL {path}: {resp.status_code}")
        else:
            print(f"OK {path}")

    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(run_checks())

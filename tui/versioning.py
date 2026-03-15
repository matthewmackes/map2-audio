"""Version helpers for the unified MAP2 Textual console."""

from __future__ import annotations

import json
import subprocess
from functools import lru_cache
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = REPO_ROOT / "VERSION"
VERSION_JSON = REPO_ROOT / "version.json"


@lru_cache(maxsize=1)
def get_product_name() -> str:
    """Return the configured product name."""

    if VERSION_JSON.exists():
        try:
            data = json.loads(VERSION_JSON.read_text())
            product = str(data.get("product", "")).strip()
            if product:
                return product
        except Exception:
            pass
    return "MAP2 Audio Platform"


@lru_cache(maxsize=1)
def get_version() -> str:
    """Resolve the console version from git or fallback files."""

    try:
        result = subprocess.run(
            ["git", "describe", "--tags", "--dirty", "--always"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        version = result.stdout.strip()
        if version:
            return version
    except Exception:
        pass

    if VERSION_FILE.exists():
        version = VERSION_FILE.read_text().strip()
        if version:
            return version

    if VERSION_JSON.exists():
        try:
            data = json.loads(VERSION_JSON.read_text())
            version = str(data.get("fallback_version", "")).strip()
            if version:
                return version
        except Exception:
            pass

    return "0.0.0-dev"

"""
Managed RT hardening wrappers for setup/verify scripts.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any, Dict

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SETUP_SCRIPT = _REPO_ROOT / "scripts" / "setup_realtime.sh"
_VERIFY_SCRIPT = _REPO_ROOT / "scripts" / "verify_rt_config.sh"


def _run(command: list[str], timeout: int = 300) -> Dict[str, Any]:
    proc = subprocess.run(
        command,
        cwd=str(_REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
        timeout=timeout,
    )
    return {
        "command": command,
        "returncode": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "ok": proc.returncode == 0,
    }


def _extract_grade(output: str) -> str | None:
    for line in output.splitlines():
        if "RT Configuration Grade:" in line:
            parts = line.split("RT Configuration Grade:", 1)
            if len(parts) == 2:
                return parts[1].strip()
    return None


def verify_rt_hardening(*, quick: bool = True) -> Dict[str, Any]:
    if not _VERIFY_SCRIPT.exists():
        return {
            "ok": False,
            "returncode": 127,
            "error": f"Missing script: {_VERIFY_SCRIPT}",
            "grade": None,
            "command": [str(_VERIFY_SCRIPT), "--quick"] if quick else [str(_VERIFY_SCRIPT)],
            "stdout": "",
            "stderr": "",
        }

    command = [str(_VERIFY_SCRIPT)]
    if quick:
        command.append("--quick")

    result = _run(command, timeout=180)
    merged_output = f"{result.get('stdout', '')}\n{result.get('stderr', '')}"
    result["grade"] = _extract_grade(merged_output)
    return result


def apply_rt_hardening(*, dry_run: bool = False, auto_yes: bool = True) -> Dict[str, Any]:
    if not _SETUP_SCRIPT.exists():
        return {
            "ok": False,
            "returncode": 127,
            "error": f"Missing script: {_SETUP_SCRIPT}",
            "command": [str(_SETUP_SCRIPT)],
            "stdout": "",
            "stderr": "",
        }

    command = [str(_SETUP_SCRIPT)]
    if auto_yes:
        command.append("--yes")
    if dry_run:
        command.append("--dry-run")
    return _run(command, timeout=900)

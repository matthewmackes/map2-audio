"""Fail-soft verification checks for AVB optimizer output."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
import subprocess

from .models import VerificationCheck


@dataclass(frozen=True)
class _CheckSpec:
    check_id: str
    name: str
    command: list[str]


def _run_command(command: list[str], timeout_sec: int = 30) -> tuple[int, str]:
    proc = subprocess.run(
        command,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout_sec,
    )
    return proc.returncode, (proc.stdout or "").strip()


def _resolve_check_command(spec: _CheckSpec) -> tuple[list[str] | None, str | None]:
    """Resolve executable alternatives for checks that accept more than one tool."""

    if spec.check_id == "V004":
        for candidate in (
            ["tshark", "-v"],
            ["tcpdump", "--version"],
            ["dumpcap", "-v"],
        ):
            if shutil.which(candidate[0]) is not None:
                return candidate, None
        return None, "Skipped: none of `tshark`, `tcpdump`, or `dumpcap` found on host."

    executable = spec.command[0]
    if shutil.which(executable) is None:
        return None, f"Skipped: `{executable}` not found on host."

    return spec.command, None


def run_verification_tests(root_path: str) -> list[VerificationCheck]:
    """Run available checks and mark unavailable tools as skipped."""

    root = Path(root_path).resolve()
    checks: list[_CheckSpec] = [
        _CheckSpec("V001", "linuxptp ptp4l availability", ["ptp4l", "-v"]),
        _CheckSpec("V002", "linuxptp phc2sys availability", ["phc2sys", "-v"]),
        _CheckSpec("V003", "Traffic control tool availability", ["tc", "-V"]),
        _CheckSpec("V004", "Packet capture tool availability", ["tshark", "-v"]),
        _CheckSpec("V005", "QoS load generator availability", ["iperf3", "--version"]),
    ]

    test_commands: list[_CheckSpec] = []
    if (root / "tests/test_avb_service_engine_contract.py").exists():
        test_commands.append(
            _CheckSpec(
                "V006",
                "Backend AVB contract tests",
                ["pytest", "-q", "tests/test_avb_service_engine_contract.py", "--maxfail=1"],
            )
        )
    if (root / "web/package.json").exists():
        test_commands.append(
            _CheckSpec(
                "V007",
                "Web AVB routing tests",
                ["npm", "run", "test:avb-routing", "--", "--runInBand", "--silent"],
            )
        )

    checks.extend(test_commands)

    results: list[VerificationCheck] = []
    for spec in checks:
        command, skip_reason = _resolve_check_command(spec)
        if command is None:
            results.append(
                VerificationCheck(
                    id=spec.check_id,
                    name=spec.name,
                    status="skipped",
                    command=" ".join(spec.command),
                    details=skip_reason or "Skipped: required tool not found on host.",
                )
            )
            continue

        executable = command[0]
        timeout_sec = 120 if executable in {"pytest", "npm"} else 30
        try:
            rc, output = _run_command(command, timeout_sec=timeout_sec)
        except subprocess.TimeoutExpired:
            results.append(
                VerificationCheck(
                    id=spec.check_id,
                    name=spec.name,
                    status="fail",
                    command=" ".join(command),
                    details="Command timed out.",
                )
            )
            continue

        status = "pass" if rc == 0 else "fail"
        details = "\n".join(output.splitlines()[:8]) if output else "(no output)"
        results.append(
            VerificationCheck(
                id=spec.check_id,
                name=spec.name,
                status=status,
                command=" ".join(command),
                details=details,
            )
        )

    return results

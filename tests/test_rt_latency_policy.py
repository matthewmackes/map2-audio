import ast
from pathlib import Path


SERVICES_ROOT = Path(__file__).resolve().parents[1] / "app" / "services"
SUB_5MS_ALLOWLIST = {
    "audio_io.py": "Audio I/O queue servicing intentionally stays faster than the general 5ms policy while keeping work off the callback thread.",
    "metering_broadcast.py": "Metering cadence is governed by topic FPS configuration rather than a fixed sub-5ms sleep loop.",
    "realtime_parameter_bridge.py": "The RT parameter bridge is a narrow exception because it is the low-latency control handoff path into the engine.",
}


def _is_asyncio_sleep(call: ast.Call) -> bool:
    func = call.func
    return (
        isinstance(func, ast.Attribute)
        and func.attr == "sleep"
        and isinstance(func.value, ast.Name)
        and func.value.id == "asyncio"
    )


def _sub_5ms_sleep_violations() -> list[str]:
    violations: list[str] = []
    for path in sorted(SERVICES_ROOT.rglob("*.py")):
        relative_path = path.relative_to(SERVICES_ROOT).as_posix()
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Await) or not isinstance(node.value, ast.Call):
                continue
            call = node.value
            if not _is_asyncio_sleep(call) or not call.args:
                continue
            literal = call.args[0]
            if not isinstance(literal, ast.Constant) or not isinstance(literal.value, (int, float)):
                continue
            if float(literal.value) >= 0.005:
                continue
            if relative_path in SUB_5MS_ALLOWLIST:
                continue
            violations.append(
                f"{relative_path}:{literal.lineno} asyncio.sleep({float(literal.value):.6f})"
            )
    return violations


def test_service_sleep_policy_rejects_new_sub_5ms_poll_loops():
    violations = _sub_5ms_sleep_violations()
    assert not violations, (
        "Sub-5ms asyncio.sleep() calls under app/services require an explicit RT-policy exemption:\n"
        + "\n".join(violations)
    )

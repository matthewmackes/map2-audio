"""Run-14b pick #1 — pin the `npm run typecheck` gate shape.

The CI gate now runs:
  1. `verify:contracts`        — snapshot OpenAPI codegen drift check
  2. `verify:meter-ws-types`   — meter-WS frame codegen drift check
  3. `tsc --noEmit`            — actual TypeScript typecheck

If a future PR removes either codegen check from the gate, this test
fails so reviewers notice. The shape is pinned literally in
web/package.json::scripts.typecheck.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_JSON = REPO_ROOT / "web" / "package.json"


@pytest.fixture(scope="module")
def scripts() -> dict[str, str]:
    return json.loads(PACKAGE_JSON.read_text())["scripts"]


def test_package_json_exists(scripts: dict[str, str]) -> None:
    assert PACKAGE_JSON.is_file()
    assert "typecheck" in scripts


def test_typecheck_runs_snapshot_codegen_check(scripts: dict[str, str]) -> None:
    """T2455 snapshot codegen drift check must run before tsc."""
    assert "verify:contracts" in scripts["typecheck"], (
        "npm run typecheck must invoke `verify:contracts` (snapshot codegen "
        "drift gate) — drift here means snapshots.generated.ts accumulates "
        "silently again"
    )


def test_typecheck_runs_sonobus_events_ws_codegen_check(scripts: dict[str, str]) -> None:
    """Run-14c cycle 1: sonobus events WS codegen drift check must run before tsc."""
    assert "verify:sonobus-events-ws-types" in scripts["typecheck"], (
        "npm run typecheck must invoke `verify:sonobus-events-ws-types` "
        "(sonobus events WS codegen drift gate) — drift here means "
        "sonobusEventsWsFrame.generated.ts silently desyncs from the "
        "canonical Pydantic schema"
    )


def test_typecheck_runs_midi_traffic_ws_codegen_check(scripts: dict[str, str]) -> None:
    """Run-14c cycle 2: midi:traffic WS codegen drift check must run before tsc."""
    assert "verify:midi-traffic-ws-types" in scripts["typecheck"], (
        "npm run typecheck must invoke `verify:midi-traffic-ws-types` "
        "(midi:traffic WS codegen drift gate)"
    )


def test_typecheck_runs_meter_ws_codegen_check(scripts: dict[str, str]) -> None:
    """Run-14b pick #1: meter-WS codegen drift check must run before tsc."""
    assert "verify:meter-ws-types" in scripts["typecheck"], (
        "npm run typecheck must invoke `verify:meter-ws-types` (meter-WS "
        "codegen drift gate) — drift here means meterWsFrame.generated.ts "
        "silently desyncs from the canonical Pydantic schema"
    )


def test_typecheck_still_runs_tsc(scripts: dict[str, str]) -> None:
    """Removing tsc from the gate would let TS errors land silently."""
    assert "tsc --noEmit" in scripts["typecheck"], (
        "npm run typecheck must still run `tsc --noEmit` after the codegen "
        "checks — the codegen drift gates DO NOT replace TypeScript type-checking"
    )


def test_typecheck_runs_codegen_checks_before_tsc(scripts: dict[str, str]) -> None:
    """Order matters: the codegen drift checks produce actionable error
    messages, while tsc errors will compound when fed an out-of-date
    generated file. Drift gates first; tsc last."""
    cmd = scripts["typecheck"]
    pos_contracts = cmd.find("verify:contracts")
    pos_meter = cmd.find("verify:meter-ws-types")
    pos_tsc = cmd.find("tsc --noEmit")
    assert 0 <= pos_contracts < pos_tsc, (
        "verify:contracts must run before tsc --noEmit; "
        f"got `{cmd}`"
    )
    assert 0 <= pos_meter < pos_tsc, (
        "verify:meter-ws-types must run before tsc --noEmit; "
        f"got `{cmd}`"
    )


def test_generate_and_verify_scripts_are_paired(scripts: dict[str, str]) -> None:
    """Every verify:X script must have a matching generate:X. Without
    the generator, a developer can't refresh the file the verifier
    is checking — the gate becomes uncloseable."""
    for verify_key in (
        "verify:contracts",         # T2455 snapshot codegen
        "verify:meter-ws-types",    # run-14b pick #1
    ):
        # By convention the generator is named `generate:<suffix>`.
        suffix = verify_key.split(":", 1)[1]
        # The snapshot codegen uses `generate:types`, not `generate:contracts`
        # — accept either pairing.
        generate_keys_for_contracts = ("generate:types", "generate:contracts")
        if verify_key == "verify:contracts":
            assert any(k in scripts for k in generate_keys_for_contracts), (
                f"{verify_key} has no paired generator (one of {generate_keys_for_contracts})"
            )
        else:
            paired = f"generate:{suffix}"
            assert paired in scripts, (
                f"{verify_key} has no paired generator `{paired}`"
            )


def test_meter_ws_codegen_script_path_is_correct(scripts: dict[str, str]) -> None:
    """The script path must be relative-to-web-dir + point at the
    canonical generate_meter_ws_types.py."""
    assert "generate_meter_ws_types.py" in scripts["generate:meter-ws-types"]
    assert "generate_meter_ws_types.py" in scripts["verify:meter-ws-types"]
    assert "--check" in scripts["verify:meter-ws-types"]

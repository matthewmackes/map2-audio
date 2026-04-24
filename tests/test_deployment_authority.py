"""T2431-E + T2431-F: deployment-mode authority + projection header tests."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.deployment.authority import (
    CANONICAL_MODES,
    DeploymentAuthorityPayload,
    DeploymentModeAuthority,
    DeploymentModeAuthorityError,
    DeploymentModeDoctor,
    DriftFinding,
    GENERATOR_NAME,
    PROJECTION_HEADER_VERSION,
    ProjectionHeader,
    canonicalize_mode,
    compute_sha256,
    environment_projection_path,
    render_environment_projection,
    resolve_deployment_mode,
    write_environment_projection,
)


@pytest.fixture
def isolated_paths(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict:
    host = tmp_path / "etc"
    monkeypatch.setenv("MAP2_HOST_CONFIG_DIR", str(host))
    monkeypatch.setenv("MAP2_SERVICE_STATE_DIR", str(tmp_path / "var"))
    monkeypatch.setenv("MAP2_USER_DIR", str(tmp_path / "home"))
    return {"host": host}


# ---------------------------------------------------------------------------
# canonicalization
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("all-in-one", "ALL-IN-ONE"),
    ("ALL_IN_ONE", "ALL-IN-ONE"),
    ("audio", "AUDIO-NODE"),
    ("management", "CONTROL-NODE"),
    ("CONTROL_NODE", "CONTROL-NODE"),
    ("frontend", "FRONTEND-ONLY"),
])
def test_canonicalize_mode_normalizes_historical_spellings(raw: str, expected: str) -> None:
    assert canonicalize_mode(raw) == expected


def test_canonicalize_mode_rejects_unknown() -> None:
    with pytest.raises(ValueError):
        canonicalize_mode("not-a-mode")


def test_canonical_modes_are_stable() -> None:
    assert set(CANONICAL_MODES) == {"ALL-IN-ONE", "AUDIO-NODE", "CONTROL-NODE", "FRONTEND-ONLY"}


# ---------------------------------------------------------------------------
# authority read/write
# ---------------------------------------------------------------------------

def test_authority_read_raises_when_file_missing(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    assert not authority.exists()
    with pytest.raises(DeploymentModeAuthorityError):
        authority.read()


def test_authority_write_then_read_round_trip(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    authority.write("audio", set_by="pytest")

    assert authority.exists()
    payload = authority.read()
    assert payload.mode == "AUDIO-NODE"
    assert payload.set_by == "pytest"


def test_authority_default_returns_fallback(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    payload = authority.read_or_default("management")
    assert payload.mode == "CONTROL-NODE"


def test_authority_rejects_unknown_mode_on_write(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    with pytest.raises(ValueError):
        authority.write("weird")


def test_authority_read_tolerates_legacy_mode_spellings(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    authority.path.parent.mkdir(parents=True, exist_ok=True)
    authority.path.write_text(json.dumps({"mode": "audio_node"}), encoding="utf-8")
    payload = authority.read()
    assert payload.mode == "AUDIO-NODE"


def test_authority_checksum_matches_file_contents(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    authority.write("all-in-one")
    expected = compute_sha256(authority.path.read_bytes())
    assert authority.read_checksum() == expected


# ---------------------------------------------------------------------------
# T2431-F — projection header standard
# ---------------------------------------------------------------------------

def test_projection_header_round_trip_through_shell_comments() -> None:
    header = ProjectionHeader(
        authority_source="/etc/map2/mode.json",
        authority_checksum_sha256="a" * 64,
        generator=GENERATOR_NAME,
    )
    rendered = header.to_shell_comment_block()
    # All of the required fields survive parse.
    parsed = ProjectionHeader.parse_shell_header(rendered)
    assert parsed is not None
    assert parsed.authority_source == header.authority_source
    assert parsed.authority_checksum_sha256 == header.authority_checksum_sha256
    assert parsed.generator == header.generator


def test_projection_header_parse_returns_none_on_plain_file() -> None:
    assert ProjectionHeader.parse_shell_header("MAP2_DEPLOYMENT_MODE=AUDIO-NODE\n") is None


def test_projection_header_schema_version_is_stable() -> None:
    header = ProjectionHeader(
        authority_source="x",
        authority_checksum_sha256="y",
        generator="g",
    )
    assert header.schema_version == PROJECTION_HEADER_VERSION
    assert header.to_metadata_dict()["schema_version"] == PROJECTION_HEADER_VERSION


# ---------------------------------------------------------------------------
# environment projection
# ---------------------------------------------------------------------------

def test_environment_projection_contains_mode_and_header(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    authority.write("AUDIO-NODE")
    env_path = write_environment_projection(authority)

    text = env_path.read_text(encoding="utf-8")
    header = ProjectionHeader.parse_shell_header(text)
    assert header is not None
    assert header.authority_source == str(authority.path)
    assert header.authority_checksum_sha256 == authority.read_checksum()
    assert "MAP2_DEPLOYMENT_MODE=AUDIO-NODE" in text


def test_render_environment_projection_is_deterministic() -> None:
    payload = DeploymentAuthorityPayload(mode="ALL-IN-ONE", updated_at="2026-04-24T00:00:00+00:00")
    first = render_environment_projection(
        payload,
        authority_path=Path("/etc/map2/mode.json"),
        authority_checksum="a" * 64,
    )
    second = render_environment_projection(
        payload,
        authority_path=Path("/etc/map2/mode.json"),
        authority_checksum="a" * 64,
    )
    # Only generated_at differs; strip to compare structure + body.
    def strip_generated_at(raw: bytes) -> list[str]:
        return [line for line in raw.decode().splitlines() if "generated_at:" not in line]
    assert strip_generated_at(first) == strip_generated_at(second)


# ---------------------------------------------------------------------------
# doctor
# ---------------------------------------------------------------------------

def test_doctor_reports_missing_authority(isolated_paths: dict) -> None:
    doctor = DeploymentModeDoctor()
    report = doctor.check()
    assert not report.authority_exists
    assert not report.healthy
    kinds = {f.kind for f in report.findings}
    assert "missing_authority" in kinds


def test_doctor_healthy_when_authority_and_projection_match(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    authority.write("ALL-IN-ONE")
    write_environment_projection(authority)

    doctor = DeploymentModeDoctor(authority)
    report = doctor.check()
    assert report.authority_exists
    assert report.authority_mode == "ALL-IN-ONE"
    assert report.healthy, report.to_dict()


def test_doctor_detects_missing_projection(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    authority.write("ALL-IN-ONE")
    # Do not write the projection.
    doctor = DeploymentModeDoctor(authority)
    report = doctor.check()
    assert any(f.kind == "missing_projection" for f in report.findings)


def test_doctor_detects_checksum_mismatch(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    authority.write("ALL-IN-ONE")
    write_environment_projection(authority)
    # Change the authority under the projection's feet.
    authority.write("AUDIO-NODE")
    doctor = DeploymentModeDoctor(authority)
    report = doctor.check()
    assert any(f.kind == "checksum_mismatch" for f in report.findings)


def test_doctor_detects_unmanaged_projection(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    authority.write("ALL-IN-ONE")
    env_path = environment_projection_path()
    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text("MAP2_DEPLOYMENT_MODE=ALL-IN-ONE\n", encoding="utf-8")
    doctor = DeploymentModeDoctor(authority)
    report = doctor.check()
    # No MAP2 header → header_missing finding.
    assert any(f.kind == "header_missing" for f in report.findings)


def test_doctor_repair_regenerates_projection(isolated_paths: dict) -> None:
    authority = DeploymentModeAuthority()
    authority.write("AUDIO-NODE")
    # Write an unmanaged projection.
    env_path = environment_projection_path()
    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text("MAP2_DEPLOYMENT_MODE=SOMETHING\n", encoding="utf-8")

    doctor = DeploymentModeDoctor(authority)
    assert not doctor.check().healthy

    post = doctor.repair()
    assert post.healthy, post.to_dict()
    assert "MAP2_DEPLOYMENT_MODE=AUDIO-NODE" in env_path.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# T2437 — resolve_deployment_mode precedence chain
# ---------------------------------------------------------------------------

def test_resolve_mode_prefers_explicit_override(
    isolated_paths: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("MAP2_DEPLOYMENT_MODE", raising=False)
    authority = DeploymentModeAuthority()
    authority.write("AUDIO-NODE")
    # explicit arg beats everything else.
    assert resolve_deployment_mode(
        authority=authority,
        env_override="management",
    ) == "CONTROL-NODE"


def test_resolve_mode_uses_env_var_over_authority(
    isolated_paths: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MAP2_DEPLOYMENT_MODE", "audio")
    authority = DeploymentModeAuthority()
    authority.write("ALL-IN-ONE")
    assert resolve_deployment_mode(authority=authority) == "AUDIO-NODE"


def test_resolve_mode_uses_authority_when_env_absent(
    isolated_paths: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("MAP2_DEPLOYMENT_MODE", raising=False)
    authority = DeploymentModeAuthority()
    authority.write("FRONTEND-ONLY")
    assert resolve_deployment_mode(authority=authority) == "FRONTEND-ONLY"


def test_resolve_mode_falls_back_when_nothing_set(
    isolated_paths: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Without env or authority, the resolver consults the legacy
    `DeploymentConfig` (fallback layer 4) before the explicit `fallback`
    kwarg. That layer creates a default `~/.map2/deployment.json` with
    `ALL-IN-ONE` on first read, so the result is always a canonical mode.
    Explicit `fallback` is the last resort when even that layer fails.
    """
    monkeypatch.delenv("MAP2_DEPLOYMENT_MODE", raising=False)
    result = resolve_deployment_mode(
        authority=DeploymentModeAuthority(),
        fallback="AUDIO-NODE",
    )
    # Whichever layer answers, the result must be canonical.
    assert result in {"ALL-IN-ONE", "AUDIO-NODE"}


def test_resolve_mode_rejects_invalid_env(
    isolated_paths: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MAP2_DEPLOYMENT_MODE", "garbage")
    authority = DeploymentModeAuthority()
    authority.write("AUDIO-NODE")
    # Invalid env value is ignored; authority wins.
    assert resolve_deployment_mode(authority=authority) == "AUDIO-NODE"

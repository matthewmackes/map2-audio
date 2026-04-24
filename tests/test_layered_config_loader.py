"""T2431-D: LayeredConfigLoader precedence + forbidden-override enforcement."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest

from app.config_schema import AuthorityPlane, CONFIG_SCHEMA, StartupRequirement
from app.services.layered_config_loader import (
    LayeredConfigLoader,
    load_layered_config,
    user_plane_may_override,
    is_host_critical,
)


# Keys classified in T2431-B — host-critical Tier A locks.
HOST_CRITICAL_KEY = "audio.sample_rate"        # plane=HOST runtime_mutable=False
SECONDARY_HOST_CRITICAL_KEY = "audio.buffer_size"
SECONDARY_HOST_CRITICAL_BACKEND = "audio.backend"

# A legacy key we can freely mutate (no T2431-B classification yet).
LEGACY_WRITABLE_KEY = "app.log_level"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def _deep_get(cfg: dict, dotted: str):
    cur = cfg
    for part in dotted.split("."):
        cur = cur[part]
    return cur


# ---------------------------------------------------------------------------
# baseline / precedence
# ---------------------------------------------------------------------------

def test_schema_defaults_produce_a_complete_config(tmp_path: Path) -> None:
    loader = LayeredConfigLoader(
        host_config_dir=tmp_path / "host",
        service_config_dir=tmp_path / "svc",
        user_config_file=tmp_path / "user" / "config.json",
        env={},
    )
    result = loader.load()
    # Every schema key is represented.
    for key in CONFIG_SCHEMA:
        _deep_get(result.config, key)
    # Schema plane was the first contributor.
    assert result.contributions[0].plane == "schema"


def test_user_plane_overrides_schema_for_legacy_keys(tmp_path: Path) -> None:
    user_file = tmp_path / "user" / "config.json"
    write_json(user_file, {"app": {"log_level": "DEBUG"}})
    loader = LayeredConfigLoader(
        host_config_dir=tmp_path / "host",
        service_config_dir=tmp_path / "svc",
        user_config_file=user_file,
        env={},
    )
    result = loader.load()
    assert _deep_get(result.config, LEGACY_WRITABLE_KEY) == "DEBUG"


def test_env_plane_beats_file_planes(tmp_path: Path) -> None:
    user_file = tmp_path / "user" / "config.json"
    write_json(user_file, {"app": {"log_level": "DEBUG"}})
    result = LayeredConfigLoader(
        host_config_dir=tmp_path / "host",
        service_config_dir=tmp_path / "svc",
        user_config_file=user_file,
        env={"MAP2_LOG_LEVEL": "ERROR"},
    ).load()
    assert _deep_get(result.config, "app.log_level") == "ERROR"


def test_host_plane_beats_schema_for_host_keys(tmp_path: Path) -> None:
    host_dir = tmp_path / "host"
    write_json(host_dir / "10-audio.json", {"audio": {"sample_rate": 96000}})
    result = LayeredConfigLoader(
        host_config_dir=host_dir,
        service_config_dir=tmp_path / "svc",
        user_config_file=tmp_path / "user" / "config.json",
        env={},
    ).load()
    assert _deep_get(result.config, HOST_CRITICAL_KEY) == 96000


def test_host_plane_files_merge_in_lexical_order(tmp_path: Path) -> None:
    host_dir = tmp_path / "host"
    write_json(host_dir / "10-base.json", {"app": {"log_level": "INFO"}})
    write_json(host_dir / "20-override.json", {"app": {"log_level": "WARNING"}})
    result = LayeredConfigLoader(
        host_config_dir=host_dir,
        service_config_dir=tmp_path / "svc",
        user_config_file=tmp_path / "user" / "config.json",
        env={},
    ).load()
    assert _deep_get(result.config, "app.log_level") == "WARNING"


# ---------------------------------------------------------------------------
# forbidden overrides (the core T2431-D invariant)
# ---------------------------------------------------------------------------

def test_user_plane_cannot_override_host_critical_key(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    user_file = tmp_path / "user" / "config.json"
    write_json(user_file, {"audio": {"sample_rate": 44100}})
    with caplog.at_level(logging.WARNING):
        result = LayeredConfigLoader(
            host_config_dir=tmp_path / "host",
            service_config_dir=tmp_path / "svc",
            user_config_file=user_file,
            env={},
        ).load()
    # The user-plane override was dropped — schema default stands.
    assert _deep_get(result.config, HOST_CRITICAL_KEY) == 48000
    assert any(
        HOST_CRITICAL_KEY in record.getMessage() and "user" in record.getMessage()
        for record in caplog.records
    )
    user_contribution = next(c for c in result.contributions if c.plane == "user")
    assert HOST_CRITICAL_KEY in user_contribution.dropped_forbidden_keys


def test_user_plane_override_of_all_tier_a_keys_is_dropped(tmp_path: Path) -> None:
    user_file = tmp_path / "user" / "config.json"
    write_json(user_file, {
        "audio": {
            "sample_rate": 44100,
            "buffer_size": 512,
            "backend": "jack",
        },
    })
    result = LayeredConfigLoader(
        host_config_dir=tmp_path / "host",
        service_config_dir=tmp_path / "svc",
        user_config_file=user_file,
        env={},
    ).load()
    for key, expected_default in (
        (HOST_CRITICAL_KEY, 48000),
        (SECONDARY_HOST_CRITICAL_KEY, 64),
        (SECONDARY_HOST_CRITICAL_BACKEND, "pipewire"),
    ):
        assert _deep_get(result.config, key) == expected_default
    user_contribution = next(c for c in result.contributions if c.plane == "user")
    assert set(user_contribution.dropped_forbidden_keys) >= {
        HOST_CRITICAL_KEY,
        SECONDARY_HOST_CRITICAL_KEY,
        SECONDARY_HOST_CRITICAL_BACKEND,
    }


def test_service_plane_cannot_override_host_critical_keys(tmp_path: Path) -> None:
    svc_dir = tmp_path / "svc"
    write_json(svc_dir / "99-override.json", {"audio": {"sample_rate": 44100}})
    result = LayeredConfigLoader(
        host_config_dir=tmp_path / "host",
        service_config_dir=svc_dir,
        user_config_file=tmp_path / "user" / "config.json",
        env={},
    ).load()
    assert _deep_get(result.config, HOST_CRITICAL_KEY) == 48000


def test_host_plane_is_permitted_to_override_anything(tmp_path: Path) -> None:
    host_dir = tmp_path / "host"
    write_json(host_dir / "10-any.json", {
        "audio": {"sample_rate": 96000, "buffer_size": 128},
        "app": {"log_level": "WARNING"},
    })
    result = LayeredConfigLoader(
        host_config_dir=host_dir,
        service_config_dir=tmp_path / "svc",
        user_config_file=tmp_path / "user" / "config.json",
        env={},
    ).load()
    assert _deep_get(result.config, HOST_CRITICAL_KEY) == 96000
    assert _deep_get(result.config, SECONDARY_HOST_CRITICAL_KEY) == 128
    assert _deep_get(result.config, "app.log_level") == "WARNING"
    host_contribution = next(c for c in result.contributions if c.plane == "host")
    assert not host_contribution.dropped_forbidden_keys


# ---------------------------------------------------------------------------
# env-var declaration boundary
# ---------------------------------------------------------------------------

def test_undeclared_env_vars_are_ignored(tmp_path: Path) -> None:
    result = LayeredConfigLoader(
        host_config_dir=tmp_path / "host",
        service_config_dir=tmp_path / "svc",
        user_config_file=tmp_path / "user" / "config.json",
        env={"MAP2_SOMETHING_UNDECLARED": "42"},
    ).load()
    # Config is unchanged from schema defaults.
    assert "MAP2_SOMETHING_UNDECLARED" not in str(result.config)


# ---------------------------------------------------------------------------
# diagnostic helpers + predicates
# ---------------------------------------------------------------------------

def test_is_host_critical_matches_tier_a_locks() -> None:
    for key in (HOST_CRITICAL_KEY, SECONDARY_HOST_CRITICAL_KEY, SECONDARY_HOST_CRITICAL_BACKEND):
        assert is_host_critical(CONFIG_SCHEMA[key])


def test_user_plane_predicate_blocks_host_keys_allows_legacy() -> None:
    assert not user_plane_may_override(HOST_CRITICAL_KEY)
    assert user_plane_may_override(LEGACY_WRITABLE_KEY)


def test_summary_reports_every_plane(tmp_path: Path) -> None:
    host_dir = tmp_path / "host"
    user_file = tmp_path / "user" / "config.json"
    write_json(host_dir / "10-audio.json", {"audio": {"sample_rate": 96000}})
    write_json(user_file, {"app": {"log_level": "DEBUG"}})
    result = LayeredConfigLoader(
        host_config_dir=host_dir,
        service_config_dir=tmp_path / "svc",
        user_config_file=user_file,
        env={"MAP2_LOG_LEVEL": "ERROR"},
    ).load()
    planes = [c["plane"] for c in result.summary()["planes"]]
    assert "schema" in planes
    assert "host" in planes
    assert "user" in planes
    assert "env" in planes


# ---------------------------------------------------------------------------
# robustness
# ---------------------------------------------------------------------------

def test_broken_json_is_ignored_with_warning(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    host_dir = tmp_path / "host"
    host_dir.mkdir(parents=True)
    (host_dir / "bad.json").write_text("{ not json", encoding="utf-8")
    with caplog.at_level(logging.WARNING):
        result = LayeredConfigLoader(
            host_config_dir=host_dir,
            service_config_dir=tmp_path / "svc",
            user_config_file=tmp_path / "user" / "config.json",
            env={},
        ).load()
    # Config falls through to schema defaults.
    assert _deep_get(result.config, HOST_CRITICAL_KEY) == 48000
    assert any("unreadable" in r.getMessage() for r in caplog.records)


def test_non_dict_json_is_ignored(tmp_path: Path) -> None:
    host_dir = tmp_path / "host"
    host_dir.mkdir(parents=True)
    (host_dir / "weird.json").write_text("[1, 2, 3]", encoding="utf-8")
    result = LayeredConfigLoader(
        host_config_dir=host_dir,
        service_config_dir=tmp_path / "svc",
        user_config_file=tmp_path / "user" / "config.json",
        env={},
    ).load()
    assert _deep_get(result.config, HOST_CRITICAL_KEY) == 48000


def test_convenience_function_mirrors_class(tmp_path: Path) -> None:
    r1 = load_layered_config(
        host_config_dir=tmp_path / "host",
        service_config_dir=tmp_path / "svc",
        user_config_file=tmp_path / "user" / "config.json",
        env={},
    )
    r2 = LayeredConfigLoader(
        host_config_dir=tmp_path / "host",
        service_config_dir=tmp_path / "svc",
        user_config_file=tmp_path / "user" / "config.json",
        env={},
    ).load()
    assert r1.config == r2.config

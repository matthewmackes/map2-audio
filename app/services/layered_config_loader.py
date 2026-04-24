"""Layered configuration loader for MAP2 (T2431-D).

Replaces the old "one ~/.map2/config.json file owns everything" approach with
a precedence chain aligned with the Configuration Authority Model:

    schema defaults
      → host desired config        (/etc/map2/config.d/*.json, lexical order)
      → service projections        (/var/lib/map2/config.d/*.json)
      → user preferences           (~/.map2/config.json)
      → declared environment vars  (MAP2_*)

Rules (enforced by this loader, not by policy documents):

1. Host-critical keys (``plane=HOST`` AND ``runtime_mutable=False``) cannot
   be overridden by user-plane files. The loader will drop the override and
   emit a warning so operators discover the attempted override during boot.
2. User-plane files cannot override keys whose declared plane is HOST or
   SERVICE. A user-plane override of a host key is treated as drift and
   dropped the same way.
3. Only env vars declared in the schema (``ConfigOption.env_var``) are
   respected. Undeclared MAP2_* vars are ignored by this loader — they may
   still be read directly by services, but they do not mutate the config
   dict.
4. Unknown keys that appear in files (without a schema entry) are preserved
   for backwards compatibility but never participate in the plane-override
   guard.

The loader is a pure function of its inputs: given the same files + env,
it always produces the same layered config. ``ConfigManager`` consumes it
to replace the scattered load/merge logic while preserving the public API.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from app.config_schema import (
    AuthorityPlane,
    CONFIG_SCHEMA,
    ConfigOption,
)

logger = logging.getLogger(__name__)


HOST_CONFIG_DIR_NAME = "config.d"
SERVICE_CONFIG_DIR_NAME = "config.d"
USER_CONFIG_FILE_NAME = "config.json"


# ---------------------------------------------------------------------------
# Plane contribution record — transparency for diagnostics
# ---------------------------------------------------------------------------

@dataclass
class PlaneContribution:
    """One layer's contribution to the final config."""

    plane: str
    source: str  # human-readable path or "<schema>" / "<env>"
    keys: List[str] = field(default_factory=list)
    dropped_forbidden_keys: List[str] = field(default_factory=list)


@dataclass
class LayeredLoadResult:
    """Result of a layered load — final config + per-plane contributions."""

    config: Dict[str, Any]
    contributions: List[PlaneContribution]

    def summary(self) -> Dict[str, Any]:
        """Return a JSON-friendly summary of which plane set which keys."""
        return {
            "planes": [
                {
                    "plane": c.plane,
                    "source": c.source,
                    "set_keys": sorted(c.keys),
                    "dropped_forbidden_keys": sorted(c.dropped_forbidden_keys),
                }
                for c in self.contributions
            ],
        }


# ---------------------------------------------------------------------------
# Helpers — nested dict access + schema lookups
# ---------------------------------------------------------------------------

def _flatten_dotted(source: Dict[str, Any], prefix: str = "") -> Dict[str, Any]:
    """Flatten a nested dict into ``{"a.b.c": value}`` form."""
    flat: Dict[str, Any] = {}
    for key, value in source.items():
        full = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            flat.update(_flatten_dotted(value, full))
        else:
            flat[full] = value
    return flat


def _set_nested(target: Dict[str, Any], dotted_key: str, value: Any) -> None:
    keys = dotted_key.split(".")
    cursor = target
    for k in keys[:-1]:
        if k not in cursor or not isinstance(cursor[k], dict):
            cursor[k] = {}
        cursor = cursor[k]
    cursor[keys[-1]] = value


def _schema_for(dotted_key: str) -> Optional[ConfigOption]:
    return CONFIG_SCHEMA.get(dotted_key)


def is_host_critical(option: ConfigOption) -> bool:
    """Host-plane + not runtime-mutable ⇒ host-critical (Tier A)."""
    return option.plane is AuthorityPlane.HOST and not option.runtime_mutable


def user_plane_may_override(dotted_key: str) -> bool:
    """Whether the user plane is allowed to set this key.

    User plane owns ``USER`` and ``LEGACY`` entries (legacy keys stay
    writable until reclassified in T2431-C/D follow-ups). HOST / SERVICE /
    RUNTIME keys are out of bounds for user-plane overrides — silently
    dropping them with a warning enforces the authority model.
    """
    option = _schema_for(dotted_key)
    if option is None:
        return True  # Unknown keys — keep backwards compat.
    return option.plane in (AuthorityPlane.USER, AuthorityPlane.LEGACY)


# ---------------------------------------------------------------------------
# Layered loader
# ---------------------------------------------------------------------------

class LayeredConfigLoader:
    """Loads MAP2 configuration from the four-plane layered sources.

    Construction parameters exist to make testing deterministic — in
    production, defaults resolve through ``Map2Paths`` so a single env
    override retargets the whole tree.
    """

    def __init__(
        self,
        *,
        host_config_dir: Optional[Path] = None,
        service_config_dir: Optional[Path] = None,
        user_config_file: Optional[Path] = None,
        env: Optional[Dict[str, str]] = None,
    ) -> None:
        # Defer Map2Paths import to avoid a circular dependency with
        # ``app.paths`` (which consumes ``app.config``).
        from app.paths import Map2Paths

        self._host_config_dir = host_config_dir or Map2Paths.host_file(HOST_CONFIG_DIR_NAME)
        self._service_config_dir = service_config_dir or Map2Paths.service_file(SERVICE_CONFIG_DIR_NAME)
        self._user_config_file = user_config_file or Map2Paths.user_file(USER_CONFIG_FILE_NAME)
        self._env = dict(env) if env is not None else dict(os.environ)

    # -- public entrypoint --------------------------------------------------

    def load(self) -> LayeredLoadResult:
        """Compute the layered config in plane order."""
        contributions: List[PlaneContribution] = []

        config = self._apply_schema_defaults(contributions)
        self._apply_host_plane(config, contributions)
        self._apply_service_plane(config, contributions)
        self._apply_user_plane(config, contributions)
        self._apply_env_plane(config, contributions)

        return LayeredLoadResult(config=config, contributions=contributions)

    # -- per-plane appliers -------------------------------------------------

    def _apply_schema_defaults(self, contributions: List[PlaneContribution]) -> Dict[str, Any]:
        config: Dict[str, Any] = {}
        keys: List[str] = []
        for key, option in CONFIG_SCHEMA.items():
            _set_nested(config, key, option.default)
            keys.append(key)
        contributions.append(PlaneContribution(plane="schema", source="<schema>", keys=keys))
        return config

    def _apply_host_plane(
        self, config: Dict[str, Any], contributions: List[PlaneContribution]
    ) -> None:
        for path in self._list_json_files(self._host_config_dir):
            self._merge_file(
                config=config,
                path=path,
                contributions=contributions,
                plane_name="host",
                allow_key=lambda key: True,  # host plane may set anything
            )

    def _apply_service_plane(
        self, config: Dict[str, Any], contributions: List[PlaneContribution]
    ) -> None:
        for path in self._list_json_files(self._service_config_dir):
            self._merge_file(
                config=config,
                path=path,
                contributions=contributions,
                plane_name="service",
                allow_key=self._service_plane_allows,
            )

    def _apply_user_plane(
        self, config: Dict[str, Any], contributions: List[PlaneContribution]
    ) -> None:
        if not self._user_config_file.exists():
            return
        self._merge_file(
            config=config,
            path=self._user_config_file,
            contributions=contributions,
            plane_name="user",
            allow_key=user_plane_may_override,
        )

    def _apply_env_plane(
        self, config: Dict[str, Any], contributions: List[PlaneContribution]
    ) -> None:
        set_keys: List[str] = []
        for key, option in CONFIG_SCHEMA.items():
            if not option.env_var:
                continue
            raw = self._env.get(option.env_var)
            if raw is None:
                continue
            _set_nested(config, key, raw)
            set_keys.append(key)
        if set_keys:
            contributions.append(PlaneContribution(plane="env", source="<env>", keys=set_keys))

    # -- plane-specific allow predicates -----------------------------------

    @staticmethod
    def _service_plane_allows(dotted_key: str) -> bool:
        """Service plane may set SERVICE-plane keys or LEGACY/USER but not
        host-critical keys. This keeps service-managed projections from
        stomping on host policy like Tier A locks."""
        option = _schema_for(dotted_key)
        if option is None:
            return True
        if is_host_critical(option):
            return False
        return option.plane in (
            AuthorityPlane.SERVICE,
            AuthorityPlane.USER,
            AuthorityPlane.LEGACY,
        )

    # -- file helpers -------------------------------------------------------

    @staticmethod
    def _list_json_files(directory: Path) -> List[Path]:
        if not directory.exists() or not directory.is_dir():
            return []
        try:
            return sorted(p for p in directory.glob("*.json") if p.is_file())
        except OSError as exc:
            logger.warning("Cannot list %s: %s", directory, exc)
            return []

    def _merge_file(
        self,
        *,
        config: Dict[str, Any],
        path: Path,
        contributions: List[PlaneContribution],
        plane_name: str,
        allow_key: Callable[[str], bool],
    ) -> None:
        try:
            with path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Config %s is unreadable: %s", path, exc)
            return
        if not isinstance(data, dict):
            logger.warning("Config %s is not a JSON object; ignoring", path)
            return

        flat = _flatten_dotted(data)
        applied: List[str] = []
        dropped: List[str] = []

        for dotted_key, value in flat.items():
            if allow_key(dotted_key):
                _set_nested(config, dotted_key, value)
                applied.append(dotted_key)
            else:
                dropped.append(dotted_key)
                option = _schema_for(dotted_key)
                plane_label = option.plane.value if option else "?"
                logger.warning(
                    "Layered config: dropping %s override of %r from %s "
                    "(key declared plane=%s); see Configuration Authority Model.",
                    plane_name,
                    dotted_key,
                    path,
                    plane_label,
                )

        if applied or dropped:
            contributions.append(
                PlaneContribution(
                    plane=plane_name,
                    source=str(path),
                    keys=applied,
                    dropped_forbidden_keys=dropped,
                )
            )


def load_layered_config(
    **kwargs: Any,
) -> LayeredLoadResult:
    """Convenience function mirroring ``LayeredConfigLoader(...).load()``."""
    return LayeredConfigLoader(**kwargs).load()

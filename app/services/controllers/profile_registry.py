"""ProfileRegistry — walks ``device-packs/`` at backend startup.

T2459-A3 Phase A foundation. The registry's contract:

1. On :meth:`load_packs`, walk ``device-packs/<vendor>/`` (skipping
   underscore-prefixed framework dirs) and parse every ``pack.yaml`` +
   profile YAML against the JSON Schemas in ``device-packs/_schema/``.
2. Broken packs are **logged and skipped**, never raised. A single
   malformed pack must not block backend boot. This is a hard
   requirement (CLAUDE.md gotcha; matches AVB Install Defaults Drift).
3. Successfully-loaded packs are surfaced via :meth:`packs`,
   :meth:`profiles`, and :meth:`resolve_for_hardware_id`.
4. The registry is read-only after ``load_packs``; mutation goes through
   the operator GUI, which writes YAML and triggers
   :meth:`reload_pack`.

The Mixxx imports under ``device-packs/_mixx-imports/`` are NOT loaded
by this registry — they live in a separate Mixxx-format reader landing
in T2459-B3 (``juce-engine/Source/ControllerHost/MixxxXmlReader.cpp``)
plus the Python-side bridge in ``mixxx_control_object_bridge.py``.

Architecture: ``docs/architecture/CONTROLLER_LAYER.md`` §4.
Worklist: ``T2459-A3``.
"""

from __future__ import annotations

import dataclasses
import logging
import re
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class PackLoadError(Exception):
    """Raised internally when a pack fails to load. Caught and logged
    by :meth:`ProfileRegistry.load_packs` — never propagates to startup.
    """


@dataclasses.dataclass(frozen=True)
class DeviceProfile:
    """A single audio/MIDI/HID profile loaded from a pack."""

    pack_id: str
    model: str
    kind: str  # "audio" | "midi" | "hid"
    path: Path
    document: dict[str, Any]

    @property
    def hardware_id(self) -> str | None:
        """Canonical hardware identifier from the profile, if any.

        For audio profiles this is ``identity.hardware_id`` (e.g.,
        ``usb:0582:00ed`` for the UA-1000). For MIDI profiles, may be
        ``alsa-seq:UA-1000 MIDI:0``. May be absent on HID profiles
        (those identify by VID/PID at the report level).
        """
        identity = self.document.get("identity", {}) or {}
        hwid = identity.get("hardware_id")
        return hwid if isinstance(hwid, str) else None

    @property
    def alsa_card_regex(self) -> re.Pattern[str] | None:
        """Compiled ALSA-card-name regex from the audio profile."""
        if self.kind != "audio":
            return None
        identity = self.document.get("identity", {}) or {}
        pattern = identity.get("alsa_card_regex")
        if not isinstance(pattern, str):
            return None
        try:
            return re.compile(pattern)
        except re.error as exc:
            logger.warning(
                "Profile %s has invalid alsa_card_regex %r: %s",
                self.path, pattern, exc,
            )
            return None

    @property
    def alsa_client_pattern(self) -> str | None:
        """ALSA-seq client name pattern from the MIDI profile."""
        if self.kind != "midi":
            return None
        identity = self.document.get("identity", {}) or {}
        pat = identity.get("alsa_client_pattern")
        return pat if isinstance(pat, str) else None


@dataclasses.dataclass(frozen=True)
class DevicePack:
    """A loaded vendor pack with its manifest and profiles."""

    pack_id: str
    path: Path
    manifest: dict[str, Any]
    profiles: tuple[DeviceProfile, ...]
    degraded_files: tuple[Path, ...] = ()

    @property
    def vendor_name(self) -> str:
        return (self.manifest.get("vendor", {}) or {}).get("name", self.pack_id)

    @property
    def models(self) -> tuple[str, ...]:
        models = self.manifest.get("models", []) or []
        return tuple(str(m) for m in models)

    @property
    def is_degraded(self) -> bool:
        return bool(self.degraded_files)


class ProfileRegistry:
    """Loads + holds every shipped device pack.

    Idempotent: calling :meth:`load_packs` twice produces the same
    in-memory state. Designed to live for the lifetime of the
    ``map2-backend.service`` process.
    """

    DEFAULT_PACKS_ROOT = Path(__file__).resolve().parents[3] / "device-packs"

    def __init__(self, packs_root: Path | None = None) -> None:
        self._packs_root = Path(packs_root or self.DEFAULT_PACKS_ROOT)
        self._packs: dict[str, DevicePack] = {}
        self._schemas: dict[str, dict[str, Any]] | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def load_packs(self) -> None:
        """Walk ``device-packs/`` and load every pack into memory.

        Broken packs are logged and skipped; the process continues. Per
        CLAUDE.md gotcha, a broken pack must NEVER block backend boot.
        """
        self._packs.clear()

        if not self._packs_root.is_dir():
            logger.warning(
                "ProfileRegistry: device-packs root %s does not exist; "
                "no packs loaded.", self._packs_root,
            )
            return

        try:
            self._schemas = self._load_schemas()
        except Exception as exc:  # pragma: no cover — defensive
            logger.error(
                "ProfileRegistry: failed to load schemas from %s: %s. "
                "No packs will be validated.", self._packs_root / "_schema", exc,
            )
            self._schemas = {}

        for pack_dir in self._iter_pack_dirs():
            try:
                pack = self._load_pack(pack_dir)
            except Exception as exc:  # noqa: BLE001 — defensive boot
                logger.error(
                    "ProfileRegistry: pack %s failed to load: %s. "
                    "Skipping; backend boot continues.",
                    pack_dir.name, exc,
                )
                continue
            self._packs[pack.pack_id] = pack
            logger.info(
                "ProfileRegistry: loaded pack %s (%d profiles%s)",
                pack.pack_id,
                len(pack.profiles),
                ", DEGRADED" if pack.is_degraded else "",
            )

    def packs(self) -> tuple[DevicePack, ...]:
        return tuple(self._packs.values())

    def get_pack(self, pack_id: str) -> DevicePack | None:
        return self._packs.get(pack_id)

    def profiles(self, kind: str | None = None) -> tuple[DeviceProfile, ...]:
        out: list[DeviceProfile] = []
        for pack in self._packs.values():
            for profile in pack.profiles:
                if kind is None or profile.kind == kind:
                    out.append(profile)
        return tuple(out)

    def resolve_for_hardware_id(self, hardware_id: str) -> tuple[DeviceProfile, ...]:
        """Return every profile whose ``identity.hardware_id`` matches."""
        return tuple(p for p in self.profiles() if p.hardware_id == hardware_id)

    def resolve_for_alsa_card(self, card_name: str) -> tuple[DeviceProfile, ...]:
        """Return every audio profile whose ``alsa_card_regex`` matches."""
        out: list[DeviceProfile] = []
        for p in self.profiles(kind="audio"):
            rx = p.alsa_card_regex
            if rx is not None and rx.search(card_name):
                out.append(p)
        return tuple(out)

    def resolve_for_alsa_client(self, client_name: str) -> tuple[DeviceProfile, ...]:
        """Return every MIDI profile whose ``alsa_client_pattern`` is a
        substring of ``client_name``.
        """
        out: list[DeviceProfile] = []
        for p in self.profiles(kind="midi"):
            pat = p.alsa_client_pattern
            if pat and pat in client_name:
                out.append(p)
        return tuple(out)

    def reload_pack(self, pack_id: str) -> bool:
        """Re-read a single pack from disk. Returns True on success.

        Triggered by the GUI after an operator edits a pack file.
        """
        pack_dir = self._packs_root / pack_id
        if not pack_dir.is_dir():
            logger.warning("ProfileRegistry.reload_pack: %s not found", pack_id)
            return False
        try:
            pack = self._load_pack(pack_dir)
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "ProfileRegistry.reload_pack: %s failed: %s. "
                "Keeping previous loaded state.", pack_id, exc,
            )
            return False
        self._packs[pack.pack_id] = pack
        logger.info("ProfileRegistry: reloaded pack %s", pack.pack_id)
        return True

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _iter_pack_dirs(self) -> Iterator[Path]:
        """Yield every directory that holds a real pack manifest.

        Real vendor packs live at ``device-packs/<vendor>/``.
        Underscore-prefixed siblings (``_runtime``, ``_schema``,
        ``_mixx-imports``, ``_tests``) are framework directories.
        The ``_tests/fixture-pack`` is yielded explicitly so the
        validation suite can exercise the loader without relying on a
        real vendor pack being present.
        """
        for child in sorted(self._packs_root.iterdir()):
            if not child.is_dir():
                continue
            if child.name.startswith("_"):
                continue
            yield child
        fixture_pack = self._packs_root / "_tests" / "fixture-pack"
        if fixture_pack.is_dir():
            yield fixture_pack

    def _load_schemas(self) -> dict[str, dict[str, Any]]:
        import yaml
        schema_root = self._packs_root / "_schema"
        return {
            "pack": yaml.safe_load((schema_root / "pack.schema.yaml").read_text()),
            "audio": yaml.safe_load((schema_root / "audio-profile.schema.yaml").read_text()),
            "midi": yaml.safe_load((schema_root / "midi-profile.schema.yaml").read_text()),
            "hid": yaml.safe_load((schema_root / "hid-profile.schema.yaml").read_text()),
        }

    def _load_pack(self, pack_dir: Path) -> DevicePack:
        """Load one pack. Raises :class:`PackLoadError` on manifest
        failure; per-profile failures are tracked in
        :attr:`DevicePack.degraded_files` rather than raising — the pack
        is still usable, just with the broken profiles skipped.
        """
        import jsonschema
        import yaml

        manifest_path = pack_dir / "pack.yaml"
        if not manifest_path.exists():
            raise PackLoadError(f"missing pack.yaml in {pack_dir}")

        try:
            manifest = yaml.safe_load(manifest_path.read_text())
        except yaml.YAMLError as exc:
            raise PackLoadError(f"{manifest_path}: invalid YAML: {exc}") from exc

        if self._schemas:
            try:
                jsonschema.validate(manifest, self._schemas["pack"])
            except jsonschema.ValidationError as exc:
                raise PackLoadError(
                    f"{manifest_path}: schema validation failed: {exc.message}"
                ) from exc

        pack_id = manifest.get("pack_id") or pack_dir.name

        profiles: list[DeviceProfile] = []
        degraded: list[Path] = []
        profiles_dir = pack_dir / "profiles"
        if profiles_dir.is_dir():
            for profile_path in sorted(profiles_dir.glob("*.yaml")):
                kind = self._classify_profile_filename(profile_path.name)
                if kind is None:
                    logger.warning(
                        "ProfileRegistry: %s has unrecognised filename "
                        "(expected <model>.{audio,midi,hid}.yaml); skipping",
                        profile_path,
                    )
                    degraded.append(profile_path)
                    continue
                try:
                    document = yaml.safe_load(profile_path.read_text())
                    if self._schemas:
                        jsonschema.validate(document, self._schemas[kind])
                except (yaml.YAMLError, jsonschema.ValidationError) as exc:
                    logger.warning(
                        "ProfileRegistry: profile %s failed validation: %s. "
                        "Skipping this profile; pack remains usable.",
                        profile_path, exc,
                    )
                    degraded.append(profile_path)
                    continue
                model = self._extract_model_from_filename(profile_path.name, kind)
                profiles.append(
                    DeviceProfile(
                        pack_id=pack_id,
                        model=model,
                        kind=kind,
                        path=profile_path,
                        document=document,
                    )
                )

        return DevicePack(
            pack_id=pack_id,
            path=pack_dir,
            manifest=manifest,
            profiles=tuple(profiles),
            degraded_files=tuple(degraded),
        )

    @staticmethod
    def _classify_profile_filename(name: str) -> str | None:
        # <model>.audio.yaml, <model>.midi.yaml, <model>.hid.yaml
        for kind in ("audio", "midi", "hid"):
            suffix = f".{kind}.yaml"
            if name.endswith(suffix):
                return kind
        return None

    @staticmethod
    def _extract_model_from_filename(name: str, kind: str) -> str:
        suffix = f".{kind}.yaml"
        return name[: -len(suffix)]


# ---------------------------------------------------------------------------
# Module-level singleton helper for app.main lifespan integration.
# ---------------------------------------------------------------------------

_registry_singleton: ProfileRegistry | None = None


def get_profile_registry() -> ProfileRegistry:
    """Return the process-wide :class:`ProfileRegistry`.

    The singleton is allocated lazily but :meth:`load_packs` must be
    called explicitly during backend startup; this function does NOT
    auto-load (so tests can construct + load with a custom packs root).
    """
    global _registry_singleton
    if _registry_singleton is None:
        _registry_singleton = ProfileRegistry()
    return _registry_singleton


def reset_profile_registry_for_tests() -> None:
    """Clear the module-level singleton. Test-only."""
    global _registry_singleton
    _registry_singleton = None

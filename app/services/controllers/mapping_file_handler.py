"""MAP2-native YAML mapping file handler.

Consumes ``device-packs/<vendor>/profiles/<model>.midi.yaml`` and
``<model>.hid.yaml`` files, returns an in-memory
:class:`MappingDescriptor` that the rest of the controller subsystem
treats as authoritative.

The Mixxx XML reader producing the same :class:`MappingDescriptor`
shape lives in C++ in
``juce-engine/Source/ControllerHost/MixxxXmlReader.{h,cpp}`` and lands
in T2459-B3.

Worklist: ``T2459-A3``.
"""

from __future__ import annotations

import dataclasses
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class MappingLoadError(Exception):
    """Raised when a mapping file cannot be parsed into a usable descriptor."""


@dataclasses.dataclass(frozen=True)
class MappingControl:
    """One row from the MIDI/HID profile's ``controls`` (MIDI) or
    ``reports[*].controls`` (HID) array.
    """

    status: int | None
    midino: int | None
    channel: int | None
    target: str | None
    action: str | None
    script: str | None
    fast_path: bool
    description: str
    extra: dict[str, Any] = dataclasses.field(default_factory=dict)


@dataclasses.dataclass(frozen=True)
class MappingDescriptor:
    """In-memory representation of a loaded mapping.

    The controller subsystem consumes this for both native YAML packs
    and Mixxx-imported XML mappings; both readers produce the same
    shape (the bridge layer translates Mixxx ControlObject names into
    MAP2 engine targets at construction time).
    """

    pack_id: str
    model: str
    kind: str  # "midi" | "hid"
    source_path: Path
    scripts: tuple[str, ...]
    controls: tuple[MappingControl, ...]
    outputs: tuple[MappingControl, ...]
    settings: tuple[dict[str, Any], ...]
    mixxx_alias_table: dict[str, str]


class MappingFileHandler:
    """Reads MAP2-native YAML mapping files into
    :class:`MappingDescriptor` instances.
    """

    def load_midi(
        self,
        path: Path,
        pack_id: str,
        document: dict[str, Any] | None = None,
    ) -> MappingDescriptor:
        """Load a ``<model>.midi.yaml`` file.

        ``document`` is accepted as an override so the
        :class:`ProfileRegistry` can pass the already-validated parse
        without re-reading from disk.
        """
        if document is None:
            document = self._read_yaml(path)

        identity = document.get("identity", {}) or {}
        model = identity.get("model") or path.stem.split(".")[0]

        scripts = tuple(str(s) for s in (document.get("scripts") or []))
        controls = tuple(
            self._parse_midi_control(row) for row in (document.get("controls") or [])
        )
        # Outputs use `source` (engine path that drives the LED) instead of
        # `target` (engine path the control writes to). Normalise so the
        # shared MappingControl shape works for both.
        outputs = tuple(
            self._parse_midi_output(row) for row in (document.get("outputs") or [])
        )
        settings = tuple(dict(s) for s in (document.get("settings") or []))
        alias_table = dict(document.get("mixxx_alias_table") or {})

        return MappingDescriptor(
            pack_id=pack_id,
            model=model,
            kind="midi",
            source_path=path,
            scripts=scripts,
            controls=controls,
            outputs=outputs,
            settings=settings,
            mixxx_alias_table=alias_table,
        )

    def load_hid(
        self,
        path: Path,
        pack_id: str,
        document: dict[str, Any] | None = None,
    ) -> MappingDescriptor:
        """Load a ``<model>.hid.yaml`` file."""
        if document is None:
            document = self._read_yaml(path)

        identity = document.get("identity", {}) or {}
        model = identity.get("model") or path.stem.split(".")[0]

        scripts = tuple(str(s) for s in (document.get("scripts") or []))

        controls: list[MappingControl] = []
        for report in document.get("reports") or []:
            for row in report.get("controls") or []:
                controls.append(self._parse_hid_control(row))

        return MappingDescriptor(
            pack_id=pack_id,
            model=model,
            kind="hid",
            source_path=path,
            scripts=scripts,
            controls=tuple(controls),
            outputs=tuple(),
            settings=tuple(),
            mixxx_alias_table={},
        )

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @staticmethod
    def _read_yaml(path: Path) -> dict[str, Any]:
        import yaml
        try:
            return yaml.safe_load(path.read_text())
        except yaml.YAMLError as exc:
            raise MappingLoadError(f"{path}: invalid YAML: {exc}") from exc

    @staticmethod
    def _parse_midi_control(row: dict[str, Any]) -> MappingControl:
        return MappingControl(
            status=row.get("status"),
            midino=row.get("midino"),
            channel=row.get("channel"),
            target=row.get("target"),
            action=row.get("action"),
            script=row.get("script"),
            fast_path=bool(row.get("fast_path", False)),
            description=str(row.get("description", "")),
            extra={
                k: v
                for k, v in row.items()
                if k not in {"status", "midino", "channel", "target", "action",
                              "script", "fast_path", "description"}
            },
        )

    @staticmethod
    def _parse_midi_output(row: dict[str, Any]) -> MappingControl:
        """Output rows use `source` (engine path that drives the LED)
        rather than `target`. Normalise to MappingControl.target so the
        shared shape works for outputs and inputs symmetrically.
        """
        return MappingControl(
            status=row.get("status"),
            midino=row.get("midino"),
            channel=row.get("channel"),
            target=row.get("source") or row.get("target"),
            action=row.get("action") or "led_feedback",
            script=row.get("script"),
            fast_path=False,
            description=str(row.get("description", "")),
            extra={
                k: v
                for k, v in row.items()
                if k not in {"status", "midino", "channel", "source", "target",
                              "action", "script", "description"}
            },
        )

    @staticmethod
    def _parse_hid_control(row: dict[str, Any]) -> MappingControl:
        return MappingControl(
            status=None,
            midino=None,
            channel=None,
            target=row.get("target"),
            action=row.get("action"),
            script=row.get("script"),
            fast_path=bool(row.get("fast_path", False)),
            description=str(row.get("description", "")),
            extra={
                "id": row.get("id"),
                "offset": row.get("offset"),
                "size_bits": row.get("size_bits"),
                "kind": row.get("kind"),
                "signed": row.get("signed", False),
                "min": row.get("min"),
                "max": row.get("max"),
            },
        )

"""Device-pack consumer projection (T2482-P2.5 parts 1 + 2).

Models per-device-pack DEFAULT bindings — the factory-supplied
mappings that ship with a device-pack and apply unless an operator
overrides them per-snapshot or per-instance.

The consumer_type is "device_pack" because the bindings are owned by
the device-pack profile (e.g., "native-instruments/maschine-mk1.midi"),
not by any specific snapshot or session.

consumer_id format:
  - "<profile_key>" — the device-pack profile_key from the registry,
    same shape that Hardware Store uses (e.g.,
    "native-instruments/maschine-mk1.midi").

Today these defaults live as YAML inside each device-pack profile
(e.g., `device-packs/native-instruments/profiles/maschine-mk1.midi.yaml`).

Part 1 (`make_create_payload`, `replace_device_pack_defaults`) is the
typed projection adapter.

Part 2 (`yaml_control_to_payload`, `payloads_for_profile`,
`project_all_packs`) walks the on-disk YAML and rebuilds the canonical
device-pack rows. It is invoked from the FastAPI lifespan after the
ControllerService loads packs, and is safe to re-run on every boot:
each pack's defaults are replaced atomically, so YAML edits propagate
on the next restart with no orphan rows.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable, Optional

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.schemas import (
    BindingSourceType,
    BindingTargetType,
    MidiBindingCreate,
    MidiBindingRead,
)

logger = logging.getLogger(__name__)


def make_consumer_id(profile_key: str) -> str:
    """Compose the canonical consumer_id for a device-pack default."""
    profile_key = profile_key.strip()
    if not profile_key:
        raise ValueError("device-pack profile_key must be non-empty")
    return profile_key


def make_create_payload(
    *,
    profile_key: str,
    binding_label: str,
    source_type: BindingSourceType,
    source_descriptor: dict[str, Any],
    target_type: BindingTargetType,
    target_descriptor: dict[str, Any],
    channel: Optional[int] = None,
    cc: Optional[int] = None,
    note: Optional[int] = None,
    extras: Optional[dict[str, Any]] = None,
    pack_version: Optional[str] = None,
    created_by: str = "device-pack-projection",
    source: str = "pack-yaml",
) -> MidiBindingCreate:
    """Build a MidiBindingCreate for a device-pack default.

    Convenience: if `source_descriptor` is empty and channel/cc/note are
    set, populates a default source_descriptor.

    Pack-level defaults are global-scope (they apply across all
    snapshots). Operators override per-snapshot via plugin_param or
    snapshot bindings.

    Args:
      profile_key: device-pack identifier (e.g.,
        "native-instruments/maschine-mk1.midi").
      binding_label: human-readable label (e.g., "Pad 1 → ch10 note 36").
      source_descriptor / target_descriptor: shapes per the
        source_type / target_type contracts.
      pack_version: optional version stamp from the pack manifest;
        recorded in metadata.pack_version for diff/audit.
    """
    consumer_id = make_consumer_id(profile_key)

    descriptor = dict(source_descriptor)
    if channel is not None and "channel" not in descriptor:
        descriptor["channel"] = int(channel)
    if cc is not None and source_type == "midi_cc" and "cc" not in descriptor:
        descriptor["cc"] = int(cc)
    if note is not None and source_type == "midi_note" and "note" not in descriptor:
        descriptor["note"] = int(note)

    metadata: dict[str, Any] = {}
    if pack_version is not None:
        metadata["pack_version"] = pack_version
    if extras:
        metadata["extra"] = dict(extras)

    return MidiBindingCreate(
        consumer_type="device_pack",
        consumer_id=consumer_id,
        consumer_label=binding_label,
        source_type=source_type,
        source_descriptor=descriptor,
        target_type=target_type,
        target_descriptor=dict(target_descriptor),
        device_id=None,
        scope="global",
        scope_id=None,
        enabled=True,
        created_by=created_by,
        source=source,
        metadata=metadata,
    )


async def list_device_pack_defaults(
    authority: MidiBindingAuthority,
    profile_key: str,
) -> list[MidiBindingRead]:
    """All default bindings shipped by a single device-pack."""
    return await authority.list_for_consumer(
        "device_pack", make_consumer_id(profile_key), enabled_only=False
    )


async def list_all_device_pack_defaults(
    authority: MidiBindingAuthority,
) -> list[MidiBindingRead]:
    """Every device-pack default binding across every pack."""
    in_scope = await authority.list_in_scope("global", None, enabled_only=False)
    return [b for b in in_scope if b.consumer_type == "device_pack"]


async def replace_device_pack_defaults(
    authority: MidiBindingAuthority,
    profile_key: str,
    payloads: Iterable[MidiBindingCreate],
) -> list[MidiBindingRead]:
    """Replace every default binding for a device-pack with the given
    set. Used by the pack-load step to refresh defaults when a pack
    version bumps."""
    consumer_id = make_consumer_id(profile_key)
    await authority.delete_for_consumer("device_pack", consumer_id)
    created = await authority.create_many(payloads)
    return created


# ---------------------------------------------------------------------------
# Part 2 — YAML → MidiBindingCreate converter + on-disk projection walker.
#
# Profile YAML schema (see device-packs/_schema/midi-profile.schema.yaml):
#   controls:
#     - status: 0x90 | 0xB0 | 0xC0 | ...
#       midino: <int>            # note or CC number; absent for PC
#       target: <engine target>  # optional — script-only entries omit
#       action: <set|toggle|momentary|send_pc|...>
#       script: <script.symbol>  # optional — JS handler
#       fast_path: true|false
#       description: <str>
# ---------------------------------------------------------------------------

# MIDI status-byte high nibble → BindingSourceType.
_STATUS_TO_SOURCE: dict[int, BindingSourceType] = {
    0x80: "midi_note",            # Note off — same descriptor as note-on
    0x90: "midi_note",            # Note on
    0xA0: "midi_aftertouch",      # Polyphonic aftertouch
    0xB0: "midi_cc",              # Control change
    0xC0: "midi_pc",              # Program change
    0xD0: "midi_channel_pressure",
    0xE0: "midi_pitchbend",
}


def _coerce_status_byte(raw: Any) -> Optional[int]:
    """Accept ``0x90``, ``"0x90"``, or 144. Returns the int byte or None."""
    if isinstance(raw, int):
        return raw & 0xFF
    if isinstance(raw, str):
        try:
            return int(raw, 0) & 0xFF
        except ValueError:
            return None
    return None


def yaml_control_to_payload(
    *,
    profile_key: str,
    control: dict[str, Any],
    pack_version: Optional[str] = None,
) -> Optional[MidiBindingCreate]:
    """Convert one ``controls:`` YAML entry into a MidiBindingCreate.

    Returns None if the entry has no usable ``status`` byte (in which
    case it can't drive a MIDI binding). All other malformed fields are
    tolerated — the row still counts toward the device-pack's binding
    total, which is what the index page surfaces.
    """
    status = _coerce_status_byte(control.get("status"))
    if status is None:
        return None

    high_nibble = status & 0xF0
    channel = status & 0x0F
    source_type = _STATUS_TO_SOURCE.get(high_nibble)
    if source_type is None:
        return None

    source_descriptor: dict[str, Any] = {"channel": channel}
    midino = control.get("midino")
    if isinstance(midino, int):
        if source_type == "midi_note":
            source_descriptor["note"] = midino
        elif source_type == "midi_cc":
            source_descriptor["cc"] = midino
        elif source_type == "midi_aftertouch":
            source_descriptor["note"] = midino
        # midi_pc / midi_pitchbend / midi_channel_pressure don't take midino.

    # Build the target. The dispatcher consumes engine_command frames; a
    # YAML control either declares an explicit `target` (the canonical
    # path) or runs through a `script` symbol (the JS slow path). We
    # model both as engine_command so the binding row carries the
    # full dispatch hint; downstream code can branch on `kind`.
    target_descriptor: dict[str, Any] = {}
    if "target" in control and control["target"]:
        target_descriptor["kind"] = "engine_target"
        target_descriptor["target"] = str(control["target"])
    elif "script" in control and control["script"]:
        target_descriptor["kind"] = "script"
        target_descriptor["script"] = str(control["script"])
    else:
        target_descriptor["kind"] = "unbound"

    if "action" in control and control["action"]:
        target_descriptor["action"] = str(control["action"])
    if control.get("fast_path") is True:
        target_descriptor["fast_path"] = True

    label = str(
        control.get("description")
        or control.get("script")
        or control.get("target")
        or f"status=0x{status:02X} midino={midino}"
    ).strip()

    extras: dict[str, Any] = {}
    if "fast_path" in control:
        extras["fast_path"] = bool(control["fast_path"])

    return make_create_payload(
        profile_key=profile_key,
        binding_label=label[:255],
        source_type=source_type,
        source_descriptor=source_descriptor,
        target_type="engine_command",
        target_descriptor=target_descriptor,
        extras=extras or None,
        pack_version=pack_version,
        source="pack-yaml",
    )


def payloads_for_profile(
    *,
    profile_key: str,
    document: dict[str, Any],
    pack_version: Optional[str] = None,
) -> list[MidiBindingCreate]:
    """Convert every ``controls:`` entry in a MIDI profile YAML to a payload."""
    controls = document.get("controls") or []
    if not isinstance(controls, list):
        return []
    payloads: list[MidiBindingCreate] = []
    for control in controls:
        if not isinstance(control, dict):
            continue
        payload = yaml_control_to_payload(
            profile_key=profile_key,
            control=control,
            pack_version=pack_version,
        )
        if payload is not None:
            payloads.append(payload)
    return payloads


def _profile_key_from(pack_id: str, model: str, kind: str) -> str:
    """Canonical consumer_id, matches the format Hardware Store uses."""
    return f"{pack_id}/{model}.{kind}"


async def project_all_packs(
    authority: MidiBindingAuthority,
    registry: Any,  # ProfileRegistry — typed via duck-typing to avoid cycle
) -> dict[str, int]:
    """Project every MIDI profile in the registry into ``midi_bindings``.

    Idempotent: each pack's existing ``device_pack`` rows are deleted
    and rewritten from the current YAML, so a pack edit propagates on
    the next backend restart with no orphan rows.

    Returns a ``{profile_key: row_count}`` map for logging / verification.
    """
    summary: dict[str, int] = {}
    for profile in registry.profiles(kind="midi"):
        pack = registry.get_pack(profile.pack_id)
        pack_version = None
        if pack is not None:
            pack_version = (pack.manifest.get("version") if pack.manifest else None)

        profile_key = _profile_key_from(profile.pack_id, profile.model, profile.kind)
        payloads = payloads_for_profile(
            profile_key=profile_key,
            document=profile.document,
            pack_version=pack_version,
        )
        try:
            created = await replace_device_pack_defaults(
                authority, profile_key, payloads
            )
        except Exception:  # noqa: BLE001 — one bad pack must not block boot
            logger.exception(
                "device_pack projection failed for %s; skipping", profile_key
            )
            continue
        summary[profile_key] = len(created)
    return summary

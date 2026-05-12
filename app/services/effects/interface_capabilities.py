"""T2517-3 — Interface-capability registry for effects-chooser availability gating.

The effects chooser needs to know which connected interfaces can host a
hardware-bridge effect like the Lexicon MPX-1. Capability strings such as
``digital_io_stereo``, ``aes_ebu``, ``spdif_coax``, ``adat``, ``r_bus``,
``midi_1_in_1_out`` are declared per-interface in each device-pack's audio
profile YAML; this module reads them and exposes a snapshot that the
chooser, graph builder, and per-instance side-panel all consume.

The registry deliberately does **not** track which interfaces are *connected*
right now — that lives in the cluster hardware inventory. Combining the two
(declared capabilities × currently-connected interfaces) is the job of
``list_available_interfaces_for_capability``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Sequence, Set

import yaml

logger = logging.getLogger(__name__)

# All device packs live under <repo-root>/device-packs/<vendor>/profiles/*.audio.yaml
_REPO_ROOT = Path(__file__).resolve().parents[3]
DEVICE_PACKS_ROOT = _REPO_ROOT / "device-packs"


@dataclass(frozen=True)
class InterfaceCapability:
    """Static profile of a single audio-interface model.

    ``interface_id`` is the device-pack `<vendor>/<model>` pair, normalized
    to a single dotted token for use as a stable registry key.
    """

    interface_id: str
    pack_id: str
    model_id: str
    display_name: str
    capabilities: Set[str] = field(default_factory=set)
    hardware_id: str = ""


def _safe_set(values: Sequence | None) -> Set[str]:
    return {str(v) for v in (values or []) if isinstance(v, (str, bytes))}


def _read_profile(profile_path: Path) -> InterfaceCapability | None:
    try:
        with profile_path.open("r", encoding="utf-8") as fp:
            data = yaml.safe_load(fp) or {}
    except OSError as e:
        logger.warning("interface_capabilities: failed to read %s: %s", profile_path, e)
        return None
    except yaml.YAMLError as e:
        logger.warning("interface_capabilities: invalid YAML %s: %s", profile_path, e)
        return None
    if not isinstance(data, dict):
        return None
    identity = data.get("identity") or {}
    pack_id = profile_path.parent.parent.name
    model_id = profile_path.stem.split(".")[0]   # us-144mkii.audio.yaml -> us-144mkii
    name = f"{identity.get('manufacturer', pack_id)} {identity.get('model', model_id)}".strip()
    capabilities = _safe_set(data.get("capabilities"))
    if not capabilities:
        return None
    return InterfaceCapability(
        interface_id=f"{pack_id}.{model_id}",
        pack_id=pack_id,
        model_id=model_id,
        display_name=name,
        capabilities=capabilities,
        hardware_id=str(identity.get("hardware_id", "")),
    )


def load_interface_capabilities(
    *, root: Path | None = None
) -> Dict[str, InterfaceCapability]:
    """Scan device-packs/*/profiles/*.audio.yaml and return capability snapshots.

    Returns a dict keyed by ``interface_id`` for stable lookup. Profiles that
    don't declare a ``capabilities:`` list are skipped — the registry is
    additive and does not infer capabilities from port shapes alone.
    """
    base = root or DEVICE_PACKS_ROOT
    registry: Dict[str, InterfaceCapability] = {}
    if not base.is_dir():
        return registry
    for profile in base.glob("*/profiles/*.audio.yaml"):
        cap = _read_profile(profile)
        if cap is None:
            continue
        registry[cap.interface_id] = cap
    return registry


def list_interfaces_with_capability(
    capability: str, *, root: Path | None = None
) -> List[InterfaceCapability]:
    """Return all interface profiles that declare ``capability``."""
    return [
        cap
        for cap in load_interface_capabilities(root=root).values()
        if capability in cap.capabilities
    ]


def list_interfaces_with_all_capabilities(
    required: Sequence[str], *, root: Path | None = None
) -> List[InterfaceCapability]:
    """Return interface profiles that declare every capability in ``required``."""
    req = set(required)
    return [
        cap
        for cap in load_interface_capabilities(root=root).values()
        if req.issubset(cap.capabilities)
    ]

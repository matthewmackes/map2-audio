"""Mixxx XML mapping file reader.

Parses upstream ``mixxx/res/controllers/<file>.midi.xml`` into the same
:class:`MappingDescriptor` shape that
:class:`app.services.controllers.mapping_file_handler.MappingFileHandler`
produces from MAP2-native YAML. Both readers feed the same downstream
pipeline.

XML schema (Mixxx legacy):

    <MixxxControllerPreset schemaVersion="1" mixxxVersion="2.x.x">
      <info>
        <name>...</name>
        <author>...</author>
        <description>...</description>
        <forums>https://...</forums>
        <wiki>https://...</wiki>
      </info>
      <controller id="MyController">
        <scriptfiles>
          <file filename="MyController-scripts.js" functionprefix="MyController" />
        </scriptfiles>
        <controls>
          <control>
            <group>[Channel1]</group>
            <key>volume</key>
            <status>0xB0</status>
            <midino>0x07</midino>
            <options>
              <Script-Binding/>
            </options>
          </control>
          ...
        </controls>
        <outputs>
          <output>
            <group>[Channel1]</group>
            <key>play</key>
            <status>0x90</status>
            <midino>0x01</midino>
            <on>0x7F</on>
            <off>0x00</off>
          </output>
        </outputs>
      </controller>
    </MixxxControllerPreset>

Architecture: ``docs/architecture/CONTROLLER_LAYER.md`` §6.2.
Worklist: ``T2459-B3``.
"""

from __future__ import annotations

import dataclasses
import logging
import re
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from app.services.controllers.mapping_file_handler import (
    MappingControl,
    MappingDescriptor,
    MappingLoadError,
)
from app.services.controllers.mixxx_control_object_bridge import (
    BridgeResult,
    resolve as bridge_resolve,
)

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class MixxxParseStats:
    """Side-channel reporting from a Mixxx XML parse.

    Surfaces in the GUI's "imported mapping" detail page so operators
    can see how many bindings landed cleanly vs. were skipped.
    """

    total_controls: int
    resolved_controls: int
    skipped_controls: int
    skip_reasons: tuple[str, ...]


@dataclasses.dataclass(frozen=True)
class MixxxParseResult:
    descriptor: MappingDescriptor
    stats: MixxxParseStats


def _parse_int(text: str | None) -> int | None:
    """Mixxx XML often writes status/midino as 0xB0, 0x90, etc. Accept
    decimal or hex.
    """
    if text is None:
        return None
    text = text.strip()
    if not text:
        return None
    try:
        return int(text, 0)
    except ValueError:
        return None


def _bool_child_present(parent: ET.Element, tag: str) -> bool:
    """Mixxx options use empty self-closing tags as flags
    (e.g. ``<Script-Binding/>``). Returns True if such a tag exists.
    """
    for child in parent:
        if child.tag.lower() == tag.lower():
            return True
    return False


def parse_mixxx_xml(
    path: Path,
    pack_id: str,
    alias_table: dict[str, str] | None = None,
) -> MixxxParseResult:
    """Parse a single Mixxx ``.midi.xml`` mapping file into a MAP2
    :class:`MappingDescriptor` plus :class:`MixxxParseStats`.

    Bindings that the bridge cannot resolve are dropped silently from
    the descriptor but surface in :class:`MixxxParseStats.skip_reasons`
    so the GUI can list them.
    """
    try:
        tree = ET.parse(path)
    except ET.ParseError as exc:
        raise MappingLoadError(f"{path}: invalid XML: {exc}") from exc

    root = tree.getroot()
    # Mixxx has shipped two root-tag spellings over time:
    # - "MixxxControllerPreset" (current, since 1.11)
    # - "MixxxMIDIPreset" (legacy, pre-1.11) — still in upstream
    #   `res/controllers/` for older devices
    valid_roots = {"MixxxControllerPreset", "MixxxMIDIPreset"}
    if root.tag not in valid_roots:
        raise MappingLoadError(
            f"{path}: expected one of {sorted(valid_roots)} as root, got <{root.tag}>"
        )

    controller_elem = root.find("controller")
    if controller_elem is None:
        raise MappingLoadError(f"{path}: no <controller> element")

    model = controller_elem.attrib.get("id") or path.stem

    scripts: list[str] = []
    scriptfiles_elem = controller_elem.find("scriptfiles")
    if scriptfiles_elem is not None:
        for fileElem in scriptfiles_elem.findall("file"):
            fname = fileElem.attrib.get("filename")
            if fname:
                scripts.append(fname)

    controls_elem = controller_elem.find("controls")
    raw_controls = list(controls_elem.findall("control")) if controls_elem is not None else []

    outputs_elem = controller_elem.find("outputs")
    raw_outputs = list(outputs_elem.findall("output")) if outputs_elem is not None else []

    resolved: list[MappingControl] = []
    output_rows: list[MappingControl] = []
    skip_reasons: list[str] = []

    for raw in raw_controls:
        group = (raw.findtext("group") or "").strip()
        key = (raw.findtext("key") or "").strip()
        status = _parse_int(raw.findtext("status"))
        midino = _parse_int(raw.findtext("midino"))
        channel = _parse_int(raw.findtext("channel"))

        options_elem = raw.find("options")
        is_script_binding = (
            options_elem is not None
            and _bool_child_present(options_elem, "Script-Binding")
        )

        if is_script_binding:
            # The JS function name is the value of <key> qualified by the
            # functionprefix from <scriptfiles>. Mixxx mappings put the
            # JS function name in <key> directly when Script-Binding is
            # set.
            resolved.append(MappingControl(
                status=status,
                midino=midino,
                channel=channel,
                target=None,
                action=None,
                script=key,
                fast_path=False,
                description=f"Mixxx XML script-binding: {group}.{key}",
                extra={"mixxx_group": group, "mixxx_key": key},
            ))
            continue

        result: BridgeResult = bridge_resolve(group, key, alias_table)
        if not result.resolved:
            reason = result.fail_soft_reason or f"Unresolvable: {group}.{key}"
            skip_reasons.append(reason)
            logger.warning("Mixxx XML %s: %s — binding skipped", path.name, reason)
            continue

        resolved.append(MappingControl(
            status=status,
            midino=midino,
            channel=channel,
            target=result.target,
            action="set",
            script=None,
            fast_path=False,
            description=f"Mixxx XML imported binding for {group}.{key}",
            extra={"mixxx_group": group, "mixxx_key": key},
        ))

    for raw in raw_outputs:
        group = (raw.findtext("group") or "").strip()
        key = (raw.findtext("key") or "").strip()
        status = _parse_int(raw.findtext("status"))
        midino = _parse_int(raw.findtext("midino"))
        channel = _parse_int(raw.findtext("channel"))
        on_value = _parse_int(raw.findtext("on"))
        off_value = _parse_int(raw.findtext("off"))

        result = bridge_resolve(group, key, alias_table)
        if not result.resolved:
            skip_reasons.append(result.fail_soft_reason or f"Output unresolvable: {group}.{key}")
            continue

        output_rows.append(MappingControl(
            status=status,
            midino=midino,
            channel=channel,
            target=result.target,
            action="led_feedback",
            script=None,
            fast_path=False,
            description=f"Mixxx XML imported output for {group}.{key}",
            extra={
                "mixxx_group": group,
                "mixxx_key": key,
                "on_value": on_value,
                "off_value": off_value,
            },
        ))

    descriptor = MappingDescriptor(
        pack_id=pack_id,
        model=model,
        kind="midi",
        source_path=path,
        scripts=tuple(scripts),
        controls=tuple(resolved),
        outputs=tuple(output_rows),
        settings=tuple(),
        mixxx_alias_table=dict(alias_table or {}),
    )

    stats = MixxxParseStats(
        total_controls=len(raw_controls),
        resolved_controls=len(resolved),
        skipped_controls=len(raw_controls) - len(resolved),
        skip_reasons=tuple(skip_reasons),
    )

    return MixxxParseResult(descriptor=descriptor, stats=stats)

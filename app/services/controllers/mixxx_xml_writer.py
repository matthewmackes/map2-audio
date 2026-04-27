"""Mixxx XML mapping file writer.

Produces upstream-compatible ``<MixxxControllerPreset>`` XML from a
:class:`MappingDescriptor`. The companion to
:mod:`mixxx_xml_reader` — together they implement the bidirectional
β1 Mixxx round-trip mandated by T2459's locked decisions.

Worklist: ``T2459-C4``.
Architecture: ``docs/architecture/CONTROLLER_LAYER.md`` §6.3.
"""

from __future__ import annotations

import logging
from typing import Any
from xml.etree import ElementTree as ET

from app.services.controllers.mapping_file_handler import (
    MappingControl,
    MappingDescriptor,
)

logger = logging.getLogger(__name__)


def _add_text(parent: ET.Element, tag: str, value: Any) -> ET.Element:
    elem = ET.SubElement(parent, tag)
    elem.text = str(value)
    return elem


def _format_hex(byte_value: int | None) -> str | None:
    if byte_value is None:
        return None
    return f"0x{byte_value & 0xFF:02X}"


def _resolve_mixxx_group_key(control: MappingControl) -> tuple[str, str] | None:
    """Recover the original Mixxx (group, key) from a MappingControl.

    The reader stores them in ``extra["mixxx_group"]`` /
    ``extra["mixxx_key"]`` when it parsed an upstream Mixxx XML; when
    a row is purely native (no Mixxx ancestry) we cannot reconstruct a
    Mixxx (group, key) and the writer falls back to a single-group
    catch-all so the row at least round-trips structurally.
    """
    extra = control.extra or {}
    group = extra.get("mixxx_group")
    key = extra.get("mixxx_key")
    if group and key:
        return str(group), str(key)
    return None


def write_mixxx_xml(descriptor: MappingDescriptor) -> str:
    """Serialize a :class:`MappingDescriptor` to a Mixxx-format XML
    string.

    Round-trip contract: when fed the descriptor produced by
    :func:`mixxx_xml_reader.parse_mixxx_xml`, this writer reproduces a
    structurally-equivalent XML (same controls + outputs + scriptfiles).

    Native MAP2-authored mappings lacking ``mixxx_group`` / ``mixxx_key``
    metadata are exported under a synthetic ``[Map2]`` group so they
    can still load in Mixxx's parser without crashing — operators can
    edit the group/key in Mixxx if they want to retarget.
    """
    if descriptor.kind != "midi":
        raise ValueError(f"Mixxx export supports MIDI mappings only; got {descriptor.kind}")

    root = ET.Element("MixxxControllerPreset", attrib={"schemaVersion": "1", "mixxxVersion": "2.4.0"})
    info = ET.SubElement(root, "info")
    _add_text(info, "name", descriptor.model)
    _add_text(info, "author", "MAP2 export")
    _add_text(info, "description", f"Exported from MAP2 pack {descriptor.pack_id}.")

    controller = ET.SubElement(root, "controller", attrib={"id": descriptor.model})

    if descriptor.scripts:
        scriptfiles = ET.SubElement(controller, "scriptfiles")
        for script_path in descriptor.scripts:
            ET.SubElement(scriptfiles, "file", attrib={
                "filename": script_path,
                "functionprefix": descriptor.model.replace("-", "").replace(".", ""),
            })

    controls_elem = ET.SubElement(controller, "controls")
    for c in descriptor.controls:
        control_elem = ET.SubElement(controls_elem, "control")
        gk = _resolve_mixxx_group_key(c)
        if gk is not None:
            group, key = gk
        elif c.script:
            # Native script-routed binding — round-trip the script name as
            # the key so a Mixxx parser sees it as a Script-Binding row
            # and the operator can rewire the group inside Mixxx.
            group, key = "[Map2]", c.script
        elif c.target:
            # Native direct binding — encode the MAP2 target as the key
            # so the row's intent is preserved in the exported file.
            group, key = "[Map2]", c.target
        else:
            group, key = "[Map2]", "unknown"

        _add_text(control_elem, "group", group)
        _add_text(control_elem, "key", key)

        if c.status is not None:
            _add_text(control_elem, "status", _format_hex(c.status) or "")
        if c.midino is not None:
            _add_text(control_elem, "midino", _format_hex(c.midino) or "")
        if c.channel is not None:
            _add_text(control_elem, "channel", str(c.channel))

        if c.script is not None:
            options_elem = ET.SubElement(control_elem, "options")
            ET.SubElement(options_elem, "Script-Binding")

    if descriptor.outputs:
        outputs_elem = ET.SubElement(controller, "outputs")
        for o in descriptor.outputs:
            output_elem = ET.SubElement(outputs_elem, "output")
            extra = o.extra or {}
            group = extra.get("mixxx_group", "[Map2]")
            key = extra.get("mixxx_key") or (o.target or "unknown")
            _add_text(output_elem, "group", str(group))
            _add_text(output_elem, "key", str(key))
            if o.status is not None:
                _add_text(output_elem, "status", _format_hex(o.status) or "")
            if o.midino is not None:
                _add_text(output_elem, "midino", _format_hex(o.midino) or "")
            on_value = extra.get("on_value")
            off_value = extra.get("off_value")
            if on_value is not None:
                _add_text(output_elem, "on", _format_hex(int(on_value)) or "")
            if off_value is not None:
                _add_text(output_elem, "off", _format_hex(int(off_value)) or "")

    # ElementTree.tostring with xml_declaration produces a byte string;
    # decode for the API surface.
    body = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    return body.decode("utf-8")

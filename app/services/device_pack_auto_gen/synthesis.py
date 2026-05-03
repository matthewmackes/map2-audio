"""
T2492-1 — Manifest + XML + JS scaffolding synthesis.

Given a LookupResult (Mixxx + USB-IF), produces the three text blobs
the wizard's commit step writes to disk:
  - manifest_yaml: the .MAP2.yaml content
  - mapping_xml: the controller XML mapping (verbatim Mixxx template
                 when matched; minimal skeleton when not)
  - scripts_js: the controller JS script (verbatim Mixxx template
                when matched; minimal skeleton when not)

When a Mixxx template is used, the original GPL-2.0-or-later license
header is preserved verbatim and the manifest's runtime_extra carries
provenance fields so future audits can trace the binding back.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .lookup import LookupResult, REPO_ROOT

logger = logging.getLogger(__name__)


@dataclass
class SynthesisInput:
    vid: str
    pid: str
    alsa_name: str
    usb_manufacturer: str = ""
    usb_product: str = ""
    operator_choice: str = "auto"  # "auto" | "use-mixxx-template" | "from-scratch"


@dataclass
class SynthesisResult:
    manifest_yaml: str
    mapping_xml: str
    scripts_js: str
    suggested_vendor: str
    suggested_model: str
    used_mixxx_template: bool
    mixxx_template_path: Optional[str]
    mixxx_upstream_commit: Optional[str]
    mixxx_script_path: Optional[str] = None


_INVALID_PATH_CHARS = re.compile(r"[^a-zA-Z0-9._-]+")


def _slug(value: str) -> str:
    """Filesystem-safe slug for vendor/model directory names."""
    if not value:
        return "unknown"
    cleaned = _INVALID_PATH_CHARS.sub("-", value).strip("-").lower()
    return cleaned or "unknown"


def _read_template_file(rel_path: str) -> Optional[str]:
    if not rel_path:
        return None
    full = REPO_ROOT / rel_path
    if not full.is_file():
        logger.warning("Mixxx template missing at %s", full)
        return None
    try:
        return full.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        logger.warning("Failed to read Mixxx template %s: %s", full, exc)
        return None


_DEFAULT_XML = """<?xml version="1.0" encoding="utf-8"?>
<!--
  T2492 auto-generated controller mapping skeleton.
  No Mixxx template matched the device's USB VID:PID; this skeleton
  follows the Mixxx MIDI preset schema (re-used as data by MAP2's
  ControllerEngine reimplementation per CONTROLLER_LAYER.md). Add
  <control> rows for each MIDI CC / note your device emits, then
  commit through the wizard.
-->
<MixxxMIDIPreset mixxxVersion="2.5.0+" schemaVersion="1">
    <info>
        <name>{name}</name>
        <author>auto-generator</author>
        <description>Auto-generated skeleton — edit before binding to live audio. USB {vid}:{pid}.</description>
    </info>
    <controller id="{prefix}">
        <scriptfiles>
            <file functionprefix="{prefix}" filename="{prefix}-scripts.js"/>
        </scriptfiles>
        <controls>
            <!-- TODO: add per-control mappings:
            <control>
                <group>[Channel1]</group>
                <key>{prefix}.someKnob</key>
                <status>0xB0</status>
                <midino>0x07</midino>
                <options><script-binding/></options>
            </control>
            -->
        </controls>
        <outputs>
            <!-- TODO: add per-LED / per-display outputs -->
        </outputs>
    </controller>
</MixxxMIDIPreset>
"""

_DEFAULT_JS = """// T2492 auto-generated controller script skeleton.
// No Mixxx template matched this device's USB VID:PID; this is a
// blank starting point. Hook MIDI events in the init() callback
// and dispatch them to MAP2 actions via the controller-host bridge.
// Function names follow Mixxx's ControllerEngine conventions because
// MAP2 reuses the same dispatch surface.

function {prefix}() {{}}
{prefix}.debug = false;

{prefix}.init = function (id, debug) {{
    // TODO: configure the controller; emit init SysEx if needed
}};

{prefix}.shutdown = function () {{
    // TODO: clean up before disconnect
}};
"""


_TEMPLATE_XML_HEADER = """<?xml version="1.0" encoding="utf-8"?>
<!--
  T2492 auto-generated device-pack import.
  Source: Mixxx mapping {template_path} (upstream commit {commit}).
  License: GPL-2.0-or-later (Mixxx). Preserved verbatim — do not
  strip the original Mixxx <info> block; downstream attribution
  audits depend on it. See device-packs/_mixx-imports/MANIFEST.yaml
  for the import provenance chain.
-->
"""


_TEMPLATE_JS_HEADER = """// T2492 auto-generated device-pack import.
// Source: Mixxx script {script_path} (upstream commit {commit}).
// License: GPL-2.0-or-later (Mixxx). Preserved verbatim. See
// device-packs/_mixx-imports/MANIFEST.yaml for provenance chain.
"""


def _splice_template_xml_header(raw: str, *, template_path: str, commit: str) -> str:
    """Prepend the MAP2 attribution block while keeping the XML
    declaration as the first line (XML 1.0 §2.8 — the prolog must
    be the very first thing in the file). The Mixxx upstream files
    almost always start with `<?xml version="1.0" encoding="utf-8"?>`;
    we move our attribution comment block to land immediately after
    that declaration.
    """
    stripped = raw.lstrip()
    header = _TEMPLATE_XML_HEADER.format(template_path=template_path, commit=commit)
    if stripped.startswith("<?xml"):
        end = stripped.find("?>")
        if end != -1:
            decl = stripped[: end + 2]
            rest = stripped[end + 2 :].lstrip("\r\n")
            return f"{decl}\n{header}{rest}"
    return f"{header}{raw}"


def _splice_template_js_header(raw: str, *, script_path: str, commit: str) -> str:
    return _TEMPLATE_JS_HEADER.format(script_path=script_path, commit=commit) + raw


class ManifestSynthesizer:
    """Produces the three text blobs ready to commit to disk."""

    def synthesize(self, lookup: LookupResult, inp: SynthesisInput) -> SynthesisResult:
        # Decide whether to use a Mixxx template.
        use_template = (
            inp.operator_choice in ("auto", "use-mixxx-template")
            and lookup.mixxx_match is not None
        )

        # Vendor + model fall back through Mixxx → USB-IF → ALSA name.
        vendor_name = ""
        model_name = ""
        if lookup.mixxx_match is not None:
            # Mixxx mappings aren't strict about vendor/model split;
            # the device_name is usually "Vendor Model".
            split = lookup.mixxx_match.device_name.split(" ", 1)
            if len(split) == 2:
                vendor_name, model_name = split
            else:
                model_name = lookup.mixxx_match.device_name
        if not vendor_name and lookup.usbif_match and lookup.usbif_match.vendor_name:
            vendor_name = lookup.usbif_match.vendor_name
        if not model_name and lookup.usbif_match and lookup.usbif_match.product_name:
            model_name = lookup.usbif_match.product_name
        if not model_name:
            model_name = inp.usb_product or inp.alsa_name or "unknown-device"
        if not vendor_name:
            vendor_name = inp.usb_manufacturer or "unknown-vendor"

        suggested_vendor = _slug(vendor_name)
        suggested_model = _slug(model_name)
        prefix = re.sub(r"[^A-Za-z0-9]", "", model_name) or "Controller"

        # Mapping XML + scripts JS — built first so the manifest's
        # provenance block (T2492-4) can reference the actual JS
        # template path that was applied (if any).
        mapping_xml: Optional[str] = None
        scripts_js: Optional[str] = None
        scripts_js_template_path: Optional[str] = None
        if use_template and lookup.mixxx_match is not None:
            raw_xml = _read_template_file(lookup.mixxx_match.mapping_file)
            if raw_xml is not None:
                mapping_xml = _splice_template_xml_header(
                    raw_xml,
                    template_path=lookup.mixxx_match.mapping_file,
                    commit=lookup.mixxx_match.upstream_commit,
                )
            for script_rel in lookup.mixxx_match.script_files:
                # script_files in the index store filenames relative to
                # the Mixxx controllers/ dir (the upstream XML schema).
                candidate = (
                    REPO_ROOT
                    / "device-packs"
                    / "_mixx-imports"
                    / "res"
                    / "controllers"
                    / script_rel
                )
                if candidate.is_file():
                    try:
                        raw_js = candidate.read_text(
                            encoding="utf-8",
                            errors="replace",
                        )
                    except OSError:
                        raw_js = None
                    if raw_js is not None:
                        scripts_js_template_path = (
                            f"device-packs/_mixx-imports/res/controllers/{script_rel}"
                        )
                        scripts_js = _splice_template_js_header(
                            raw_js,
                            script_path=script_rel,
                            commit=lookup.mixxx_match.upstream_commit,
                        )
                    break

        if mapping_xml is None:
            mapping_xml = _DEFAULT_XML.format(
                name=model_name,
                vid=lookup.vid,
                pid=lookup.pid,
                prefix=prefix,
            )
        if scripts_js is None:
            scripts_js = _DEFAULT_JS.format(prefix=prefix)

        # T2492-4 — provenance manifest. Built AFTER XML/JS so we can
        # surface the actual JS template path that was applied. Every
        # auto-generator pack carries the same audit-trail block under
        # `runtime_extra`; the writer (writer.py::_enforce_provenance)
        # re-asserts the gate so an operator can't silently strip it
        # before commit.
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        manifest_lines = [
            "# T2492 auto-generated device-pack manifest.",
            "# Edit before live use; bindings author through MIDI Services.",
            "schemaVersion: 1",
            f"name: {model_name!r}",
            f"vendor: {vendor_name!r}",
            "transport: midi",
            "usb:",
            f"  vid: '{lookup.vid}'",
            f"  pid: '{lookup.pid}'",
            "alsa:",
            "  match_patterns:",
        ]
        if inp.alsa_name:
            manifest_lines.append(f"    - {inp.alsa_name!r}")
        manifest_lines.extend([
            "runtime_extra:",
            "  created_via: auto-generator",
            f"  created_at: '{now}'",
            f"  source_vid: '{lookup.vid}'",
            f"  source_pid: '{lookup.pid}'",
        ])
        if inp.alsa_name:
            manifest_lines.append(f"  source_alsa_name: {inp.alsa_name!r}")
        if inp.usb_manufacturer:
            manifest_lines.append(f"  source_usb_manufacturer: {inp.usb_manufacturer!r}")
        if inp.usb_product:
            manifest_lines.append(f"  source_usb_product: {inp.usb_product!r}")
        if use_template and lookup.mixxx_match is not None:
            manifest_lines.extend([
                f"  mixxx_template: {lookup.mixxx_match.mapping_file!r}",
                f"  mixxx_upstream_commit: {lookup.mixxx_match.upstream_commit!r}",
                "  template_license: 'GPL-2.0-or-later (Mixxx)'",
            ])
        else:
            manifest_lines.append("  mixxx_template: null")
        if scripts_js_template_path:
            manifest_lines.append(f"  mixxx_script: {scripts_js_template_path!r}")
        else:
            manifest_lines.append("  mixxx_script: null")
        manifest_yaml = "\n".join(manifest_lines) + "\n"

        return SynthesisResult(
            manifest_yaml=manifest_yaml,
            mapping_xml=mapping_xml,
            scripts_js=scripts_js,
            suggested_vendor=suggested_vendor,
            suggested_model=suggested_model,
            used_mixxx_template=use_template and lookup.mixxx_match is not None,
            mixxx_template_path=(
                lookup.mixxx_match.mapping_file if use_template and lookup.mixxx_match else None
            ),
            mixxx_upstream_commit=(
                lookup.mixxx_match.upstream_commit if use_template and lookup.mixxx_match else None
            ),
            mixxx_script_path=scripts_js_template_path,
        )

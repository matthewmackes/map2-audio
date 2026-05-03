"""
T2492-1 — backend tests for device-pack auto-generation.

Covers:
  - Mixxx VID:PID lookup hit + miss
  - USB-IF vendor lookup hit + miss
  - Manifest synthesis with Mixxx template + from-scratch
  - Pack-writer validation (vendor/model slug, YAML/XML sanity)
  - Reserved-name rejection
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

from app.services.device_pack_auto_gen.lookup import (
    MixxxLookup,
    UsbIfLookup,
    perform_lookup,
)
from app.services.device_pack_auto_gen.synthesis import (
    ManifestSynthesizer,
    SynthesisInput,
)
from app.services.device_pack_auto_gen.writer import (
    PackWriteError,
    PackWriter,
)


def test_mixxx_lookup_loads_at_least_one_entry() -> None:
    """The shipped Mixxx lookup index has 19+ VID:PID entries."""
    mxx = MixxxLookup()
    assert mxx.entry_count >= 1


def test_usbif_lookup_loads_thousands_of_vendors() -> None:
    """The shipped usb.ids has 3000+ vendors."""
    usbif = UsbIfLookup()
    assert usbif.vendor_count >= 1000


def test_mixxx_lookup_miss_returns_none() -> None:
    mxx = MixxxLookup()
    assert mxx.lookup("0xffff", "0xffff") is None


def test_usbif_lookup_known_vendor_native_instruments() -> None:
    """0x17cc is Native Instruments — table is comprehensive enough."""
    usbif = UsbIfLookup()
    match = usbif.lookup("0x17cc", "0x0808")
    assert match is not None
    assert match.vendor_name is not None
    assert "Native Instruments" in match.vendor_name


def test_perform_lookup_returns_combined_result() -> None:
    result = perform_lookup("0x17cc", "0x0808")
    # NI Maschine MK1 is in usb.ids but probably not in the Mixxx
    # HID/bulk index (Maschine MK1 is mapped via MIDI in Mixxx).
    assert result.usbif_match is not None
    assert result.usbif_match.vendor_name is not None


def test_synthesis_from_scratch_produces_valid_manifest() -> None:
    """Operator picks 'from-scratch' even on a Mixxx-known device."""
    result = perform_lookup("0xffff", "0xffff")  # guaranteed miss
    synth = ManifestSynthesizer().synthesize(
        result,
        SynthesisInput(
            vid="0xffff",
            pid="0xffff",
            alsa_name="Synthetic Test",
            usb_manufacturer="TestVendor",
            usb_product="TestProduct",
            operator_choice="from-scratch",
        ),
    )
    assert "schemaVersion: 1" in synth.manifest_yaml
    assert "0xffff" in synth.manifest_yaml
    assert synth.used_mixxx_template is False
    assert synth.suggested_vendor == "testvendor"
    assert synth.suggested_model == "testproduct"


def test_synthesis_uses_usbif_vendor_when_no_mixxx_match() -> None:
    """When there's a USB-IF hit but no Mixxx, the vendor name comes from USB-IF."""
    result = perform_lookup("0x17cc", "0x0808")
    synth = ManifestSynthesizer().synthesize(
        result,
        SynthesisInput(
            vid="0x17cc",
            pid="0x0808",
            alsa_name="Maschine MK1",
            operator_choice="auto",
        ),
    )
    # Vendor slug should derive from USB-IF "Native Instruments"
    assert synth.suggested_vendor == "native-instruments"


def test_writer_rejects_reserved_vendor_name() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        writer = PackWriter(packs_dir=Path(tmp))
        with pytest.raises(PackWriteError, match="Invalid vendor"):
            writer.commit(
                vendor="_mixx-imports",  # reserved
                model="test",
                manifest_yaml="schemaVersion: 1\nname: 'x'\n",
                mapping_xml="<?xml version='1.0'?><x/>",
                scripts_js="",
            )


_VALID_MANIFEST = (
    "schemaVersion: 1\n"
    "name: 'Test Model'\n"
    "runtime_extra:\n"
    "  created_via: auto-generator\n"
)


def test_writer_writes_files_to_disk() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        writer = PackWriter(packs_dir=Path(tmp))
        result = writer.commit(
            vendor="testvendor",
            model="testmodel",
            manifest_yaml=_VALID_MANIFEST,
            mapping_xml="<?xml version='1.0'?><MAP2ControllerPreset/>",
            scripts_js="// empty",
        )
        assert result.profile_key == "testvendor-testmodel"
        pack_dir = Path(tmp) / "testvendor" / "testmodel"
        assert (pack_dir / ".MAP2.yaml").is_file()
        assert (pack_dir / "mapping.xml").is_file()
        assert (pack_dir / "scripts.js").is_file()
        assert "schemaVersion: 1" in (pack_dir / ".MAP2.yaml").read_text()


def test_writer_rejects_overwrite_without_flag() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        writer = PackWriter(packs_dir=Path(tmp))
        kwargs = dict(
            vendor="testvendor",
            model="testmodel",
            manifest_yaml=_VALID_MANIFEST,
            mapping_xml="<?xml version='1.0'?><x/>",
            scripts_js="",
        )
        writer.commit(**kwargs)
        with pytest.raises(PackWriteError, match="already exists"):
            writer.commit(**kwargs)


def test_writer_rejects_empty_yaml() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        writer = PackWriter(packs_dir=Path(tmp))
        with pytest.raises(PackWriteError, match="empty"):
            writer.commit(
                vendor="testvendor",
                model="testmodel",
                manifest_yaml="",
                mapping_xml="<?xml?><x/>",
                scripts_js="",
            )


def test_writer_rejects_yaml_without_schema_version() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        writer = PackWriter(packs_dir=Path(tmp))
        with pytest.raises(PackWriteError, match="schemaVersion"):
            writer.commit(
                vendor="testvendor",
                model="testmodel",
                manifest_yaml="name: 'x'\n",
                mapping_xml="<?xml version='1.0'?><x/>",
                scripts_js="",
            )


def test_writer_translates_oserror_to_packwrite_error() -> None:
    """T2492-1a: read-only target → PackWriteError, not raw OSError."""
    import os
    with tempfile.TemporaryDirectory() as tmp:
        readonly = Path(tmp) / "readonly"
        readonly.mkdir()
        os.chmod(readonly, 0o500)  # r-x for owner; no write
        try:
            writer = PackWriter(packs_dir=readonly)
            with pytest.raises(PackWriteError, match="Failed to write"):
                writer.commit(
                    vendor="testvendor",
                    model="testmodel",
                    manifest_yaml=_VALID_MANIFEST,
                    mapping_xml="<?xml version='1.0'?><x/>",
                    scripts_js="",
                )
        finally:
            os.chmod(readonly, 0o700)  # restore so cleanup can remove the tmp


def test_writer_result_carries_runtime_packs_dir() -> None:
    """T2492-1a: PackWriteResult.runtime_packs_dir surfaces the target."""
    with tempfile.TemporaryDirectory() as tmp:
        writer = PackWriter(packs_dir=Path(tmp))
        result = writer.commit(
            vendor="testvendor",
            model="testmodel",
            manifest_yaml=_VALID_MANIFEST,
            mapping_xml="<?xml version='1.0'?><x/>",
            scripts_js="",
        )
        assert result.runtime_packs_dir == tmp


def test_synthesis_skeleton_xml_follows_mixxx_schema() -> None:
    """T2492-3: when no Mixxx template matches, the generated skeleton
    uses Mixxx's MixxxMIDIPreset schema (not a MAP2-only tag) so the
    same ControllerEngine reimplementation parses it identically."""
    result = perform_lookup("0xffff", "0xffff")  # guaranteed miss
    synth = ManifestSynthesizer().synthesize(
        result,
        SynthesisInput(
            vid="0xffff",
            pid="0xffff",
            alsa_name="Synthetic",
            usb_product="WidgetCtl",
            operator_choice="from-scratch",
        ),
    )
    assert "<MixxxMIDIPreset" in synth.mapping_xml
    assert "<scriptfiles>" in synth.mapping_xml
    assert "<controls>" in synth.mapping_xml
    assert "WidgetCtl" in synth.mapping_xml
    # The JS skeleton must follow Mixxx's "function Prefix() {}" form,
    # not the older `var Prefix = {}` shape.
    assert "function WidgetCtl()" in synth.scripts_js


def test_synthesis_with_mixxx_template_preserves_attribution() -> None:
    """T2492-3: when a Mixxx template seeds the pack, the generated
    XML / JS retain the upstream Mixxx <info> block verbatim AND
    carry an explicit MAP2 attribution comment block declaring the
    GPL-2.0-or-later license + provenance commit."""
    # Sony SixxAxis is in the shipped Mixxx index.
    result = perform_lookup("0x054c", "0x0268")
    assert result.mixxx_match is not None
    synth = ManifestSynthesizer().synthesize(
        result,
        SynthesisInput(
            vid="0x054c",
            pid="0x0268",
            alsa_name="SixxAxis",
            operator_choice="auto",
        ),
    )
    assert synth.used_mixxx_template is True
    assert synth.mixxx_template_path == result.mixxx_match.mapping_file
    # XML retains its declaration as the first non-empty line.
    assert synth.mapping_xml.lstrip().startswith("<?xml")
    # MAP2 attribution block is present.
    assert "License: GPL-2.0-or-later (Mixxx)" in synth.mapping_xml
    assert result.mixxx_match.upstream_commit in synth.mapping_xml
    # The original Mixxx <info> block is preserved verbatim — must
    # contain the upstream root element.
    assert "<MixxxControllerPreset" in synth.mapping_xml
    # Manifest must also carry the provenance fields.
    assert "mixxx_template:" in synth.manifest_yaml
    assert "GPL-2.0-or-later" in synth.manifest_yaml


def test_synthesis_xml_attribution_lands_after_xml_decl() -> None:
    """T2492-3: per XML 1.0 §2.8, the prolog declaration must be the
    first thing in the document — the MAP2 attribution comment must
    therefore land AFTER the <?xml ... ?> declaration."""
    result = perform_lookup("0x054c", "0x0268")
    assert result.mixxx_match is not None
    synth = ManifestSynthesizer().synthesize(
        result,
        SynthesisInput(
            vid="0x054c",
            pid="0x0268",
            alsa_name="SixxAxis",
            operator_choice="use-mixxx-template",
        ),
    )
    decl_idx = synth.mapping_xml.find("<?xml")
    attribution_idx = synth.mapping_xml.find("T2492 auto-generated device-pack import")
    assert decl_idx == 0
    assert attribution_idx > decl_idx


def test_writer_blocks_commit_without_provenance() -> None:
    """T2492-4: an operator cannot silently strip the provenance
    block from a manifest before commit; the writer re-asserts the
    `runtime_extra.created_via: auto-generator` gate."""
    with tempfile.TemporaryDirectory() as tmp:
        writer = PackWriter(packs_dir=Path(tmp))
        with pytest.raises(PackWriteError, match="created_via"):
            writer.commit(
                vendor="testvendor",
                model="testmodel",
                manifest_yaml="schemaVersion: 1\nname: 'NoProv'\n",
                mapping_xml="<?xml version='1.0'?><x/>",
                scripts_js="",
            )


def test_writer_blocks_commit_with_wrong_created_via() -> None:
    """T2492-4: even if `created_via` is present, the value must
    declare `auto-generator` so audit logs can rely on it as a
    classifier."""
    with tempfile.TemporaryDirectory() as tmp:
        writer = PackWriter(packs_dir=Path(tmp))
        with pytest.raises(PackWriteError, match="auto-generator"):
            writer.commit(
                vendor="testvendor",
                model="testmodel",
                manifest_yaml=(
                    "schemaVersion: 1\nname: 'X'\n"
                    "runtime_extra:\n  created_via: hand-edited\n"
                ),
                mapping_xml="<?xml version='1.0'?><x/>",
                scripts_js="",
            )


def test_synthesizer_emits_full_provenance_for_from_scratch_packs() -> None:
    """T2492-4: every auto-generator manifest must carry the
    full audit-trail block — including source VID/PID and ALSA
    name — even when no Mixxx template was used."""
    result = perform_lookup("0xffff", "0xffff")
    synth = ManifestSynthesizer().synthesize(
        result,
        SynthesisInput(
            vid="0xffff",
            pid="0xffff",
            alsa_name="Synthetic ALSA",
            usb_manufacturer="TestVendor",
            usb_product="WidgetCtl",
            operator_choice="from-scratch",
        ),
    )
    yaml = synth.manifest_yaml
    assert "created_via: auto-generator" in yaml
    assert "source_vid: '0xffff'" in yaml
    assert "source_pid: '0xffff'" in yaml
    assert "source_alsa_name:" in yaml
    assert "source_usb_manufacturer:" in yaml
    assert "source_usb_product:" in yaml
    assert "mixxx_template: null" in yaml
    assert "mixxx_script: null" in yaml


def test_synthesizer_emits_mixxx_script_provenance_when_template_used() -> None:
    """T2492-4: when a Mixxx template + JS script seed the pack,
    the manifest's `runtime_extra.mixxx_script` carries the upstream
    JS path so audits can trace the full template lineage."""
    result = perform_lookup("0x054c", "0x0268")  # Sony SixxAxis
    assert result.mixxx_match is not None
    synth = ManifestSynthesizer().synthesize(
        result,
        SynthesisInput(
            vid="0x054c",
            pid="0x0268",
            alsa_name="SixxAxis",
            operator_choice="auto",
        ),
    )
    yaml = synth.manifest_yaml
    assert "mixxx_template:" in yaml
    assert "Sony SixxAxis.hid.xml" in yaml
    assert "mixxx_upstream_commit:" in yaml
    assert "template_license: 'GPL-2.0-or-later (Mixxx)'" in yaml
    assert synth.mixxx_script_path is not None
    assert "mixxx_script:" in yaml
    assert synth.mixxx_script_path in yaml


def test_writer_default_target_is_runtime_state_not_repo(monkeypatch) -> None:
    """T2492-1a: PackWriter() with no args picks the runtime state dir,
    NOT the in-tree device-packs/ mirror."""
    import tempfile as _tf
    with _tf.TemporaryDirectory() as tmp:
        monkeypatch.setenv("MAP2_DEVICE_PACKS_RUNTIME_DIR", tmp)
        # Re-import to pick up the env var-resolved DEFAULT_RUNTIME_PACKS_DIR.
        # Actual writer instances re-resolve per __init__, so we don't
        # need to reimport — just construct.
        writer = PackWriter()
        from app.services.device_pack_auto_gen.lookup import REPO_ROOT
        assert str(writer._packs_dir).startswith(tmp)
        assert REPO_ROOT not in writer._packs_dir.parents

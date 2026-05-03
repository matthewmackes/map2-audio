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


def test_writer_writes_files_to_disk() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        writer = PackWriter(packs_dir=Path(tmp))
        result = writer.commit(
            vendor="testvendor",
            model="testmodel",
            manifest_yaml="schemaVersion: 1\nname: 'Test Model'\n",
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
            manifest_yaml="schemaVersion: 1\nname: 'x'\n",
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
                    manifest_yaml="schemaVersion: 1\nname: 'x'\n",
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
            manifest_yaml="schemaVersion: 1\nname: 'x'\n",
            mapping_xml="<?xml version='1.0'?><x/>",
            scripts_js="",
        )
        assert result.runtime_packs_dir == tmp


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

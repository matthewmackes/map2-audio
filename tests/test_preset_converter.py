"""
Unit tests for the Universal Preset Converter Service

Tests:
- Format detection
- FXP/FXB parsing
- MAP2UPF import/export
- VST3 metadata extraction
- LV2 TTL parsing
- JUCE state parsing
- Checksum verification
"""

import json
import struct
import tempfile
from pathlib import Path

import pytest

from app.services.preset_converter_service import (
    UniversalPresetConverter,
    FXPPresetConverter,
    MAP2UPFConverter,
    VST3PresetConverter,
    LV2PresetConverter,
    JUCEPresetConverter,
    PresetFormat,
    ConvertedPreset,
    get_preset_converter,
)


class TestPresetFormat:
    """Tests for PresetFormat enum."""

    def test_format_values(self):
        """Verify all expected formats are defined."""
        assert PresetFormat.MAP2UPF.value == "map2upf"
        assert PresetFormat.FXP.value == "fxp"
        assert PresetFormat.FXB.value == "fxb"
        assert PresetFormat.VST3.value == "vstpreset"
        assert PresetFormat.LV2.value == "lv2preset"
        assert PresetFormat.JUCE.value == "jucepreset"
        assert PresetFormat.UNKNOWN.value == "unknown"


class TestConvertedPreset:
    """Tests for ConvertedPreset dataclass."""

    def test_parameter_count(self):
        """Test parameter_count property."""
        preset = ConvertedPreset(
            success=True,
            name="Test",
            plugin_identifier="test://plugin",
            parameters={"param1": 0.5, "param2": 0.75, "param3": 1.0},
        )
        assert preset.parameter_count == 3

    def test_to_map2upf(self):
        """Test conversion to MAP2UPF format."""
        preset = ConvertedPreset(
            success=True,
            name="Test Preset",
            plugin_identifier="test://plugin",
            parameters={"gain": 0.5, "freq": 1000.0},
            original_format=PresetFormat.FXP,
            metadata={
                "description": "A test preset",
                "author": "Tester",
                "tags": ["test", "demo"],
            },
        )

        upf = preset.to_map2upf()

        assert upf["format_version"] == "1.0.0"
        assert upf["format_type"] == "map2upf"
        assert upf["metadata"]["name"] == "Test Preset"
        assert upf["metadata"]["original_format"] == "fxp"
        assert upf["target"]["plugin_uri"] == "test://plugin"
        assert upf["parameters"]["gain"] == 0.5
        assert upf["parameters"]["freq"] == 1000.0
        assert "checksum" in upf
        assert len(upf["checksum"]) == 64  # SHA-256 hex

    def test_checksum_deterministic(self):
        """Test that checksum is deterministic for same parameters."""
        preset1 = ConvertedPreset(
            success=True,
            name="Test",
            plugin_identifier="test://plugin",
            parameters={"a": 1, "b": 2},
        )
        preset2 = ConvertedPreset(
            success=True,
            name="Different Name",  # Name doesn't affect checksum
            plugin_identifier="test://plugin",
            parameters={"a": 1, "b": 2},
        )

        upf1 = preset1.to_map2upf()
        upf2 = preset2.to_map2upf()

        assert upf1["checksum"] == upf2["checksum"]


class TestUniversalPresetConverter:
    """Tests for the main UniversalPresetConverter orchestrator."""

    @pytest.fixture
    def converter(self):
        """Get converter instance."""
        return UniversalPresetConverter()

    def test_singleton(self):
        """Test singleton pattern."""
        c1 = get_preset_converter()
        c2 = get_preset_converter()
        assert c1 is c2

    def test_supported_formats(self, converter):
        """Test supported_formats property."""
        formats = converter.supported_formats
        assert len(formats) >= 5  # At least 5 converters

        format_names = [f["format"] for f in formats]
        assert "MAP2 Universal Preset Format" in format_names
        assert "VST2 Preset/Bank" in format_names
        assert "VST3 Preset" in format_names

    def test_detect_format(self, converter):
        """Test format detection from file extension."""
        assert converter.detect_format(Path("test.map2preset")) == PresetFormat.MAP2UPF
        assert converter.detect_format(Path("test.fxp")) == PresetFormat.FXP
        assert converter.detect_format(Path("test.fxb")) == PresetFormat.FXB
        assert converter.detect_format(Path("test.vstpreset")) == PresetFormat.VST3
        assert converter.detect_format(Path("test.lv2preset")) == PresetFormat.LV2
        assert converter.detect_format(Path("test.ttl")) == PresetFormat.LV2
        assert converter.detect_format(Path("test.jucepreset")) == PresetFormat.JUCE
        assert converter.detect_format(Path("test.unknown")) == PresetFormat.UNKNOWN

    def test_get_converter_for_file(self, converter):
        """Test getting appropriate converter for file."""
        assert isinstance(converter.get_converter_for_file(Path("test.map2preset")), MAP2UPFConverter)
        assert isinstance(converter.get_converter_for_file(Path("test.fxp")), FXPPresetConverter)
        assert isinstance(converter.get_converter_for_file(Path("test.vstpreset")), VST3PresetConverter)
        assert converter.get_converter_for_file(Path("test.unknown")) is None

    def test_import_unsupported_format(self, converter):
        """Test importing unsupported format returns error."""
        with tempfile.NamedTemporaryFile(suffix=".xyz", delete=False) as f:
            f.write(b"dummy data")
            tmp_path = Path(f.name)

        try:
            result = converter.import_preset(tmp_path)
            assert not result.success
            assert "Unsupported format" in result.errors[0]
        finally:
            tmp_path.unlink()

    def test_compute_file_hash(self, converter):
        """Test file hash computation."""
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"test content for hashing")
            tmp_path = Path(f.name)

        try:
            hash1 = converter.compute_file_hash(tmp_path)
            hash2 = converter.compute_file_hash(tmp_path)

            assert len(hash1) == 64  # SHA-256 hex
            assert hash1 == hash2  # Deterministic
        finally:
            tmp_path.unlink()


class TestMAP2UPFConverter:
    """Tests for MAP2 Universal Preset Format converter."""

    @pytest.fixture
    def converter(self):
        return MAP2UPFConverter()

    def test_supported_extensions(self, converter):
        assert ".map2preset" in converter.supported_extensions
        assert ".map2bank" in converter.supported_extensions

    def test_can_import(self, converter):
        assert converter.can_import(Path("test.map2preset"))
        assert converter.can_import(Path("test.map2bank"))
        assert not converter.can_import(Path("test.fxp"))

    def test_import_valid_preset(self, converter):
        """Test importing valid MAP2UPF file."""
        preset_data = {
            "format_version": "1.0.0",
            "format_type": "map2upf",
            "metadata": {
                "name": "Test Preset",
                "description": "A test preset",
                "author": "Tester",
                "tags": ["test"],
                "category": "User",
            },
            "target": {
                "plugin_uri": "http://test.plugin",
                "plugin_name": "Test Plugin",
            },
            "parameters": {"gain": 0.5, "freq": 1000.0},
        }

        with tempfile.NamedTemporaryFile(suffix=".map2preset", delete=False, mode="w") as f:
            json.dump(preset_data, f)
            tmp_path = Path(f.name)

        try:
            result = converter.import_preset(tmp_path)

            assert result.success
            assert result.name == "Test Preset"
            assert result.plugin_identifier == "http://test.plugin"
            assert result.parameters["gain"] == 0.5
            assert result.parameters["freq"] == 1000.0
            assert result.original_format == PresetFormat.MAP2UPF
        finally:
            tmp_path.unlink()

    def test_import_invalid_json(self, converter):
        """Test importing invalid JSON file."""
        with tempfile.NamedTemporaryFile(suffix=".map2preset", delete=False, mode="w") as f:
            f.write("not valid json {{{")
            tmp_path = Path(f.name)

        try:
            result = converter.import_preset(tmp_path)
            assert not result.success
            assert "Invalid JSON" in result.errors[0]
        finally:
            tmp_path.unlink()

    def test_export_preset(self, converter):
        """Test exporting to MAP2UPF format."""
        preset_data = {
            "format_version": "1.0.0",
            "format_type": "map2upf",
            "metadata": {"name": "Export Test"},
            "target": {"plugin_uri": "test://plugin"},
            "parameters": {"param": 0.5},
        }

        with tempfile.NamedTemporaryFile(suffix=".map2preset", delete=False) as f:
            tmp_path = Path(f.name)

        try:
            success = converter.export_preset(preset_data, tmp_path)
            assert success

            # Verify exported content
            with open(tmp_path) as f:
                exported = json.load(f)

            assert exported["format_type"] == "map2upf"
            assert exported["parameters"]["param"] == 0.5
        finally:
            tmp_path.unlink()


class TestFXPPresetConverter:
    """Tests for VST2 FXP/FXB converter."""

    @pytest.fixture
    def converter(self):
        return FXPPresetConverter()

    def test_supported_extensions(self, converter):
        assert ".fxp" in converter.supported_extensions
        assert ".fxb" in converter.supported_extensions

    def test_can_import(self, converter):
        assert converter.can_import(Path("test.fxp"))
        assert converter.can_import(Path("test.fxb"))
        assert not converter.can_import(Path("test.map2preset"))

    def test_import_valid_fxp_regular(self, converter):
        """Test importing valid FXP with float parameters."""
        # Create minimal valid FXP file
        with tempfile.NamedTemporaryFile(suffix=".fxp", delete=False) as f:
            # Magic
            f.write(b"CcnK")
            # Size (big-endian)
            f.write(struct.pack(">I", 60))
            # Type: Regular preset
            f.write(b"FxCk")
            # Version
            f.write(struct.pack(">I", 1))
            # FX ID
            f.write(struct.pack(">I", 12345))
            # FX Version
            f.write(struct.pack(">I", 1))
            # Num params
            f.write(struct.pack(">I", 3))
            # Preset name (28 bytes)
            name = b"TestPreset"
            f.write(name + b"\x00" * (28 - len(name)))
            # Parameters (3 floats)
            f.write(struct.pack(">f", 0.5))
            f.write(struct.pack(">f", 0.75))
            f.write(struct.pack(">f", 1.0))

            tmp_path = Path(f.name)

        try:
            result = converter.import_preset(tmp_path)

            assert result.success
            assert result.name == "TestPreset"
            assert result.plugin_identifier == "vst2:12345"
            assert len(result.parameters) == 3
            assert abs(result.parameters["param_0"] - 0.5) < 0.0001
            assert abs(result.parameters["param_1"] - 0.75) < 0.0001
            assert abs(result.parameters["param_2"] - 1.0) < 0.0001
            assert result.original_format == PresetFormat.FXP
        finally:
            tmp_path.unlink()

    def test_import_invalid_magic(self, converter):
        """Test importing file with invalid magic."""
        with tempfile.NamedTemporaryFile(suffix=".fxp", delete=False) as f:
            f.write(b"XXXX")  # Invalid magic
            f.write(b"\x00" * 100)
            tmp_path = Path(f.name)

        try:
            result = converter.import_preset(tmp_path)
            assert not result.success
            assert "Invalid FXP magic" in result.errors[0]
        finally:
            tmp_path.unlink()

    def test_import_fxb_regular_bank_first_program(self, converter):
        """Test importing FXB regular bank extracts first program data."""
        with tempfile.NamedTemporaryFile(suffix=".fxb", delete=False) as f:
            # FXB header
            f.write(b"CcnK")
            f.write(struct.pack(">I", 0))
            f.write(b"FxBk")
            f.write(struct.pack(">I", 1))      # version
            f.write(struct.pack(">I", 54321))  # fx_id
            f.write(struct.pack(">I", 2))      # fx_version
            f.write(struct.pack(">I", 2))      # num programs
            f.write(b"\x00" * 128)            # future/reserved

            # First program (FxCk)
            f.write(b"CcnK")
            f.write(struct.pack(">I", 0))
            f.write(b"FxCk")
            f.write(struct.pack(">I", 1))      # program version
            f.write(struct.pack(">I", 54321))  # program fx_id
            f.write(struct.pack(">I", 2))      # program fx_version
            f.write(struct.pack(">I", 2))      # num params
            name = b"BankPreset1"
            f.write(name + b"\x00" * (28 - len(name)))
            f.write(struct.pack(">f", 0.25))
            f.write(struct.pack(">f", 0.75))

            tmp_path = Path(f.name)

        try:
            result = converter.import_preset(tmp_path)
            assert result.success
            assert result.name == "BankPreset1"
            assert abs(result.parameters["param_0"] - 0.25) < 0.0001
            assert abs(result.parameters["param_1"] - 0.75) < 0.0001
            assert any("FXB bank imported first program" in w for w in result.warnings)
            assert result.metadata.get("item_count") == 2
        finally:
            tmp_path.unlink()

    def test_import_fxb_opaque_bank_chunk(self, converter):
        """Test importing FXB opaque bank preserves chunk data."""
        chunk = b"bankchunk"
        with tempfile.NamedTemporaryFile(suffix=".fxb", delete=False) as f:
            f.write(b"CcnK")
            f.write(struct.pack(">I", 0))
            f.write(b"FBCh")
            f.write(struct.pack(">I", 1))
            f.write(struct.pack(">I", 11111))
            f.write(struct.pack(">I", 3))
            f.write(struct.pack(">I", 4))      # num programs metadata
            f.write(b"\x00" * 128)
            f.write(struct.pack(">I", len(chunk)))
            f.write(chunk)
            tmp_path = Path(f.name)

        try:
            result = converter.import_preset(tmp_path)
            assert result.success
            assert result.state_chunk == chunk
            assert any("FXB opaque bank imported as chunk data" in w for w in result.warnings)
            assert result.metadata.get("item_count") == 4
        finally:
            tmp_path.unlink()

    def test_export_not_supported(self, converter):
        """Test that FXP export is not supported (legacy format)."""
        with tempfile.NamedTemporaryFile(suffix=".fxp", delete=False) as f:
            tmp_path = Path(f.name)

        try:
            success = converter.export_preset({}, tmp_path)
            assert not success
        finally:
            tmp_path.unlink()


class TestVST3PresetConverter:
    """Tests for VST3 preset converter."""

    @pytest.fixture
    def converter(self):
        return VST3PresetConverter()

    def test_supported_extensions(self, converter):
        assert ".vstpreset" in converter.supported_extensions

    def test_can_import(self, converter):
        assert converter.can_import(Path("test.vstpreset"))
        assert not converter.can_import(Path("test.fxp"))

    def test_import_binary_state(self, converter):
        """Test importing VST3 preset stores as state chunk."""
        with tempfile.NamedTemporaryFile(suffix=".vstpreset", delete=False) as f:
            # Write some binary data
            f.write(b"VST3 binary state data here")
            tmp_path = Path(f.name)

        try:
            result = converter.import_preset(tmp_path, target_plugin_uri="test://vst3")

            assert result.success
            assert result.plugin_identifier == "test://vst3"
            assert result.state_chunk is not None
            assert len(result.state_chunk) > 0
            assert result.original_format == PresetFormat.VST3
            assert len(result.warnings) > 0  # Should warn about binary state
        finally:
            tmp_path.unlink()


class TestLV2PresetConverter:
    """Tests for LV2 preset converter."""

    @pytest.fixture
    def converter(self):
        return LV2PresetConverter()

    def test_supported_extensions(self, converter):
        assert ".lv2preset" in converter.supported_extensions
        assert ".ttl" in converter.supported_extensions

    def test_can_import(self, converter):
        assert converter.can_import(Path("test.lv2preset"))
        assert converter.can_import(Path("preset.ttl"))
        assert not converter.can_import(Path("test.fxp"))

    def test_import_ttl_preset(self, converter):
        """Test importing LV2 TTL preset file."""
        ttl_content = """
@prefix lv2: <http://lv2plug.in/ns/lv2core#> .
@prefix pset: <http://lv2plug.in/ns/ext/presets#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<http://example.org/preset>
    a pset:Preset ;
    rdfs:label "Test LV2 Preset" ;
    lv2:appliesTo <http://example.org/plugin> .
"""
        with tempfile.NamedTemporaryFile(suffix=".ttl", delete=False, mode="w") as f:
            f.write(ttl_content)
            tmp_path = Path(f.name)

        try:
            result = converter.import_preset(tmp_path)

            assert result.success
            assert result.name == "Test LV2 Preset"
            assert "http://example.org/plugin" in result.plugin_identifier
            assert result.original_format == PresetFormat.LV2
        finally:
            tmp_path.unlink()

    def test_export_ttl(self, converter):
        """Test exporting to LV2 TTL format."""
        preset_data = {
            "metadata": {"name": "Export Test"},
            "target": {"plugin_uri": "http://test.plugin"},
            "parameters": {"gain": 0.5, "freq": 1000},
        }

        with tempfile.NamedTemporaryFile(suffix=".ttl", delete=False) as f:
            tmp_path = Path(f.name)

        try:
            success = converter.export_preset(preset_data, tmp_path)
            assert success

            # Verify content
            content = tmp_path.read_text()
            assert "@prefix lv2:" in content
            assert "@prefix pset:" in content
            assert "Export Test" in content
            assert "http://test.plugin" in content
        finally:
            tmp_path.unlink()


class TestJUCEPresetConverter:
    """Tests for JUCE preset converter."""

    @pytest.fixture
    def converter(self):
        return JUCEPresetConverter()

    def test_supported_extensions(self, converter):
        assert ".jucepreset" in converter.supported_extensions
        assert ".xml" in converter.supported_extensions

    def test_can_import(self, converter):
        assert converter.can_import(Path("test.jucepreset"))
        assert converter.can_import(Path("state.xml"))
        assert not converter.can_import(Path("test.fxp"))

    def test_import_xml_state(self, converter):
        """Test importing JUCE XML state file."""
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<PRESET name="Test JUCE Preset" plugin="test://juce">
    <PARAMETERS>
        <PARAM id="gain" value="0.5"/>
        <PARAM id="freq" value="1000"/>
    </PARAMETERS>
</PRESET>
"""
        with tempfile.NamedTemporaryFile(suffix=".jucepreset", delete=False, mode="w") as f:
            f.write(xml_content)
            tmp_path = Path(f.name)

        try:
            result = converter.import_preset(tmp_path)

            assert result.success
            assert result.name == "Test JUCE Preset"
            assert result.parameters.get("gain") == 0.5
            assert result.parameters.get("freq") == 1000
            assert result.original_format == PresetFormat.JUCE
        finally:
            tmp_path.unlink()

    def test_import_binary_state(self, converter):
        """Test importing JUCE binary state stores as chunk."""
        with tempfile.NamedTemporaryFile(suffix=".jucepreset", delete=False) as f:
            # Binary data (not XML)
            f.write(b"\x00\x01\x02\x03binary state")
            tmp_path = Path(f.name)

        try:
            result = converter.import_preset(tmp_path)

            assert result.success
            assert result.state_chunk is not None
            assert result.original_format == PresetFormat.JUCE
        finally:
            tmp_path.unlink()

    def test_export_xml(self, converter):
        """Test exporting to JUCE XML format."""
        preset_data = {
            "metadata": {"name": "Export Test"},
            "target": {"plugin_uri": "http://test.plugin"},
            "parameters": {"gain": 0.5, "freq": 1000},
        }

        with tempfile.NamedTemporaryFile(suffix=".jucepreset", delete=False) as f:
            tmp_path = Path(f.name)

        try:
            success = converter.export_preset(preset_data, tmp_path)
            assert success

            # Verify content
            content = tmp_path.read_text()
            assert "<?xml" in content
            assert "PRESET" in content
            assert "Export Test" in content
        finally:
            tmp_path.unlink()


class TestBatchImport:
    """Tests for batch import functionality."""

    @pytest.fixture
    def converter(self):
        return UniversalPresetConverter()

    def test_batch_import(self, converter):
        """Test importing multiple files at once."""
        files = []

        try:
            # Create multiple test files
            for i in range(3):
                preset_data = {
                    "format_version": "1.0.0",
                    "format_type": "map2upf",
                    "metadata": {"name": f"Batch Preset {i}"},
                    "target": {"plugin_uri": "test://plugin"},
                    "parameters": {"value": float(i)},
                }

                with tempfile.NamedTemporaryFile(
                    suffix=".map2preset", delete=False, mode="w"
                ) as f:
                    json.dump(preset_data, f)
                    files.append(Path(f.name))

            # Batch import
            results = converter.batch_import(files)

            assert len(results) == 3
            assert all(r.success for r in results)
            assert [r.name for r in results] == [
                "Batch Preset 0",
                "Batch Preset 1",
                "Batch Preset 2",
            ]

        finally:
            for f in files:
                f.unlink()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

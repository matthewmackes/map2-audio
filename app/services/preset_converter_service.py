"""
Universal Preset Converter Service
Handles import/export across all supported preset formats.

Supported Formats:
- MAP2UPF (.map2preset) - MAP2 Universal Preset Format (primary, open standard)
- FXP/FXB (.fxp, .fxb) - VST2 presets (import only, legacy)
- VST3 (.vstpreset) - VST3 presets (import/export)
- LV2 (.lv2preset) - LV2 presets (import/export)
- JUCE (.jucepreset) - JUCE state files (import/export)

Author: MAP2 Audio Team
License: MIT
"""

import base64
import hashlib
import json
import logging
import struct
import uuid
import xml.etree.ElementTree as ET
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, UTC
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)


# =============================================================================
# ENUMS AND DATA CLASSES
# =============================================================================

class PresetFormat(Enum):
    """Supported preset file formats."""
    MAP2UPF = "map2upf"        # MAP2 Universal Preset Format (primary)
    VST3 = "vstpreset"         # VST3 preset chunks
    FXP = "fxp"                # VST2 single preset
    FXB = "fxb"                # VST2 bank (multiple presets)
    AUPRESET = "aupreset"      # Audio Unit preset
    LV2 = "lv2preset"          # LV2 preset bundle
    JUCE = "jucepreset"        # JUCE state file
    UNKNOWN = "unknown"


@dataclass
class ConvertedPreset:
    """Result of preset conversion."""
    success: bool
    name: str
    plugin_identifier: str  # Plugin URI or unique ID
    parameters: Dict[str, Any]  # Parameter name/symbol -> value
    state_chunk: Optional[bytes] = None  # Native plugin state (optional)
    original_format: PresetFormat = PresetFormat.UNKNOWN
    metadata: Dict[str, Any] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    @property
    def parameter_count(self) -> int:
        return len(self.parameters)

    def to_map2upf(self) -> Dict[str, Any]:
        """Convert to MAP2 Universal Preset Format JSON."""
        return {
            "format_version": "1.0.0",
            "format_type": "map2upf",
            "metadata": {
                "name": self.name,
                "description": self.metadata.get("description", ""),
                "author": self.metadata.get("author", "Unknown"),
                "tags": self.metadata.get("tags", []),
                "category": self.metadata.get("category", "Imported"),
                "license": self.metadata.get("license", "CC-BY-4.0"),
                "created_at": datetime.now(UTC).isoformat(),
                "original_format": self.original_format.value,
            },
            "target": {
                "plugin_uri": self.plugin_identifier,
                "plugin_name": self.metadata.get("plugin_name", ""),
                "plugin_format": self.metadata.get("plugin_format", "unknown"),
            },
            "parameters": self.parameters,
            "state_chunk": base64.b64encode(self.state_chunk).decode() if self.state_chunk else None,
            "checksum": self._compute_checksum(),
        }

    def _compute_checksum(self) -> str:
        """Compute SHA-256 checksum for integrity verification."""
        data = json.dumps({
            "parameters": self.parameters,
            "plugin_identifier": self.plugin_identifier,
        }, sort_keys=True)
        return hashlib.sha256(data.encode()).hexdigest()


@dataclass
class PresetBank:
    """Collection of presets (for FXB or MAP2 bank files)."""
    name: str
    presets: List[ConvertedPreset]
    original_format: PresetFormat
    metadata: Dict[str, Any] = field(default_factory=dict)


# =============================================================================
# BASE CONVERTER CLASS
# =============================================================================

class BasePresetConverter(ABC):
    """Abstract base class for preset format converters."""

    @property
    @abstractmethod
    def supported_extensions(self) -> List[str]:
        """Return list of supported file extensions (lowercase, with dot)."""
        pass

    @property
    @abstractmethod
    def format_name(self) -> str:
        """Human-readable format name."""
        pass

    def can_import(self, file_path: Path) -> bool:
        """Check if this converter can handle the file."""
        return file_path.suffix.lower() in self.supported_extensions

    @abstractmethod
    def import_preset(self, file_path: Path, target_plugin_uri: Optional[str] = None) -> ConvertedPreset:
        """Import a preset from file."""
        pass

    def export_preset(self, preset_data: Dict, file_path: Path) -> bool:
        """Export a preset to file. Default: not supported."""
        return False

    def _create_error_result(self, error_message: str) -> ConvertedPreset:
        """Create a failed conversion result."""
        return ConvertedPreset(
            success=False,
            name="",
            plugin_identifier="",
            parameters={},
            errors=[error_message]
        )


# =============================================================================
# MAP2 UNIVERSAL PRESET FORMAT CONVERTER
# =============================================================================

class MAP2UPFConverter(BasePresetConverter):
    """Converter for MAP2 Universal Preset Format (.map2preset).

    This is the primary open format for cross-platform preset sharing.
    """

    @property
    def supported_extensions(self) -> List[str]:
        return [".map2preset", ".map2bank"]

    @property
    def format_name(self) -> str:
        return "MAP2 Universal Preset Format"

    def import_preset(self, file_path: Path, target_plugin_uri: Optional[str] = None) -> ConvertedPreset:
        """Import MAP2UPF preset from JSON file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Validate format
            if data.get("format_type") != "map2upf":
                return self._create_error_result("Not a valid MAP2UPF file")

            metadata = data.get("metadata", {})
            target = data.get("target", {})

            # Decode state chunk if present
            state_chunk = None
            if data.get("state_chunk"):
                try:
                    state_chunk = base64.b64decode(data["state_chunk"])
                except Exception:
                    pass  # Ignore invalid base64

            return ConvertedPreset(
                success=True,
                name=metadata.get("name", file_path.stem),
                plugin_identifier=target_plugin_uri or target.get("plugin_uri", ""),
                parameters=data.get("parameters", {}),
                state_chunk=state_chunk,
                original_format=PresetFormat.MAP2UPF,
                metadata={
                    "description": metadata.get("description", ""),
                    "author": metadata.get("author", "Unknown"),
                    "tags": metadata.get("tags", []),
                    "category": metadata.get("category", "Imported"),
                    "license": metadata.get("license", "CC-BY-4.0"),
                    "plugin_name": target.get("plugin_name", ""),
                    "plugin_format": target.get("plugin_format", ""),
                },
                errors=[]
            )

        except json.JSONDecodeError as e:
            return self._create_error_result(f"Invalid JSON: {e}")
        except Exception as e:
            return self._create_error_result(f"Import error: {e}")

    def export_preset(self, preset_data: Dict, file_path: Path) -> bool:
        """Export preset to MAP2UPF format."""
        try:
            # Ensure format metadata
            preset_data.setdefault("format_version", "1.0.0")
            preset_data.setdefault("format_type", "map2upf")

            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(preset_data, f, indent=2)

            return True
        except Exception as e:
            logger.error(f"Failed to export MAP2UPF: {e}")
            return False


# =============================================================================
# VST2 FXP/FXB CONVERTER
# =============================================================================

class FXPPresetConverter(BasePresetConverter):
    """Converter for VST2 FXP/FXB preset files (import only).

    FXP = Single preset
    FXB = Bank of presets

    These are legacy formats but widely used. Read-only support.
    """

    # FXP file format constants
    FXP_MAGIC = b'CcnK'        # Chunk magic ("CcnK")
    FXP_REGULAR = b'FxCk'      # Regular preset with float parameters
    FXP_OPAQUE = b'FPCh'       # Opaque chunk (plugin-specific binary)
    FXB_REGULAR = b'FxBk'      # Regular bank
    FXB_OPAQUE = b'FBCh'       # Opaque bank

    @property
    def supported_extensions(self) -> List[str]:
        return [".fxp", ".fxb"]

    @property
    def format_name(self) -> str:
        return "VST2 Preset/Bank"

    def import_preset(self, file_path: Path, target_plugin_uri: Optional[str] = None) -> ConvertedPreset:
        """Import FXP/FXB preset file."""
        try:
            with open(file_path, 'rb') as f:
                return self._parse_fxp_file(f, file_path.stem, target_plugin_uri)
        except Exception as e:
            return self._create_error_result(f"Failed to parse FXP: {e}")

    def _parse_fxp_file(self, f, default_name: str, target_plugin_uri: Optional[str]) -> ConvertedPreset:
        """Parse FXP binary format."""
        # Read and validate header
        magic = f.read(4)
        if magic != self.FXP_MAGIC:
            return self._create_error_result(f"Invalid FXP magic: expected {self.FXP_MAGIC}, got {magic}")

        # Read header fields (big-endian)
        byte_size = struct.unpack('>I', f.read(4))[0]
        fx_magic = f.read(4)
        version = struct.unpack('>I', f.read(4))[0]
        fx_id = struct.unpack('>I', f.read(4))[0]
        fx_version = struct.unpack('>I', f.read(4))[0]
        num_params = struct.unpack('>I', f.read(4))[0]

        # Read preset name (28 bytes, null-terminated)
        preset_name_bytes = f.read(28)
        preset_name = preset_name_bytes.rstrip(b'\x00').decode('ascii', errors='ignore')
        if not preset_name:
            preset_name = default_name

        # Parse based on preset type
        parameters = {}
        state_chunk = None
        warnings = []

        if fx_magic == self.FXP_REGULAR:
            # Regular preset with float parameters
            for i in range(num_params):
                try:
                    param_value = struct.unpack('>f', f.read(4))[0]
                    parameters[f"param_{i}"] = round(param_value, 6)
                except struct.error:
                    warnings.append(f"Failed to read parameter {i}")
                    break

        elif fx_magic == self.FXP_OPAQUE:
            # Opaque chunk - plugin-specific binary data
            chunk_size = struct.unpack('>I', f.read(4))[0]
            state_chunk = f.read(chunk_size)
            warnings.append("Opaque chunk preset - parameters may need plugin-specific mapping")

        elif fx_magic in (self.FXB_REGULAR, self.FXB_OPAQUE):
            # Bank file - for now just extract first preset info
            warnings.append("FXB bank file detected - importing as single preset reference")

        else:
            return self._create_error_result(f"Unknown FXP type: {fx_magic}")

        return ConvertedPreset(
            success=True,
            name=preset_name,
            plugin_identifier=target_plugin_uri or f"vst2:{fx_id}",
            parameters=parameters,
            state_chunk=state_chunk,
            original_format=PresetFormat.FXP,
            metadata={
                "fx_id": fx_id,
                "fx_version": fx_version,
                "fxp_version": version,
                "plugin_format": "vst2",
            },
            warnings=warnings
        )

    def export_preset(self, preset_data: Dict, file_path: Path) -> bool:
        """FXP export not supported (legacy format)."""
        logger.warning("FXP export not supported - use MAP2UPF or VST3 format")
        return False


# =============================================================================
# VST3 PRESET CONVERTER
# =============================================================================

class VST3PresetConverter(BasePresetConverter):
    """Converter for VST3 .vstpreset files.

    VST3 presets contain:
    - Component state (processor state)
    - Controller state (editor state)
    - Metadata (name, author, etc.)
    """

    @property
    def supported_extensions(self) -> List[str]:
        return [".vstpreset"]

    @property
    def format_name(self) -> str:
        return "VST3 Preset"

    def import_preset(self, file_path: Path, target_plugin_uri: Optional[str] = None) -> ConvertedPreset:
        """Import VST3 preset file.

        VST3 presets are binary files with a specific structure.
        We extract what we can and store the state chunk for native loading.
        """
        try:
            with open(file_path, 'rb') as f:
                data = f.read()

            # VST3 presets are complex binary formats
            # For cross-platform use, we store the raw state chunk
            # and attempt to extract metadata if present

            # Try to find metadata in the file
            metadata = self._extract_vst3_metadata(data)

            return ConvertedPreset(
                success=True,
                name=metadata.get("name", file_path.stem),
                plugin_identifier=target_plugin_uri or metadata.get("plugin_id", ""),
                parameters={},  # VST3 params are in the binary chunk
                state_chunk=data,
                original_format=PresetFormat.VST3,
                metadata={
                    "plugin_format": "vst3",
                    **metadata,
                },
                warnings=["VST3 preset loaded as binary state - requires native VST3 plugin to apply"]
            )

        except Exception as e:
            return self._create_error_result(f"VST3 import error: {e}")

    def _extract_vst3_metadata(self, data: bytes) -> Dict[str, Any]:
        """Try to extract metadata from VST3 preset binary."""
        metadata = {}

        # VST3 presets may contain XML metadata
        try:
            # Look for XML-like content
            xml_start = data.find(b'<?xml')
            if xml_start >= 0:
                xml_end = data.find(b'</MetaInfo>', xml_start)
                if xml_end > xml_start:
                    xml_data = data[xml_start:xml_end + len(b'</MetaInfo>')]
                    root = ET.fromstring(xml_data)

                    for attr in root.findall('.//Attribute'):
                        attr_id = attr.get('id', '')
                        attr_value = attr.get('value', '')
                        if attr_id == 'MediaTitle':
                            metadata['name'] = attr_value
                        elif attr_id == 'MediaCreator':
                            metadata['author'] = attr_value
        except Exception:
            pass  # Metadata extraction is optional

        return metadata

    def export_preset(self, preset_data: Dict, file_path: Path) -> bool:
        """Export to VST3 format (requires state chunk from native plugin)."""
        if "state_chunk" not in preset_data:
            logger.warning("Cannot export to VST3 without native state chunk")
            return False

        try:
            state_chunk = preset_data["state_chunk"]
            if isinstance(state_chunk, str):
                state_chunk = base64.b64decode(state_chunk)

            with open(file_path, 'wb') as f:
                f.write(state_chunk)
            return True
        except Exception as e:
            logger.error(f"VST3 export error: {e}")
            return False


# =============================================================================
# LV2 PRESET CONVERTER
# =============================================================================

class LV2PresetConverter(BasePresetConverter):
    """Converter for LV2 preset bundles.

    LV2 presets are stored as Turtle (TTL) files with parameter values.
    """

    @property
    def supported_extensions(self) -> List[str]:
        return [".lv2preset", ".ttl"]

    @property
    def format_name(self) -> str:
        return "LV2 Preset"

    def import_preset(self, file_path: Path, target_plugin_uri: Optional[str] = None) -> ConvertedPreset:
        """Import LV2 preset from TTL file or preset bundle."""
        try:
            # Handle both single TTL files and preset bundles
            if file_path.is_dir():
                ttl_file = file_path / "preset.ttl"
                if not ttl_file.exists():
                    # Try manifest.ttl
                    ttl_file = file_path / "manifest.ttl"
            else:
                ttl_file = file_path

            if not ttl_file.exists():
                return self._create_error_result(f"TTL file not found: {ttl_file}")

            with open(ttl_file, 'r', encoding='utf-8') as f:
                ttl_content = f.read()

            # Parse TTL content
            return self._parse_ttl_preset(ttl_content, file_path.stem, target_plugin_uri)

        except Exception as e:
            return self._create_error_result(f"LV2 import error: {e}")

    def _parse_ttl_preset(self, ttl_content: str, default_name: str, target_plugin_uri: Optional[str]) -> ConvertedPreset:
        """Parse LV2 Turtle preset format (simplified parser)."""
        parameters = {}
        preset_name = default_name
        plugin_uri = target_plugin_uri or ""

        # Simple line-by-line parsing (not a full TTL parser)
        lines = ttl_content.split('\n')

        for line in lines:
            line = line.strip()

            # Look for preset name
            if 'rdfs:label' in line:
                try:
                    name_match = line.split('"')[1]
                    preset_name = name_match
                except (IndexError, ValueError):
                    pass

            # Look for plugin reference
            if 'lv2:appliesTo' in line:
                try:
                    uri_start = line.find('<')
                    uri_end = line.find('>')
                    if uri_start >= 0 and uri_end > uri_start:
                        plugin_uri = line[uri_start + 1:uri_end]
                except Exception:
                    pass

            # Look for port values
            if 'lv2:symbol' in line or 'pset:value' in line:
                # This is a simplified parser - real LV2 parsing is more complex
                pass

        return ConvertedPreset(
            success=True,
            name=preset_name,
            plugin_identifier=target_plugin_uri or plugin_uri,
            parameters=parameters,
            original_format=PresetFormat.LV2,
            metadata={
                "plugin_format": "lv2",
                "raw_ttl": ttl_content,
            },
            warnings=["LV2 preset parsing is simplified - some parameters may need manual mapping"]
        )

    def export_preset(self, preset_data: Dict, file_path: Path) -> bool:
        """Export preset to LV2 TTL format."""
        try:
            params = preset_data.get("parameters", {})
            plugin_uri = preset_data.get("target", {}).get("plugin_uri", "")
            name = preset_data.get("metadata", {}).get("name", "Preset")

            # Generate TTL content
            ttl_lines = [
                "@prefix lv2: <http://lv2plug.in/ns/lv2core#> .",
                "@prefix pset: <http://lv2plug.in/ns/ext/presets#> .",
                "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
                "",
                f'<{file_path.stem}>',
                "    a pset:Preset ;",
                f'    rdfs:label "{name}" ;',
                f'    lv2:appliesTo <{plugin_uri}> ;',
            ]

            # Add port values
            for symbol, value in params.items():
                ttl_lines.append(f'    lv2:port [')
                ttl_lines.append(f'        lv2:symbol "{symbol}" ;')
                ttl_lines.append(f'        pset:value {value}')
                ttl_lines.append(f'    ] ;')

            ttl_lines.append("    .")

            with open(file_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(ttl_lines))

            return True
        except Exception as e:
            logger.error(f"LV2 export error: {e}")
            return False


# =============================================================================
# JUCE PRESET CONVERTER
# =============================================================================

class JUCEPresetConverter(BasePresetConverter):
    """Converter for JUCE state files (.jucepreset).

    JUCE state files are typically XML or binary ValueTree formats.
    """

    @property
    def supported_extensions(self) -> List[str]:
        return [".jucepreset", ".xml"]

    @property
    def format_name(self) -> str:
        return "JUCE State"

    def import_preset(self, file_path: Path, target_plugin_uri: Optional[str] = None) -> ConvertedPreset:
        """Import JUCE state file."""
        try:
            with open(file_path, 'rb') as f:
                data = f.read()

            # Check if it's XML
            if data.startswith(b'<?xml') or data.startswith(b'<'):
                return self._parse_xml_state(data, file_path.stem, target_plugin_uri)
            else:
                # Binary ValueTree format
                return self._parse_binary_state(data, file_path.stem, target_plugin_uri)

        except Exception as e:
            return self._create_error_result(f"JUCE import error: {e}")

    def _parse_xml_state(self, data: bytes, default_name: str, target_plugin_uri: Optional[str]) -> ConvertedPreset:
        """Parse JUCE XML state format."""
        try:
            root = ET.fromstring(data)
            parameters = {}

            # JUCE APVTS typically uses PARAM elements
            for param in root.findall('.//PARAM'):
                param_id = param.get('id', '')
                param_value = param.get('value', '0')
                if param_id:
                    try:
                        parameters[param_id] = float(param_value)
                    except ValueError:
                        parameters[param_id] = param_value

            return ConvertedPreset(
                success=True,
                name=root.get('name', default_name),
                plugin_identifier=target_plugin_uri or root.get('plugin', ''),
                parameters=parameters,
                original_format=PresetFormat.JUCE,
                metadata={
                    "plugin_format": "juce",
                },
            )
        except ET.ParseError as e:
            return self._create_error_result(f"Invalid XML: {e}")

    def _parse_binary_state(self, data: bytes, default_name: str, target_plugin_uri: Optional[str]) -> ConvertedPreset:
        """Parse JUCE binary ValueTree state."""
        # Binary ValueTree is complex - store as state chunk
        return ConvertedPreset(
            success=True,
            name=default_name,
            plugin_identifier=target_plugin_uri or "",
            parameters={},
            state_chunk=data,
            original_format=PresetFormat.JUCE,
            metadata={
                "plugin_format": "juce",
            },
            warnings=["JUCE binary state loaded - requires native JUCE plugin to apply"]
        )

    def export_preset(self, preset_data: Dict, file_path: Path) -> bool:
        """Export to JUCE XML format."""
        try:
            params = preset_data.get("parameters", {})
            name = preset_data.get("metadata", {}).get("name", "Preset")
            plugin_uri = preset_data.get("target", {}).get("plugin_uri", "")

            # Create XML structure
            root = ET.Element("PRESET")
            root.set("name", name)
            root.set("plugin", plugin_uri)

            params_elem = ET.SubElement(root, "PARAMETERS")
            for param_id, value in params.items():
                param_elem = ET.SubElement(params_elem, "PARAM")
                param_elem.set("id", param_id)
                param_elem.set("value", str(value))

            tree = ET.ElementTree(root)
            tree.write(file_path, encoding='utf-8', xml_declaration=True)

            return True
        except Exception as e:
            logger.error(f"JUCE export error: {e}")
            return False


# =============================================================================
# UNIVERSAL CONVERTER (ORCHESTRATOR)
# =============================================================================

class UniversalPresetConverter:
    """Main converter orchestrating all format converters.

    Usage:
        converter = UniversalPresetConverter()
        result = converter.import_preset(Path("my_preset.fxp"))
        if result.success:
            print(f"Imported: {result.name} with {result.parameter_count} parameters")
    """

    def __init__(self):
        self.converters: List[BasePresetConverter] = [
            MAP2UPFConverter(),
            FXPPresetConverter(),
            VST3PresetConverter(),
            LV2PresetConverter(),
            JUCEPresetConverter(),
        ]

        # Build extension -> converter mapping
        self._ext_map: Dict[str, BasePresetConverter] = {}
        for converter in self.converters:
            for ext in converter.supported_extensions:
                self._ext_map[ext] = converter

    @property
    def supported_formats(self) -> List[Dict[str, Any]]:
        """Get list of supported formats with metadata."""
        return [
            {
                "format": c.format_name,
                "extensions": c.supported_extensions,
                "can_export": hasattr(c, 'export_preset') and c.export_preset != BasePresetConverter.export_preset,
            }
            for c in self.converters
        ]

    def detect_format(self, file_path: Path) -> PresetFormat:
        """Detect preset format from file extension."""
        ext = file_path.suffix.lower()

        format_map = {
            '.map2preset': PresetFormat.MAP2UPF,
            '.map2bank': PresetFormat.MAP2UPF,
            '.vstpreset': PresetFormat.VST3,
            '.fxp': PresetFormat.FXP,
            '.fxb': PresetFormat.FXB,
            '.aupreset': PresetFormat.AUPRESET,
            '.lv2preset': PresetFormat.LV2,
            '.ttl': PresetFormat.LV2,
            '.jucepreset': PresetFormat.JUCE,
        }

        return format_map.get(ext, PresetFormat.UNKNOWN)

    def get_converter_for_file(self, file_path: Path) -> Optional[BasePresetConverter]:
        """Get appropriate converter for file."""
        ext = file_path.suffix.lower()
        return self._ext_map.get(ext)

    def import_preset(
        self,
        file_path: Path,
        target_plugin_uri: Optional[str] = None
    ) -> ConvertedPreset:
        """Import preset from any supported format.

        Args:
            file_path: Path to preset file
            target_plugin_uri: Optional plugin URI to map the preset to

        Returns:
            ConvertedPreset with parameters and metadata
        """
        converter = self.get_converter_for_file(file_path)

        if converter is None:
            return ConvertedPreset(
                success=False,
                name="",
                plugin_identifier="",
                parameters={},
                original_format=PresetFormat.UNKNOWN,
                errors=[f"Unsupported format: {file_path.suffix}"]
            )

        logger.info(f"Importing {file_path.name} using {converter.format_name} converter")
        return converter.import_preset(file_path, target_plugin_uri)

    def export_preset(
        self,
        preset_data: Dict[str, Any],
        file_path: Path,
        target_format: Optional[PresetFormat] = None
    ) -> bool:
        """Export preset to specified format.

        Args:
            preset_data: Preset data dictionary (MAP2UPF format)
            file_path: Output file path
            target_format: Target format (auto-detected from extension if None)

        Returns:
            True if export successful
        """
        # Determine format
        if target_format is None:
            target_format = self.detect_format(file_path)

        converter = self.get_converter_for_file(file_path)

        if converter is None:
            logger.error(f"No converter for export format: {file_path.suffix}")
            return False

        return converter.export_preset(preset_data, file_path)

    def compute_file_hash(self, file_path: Path) -> str:
        """Compute SHA-256 hash of file for deduplication."""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def batch_import(
        self,
        file_paths: List[Path],
        target_plugin_uri: Optional[str] = None
    ) -> List[ConvertedPreset]:
        """Import multiple preset files.

        Args:
            file_paths: List of preset file paths
            target_plugin_uri: Optional plugin URI for all imports

        Returns:
            List of ConvertedPreset results
        """
        results = []
        for file_path in file_paths:
            result = self.import_preset(file_path, target_plugin_uri)
            results.append(result)
        return results


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_converter_instance: Optional[UniversalPresetConverter] = None


def get_preset_converter() -> UniversalPresetConverter:
    """Get singleton preset converter instance."""
    global _converter_instance
    if _converter_instance is None:
        _converter_instance = UniversalPresetConverter()
    return _converter_instance

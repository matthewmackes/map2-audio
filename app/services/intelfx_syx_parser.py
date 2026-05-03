"""
IntelFX binary SysEx (.syx) file parser.

Parses raw SysEx dump files exported from the Rocktron IntelFX or third-party
editors. Supports:
  - Single-program dumps (one SysEx frame)
  - Bank dumps (multiple SysEx frames per file)
  - Auto-tagging from program name tokens

The IntelFX single-program dump frame structure (Rocktron spec):
  F0  00  01  56  <device_id>  03  <prog_num_hi>  <prog_num_lo>  <name_16bytes>  <param_data...>  <checksum>  F7

where:
  00 01 56 = Rocktron 3-byte extended MIDI manufacturer ID
  device_id = unit ID on MIDI chain
  03 = program dump message type
  prog_num_hi/lo = program number (0-255) split across two bytes
  name = 16 ASCII characters (space-padded)
  param_data = algorithm parameters
  checksum = XOR of all data bytes between F0 and checksum
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from app.services.sysex_tags import auto_tag_from_name as infer_auto_tags
from app.services.sysex_tags import compile_intelfx_tag_map
from app.services.sysex_tags_js_runtime import (
    compile_intelfx_tag_map_via_js,
    is_sysex_parser_js_runtime_enabled,
)

logger = logging.getLogger(__name__)

# Rocktron 3-byte extended manufacturer ID in SysEx
_ROCKTRON_ID: List[int] = [0x00, 0x01, 0x56]

# Name is at a fixed position after the header:
#   F0 (1) + mfr_id (3) + device_id (1) + msg_type (1) + prog_hi (1) + prog_lo (1) = offset 8
_HEADER_SIZE: int = 8  # bytes before name starts (F0 + 3-byte mfr + dev + msg + prog_hi + prog_lo)
_NAME_LENGTH: int = 16

# Heuristic minimum program dump size (bytes incl. F0/F7)
_MIN_PROGRAM_DUMP_SIZE: int = 28

# Program range for IntelFX
_MAX_PROGRAM_NUMBER: int = 255

_NAME_TAG_MAP = compile_intelfx_tag_map()


_JS_RUNTIME_FALLBACK_WARNED = False


def _resolve_tag_map():
    """Return the active IntelFX tag map, honoring the JS-runtime feature flag.

    T2459-H4 Slice 9 (silent fallback): when the flag is on but the
    Node-backed JS runtime is unavailable on this host (Node not on
    PATH, runtime JS file missing, malformed sandbox), fall back to
    the Python tag map silently after one warning log per process.
    The compiled output is bit-identical (parity gates in
    `tests/test_sysex_tags_runtime_js_t2459h4.py`).
    """
    if not is_sysex_parser_js_runtime_enabled():
        return _NAME_TAG_MAP
    try:
        from app.services.sysex_tags_js_runtime import SysexJsRuntimeError
    except Exception:
        return _NAME_TAG_MAP
    try:
        return compile_intelfx_tag_map_via_js()
    except SysexJsRuntimeError as exc:
        global _JS_RUNTIME_FALLBACK_WARNED
        if not _JS_RUNTIME_FALLBACK_WARNED:
            _JS_RUNTIME_FALLBACK_WARNED = True
            logger.warning(
                "IntelFX SysEx parser: MAP2_SYSEX_PARSER_USE_JS_RUNTIME is on "
                "but the Node-backed JS runtime is unavailable (%s). "
                "Falling back to the Python tag map. The two paths produce "
                "bit-identical output; install Node and ensure "
                "device-packs/_runtime/sysex-tags.js is readable to silence "
                "this warning.",
                exc,
            )
        return _NAME_TAG_MAP


@dataclass
class SyxProgram:
    """A single parsed program extracted from a .syx file."""

    name: str
    """16-char ASCII name, stripped of trailing spaces/nulls."""

    program_number: Optional[int]
    """Program slot number (0-255), or None if not determinable from the dump."""

    raw_bytes: bytes
    """The complete SysEx frame bytes (F0 ... F7)."""

    auto_tags: List[str] = field(default_factory=list)
    """Tags inferred from the program name."""

    source_file: Optional[str] = None
    """Path to the source .syx file (for UI display)."""

    @property
    def checksum_hex(self) -> str:
        """CRC32 hex digest of raw_bytes for duplicate detection."""
        import zlib

        return f"{zlib.crc32(self.raw_bytes) & 0xFFFFFFFF:08x}"

    def to_library_entry(self, override_program: Optional[int] = None) -> Dict[str, Any]:
        """Convert to the dict format used by IntelFX service library entries."""
        prog = override_program if override_program is not None else (self.program_number or 0)
        primary_tag = self.auto_tags[0] if self.auto_tags else "general"
        return {
            "program": prog,
            "name": self.name or f"Program {prog:03d}",
            "tags": list(self.auto_tags),
            "rating": 1,
            "type": primary_tag,
            "syx_blob": self.raw_bytes.hex(),
            "source_file": self.source_file,
            "checksum": self.checksum_hex,
        }


class IntelFXSyxParser:
    """Parse binary .syx files into :class:`SyxProgram` instances."""

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    def parse_file(self, path: Path) -> List[SyxProgram]:
        """Parse *path* (a .syx file) and return a list of programs found."""
        raw = Path(path).read_bytes()
        frames = self._split_frames(raw)
        programs: List[SyxProgram] = []
        for index, frame in enumerate(frames):
            if not self._is_rocktron_frame(frame):
                continue
            name = self._extract_name(frame) or f"Program {index:03d}"
            prog_num = self._extract_program_number(frame, index)
            tags = self.auto_tag_from_name(name)
            programs.append(
                SyxProgram(
                    name=name,
                    program_number=prog_num,
                    raw_bytes=bytes(frame),
                    auto_tags=tags,
                    source_file=str(path),
                )
            )
        return programs

    def parse_bytes(self, data: bytes, source_name: str = "<bytes>") -> List[SyxProgram]:
        """Parse raw bytes directly (useful for upload endpoints)."""
        frames = self._split_frames(data)
        programs: List[SyxProgram] = []
        for index, frame in enumerate(frames):
            if not self._is_rocktron_frame(frame):
                continue
            name = self._extract_name(frame) or f"Program {index:03d}"
            prog_num = self._extract_program_number(frame, index)
            tags = self.auto_tag_from_name(name)
            programs.append(
                SyxProgram(
                    name=name,
                    program_number=prog_num,
                    raw_bytes=bytes(frame),
                    auto_tags=tags,
                    source_file=source_name,
                )
            )
        return programs

    def auto_tag_from_name(self, name: str) -> List[str]:
        """Return a deduplicated list of tags inferred from *name* tokens."""
        return infer_auto_tags(name, _resolve_tag_map())

    # -------------------------------------------------------------------------
    # Frame splitting
    # -------------------------------------------------------------------------

    @staticmethod
    def _split_frames(data: bytes) -> List[bytes]:
        """Split raw bytes on SysEx boundaries (F0 ... F7)."""
        frames: List[bytes] = []
        start: Optional[int] = None
        for i, byte in enumerate(data):
            if byte == 0xF0:
                start = i
            elif byte == 0xF7 and start is not None:
                frame = data[start : i + 1]
                if len(frame) >= _MIN_PROGRAM_DUMP_SIZE:
                    frames.append(frame)
                start = None
        return frames

    # -------------------------------------------------------------------------
    # Rocktron frame validation
    # -------------------------------------------------------------------------

    @staticmethod
    def _is_rocktron_frame(frame: bytes) -> bool:
        """Return True if this frame has the Rocktron 3-byte manufacturer ID.

        Frame layout: F0 00 01 56 ...
        The extended MIDI manufacturer ID uses byte[1]==0x00 followed by
        two ID bytes at [2] and [3].
        """
        if len(frame) < 6:
            return False
        return (
            frame[0] == 0xF0
            and frame[1] == _ROCKTRON_ID[0]
            and frame[2] == _ROCKTRON_ID[1]
            and frame[3] == _ROCKTRON_ID[2]
        )

    # -------------------------------------------------------------------------
    # Name extraction
    # -------------------------------------------------------------------------

    def _extract_name(self, frame: bytes) -> Optional[str]:
        """Try to extract a printable 16-char ASCII program name from the frame.

        Expected layout after Rocktron header validation:
          F0 00 01 56 <device_id> <msg_type> <prog_hi> <prog_lo> <name_16> ...
        Name starts at byte offset 8 from the frame start.
        """
        # Primary: name at fixed offset (byte 8)
        candidate = self._try_name_at_frame_offset(frame, _HEADER_SIZE)
        if candidate is not None:
            return candidate
        # Fallback: try adjacent offsets in case of variant firmware
        for offset in (_HEADER_SIZE - 1, _HEADER_SIZE + 1, _HEADER_SIZE + 2):
            candidate = self._try_name_at_frame_offset(frame, offset)
            if candidate is not None:
                return candidate
        return None

    @staticmethod
    def _try_name_at_frame_offset(frame: bytes, offset: int) -> Optional[str]:
        """Extract and validate a 16-char ASCII name at *offset* in *frame*."""
        if offset + _NAME_LENGTH > len(frame) - 1:  # -1 for F7 footer
            return None
        raw_name = frame[offset : offset + _NAME_LENGTH]
        # All bytes must be printable ASCII (0x20-0x7E) or null/space padding
        for b in raw_name:
            if b != 0x00 and (b < 0x20 or b > 0x7E):
                return None
        name = raw_name.decode("ascii", errors="replace").rstrip("\x00").rstrip()
        return name if name else None

    # -------------------------------------------------------------------------
    # Program number extraction
    # -------------------------------------------------------------------------

    @staticmethod
    def _extract_program_number(frame: bytes, fallback_index: int) -> Optional[int]:
        """Extract the program number from the frame header.

        The IntelFX program dump encodes the program number across two bytes:
          frame[6] = prog_num_hi  (high 7 bits)
          frame[7] = prog_num_lo  (low 7 bits)

        Combined: (prog_num_hi << 7) | prog_num_lo gives 0-255.
        For single-program dumps with only a low byte, prog_num_hi is 0.
        """
        if len(frame) >= _HEADER_SIZE + 1:
            prog_hi = int(frame[6]) & 0x7F
            prog_lo = int(frame[7]) & 0x7F
            candidate = (prog_hi << 7) | prog_lo
            if 0 <= candidate <= _MAX_PROGRAM_NUMBER:
                return candidate
        return fallback_index

    # -------------------------------------------------------------------------
    # Checksum verification
    # -------------------------------------------------------------------------

    @staticmethod
    def verify_checksum(frame: bytes) -> bool:
        """Verify the XOR checksum of a Rocktron SysEx frame.

        The checksum byte (second-to-last, before F7) should equal the XOR
        of all bytes between F0 (exclusive) and the checksum byte (exclusive).
        """
        if len(frame) < 6:
            return False
        # Data bytes: everything after F0 and before checksum + F7
        data_bytes = frame[1:-2]
        checksum_byte = frame[-2]
        computed = 0
        for b in data_bytes:
            computed ^= b
        computed &= 0x7F  # MIDI data bytes are 7-bit
        return computed == checksum_byte


# ---------------------------------------------------------------------------
# Duplicate detection helper
# ---------------------------------------------------------------------------

def deduplicate_programs(programs: Sequence[SyxProgram]) -> List[SyxProgram]:
    """Return *programs* with duplicates removed (by checksum)."""
    seen: set[str] = set()
    result: List[SyxProgram] = []
    for prog in programs:
        cs = prog.checksum_hex
        if cs not in seen:
            seen.add(cs)
            result.append(prog)
    return result

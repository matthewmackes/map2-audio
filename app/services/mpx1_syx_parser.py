"""
MPX-1 binary SysEx (.syx) file parser.

Parses raw SysEx dump files exported from the Lexicon MPX-1 or third-party
editors. Supports:
  - Single-program dumps (one SysEx frame)
  - Bank dumps (multiple SysEx frames per file)
  - Auto-tagging from program name tokens

The MPX-1 single-program dump frame structure (Lexicon spec):
  F0  06  00  nn  [data bytes]  F7

where:
  06 = Lexicon manufacturer ID
  00 = device model byte
  nn = message class / function code
  data = program name (12 ASCII chars) + algorithm data

For both format variants (R0 and V1.10 MIDI implementation), the program
name occupies bytes at a fixed offset inside the data section.  The parser
tries two common offsets and validates printable ASCII.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.services.sysex_tags import auto_tag_from_name as infer_auto_tags
from app.services.sysex_tags import compile_mpx1_tag_map

# Lexicon manufacturer ID in SysEx
_LEXICON_ID: int = 0x06

# Common name offsets relative to start of data (after the 4-byte SysEx header)
# The MPX-1 MIDI implementation places the program name at:
#   offset 2 from the data payload start (after function-code byte)
# Some variants use offset 0 or 1.  We try all three.
_NAME_OFFSETS: Tuple[int, ...] = (2, 0, 1)
_NAME_LENGTH: int = 12

# Heuristic minimum program dump size (bytes incl. F0/F7)
_MIN_PROGRAM_DUMP_SIZE: int = 20

_NAME_TAG_MAP = compile_mpx1_tag_map()


@dataclass
class SyxProgram:
    """A single parsed program extracted from a .syx file."""

    name: str
    """12-char ASCII name, stripped of trailing spaces/nulls."""

    program_number: Optional[int]
    """Program slot number (0-249), or None if not determinable from the dump."""

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
        """Convert to the dict format used by MPX1Service library entries."""
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


class MPX1SyxParser:
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
            if not self._is_lexicon_frame(frame):
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
            if not self._is_lexicon_frame(frame):
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
        return infer_auto_tags(name, _NAME_TAG_MAP)

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
    # Lexicon frame validation
    # -------------------------------------------------------------------------

    @staticmethod
    def _is_lexicon_frame(frame: bytes) -> bool:
        """Return True if this frame has the Lexicon manufacturer ID."""
        # F0 <mfr_id> ...
        return len(frame) >= 4 and frame[0] == 0xF0 and frame[1] == _LEXICON_ID

    # -------------------------------------------------------------------------
    # Name extraction
    # -------------------------------------------------------------------------

    def _extract_name(self, frame: bytes) -> Optional[str]:
        """Try to extract a printable 12-char ASCII program name from the frame."""
        # Data payload starts at byte 4 (after F0, mfr_id, model, function)
        payload = frame[4:-1]  # strip F0 header (4 bytes) and F7 footer
        for offset in _NAME_OFFSETS:
            candidate = self._try_name_at(payload, offset)
            if candidate is not None:
                return candidate
        return None

    @staticmethod
    def _try_name_at(payload: bytes, offset: int) -> Optional[str]:
        """Extract and validate a 12-char ASCII name at *offset* in *payload*."""
        if offset + _NAME_LENGTH > len(payload):
            return None
        raw_name = payload[offset : offset + _NAME_LENGTH]
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
        """Try to extract the program slot number from the frame header.

        The MPX-1 single-program dump includes the program number in
        bytes [2] (device_id) or [3] (function/program byte) of the header.
        For bank dumps, the individual program index is used as the slot.
        """
        # Heuristic: byte at position 3 (function code) sometimes carries
        # the program number for single-program dumps (0-249 range)
        if len(frame) >= 5:
            candidate = int(frame[3]) & 0xFF
            if 0 <= candidate <= 249:
                return candidate
        return fallback_index


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

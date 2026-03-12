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

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

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

# Auto-tag token map: substring → tag(s)
_NAME_TAG_MAP: List[Tuple[re.Pattern[str], List[str]]] = [
    (re.compile(r"\bhush\b", re.I), ["hush", "noise_reduction"]),
    (re.compile(r"\bcomp(ressor)?\b", re.I), ["compressor"]),
    (re.compile(r"\bwah\b", re.I), ["wah"]),
    (re.compile(r"\beq\b", re.I), ["eq"]),
    (re.compile(r"\bpitch\b", re.I), ["pitch"]),
    (re.compile(r"\bshift\b", re.I), ["pitch"]),
    (re.compile(r"\bwhammy\b", re.I), ["pitch"]),
    (re.compile(r"\bdetune\b", re.I), ["pitch"]),
    (re.compile(r"\bharmony\b", re.I), ["pitch"]),
    (re.compile(r"\bocta(ve)?\b", re.I), ["pitch"]),
    (re.compile(r"\bchorus\b", re.I), ["chorus"]),
    (re.compile(r"\bflange\b", re.I), ["flanger", "chorus"]),
    (re.compile(r"\bphase\b", re.I), ["phaser"]),
    (re.compile(r"\brotary\b", re.I), ["rotary", "chorus"]),
    (re.compile(r"\btremolo\b", re.I), ["tremolo"]),
    (re.compile(r"\bvibrato\b", re.I), ["vibrato", "chorus"]),
    (re.compile(r"\bdelay\b", re.I), ["delay"]),
    (re.compile(r"\becho\b", re.I), ["echo", "delay"]),
    (re.compile(r"\bslap\b", re.I), ["slap", "delay"]),
    (re.compile(r"\bping\b", re.I), ["pingpong", "delay"]),
    (re.compile(r"\breverb\b", re.I), ["reverb"]),
    (re.compile(r"\bplate\b", re.I), ["plate", "reverb"]),
    (re.compile(r"\bhall\b", re.I), ["hall", "reverb"]),
    (re.compile(r"\broom\b", re.I), ["room", "reverb"]),
    (re.compile(r"\bspring\b", re.I), ["spring", "reverb"]),
    (re.compile(r"\bchamber\b", re.I), ["chamber", "reverb"]),
    (re.compile(r"\bclean\b", re.I), ["clean"]),
    (re.compile(r"\bcrunch\b", re.I), ["crunch"]),
    (re.compile(r"\blead\b", re.I), ["lead"]),
    (re.compile(r"\bacoustic\b", re.I), ["acoustic"]),
    (re.compile(r"\bambi(ent)?\b", re.I), ["ambient"]),
    (re.compile(r"\bshimmer\b", re.I), ["ambient"]),
    (re.compile(r"\bglass\b", re.I), ["ambient"]),
    (re.compile(r"\bgate\b", re.I), ["gate"]),
    (re.compile(r"\breverse\b", re.I), ["reverse"]),
    (re.compile(r"\bguitar\b", re.I), ["guitar"]),
    (re.compile(r"\bbass\b", re.I), ["bass"]),
    (re.compile(r"\bvocal\b", re.I), ["vocal"]),
    (re.compile(r"\bdrum\b", re.I), ["drums"]),
    (re.compile(r"\bsnare\b", re.I), ["drums"]),
]


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
        tags: List[str] = []
        seen: set[str] = set()
        for pattern, tag_list in _NAME_TAG_MAP:
            if pattern.search(name):
                for tag in tag_list:
                    if tag not in seen:
                        tags.append(tag)
                        seen.add(tag)
        return tags

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

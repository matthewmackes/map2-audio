"""SysEx config packer for the harvie256 custom-firmware MIDI Commander.

T2459-H3-CFG Phase 3.

This module ports two packing routines from harvie256's
``midi-commander-custom/python/lib/`` into MAP2:

- :func:`pack_global_settings`  ←  ``settingsBinaryPacker.pack_global_settings``
- :func:`pack_bank_strings`     ←  ``settingsBinaryPacker.pack_bank_strings``

A third (``pack_row`` for Button_Settings rows) lands in slice 2.

The wire-format constants and byte layouts are dictated by the device
firmware; we cannot deviate from them without the firmware refusing the
flash. License + attribution at the bottom of this docstring.

Design notes
------------

The upstream uses pandas DataFrames as the input model. MAP2 is a Python
3.14 codebase with no pandas dependency in the backend hot path, so this
port uses dataclasses (`GlobalSettings`, `BankNaming`, …) that match the
CSV structure shape-for-shape but stay native-Python. The CSV
ingestion layer (slice 3) bridges the YAML/CSV format into these
dataclasses.

The packers emit ``bytes`` (or lists of ints in the 0-255 range when
chaining is convenient); the SysEx wire-format requires every payload
nibble to be split into two 7-bit chunks (the high nibble + low nibble)
because SysEx data bytes can't have the high bit set. That nibble-split
happens at the WRITE_FLASH chunk-frame builder (slice 3), NOT here —
this module produces the raw flash-image bytes that the firmware writes
to its onboard flash, and the chunk-frame builder is responsible for
the 7-bit transport encoding.

License + attribution
---------------------

The packing logic is derived from harvie256's MIT-licensed
``midi-commander-custom`` project::

    https://github.com/harvie256/midi-commander-custom
    Copyright (c) harvie256 contributors
    MIT License

The MAP2 port:

* Replaces pandas DataFrames with dataclasses (no behavioural change)
* Adds full docstrings + type annotations
* Adds defensive bounds-checks that the upstream relies on the source
  CSV for (e.g., MIDI channel must be 1-16; ``ConfigName`` length is
  exactly 16 bytes)

The wire format itself is copied verbatim — that's what the firmware
expects. See ``device-packs/meloaudio/firmware/LICENSE-harvie256.md``
(landed in Phase 4) for the full upstream license text.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# Byte offsets within the global-settings region. Match the firmware's
# expected layout exactly. The region is 16 bytes of "settings" + 16
# bytes of ASCII config name = 32 bytes total. Upstream comments
# describe the 16-byte settings prefix as "luck" given the firmware's
# 128-byte global region — only positions 0 and 1 are used today, the
# rest is reserved.
GLOBAL_SETTINGS_CHANNEL_OFFSET = 0
GLOBAL_SETTINGS_REALTIME_PASS_OFFSET = 1
GLOBAL_SETTINGS_REGION_SIZE = 16
GLOBAL_SETTINGS_CONFIG_NAME_LEN = 16

# Each bank entry is 4 bytes "large name" + 8 bytes "small info" = 12 bytes.
BANK_LARGE_NAME_LEN = 4
BANK_SMALL_INFO_LEN = 8


# ---------------------------------------------------------------------------
# Dataclass model — replaces upstream's pandas DataFrame inputs
# ---------------------------------------------------------------------------


@dataclass
class GlobalSettings:
    """Global configuration for the MIDI Commander custom firmware.

    Maps onto the ``Global_Settings`` table in the harvie256 CSV
    template. Fields:

    * ``midi_channel`` (int 1-16) — the MIDI channel the device emits
      on. The firmware stores 0-15 internally but operators expect 1-16
      everywhere; the packer subtracts 1 at encode time.
    * ``realtime_passthrough`` (bool) — when True, real-time messages
      from upstream MIDI input are forwarded through the device's
      output without modification.
    * ``config_name`` (str, ≤16 chars) — operator label shown on the
      device's LCD when this config is active. Truncated/padded to 16
      ASCII characters at encode time.
    """

    midi_channel: int
    realtime_passthrough: bool
    config_name: str

    def __post_init__(self) -> None:
        if not isinstance(self.midi_channel, int):
            raise TypeError(f"midi_channel must be int, got {type(self.midi_channel).__name__}")
        if not 1 <= self.midi_channel <= 16:
            raise ValueError(f"midi_channel must be 1-16, got {self.midi_channel}")
        if not isinstance(self.config_name, str):
            raise TypeError(f"config_name must be str, got {type(self.config_name).__name__}")


@dataclass
class BankNaming:
    """Per-bank operator-facing labels.

    The MIDI Commander supports up to 8 banks (a "bank" is a set of
    button mappings; operators switch banks with the Bank Up / Bank Down
    footswitches). Each bank has a 4-character "large" name (shown
    centered on the LCD) and an 8-character "small" info line.

    Empty strings are legal — they encode as ASCII spaces. The upstream
    handles empty CSV cells as the literal string ``"nan"`` because
    pandas turns missing values into NaN; this MAP2 port keeps strings
    as strings and treats ``None`` as empty. ``"nan"`` is no longer a
    sentinel here.
    """

    bank_number: int
    large_name: str = ""
    small_info: str = ""

    def __post_init__(self) -> None:
        if not isinstance(self.bank_number, int):
            raise TypeError(f"bank_number must be int")
        if self.bank_number < 0:
            raise ValueError(f"bank_number must be non-negative")


# ---------------------------------------------------------------------------
# Packers
# ---------------------------------------------------------------------------


def _ascii_fixed(s: Optional[str], length: int) -> bytes:
    """Encode ``s`` as exactly ``length`` ASCII bytes — pad with spaces
    if shorter, truncate if longer.

    Mirrors Python's ``"{:N.N}".format(s)`` formatting that the upstream
    uses, but explicit so callers can reason about it. Non-ASCII chars
    are replaced with ``?`` rather than raising — operators may type
    UTF-8 names into the YAML/CSV and we don't want that to brick the
    flash.
    """
    if s is None:
        s = ""
    text = str(s)
    encoded = text.encode("ascii", errors="replace")
    if len(encoded) >= length:
        return encoded[:length]
    return encoded + b" " * (length - len(encoded))


def pack_global_settings(settings: GlobalSettings) -> bytes:
    """Pack ``Global_Settings`` into 32 bytes of flash image.

    Layout:

    ``offset 0``       MIDI channel (0-15; we subtract 1 from operator-facing 1-16)
    ``offset 1``       realtime passthrough flag (0 or 1)
    ``offsets 2-15``   reserved (0x00 fill)
    ``offsets 16-31``  config name, ASCII, space-padded to 16 bytes

    Upstream wire-format reference::

        bin_list = [0] * 16
        bin_list[GLOBAL_SETTINGS_CHANNEL] = int(df.loc[...]) & 0xF
        if "Y" in df.loc["RealTime_Passthrough", "Value"]:
            bin_list[GLOBAL_SETTINGS_REALTIME_PASS] = 0x1
        bin_list += "{:16.16}".format(df.loc["ConfigName"].Value).encode("ASCII")

    The upstream comparison ``"Y" in df.loc[...]`` matches both
    "Y" and "Yes"; our boolean is unambiguous.
    """
    region = bytearray(GLOBAL_SETTINGS_REGION_SIZE)
    region[GLOBAL_SETTINGS_CHANNEL_OFFSET] = (settings.midi_channel - 1) & 0x0F
    region[GLOBAL_SETTINGS_REALTIME_PASS_OFFSET] = 1 if settings.realtime_passthrough else 0
    region += _ascii_fixed(settings.config_name, GLOBAL_SETTINGS_CONFIG_NAME_LEN)
    return bytes(region)


def pack_bank_strings(banks: list[BankNaming]) -> bytes:
    """Pack the ``Bank_Naming`` table into a contiguous byte run.

    Each bank contributes 12 bytes: 4-byte large name + 8-byte small
    info, both ASCII space-padded. Banks are emitted in the order
    provided — caller is responsible for sorting by ``bank_number``.

    Upstream wire-format reference::

        for index, row in df.iterrows():
            large_name = str(row["Bank_Name_Large"])
            small_name = str(row["Bank_Info_Small"])
            # NB: pandas turns missing-CSV-cells into "nan" strings;
            # upstream patches that explicitly. The MAP2 port uses
            # None / "" for empty cells so the "nan" check is dropped.
            bin_list += "{:4.4}".format(large_name).encode("ASCII")
            bin_list += "{:8.8}".format(small_name).encode("ASCII")
    """
    out = bytearray()
    for bank in banks:
        out += _ascii_fixed(bank.large_name, BANK_LARGE_NAME_LEN)
        out += _ascii_fixed(bank.small_info, BANK_SMALL_INFO_LEN)
    return bytes(out)


# ---------------------------------------------------------------------------
# Slice 2 — Button_Settings packer (commands per button per bank)
# ---------------------------------------------------------------------------

# Each button supports up to 10 chained commands (slots A-J). Each
# command is encoded as 4 bytes. A button's full row is 10*4 = 40 bytes.
NUM_COMMANDS_PER_BUTTON = 10
BYTES_PER_COMMAND = 4
BYTES_PER_BUTTON_ROW = NUM_COMMANDS_PER_BUTTON * BYTES_PER_COMMAND  # 40

# Upper-nibble status codes the firmware recognizes on byte 0.
# Channel goes in the lower nibble (0-15 = channels 1-16).
_CMD_NO_CMD = 0x00
_CMD_PC = 0xC0
_CMD_CC = 0xB0
_CMD_PB = 0xE0
_CMD_NOTE = 0x90
_CMD_START = 0x10
_CMD_STOP = 0x20

# Toggle bit lives in the high bit of byte 1 for CC/Note/PB commands.
_TOGGLE_BIT = 0x80


# ---------------------------------------------------------------------------
# Per-command dataclasses
# ---------------------------------------------------------------------------


@dataclass
class CommandNone:
    """No-op slot. Encodes as four zero bytes — used to fill unused
    slots between active commands (or for buttons that aren't configured
    at all).
    """


@dataclass
class CommandStart:
    """MIDI Start (0xFA system-realtime) — emitted on press."""


@dataclass
class CommandStop:
    """MIDI Stop (0xFC system-realtime) — emitted on press."""


@dataclass
class CommandPC:
    """Program Change with optional bank select.

    The MIDI Commander's firmware sends the bank-select pair (CC 0 +
    CC 32 = MSB + LSB) BEFORE the PC byte when ``bank_select_high_byte``
    is enabled. ``bank_select`` is the 14-bit bank number (0-16383);
    when high-byte is disabled, only the LSB is sent and the MSB byte
    on the wire is 0x80 (firmware sentinel meaning "no MSB").

    Wire encoding (4 bytes)::

        byte 0: 0xC0 | (channel - 1)              # PC nibble + channel
        byte 1: program & 0x7F                    # patch number
        byte 2: bank_select MSB (0x80 if disabled)
        byte 3: bank_select & 0x7F                # bank LSB
    """

    channel: int
    program: int
    bank_select: int = 0
    bank_select_high_byte: bool = False


@dataclass
class CommandCC:
    """Control Change with toggle/momentary modes.

    When ``toggle`` is True, the firmware alternates between OnValue and
    OffValue on each press. When False, OnValue is sent on press and
    OffValue on release (momentary).

    Wire encoding (4 bytes)::

        byte 0: 0xB0 | (channel - 1)              # CC nibble + channel
        byte 1: (number & 0x7F) | toggle_bit      # CC# + high-bit toggle flag
        byte 2: on_value & 0x7F
        byte 3: off_value
    """

    channel: int
    number: int
    on_value: int
    off_value: int = 0
    toggle: bool = False


@dataclass
class CommandNote:
    """Note On/Off with a duration window.

    Wire encoding (4 bytes)::

        byte 0: 0x90 | (channel - 1)              # Note nibble + channel
        byte 1: (note & 0x7F) | toggle_bit
        byte 2: velocity & 0x7F
        byte 3: duration & 0x7F                   # in 10ms units per upstream
    """

    channel: int
    note: int
    velocity: int = 100
    duration: int = 0
    toggle: bool = False


@dataclass
class CommandPB:
    """Pitch Bend ramp — sweeps to a target value over a duration.

    The upstream stores pitch as -8192..8191 (signed); on the wire this
    is centered around 0x2000 and split into LSB/MSB.

    Wire encoding (4 bytes)::

        byte 0: 0xE0 | (channel - 1)
        byte 1: (pitch_LSB) | toggle_bit
        byte 2: pitch_MSB
        byte 3: duration & 0x7F
    """

    channel: int
    pitch: int
    duration: int = 0
    toggle: bool = False


# Type alias for any command slot.
ButtonCommand = (
    CommandNone
    | CommandStart
    | CommandStop
    | CommandPC
    | CommandCC
    | CommandNote
    | CommandPB
)


@dataclass
class ButtonRow:
    """A single button's command list within a bank.

    The MIDI Commander has 8 buttons per bank (top 1-4 + bottom A-D)
    plus the "all buttons" macros. Each button has up to 10 command
    slots. Empty slots are encoded as ``CommandNone()``.
    """

    bank_number: int
    button_identifier: str  # "1".."4", "A".."D"
    commands: list[ButtonCommand] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Encoders for each command type
# ---------------------------------------------------------------------------


def _validate_channel(channel: int, kind: str) -> int:
    """Channels are operator-facing 1-16; on the wire they're 0-15."""
    if not isinstance(channel, int):
        raise TypeError(f"{kind}: channel must be int")
    if not 1 <= channel <= 16:
        raise ValueError(f"{kind}: channel must be 1-16, got {channel}")
    return channel - 1


def _encode_none(_cmd: CommandNone) -> bytes:
    return bytes(BYTES_PER_COMMAND)


def _encode_start(_cmd: CommandStart) -> bytes:
    return bytes([_CMD_START, 0, 0, 0])


def _encode_stop(_cmd: CommandStop) -> bytes:
    return bytes([_CMD_STOP, 0, 0, 0])


def _encode_pc(cmd: CommandPC) -> bytes:
    ch = _validate_channel(cmd.channel, "PC")
    if not 0 <= cmd.program <= 127:
        raise ValueError(f"PC: program must be 0-127, got {cmd.program}")
    if not 0 <= cmd.bank_select <= 0x3FFF:
        raise ValueError(f"PC: bank_select must be 0-16383, got {cmd.bank_select}")
    bank_low = cmd.bank_select & 0x7F
    if cmd.bank_select_high_byte:
        bank_high = (cmd.bank_select >> 7) & 0x7F
    else:
        bank_high = 0x80   # firmware sentinel = "no high byte"
    return bytes([
        _CMD_PC | ch,
        cmd.program & 0x7F,
        bank_high,
        bank_low,
    ])


def _encode_cc(cmd: CommandCC) -> bytes:
    ch = _validate_channel(cmd.channel, "CC")
    if not 0 <= cmd.number <= 127:
        raise ValueError(f"CC: number must be 0-127, got {cmd.number}")
    if not 0 <= cmd.on_value <= 127:
        raise ValueError(f"CC: on_value must be 0-127, got {cmd.on_value}")
    if not 0 <= cmd.off_value <= 255:
        # Upstream doesn't mask off_value to 7-bit; passes through. We
        # widen to 0-255 to match.
        raise ValueError(f"CC: off_value must be 0-255, got {cmd.off_value}")
    toggle_bit = _TOGGLE_BIT if cmd.toggle else 0
    return bytes([
        _CMD_CC | ch,
        (cmd.number & 0x7F) | toggle_bit,
        cmd.on_value & 0x7F,
        cmd.off_value & 0xFF,
    ])


def _encode_note(cmd: CommandNote) -> bytes:
    ch = _validate_channel(cmd.channel, "Note")
    if not 0 <= cmd.note <= 127:
        raise ValueError(f"Note: note must be 0-127, got {cmd.note}")
    if not 0 <= cmd.velocity <= 127:
        raise ValueError(f"Note: velocity must be 0-127, got {cmd.velocity}")
    if not 0 <= cmd.duration <= 127:
        raise ValueError(f"Note: duration must be 0-127, got {cmd.duration}")
    toggle_bit = _TOGGLE_BIT if cmd.toggle else 0
    return bytes([
        _CMD_NOTE | ch,
        (cmd.note & 0x7F) | toggle_bit,
        cmd.velocity & 0x7F,
        cmd.duration & 0x7F,
    ])


def _encode_pb(cmd: CommandPB) -> bytes:
    ch = _validate_channel(cmd.channel, "PB")
    if not -8192 <= cmd.pitch <= 8191:
        raise ValueError(f"PB: pitch must be -8192..8191, got {cmd.pitch}")
    if not 0 <= cmd.duration <= 127:
        raise ValueError(f"PB: duration must be 0-127, got {cmd.duration}")
    pitch = cmd.pitch + 0x2000   # center around 0x2000 (MIDI PB convention)
    pitch_lsb = pitch & 0x7F
    pitch_msb = (pitch >> 7) & 0x7F
    toggle_bit = _TOGGLE_BIT if cmd.toggle else 0
    return bytes([
        _CMD_PB | ch,
        pitch_lsb | toggle_bit,
        pitch_msb,
        cmd.duration & 0x7F,
    ])


def encode_command(cmd: ButtonCommand) -> bytes:
    """Encode a single command slot to 4 wire bytes."""
    if isinstance(cmd, CommandNone):
        return _encode_none(cmd)
    if isinstance(cmd, CommandStart):
        return _encode_start(cmd)
    if isinstance(cmd, CommandStop):
        return _encode_stop(cmd)
    if isinstance(cmd, CommandPC):
        return _encode_pc(cmd)
    if isinstance(cmd, CommandCC):
        return _encode_cc(cmd)
    if isinstance(cmd, CommandNote):
        return _encode_note(cmd)
    if isinstance(cmd, CommandPB):
        return _encode_pb(cmd)
    raise TypeError(f"unknown command type: {type(cmd).__name__}")


def pack_button_row(row: ButtonRow) -> bytes:
    """Pack a single button row to 40 wire bytes.

    The button has up to 10 command slots (A-J). Slots beyond the
    provided list are filled with CommandNone (zero-bytes). If the
    caller provides MORE than 10 commands we raise — silent truncation
    would mask a config error.

    Upstream wire-format reference::

        row_byte_list = []
        for i in range(0, MIDI_NUM_COMMANDS_PER_SWITCH):
            cmd_prefix = f"{chr(ord('A') + i)}_"
            cmd = row.loc[row.index.str.startswith(cmd_prefix)]
            cmd.index = cmd.index.str.replace(cmd_prefix, "")
            func = cmd_route_table.get(cmd["CommandType"], cmd_none)
            cmd_byte_list = func(cmd)
            row_byte_list += cmd_byte_list
    """
    if len(row.commands) > NUM_COMMANDS_PER_BUTTON:
        raise ValueError(
            f"too many commands for button row {row.button_identifier!r}: "
            f"{len(row.commands)} > {NUM_COMMANDS_PER_BUTTON}"
        )
    out = bytearray()
    for cmd in row.commands:
        out += encode_command(cmd)
    # Pad remaining slots with CommandNone (zero-bytes).
    remaining = NUM_COMMANDS_PER_BUTTON - len(row.commands)
    out += bytes(remaining * BYTES_PER_COMMAND)
    return bytes(out)


def pack_button_settings(rows: list[ButtonRow]) -> bytes:
    """Pack a list of button rows to a contiguous wire-byte run.

    Caller is responsible for ordering — typically grouped by bank,
    then by button_identifier in some canonical order. The encoder is
    layout-agnostic; it just concatenates the per-row bytes.
    """
    out = bytearray()
    for row in rows:
        out += pack_button_row(row)
    return bytes(out)


# ---------------------------------------------------------------------------
# Slice 3 — YAML profile, full flash image, SysEx chunking
# ---------------------------------------------------------------------------

# SysEx command bytes per the harvie256 firmware. These are NOT the
# standard MMA assignments; manufacturer ID 0x7D is the MMA-reserved
# "non-commercial / educational" ID. The harvie256 firmware uses it
# because it doesn't have a registered vendor ID. The three commands
# below are the firmware's only operator-actionable ones.
SYSEX_MANUFACTURER_ID = 0x7D
SYSEX_CMD_ERASE_FLASH = 52
SYSEX_CMD_WRITE_FLASH = 54
SYSEX_CMD_RESET = 60

# Each WRITE_FLASH frame carries 16 bytes of payload, split into 32
# 4-bit nibbles so they fit in 7-bit-clean SysEx data bytes.
WRITE_FLASH_PAYLOAD_BYTES = 16

# SysEx framing bytes per the MIDI 1.0 spec.
SYSEX_START = 0xF0
SYSEX_END = 0xF7


# ---------------------------------------------------------------------------
# Full flash-image build (Global + Banks + Buttons)
# ---------------------------------------------------------------------------


@dataclass
class CommanderConfig:
    """The full configuration that gets written to the device's flash.

    Mirrors the three CSV sections in harvie256's spreadsheet template
    (``Global_Settings``, ``Bank_Naming``, ``Button_Settings``) but as
    proper Python objects.

    Caller responsibilities:

    * ``banks`` should be sorted by ``bank_number``.
    * ``button_rows`` should be ordered consistently — typically grouped
      by ``bank_number`` then by canonical button order
      (1, 2, 3, 4, A, B, C, D within each bank). The packer doesn't
      enforce ordering; the firmware reads positionally.
    """

    global_settings: GlobalSettings
    banks: list[BankNaming]
    button_rows: list[ButtonRow]


def build_flash_image(config: CommanderConfig) -> bytes:
    """Assemble the complete flash image: global + banks + buttons.

    Layout::

        offset 0..31     Global settings (32 bytes)
        offset 32..N     Bank naming (12 bytes per bank)
        offset N+1..M    Button settings (40 bytes per row)

    The firmware reads these regions positionally, so the order is
    fixed. The size of the flash image scales with the number of banks
    and button rows; the firmware caps the total at 3 flash pages
    (3 KB) per harvie256's ``flash_midi_settings.c``.
    """
    out = bytearray()
    out += pack_global_settings(config.global_settings)
    out += pack_bank_strings(config.banks)
    out += pack_button_settings(config.button_rows)
    return bytes(out)


# ---------------------------------------------------------------------------
# SysEx framing — write-flash chunks and erase/reset commands
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SysExFrame:
    """A single SysEx message ready for transmission.

    ``data_bytes`` is the message *contents* between the SysEx-start
    (0xF0) and SysEx-end (0xF7) framing bytes — that is, the
    manufacturer ID + command + parameters. The full wire frame is
    constructed by :meth:`to_wire`.
    """

    data_bytes: bytes
    """The body of the SysEx message — manufacturer ID + command + params."""

    description: str = ""
    """Human-readable label for diagnostics + logging."""

    def to_wire(self) -> bytes:
        """Wrap the data in 0xF0 ... 0xF7 framing for transmission."""
        return bytes([SYSEX_START]) + self.data_bytes + bytes([SYSEX_END])


def build_erase_flash_frame() -> SysExFrame:
    """Build the ERASE_FLASH SysEx frame.

    Upstream sends ``[MIDI_MANUF_ID, ERASE_FLASH, 0x42, 0x24]`` — the
    last two bytes are a magic confirmation code the firmware checks.
    """
    return SysExFrame(
        data_bytes=bytes([
            SYSEX_MANUFACTURER_ID,
            SYSEX_CMD_ERASE_FLASH,
            0x42,
            0x24,
        ]),
        description="ERASE_FLASH",
    )


def build_reset_frame() -> SysExFrame:
    """Build the RESET SysEx frame, sent at the end of a flash sequence
    to make the firmware reload from flash.
    """
    return SysExFrame(
        data_bytes=bytes([
            SYSEX_MANUFACTURER_ID,
            SYSEX_CMD_RESET,
        ]),
        description="RESET",
    )


def _split_high_low_nibbles(byte_value: int) -> tuple[int, int]:
    """Split one 8-bit value into ``(high_nibble, low_nibble)``.

    SysEx data bytes can't have the high bit set (0xF8-0xFF are
    reserved for system-realtime), so the firmware splits each payload
    byte into two 7-bit-clean nibbles. The decoder on the device
    reassembles by ``(high << 4) | low``.
    """
    if not 0 <= byte_value <= 0xFF:
        raise ValueError(f"byte_value out of range: {byte_value}")
    return (byte_value >> 4) & 0x0F, byte_value & 0x0F


def build_write_flash_frames(flash_image: bytes) -> list[SysExFrame]:
    """Slice the flash image into 16-byte chunks and frame each as
    a WRITE_FLASH SysEx message.

    Upstream wire-format reference::

        no_chunks = int(len(flash_contents) / 16)
        for x in range(0, no_chunks):
            flash_chunk_low_byte = x & 0x7F
            flash_chunk_high_byte = (x >> 7) & 0x7F
            data = [MIDI_MANUF_ID, WRITE_FLASH, flash_chunk_high_byte, flash_chunk_low_byte]
            for i in range(0, 16):
                data += [flash_contents[x * 16 + i] >> 4]
                data += [flash_contents[x * 16 + i] & 0xF]
            outmsg = mido.Message("sysex", data=data)

    Frame format (without 0xF0/0xF7 outer framing)::

        [MANUF_ID,
         WRITE_FLASH,
         chunk_index_high, chunk_index_low,         # 14-bit chunk number
         byte0_hi, byte0_lo,                        # 16 payload bytes →
         byte1_hi, byte1_lo,                        # 32 nibble bytes
         ...,
         byte15_hi, byte15_lo]

    Total frame size: 4 + 32 = 36 data bytes (38 with 0xF0/0xF7).

    Important: the upstream uses ``int(len(flash_contents) / 16)`` which
    silently DROPS partial trailing chunks. We replicate that behaviour
    because the firmware allocates flash pages in 16-byte rows; a
    partial trailing chunk would be an unaligned write. Caller is
    responsible for padding ``flash_image`` to a 16-byte boundary
    before calling — :func:`pad_flash_image_to_chunks` is a helper.
    """
    if len(flash_image) % WRITE_FLASH_PAYLOAD_BYTES != 0:
        raise ValueError(
            f"flash_image length must be a multiple of "
            f"{WRITE_FLASH_PAYLOAD_BYTES}, got {len(flash_image)}"
        )

    frames: list[SysExFrame] = []
    n_chunks = len(flash_image) // WRITE_FLASH_PAYLOAD_BYTES

    if n_chunks > 0x3FFF:
        # 14-bit chunk index = 16384 max chunks = 256 KiB max flash image.
        # Way beyond the firmware's 3 KB limit, but pinning the bound
        # so the encoder fails predictably.
        raise ValueError(
            f"flash_image has {n_chunks} chunks; firmware addressing supports max 16383"
        )

    for chunk_idx in range(n_chunks):
        chunk_low = chunk_idx & 0x7F
        chunk_high = (chunk_idx >> 7) & 0x7F
        payload = bytearray([
            SYSEX_MANUFACTURER_ID,
            SYSEX_CMD_WRITE_FLASH,
            chunk_high,
            chunk_low,
        ])
        chunk_offset = chunk_idx * WRITE_FLASH_PAYLOAD_BYTES
        for i in range(WRITE_FLASH_PAYLOAD_BYTES):
            high, low = _split_high_low_nibbles(flash_image[chunk_offset + i])
            payload.append(high)
            payload.append(low)
        frames.append(SysExFrame(
            data_bytes=bytes(payload),
            description=f"WRITE_FLASH chunk {chunk_idx}",
        ))
    return frames


def pad_flash_image_to_chunks(flash_image: bytes, fill_byte: int = 0x00) -> bytes:
    """Pad a flash image to a 16-byte boundary so every chunk is full.

    The firmware writes 16-byte rows; an unpadded image would either
    drop trailing data (upstream's behaviour) or write past the row
    boundary. Padding with 0x00 is firmware-safe — every command-row
    slot encodes 0x00 as ``CommandNone``.
    """
    if not 0 <= fill_byte <= 0xFF:
        raise ValueError(f"fill_byte out of range: {fill_byte}")
    remainder = len(flash_image) % WRITE_FLASH_PAYLOAD_BYTES
    if remainder == 0:
        return flash_image
    return flash_image + bytes([fill_byte]) * (WRITE_FLASH_PAYLOAD_BYTES - remainder)


def build_full_sysex_sequence(config: CommanderConfig) -> list[SysExFrame]:
    """End-to-end: config → flash image → erase + write + reset frames.

    Returns the full sequence of SysEx frames the host should send to
    the device, in order:

    1. ``ERASE_FLASH`` — clear the flash settings pages
    2. N × ``WRITE_FLASH`` — write the new image, 16 bytes per chunk
    3. ``RESET`` — make the firmware reload the new config

    The caller is responsible for waiting for the device to ACK each
    frame before sending the next; this function just builds the
    sequence, it doesn't transmit.
    """
    flash_image = build_flash_image(config)
    flash_image = pad_flash_image_to_chunks(flash_image)
    frames = [build_erase_flash_frame()]
    frames.extend(build_write_flash_frames(flash_image))
    frames.append(build_reset_frame())
    return frames

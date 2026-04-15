"""Maschine MK1 wire protocol.

Pure-Python encoder/decoder for the Native Instruments Maschine MK1 USB
bulk protocol. No I/O — see mk1_usb_transport for the pyusb layer.

Transcribed from shaduzlabs/cabl (MIT) ``src/devices/ni/MaschineMK1.cpp`` and
``src/gfx/displays/GDisplayMaschineMK1.cpp``. Constants are facts about the
hardware, not expression.

Endpoint map:
    0x01 OUT  control primer + LEDs
    0x08 OUT  display framebuffer
    0x81 IN   buttons + encoders
    0x84 IN   pads (12-bit pressure)

Display is 255 x 64 pixels at 5 bits/pixel, packed 3 pixels per 2 bytes, row
major. Framebuffer = ceil(255/3) * 2 * 64 = 170 * 64 = 10,880 bytes per panel.

LED array is 62 bytes, one brightness byte (0..255, monochrome) per slot.
Indices are fixed and non-monotonic for pads — see LED_PAD_INDEX.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from typing import Iterable


# ---------------------------------------------------------------------------
# USB identifiers
# ---------------------------------------------------------------------------

VENDOR_ID = 0x17CC
PRODUCT_ID = 0x0808

EP_CONTROL_OUT = 0x01   # LED blocks + primer
EP_DISPLAY_OUT = 0x08   # display framebuffer chunks
EP_BUTTONS_IN = 0x81    # buttons + encoders
EP_PADS_IN = 0x84       # pad pressure stream

INTERFACE_NUMBER = 0
INTERFACE_ALT_SETTING = 1


# ---------------------------------------------------------------------------
# LEDs
# ---------------------------------------------------------------------------

LED_DATA_SIZE = 62
LED_GROUP_SIZE = 31
LED_GROUP_0_OFFSET = 0x00
LED_GROUP_1_OFFSET = 0x1E  # retained for reference / legacy two-packet path

LED_CHANNEL_PRIMER = bytes([0x0B, 0xFF, 0x02, 0x05])
LED_BACKLIGHT_DEFAULT = 0x5C

# Wire format (verified end-to-end 2026-04-15 against MK1 17cc:0808):
# ----------------------------------------------------------------
# cabl's two-packet scheme is CORRECT — but it only works when the pad
# IN endpoint (EP 0x84) is being actively drained. If the host stops
# consuming pad pressure data, EP 0x01 OUT backs up within ~50 ms and
# every subsequent write to EP 0x01 (primer, LEDs, MIDI) times out with
# -ETIMEDOUT and 0 bytes transferred. See
# scripts/maschine_unwedge_test.py H2/H3 for the proof.
#
# Symptom timeline we chased through 17 diagnostic variants:
#   - Without drain: first LED write OK, second wedges, replug required.
#   - With drain thread running: both packets succeed indefinitely.
#
# Don't try to "optimize" to a single 64-byte write — the device rejects
# slots past offset 30 because byte-1 of the header is the starting slot
# offset into the LED array, not a chunk tag. Single-packet form only
# addresses slots 0..30 and silently drops 31..61 (verified on hardware:
# all second-group LEDs stayed dark until the two-packet scheme was
# restored). Use build_led_packets() and the transport's drain thread.
LED_PACKET_SIZE = 2 + LED_GROUP_SIZE  # 33 bytes per packet, 2 packets per update


class Led(IntEnum):
    """Slot offset in the 62-byte LED array.

    Pad ordering is non-monotonic (verified against cabl). Hardware pad 1 is
    at index 12; hardware pad 4 is at index 15; hardware pad 13 is at index 0.
    """

    Pad4 = 0
    Pad3 = 1
    Pad2 = 2
    Pad1 = 3
    Pad8 = 4
    Pad7 = 5
    Pad6 = 6
    Pad5 = 7
    Pad12 = 8
    Pad11 = 9
    Pad10 = 10
    Pad9 = 11
    Pad16 = 12
    Pad15 = 13
    Pad14 = 14
    Pad13 = 15
    Mute = 16
    Solo = 17
    Select = 18
    Duplicate = 19
    Navigate = 20
    Keyboard = 21
    Pattern = 22
    Scene = 23
    Shift = 24
    Erase = 25
    Grid = 26
    TransportRight = 27
    Rec = 28
    Play = 29
    Unused1 = 30
    TransportLeft = 31
    Loop = 32
    GroupH = 33
    GroupG = 34
    GroupD = 35
    GroupC = 36
    GroupF = 37
    GroupE = 38
    GroupB = 39
    GroupA = 40
    AutoWrite = 41
    Snap = 42
    BrowseRight = 43
    BrowseLeft = 44
    Sampling = 45
    Browse = 46
    Step = 47
    Control = 48
    DisplayButton8 = 49
    DisplayButton7 = 50
    DisplayButton6 = 51
    DisplayButton5 = 52
    DisplayButton4 = 53
    DisplayButton3 = 54
    DisplayButton2 = 55
    DisplayButton1 = 56
    NoteRepeat = 57
    DisplayBacklight = 58
    Unused2 = 59
    Unused3 = 60
    Unused4 = 61


LED_PAD_INDEX: tuple[int, ...] = (
    Led.Pad1, Led.Pad2, Led.Pad3, Led.Pad4,
    Led.Pad5, Led.Pad6, Led.Pad7, Led.Pad8,
    Led.Pad9, Led.Pad10, Led.Pad11, Led.Pad12,
    Led.Pad13, Led.Pad14, Led.Pad15, Led.Pad16,
)


def build_led_packets(led_state: Iterable[int]) -> tuple[bytes, bytes]:
    """Build cabl's two 33-byte LED packets for ``EP_CONTROL_OUT``.

    ``led_state`` is any iterable of 62 integers in 0..255. Out-of-range
    values are clamped. Fewer-than-62 inputs are zero-padded; extras are
    ignored. Returns ``(group0, group1)``:

    - ``group0`` = ``[0x0C, 0x00]`` + slots 0..30 (31 data bytes, 33 total)
    - ``group1`` = ``[0x0C, 0x1E]`` + slots 31..61 (31 data bytes, 33 total)

    Byte 1 of each header is the starting slot offset into the device's
    LED array. The device rejects combined writes larger than 31 data
    bytes — you MUST send both packets and you MUST keep the pad input
    endpoint drained (see transport drain thread) or the second write
    wedges EP 0x01.
    """
    buffer = bytearray(LED_DATA_SIZE)
    for i, value in enumerate(led_state):
        if i >= LED_DATA_SIZE:
            break
        buffer[i] = max(0, min(255, int(value)))
    group0 = bytes([0x0C, LED_GROUP_0_OFFSET]) + bytes(buffer[0:LED_GROUP_SIZE])
    group1 = bytes([0x0C, LED_GROUP_1_OFFSET]) + bytes(buffer[LED_GROUP_SIZE:LED_DATA_SIZE])
    return group0, group1


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------

DISPLAY_COUNT = 2
DISPLAY_WIDTH = 255
DISPLAY_HEIGHT = 64
DISPLAY_BYTES_PER_ROW = 170  # ceil(255 / 3) * 2
DISPLAY_FRAMEBUFFER_SIZE = DISPLAY_BYTES_PER_ROW * DISPLAY_HEIGHT  # 10_880
DISPLAY_PIXEL_MAX = 31  # 5-bit grayscale per pixel

_FRAME_CHUNK_FULL = 502
_FRAME_CHUNK_TAIL = 338
_FRAME_MIDDLE_CHUNKS = 20  # per cabl CanvasBase<255,64,10880,22>: 22 - first - tail


def _d(display_index: int) -> int:
    if display_index not in (0, 1):
        raise ValueError(f"display_index must be 0 or 1, got {display_index}")
    return display_index << 1


def build_display_init_packets(display_index: int) -> list[tuple[bytes, int]]:
    """Return the full init sequence for one display.

    Each entry is ``(packet_bytes, post_delay_ms)``. Write them in order to
    ``EP_DISPLAY_OUT``, sleeping the stated milliseconds after each. Direct
    transcription of cabl ``MaschineMK1::initDisplay``.
    """
    d = _d(display_index)

    def p(*tail: int) -> bytes:
        return bytes((d, *tail))

    return [
        (p(0x00, 0x01, 0x30), 0),
        (p(0x00, 0x04, 0xCA, 0x04, 0x0F, 0x00), 20),
        (p(0x00, 0x02, 0xBB, 0x00), 0),
        (p(0x00, 0x01, 0xD1), 0),
        (p(0x00, 0x01, 0x94), 0),
        (p(0x00, 0x03, 0x81, 0x1E, 0x02), 20),
        (p(0x00, 0x02, 0x20, 0x08), 20),
        (p(0x00, 0x02, 0x20, 0x0B), 20),
        (p(0x00, 0x01, 0xA6), 0),
        (p(0x00, 0x01, 0x31), 0),
        (p(0x00, 0x04, 0x32, 0x00, 0x00, 0x05), 0),
        (p(0x00, 0x01, 0x34), 0),
        (p(0x00, 0x01, 0x30), 0),
        (p(0x00, 0x04, 0xBC, 0x00, 0x01, 0x02), 0),
        (p(0x00, 0x03, 0x75, 0x00, 0x3F), 0),
        (p(0x00, 0x03, 0x15, 0x00, 0x54), 0),
        (p(0x00, 0x01, 0x5C), 0),
        (p(0x00, 0x01, 0x25), 20),
        (p(0x00, 0x01, 0xAF), 20),
        (p(0x00, 0x04, 0xBC, 0x02, 0x01, 0x01), 0),
        (p(0x00, 0x01, 0xA6), 0),
        (p(0x00, 0x03, 0x81, 0x25, 0x02), 0),
    ]


def build_display_frame_packets(display_index: int, framebuffer: bytes) -> list[bytes]:
    """Return the full sequence of bulk OUT packets for one display frame.

    ``framebuffer`` must be exactly ``DISPLAY_FRAMEBUFFER_SIZE`` bytes in the
    5-bits-per-pixel 3-pixels-per-2-bytes row-major layout produced by
    :class:`FrameBuffer`. Direct transcription of cabl ``MaschineMK1::sendFrame``.

    Chunk layout (total = 22 data packets + 2 column-setup packets):

        [d, 0x00, 0x03, 0x75, 0x00, 0x3F]             column setup
        [d, 0x00, 0x03, 0x15, 0x00, 0x54]             column setup
        [d,   0x01, 0xF7, 0x5C] + bytes[0:502]        first chunk (d unchanged)
        [d+1, 0x01, 0xF6]       + bytes[502:1004]     middle chunks (d++)
        ... repeated until last full chunk ...
        [d+1, 0x01, 0x52]       + bytes[tail:tail+338]  final chunk (338 bytes)
    """
    if len(framebuffer) != DISPLAY_FRAMEBUFFER_SIZE:
        raise ValueError(
            f"framebuffer must be {DISPLAY_FRAMEBUFFER_SIZE} bytes, got {len(framebuffer)}"
        )
    d = _d(display_index)

    packets: list[bytes] = [
        bytes((d, 0x00, 0x03, 0x75, 0x00, 0x3F)),
        bytes((d, 0x00, 0x03, 0x15, 0x00, 0x54)),
    ]

    # cabl layout: 22 data chunks total = 1 first (502 B) + 20 middle (502 B
    # each) + 1 tail (338 B). 502 + 20*502 + 338 = 10880 ✓.
    # First chunk uses d (0 or 2). Middle + tail use d+1 (1 or 3).
    offset = 0
    packets.append(
        bytes((d, 0x01, 0xF7, 0x5C)) + framebuffer[offset:offset + _FRAME_CHUNK_FULL]
    )
    offset += _FRAME_CHUNK_FULL

    d_rest = d + 1
    for _ in range(_FRAME_MIDDLE_CHUNKS):
        packets.append(
            bytes((d_rest, 0x01, 0xF6)) + framebuffer[offset:offset + _FRAME_CHUNK_FULL]
        )
        offset += _FRAME_CHUNK_FULL

    packets.append(
        bytes((d_rest, 0x01, 0x52)) + framebuffer[offset:offset + _FRAME_CHUNK_TAIL]
    )
    return packets


class FrameBuffer:
    """255x64 5-bit grayscale buffer in the MK1 wire layout.

    Pixel packing (3 pixels in 2 bytes) replicates cabl ``GDisplayMaschineMK1::setPixel``:

    - byte_index = row * 170 + (x // 3) * 2
    - brightness p ∈ 0..31 (higher = darker on MK1 — the panel is inverted,
      so we write ``~p`` into the byte; black (p=0) means "all bits set").
    - x % 3 == 0: data[byteIndex]     |= 0xF8; then &= ~(p << 3)
    - x % 3 == 1: data[byteIndex]     |= 0x07; data[byteIndex+1] |= 0xC0;
                  data[byteIndex]     &= ~(p >> 2)
                  data[byteIndex+1]   &= ~(p << 6)
    - x % 3 == 2: data[byteIndex+1]   |= 0x1F; data[byteIndex+1] &= ~p
    """

    __slots__ = ("_data",)

    def __init__(self) -> None:
        # cabl ground state is 0xFF (all pixels black on the panel, which is
        # inverted: bits high = panel dots off = screen appears dark). The
        # setPixel routine OR's the mask bits on, then AND's the brightness
        # bits off — so the ground state MUST have the mask bits set or
        # pixels land as random high-bit residue.
        self._data = bytearray(b"\xff" * DISPLAY_FRAMEBUFFER_SIZE)

    def clear(self, brightness: int = 0) -> None:
        """Fill the canvas with a uniform brightness (0..31).

        brightness=0 → black (panel appears dark), brightness=31 → white.
        """
        b = max(0, min(DISPLAY_PIXEL_MAX, int(brightness)))
        if b == 0:
            self.fill_black()
            return
        if b == DISPLAY_PIXEL_MAX:
            self.fill_white()
            return
        # Slow path — set every pixel.
        self.fill_black()
        for y in range(DISPLAY_HEIGHT):
            for x in range(DISPLAY_WIDTH):
                self.set_pixel(x, y, b)

    def fill_black(self) -> None:
        """Fill the buffer with 0xFF — cabl's 'black' state (panel dark)."""
        self._data[:] = b"\xff" * DISPLAY_FRAMEBUFFER_SIZE

    def fill_white(self) -> None:
        """Fill the buffer with 0x00 — cabl's 'white' state (panel bright)."""
        self._data[:] = bytes(DISPLAY_FRAMEBUFFER_SIZE)

    def set_pixel(self, x: int, y: int, brightness: int) -> None:
        if not (0 <= x < DISPLAY_WIDTH and 0 <= y < DISPLAY_HEIGHT):
            return
        p = max(0, min(DISPLAY_PIXEL_MAX, int(brightness))) & 0x1F
        byte_index = DISPLAY_BYTES_PER_ROW * y + (x // 3) * 2
        data = self._data
        phase = x % 3
        if phase == 0:
            data[byte_index] |= 0xF8
            data[byte_index] &= 0xFF ^ ((p << 3) & 0xFF)
        elif phase == 1:
            data[byte_index] |= 0x07
            data[byte_index + 1] |= 0xC0
            data[byte_index] &= 0xFF ^ ((p >> 2) & 0xFF)
            data[byte_index + 1] &= 0xFF ^ ((p << 6) & 0xFF)
        else:
            data[byte_index + 1] |= 0x1F
            data[byte_index + 1] &= 0xFF ^ (p & 0xFF)

    def get_pixel(self, x: int, y: int) -> int:
        if not (0 <= x < DISPLAY_WIDTH and 0 <= y < DISPLAY_HEIGHT):
            return 0
        byte_index = DISPLAY_BYTES_PER_ROW * y + (x // 3) * 2
        phase = x % 3
        d0 = self._data[byte_index]
        d1 = self._data[byte_index + 1]
        if phase == 0:
            # bits 3..7 hold ~p
            return (~d0 >> 3) & 0x1F
        if phase == 1:
            hi = (~d0) & 0x07  # top 3 bits of p
            lo = ((~d1) >> 6) & 0x03  # bottom 2 bits of p
            return ((hi << 2) | lo) & 0x1F
        return (~d1) & 0x1F

    def buffer(self) -> bytes:
        return bytes(self._data)

    def __bytes__(self) -> bytes:
        return bytes(self._data)


# ---------------------------------------------------------------------------
# Input decoding — pads
# ---------------------------------------------------------------------------

PAD_PRESSURE_MAX = 0x0FFF   # 12 bit
PAD_THRESHOLD = 200         # cabl kMASMK1_padThreshold
PAD_DATA_SIZE = 64          # cabl kMASMK1_padDataSize
PAD_COUNT = 16              # cabl kMASMK1_nPads


@dataclass(frozen=True)
class PadEvent:
    pad: int            # 0..15, raw hardware index
    pressure: int       # 0..4095, 12-bit
    pressed: bool       # threshold-crossed


def decode_pad_report(
    raw: bytes,
    prev_pressed: list[bool] | None = None,
) -> list[PadEvent]:
    """Decode one bulk-in report from ``EP_PADS_IN``.

    Follows cabl ``processPads``: iterate byte pairs ``(i, i+1)`` for
    ``i in [1, 63)``; each pair encodes ``pad=(h>>4)`` and
    ``pressure=((h & 0xF) << 8) | l``. Emits an event on every pair that
    either crosses the threshold or releases a previously-held pad.

    ``prev_pressed`` is a 16-entry list updated in place if supplied — used to
    emit note-off when pressure drops below threshold.
    """
    events: list[PadEvent] = []
    if len(raw) < PAD_DATA_SIZE - 1:
        return events
    tracked = prev_pressed if prev_pressed is not None else [False] * PAD_COUNT

    # Loop matches cabl: for (i=1; i<padDataSize-1; i+=2)
    for i in range(1, PAD_DATA_SIZE - 1, 2):
        h = raw[i]
        l = raw[i + 1]
        pad = (h & 0xF0) >> 4
        pressure = ((h & 0x0F) << 8) | l
        if pressure > PAD_THRESHOLD:
            if not tracked[pad]:
                tracked[pad] = True
            events.append(PadEvent(pad=pad, pressure=pressure, pressed=True))
        elif tracked[pad]:
            tracked[pad] = False
            events.append(PadEvent(pad=pad, pressure=0, pressed=False))
    return events


# ---------------------------------------------------------------------------
# Input decoding — buttons + encoders
# ---------------------------------------------------------------------------

BUTTONS_DATA_SIZE = 7       # cabl kMASMK1_buttonsDataSize
N_BUTTONS = 42              # cabl kMASMK1_nButtons
N_ENCODERS = 11             # cabl kMASMK1_nEncoders

REPORT_TAG_ENCODERS = 0x02
REPORT_TAG_BUTTONS = 0x04
REPORT_TAG_MIDI = 0x06


class Button(IntEnum):
    """Button indices into the 7-byte bitmap (transfer byte 1 + (idx>>3))."""

    Mute = 0
    Solo = 1
    Select = 2
    Duplicate = 3
    Navigate = 4
    Keyboard = 5
    Pattern = 6
    Scene = 7
    Rec = 9
    Erase = 10
    Shift = 11
    Grid = 12
    TransportRight = 13
    TransportLeft = 14
    Loop = 15
    GroupE = 16
    GroupF = 17
    GroupG = 18
    GroupH = 19
    GroupD = 20
    GroupC = 21
    GroupB = 22
    GroupA = 23
    Control = 24
    Browse = 25
    BrowseLeft = 26
    Snap = 27
    AutoWrite = 28
    BrowseRight = 29
    Sampling = 30
    Step = 31
    DisplayButton8 = 32
    DisplayButton7 = 33
    DisplayButton6 = 34
    DisplayButton5 = 35
    DisplayButton4 = 36
    DisplayButton3 = 37
    DisplayButton2 = 38
    DisplayButton1 = 39
    NoteRepeat = 40
    Play = 41


# Wire index → logical encoder index (cabl processEncoders M_ENCODER_CASE map)
ENCODER_WIRE_TO_LOGICAL: tuple[int, ...] = (8, 4, 10, 7, 3, 9, 6, 2, 0, 5, 1)


@dataclass(frozen=True)
class ButtonChange:
    button: int
    pressed: bool


@dataclass(frozen=True)
class EncoderDelta:
    encoder: int     # logical index 0..10
    direction: int   # +1 or -1


def decode_button_report(
    raw: bytes,
    prev_button_state: list[bool],
) -> list[ButtonChange]:
    """Decode one 0x04-tagged report from ``EP_BUTTONS_IN``.

    Replicates cabl ``processButtons``:
      - Requires ``raw[6] & 0x40`` set (gate bit); otherwise returns [].
      - Button ``b`` is pressed iff ``raw[1 + (b >> 3)] & (1 << (b % 8))``.
      - Skips ``Button.Shift`` and any index > ``Button.Play`` (which is 41).
      - ``prev_button_state`` is a 42-entry list; updated in place.
    """
    if len(raw) < BUTTONS_DATA_SIZE:
        return []
    if (raw[6] & 0x40) == 0:
        return []
    changes: list[ButtonChange] = []
    for byte_idx in range(BUTTONS_DATA_SIZE):
        for bit in range(8):
            b = (byte_idx * 8) + bit
            if b >= N_BUTTONS or b == int(Button.Shift):
                continue
            # transfer byte 1 + (b>>3) in cabl, i.e. skip the tag byte at index 0
            data_byte = raw[1 + (b >> 3)] if (1 + (b >> 3)) < len(raw) else 0
            pressed = bool(data_byte & (1 << (b & 7)))
            if pressed != prev_button_state[b]:
                prev_button_state[b] = pressed
                changes.append(ButtonChange(button=b, pressed=pressed))
    return changes


def is_shift_held(raw: bytes) -> bool:
    """Check Shift state directly from a 0x04 report."""
    if len(raw) < BUTTONS_DATA_SIZE:
        return False
    b = int(Button.Shift)
    return bool(raw[1 + (b >> 3)] & (1 << (b & 7)))


def decode_encoder_report(
    raw: bytes,
    prev_encoder_values: list[int],
    initialized: bool,
) -> tuple[list[EncoderDelta], bool]:
    """Decode one 0x02-tagged report from ``EP_BUTTONS_IN``.

    Mirrors cabl ``processEncoders``:
      - 11 encoders at offsets ``(1 + 2*i, 2 + 2*i)`` holding a 16-bit value
        stored big-endian in cabl (``x = byte[1+2i]`` is the high byte).
      - Direction is inferred from nibble quadrants of (x, y) vs (prevX, prevY).
      - First observation initializes state without emitting events.
      - Wire index → logical index is re-mapped via ``ENCODER_WIRE_TO_LOGICAL``.
      - Returns (deltas, new_initialized_flag).
    """
    deltas: list[EncoderDelta] = []
    if len(raw) < 1 + 2 * N_ENCODERS:
        return deltas, initialized
    for i in range(N_ENCODERS):
        x = raw[1 + 2 * i]
        y = raw[2 + 2 * i]
        current = (x << 8) | y
        prev = prev_encoder_values[i]
        if current == prev:
            continue
        prev_x = (prev >> 8) & 0xFF
        prev_y = prev & 0xFF
        if x > 127:
            value_increased = (
                (x < prev_x and y >= prev_y)
                if y > 127
                else (x >= prev_x and y >= prev_y)
            )
        else:
            value_increased = (
                (x < prev_x and y < prev_y)
                if y > 127
                else (x >= prev_x and y < prev_y)
            )
        prev_encoder_values[i] = current
        if initialized:
            logical = ENCODER_WIRE_TO_LOGICAL[i]
            deltas.append(EncoderDelta(encoder=logical, direction=1 if value_increased else -1))
    return deltas, True
